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
//
// Beyond Roblox (Claude Studio's own properties, datamodel.js STUDIO_OWN), each
// budgeted by the fidelity tier (runtime/quality.js), which never removes a
// particle, only these extras:
// - CastLight: the emitter lights its surroundings with one point light at its
//   particles' centre, their average colour, up to LightRange studs; it takes a
//   place in LocalLights' per-surface light budget. The tier says how many
//   emitters may (nearest the camera first).
// - Collision Bounce/Stick/Die against collidable parts (Havok rays from each
//   particle's last position to its new one), Bounciness the share of speed
//   kept off the surface; the tier caps the rays per frame (the rest move on).
// - Soft particles: on tiers that have them, quads fade where they meet a
//   surface instead of cutting a hard line through it (a shared depth pass).
// LightInfluence also takes in local lights near the emitter (all tiers).
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Light } from '@babylonjs/core/Lights/light.js';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult.js';
import { isA } from '../datamodel.js';
import { tier } from './quality.js';
import { useDepth, releaseDepth } from './depth.js';

export const MAX_PER_EMITTER = 5000;
const FRAME = 1 / 60; // FastForward's frame
const MAX_FAST_FORWARD = 3600; // OURS: FastForward runs at most a minute (enough to reach steady state)
const DEFAULT_TEXTURE = 'rbxasset://textures/particles/sparkles_main.dds';
// NormalId -> [axis, sign] in the part's own axes (right, up, back).
const FACE = { Right: [0, 1], Left: [0, -1], Top: [1, 1], Bottom: [1, -1], Back: [2, 1], Front: [2, -1] };
const GRID = { None: 1, Grid2x2: 2, Grid4x4: 4, Grid8x8: 8 };
const en = v => (v && v.name) || v;
const lin = c => Math.pow(Math.max(0, c), 2.2);
const CAST_INTENSITY = 2;   // per Brightness, as LocalLights' INTENSITY_PER_BRIGHTNESS
const CAST_FULL_ALPHA = 8;  // OURS: this much summed opacity lights at full strength
const SOFT_RANGE = 1.0;     // OURS: studs over which a particle fades into a surface

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
attribute vec3 position; attribute vec2 uv; attribute vec2 uv2; attribute vec4 color; attribute vec2 blend; // blend: frame mix, soft range
uniform mat4 viewProjection; uniform vec2 depthValues;
varying vec2 vA; varying vec2 vB; varying vec4 vColor; varying float vBlend; varying vec3 vPos; varying float vDepth; varying float vSoft;
void main() {
  vA = uv; vB = uv2; vColor = color; vBlend = blend.x; vSoft = blend.y; vPos = position; gl_Position = viewProjection * vec4(position, 1.0);
  vDepth = (gl_Position.z + depthValues.x) / depthValues.y; // the depth renderer's own metric
}`;
const FRAGMENT = `precision highp float;
uniform sampler2D tex; uniform float lightEmission; uniform vec3 eye; uniform vec4 fog; uniform vec3 fogColor;
uniform vec2 depthValues; uniform vec2 screen; uniform sampler2D depthTex;
varying vec2 vA; varying vec2 vB; varying vec4 vColor; varying float vBlend; varying vec3 vPos; varying float vDepth; varying float vSoft;
void main() {
  vec4 t = mix(texture2D(tex, vA), texture2D(tex, vB), vBlend);
  float a = t.a * vColor.a;
#ifdef SOFT
  float behind = (texture2D(depthTex, gl_FragCoord.xy / screen).r - vDepth) * depthValues.y; // studs to the surface behind
  if (vSoft > 0.0) a *= clamp(behind / vSoft, 0.0, 1.0);
#endif
  if (a <= 0.0) discard;
  vec3 rgb = pow(t.rgb, vec3(2.2)) * vColor.rgb;
  float f = 1.0;
  if (fog.x > 0.5) f = clamp((fog.z - distance(vPos, eye)) / max(fog.z - fog.y, 1e-3), 0.0, 1.0);
  float cover = a * (1.0 - lightEmission);
  gl_FragColor = vec4(rgb * a * f + fogColor * (1.0 - f) * cover, cover);
}`;

export class Particles {
  constructor(scene, dm, world, { quality = 'high', lighting = null, localLights = null, seed = 1 } = {}) {
    Object.assign(this, { scene, dm, world, quality, lighting, localLights });
    this.Q = tier(quality);
    this.ray = new PhysicsRaycastResult();
    this.used = { rays: 0, lights: 0 }; // this frame's extras (tests read it)
    this.depth = null; this.depthCam = null; // the camera's depth pass, held for soft particles
    this.emitters = new Map(); // ParticleEmitter -> state
    this.random = rng(seed);
    this.textures = new Map();
    this.dirty = true;
    dm.watch((inst, key) => {
      if (!inst || inst.ClassName === 'ParticleEmitter' || key === 'Parent') this.dirty = true;
      // LockedToPart changed: convert live particles now, against the part where it is at this moment.
      if (inst && key === 'LockedToPart' && inst.ClassName === 'ParticleEmitter') { const e = this.emitters.get(inst); if (e) this.relock(e); }
    });
    dm.onEvent((inst, ev, args) => {
      if (inst.ClassName !== 'ParticleEmitter') return;
      if (this.dirty) this.sync();
      const e = this.emitters.get(inst);
      if (!e) return;
      if (ev === 'OnEmitRequested') { const n = Math.min(args[0], MAX_PER_EMITTER - e.ps.length); for (let i = 0; i < n; i++) this.spawn(e, 0); } // a huge count stops at the cap
      else if (ev === 'OnClearRequested') e.ps.length = 0;
      else if (ev === 'OnFastForwardRequested') { const n = Math.min(args[0], MAX_FAST_FORWARD); for (let i = 0; i < n; i++) this.simulate(e, FRAME); }
    });
  }

  // Emitters that draw: under a BasePart in the Workspace (Attachments come with that class).
  collect() {
    const out = [];
    const walk = inst => { for (const c of inst.children) { if (c.ClassName === 'ParticleEmitter' && (isA(inst.ClassName, 'BasePart') || inst.ClassName === 'Attachment')) out.push(c); walk(c); } };
    walk(this.dm.workspace);
    return out;
  }

  sync() {
    this.dirty = false;
    const want = new Set(this.collect());
    for (const [inst, e] of this.emitters) if (!want.has(inst)) { this.dropLight(e); e.mesh.dispose(); e.mat.dispose(); this.emitters.delete(inst); }
    for (const inst of want) if (!this.emitters.has(inst)) this.emitters.set(inst, this.create(inst));
    // An emitter moved to another part (or attachment): its locked particles keep their place in the
    // world and ride the new one from now on (OURS: Roblox's behaviour isn't documented).
    for (const [inst, e] of this.emitters) {
      if (e.host && e.host !== inst.parent && e.hostF && e.ps.some(p => p.local)) { const F = this.frame(inst.parent); for (const p of e.ps) if (p.local) { this.toWorld(p, e.hostF); this.toLocal(p, F); } }
      e.host = inst.parent; e.hostF = this.frame(inst.parent);
    }
  }

  create(inst) {
    const mesh = new Mesh('particles.' + inst.Name, this.scene);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = { particles: inst };
    const mat = new ShaderMaterial('particles', this.scene, { vertexSource: VERTEX, fragmentSource: FRAGMENT }, {
      attributes: ['position', 'uv', 'uv2', 'color', 'blend'], uniforms: ['viewProjection', 'lightEmission', 'eye', 'fog', 'fogColor', 'depthValues', 'screen'], samplers: ['tex', 'depthTex'], needAlphaBlending: true,
      defines: this.Q.softParticles ? ['#define SOFT'] : [],
    });
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = Constants.ALPHA_PREMULTIPLIED; // ONE, ONE_MINUS_SRC_ALPHA: LightEmission 0 normal, 1 additive
    mesh.material = mat;
    return { inst, mesh, mat, ps: [], acc: 0, cap: 0, texFor: null, seq: 0, light: null, stats: null };
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
  // An Attachment is a point with its own axes (Roblox: particles spawn from the attachment's
  // position; its orientation turns EmissionDirection), so every shape collapses to that point.
  frame(part) {
    const att = part.ClassName === 'Attachment', cf = att ? this.dm.attachmentWorld(part).WorldCFrame : part.props.CFrame, m = cf.m, s = att ? null : part.props.Size;
    return { o: [cf.x, cf.y, cf.z], ax: [0, 1, 2].map(k => [m[3 + k], m[6 + k], m[9 + k]]), h: s ? [s.x / 2, s.y / 2, s.z / 2] : [0, 0, 0] };
  }
  // The part an emitter belongs to (its parent, or its attachment's part): velocity and collisions.
  bodyOf(host) { return host.ClassName === 'Attachment' ? (host.parent && isA(host.parent.ClassName, 'BasePart') ? host.parent : null) : host; }

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
    const body = this.bodyOf(part), pv = body && body.props.AssemblyLinearVelocity, inh = P.VelocityInheritance || 0;
    if (inh && pv) { vel[0] += pv.x * inh; vel[1] += pv.y * inh; vel[2] += pv.z * inh; }
    const p = {
      x: F.o[0] + w[0], y: F.o[1] + w[1], z: F.o[2] + w[2], vx: vel[0], vy: vel[1], vz: vel[2],
      age: 0, life, rot: P.Rotation.min + (P.Rotation.max - P.Rotation.min) * r(), rs: P.RotSpeed.min + (P.RotSpeed.max - P.RotSpeed.min) * r(),
      size: draw(P.Size.k, r), tr: draw(P.Transparency.k, r), sq: draw(P.Squash.k, r), sk: P.Size, tk: P.Transparency, qk: P.Squash,
      fps: Math.min(30, Math.max(0, P.FlipbookFramerate.min + (P.FlipbookFramerate.max - P.FlipbookFramerate.min) * r())), f0: P.FlipbookStartRandom ? r() : 0, id: ++e.seq,
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

  // Live particles to match LockedToPart: into the part's space, or back to world space.
  relock(e) {
    const on = !!e.inst.props.LockedToPart;
    if (!e.ps.some(p => !!p.local !== on)) return;
    const F = this.frame(e.inst.parent);
    for (const p of e.ps) if (!!p.local !== on) (on ? this.toLocal(p, F) : this.toWorld(p, F));
  }
  // Back to world space (LockedToPart turned off).
  toWorld(p, F) {
    const a = F.ax, l = [p.x, p.y, p.z], v = [p.vx, p.vy, p.vz];
    const out = (k, w) => w[0] * a[0][k] + w[1] * a[1][k] + w[2] * a[2][k];
    p.x = F.o[0] + out(0, l); p.y = F.o[1] + out(1, l); p.z = F.o[2] + out(2, l);
    p.vx = out(0, v); p.vy = out(1, v); p.vz = out(2, v);
    p.local = false;
  }

  // What one step of dt needs, worked out once per emitter (not per particle): the acceleration in
  // world space and, for locked particles, in the part's; the drag factor.
  // (relock runs first in simulate, so every live particle is local exactly when LockedToPart is set.)
  stepper(e, dt) {
    const P = e.inst.props, A = P.Acceleration, s = e.step || (e.step = { aw: [0, 0, 0], al: [0, 0, 0] });
    s.dt = dt; s.h = dt * dt / 2; s.k = P.Drag ? Math.pow(2, -dt / P.Drag) : 1;
    s.aw[0] = A.x; s.aw[1] = A.y; s.aw[2] = A.z;
    // WindAffectsDrag (Roblox: only with Drag > 0): drag pulls toward Workspace.GlobalWind instead of rest.
    const W = P.WindAffectsDrag && P.Drag > 0 && this.dm.workspace.props.GlobalWind;
    s.wind = W && (W.x || W.y || W.z) ? (s.ww || (s.ww = [0, 0, 0])) : null;
    if (s.wind) { s.wind[0] = W.x; s.wind[1] = W.y; s.wind[2] = W.z; }
    if (P.LockedToPart) {
      const ax = this.frame(e.inst.parent).ax;
      for (let r = 0; r < 3; r++) s.al[r] = ax[r][0] * A.x + ax[r][1] * A.y + ax[r][2] * A.z;
      if (s.wind) { const wl = s.wl || (s.wl = [0, 0, 0]); for (let r = 0; r < 3; r++) wl[r] = ax[r][0] * W.x + ax[r][1] * W.y + ax[r][2] * W.z; }
    }
    return s;
  }
  advance(e, p, dt, s = this.stepper(e, dt)) {
    p.age += dt;
    p.rot += p.rs * dt;
    if (p.stuck) return;
    const A = p.local ? s.al : s.aw, h = s.h;
    // Exact for constant acceleration; drag then takes half the speed every Drag seconds (negative grows it).
    p.x += p.vx * dt + A[0] * h; p.y += p.vy * dt + A[1] * h; p.z += p.vz * dt + A[2] * h;
    p.vx += A[0] * dt; p.vy += A[1] * dt; p.vz += A[2] * dt;
    if (s.k !== 1) {
      if (s.wind) { const w = p.local ? s.wl : s.wind; p.vx = w[0] + (p.vx - w[0]) * s.k; p.vy = w[1] + (p.vy - w[1]) * s.k; p.vz = w[2] + (p.vz - w[2]) * s.k; }
      else { p.vx *= s.k; p.vy *= s.k; p.vz *= s.k; }
    }
  }

  simulate(e, dt) {
    const P = e.inst.props;
    e.F = null;
    const ts = Math.min(1, Math.max(0, P.TimeScale)), d = dt * ts;
    if (d <= 0) return;
    this.relock(e); // (normally done when the property changes; this catches any missed)
    const collide = en(P.Collision), phys = collide && collide !== 'None' && this.Q.particleCollisionRays > 0 && this.scene.getPhysicsEngine && this.scene.getPhysicsEngine();
    if (phys) {
      // Rays from each particle's last position to its new one, while the frame's budget lasts.
      const own = this.world && this.world.parts.get(this.bodyOf(e.inst.parent)), ownBody = own && own.agg && own.agg.body;
      const from = new Vector3(), to = new Vector3(), ray = this.ray, k = Math.min(1, Math.max(0, P.Bounciness)), s = this.stepper(e, d);
      for (const p of e.ps) {
        const x0 = p.x, y0 = p.y, z0 = p.z;
        this.advance(e, p, d, s);
        if (p.local || p.stuck || this.used.rays >= this.Q.particleCollisionRays) continue;
        this.used.rays++;
        from.set(x0, y0, z0); to.set(p.x, p.y, p.z);
        ray.reset(); phys.raycastToRef(from, to, ray);
        if (!ray.hasHit || (ownBody && ray.body === ownBody)) continue;
        const n = ray.hitNormalWorld, h = ray.hitPointWorld;
        if (collide === 'Die') { p.age = p.life; continue; }
        if (collide === 'Stick') { p.x = h.x; p.y = h.y; p.z = h.z; p.vx = p.vy = p.vz = 0; p.stuck = true; continue; }
        // Bounce: the speed into the surface turns back, Bounciness of it kept; along it, kept.
        const vn = p.vx * n.x + p.vy * n.y + p.vz * n.z;
        if (vn < 0) { p.vx -= (1 + k) * vn * n.x; p.vy -= (1 + k) * vn * n.y; p.vz -= (1 + k) * vn * n.z; }
        p.x = h.x + n.x * 0.02; p.y = h.y + n.y * 0.02; p.z = h.z + n.z * 0.02;
      }
    } else { const s = this.stepper(e, d); for (const p of e.ps) this.advance(e, p, d, s); }
    // The dead go, in place (no new array each frame).
    const ps = e.ps; let live = 0;
    for (let i = 0; i < ps.length; i++) if (ps[i].age < ps[i].life) ps[live++] = ps[i];
    ps.length = live;
    if (P.Enabled && P.Rate > 0) {
      // Spread over the frame: the i-th of n new particles is (acc - i) / Rate seconds old. Never
      // more than the cap allows (a huge or infinite Rate fills the emitter, it doesn't hang).
      e.acc += P.Rate * d;
      const A = e.acc, n = Number.isFinite(A) ? Math.floor(A) : Infinity, make = Math.min(n, MAX_PER_EMITTER - e.ps.length);
      for (let j = 0; j < make; j++) this.spawn(e, Number.isFinite(A) ? (A - (n - make + 1 + j)) / P.Rate : 0); // counted: n may be Infinity
      e.acc = Number.isFinite(A) ? A - n : 0;
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
  // Plus the local lights (point, spot, surface; and other emitters' cast light) that reach a point:
  // linear to zero at their range, as LocalLights draws them (OURS: cones ignored).
  localLevel(base, at, skip) {
    const out = base.slice();
    for (const l of this.scene.lights) {
      if (l === skip || !l.isEnabled() || l.intensity <= 0 || !l.range || l.range === Number.MAX_VALUE || !l.position) continue;
      const c = l.getClassName(); if (c !== 'PointLight' && c !== 'SpotLight') continue;
      const d = Math.hypot(l.position.x - at[0], l.position.y - at[1], l.position.z - at[2]), f = 1 - d / l.range;
      if (f > 0) { out[0] += l.diffuse.r * l.intensity * f; out[1] += l.diffuse.g * l.intensity * f; out[2] += l.diffuse.b * l.intensity * f; }
    }
    return out;
  }

  // CastLight: the emitters nearest the camera, up to the tier's count, each get a point light.
  castLights(eye) {
    const want = [];
    for (const e of this.emitters.values()) {
      const P = e.inst.props, s = e.stats;
      if (P.CastLight && s && s.a > 0 && P.LightRange > 0 && P.Brightness > 0 && this.localLights) want.push(e);
      else this.dropLight(e);
    }
    want.sort((a, b) => a.stats.d - b.stats.d);
    this.used.lights = 0;
    want.forEach((e, i) => {
      if (i >= this.Q.particleLights) { this.dropLight(e); return; }
      const P = e.inst.props, s = e.stats;
      if (!e.light) {
        e.light = new PointLight('particlelight', Vector3.Zero(), this.scene);
        e.light.falloffType = Light.FALLOFF_STANDARD; e.light.specular = Color3.Black();
        e.light.setEnabled(false); // LocalLights turns it on for the surfaces that choose it
        e.lightEntry = this.localLights.addExternal(e.light);
      }
      e.light.position.set(s.x / s.a, s.y / s.a, s.z / s.a);
      e.light.diffuse.set(s.r / s.a, s.g / s.a, s.b / s.a);
      e.light.range = Math.min(60, P.LightRange);
      e.light.intensity = CAST_INTENSITY * P.Brightness * Math.min(1, s.a / CAST_FULL_ALPHA);
      this.used.lights++;
    });
  }
  dropLight(e) {
    if (!e.light) return;
    this.localLights.removeExternal(e.lightEntry); e.light.dispose(); e.light = null; e.lightEntry = null;
  }

  update(dt) {
    if (this.dirty) this.sync();
    if (!this.emitters.size) { this.dropDepth(); return; }
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const eye = cam.globalPosition, view = cam.getViewMatrix(), vm = view.m;
    // Camera axes in world space (rows of the view matrix's rotation).
    const R = [vm[0], vm[4], vm[8]], U = [vm[1], vm[5], vm[9]];
    const base = this.lightLevel(), sc = this.scene;
    const fog = sc.fogMode === 3 ? [1, sc.fogStart, sc.fogEnd, 0] : [0, 0, 0, 0];
    // Soft particles: the camera's depth (shared with the post effects), held once there are emitters.
    let depth = null;
    if (this.Q.softParticles) { if (!this.depth || this.depthCam !== cam) { this.dropDepth(); this.depth = useDepth(sc, cam, this); this.depthCam = cam; } depth = this.depth.getDepthMap(); }
    const eng = sc.getEngine(), screen = { x: eng.getRenderWidth(), y: eng.getRenderHeight() }, dv = { x: cam.minZ, y: cam.minZ + cam.maxZ };
    this.used.rays = 0;
    for (const e of this.emitters.values()) {
      this.simulate(e, dt);
      const P = e.inst.props, F = this.frame(e.inst.parent);
      e.host = e.inst.parent; e.hostF = F; // where its locked particles are, if it moves to another part
      const light = P.LightInfluence > 0 ? this.localLevel(base, F.o, e.light) : base;
      this.build(e, eye, R, U, light);
      const m = e.mat;
      m.setVector2('depthValues', dv); m.setVector2('screen', screen);
      if (depth) m.setTexture('depthTex', depth);
      m.setFloat('lightEmission', Math.min(1, Math.max(0, P.LightEmission)));
      m.setVector3('eye', eye);
      m.setVector4('fog', { x: fog[0], y: fog[1], z: fog[2], w: fog[3] });
      m.setColor3('fogColor', (sc.fogColor || Color3.Black()).toLinearSpace()); // as Babylon's PBR does: the scene's fog colour is sRGB
      if (e.texFor !== P.Texture) { e.texFor = P.Texture; m.setTexture('tex', this.texture(P.Texture)); this.evictTextures(); }
    }
    this.castLights(eye);
  }

  build(e, eye, R, U, light) {
    const P = e.inst.props, ps = e.ps, n = ps.length, mesh = e.mesh;
    mesh.setEnabled(n > 0);
    e.stats = null;
    if (!n) return;
    // For CastLight: opacity-weighted centre and linear colour, and the distance to the camera.
    const st = P.CastLight ? (e.stats = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0, d: 0 }) : null;
    if (n > e.cap) this.grow(e, Math.max(64, 1 << Math.ceil(Math.log2(n))));
    const F = this.frame(e.inst.parent);
    // World positions and velocities (locked particles ride their part) and squared distance to the
    // camera, into buffers kept between frames; then the drawing order, back to front for normal blending.
    const W = e.world, D = e.dist, order = e.order, a = F.ax, ex = eye.x, ey = eye.y, ez = eye.z;
    for (let q = 0; q < n; q++) {
      const p = ps[q], o = q * 6;
      if (p.local) {
        W[o] = F.o[0] + a[0][0] * p.x + a[1][0] * p.y + a[2][0] * p.z; W[o + 1] = F.o[1] + a[0][1] * p.x + a[1][1] * p.y + a[2][1] * p.z; W[o + 2] = F.o[2] + a[0][2] * p.x + a[1][2] * p.y + a[2][2] * p.z;
        W[o + 3] = a[0][0] * p.vx + a[1][0] * p.vy + a[2][0] * p.vz; W[o + 4] = a[0][1] * p.vx + a[1][1] * p.vy + a[2][1] * p.vz; W[o + 5] = a[0][2] * p.vx + a[1][2] * p.vy + a[2][2] * p.vz;
      } else { W[o] = p.x; W[o + 1] = p.y; W[o + 2] = p.z; W[o + 3] = p.vx; W[o + 4] = p.vy; W[o + 5] = p.vz; }
      D[q] = (W[o] - ex) ** 2 + (W[o + 1] - ey) ** 2 + (W[o + 2] - ez) ** 2;
      order[q] = q;
    }
    const drawOrder = order.subarray(0, n);
    if (P.LightEmission < 1) drawOrder.sort((x, y) => D[y] - D[x]);
    const orient = en(P.Orientation), li = Math.min(1, Math.max(0, P.LightInfluence)), br = Math.max(0, P.Brightness);
    const lit = [0, 1, 2].map(c => br * (1 - li) + light[c] * li);
    const layout = en(P.FlipbookLayout), cols = layout === 'Custom' ? Math.max(1, P.FlipbookSizeX | 0) : GRID[layout] || 1, rows = layout === 'Custom' ? Math.max(1, P.FlipbookSizeY | 0) : cols;
    const frames = cols * rows, mode = en(P.FlipbookMode), blendOn = P.FlipbookBlendFrames;
    const pos = e.pos, uv = e.uv, uv2 = e.uv2, col = e.col, bl = e.bl, c3 = [0, 0, 0];
    // Soft edges (tiers that have them): the fade distance is half the particle's size, at most
    // SOFT_RANGE. Not for flat-lying quads (VelocityPerpendicular) or emitters whose particles
    // collide (they rest on surfaces, where a fade would hide them): a tier must not hide particles.
    const softOK = this.Q.softParticles && orient !== 'VelocityPerpendicular' && (en(P.Collision) || 'None') === 'None';
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let i = 0;
    for (let j = 0; j < n; j++) {
      const q = drawOrder[j], p = ps[q], o6 = q * 6, t = Math.min(1, p.age / p.life);
      const wx = W[o6], wy = W[o6 + 1], wz = W[o6 + 2], vx = W[o6 + 3], vy = W[o6 + 4], vz = W[o6 + 5];
      // A sequence changed while the particle lives: its own values are drawn again for the new keypoints.
      if (p.sk !== P.Size) { p.size = draw(P.Size.k, this.random); p.sk = P.Size; }
      if (p.tk !== P.Transparency) { p.tr = draw(P.Transparency.k, this.random); p.tk = P.Transparency; }
      if (p.qk !== P.Squash) { p.sq = draw(P.Squash.k, this.random); p.qk = P.Squash; }
      let size = Math.max(0, seqAt(P.Size.k, p.size, t)), sq = seqAt(P.Squash.k, p.sq, t);
      const tr = Math.min(1, Math.max(0, seqAt(P.Transparency.k, p.tr, t)));
      let cx = wx, cy = wy, cz = wz;
      // ZOffset: toward the camera, scaled so the size on screen stays.
      if (P.ZOffset) {
        const dist = Math.sqrt(D[q]) || 1, zo = Math.min(P.ZOffset, dist - 0.05);
        cx += (eye.x - cx) / dist * zo; cy += (eye.y - cy) / dist * zo; cz += (eye.z - cz) / dist * zo; size *= (dist - zo) / dist;
      }
      const softR = softOK ? Math.min(SOFT_RANGE, size / 2) : 0;
      const sw = sq >= 0 ? 1 / (1 + sq) : 1 - sq, sh = sq >= 0 ? 1 + sq : 1 / (1 - sq);
      const hw = size * sw / 2, hh = size * sh / 2;
      // The quad's axes (ax: across, ay: up), as scalars: no arrays per particle.
      let ax0, ax1, ax2, ay0, ay1, ay2;
      const th = -p.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
      const tx = ex - cx, ty = ey - cy, tz = ez - cz, vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
      // Right and up before rotation, then turned by the particle's rotation.
      let r0, r1, r2, u0, u1, u2, turn = true;
      if (orient === 'FacingCameraWorldUp') {
        // across = Y x toCam, normalised (falls back to the camera's right)
        let c0 = tz, c2 = -tx; const l = Math.sqrt(c0 * c0 + c2 * c2);
        if (l > 1e-6) { r0 = c0 / l; r1 = 0; r2 = c2 / l; } else { r0 = R[0]; r1 = R[1]; r2 = R[2]; }
        u0 = 0; u1 = 1; u2 = 0;
      } else if (orient === 'VelocityParallel' && vl > 1e-5) {
        u0 = vx / vl; u1 = vy / vl; u2 = vz / vl;
        let c0 = u1 * tz - u2 * ty, c1 = u2 * tx - u0 * tz, c2 = u0 * ty - u1 * tx; const l = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
        if (l > 1e-6) { r0 = c0 / l; r1 = c1 / l; r2 = c2 / l; } else { r0 = R[0]; r1 = R[1]; r2 = R[2]; }
        turn = false; // along the velocity: not rotated
      } else if (orient === 'VelocityPerpendicular' && vl > 1e-5) {
        const n0 = vx / vl, n1 = vy / vl, n2 = vz / vl, f0 = Math.abs(n1) < 0.99 ? 0 : 1, f1 = Math.abs(n1) < 0.99 ? 1 : 0;
        // across = ref x n; up = n x across
        let c0 = f1 * n2, c1 = -f0 * n2, c2 = f0 * n1 - f1 * n0; const l = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
        if (l > 1e-6) { r0 = c0 / l; r1 = c1 / l; r2 = c2 / l; } else { r0 = R[0]; r1 = R[1]; r2 = R[2]; }
        u0 = n1 * r2 - n2 * r1; u1 = n2 * r0 - n0 * r2; u2 = n0 * r1 - n1 * r0;
      } else { r0 = R[0]; r1 = R[1]; r2 = R[2]; u0 = U[0]; u1 = U[1]; u2 = U[2]; }
      if (turn) { ax0 = r0 * cs + u0 * sn; ax1 = r1 * cs + u1 * sn; ax2 = r2 * cs + u2 * sn; ay0 = u0 * cs - r0 * sn; ay1 = u1 * cs - r1 * sn; ay2 = u2 * cs - r2 * sn; }
      else { ax0 = r0; ax1 = r1; ax2 = r2; ay0 = u0; ay1 = u1; ay2 = u2; }
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
      const alpha = 1 - tr, lr = lin(c3[0]), lg = lin(c3[1]), lb = lin(c3[2]); // linear once per particle
      if (st) { st.x += wx * alpha; st.y += wy * alpha; st.z += wz * alpha; st.r += lr * alpha; st.g += lg * alpha; st.b += lb * alpha; st.a += alpha; }
      const cr = lr * lit[0], cg = lg * lit[1], cb = lb * lit[2];
      const u0a = f0 % cols, v0a = Math.floor(f0 / cols), u1a = f1 % cols, v1a = Math.floor(f1 / cols);
      for (let k = 0; k < 4; k++) {
        const sx = k === 0 || k === 3 ? -1 : 1, sy = k < 2 ? -1 : 1, o = (i * 4 + k);
        const px = cx + ax0 * hw * sx + ay0 * hh * sy, py = cy + ax1 * hw * sx + ay1 * hh * sy, pz = cz + ax2 * hw * sx + ay2 * hh * sy;
        pos[o * 3] = px; pos[o * 3 + 1] = py; pos[o * 3 + 2] = pz;
        if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz;
        if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz;
        const qu = sx < 0 ? 0 : 1, qv = sy < 0 ? 0 : 1;
        uv[o * 2] = (u0a + qu) / cols; uv[o * 2 + 1] = 1 - (v0a + 1 - qv) / rows;
        uv2[o * 2] = (u1a + qu) / cols; uv2[o * 2 + 1] = 1 - (v1a + 1 - qv) / rows;
        col[o * 4] = cr; col[o * 4 + 1] = cg; col[o * 4 + 2] = cb; col[o * 4 + 3] = alpha;
        bl[o * 2] = fb; bl[o * 2 + 1] = softR;
      }
      i++;
    }
    // Upload only the live quads' part of each buffer.
    const up = (kind, data, per) => { const vb = mesh.getVertexBuffer(kind); if (vb) vb.updateDirectly(data.subarray(0, n * 4 * per), 0); };
    up(VertexBuffer.PositionKind, pos, 3); up(VertexBuffer.UVKind, uv, 2); up(VertexBuffer.UV2Kind, uv2, 2); up(VertexBuffer.ColorKind, col, 4); up('blend', bl, 2);
    // Draw only the live quads; a partial sub-mesh keeps its own bounds (the transparent sort reads them).
    const sm = mesh.subMeshes[0], box = new BoundingInfo(Vector3.FromArray(min), Vector3.FromArray(max));
    sm.indexCount = n * 6; sm.verticesCount = n * 4;
    mesh.setBoundingInfo(box); sm.setBoundingInfo(box);
    if (st && st.a > 0) st.d = Math.hypot(st.x / st.a - eye.x, st.y / st.a - eye.y, st.z / st.a - eye.z);
  }

  grow(e, cap) {
    e.cap = cap;
    e.pos = new Float32Array(cap * 12); e.uv = new Float32Array(cap * 8); e.uv2 = new Float32Array(cap * 8); e.col = new Float32Array(cap * 16); e.bl = new Float32Array(cap * 8);
    e.world = new Float64Array(cap * 6); e.dist = new Float64Array(cap); e.order = new Uint32Array(cap); // build()'s per-frame scratch
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) { const b = q * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6); }
    const m = e.mesh;
    m.setVerticesData(VertexBuffer.PositionKind, e.pos, true);
    m.setVerticesData(VertexBuffer.UVKind, e.uv, true);
    m.setVerticesData(VertexBuffer.UV2Kind, e.uv2, true);
    m.setVerticesData(VertexBuffer.ColorKind, e.col, true, 4);
    m.setVerticesData('blend', e.bl, true, 2);
    m.setIndices(idx);
  }

  dropDepth() { if (this.depth) { releaseDepth(this.scene, this.depthCam, this); this.depth = null; this.depthCam = null; } }
  // Textures no emitter uses any more are freed (a script cycling Texture would otherwise keep them all).
  evictTextures() {
    const used = new Set([...this.emitters.values()].map(e => e.texFor).map(id => !id || (/^rbxasset:/.test(id) && !BUILTIN[id]) ? DEFAULT_TEXTURE : id));
    for (const [key, t] of this.textures) if (!used.has(key)) { t.dispose(); this.textures.delete(key); }
  }
  dispose() {
    for (const e of this.emitters.values()) { this.dropLight(e); e.mesh.dispose(); e.mat.dispose(); }
    this.emitters.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.dropDepth();
  }

  // Test and editor hook: how many particles an emitter has alive.
  count(inst) { const e = this.emitters.get(inst); return e ? e.ps.length : 0; }
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
// Rodrigues: d rotated by ang about a unit axis.
function rotate(d, axis, ang) {
  if (!ang) return d;
  const c = Math.cos(ang), s = Math.sin(ang), cr = cross(axis, d), k = axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2];
  return [0, 1, 2].map(i => d[i] * c + cr[i] * s + axis[i] * k * (1 - c));
}
