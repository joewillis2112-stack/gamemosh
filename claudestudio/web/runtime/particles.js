// Draws ParticleEmitter (datamodel.js) the way Roblox does, from
// mashup-research/ROBLOX_PARTICLES_2026-11-13.md. Each emitter is one mesh of
// camera-facing quads rebuilt every frame on the CPU, drawn with one shader:
// - an emitter under a BasePart in the Workspace emits from the part's Shape
//   (Box, Sphere, Cylinder, Disc; Volume or Surface; ShapePartial; ShapeInOut),
//   along EmissionDirection with SpreadAngle, at Speed, Rate per second while
//   Enabled; Emit(n) bursts, Clear() empties, FastForward(n) runs n frames;
// - each particle lives Lifetime seconds, accelerates by Acceleration, loses
//   half its speed every Drag seconds, spins at RotSpeed from Rotation, and over
//   its life follows Size, Squash, Transparency (with envelopes) and Color;
// - Orientation: FacingCamera, FacingCameraWorldUp, VelocityParallel,
//   VelocityPerpendicular; LockedToPart carries live particles with the part;
//   ZOffset moves them toward the camera without changing their screen size;
// - LightEmission blends from normal (0) to additive (1) (premultiplied alpha);
//   Brightness scales the colour (HDR, so it blooms); LightInfluence mixes in
//   the scene's light level; flipbooks with blended frames; fog.
// OURS where neither Roblox source says: the shape axes (the cylinder and the
// disc lie across EmissionDirection, the sphere's pole is EmissionDirection),
// the radial direction of Sphere and Cylinder emission, Squash's curve
// (area-keeping: 1 = twice as tall and half as wide), a SpreadAngle of X as
// ±X degrees, envelopes drawn once per particle per keypoint, the light level,
// and the cap of MAX_PER_EMITTER live particles.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { isA } from '../datamodel.js';

export const MAX_PER_EMITTER = 5000;
const FRAME = 1 / 60; // FastForward's frame
const DEFAULT_TEXTURE = 'rbxasset://textures/particles/sparkles_main.dds';
// NormalId -> [axis, sign] in the part's own axes (right, up, back).
const FACE = { Right: [0, 1], Left: [0, -1], Top: [1, 1], Bottom: [1, -1], Back: [2, 1], Front: [2, -1] };
const GRID = { None: 1, Grid2x2: 2, Grid4x4: 4, Grid8x8: 8 };
const en = v => (v && v.name) || v;
const lin = c => Math.pow(Math.max(0, c), 2.2);

// A small seeded generator, so tests see the same particles every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (a, b) => { let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 13; h = Math.imul(h, 0x27D4EB2F); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// A NumberSequence at time t, with this particle's own keypoint values.
function seqAt(k, vals, t) {
  if (t <= k[0][0]) return vals[0];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) { const t0 = k[i - 1][0], t1 = k[i][0], f = t1 > t0 ? (t - t0) / (t1 - t0) : 1; return vals[i - 1] + (vals[i] - vals[i - 1]) * f; }
  }
  return vals[vals.length - 1];
}
function colorAt(k, t, out) {
  let i = 1; while (i < k.length - 1 && t > k[i][0]) i++;
  const t0 = k[i - 1][0], t1 = k[i][0], f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  const a = k[i - 1][1], b = k[i][1];
  out[0] = a.r + (b.r - a.r) * f; out[1] = a.g + (b.g - a.g) * f; out[2] = a.b + (b.b - a.b) * f;
  return out;
}
const draw = (k, r) => k.map(([, v, e]) => e > 0 ? v + (r() * 2 - 1) * e : v);

// Roblox's built-in particle textures, drawn as our own originals (we don't have Roblox's images):
// the default four-point sparkle (its path from the API dump), a soft smoke puff and a flame (paths
// as Roblox's content folder is commonly cited; not checked against a client).
const BUILTIN = {
  'rbxasset://textures/particles/sparkles_main.dds': g => {
    const N = 128, h = N / 2, glow = g.createRadialGradient(h, h, 0, h, h, h);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.18, 'rgba(255,255,255,0.75)'); glow.addColorStop(0.5, 'rgba(255,255,255,0.12)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, N, N);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [dx, dy] of [[1, 0], [0, 1]]) { g.beginPath(); g.moveTo(h - dx * h * 0.95, h - dy * h * 0.95); g.lineTo(h + dy * 5, h + dx * 5); g.lineTo(h + dx * h * 0.95, h + dy * h * 0.95); g.lineTo(h - dy * 5, h - dx * 5); g.closePath(); g.fill(); }
  },
  'rbxasset://textures/particles/smoke_main.dds': g => {
    const r = rng(7);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = r() * 26, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, rad = 22 + r() * 18;
      const b = g.createRadialGradient(x, y, 0, x, y, rad);
      b.addColorStop(0, 'rgba(255,255,255,0.32)'); b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b; g.fillRect(0, 0, 128, 128);
    }
  },
  'rbxasset://textures/particles/fire_main.dds': g => {
    g.save(); g.translate(64, 80); g.scale(0.62, 1);
    const b = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    b.addColorStop(0, 'rgba(255,255,255,1)'); b.addColorStop(0.35, 'rgba(255,255,255,0.7)'); b.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = b; g.beginPath(); g.arc(0, 0, 64, 0, Math.PI * 2); g.fill(); g.restore();
  },
};
function builtinTexture(id) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  BUILTIN[id](c.getContext('2d'));
  return c.toDataURL('image/png');
}

const VERTEX = `precision highp float;
attribute vec3 position; attribute vec2 uv; attribute vec2 uv2; attribute vec4 color; attribute float blend;
uniform mat4 viewProjection;
varying vec2 vA; varying vec2 vB; varying vec4 vColor; varying float vBlend; varying vec3 vPos;
void main() { vA = uv; vB = uv2; vColor = color; vBlend = blend; vPos = position; gl_Position = viewProjection * vec4(position, 1.0); }`;
const FRAGMENT = `precision highp float;
uniform sampler2D tex; uniform float lightEmission; uniform vec3 eye; uniform vec4 fog; uniform vec3 fogColor;
varying vec2 vA; varying vec2 vB; varying vec4 vColor; varying float vBlend; varying vec3 vPos;
void main() {
  vec4 t = mix(texture2D(tex, vA), texture2D(tex, vB), vBlend);
  float a = t.a * vColor.a;
  if (a <= 0.0) discard;
  vec3 rgb = pow(t.rgb, vec3(2.2)) * vColor.rgb;
  float f = 1.0;
  if (fog.x > 0.5) f = clamp((fog.z - distance(vPos, eye)) / max(fog.z - fog.y, 1e-3), 0.0, 1.0);
  float cover = a * (1.0 - lightEmission);
  gl_FragColor = vec4(rgb * a * f + fogColor * (1.0 - f) * cover, cover);
}`;

export class Particles {
  constructor(scene, dm, world, { quality = 'high', lighting = null, seed = 1 } = {}) {
    Object.assign(this, { scene, dm, world, quality, lighting });
    this.emitters = new Map(); // ParticleEmitter -> state
    this.random = rng(seed);
    this.textures = new Map();
    this.dirty = true;
    dm.watch((inst, key) => { if (!inst || inst.ClassName === 'ParticleEmitter' || key === 'Parent') this.dirty = true; });
    dm.onEvent((inst, ev, args) => {
      if (inst.ClassName !== 'ParticleEmitter') return;
      if (this.dirty) this.sync();
      const e = this.emitters.get(inst);
      if (!e) return;
      if (ev === 'OnEmitRequested') for (let i = 0; i < args[0]; i++) this.spawn(e, 0);
      else if (ev === 'OnClearRequested') e.ps.length = 0;
      else if (ev === 'OnFastForwardRequested') for (let i = 0; i < args[0]; i++) this.simulate(e, FRAME);
    });
  }

  // Emitters that draw: under a BasePart in the Workspace (Attachments come with that class).
  collect() {
    const out = [];
    const walk = inst => { for (const c of inst.children) { if (c.ClassName === 'ParticleEmitter' && isA(inst.ClassName, 'BasePart')) out.push(c); walk(c); } };
    walk(this.dm.workspace);
    return out;
  }

  sync() {
    this.dirty = false;
    const want = new Set(this.collect());
    for (const [inst, e] of this.emitters) if (!want.has(inst)) { e.mesh.dispose(); e.mat.dispose(); this.emitters.delete(inst); }
    for (const inst of want) if (!this.emitters.has(inst)) this.emitters.set(inst, this.create(inst));
  }

  create(inst) {
    const mesh = new Mesh('particles.' + inst.Name, this.scene);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = { particles: inst };
    const mat = new ShaderMaterial('particles', this.scene, { vertexSource: VERTEX, fragmentSource: FRAGMENT }, {
      attributes: ['position', 'uv', 'uv2', 'color', 'blend'], uniforms: ['viewProjection', 'lightEmission', 'eye', 'fog', 'fogColor'], samplers: ['tex'], needAlphaBlending: true,
    });
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = Constants.ALPHA_PREMULTIPLIED; // ONE, ONE_MINUS_SRC_ALPHA: LightEmission 0 normal, 1 additive
    mesh.material = mat;
    return { inst, mesh, mat, ps: [], acc: 0, cap: 0, texFor: null, seq: 0 };
  }

  texture(id) {
    const key = !id || (/^rbxasset:/.test(id) && !BUILTIN[id]) ? DEFAULT_TEXTURE : id; // an rbxasset we don't draw: the sparkle
    if (!this.textures.has(key)) {
      const url = BUILTIN[key] ? builtinTexture(key) : (this.world && this.world.builtinUrl(key)) || (this.world ? this.world.resolveUrl(key) : key);
      const t = new Texture(url, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE;
      this.textures.set(key, t);
    }
    return this.textures.get(key);
  }

  // The part's frame: centre, axes (right, up, back), half sizes.
  frame(part) {
    const cf = part.props.CFrame, m = cf.m, s = part.props.Size;
    return { o: [cf.x, cf.y, cf.z], ax: [0, 1, 2].map(k => [m[3 + k], m[6 + k], m[9 + k]]), h: [s.x / 2, s.y / 2, s.z / 2] };
  }

  // One new particle, `age` seconds old already (spreads a frame's particles over the frame).
  spawn(e, age) {
    const P = e.inst.props, part = e.inst.parent, r = this.random;
    if (e.ps.length >= MAX_PER_EMITTER) return;
    const lt = P.Lifetime, life = lt.min + (lt.max - lt.min) * r();
    if (!(life > 0)) return;
    const F = this.frame(part);
    const [a, sgn] = FACE[en(P.EmissionDirection)] || FACE.Top;
    const u = a === 0 ? 1 : 0, v = a === 2 ? 1 : 2; // the two axes across the emission axis
    const n = [0, 0, 0]; n[a] = sgn;
    const shape = en(P.Shape), surface = en(P.ShapeStyle) === 'Surface', partial = Math.min(1, Math.max(0, P.ShapePartial));
    const pos = [0, 0, 0]; let dir = n.slice(); // both in the part's unit space (-1..1 per axis)
    if (shape === 'Sphere') {
      // A direction within ShapePartial x 180 degrees of the pole (EmissionDirection).
      const cosMax = Math.cos(partial * Math.PI), c = 1 - r() * (1 - cosMax), s = Math.sqrt(Math.max(0, 1 - c * c)), phi = r() * 2 * Math.PI;
      const d = [0, 0, 0]; d[a] = c * sgn; d[u] = s * Math.cos(phi); d[v] = s * Math.sin(phi);
      const rad = surface ? 1 : Math.cbrt(r());
      for (let k = 0; k < 3; k++) pos[k] = d[k] * rad;
      dir = d;
    } else if (shape === 'Cylinder') {
      // Axis along EmissionDirection; the emission end's radius is ShapePartial of the other's.
      const t = r() * 2 - 1, scale = 1 + (partial - 1) * (t + 1) / 2, phi = r() * 2 * Math.PI, rad = (surface ? 1 : Math.sqrt(r())) * scale;
      pos[a] = t * sgn; pos[u] = rad * Math.cos(phi); pos[v] = rad * Math.sin(phi);
      dir = [0, 0, 0]; dir[u] = Math.cos(phi); dir[v] = Math.sin(phi);
    } else if (shape === 'Disc') {
      // Across EmissionDirection through the centre; ShapePartial is the inner radius.
      const phi = r() * 2 * Math.PI, rad = surface ? 1 : Math.sqrt(partial * partial + (1 - partial * partial) * r());
      pos[u] = rad * Math.cos(phi); pos[v] = rad * Math.sin(phi);
    } else if (surface) {
      // A box face, chosen by area.
      const [hx, hy, hz] = F.h, areas = [hy * hz, hx * hz, hx * hy], tot = 2 * (areas[0] + areas[1] + areas[2]);
      let pick = r() * tot, ax = 0; while (ax < 2 && pick > 2 * areas[ax]) { pick -= 2 * areas[ax]; ax++; }
      for (let k = 0; k < 3; k++) pos[k] = k === ax ? (r() < 0.5 ? -1 : 1) : r() * 2 - 1;
    } else for (let k = 0; k < 3; k++) pos[k] = r() * 2 - 1;
    const inout = en(P.ShapeInOut);
    if (inout === 'Inward' || (inout === 'InAndOut' && r() < 0.5)) dir = dir.map(x => -x);
    // SpreadAngle: X tilts toward the first axis across, Y toward the second, each up to ±that many degrees.
    const sp = P.SpreadAngle, ax_ = (sp.x || 0) * Math.PI / 180, ay_ = (sp.y || 0) * Math.PI / 180;
    if (ax_ || ay_) {
      const tx = (r() * 2 - 1) * ax_, ty = (r() * 2 - 1) * ay_;
      const U = [0, 0, 0], V = [0, 0, 0]; U[u] = 1; V[v] = 1;
      dir = rotate(rotate(dir, V, -tx), U, ty);
    }
    // Into world space (the part's frame; directions scale by size only for position).
    const w = [0, 0, 0], wd = [0, 0, 0];
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) { w[k] += F.ax[j][k] * pos[j] * F.h[j]; wd[k] += F.ax[j][k] * dir[j]; }
    const dl = Math.hypot(wd[0], wd[1], wd[2]) || 1;
    const spd = P.Speed.min + (P.Speed.max - P.Speed.min) * r();
    const vel = wd.map(x => x / dl * spd);
    const pv = part.props.AssemblyLinearVelocity, inh = P.VelocityInheritance || 0;
    if (inh && pv) { vel[0] += pv.x * inh; vel[1] += pv.y * inh; vel[2] += pv.z * inh; }
    const p = {
      x: F.o[0] + w[0], y: F.o[1] + w[1], z: F.o[2] + w[2], vx: vel[0], vy: vel[1], vz: vel[2],
      age: 0, life, rot: P.Rotation.min + (P.Rotation.max - P.Rotation.min) * r(), rs: P.RotSpeed.min + (P.RotSpeed.max - P.RotSpeed.min) * r(),
      size: draw(P.Size.k, r), tr: draw(P.Transparency.k, r), sq: draw(P.Squash.k, r),
      fps: Math.min(30, P.FlipbookFramerate.min + (P.FlipbookFramerate.max - P.FlipbookFramerate.min) * r()), f0: P.FlipbookStartRandom ? r() : 0, id: ++e.seq,
    };
    if (P.LockedToPart) this.toLocal(p, F);
    e.ps.push(p);
    if (age > 0) this.advance(e, p, age);
  }

  // A locked particle lives in its part's frame (position and velocity in its axes).
  toLocal(p, F) {
    const d = [p.x - F.o[0], p.y - F.o[1], p.z - F.o[2]], v = [p.vx, p.vy, p.vz];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    [p.x, p.y, p.z] = F.ax.map(c => dot(c, d)); [p.vx, p.vy, p.vz] = F.ax.map(c => dot(c, v)); p.local = true;
  }

  advance(e, p, dt) {
    const P = e.inst.props;
    p.age += dt;
    let A = P.Acceleration;
    if (p.local) { const F = e.F || (e.F = this.frame(e.inst.parent)); const a = [A.x, A.y, A.z]; A = { x: F.ax[0][0] * a[0] + F.ax[0][1] * a[1] + F.ax[0][2] * a[2], y: F.ax[1][0] * a[0] + F.ax[1][1] * a[1] + F.ax[1][2] * a[2], z: F.ax[2][0] * a[0] + F.ax[2][1] * a[1] + F.ax[2][2] * a[2] }; }
    // Exact for constant acceleration; drag then takes half the speed every Drag seconds (negative grows it).
    const h = dt * dt / 2;
    p.x += p.vx * dt + A.x * h; p.y += p.vy * dt + A.y * h; p.z += p.vz * dt + A.z * h;
    p.vx += A.x * dt; p.vy += A.y * dt; p.vz += A.z * dt;
    if (P.Drag) { const k = Math.pow(2, -dt / P.Drag); p.vx *= k; p.vy *= k; p.vz *= k; }
    p.rot += p.rs * dt;
  }

  simulate(e, dt) {
    const P = e.inst.props;
    e.F = null;
    const ts = Math.min(1, Math.max(0, P.TimeScale)), d = dt * ts;
    if (d <= 0) return;
    for (const p of e.ps) this.advance(e, p, d);
    e.ps = e.ps.filter(p => p.age < p.life);
    if (P.Enabled && P.Rate > 0) {
      e.acc += P.Rate * d;
      while (e.acc >= 1) { e.acc -= 1; this.spawn(e, e.acc / P.Rate); }
    } else e.acc = 0;
  }

  // The scene's light level for LightInfluence: ambient, the sun and the sky's diffuse light (OURS).
  lightLevel() {
    const s = this.scene, out = [0, 0, 0];
    for (const l of s.lights) {
      if (!l.isEnabled() || l.intensity <= 0) continue;
      if (l.getClassName() === 'HemisphericLight') { out[0] += l.diffuse.r * l.intensity; out[1] += l.diffuse.g * l.intensity; out[2] += l.diffuse.b * l.intensity; }
      else if (l.getClassName() === 'DirectionalLight') { const k = 0.5 * l.intensity; out[0] += l.diffuse.r * k; out[1] += l.diffuse.g * k; out[2] += l.diffuse.b * k; }
    }
    const sp = s.environmentTexture && s.environmentTexture.sphericalPolynomial;
    if (sp && sp.xx) { const avg = c => (sp.xx[c] + sp.yy[c] + sp.zz[c]) / 3; out[0] += avg('x'); out[1] += avg('y'); out[2] += avg('z'); }
    return out;
  }

  update(dt) {
    if (this.dirty) this.sync();
    if (!this.emitters.size) return;
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const eye = cam.globalPosition, view = cam.getViewMatrix(), vm = view.m;
    // Camera axes in world space (rows of the view matrix's rotation).
    const R = [vm[0], vm[4], vm[8]], U = [vm[1], vm[5], vm[9]];
    const light = this.lightLevel(), sc = this.scene;
    const fog = sc.fogMode === 3 ? [1, sc.fogStart, sc.fogEnd, 0] : [0, 0, 0, 0];
    for (const e of this.emitters.values()) {
      this.simulate(e, dt);
      this.build(e, eye, R, U, light);
      const m = e.mat, P = e.inst.props;
      m.setFloat('lightEmission', Math.min(1, Math.max(0, P.LightEmission)));
      m.setVector3('eye', eye);
      m.setVector4('fog', { x: fog[0], y: fog[1], z: fog[2], w: fog[3] });
      m.setColor3('fogColor', sc.fogColor || Color3.Black());
      if (e.texFor !== P.Texture) { e.texFor = P.Texture; m.setTexture('tex', this.texture(P.Texture)); }
    }
  }

  build(e, eye, R, U, light) {
    const P = e.inst.props, ps = e.ps, n = ps.length, mesh = e.mesh;
    mesh.setEnabled(n > 0);
    if (!n) return;
    if (n > e.cap) this.grow(e, Math.max(64, 1 << Math.ceil(Math.log2(n))));
    const F = this.frame(e.inst.parent);
    // World positions (locked particles ride their part) and distance, back to front for normal blending.
    const W = ps.map(p => {
      let x = p.x, y = p.y, z = p.z, vx = p.vx, vy = p.vy, vz = p.vz;
      if (p.local) {
        const a = F.ax; x = F.o[0] + a[0][0] * p.x + a[1][0] * p.y + a[2][0] * p.z; y = F.o[1] + a[0][1] * p.x + a[1][1] * p.y + a[2][1] * p.z; z = F.o[2] + a[0][2] * p.x + a[1][2] * p.y + a[2][2] * p.z;
        vx = a[0][0] * p.vx + a[1][0] * p.vy + a[2][0] * p.vz; vy = a[0][1] * p.vx + a[1][1] * p.vy + a[2][1] * p.vz; vz = a[0][2] * p.vx + a[1][2] * p.vy + a[2][2] * p.vz;
      }
      return { p, x, y, z, vx, vy, vz, d: (x - eye.x) ** 2 + (y - eye.y) ** 2 + (z - eye.z) ** 2 };
    });
    if (P.LightEmission < 1) W.sort((a, b) => b.d - a.d);
    const orient = en(P.Orientation), li = Math.min(1, Math.max(0, P.LightInfluence)), br = Math.max(0, P.Brightness);
    const lit = [0, 1, 2].map(c => br * (1 - li) + light[c] * li);
    const layout = en(P.FlipbookLayout), cols = layout === 'Custom' ? Math.max(1, P.FlipbookSizeX | 0) : GRID[layout] || 1, rows = layout === 'Custom' ? Math.max(1, P.FlipbookSizeY | 0) : cols;
    const frames = cols * rows, mode = en(P.FlipbookMode), blendOn = P.FlipbookBlendFrames;
    const pos = e.pos, uv = e.uv, uv2 = e.uv2, col = e.col, bl = e.bl, c3 = [0, 0, 0];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let i = 0;
    for (const w of W) {
      const p = w.p, t = Math.min(1, p.age / p.life);
      let size = Math.max(0, seqAt(P.Size.k, p.size, t)), sq = seqAt(P.Squash.k, p.sq, t);
      const tr = Math.min(1, Math.max(0, seqAt(P.Transparency.k, p.tr, t)));
      let cx = w.x, cy = w.y, cz = w.z;
      // ZOffset: toward the camera, scaled so the size on screen stays.
      if (P.ZOffset) {
        const dist = Math.sqrt(w.d) || 1, zo = Math.min(P.ZOffset, dist - 0.05);
        cx += (eye.x - cx) / dist * zo; cy += (eye.y - cy) / dist * zo; cz += (eye.z - cz) / dist * zo; size *= (dist - zo) / dist;
      }
      const sw = sq >= 0 ? 1 / (1 + sq) : 1 - sq, sh = sq >= 0 ? 1 + sq : 1 / (1 - sq);
      const hw = size * sw / 2, hh = size * sh / 2;
      // The quad's axes.
      let ax, ay; const th = -p.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
      const toCam = [eye.x - cx, eye.y - cy, eye.z - cz];
      const vel = [w.vx, w.vy, w.vz], vl = Math.hypot(...vel);
      if (orient === 'FacingCameraWorldUp') {
        const r0 = norm(cross([0, 1, 0], toCam), R), u0 = [0, 1, 0];
        ax = mix2(r0, u0, cs, sn); ay = mix2(u0, r0, cs, -sn);
      } else if (orient === 'VelocityParallel' && vl > 1e-5) {
        ay = vel.map(x => x / vl); ax = norm(cross(ay, toCam), R);
      } else if (orient === 'VelocityPerpendicular' && vl > 1e-5) {
        const nrm = vel.map(x => x / vl), ref = Math.abs(nrm[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
        const r0 = norm(cross(ref, nrm), R), u0 = cross(nrm, r0);
        ax = mix2(r0, u0, cs, sn); ay = mix2(u0, r0, cs, -sn);
      } else { ax = mix2(R, U, cs, sn); ay = mix2(U, R, cs, -sn); }
      // Flipbook frames (Roblox: Loop, OneShot over the life, PingPong, Random), crossfaded when blended.
      let f0 = 0, f1 = 0, fb = 0;
      if (frames > 1) {
        let f;
        if (mode === 'OneShot') { f = Math.min(frames - 1, t * frames); f0 = Math.floor(f); f1 = Math.min(frames - 1, f0 + 1); }
        else if (mode === 'PingPong') { const per = 2 * (frames - 1), g = (p.f0 * per + p.age * p.fps) % per; f = g < frames - 1 ? g : per - g; f0 = Math.floor(f); f1 = Math.min(frames - 1, f0 + 1); }
        else if (mode === 'Random') { f = p.f0 * frames + p.age * p.fps; const s = Math.floor(f); f0 = Math.floor(hash(p.id, s) * frames); f1 = Math.floor(hash(p.id, s + 1) * frames); }
        else { f = p.f0 * frames + p.age * p.fps; f0 = Math.floor(f) % frames; f1 = (f0 + 1) % frames; }
        fb = blendOn ? f - Math.floor(f) : 0;
        if (mode === 'OneShot' && f0 === frames - 1) fb = 0;
      }
      colorAt(P.Color.k, t, c3);
      const alpha = 1 - tr;
      for (let k = 0; k < 4; k++) {
        const sx = k === 0 || k === 3 ? -1 : 1, sy = k < 2 ? -1 : 1, o = (i * 4 + k);
        const px = cx + ax[0] * hw * sx + ay[0] * hh * sy, py = cy + ax[1] * hw * sx + ay[1] * hh * sy, pz = cz + ax[2] * hw * sx + ay[2] * hh * sy;
        pos[o * 3] = px; pos[o * 3 + 1] = py; pos[o * 3 + 2] = pz;
        if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz;
        if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz;
        const qu = sx < 0 ? 0 : 1, qv = sy < 0 ? 0 : 1;
        uv[o * 2] = (f0 % cols + qu) / cols; uv[o * 2 + 1] = 1 - (Math.floor(f0 / cols) + 1 - qv) / rows;
        uv2[o * 2] = (f1 % cols + qu) / cols; uv2[o * 2 + 1] = 1 - (Math.floor(f1 / cols) + 1 - qv) / rows;
        col[o * 4] = lin(c3[0]) * lit[0]; col[o * 4 + 1] = lin(c3[1]) * lit[1]; col[o * 4 + 2] = lin(c3[2]) * lit[2]; col[o * 4 + 3] = alpha;
        bl[o] = fb;
      }
      i++;
    }
    mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
    mesh.updateVerticesData(VertexBuffer.UVKind, uv);
    mesh.updateVerticesData(VertexBuffer.UV2Kind, uv2);
    mesh.updateVerticesData(VertexBuffer.ColorKind, col);
    mesh.updateVerticesData('blend', bl);
    // Draw only the live quads; a partial sub-mesh keeps its own bounds (the transparent sort reads them).
    const sm = mesh.subMeshes[0], box = new BoundingInfo(Vector3.FromArray(min), Vector3.FromArray(max));
    sm.indexCount = n * 6; sm.verticesCount = n * 4;
    mesh.setBoundingInfo(box); sm.setBoundingInfo(box);
  }

  grow(e, cap) {
    e.cap = cap;
    e.pos = new Float32Array(cap * 12); e.uv = new Float32Array(cap * 8); e.uv2 = new Float32Array(cap * 8); e.col = new Float32Array(cap * 16); e.bl = new Float32Array(cap * 4);
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) { const b = q * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6); }
    const m = e.mesh;
    m.setVerticesData(VertexBuffer.PositionKind, e.pos, true);
    m.setVerticesData(VertexBuffer.UVKind, e.uv, true);
    m.setVerticesData(VertexBuffer.UV2Kind, e.uv2, true);
    m.setVerticesData(VertexBuffer.ColorKind, e.col, true, 4);
    m.setVerticesData('blend', e.bl, true, 1);
    m.setIndices(idx);
  }

  // Test and editor hook: how many particles an emitter has alive.
  count(inst) { const e = this.emitters.get(inst); return e ? e.ps.length : 0; }
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a, fallback) { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-6 ? a.map(x => x / l) : fallback; }
function mix2(a, b, ca, cb) { return [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb]; }
// Rodrigues: d rotated by ang about a unit axis.
function rotate(d, axis, ang) {
  if (!ang) return d;
  const c = Math.cos(ang), s = Math.sin(ang), cr = cross(axis, d), k = axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2];
  return [0, 1, 2].map(i => d[i] * c + cr[i] * s + axis[i] * k * (1 - c));
}
