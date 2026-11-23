// An R15 character from Roblox's own body bundle (PLAN.md, Characters with more joints): the bundle's
// parts through the catalog API and asset delivery (tools/rbxm.mjs reads them), each limb's R15Fixed
// MeshParts (standard joint positions, so one set of animations fits every body; UNSURE which set
// Roblox uses in play), their RigAttachments making Roblox's joints (C0 = Part0's RigAttachment, C1 =
// Part1's), their meshes ("version 2.00"/"3.00" .mesh: positions, normals, UVs, triangles).
// Writes assets/characters/r15/<name>.json (parts, sizes, rest CFrames, attachments, joints) and
// <name>.glb (a node per part at its rest pose under the HumanoidRootPart, turned to face +Z as glTF
// characters do). The head isn't in a bundle (the classic head is a built-in shape): drawn here.
//   node tools/r15.mjs [bundleId=109] [name=robloxboy]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { rbxmTree } from './rbxm.mjs';
import { CF } from '../web/cframe.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [bundle = '109', name = 'robloxboy'] = process.argv.slice(2);
const CACHE = path.join(ROOT, '.cache/r15'), OUT = path.join(ROOT, 'assets/characters/r15');
fs.mkdirSync(CACHE, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

async function get(url, file) {
  const f = path.join(CACHE, file);
  if (!fs.existsSync(f)) {
    for (let i = 0; ; i++) {
      try { const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); break; }
      catch (e) { if (i === 3) throw e; await new Promise(res => setTimeout(res, 1000 * 2 ** i)); }
    }
  }
  let b = fs.readFileSync(f);
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  return b;
}
const asset = id => get(`https://assetdelivery.roblox.com/v1/asset/?id=${id}`, `${id}.bin`);

// A Roblox .mesh, versions 2 and 3 (LOD 0): { positions, normals, uvs, indices }.
function readMesh(b) {
  const head = b.subarray(0, 13).toString();
  const ver = /^version (\d)\.(\d\d)/.exec(head);
  if (!ver || !['2', '3'].includes(ver[1])) throw new Error('mesh ' + head.trim() + ' not read here');
  let i = 13;
  const hsize = b.readUInt16LE(i), vsize = b[i + 2], fsize = b[i + 3];
  let nv, nf, lods = null;
  if (ver[1] === '2') { nv = b.readUInt32LE(i + 4); nf = b.readUInt32LE(i + 8); }
  else { const nl = b.readUInt16LE(i + 6); nv = b.readUInt32LE(i + 8); nf = b.readUInt32LE(i + 12); lods = nl; }
  i += hsize;
  const positions = [], normals = [], uvs = [];
  for (let k = 0; k < nv; k++, i += vsize) {
    positions.push(b.readFloatLE(i), b.readFloatLE(i + 4), b.readFloatLE(i + 8));
    normals.push(b.readFloatLE(i + 12), b.readFloatLE(i + 16), b.readFloatLE(i + 20));
    uvs.push(b.readFloatLE(i + 24), b.readFloatLE(i + 28));
  }
  const faces = [];
  for (let k = 0; k < nf; k++, i += fsize) faces.push(b.readUInt32LE(i), b.readUInt32LE(i + 4), b.readUInt32LE(i + 8));
  let indices = faces;
  if (lods) { const offs = []; for (let k = 0; k < lods; k++) offs.push(b.readUInt32LE(i + 4 * k)); if (offs.length > 1) indices = faces.slice(offs[0] * 3, offs[1] * 3); }
  return { positions, normals, uvs, indices };
}

const cf = v => new CF(v.CFrame);
const flat = c => c.m.map(x => +x.toFixed(6));

const details = JSON.parse((await get(`https://catalog.roblox.com/v1/bundles/${bundle}/details`, `bundle-${bundle}.json`)).toString());
console.log(`${details.name}: ${details.items.filter(x => x.type === 'Asset').length} assets`);
const parts = new Map();
for (const it of details.items.filter(x => x.type === 'Asset')) {
  for (const root of rbxmTree(await asset(it.id))) {
    if (root.Name !== 'R15Fixed') continue;
    for (const p of root.children.filter(c => c.ClassName === 'MeshPart')) {
      const atts = Object.fromEntries(p.children.filter(c => c.ClassName === 'Attachment').map(a => [a.Name, cf(a.props.CFrame)]));
      parts.set(p.Name, { size: p.props.size.Vector3, cframe: cf(p.props.CFrame), atts, meshId: /id=(\d+)/.exec(p.props.MeshId)?.[1] });
    }
  }
}
// The head and the root: R15's HumanoidRootPart (2x2x1) and a classic-sized head (2x1x1).
const UT = parts.get('UpperTorso'), LT = parts.get('LowerTorso');
if (!UT || !LT) throw new Error('no torso in this bundle');
if (!parts.has('Head')) parts.set('Head', { size: [2, 1, 1], cframe: UT.cframe.mul(UT.atts.NeckRigAttachment).mul(new CF([0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])), atts: { NeckRigAttachment: new CF([0, -0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), FaceFrontAttachment: new CF([0, 0, -0.5, 1, 0, 0, 0, 1, 0, 0, 0, 1]), HatAttachment: new CF([0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]) }, meshId: null });
// R15's joints: name, Part0, Part1, the attachment both carry.
const JOINTS = [
  ['Root', 'HumanoidRootPart', 'LowerTorso', 'RootRigAttachment'], ['Waist', 'LowerTorso', 'UpperTorso', 'WaistRigAttachment'], ['Neck', 'UpperTorso', 'Head', 'NeckRigAttachment'],
  ['LeftShoulder', 'UpperTorso', 'LeftUpperArm', 'LeftShoulderRigAttachment'], ['LeftElbow', 'LeftUpperArm', 'LeftLowerArm', 'LeftElbowRigAttachment'], ['LeftWrist', 'LeftLowerArm', 'LeftHand', 'LeftWristRigAttachment'],
  ['RightShoulder', 'UpperTorso', 'RightUpperArm', 'RightShoulderRigAttachment'], ['RightElbow', 'RightUpperArm', 'RightLowerArm', 'RightElbowRigAttachment'], ['RightWrist', 'RightLowerArm', 'RightHand', 'RightWristRigAttachment'],
  ['LeftHip', 'LowerTorso', 'LeftUpperLeg', 'LeftHipRigAttachment'], ['LeftKnee', 'LeftUpperLeg', 'LeftLowerLeg', 'LeftKneeRigAttachment'], ['LeftAnkle', 'LeftLowerLeg', 'LeftFoot', 'LeftAnkleRigAttachment'],
  ['RightHip', 'LowerTorso', 'RightUpperLeg', 'RightHipRigAttachment'], ['RightKnee', 'RightUpperLeg', 'RightLowerLeg', 'RightKneeRigAttachment'], ['RightAnkle', 'RightLowerLeg', 'RightFoot', 'RightAnkleRigAttachment'],
];
// The HumanoidRootPart: where LowerTorso's RootRigAttachment says (its own at its centre), the feet on
// y 0 decided below.
parts.set('HumanoidRootPart', { size: [2, 2, 1], cframe: null, atts: { RootRigAttachment: LT.atts.RootRigAttachment.mul(new CF()) }, meshId: null });
const missing = JOINTS.filter(([, a, b, att]) => !parts.get(a) || !parts.get(b) || !parts.get(a).atts[att] || !parts.get(b).atts[att]);
if (missing.length) throw new Error('missing: ' + missing.map(j => j[0]).join(', '));
// Rest pose from the root: Part1 = Part0 * C0 * C1:Inverse().
const rest = new Map([['HumanoidRootPart', new CF()]]);
parts.get('HumanoidRootPart').atts.RootRigAttachment = new CF(); // the HRP's centre is the root attachment
for (const [, a, b, att] of JOINTS) rest.set(b, rest.get(a).mul(parts.get(a).atts[att]).mul(parts.get(b).atts[att].inverse()));
// Feet on y 0: the lowest point of the feet below the HRP.
let low = Infinity;
for (const f of ['LeftFoot', 'RightFoot']) { const p = parts.get(f), c = rest.get(f); for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) low = Math.min(low, c.mul(new CF([sx * p.size[0] / 2, sy * p.size[1] / 2, sz * p.size[2] / 2, 1, 0, 0, 0, 1, 0, 0, 0, 1])).y); }
const hrpHeight = -low; // HRP centre above the soles

// The classic head (a built-in shape, not an asset): a rounded cylinder about 1.2 studs across and
// tall (a superellipse profile), in the 2x1x1 Head part's frame.
function classicHead() {
  const seg = 32, rings = 24, R = 0.6, H = 0.62, positions = [], normals = [], uvs = [], indices = [];
  const prof = t => { const y = -H + 2 * H * t, r = R * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y) / H, 6)), 1 / 6); return [r, y]; };
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
    const [r, y] = prof(j / rings), a = 2 * Math.PI * i / seg;
    positions.push(r * Math.cos(a), y, r * Math.sin(a)); uvs.push(i / seg, j / rings); normals.push(0, 0, 0);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  // Normals: the faces' about each vertex (pointing out).
  for (let k = 0; k < indices.length; k += 3) {
    const [a, b, c] = [indices[k], indices[k + 1], indices[k + 2]].map(v => v * 3), P = positions;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const x of [a, b, c]) for (let d = 0; d < 3; d++) normals[x + d] += n[d];
  }
  for (let k = 0; k < normals.length; k += 3) {
    const L = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1, out = Math.sign(normals[k] * positions[k] + normals[k + 1] * positions[k + 1] + normals[k + 2] * positions[k + 2]) || 1;
    for (let d = 0; d < 3; d++) normals[k + d] *= out / L;
  }
  // Faces wound outward (as glTF wants: counter-clockwise from outside).
  for (let k = 0; k < indices.length; k += 3) {
    const [a, b, c] = [indices[k], indices[k + 1], indices[k + 2]].map(v => v * 3), P = positions;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * P[a] + n[1] * P[a + 1] + n[2] * P[a + 2] < 0) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  }
  return { positions, normals, uvs, indices };
}

// Meshes, in each part's own frame.
const meshes = {};
meshes.Head = classicHead();
for (const [n, p] of parts) if (p.meshId) { try { meshes[n] = readMesh(await asset(p.meshId)); } catch (e) { console.log(`${n}: ${e.message} (a box instead)`); } }

// JSON.
const json = {
  generated: `tools/r15.mjs ${bundle} ${name}`, bundle: { id: +bundle, name: details.name }, hrpHeight: +hrpHeight.toFixed(4),
  parts: Object.fromEntries([...parts].map(([n, p]) => [n, { size: p.size.map(v => +v.toFixed(4)), rest: flat(rest.get(n)), attachments: Object.fromEntries(Object.entries(p.atts).map(([k, v]) => [k, flat(v)])) }])),
  joints: JOINTS.map(([n, a, b, att]) => ({ name: n, part0: a, part1: b, c0: flat(parts.get(a).atts[att]), c1: flat(parts.get(b).atts[att]) })),
};
fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(json, null, 1));

// GLB: a node per part (named as the part, parented as the joints), its mesh in its frame.
const nodes = [], gMeshes = [], accessors = [], views = [], chunks = [];
let off = 0;
const pushView = (arr, target) => { const b = Buffer.from(arr.buffer); views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? { target } : {}) }); chunks.push(b); off += b.length; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } return views.length - 1; };
const acc = (arr, type, comp, count, extra = {}) => { accessors.push({ bufferView: pushView(arr, comp === 5125 ? 34963 : 34962), componentType: comp, count, type, ...extra }); return accessors.length - 1; };
const index = new Map([...parts.keys()].map((n, i) => [n, i]));
for (const [n] of parts) {
  const parent = JOINTS.find(j => j[2] === n), local = parent ? rest.get(parent[1]).inverse().mul(rest.get(n)) : new CF([0, hrpHeight, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const [x, y, z, w] = local.toQuat();
  // The root turned half about Y: glTF characters face +Z (Roblox's face -Z).
  const rot = parent ? [x, y, z, w] : [0, 1, 0, 0];
  const node = { name: n, translation: [local.x, local.y, local.z], rotation: rot, children: JOINTS.filter(j => j[1] === n).map(j => index.get(j[2])) };
  if (!node.children.length) delete node.children;
  const m = meshes[n];
  if (m && n !== 'HumanoidRootPart') {
    const pos = new Float32Array(m.positions), min = [0, 1, 2].map(k => Math.min(...m.positions.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map(k => Math.max(...m.positions.filter((_, i) => i % 3 === k)));
    const prim = { attributes: { POSITION: acc(pos, 'VEC3', 5126, m.positions.length / 3, { min, max }), NORMAL: acc(new Float32Array(m.normals), 'VEC3', 5126, m.normals.length / 3), TEXCOORD_0: acc(new Float32Array(m.uvs), 'VEC2', 5126, m.uvs.length / 2) }, indices: acc(new Uint32Array(m.indices), 'SCALAR', 5125, m.indices.length), material: 0 };
    gMeshes.push({ name: n, primitives: [prim] }); node.mesh = gMeshes.length - 1;
  }
  nodes.push(node);
}
const gltf = { asset: { version: '2.0', generator: 'claudestudio tools/r15.mjs' }, scene: 0, scenes: [{ nodes: [index.get('HumanoidRootPart')] }], nodes, meshes: gMeshes, accessors, bufferViews: views, buffers: [{ byteLength: off }], materials: [{ name: 'body', pbrMetallicRoughness: { baseColorFactor: [0.64, 0.64, 0.65, 1], metallicFactor: 0, roughnessFactor: 0.8 } }] };
let js = Buffer.from(JSON.stringify(gltf)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const bin = Buffer.concat(chunks), hdr = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
hdr.write('glTF'); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
fs.writeFileSync(path.join(OUT, name + '.glb'), Buffer.concat([hdr, jh, js, bh, bin]));
console.log(`${name}: ${parts.size} parts, ${Object.keys(meshes).length} meshes, ${JOINTS.length} joints, the HumanoidRootPart ${hrpHeight.toFixed(3)} studs above the soles -> assets/characters/r15/${name}.{json,glb}`);
