// Claude Studio's own looks, placed like Roblox's effects (children of Lighting or the camera, when
// Enabled; datamodel.js ToonEffect, OutlineEffect, PixelEffect). They give a place a style; the
// fidelity tier (runtime/quality.js) never turns them off.
// - ToonEffect: cel shading. A material plugin on every PBR material puts all the light a surface
//   receives (sun, local lights, sky) into Bands flat steps, relative to full daylight (brighter
//   than that is left as it is), Softness blurring each step; specular highlights stay (OURS).
// - OutlineEffect: ink lines from the camera's depth (shared, runtime/depth.js). A jump in
//   distance draws a silhouette line; a bend draws a crease line, found as the second difference of
//   inverse depth, which is zero across any flat surface on screen (planes never draw lines).
//   DepthSensitivity and NormalSensitivity set the thresholds (OURS: the mapping), Thickness the
//   pixel offset, Color and Transparency the ink.
// - PixelEffect: the screen in PixelSize blocks (each the colour at its centre), with Colors levels
//   per channel and, if Dither, a 4 x 4 ordered dither. Last in the chain, so it pixelates everything.
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { RegisterClass } from '@babylonjs/core/Misc/typeStore.js';
import { useDepth, releaseDepth } from './depth.js';
import { keepLast } from './postorder.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// ---- ToonEffect: a plugin on PBR materials.
const toon = { on: false, bands: 3, softness: 0.05, full: 1 }; // shared by every material's plugin
class ToonPlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'StudioToon', 300, { STUDIO_TOON: false });
    this._enable(true);
  }
  getClassName() { return 'StudioToonPlugin'; }
  prepareDefines(defines) { defines.STUDIO_TOON = toon.on; }
  getUniforms() {
    return { ubo: [{ name: 'toonParams', size: 4, type: 'vec4' }], fragment: '#ifdef STUDIO_TOON\nuniform vec4 toonParams;\n#endif\n' };
  }
  bindForSubMesh(ubo) { if (toon.on) ubo.updateFloat4('toonParams', toon.bands, toon.softness, toon.full, 0); }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#if defined(STUDIO_TOON) && !defined(UNLIT)
  {
    // All the light reaching the surface (the sun's and local lights', and the sky's), as a share
    // of full daylight, into bands; rounded to each band's middle so the scene keeps its brightness.
    vec3 tw = vec3(0.2126, 0.7152, 0.0722);
    float ta = max(dot(surfaceAlbedo.rgb, tw), 1e-4);
    vec3 tlit = finalDiffuse;
#ifdef REFLECTION
    tlit += finalIrradiance;
#endif
    float tx = dot(tlit, tw) / ta / max(toonParams.z, 1e-4);
    if (tx < 1.0) {
      float tb = tx * toonParams.x, ts = max(toonParams.y, 1e-3);
      float tq = (floor(tb) + 0.5 + smoothstep(1.0 - ts, 1.0, fract(tb))) / toonParams.x;
      float tk = min(tq, 1.0) / max(tx, 1e-4);
      finalDiffuse *= tk;
#ifdef REFLECTION
      finalIrradiance *= tk;
#endif
    }
  }
#endif
`,
    };
  }
}

// A cloned material (glTF MeshParts clone theirs per part) re-creates its plugins by class name:
// registered, or the clone throws and the mesh never loads.
RegisterClass('BABYLON.StudioToonPlugin', ToonPlugin);

// ---- OutlineEffect and PixelEffect: screen passes.
Effect.ShadersStore.studioOutlineFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 texel;
uniform vec2 depthValues;
uniform vec4 ink;
uniform vec2 thresholds;
uniform float pixelAngle; // radians per sample step: a bend is measured per angle, not per pixel
float inv(vec2 uv) {
  float m = texture2D(depthSampler, uv).r;
  if (m >= 0.999) return 0.0;
  return 1.0 / max(m * depthValues.y - depthValues.x, 1e-3);
}
void main(void) {
  vec4 c = texture2D(textureSampler, vUV);
  float i0 = inv(vUV);
  float il = inv(vUV - vec2(texel.x, 0.0)), ir = inv(vUV + vec2(texel.x, 0.0));
  float id = inv(vUV - vec2(0.0, texel.y)), iu = inv(vUV + vec2(0.0, texel.y));
  float big = max(max(i0, il), max(max(ir, id), iu));
  float jump = max(max(abs(il - i0), abs(ir - i0)), max(abs(id - i0), abs(iu - i0))) / max(big, 1e-6);
  float bend = (abs(il + ir - 2.0 * i0) + abs(id + iu - 2.0 * i0)) / max(big, 1e-6) / max(pixelAngle, 1e-6);
  float edge = max(step(thresholds.x, jump), step(thresholds.y, bend));
  gl_FragColor = vec4(mix(c.rgb, ink.rgb, edge * ink.a), c.a);
}`;
Effect.ShadersStore.studioPixelFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
uniform vec3 pixel; // size, levels (0: all), dither (0 or 1)
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float m[16];
  m[0] = 0.0; m[1] = 8.0; m[2] = 2.0; m[3] = 10.0; m[4] = 12.0; m[5] = 4.0; m[6] = 14.0; m[7] = 6.0;
  m[8] = 3.0; m[9] = 11.0; m[10] = 1.0; m[11] = 9.0; m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
  int i = int(q.y * 4.0 + q.x);
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.46875;
  return 0.0;
}
void main(void) {
  vec2 block = floor(vUV * screen / pixel.x);
  vec2 centre = (block * pixel.x + pixel.x * 0.5) / screen;
  vec4 c = texture2D(textureSampler, clamp(centre, vec2(0.0), vec2(1.0)));
  if (pixel.y > 1.5) {
    float l = pixel.y - 1.0, d = pixel.z > 0.5 ? bayer(block) : 0.0;
    c.rgb = clamp(floor(c.rgb * l + 0.5 + d) / l, 0.0, 1.0);
  }
  gl_FragColor = c;
}`;

export class Styles {
  constructor(scene, dm, camera, { sun = null } = {}) {
    Object.assign(this, { scene, dm, camera, sun });
    // Every PBR material gets the plugin once (a clone already has it: see RegisterClass above).
    const attach = m => { if (m instanceof PBRMaterial && !(m.pluginManager && m.pluginManager.getPlugin('StudioToon'))) new ToonPlugin(m); };
    scene.materials.forEach(attach);
    scene.onNewMaterialAddedObservable.add(attach);
    this.passes = {};
  }

  // The enabled effects of a class: Lighting's and the camera's direct children (as Roblox's effects).
  effect(cls) {
    const L = this.dm.service('Lighting'), cam = this.dm.workspace.props.CurrentCamera;
    for (const holder of [L, cam]) if (holder && holder.children) for (const c of holder.children) if (c.ClassName === cls && c.props.Enabled) return c;
    return null;
  }

  update() {
    // Toon: every PBR material's plugin follows one switch (turning it on or off recompiles them, once).
    const t = this.effect('ToonEffect');
    const on = !!t;
    if (t) { toon.bands = clamp(Math.round(t.props.Bands), 2, 8); toon.softness = clamp(t.props.Softness, 0, 0.5); }
    // Full daylight: the sun straight on, plus the sky (OURS: about 1.3 x the sun alone, from the lab).
    toon.full = this.sun ? Math.max(1e-3, this.sun.intensity * lum(this.sun.diffuse) * 1.3) : 1;
    if (on !== toon.on) { toon.on = on; for (const m of this.scene.materials) if (m.pluginManager && m.pluginManager.getPlugin('StudioToon')) m.markAsDirty(Material.AllDirtyFlag); } // re-reads the defines: a recompile, once
    this.toonOn = on;

    const o = this.effect('OutlineEffect'), p = this.effect('PixelEffect');
    this.outline = o; this.pixel = p;
    if (o && !this.passes.outline) this.makeOutline();
    // A pass going: out of the shared order first, then disposed (keepLast would otherwise put the
    // disposed pass back while the other owner reorders: a disposed pass is never ready).
    if (!o && this.passes.outline) { keepLast(this.camera, 'outline', 20, []); this.passes.outline.dispose(this.camera); this.passes.outline = null; releaseDepth(this.scene, this.camera, this); this.depth = null; }
    if (p && !this.passes.pixel) this.makePixel();
    if (!p && this.passes.pixel) { keepLast(this.camera, 'pixel', 40, []); this.passes.pixel.dispose(this.camera); this.passes.pixel = null; }
    keepLast(this.camera, 'outline', 20, this.passes.outline ? [this.passes.outline] : []);
    keepLast(this.camera, 'pixel', 40, this.passes.pixel ? [this.passes.pixel] : []);
    this.key = [on && 'toon', o && 'outline', p && 'pixel'].filter(Boolean).join(','); // read by tests
  }

  makeOutline() {
    this.depth = useDepth(this.scene, this.camera, this);
    const pp = this.passes.outline = new PostProcess('studioOutline', 'studioOutline', ['texel', 'depthValues', 'ink', 'thresholds', 'pixelAngle'], ['depthSampler'], 1, this.camera);
    pp.onApply = e => {
      const P = this.outline.props, eng = this.scene.getEngine(), th = clamp(Math.round(P.Thickness), 1, 4), cam = this.camera;
      e.setTexture('depthSampler', this.depth.getDepthMap());
      e.setFloat2('texel', th / eng.getRenderWidth(), th / eng.getRenderHeight());
      e.setFloat2('depthValues', cam.minZ, cam.minZ + cam.maxZ);
      e.setFloat4('ink', P.Color.r, P.Color.g, P.Color.b, 1 - clamp(P.Transparency, 0, 1));
      // Sensitivity 0..1 to thresholds (OURS): silhouettes from a 50% to a 2% jump in inverse depth;
      // creases from a change of 6 to 0.3 in the surfaces' slope away from the view (a box's edge
      // seen at a slant is about 3; a ball's curve, per pixel, far less; a plane exactly 0).
      const ds = clamp(P.DepthSensitivity, 0, 1), ns = clamp(P.NormalSensitivity, 0, 1);
      e.setFloat2('thresholds', 0.5 * Math.pow(0.04, ds), ns > 0 ? 6 * Math.pow(0.05, ns) : 1e9);
      e.setFloat('pixelAngle', cam.fov / eng.getRenderHeight() * th);
    };
  }

  makePixel() {
    const pp = this.passes.pixel = new PostProcess('studioPixel', 'studioPixel', ['screen', 'pixel'], [], 1, this.camera);
    pp.onApply = e => {
      const P = this.pixel.props, eng = this.scene.getEngine();
      e.setFloat2('screen', eng.getRenderWidth(), eng.getRenderHeight());
      const levels = Math.round(P.Colors);
      e.setFloat3('pixel', clamp(Math.round(P.PixelSize), 1, 16), levels >= 2 ? clamp(levels, 2, 32) : 0, P.Dither ? 1 : 0);
    };
  }
}
