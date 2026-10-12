// Editable meshes in the studio: a MeshPart whose MeshData holds a mesh from
// the modeling kernel (kernel/, 3DOO's rebuild of Blender's BMesh and its
// edit operations). This file is the bridge:
// - MeshData (JSON) <-> the kernel's mesh;
// - the arrays the renderer draws (n-gons triangulated only here);
// - running a kernel operator as one undoable studio command, keeping the
//   part where it was: Size follows the mesh's new extent (times any scale the
//   part had) and the CFrame moves with the extent's centre, so geometry that
//   wasn't touched stays exactly where it was in the world.
// The mesh is stored in studs, in the part's own space (no scaling: a MeshPart
// sized to its MeshSize draws the mesh as stored).
import { deserializeMesh, serializeMesh } from './kernel/mesh/serialize';
import { createBox, createPrimitive, DEFAULT_PRIMITIVE_PARAMS } from './kernel/primitives/index';
import { execOperator, OPERATORS } from './kernel/commands/operators';
import { buildMeshBuffers } from './meshBuffers';
import { V3 } from '../datamodel.js';
import { CF } from '../cframe.js';

export const MESH_OPERATORS = Object.keys(OPERATORS);
const MIN_EXTENT = 1e-3;

export function loadMesh(data) { return deserializeMesh(typeof data === 'string' ? JSON.parse(data) : data); }
export function saveMesh(mesh) { return JSON.stringify(serializeMesh(mesh)); }

/** A box mesh the size of `size` (a V3), centred on the origin. */
export function boxMesh(size) {
  const m = createBox(1);
  for (const v of m.verts.values()) v.co = { x: v.co.x * size.x, y: v.co.y * size.y, z: v.co.z * size.z };
  m.computeNormals();
  return m;
}
/** One of the kernel's primitives (cube, plane, grid, circle, cylinder, cone, capsule, uvSphere, icoSphere, torus), in studs. */
export function primitiveMesh(kind, params = {}) { const m = createPrimitive(kind, { ...DEFAULT_PRIMITIVE_PARAMS, ...params }); m.computeNormals(); return m; }

/** The mesh's extent: { centre, size } in its own space. */
export function extent(mesh) {
  const { min, max } = mesh.boundingBox();
  return { centre: [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2], size: [max.x - min.x, max.y - min.y, max.z - min.z].map(v => Math.max(v, MIN_EXTENT)) };
}

/** What the renderer draws: triangles with normals and UVs, and which kernel face each came from. */
export function renderArrays(mesh) {
  const b = buildMeshBuffers(mesh).solid;
  // The kernel winds triangles counter-clockwise about the outward normal (three.js's
  // front faces); Babylon's front faces wind the other way (RESEARCH.md §4e): swap each triangle's last two.
  const n = b.positions.length / 3, indices = new Uint32Array(n);
  for (let i = 0; i < n; i += 3) { indices[i] = i; indices[i + 1] = i + 2; indices[i + 2] = i + 1; }
  return { positions: b.positions, normals: b.normals, uvs: b.uvs, indices, faceIds: b.triangleFaceIds };
}

/**
 * Write a mesh into a MeshPart through a history Transaction (tx.set), keeping
 * untouched geometry fixed in the world. `before` is the mesh the part had.
 */
export function writeMesh(tx, part, mesh, before = null) {
  const P = part.props, e1 = extent(mesh), data = saveMesh(mesh);
  const oldMeshSize = P.MeshSize && P.MeshSize.x > 0 ? P.MeshSize : null;
  // The part's scale over its mesh (1 unless it was resized as a whole).
  const k = oldMeshSize ? [P.Size.x / oldMeshSize.x, P.Size.y / oldMeshSize.y, P.Size.z / oldMeshSize.z] : [1, 1, 1];
  const c0 = before ? extent(before).centre : e1.centre;
  const shift = [0, 1, 2].map(i => (e1.centre[i] - c0[i]) * k[i]);
  const cf = P.CFrame, m = cf.m;
  // The shift is in the part's own axes: into the world through its rotation columns.
  const w = [0, 1, 2].map(r => m[3 + r * 3] * shift[0] + m[4 + r * 3] * shift[1] + m[5 + r * 3] * shift[2]);
  tx.set(part, 'MeshData', data);
  tx.set(part, 'MeshSize', new V3(...e1.size));
  tx.set(part, 'Size', new V3(...e1.size.map((s, i) => s * k[i])));
  if (w.some(v => Math.abs(v) > 1e-9)) tx.set(part, 'CFrame', cf.withPosition(cf.x + w[0], cf.y + w[1], cf.z + w[2]));
}

/**
 * Run a kernel operator on a part's mesh as one undoable step. The selection
 * lives in the mesh (as in Blender), so undo brings it back too.
 * Returns the operator's result ({ status, refused? }).
 */
export function runMeshOperator(history, part, name, params = {}, { selectMode = 'face', cursor = { x: 0, y: 0, z: 0 }, live = null } = {}) {
  // `live`: the edit mode's mesh with its current selection (else the stored one's).
  const before = loadMesh(part.props.MeshData), mesh = live ? loadMesh(saveMesh(live)) : loadMesh(part.props.MeshData);
  const result = execOperator({ mesh, selectMode, cursor, objectScale: { x: 1, y: 1, z: 1 } }, name, params);
  if (result.refused) return result;
  history.run(label(name), tx => writeMesh(tx, part, mesh, before));
  return result;
}
const label = name => name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

/** Make a Part (a block) into an editable MeshPart in place of it: same name, CFrame, colour, material and parent. */
export function meshFromPart(tx, dm, part) {
  const P = part.props, mesh = boxMesh(P.Size);
  const mp = tx.create('MeshPart', null, { Name: P.Name, Color: P.Color, Material: P.Material, Anchored: P.Anchored, CanCollide: P.CanCollide, Transparency: P.Transparency, Reflectance: P.Reflectance });
  tx.set(mp, 'CFrame', P.CFrame);
  writeMesh(tx, mp, mesh);
  tx.parent(mp, part.parent);
  tx.parent(part, null);
  return mp;
}

/** A new editable MeshPart from a primitive, at a CFrame. */
export function newMeshPart(tx, parent, kind, cf, params = {}) {
  const mesh = primitiveMesh(kind, params);
  const mp = tx.create('MeshPart', null, { Name: kind[0].toUpperCase() + kind.slice(1), Anchored: true });
  tx.set(mp, 'CFrame', cf || new CF());
  writeMesh(tx, mp, mesh);
  tx.parent(mp, parent);
  return mp;
}
