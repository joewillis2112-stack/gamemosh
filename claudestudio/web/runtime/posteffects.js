// Lighting's post effects beyond bloom and exposure (runtime/lighting.js):
// DepthOfFieldEffect, SunRaysEffect, BlurEffect and ColorCorrectionEffect.
// Semantics from mashup-research/ROBLOX_LIGHTING_2026-10-09.md, section 5:
// - effects count as direct children of Lighting or the CurrentCamera, when Enabled;
// - ColorCorrection: every instance composes into one affine colour transform,
//   applied after the tonemap: Contrast about mid-grey (pivot ours), Saturation
//   lerps from grey (-1 = grey), TintColor multiplies, Brightness adds;
// - Blur: Gaussian, the largest Size wins (pixels; our kernel is 2 x Size);
// - SunRays: from this pixel toward the sun, the share of sky pixels on the way,
//   shaped by a Henyey-Greenstein phase (Spread -> g, ours), times Intensity;
//   Roblox adds it before the tonemap, we add after it;
// - DepthOfField: sharp within FocusDistance +- InFocusRadius studs, blurring
//   toward FarIntensity / NearIntensity over a ramp (ours: as long as the radius).
// Each pass exists only while its effect does, so a place without them renders
// exactly as before. SunRays and DepthOfField need a depth pass; on phones
// SunRays is skipped (Roblox gates it by quality level too).
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import { BlurPostProcess } from '@babylonjs/core/PostProcesses/blurPostProcess.js';
import { PassPostProcess } from '@babylonjs/core/PostProcesses/passPostProcess.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { Vector2, Vector3, Matrix } from '@babylonjs/core/Maths/math.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import '@babylonjs/core/Materials/standardMaterial.js'; // the depth renderer needs its side effect

const DOF_BLUR_KERNEL = 48;      // full-resolution px at 720 px tall, scaled with the render (Roblox sizes its DOF blur in screen units); ours
const RAYS_TAPS = 12;
const RAYS_DISPLAY_SCALE = '0.1'; // ours: Intensity 0.01 (a Baseplate's) adds ~3% at the sun, 0.25 a clear halo

Effect.ShadersStore.studioColorCorrectionFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform mat3 ccMatrix;
uniform vec3 ccOffset;
void main(void) {
  vec4 c = texture2D(textureSampler, vUV);
  gl_FragColor = vec4(clamp(ccMatrix * c.rgb + ccOffset, 0.0, 1.0), c.a);
}`;

Effect.ShadersStore.studioSunRaysFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 sunUV;        // the sun on screen (may be off it)
uniform vec3 sunColor;
uniform float intensity;
uniform float g;           // Henyey-Greenstein asymmetry
uniform vec2 aspectFov;    // x: width/height, y: vertical field of view (radians)
uniform float facing;      // 1 if the sun is in front of the camera
void main(void) {
  vec4 c = texture2D(textureSampler, vUV);
  // A fixed per-pixel offset along the march (interleaved gradient noise) instead of banding.
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 stp = (sunUV - vUV) / float(${RAYS_TAPS});
  float sky = 0.0;
  for (int i = 0; i < ${RAYS_TAPS}; i++) {
    vec2 uv = vUV + stp * (float(i) + j);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { sky += 1.0; continue; } // off screen: open sky (ours)
    sky += step(0.999, texture2D(depthSampler, uv).r);
  }
  sky /= float(${RAYS_TAPS});
  // Angle between this pixel's view ray and the sun, from screen distance.
  vec2 d = (vUV - sunUV) * vec2(aspectFov.x, 1.0);
  float cosT = cos(min(length(d) * aspectFov.y, 3.14159));
  float f = inversesqrt(clamp(1.0 + g * g - 2.0 * g * cosT, 0.01, 1.0));
  vec3 rays = sunColor * (sky * 2.0 * intensity * ${RAYS_DISPLAY_SCALE}) * ((1.0 - g * g) * f * f * f) * facing;
  // Roblox adds rays in HDR before the tonemap; after it, a screen blend of the
  // compressed rays keeps the result in range (ours).
  vec3 r = rays / (1.0 + rays);
  gl_FragColor = vec4(c.rgb + (1.0 - c.rgb) * r, c.a);
}`;

// Depth of field's blur. Each tap is weighted by its own blur amount (circle of
// confusion), so in-focus things don't bleed into the blurred background (a
// plain blur haloes them). Pass 1 (horizontal) writes the weighted average and
// its coverage in alpha; pass 2 (vertical) weights taps by that coverage.
const DOF_COC = `
uniform sampler2D depthSampler;
uniform vec2 depthToStuds;   // studs = metric * x - y
uniform vec4 dof;            // focus, radius, far intensity, near intensity
float coc(vec2 uv) {
  float studs = texture2D(depthSampler, uv).r * depthToStuds.x - depthToStuds.y;
  float ramp = max(dof.y, 1.0);
  float far = clamp((studs - (dof.x + dof.y)) / ramp, 0.0, 1.0) * dof.z;
  float near = clamp(((dof.x - dof.y) - studs) / ramp, 0.0, 1.0) * dof.w;
  return clamp(max(far, near), 0.0, 1.0);
}`;
Effect.ShadersStore.studioDofGatherFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 dir;            // the tap spacing along the blur direction (UV): radius / 12, about a texel
uniform float firstPass;
${DOF_COC}
void main(void) {
  vec3 acc = vec3(0.0); float wsum = 0.0, gsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float t = float(i) / 12.0;
    float gw = exp(-t * t * 2.0);
    vec2 uv = vUV + dir * float(i);
    vec4 s = texture2D(textureSampler, uv);
    float w = gw * (firstPass > 0.5 ? coc(uv) : s.a);
    acc += s.rgb * w; wsum += w; gsum += gw;
  }
  gl_FragColor = wsum > 1e-4 ? vec4(acc / wsum, wsum / gsum) : vec4(texture2D(textureSampler, vUV).rgb, 0.0);
}`;

Effect.ShadersStore.studioDofFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;   // blurred (weighted), coverage in alpha
uniform sampler2D sharpSampler;
${DOF_COC}
void main(void) {
  vec4 b = texture2D(textureSampler, vUV);
  float k = coc(vUV) * clamp(b.a * 4.0, 0.0, 1.0); // no blurred neighbours: stay sharp
  gl_FragColor = mix(texture2D(sharpSampler, vUV), vec4(b.rgb, 1.0), k);
}`;

// One ColorCorrectionEffect as an affine map (3x3 row-major + offset) in display space.
function ccAffine(p) {
  const k = 1 + p.Contrast, s = 1 + p.Saturation, t = p.TintColor;
  const L = [0.2126, 0.7152, 0.0722];
  // Saturation: c -> grey + s (c - grey), grey = L . c.
  const S = [0, 1, 2].map(r => [0, 1, 2].map(cc => (1 - s) * L[cc] + (r === cc ? s : 0)));
  // Contrast about 0.5: c -> k (c - 0.5) + 0.5. Then tint (multiply), then brightness (add).
  const tint = [t.r, t.g, t.b];
  const M = S.map((row, r) => row.map(v => v * k * tint[r]));
  const rowSum = r => S[r].reduce((a, b) => a + b, 0);
  const off = [0, 1, 2].map(r => tint[r] * (0.5 - 0.5 * k) * rowSum(r) + p.Brightness);
  return { M, off };
}
// b after a: b(a(c)).
function compose(a, b) {
  const M = [0, 1, 2].map(r => [0, 1, 2].map(c => b.M[r][0] * a.M[0][c] + b.M[r][1] * a.M[1][c] + b.M[r][2] * a.M[2][c]));
  const off = [0, 1, 2].map(r => b.M[r][0] * a.off[0] + b.M[r][1] * a.off[1] + b.M[r][2] * a.off[2] + b.off[r]);
  return { M, off };
}

export class PostEffects {
  constructor(scene, camera, dm, { quality = 'high', sun } = {}) {
    Object.assign(this, { scene, camera, dm, quality, sun });
    this.passes = {}; // name -> PostProcess(es)
    this.order = [];
  }

  // The enabled effects of a class, from Lighting's and the camera's direct children.
  effects(cls) {
    const out = [], L = this.dm.service('Lighting');
    const cam = this.dm.workspace.props.CurrentCamera;
    for (const holder of [L, cam]) if (holder && holder.children) for (const c of holder.children) if (c.ClassName === cls && c.props.Enabled) out.push(c);
    return out;
  }

  update() {
    const dof = this.effects('DepthOfFieldEffect')[0];
    const rays = this.quality === 'phone' ? null : this.effects('SunRaysEffect').reduce((a, e) => (!a || e.props.Intensity > a.props.Intensity ? e : a), null);
    const blurs = this.effects('BlurEffect'), blur = blurs.reduce((a, e) => (!a || e.props.Size > a.props.Size ? e : a), null);
    const ccs = this.effects('ColorCorrectionEffect');
    // Which passes, in order: depth of field, sun rays, blur, colour correction.
    const want = [];
    if (dof) want.push('dof');
    if (rays && rays.props.Intensity > 0) want.push('rays');
    if (blur && blur.props.Size > 0) want.push('blur');
    const cc = ccs.reduce((acc, e) => compose(acc, ccAffine(e.props)), { M: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], off: [0, 0, 0] });
    const identity = cc.M.every((row, r) => row.every((v, c) => Math.abs(v - (r === c ? 1 : 0)) < 1e-6)) && cc.off.every(v => Math.abs(v) < 1e-6);
    if (!identity) want.push('cc');
    this.key = want.join(','); // which passes (read by tests)
    const build = this.key + (blur ? '|' + blur.props.Size : '') + '|' + this.scene.getEngine().getRenderHeight();
    this.state = { dof, rays, blur, cc };
    if (build !== this.built) { this.built = build; this.rebuild(want, { blur }); }
    this.ensureLast();
  }

  // Ours come after Babylon's pipeline (bloom, tonemap). The pipeline re-attaches
  // its passes when it rebuilds (bloom toggled, SSAO added), which would put them
  // after ours: move ours back to the end.
  ensureLast() {
    const list = (this.camera._postProcesses || []).filter(Boolean), n = this.order.length;
    if (!n || this.order.every((pp, i) => list[list.length - n + i] === pp)) return;
    for (const pp of this.order) this.camera.detachPostProcess(pp);
    for (const pp of this.order) this.camera.attachPostProcess(pp);
  }

  depth() {
    if (!this.depthRenderer) this.depthRenderer = this.scene.enableDepthRenderer(this.camera, false);
    return this.depthRenderer;
  }

  rebuild(want, { blur }) {
    for (const pp of this.order) pp.dispose(this.camera);
    this.order = [];
    if (!want.some(w => w === 'dof' || w === 'rays') && this.depthRenderer) { this.scene.disableDepthRenderer(this.camera); this.depthRenderer = null; }
    const cam = this.camera, engine = this.scene.getEngine(), add = pp => { this.order.push(pp); return pp; };
    for (const w of want) {
      if (w === 'dof') {
        const depth = this.depth().getDepthMap();
        const sharp = add(new PassPostProcess('dofSharp', 1, cam, undefined, engine));
        // Half resolution: the radius in half-resolution texels.
        const radius = Math.max(2, DOF_BLUR_KERNEL * engine.getRenderHeight() / 720 / 4);
        const dofUniforms = e => {
          const st = this.state.dof.props;
          e.setTexture('depthSampler', depth);
          e.setFloat2('depthToStuds', cam.minZ + cam.maxZ, cam.minZ);
          e.setFloat4('dof', st.FocusDistance, st.InFocusRadius, st.FarIntensity, st.NearIntensity);
        };
        for (const [name, d, first] of [['dofGatherH', [1, 0], 1], ['dofGatherV', [0, 1], 0]]) {
          const pp = add(new PostProcess(name, 'studioDofGather', ['dir', 'firstPass', 'depthToStuds', 'dof'], ['depthSampler'], 0.5, cam));
          pp.onApply = e => { dofUniforms(e); e.setFloat2('dir', d[0] * radius / 12 / pp.width, d[1] * radius / 12 / pp.height); e.setFloat('firstPass', first); };
        }
        const comp = add(new PostProcess('dof', 'studioDof', ['depthToStuds', 'dof'], ['sharpSampler', 'depthSampler'], 1, cam));
        comp.onApply = e => { dofUniforms(e); e.setTextureFromPostProcess('sharpSampler', sharp); };
      } else if (w === 'rays') {
        const depth = this.depth().getDepthMap();
        const pp = add(new PostProcess('sunRays', 'studioSunRays', ['sunUV', 'sunColor', 'intensity', 'g', 'aspectFov', 'facing'], ['depthSampler'], 1, cam));
        pp.onApply = e => {
          const r = this.state.rays.props, w = engine.getRenderWidth(), h = engine.getRenderHeight();
          const toSun = this.sun ? this.sun.direction.scale(-1) : new Vector3(0, 1, 0);
          const far = cam.globalPosition.add(toSun.scale(1000));
          const p = Vector3.Project(far, Matrix.Identity(), this.scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
          const facing = Vector3.Dot(cam.getForwardRay().direction, toSun) > 0 ? 1 : 0;
          e.setTexture('depthSampler', depth);
          e.setFloat2('sunUV', p.x / w, 1 - p.y / h);
          const sc = this.sun ? this.sun.diffuse : { r: 1, g: 1, b: 1 };
          e.setFloat3('sunColor', sc.r, sc.g, sc.b);
          e.setFloat('intensity', r.Intensity);
          e.setFloat('g', 0.98 - 0.6 * Math.min(1, Math.max(0, r.Spread)));
          e.setFloat2('aspectFov', w / h, cam.fov);
          e.setFloat('facing', facing);
        };
      } else if (w === 'blur') {
        const k = Math.max(1, blur.props.Size * 2) * (engine.getHardwareScalingLevel ? 1 / engine.getHardwareScalingLevel() : 1);
        add(new BlurPostProcess('blurH', new Vector2(1, 0), k, 1, cam));
        add(new BlurPostProcess('blurV', new Vector2(0, 1), k, 1, cam));
      } else if (w === 'cc') {
        const pp = add(new PostProcess('colorCorrection', 'studioColorCorrection', ['ccMatrix', 'ccOffset'], null, 1, cam));
        pp.onApply = e => {
          const { M, off } = this.state.cc;
          // GLSL mat3 is column-major.
          e.setMatrix3x3('ccMatrix', new Float32Array([M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]]));
          e.setFloat3('ccOffset', off[0], off[1], off[2]);
        };
      }
    }
  }
}
