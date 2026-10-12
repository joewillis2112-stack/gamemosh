// The studio's side of the modeling kernel (web/modeling/editable.js): a Part
// made editable, the kernel's operators run as undoable studio commands on a
// MeshPart, untouched geometry staying exactly where it was in the world, and
// place files carrying the mesh. Run with vitest (the kernel is TypeScript):
// npx vitest run test/modeling.test.mjs
import { describe, it, expect } from 'vitest';
import { DataModel, V3, C3 } from '../web/datamodel.js';
import { CF } from '../web/cframe.js';
import { History } from '../web/editor/history.js';
import { boxMesh, loadMesh, renderArrays, extent, meshFromPart, runMeshOperator, newMeshPart, saveMesh } from '../web/modeling/editable.js';
import { savePlace, loadPlace } from '../web/placefile.js';

// World-space corners of a MeshPart's mesh (mesh coords are the part's own space, about the extent's centre).
function worldVerts(part) {
  const mesh = loadMesh(part.props.MeshData), { centre } = extent(mesh), m = part.props.CFrame.m;
  const k = [part.props.Size.x / part.props.MeshSize.x, part.props.Size.y / part.props.MeshSize.y, part.props.Size.z / part.props.MeshSize.z];
  return [...mesh.verts.values()].map(v => {
    const l = [(v.co.x - centre[0]) * k[0], (v.co.y - centre[1]) * k[1], (v.co.z - centre[2]) * k[2]];
    return [0, 1, 2].map(r => +(m[r] + m[3 + r * 3] * l[0] + m[4 + r * 3] * l[1] + m[5 + r * 3] * l[2]).toFixed(4));
  });
}
const key = p => p.join(',');
function select(part, pick) { // pick(face centre) -> bool: select those faces in the stored mesh
  const mesh = loadMesh(part.props.MeshData);
  mesh.deselectAll();
  for (const f of mesh.faces.values()) { const c = mesh.faceCenter(f); if (pick(c, f)) f.selected = true; }
  mesh.flushSelection('face');
  part.props.MeshData = saveMesh(mesh);
}
function setup(cf = new CF([3, 5, 7, 1, 0, 0, 0, 1, 0, 0, 0, 1])) {
  const dm = new DataModel(), h = new History(dm);
  const part = dm.create('Part'); part.props.Name = 'Crate'; dm.set(part, 'Size', new V3(4, 1, 2)); dm.set(part, 'CFrame', cf); dm.set(part, 'Color', new C3(1, 0, 0)); dm.setParent(part, dm.workspace);
  const mp = h.run('Edit mesh', tx => meshFromPart(tx, dm, part));
  return { dm, h, part, mp };
}

describe('a Part made editable', () => {
  it('becomes a MeshPart in its place: same name, CFrame, size, colour', () => {
    const { dm, part, mp } = setup();
    expect(mp.ClassName).toBe('MeshPart');
    expect(mp.parent).toBe(dm.workspace);
    expect(part.parent).toBe(null);
    expect(mp.props.Name).toBe('Crate');
    expect([mp.props.Size.x, mp.props.Size.y, mp.props.Size.z]).toEqual([4, 1, 2]);
    expect(mp.props.CFrame.equals(part.props.CFrame)).toBe(true);
    expect(mp.props.Color.r).toBe(1);
    expect(loadMesh(mp.props.MeshData).faces.size).toBe(6);
  });
  it('draws as 12 triangles with normals and UVs', () => {
    const a = renderArrays(boxMesh(new V3(4, 1, 2)));
    expect(a.indices.length).toBe(36);
    expect(a.normals.length).toBe(a.positions.length);
    expect(a.uvs.length / 2).toBe(a.positions.length / 3);
  });
  it("winds every triangle the way Babylon's front faces wind: (b-a)x(c-a) against the outward normal", () => {
    const a = renderArrays(boxMesh(new V3(4, 1, 2))), P = a.positions, N = a.normals, I = a.indices;
    let bad = 0;
    for (let t = 0; t < I.length; t += 3) {
      const [p, q, r] = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const u = q.map((v, k) => v - p[k]), w = r.map((v, k) => v - p[k]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (n[0] * N[I[t] * 3] + n[1] * N[I[t] * 3 + 1] + n[2] * N[I[t] * 3 + 2] >= 0) bad++;
    }
    expect(bad).toBe(0);
  });
  it('undoes back to the Part', () => {
    const { dm, h, part, mp } = setup();
    h.undo();
    expect(part.parent).toBe(dm.workspace);
    expect(mp.parent).toBe(null);
  });
});

describe('kernel operators as studio commands', () => {
  it('extrude the top face by 1: one step; the bottom stays put in the world', () => {
    const { h, mp } = setup();
    const bottom = worldVerts(mp).filter(p => p[1] === 4.5).map(key).sort();
    select(mp, c => c.y > 0.49);
    const steps = h.past.length;
    const r = runMeshOperator(h, mp, 'extrude', { offset: 1 });
    expect(r.status).toMatch(/Extruded 1 face/);
    expect(h.past.length).toBe(steps + 1);
    expect(loadMesh(mp.props.MeshData).faces.size).toBe(10);
    expect([mp.props.Size.x, mp.props.Size.y, mp.props.Size.z]).toEqual([4, 2, 2]);
    expect(mp.props.CFrame.y).toBeCloseTo(5.5, 5);
    const after = worldVerts(mp);
    expect(after.filter(p => p[1] === 4.5).map(key).sort()).toEqual(bottom);
    expect(Math.max(...after.map(p => p[1]))).toBeCloseTo(6.5, 4);
  });
  it('on a turned part the shift goes through its rotation (the bottom still stays put)', () => {
    const a = Math.PI / 2, cf = new CF([0, 10, 0, 1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]); // 90 deg about X: local +Y points along world +Z
    const { h, mp } = setup(cf);
    const before = worldVerts(mp);
    select(mp, c => c.y > 0.49);
    runMeshOperator(h, mp, 'extrude', { offset: 1 });
    const after = worldVerts(mp).map(key);
    const kept = before.filter(p => p[2] < 0).map(key); // the local bottom is the world -Z side
    expect(kept.every(k => after.includes(k))).toBe(true);
    expect(Math.max(...worldVerts(mp).map(p => p[2]))).toBeCloseTo(1.5, 4);
  });
  it('inset, bevel, loop cut and subdivide change the mesh as expected', () => {
    let { h, mp } = setup();
    select(mp, c => c.y > 0.49);
    runMeshOperator(h, mp, 'inset', { thickness: 0.2 });
    expect(loadMesh(mp.props.MeshData).faces.size).toBe(10);
    ({ h, mp } = setup());
    const m = loadMesh(mp.props.MeshData); m.deselectAll();
    const edge = [...m.edges.values()].find(e => e.v0.co.y > 0 && e.v1.co.y > 0); edge.selected = true; edge.v0.selected = edge.v1.selected = true;
    mp.props.MeshData = saveMesh(m);
    runMeshOperator(h, mp, 'bevel', { width: 0.2, segments: 1 }, { selectMode: 'edge' });
    expect(loadMesh(mp.props.MeshData).faces.size).toBe(7);
    ({ h, mp } = setup());
    const m2 = loadMesh(mp.props.MeshData); m2.deselectAll();
    const e2 = [...m2.edges.values()].find(e => Math.abs(e.v0.co.x - e.v1.co.x) > 1); e2.selected = true; e2.v0.selected = e2.v1.selected = true;
    mp.props.MeshData = saveMesh(m2);
    runMeshOperator(h, mp, 'loopCut', { cuts: 1 }, { selectMode: 'edge' });
    expect(loadMesh(mp.props.MeshData).faces.size).toBe(10);
    expect([mp.props.Size.x, mp.props.Size.y, mp.props.Size.z]).toEqual([4, 1, 2]); // a loop cut doesn't change the shape
  });
  it('undo restores the mesh, its size and its CFrame exactly; redo reapplies', () => {
    const { h, mp } = setup();
    select(mp, c => c.y > 0.49);
    const data0 = mp.props.MeshData, cf0 = mp.props.CFrame;
    runMeshOperator(h, mp, 'extrude', { offset: 2 });
    const data1 = mp.props.MeshData;
    h.undo();
    expect(mp.props.MeshData).toBe(data0);
    expect(mp.props.CFrame.equals(cf0)).toBe(true);
    expect(mp.props.Size.y).toBe(1);
    h.redo();
    expect(mp.props.MeshData).toBe(data1);
    expect(mp.props.Size.y).toBe(3);
  });
  it('a refused or empty operation records nothing', () => {
    const { h, mp } = setup();
    loadMesh(mp.props.MeshData);
    const m = loadMesh(mp.props.MeshData); m.deselectAll(); mp.props.MeshData = saveMesh(m);
    const n = h.past.length;
    const r = runMeshOperator(h, mp, 'inset', {});
    expect(r.status).toMatch(/Select faces/);
    expect(h.past.length).toBe(n);
  });
});

describe('place files carry editable meshes', () => {
  it('a MeshPart with MeshData round-trips exactly, and new primitives work', () => {
    const { dm, h, mp } = setup();
    select(mp, c => c.y > 0.49);
    runMeshOperator(h, mp, 'extrude', { offset: 1 });
    h.run('Torus', tx => newMeshPart(tx, dm.workspace, 'torus', new CF([0, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])));
    const text = JSON.stringify(savePlace(dm));
    const dm2 = new DataModel();
    expect(loadPlace(dm2, JSON.parse(text))).toEqual([]);
    expect(JSON.stringify(savePlace(dm2))).toBe(text);
    const torus = dm2.workspace.children.find(c => c.props.Name === 'Torus');
    expect(loadMesh(torus.props.MeshData).faces.size).toBeGreaterThan(100);
  });
});
