// Solid modelling (Roblox's Union, Negate, Intersect and Separate), on the modeling kernel's
// booleans (kernel/ops/boolean.ts, 3DOO's). A PartOperation (UnionOperation, NegateOperation,
// IntersectOperation) is drawn and collided like an editable MeshPart: its MeshData is the
// result in studs, in its own space, about its extent's centre, and MeshSize is that extent
// (Size stretches it, as Roblox's unions stretch). Beyond Roblox's visible properties it keeps:
//   - PartColors: the colour of each source part, indexed by the kernel faces' materialIndex
//     (a union shows each part's own Color unless UsePartColor is set, as in Roblox);
//   - ChildData: the source parts (as place-file nodes) and where they sat relative to the
//     operation, so Separate gives them back (Studio's Separate), negated parts included.
// Roblox's rules (create.roblox.com/docs/reference/engine/classes/BasePart):
//   UnionAsync: the part plus the parts' geometry; parts that are NegateOperations cut instead.
//   SubtractAsync: the part minus the parts' geometry; an empty result fails.
//   IntersectAsync: what the part and every one of the parts all occupy (an IntersectOperation).
//   Only Parts (and unions) take part; Terrain and MeshParts don't. The result has no Parent;
//   it takes the calling part's Color, Material, Reflectance, Transparency, CanCollide, Anchored.
import { booleanMesh } from './kernel/ops/boolean';
import { BMesh } from './kernel/mesh';
import { vec3 } from './kernel/math';
import { createUVSphere, createCylinder } from './kernel/primitives/index';
import { loadMesh, saveMesh, extent, boxMesh } from './editable.js';
import { V3, C3, isA } from '../datamodel.js';
import { CF } from '../cframe.js';
import { saveInstance, loadInstance } from '../placefile.js';

export const OPERATIONS = ['UnionOperation', 'NegateOperation', 'IntersectOperation'];
const INHERITED = ['Color', 'Material', 'Reflectance', 'Transparency', 'CanCollide', 'Anchored'];

// ---- CFrame helpers (CF.m: position, then the rotation matrix row by row)
const toWorld = (cf, l) => { const m = cf.m; return [0, 1, 2].map(r => m[r] + m[3 + r * 3] * l[0] + m[4 + r * 3] * l[1] + m[5 + r * 3] * l[2]); };
const toLocal = (cf, w) => { const m = cf.m, d = [w[0] - m[0], w[1] - m[1], w[2] - m[2]]; return [0, 1, 2].map(c => m[3 + c] * d[0] + m[6 + c] * d[1] + m[9 + c] * d[2]); };
const shifted = (cf, l) => cf.withPosition(...toWorld(cf, l));

/** Whether a part can take part in a solid-modelling operation (Parts, WedgeParts and operations; not MeshParts or Terrain). */
export function canOperate(p) { return !!p && (p.ClassName === 'Part' || p.ClassName === 'WedgePart' || p.ClassName === 'SpawnLocation' || OPERATIONS.includes(p.ClassName)); }

/** A part's solid in its own space, in studs, centred on it: { mesh (BMesh), palette (C3[]) }. Every face's materialIndex indexes the palette. */
export function partSolid(p) {
  const P = p.props, S = P.Size;
  if (OPERATIONS.includes(p.ClassName)) {
    const mesh = loadMesh(P.MeshData), ex = extent(mesh), k = [S.x / ex.size[0], S.y / ex.size[1], S.z / ex.size[2]];
    for (const v of mesh.verts.values()) v.co = vec3((v.co.x - ex.centre[0]) * k[0], (v.co.y - ex.centre[1]) * k[1], (v.co.z - ex.centre[2]) * k[2]);
    mesh.computeNormals();
    const palette = colorsOf(p);
    if (P.UsePartColor) for (const f of mesh.faces.values()) f.materialIndex = 0;
    return { mesh, palette: P.UsePartColor ? [P.Color] : palette };
  }
  let mesh;
  const shape = p.ClassName === 'WedgePart' ? 'Wedge' : P.Shape || 'Block';
  if (shape === 'Ball') { const d = Math.min(S.x, S.y, S.z); mesh = createUVSphere(d / 2, 24, 12); }
  else if (shape === 'Cylinder') { // Roblox's cylinder lies along X; the kernel's stands along Y: turn it a quarter about Z
    mesh = createCylinder(Math.min(S.y, S.z) / 2, S.x, 32, true);
    for (const v of mesh.verts.values()) v.co = vec3(v.co.y, -v.co.x, v.co.z);
  } else if (shape === 'Wedge') mesh = wedgeSolid(S);
  else mesh = boxMesh(S);
  for (const f of mesh.faces.values()) f.materialIndex = 0;
  mesh.computeNormals();
  return { mesh, palette: [P.Color] };
}
// A wedge: the slope faces front (-Z) and up, rising to the back top edge. Faces wound
// counter-clockwise about their outward normal (the kernel's convention).
function wedgeSolid(S) {
  const m = new BMesh(), x = S.x / 2, y = S.y / 2, z = S.z / 2;
  const v = [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [x, y, z], [-x, y, z]].map(p => m.addVert(vec3(...p)));
  const faces = [[0, 1, 2, 3], [3, 2, 4, 5], [0, 5, 4, 1], [1, 4, 2], [0, 3, 5]];
  const ctr = [0, -y / 3, z / 3]; // inside
  for (const f of faces) {
    const p = f.map(i => v[i].co), u = [p[1].x - p[0].x, p[1].y - p[0].y, p[1].z - p[0].z], w = [p[2].x - p[0].x, p[2].y - p[0].y, p[2].z - p[0].z];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const g = [0, 1, 2].map(k => p.reduce((s, q) => s + [q.x, q.y, q.z][k], 0) / p.length - ctr[k]);
    m.addFace((n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0 ? [...f].reverse() : f).map(i => v[i]));
  }
  return m;
}
function colorsOf(p) {
  try { const a = JSON.parse(p.props.PartColors || '[]'); if (a.length) return a.map(c => new C3(c[0], c[1], c[2])); } catch { /* fall through */ }
  return [p.props.Color];
}

/**
 * Roblox's BasePart:UnionAsync / SubtractAsync / IntersectAsync. `op`: 'union' | 'subtract' | 'intersect'.
 * Returns the new operation (no Parent), or throws Roblox-style errors.
 */
export function operate(dm, op, part, others, { collisionFidelity = 'Default', renderFidelity = 'Automatic' } = {}) {
  const tools = others.filter(o => o && o !== part);
  if (!canOperate(part)) throw new Error(`${part ? part.ClassName : 'nil'} can't take part in solid modelling: only Parts and unions can`);
  for (const t of tools) if (!canOperate(t)) throw new Error(`${t.ClassName} ${t.Name} can't take part in solid modelling: only Parts and unions can (not Terrain or MeshParts)`);
  const base = partSolid(part), palette = [...base.palette], cf = part.props.CFrame;
  let mesh = base.mesh;
  const run = (kind, t) => {
    const s = partSolid(t), off = palette.length, tcf = t.props.CFrame;
    palette.push(...s.palette);
    mesh = booleanMesh(kind, mesh, s.mesh, q => { const l = toLocal(cf, toWorld(tcf, [q.x, q.y, q.z])); return vec3(l[0], l[1], l[2]); }, f => off + f.materialIndex);
  };
  if (op === 'union') {
    for (const t of tools) if (t.ClassName !== 'NegateOperation') run('union', t);
    for (const t of tools) if (t.ClassName === 'NegateOperation') run('difference', t);
  } else if (op === 'subtract') for (const t of tools) run('difference', t);
  else if (op === 'intersect') for (const t of tools) run('intersect', t);
  else throw new Error('unknown operation ' + op);
  if (!mesh.faces.size) throw new Error(op === 'intersect' ? 'The parts do not overlap: the intersection is empty' : 'The operation would leave nothing: the result is empty');
  return makeOperation(dm, op === 'intersect' ? 'IntersectOperation' : 'UnionOperation', part, mesh, palette, [part, ...tools], { collisionFidelity, renderFidelity });
}

/** A new operation instance (no Parent) holding `mesh` (in `from`'s space), its colours and its source parts. */
function makeOperation(dm, cls, from, mesh, palette, sources, { collisionFidelity = 'Default', renderFidelity = 'Automatic' } = {}) {
  const ex = extent(mesh), c = ex.centre;
  for (const v of mesh.verts.values()) v.co = vec3(v.co.x - c[0], v.co.y - c[1], v.co.z - c[2]);
  mesh.computeNormals();
  const out = dm.create(cls), P = out.props, cf = shifted(from.props.CFrame, c);
  for (const k of INHERITED) P[k] = from.props[k];
  P.Name = { UnionOperation: 'Union', IntersectOperation: 'Intersect', NegateOperation: from.props.Name }[cls];
  P.CollisionFidelity = collisionFidelity; P.RenderFidelity = renderFidelity;
  P.MeshData = saveMesh(mesh); P.MeshSize = new V3(...ex.size); P.Size = new V3(...ex.size);
  P.CFrame = cf; P.Position = new V3(cf.x, cf.y, cf.z); P.Orientation = new V3(...cf.toOrientation());
  P.PartColors = JSON.stringify(palette.map(k => [k.r, k.g, k.b]));
  P.ChildData = JSON.stringify(sources.map(s => ({ node: saveInstance(s), at: [...cf.inverse().mul(s.props.CFrame).m] })));
  P.TriangleCount = triangleCount(mesh);
  return out;
}
const triangleCount = mesh => { let n = 0; for (const f of mesh.faces.values()) n += Math.max(0, mesh.facePoints(f).length - 2); return n; };

/** Studio's Negate: a part becomes a NegateOperation (same place, geometry and look), which a union cuts with. */
export function negate(dm, part) {
  if (!canOperate(part) || part.ClassName === 'NegateOperation') throw new Error('only a Part or a union can be negated');
  const s = partSolid(part);
  return makeOperation(dm, 'NegateOperation', part, s.mesh, s.palette, [part]);
}

/** Studio's Separate: the parts an operation was made from, where they now sit (with the operation's moves). Unparented. */
export function separate(dm, op) {
  if (!OPERATIONS.includes(op.ClassName)) throw new Error('only a union, negation or intersection can be separated');
  let list;
  try { list = JSON.parse(op.props.ChildData || '[]'); } catch { list = []; }
  if (!list.length) throw new Error(`${op.Name} has no parts to separate into`);
  return list.map(({ node, at }) => {
    const p = loadInstance(dm, node), cf = op.props.CFrame.mul(new CF(at));
    p.props.CFrame = cf; p.props.Position = new V3(cf.x, cf.y, cf.z); p.props.Orientation = new V3(...cf.toOrientation());
    return p;
  });
}

/** Per-triangle colours for drawing (renderArrays' faceIds -> the kernel face's materialIndex -> PartColors), or null. */
export function faceColors(inst, mesh, faceIds) {
  if (inst.props.UsePartColor || !isA(inst.ClassName, 'PartOperation')) return null;
  const pal = colorsOf(inst), byId = new Map([...mesh.faces.values()].map(f => [f.id, f.materialIndex]));
  return faceIds.map(id => pal[Math.min(byId.get(id) ?? 0, pal.length - 1)] || inst.props.Color);
}
