// Roblox's default R15 animations (the Animate script's), from asset delivery through tools/rbxm.mjs,
// as assets/characters/r15/anims/<clip>.json: { name, loop, priority, length, keyframes: [{ t, name,
// poses: [[joint, [x, y, z, qx, qy, qz, qw], weight, easingStyle, easingDirection]] }] }, the shape
// web/runtime/r15clips.js turns back into KeyframeSequences for animation.js. Poses of weight 0 (the
// editor's hierarchy placeholders) are left out.
//   node tools/r15anims.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { rbxmTree } from './rbxm.mjs';
import { CF } from '../web/cframe.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets/characters/r15/anims'), CACHE = path.join(ROOT, '.cache/r15');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });
// The Animate script's R15 animation ids (each checked by its KeyframeSequence's name and length,
// 2026-11-24; walk's sequence is named "NewRun" and run's "ImportedAnimation": the ids are the
// Animate script's, their strides about the same).
export const R15_ANIMS = { idle: 507766388, idle2: 507766666, walk: 507777826, run: 507767714, jump: 507765000, fall: 507767968, climb: 507765644, swim: 507784897, swimidle: 507785072, sit: 2506281703, toolnone: 507768375 };
const STYLE = ['Linear', 'Constant', 'Elastic', 'Cubic', 'Bounce', 'CubicV2'], DIR = ['In', 'Out', 'InOut'];
const PRIORITY = { 0: 'Idle', 1: 'Movement', 2: 'Action', 3: 'Action2', 4: 'Action3', 5: 'Action4', 1000: 'Core' };

async function asset(id) {
  const f = path.join(CACHE, `${id}.bin`);
  if (!fs.existsSync(f)) { const r = await fetch(`https://assetdelivery.roblox.com/v1/asset/?id=${id}`); if (!r.ok) throw new Error(r.status + ' ' + id); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  let b = fs.readFileSync(f); if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b); return b;
}

for (const [clip, id] of Object.entries(R15_ANIMS)) {
  const ks = rbxmTree(await asset(id)).find(x => x.ClassName === 'KeyframeSequence');
  const keyframes = ks.children.filter(c => c.ClassName === 'Keyframe').sort((a, b) => a.props.Time - b.props.Time).map(k => {
    const poses = [];
    const walk = n => { for (const c of n.children) if (c.ClassName === 'Pose') { if ((c.props.Weight ?? 1) > 0) { const f = new CF(c.props.CFrame.CFrame), q = f.toQuat(); poses.push([c.Name, [f.x, f.y, f.z, ...q].map(v => +v.toFixed(4)), c.props.Weight ?? 1, STYLE[c.props.EasingStyle?.Enum ?? 0], DIR[c.props.EasingDirection?.Enum ?? 0]]); } walk(c); } };
    walk(k);
    return { t: +k.props.Time.toFixed(5), name: k.Name === 'Keyframe' ? undefined : k.Name, poses };
  });
  // Fewer keys: a linear pose that its neighbours' interpolation reproduces (within 0.001 studs and
  // 0.1 degrees) goes (the dense idles are resampled at 60 Hz).
  const tracks = new Map();
  keyframes.forEach((k, ki) => k.poses.forEach((p, pi) => { if (!tracks.has(p[0])) tracks.set(p[0], []); tracks.get(p[0]).push({ ki, pi, t: k.t, v: p[1], ease: p[3] }); }));
  const drop = new Set();
  for (const keys of tracks.values()) {
    let a = 0;
    for (let i = 1; i < keys.length - 1; i++) {
      const A = keys[a], B = keys[i], C = keys[i + 1];
      if (B.ease !== 'Linear' || A.ease !== 'Linear') { a = i; continue; }
      const u = (B.t - A.t) / (C.t - A.t);
      const lerp = A.v.slice(0, 3).map((x, k) => x + (C.v[k] - x) * u);
      let dot = A.v.slice(3).reduce((s, x, k) => s + x * C.v[3 + k], 0); const sg = dot < 0 ? -1 : 1;
      const q = A.v.slice(3).map((x, k) => x * (1 - u) + sg * C.v[3 + k] * u), L = Math.hypot(...q);
      const qb = B.v.slice(3), d = Math.abs(q.reduce((s, x, k) => s + x / L * qb[k], 0));
      const ok = Math.hypot(...lerp.map((x, k) => x - B.v[k])) < 1e-3 && 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI < 0.1;
      if (ok) drop.add(B.ki + ':' + B.pi); else a = i;
    }
  }
  for (const k of keyframes) k.poses = k.poses.filter((p, pi) => !drop.has(keyframes.indexOf(k) + ':' + pi));
  const length = Math.max(...keyframes.map(k => k.t));
  fs.writeFileSync(path.join(OUT, clip + '.json'), JSON.stringify({ name: clip, source: { assetId: id, sequence: ks.Name }, loop: !!ks.props.Loop, priority: PRIORITY[ks.props.Priority?.Enum] || 'Core', length, keyframes }));
  console.log(`${clip}: "${ks.Name}" ${keyframes.length} keyframes, ${length.toFixed(3)} s, loop ${!!ks.props.Loop}`);
}
