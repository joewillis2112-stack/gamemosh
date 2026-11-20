// Solid modelling (web/modeling/csg.js) on the kernel's booleans: Roblox's UnionAsync, SubtractAsync,
// IntersectAsync, Studio's Negate and Separate, and place files carrying the results. Volumes and
// extents are worked by hand. Run with vitest (the kernel is TypeScript): npx vitest run test/csg.test.mjs
import { describe, it, expect } from 'vitest';
import { DataModel, V3, C3, methodOf, LuaTable } from '../web/datamodel.js';
import { CF } from '../web/cframe.js';
import { operate, negate, separate, partSolid, faceColors } from '../web/modeling/csg.js';
import { loadMesh, extent, renderArrays } from '../web/modeling/editable.js';
import { savePlace, loadPlace } from '../web/placefile.js';

function volume(mesh) {
  let t = 0;
  for (const f of mesh.faces.values()) { const p = mesh.facePoints(f); for (let i = 1; i < p.length - 1; i++) { const [a, b, c] = [p[0], p[i], p[i + 1]]; t += a.x * (b.y * c.z - c.y * b.z) - a.y * (b.x * c.z - c.x * b.z) + a.z * (b.x * c.y - c.x * b.y); } }
  return t / 6;
}
const closed = mesh => [...mesh.edges.values()].every(e => e.loops.length === 2);
function part(dm, props) {
  const p = dm.create(props.cls || 'Part');
  for (const [k, v] of Object.entries(props)) if (k !== 'cls' && k !== 'at') p.props[k] = v;
  p.props.CFrame = props.at || new CF();
  dm.setParent(p, dm.workspace);
  return p;
}
const at = (x, y, z) => new CF([x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const RED = new C3(1, 0, 0), BLUE = new C3(0, 0, 1);
const meshOf = op => loadMesh(op.props.MeshData);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

describe('UnionAsync', () => {
  it('joins two overlapping blocks: one closed solid of their combined volume, centred on its extent', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4), Color: RED }), b = part(dm, { Size: new V3(4, 4, 4), Color: BLUE, at: at(2, 0, 0) });
    const u = operate(dm, 'union', a, [b]), m = meshOf(u), ex = extent(m);
    expect(u.ClassName).toBe('UnionOperation'); expect(u.Name).toBe('Union'); expect(u.parent).toBe(null);
    expect(closed(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(64 + 64 - 32, 6); // overlap 2x4x4
    expect(ex.size.map(v => +v.toFixed(6))).toEqual([6, 4, 4]);
    expect(ex.centre.every(v => near(v, 0))).toBe(true);
    expect([u.props.CFrame.x, u.props.CFrame.y, u.props.CFrame.z]).toEqual([1, 0, 0]); // the extent's centre in the world
    expect([u.props.Size.x, u.props.MeshSize.x]).toEqual([6, 6]);
    expect(u.props.Color).toBe(RED); // the calling part's look
  });
  it('keeps each part\'s colour on its own faces (unless UsePartColor)', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4), Color: RED }), b = part(dm, { Size: new V3(4, 4, 4), Color: BLUE, at: at(2, 0, 0) });
    const u = operate(dm, 'union', a, [b]), m = meshOf(u), r = renderArrays(m), cols = faceColors(u, m, Array.from(r.faceIds));
    // The face at x = +3 (the blue block's right side) is blue, at x = -3 red.
    const tri = x => { for (let t = 0; t < r.positions.length / 9; t++) { const xs = [0, 1, 2].map(k => r.positions[t * 9 + k * 3]); if (xs.every(v => near(v, x, 1e-6))) return t; } return -1; };
    expect(cols[tri(3)]).toEqual(BLUE); expect(cols[tri(-3)]).toEqual(RED);
    u.props.UsePartColor = true;
    expect(faceColors(u, m, Array.from(r.faceIds))).toBe(null);
  });
  it('cuts with a NegateOperation among the parts (Studio\'s negate, then union)', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4) }), hole = part(dm, { Size: new V3(2, 2, 8) });
    const n = negate(dm, hole);
    expect(n.ClassName).toBe('NegateOperation'); expect(n.Name).toBe(hole.Name);
    const u = operate(dm, 'union', a, [n]);
    expect(volume(meshOf(u))).toBeCloseTo(64 - 2 * 2 * 4, 6);
    expect(closed(meshOf(u))).toBe(true);
  });
  it('takes Balls, Cylinders (along X) and wedges at their Roblox shapes', () => {
    const dm = new DataModel();
    const ball = partSolid(part(dm, { Shape: 'Ball', Size: new V3(4, 6, 8) })).mesh; // a Ball's diameter is its smallest side
    expect(extent(ball).size.map(v => +v.toFixed(3))).toEqual([4, 4, 4]);
    const cyl = partSolid(part(dm, { Shape: 'Cylinder', Size: new V3(6, 2, 4) })).mesh;
    expect(extent(cyl).size.map(v => +v.toFixed(3))).toEqual([6, 2, 2]);
    expect(volume(cyl)).toBeGreaterThan(0); // wound outward
    const w = partSolid(part(dm, { cls: 'WedgePart', Size: new V3(2, 4, 6) })).mesh;
    expect(volume(w)).toBeCloseTo(2 * 4 * 6 / 2, 9);
    expect(closed(w)).toBe(true);
    // The slope rises to the back: at the front (z = -3) the wedge is only at the bottom.
    expect([...w.verts.values()].filter(v => near(v.co.z, -3)).every(v => near(v.co.y, -2))).toBe(true);
  });
  it('turns the parts into the calling part\'s space (a turned tool)', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4) });
    const c = Math.SQRT1_2, b = part(dm, { Size: new V3(8, 2, 2), at: new CF([0, 0, 0, c, -c, 0, c, c, 0, 0, 0, 1]) }); // 45° about Z
    const u = operate(dm, 'subtract', a, [b]);
    const ex = extent(meshOf(u));
    expect(ex.size.map(v => +v.toFixed(4))).toEqual([4, 4, 4]);
    expect(volume(meshOf(u))).toBeLessThan(64 - 4 * 2 * 2 + 1e-6); // a diagonal bar through the block
  });
});

describe('SubtractAsync and IntersectAsync', () => {
  it('subtracts: the part minus every part given', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4) }), b = part(dm, { Size: new V3(4, 4, 4), at: at(2, 0, 0) }), c = part(dm, { Size: new V3(2, 2, 2), at: at(-2, 2, 0) });
    const s = operate(dm, 'subtract', a, [b, c]);
    expect(s.ClassName).toBe('UnionOperation');
    expect(volume(meshOf(s))).toBeCloseTo(32 - 1 * 1 * 2, 6);
  });
  it('fails when nothing is left', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(2, 2, 2) }), b = part(dm, { Size: new V3(4, 4, 4) });
    expect(() => operate(dm, 'subtract', a, [b])).toThrow(/empty/);
  });
  it('intersects: what all of them occupy, as an IntersectOperation', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4) }), b = part(dm, { Size: new V3(4, 4, 4), at: at(2, 0, 0) });
    const i = operate(dm, 'intersect', a, [b]);
    expect(i.ClassName).toBe('IntersectOperation');
    expect(volume(meshOf(i))).toBeCloseTo(32, 6);
    expect(i.props.CFrame.x).toBeCloseTo(1, 6);
  });
  it('refuses MeshParts and Terrain', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4) }), mp = dm.create('MeshPart');
    expect(() => operate(dm, 'union', a, [mp])).toThrow(/MeshPart/);
    expect(() => operate(dm, 'union', a, [dm.workspace.children.find(c => c.ClassName === 'Terrain')])).toThrow(/Terrain/);
  });
});

describe('Separate, unions of unions, and place files', () => {
  it('gives back the parts where they now are, after the union moved', () => {
    const dm = new DataModel(), a = part(dm, { Name: 'A', Size: new V3(4, 4, 4), Color: RED }), b = part(dm, { Name: 'B', Size: new V3(4, 4, 4), at: at(2, 0, 0), Color: BLUE });
    const u = operate(dm, 'union', a, [b]);
    u.props.CFrame = u.props.CFrame.withPosition(11, 5, 0); // moved by 10, 5
    const back = separate(dm, u);
    expect(back.map(p => p.Name)).toEqual(['A', 'B']);
    expect(back.map(p => [p.props.CFrame.x, p.props.CFrame.y])).toEqual([[10, 5], [12, 5]]);
    expect(back[1].props.Color).toEqual(BLUE);
    const n = negate(dm, b), nb = separate(dm, n);
    expect(nb[0].ClassName).toBe('Part'); // a negation separates back into its part
  });
  it('unions a union, keeping both palettes', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(2, 2, 2), Color: RED }), b = part(dm, { Size: new V3(2, 2, 2), at: at(1, 0, 0), Color: BLUE });
    const u = operate(dm, 'union', a, [b]), c = part(dm, { Size: new V3(2, 2, 2), at: at(4, 0, 0), Color: new C3(0, 1, 0) });
    const u2 = operate(dm, 'union', u, [c]);
    expect(volume(meshOf(u2))).toBeCloseTo(8 + 8 - 4 + 8, 6);
    expect(JSON.parse(u2.props.PartColors).length).toBe(3);
  });
  it('a place file brings a union back the same, mesh and colours', () => {
    const dm = new DataModel(), a = part(dm, { Size: new V3(4, 4, 4), Color: RED }), b = part(dm, { Size: new V3(4, 4, 4), at: at(2, 0, 0), Color: BLUE });
    const u = operate(dm, 'union', a, [b]); dm.setParent(u, dm.workspace);
    const file = JSON.parse(JSON.stringify(savePlace(dm))), dm2 = new DataModel(), warn = loadPlace(dm2, file);
    const u2 = dm2.workspace.children.find(c => c.ClassName === 'UnionOperation');
    expect(warn).toEqual([]);
    expect(u2.props.MeshData).toBe(u.props.MeshData); expect(u2.props.PartColors).toBe(u.props.PartColors); expect(u2.props.ChildData).toBe(u.props.ChildData);
    expect(u2.props.Size).toEqual(u.props.Size); expect(u2.props.CFrame.equals(u.props.CFrame)).toBe(true);
  });
});

describe('the script API', () => {
  it('BasePart:UnionAsync yields the union through dm.hooks.csg, with its fidelity arguments', async () => {
    const dm = new DataModel(); dm.hooks.csg = (op, p, list, o) => operate(dm, op, p, list, o);
    let got = null; dm.async = (inst, promise) => promise.then(r => { got = r; return r; });
    const a = part(dm, { Size: new V3(4, 4, 4) }), b = part(dm, { Size: new V3(4, 4, 4), at: at(2, 0, 0) });
    await methodOf('Part', 'UnionAsync')(a, new LuaTable([[1, b]]), 'Box', 'Performance');
    expect(got[0].ClassName).toBe('UnionOperation'); expect(got[0].props.CollisionFidelity).toBe('Box'); expect(got[0].props.RenderFidelity).toBe('Performance');
    await methodOf('Part', 'IntersectAsync')(a, new LuaTable([[1, b]]));
    expect(got[0].ClassName).toBe('IntersectOperation');
  });
});
