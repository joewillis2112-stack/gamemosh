// Draws Roblox's Highlight (datamodel.js): a fill over an object and an outline around its
// silhouette, from creator-docs classes/Highlight.yaml and the API dump:
// - it applies to its Adornee, or, without one, to its Parent: a part, or every part of a model
//   (a character too: its whole body);
// - FillColor / FillTransparency tint the object's interior; OutlineColor / OutlineTransparency
//   draw a line LineThickness pixels wide just outside its silhouette;
// - DepthMode AlwaysOnTop shows through whatever is in front; Occluded only where it's seen;
// - at most 255 at once (Roblox's limit; the rest are ignored), Enabled ones counting.
// How: one mask pass renders the highlighted meshes, each writing its highlight's number into red,
// unblended, after the rest of the scene has written depth only: Occluded ones depth-tested against
// it, AlwaysOnTop ones not (where two overlap, the nearer drawn last wins); then one screen pass fills inside the mask
// and draws the outline where a pixel is outside it but within the thickness of it. The colours are
// applied after the tonemap, so FillColor shows as given (OURS: Roblox's compositing order isn't
// documented). Highlights run in Play and in the editor.
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { isA } from '../datamodel.js';
import { keepLast } from './postorder.js';

export const MAX_HIGHLIGHTS = 255;
const MAX_THICKNESS = 8; // OURS: the outline search radius in pixels (LineThickness is clamped to it)

const MASK_VERTEX = `precision highp float;
attribute vec3 position;
#include<bonesDeclaration>
#include<instancesDeclaration>
uniform mat4 viewProjection;
void main() {
#include<instancesVertex>
#include<bonesVertex>
  gl_Position = viewProjection * finalWorld * vec4(position, 1.0);
}`;
const MASK_FRAGMENT = `precision highp float;
uniform vec4 id;
void main() { gl_FragColor = id; }`;

// paramSampler is 256 x 2: row 0 the fill (rgb, opacity), row 1 the outline, by highlight number.
// The screen pass, compiled per search radius (the largest LineThickness in use): a thin outline
// costs a 3 x 3 search, not the maximum's.
function highlightShader(r) {
  const name = 'studioHighlight' + r;
  if (!Effect.ShadersStore[name + 'FragmentShader']) Effect.ShadersStore[name + 'FragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D maskSampler;
uniform sampler2D paramSampler;
uniform vec2 texel;
uniform float thickness[256];
float idAt(vec2 uv) { return texture2D(maskSampler, uv).r; }
vec4 param(float id, float row) { return texture2D(paramSampler, vec2((id * 255.0 + 0.5) / 256.0, (row + 0.5) / 2.0)); }
void main(void) {
  vec4 c = texture2D(textureSampler, vUV);
  float id = idAt(vUV);
  if (id > 0.0) {
    vec4 f = param(id, 0.0);
    gl_FragColor = vec4(mix(c.rgb, f.rgb, f.a), c.a);
    return;
  }
  // Outside: the nearest highlighted pixel within ${r} px, if it's within its own thickness.
  float best = 1e9, bid = 0.0;
  for (int y = -${r}; y <= ${r}; y++) for (int x = -${r}; x <= ${r}; x++) {
    float d = max(abs(float(x)), abs(float(y)));
    if (d >= best) continue;
    float n = idAt(vUV + vec2(float(x), float(y)) * texel);
    if (n > 0.0 && d <= thickness[int(n * 255.0 + 0.5)]) { best = d; bid = n; }
  }
  if (bid > 0.0) { vec4 o = param(bid, 1.0); gl_FragColor = vec4(mix(c.rgb, o.rgb, o.a), c.a); }
  else gl_FragColor = c;
}`;
  return name;
}

export class Highlights {
  // localCharacter: () => { model, meshes } for the player's own body (drawn by runtime/character.js).
  constructor(scene, dm, world, { rigs = null, localCharacter = null } = {}) {
    Object.assign(this, { scene, dm, world, rigs, localCharacter });
    this.dirty = true;
    this.list = []; // [{ inst, meshes }]
    dm.watch((inst, key) => { if (!inst || inst.ClassName === 'Highlight' || key === 'Parent') this.dirty = true; });
    this.params = new Uint8Array(256 * 2 * 4);
    this.thick = new Float32Array(256);
  }

  // Enabled Highlights in the place, in tree order, up to Roblox's 255; each with the meshes it covers.
  collect() {
    const out = [];
    const walk = inst => { for (const c of inst.children) { if (c.ClassName === 'Highlight' && c.props.Enabled) out.push(c); walk(c); } };
    walk(this.dm.game);
    return out.slice(0, MAX_HIGHLIGHTS).map(inst => ({ inst, meshes: this.meshesOf(inst.props.Adornee || inst.parent) })).filter(h => h.meshes.length);
  }
  meshesOf(target) {
    if (!target || !this.inWorkspace(target)) return [];
    const out = [];
    const add = m => { if (m && m.getTotalVertices && m.getTotalVertices() > 0) out.push(m); };
    const part = inst => { const e = this.world && this.world.parts.get(inst); if (e && e.mesh) { add(e.mesh); e.mesh.getChildMeshes(false).forEach(add); } };
    const local = this.localCharacter && this.localCharacter();
    const visit = inst => {
      if (local && inst === local.model) { local.meshes.forEach(add); return; } // the player's own body
      const view = this.rigs && this.rigs.views && this.rigs.views.get(inst);
      if (view) { view.meshes.forEach(add); return; } // a character: its body
      if (isA(inst.ClassName, 'BasePart')) part(inst);
      for (const c of inst.children) visit(c);
    };
    // A body part of a character highlights the character (its limbs are one skinned mesh here).
    const model = target.isCharacter ? target.parent : null;
    visit(model && ((local && model === local.model) || (this.rigs && this.rigs.views && this.rigs.views.get(model))) ? model : target);
    return out;
  }
  inWorkspace(inst) { for (let a = inst; a; a = a.parent) if (a === this.dm.workspace) return true; return false; }

  ensure(cam) {
    if (this.mask && this.cam === cam) return;
    this.dispose();
    this.cam = cam;
    const scene = this.scene, eng = scene.getEngine();
    this.mask = new RenderTargetTexture('highlightMask', { width: eng.getRenderWidth(), height: eng.getRenderHeight() }, scene, false, true, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.mask.clearColor = new Color4(0, 0, 0, 0);
    this.mask.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE); // exact numbers: a blended edge would read as another highlight, or none
    this.mask.activeCamera = cam;
    this.mask.renderParticles = false; this.mask.renderSprites = false;
    scene.customRenderTargets.push(this.mask);
    const mat = (name, blend) => {
      const m = new ShaderMaterial(name, scene, { vertexSource: MASK_VERTEX, fragmentSource: MASK_FRAGMENT }, {
        attributes: ['position', 'matricesIndices', 'matricesWeights', 'matricesIndicesExtra', 'matricesWeightsExtra'],
        uniforms: ['world', 'viewProjection', 'id', 'mBones', 'boneTextureWidth'], samplers: ['boneSampler'], needAlphaBlending: blend,
      });
      m.backFaceCulling = false;
      return m;
    };
    this.occluder = mat('highlightOccluder', false); this.occluder.setVector4('id', { x: 0, y: 0, z: 0, w: 0 });
    this.occluder.disableColorWrite = true;
    this.mats = new Map(); this.mat = mat;
    this.paramTex = RawTexture.CreateRGBATexture(this.params, 256, 2, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    this.radius = 0;
  }
  // The screen pass for a search radius; made again when the largest thickness changes.
  pass(r) {
    if (this.post && this.radius === r) return;
    if (this.post) this.post.dispose(this.cam);
    this.radius = r;
    this.post = new PostProcess('highlight', highlightShader(r), ['texel', 'thickness'], ['maskSampler', 'paramSampler'], 1, this.cam);
    this.post.onApply = e => {
      e.setTexture('maskSampler', this.mask); e.setTexture('paramSampler', this.paramTex);
      e.setFloat2('texel', 1 / this.mask.getSize().width, 1 / this.mask.getSize().height);
      e.setFloatArray('thickness', this.thick);
    };
  }
  // The mask material for a highlight number and depth mode (shared per pair).
  material(k, top) {
    const key = k + (top ? 't' : 'o');
    if (!this.mats.has(key)) {
      const v = k / 255, m = this.mat('highlight' + key, true);
      m.setVector4('id', { x: v, y: 0, z: 0, w: 1 });
      m.alphaMode = Constants.ALPHA_DISABLE; // drawn with the transparent things (after every occluder), but written, not blended
      if (top) { m.depthFunction = Constants.ALWAYS; m.disableDepthWrite = true; }
      this.mats.set(key, m);
    }
    return this.mats.get(key);
  }

  update() {
    // Again on any change, and twice a second (a part's mesh can arrive after its Highlight).
    this.frame = (this.frame || 0) + 1;
    if (this.dirty || this.frame % 30 === 0) { this.dirty = false; this.list = this.collect(); }
    const cam = this.scene.activeCamera;
    if (!this.list.length || !cam) { this.dispose(); return; }
    this.ensure(cam);
    // Keep the mask the size of the screen.
    const eng = this.scene.getEngine(), w = eng.getRenderWidth(), h = eng.getRenderHeight(), s = this.mask.getSize();
    if (s.width !== w || s.height !== h) this.mask.resize({ width: w, height: h });
    // Parameters, and which meshes the mask draws with which material.
    this.params.fill(0); this.thick.fill(0);
    const mask = this.mask, chosen = new Set(), list = [];
    this.list.forEach(({ inst, meshes }, i) => {
      const k = i + 1, P = inst.props, F = P.FillColor, O = P.OutlineColor, top = (P.DepthMode && P.DepthMode.name || P.DepthMode) !== 'Occluded';
      const b = (row, c, t) => { const o = (row * 256 + k) * 4; this.params[o] = Math.round(c.r * 255); this.params[o + 1] = Math.round(c.g * 255); this.params[o + 2] = Math.round(c.b * 255); this.params[o + 3] = Math.round((1 - Math.min(1, Math.max(0, t))) * 255); };
      b(0, F, P.FillTransparency); b(1, O, P.OutlineTransparency);
      this.thick[k] = Math.min(MAX_THICKNESS, Math.max(0, Math.round(P.LineThickness)));
      for (const m of meshes) if (!chosen.has(m)) { chosen.add(m); mask.setMaterialForRendering(m, this.material(k, top)); list.push(m); }
    });
    this.paramTex.update(this.params);
    this.pass(Math.max(1, ...this.thick));
    // Everything else opaque writes depth only, so Occluded highlights hide behind it.
    const occluders = this.scene.meshes.filter(m => !chosen.has(m) && m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && m.material && !m.material.needAlphaBlending() && !(m.infiniteDistance));
    for (const m of occluders) mask.setMaterialForRendering(m, this.occluder);
    mask.renderList = occluders.concat(list); // occluders first: their depth is in before the highlights test it
    this.count = this.list.length;
    keepLast(cam, this, 30, [this.post]); // after Lighting's effects and outlines, before pixelation (runtime/postorder.js)
  }

  dispose() {
    if (!this.mask) return;
    const i = this.scene.customRenderTargets.indexOf(this.mask); if (i >= 0) this.scene.customRenderTargets.splice(i, 1);
    keepLast(this.cam, this, 30, []);
    if (this.post) this.post.dispose(this.cam); this.post = null; this.mask.dispose(); this.paramTex.dispose(); this.occluder.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mask = null; this.mats = null; this.count = 0;
  }
}
