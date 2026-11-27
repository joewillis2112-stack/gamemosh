// Smooth terrain without the renderer (web/terrain/): the Fill* shapes, the
// chunk mesher (SculptGL's SurfaceNets), and saving. A ball across chunk
// borders meshes watertight with no doubled faces; surfaces lie where the
// shapes put them; triangles wind as Babylon's front faces; volumes match;
// materials colour the surface; water meshes apart; save/load is exact.
// Run: node test/terrain.test.mjs
import { Voxels, CELL, CHUNK, shapes, boxBounds, MATERIAL_COLORS } from '../web/terrain/voxels.js';
import { meshChunk } from '../web/terrain/mesher.js';
import { dab, restore } from '../web/terrain/brush.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const cf = (x, y, z, r = I) => [x, y, z, ...r];

// Every chunk's mesh of one kind, joined (vertices shared across chunks by position).
function meshAll(vox, kind = 'solid') {
  const keys = new Set();
  for (const k of vox.chunks.keys()) { const [x, y, z] = k.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) keys.add([x + dx, y + dy, z + dz].join()); }
  const P = [], Nn = [], C = [], T = [], at = new Map();
  for (const k of keys) {
    const m = meshChunk(vox, ...k.split(',').map(Number))[kind];
    if (!m) continue;
    const map = [];
    for (let v = 0; v < m.positions.length / 3; v++) {
      const p = [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]], id = p.map(x => x.toFixed(4)).join();
      if (!at.has(id)) { at.set(id, P.length / 3); P.push(...p); Nn.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]); C.push(m.colors[v * 4], m.colors[v * 4 + 1], m.colors[v * 4 + 2]); }
      map.push(at.get(id));
    }
    for (let i = 0; i < m.indices.length; i++) T.push(map[m.indices[i]]);
  }
  return { P, N: Nn, C, T };
}
function topology({ T }) {
  const edges = new Map(), tris = new Set();
  let dup = 0;
  for (let t = 0; t < T.length; t += 3) {
    const k = [T[t], T[t + 1], T[t + 2]].sort((a, b) => a - b).join();
    if (tris.has(k)) dup++; tris.add(k);
    for (const [a, b] of [[T[t], T[t + 1]], [T[t + 1], T[t + 2]], [T[t + 2], T[t]]]) { const e = a < b ? a + ',' + b : b + ',' + a; edges.set(e, (edges.get(e) || 0) + 1); }
  }
  // Closed: every edge has an even number of triangles (surface nets can join two sheets at one edge: 4, non-manifold but still closed).
  const open = [...edges.values()].filter(n => n % 2).length, pinched = [...edges.values()].filter(n => n > 2).length;
  return { open, dup, pinched, tris: T.length / 3 };
}
// Signed volume (Babylon winding: front faces clockwise about the outward normal, so negate).
function volume({ P, T }) {
  let v = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t], T[t + 1], T[t + 2]].map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return -v / 6;
}
function windingBad({ P, N: Nn, T }) {
  let bad = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
    const u = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if ([0, 1, 2].reduce((s, k) => s + n[k] * (Nn[a * 3 + k] + Nn[b * 3 + k] + Nn[c * 3 + k]), 0) >= 0) bad++;
  }
  return bad;
}

// ---- a ball across chunk borders (chunks are 64 studs: the ball straddles x = 64 and z = 64)
{
  const vox = new Voxels(), c = { x: 64, y: 30, z: 64 }, r = 14;
  vox.fill(shapes.ball(c, r), [c.x - r, c.y - r, c.z - r], [c.x + r, c.y + r, c.z + r], 'Rock');
  const m = meshAll(vox), topo = topology(m);
  check(topo.open === 0 && topo.dup === 0 && topo.tris > 100, `a ball across four chunks meshes watertight, no doubled faces (${topo.tris} triangles, ${topo.open} open edges, ${topo.dup} doubled)`);
  let worst = 0, inward = 0;
  for (let v = 0; v < m.P.length / 3; v++) {
    const d = [m.P[v * 3] - c.x, m.P[v * 3 + 1] - c.y, m.P[v * 3 + 2] - c.z], len = Math.hypot(...d);
    worst = Math.max(worst, Math.abs(len - r));
    if ((d[0] * m.N[v * 3] + d[1] * m.N[v * 3 + 1] + d[2] * m.N[v * 3 + 2]) / len < 0.9) inward++;
  }
  check(worst < 0.5, `its surface lies on the sphere (worst ${worst.toFixed(3)} studs off radius ${r}, cells ${CELL} studs)`);
  check(inward === 0, `normals point out of the ball (${inward} vertices more than ~25° off)`);
  check(windingBad(m) === 0, "every triangle winds as Babylon's front faces (cross product against the outward normal)");
  const vol = volume(m), want = 4 / 3 * Math.PI * r ** 3;
  // Flat faces between vertices 4 studs apart are chords: a small ball comes out smaller (the loss falls as 1/r).
  check(Math.abs(vol / want - 1) < 0.11, `its volume, at 4-stud cells (${vol.toFixed(0)} vs ${want.toFixed(0)}, ${((vol / want - 1) * 100).toFixed(2)}%)`);
  const big = new Voxels(), R = 40, bc = { x: 10, y: 50, z: 10 };
  big.fill(shapes.ball(bc, R), [bc.x - R, bc.y - R, bc.z - R], [bc.x + R, bc.y + R, bc.z + R], 'Rock');
  const bv = volume(meshAll(big)), bw = 4 / 3 * Math.PI * R ** 3;
  check(Math.abs(bv / bw - 1) < 0.02, `a ball of radius 40 comes within 2% of its volume (${((bv / bw - 1) * 100).toFixed(2)}%)`);
  const rgb = MATERIAL_COLORS.Rock.map(v => v / 255);
  check(m.C.every((v, i) => Math.abs(v - rgb[i % 3]) < 1e-6), 'every vertex has Rock\'s colour');

  // Carve a ball of Air out of its side: still closed, smaller.
  const cut = { x: c.x + r, y: c.y, z: c.z }, cr = 8;
  const before = vox.count();
  vox.fill(shapes.ball(cut, cr), [cut.x - cr, cut.y - cr, cut.z - cr], [cut.x + cr, cut.y + cr, cut.z + cr], 'Air');
  const m2 = meshAll(vox), t2 = topology(m2), v2 = volume(m2);
  check(t2.open === 0 && t2.dup === 0 && v2 < vol * 0.97 && vox.count() < before, `Air carves a bite: still closed, volume ${vol.toFixed(0)} -> ${v2.toFixed(0)}, cells ${before} -> ${vox.count()}`);
}

// ---- a block: its top exactly where the block's top is; grass on top
{
  const vox = new Voxels();
  const size = { x: 40, y: 8, z: 40 }, m = cf(30, 4, 30), b = boxBounds(m, size);
  vox.fill(shapes.block(m, size), b.min, b.max, 'Grass');
  const mesh = meshAll(vox), tops = [];
  for (let v = 0; v < mesh.P.length / 3; v++) if (mesh.N[v * 3 + 1] > 0.99 && Math.abs(mesh.P[v * 3] - 30) < 16 && Math.abs(mesh.P[v * 3 + 2] - 30) < 16) tops.push(mesh.P[v * 3 + 1]); // away from the bevelled rim
  // Occupancy is stored in 8 bits (0.5 is 128/255): a surface can sit up to ~0.008 studs off.
  check(tops.length > 30 && tops.every(y => Math.abs(y - 8) < 0.008), `FillBlock's flat top meshes at y 8, to the 8-bit occupancy step (${tops.length} up-facing vertices, ${Math.min(...tops).toFixed(4)}..${Math.max(...tops).toFixed(4)})`);
  // Edges bevel by about a cell (surface nets): a 40-stud cube loses ~2%.
  const cube = new Voxels(), cm = cf(30, 20, 30), cbb = boxBounds(cm, { x: 40, y: 40, z: 40 });
  cube.fill(shapes.block(cm, { x: 40, y: 40, z: 40 }), cbb.min, cbb.max, 'Grass');
  const cvol = volume(meshAll(cube));
  check(Math.abs(cvol / 40 ** 3 - 1) < 0.03, `a 40-stud cube's volume, edges bevelled by the cells (${((cvol / 40 ** 3 - 1) * 100).toFixed(2)}%)`);
  // A turned block (45° about Y): closed, and turned (its corner reaches out along X, not its face).
  const a = Math.PI / 4, R = [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  const vox2 = new Voxels(), m2 = cf(10, 20, 10, R), s2 = { x: 32, y: 24, z: 24 }, b2 = boxBounds(m2, s2);
  vox2.fill(shapes.block(m2, s2), b2.min, b2.max, 'Slate');
  const mt = meshAll(vox2), t = topology(mt), v2 = volume(mt), maxX = Math.max(...mt.P.filter((_, i) => i % 3 === 0));
  // Turned the right way: CFrame.Angles(0, pi/4, 0) points the long (X) axis along (+X, -Z). The cell
  // centred 11.3 studs along it is full; its mirror image across the X axis is only partly filled.
  check(vox2.get(4, 5, 0).occ === 1 && vox2.get(4, 5, 4).occ < 1, `the turn is +45° about Y, not -45° (cells ${vox2.get(4, 5, 0).occ.toFixed(2)} and ${vox2.get(4, 5, 4).occ.toFixed(2)})`);
  check(t.open === 0 && Math.abs(v2 / (32 * 24 * 24) - 1) < 0.1 && maxX > 10 + 17, `a block turned 45° meshes closed (volume ${((v2 / (32 * 24 * 24) - 1) * 100).toFixed(2)}%), its corner reaching x ${maxX.toFixed(1)} (unturned: ${10 + 16})`);
}

// ---- cylinder and wedge
{
  const vox = new Voxels(), m = cf(0, 20, 0);
  vox.fill(shapes.cylinder(m, 24, 20), [-20, 8, -20], [20, 32, 20], 'Sand');
  const v = volume(meshAll(vox)), want = Math.PI * 400 * 24;
  // Along Y: a cell 14 studs out along X is solid (inside radius 20), one 14 studs above the centre is empty (above its half-height 12). Along X it would be the other way round.
  check(Math.abs(v / want - 1) < 0.06 && vox.get(3, 4, 0).occ === 1 && vox.get(0, 8, 0).occ === 0, `FillCylinder stands along the CFrame's Y (radius 20 across X, 24 tall), volume ${((v / want - 1) * 100).toFixed(2)}%`);
  const w = new Voxels(), wm = cf(0, 12, 0), size = { x: 24, y: 24, z: 48 }, wb = boxBounds(wm, size);
  w.fill(shapes.wedge(wm, size), wb.min, wb.max, 'Ground');
  const wv = volume(meshAll(w));
  check(Math.abs(wv / (24 * 24 * 48 / 2) - 1) < 0.11, `FillWedge is half its box (${((wv / (24 * 24 * 48 / 2) - 1) * 100).toFixed(2)}%)`);
  // Cells (index = studs / 4): up at y 18-22 (cell 4), at the back z 16-20 (cell 4) it's full; the same height at the front (z -20, cell -5) is empty.
  check(w.get(0, 4, 4).occ === 1 && w.get(0, 4, -5).occ === 0, 'the wedge is tall at the back (+Z) and low at the front (-Z), as a WedgePart');
}

// ---- water meshes apart; save and load
{
  const vox = new Voxels();
  vox.fill(shapes.block(cf(0, 2, 0), { x: 24, y: 4, z: 24 }), [-12, 0, -12], [12, 4, 12], 'Basalt');
  vox.fill(shapes.block(cf(0, 8, 0), { x: 24, y: 8, z: 24 }), [-12, 4, -12], [12, 12, 12], 'Water');
  const water = meshAll(vox, 'water'), solid = meshAll(vox, 'solid');
  check(water.T.length > 0 && solid.T.length > 0 && Math.max(...solid.P.filter((_, i) => i % 3 === 1)) <= 4 + 1e-3, `water meshes apart from ground (solid top ${Math.max(...solid.P.filter((_, i) => i % 3 === 1)).toFixed(2)}, water ${water.T.length / 3} triangles)`);
  const text = JSON.stringify(vox.save()), back = new Voxels();
  back.load(JSON.parse(text));
  let same = true;
  for (let x = -5; x < 5; x++) for (let y = -1; y < 5; y++) for (let z = -5; z < 5; z++) { const a = vox.get(x, y, z), b = back.get(x, y, z); if (a.occ !== b.occ || a.mat !== b.mat) same = false; }
  const m1 = meshChunk(vox, 0, 0, 0), m2 = meshChunk(back, 0, 0, 0);
  check(same && JSON.stringify([...m1.solid.positions]) === JSON.stringify([...m2.solid.positions]) && JSON.stringify(back.save()) === text, `save/load is exact (${text.length} bytes for ${vox.count()} cells)`);
  const dirty = (back.take(), back.set(CHUNK - 1, 0, 0, 1, 2), back.take().map(k => k.join()).sort());
  check(dirty.includes('0,0,0') && dirty.includes('1,0,0') && dirty.includes('0,-1,0') && !dirty.includes('-1,0,0'), `a cell on a chunk's edge marks the neighbours that sample it (${dirty.join(' ')})`);
  back.take(); back.set(0, 5, 5, 1, 2);
  const low = back.take().map(k => k.join()).sort();
  check(low.join(' ') === '-1,0,0 0,0,0', `a cell on a chunk's low edge marks the chunk below it too (${low.join(' ')})`);
}

// ---- the editor's brushes, and undoing a stroke exactly
{
  const vox = new Voxels();
  vox.fill(shapes.block(cf(0, 4, 0), { x: 64, y: 8, z: 64 }), [-32, 0, -32], [32, 8, 32], 'Grass'); // flat ground, top y 8
  const start = JSON.stringify(vox.save()), stroke = [];
  const top = (x, z) => { let h = 0; for (let y = 0; y < 12; y++) h += vox.occ(x, y, z); return h * CELL; }; // a column's filled height above y 0 (where the ground starts)
  stroke.push(...dab(vox, 'add', { x: 2, y: 8, z: 2 }, 6, { material: 'Rock' }));
  check(top(0, 0) > 8 + 3 && vox.get(0, 3, 0).mat === 8, `Add raises a mound of Rock on the ground (column top ${top(0, 0).toFixed(1)} from 8)`);
  stroke.push(...dab(vox, 'subtract', { x: 22, y: 8, z: 22 }, 6));
  check(top(5, 5) < 8 - 3, `Subtract digs a pit (column top ${top(5, 5).toFixed(1)} from 8)`);
  const before = vox.get(-5, 1, -5);
  stroke.push(...dab(vox, 'paint', { x: -18, y: 6, z: -18 }, 6, { material: 'Snow' }));
  const after = vox.get(-5, 1, -5);
  check(after.mat === 10 && after.occ === before.occ, `Paint changes the material only (Grass -> ${after.mat === 10 ? 'Snow' : after.mat}, occupancy ${before.occ} -> ${after.occ})`);
  const lumpy = top(0, 0);
  for (let i = 0; i < 6; i++) stroke.push(...dab(vox, 'smooth', { x: 2, y: 12, z: 2 }, 10, { strength: 1 }));
  check(top(0, 0) < lumpy - 0.5, `Smooth wears the mound down (${lumpy.toFixed(1)} -> ${top(0, 0).toFixed(1)})`);
  for (let i = 0; i < 4; i++) stroke.push(...dab(vox, 'flatten', { x: 2, y: 14, z: 2 }, 16, { planeY: 8 }));
  check(Math.abs(top(0, 0) - 8) < 0.6 && Math.abs(top(1, 1) - 8) < 0.6, `Flatten levels it to the plane (${top(0, 0).toFixed(2)}, ${top(1, 1).toFixed(2)} vs 8)`);
  const end = JSON.stringify(vox.save());
  restore(vox, stroke, 'before');
  const undone = JSON.stringify(vox.save());
  restore(vox, stroke, 'after');
  check(undone === start && JSON.stringify(vox.save()) === end, `a stroke of ${stroke.length} cell changes undoes and redoes exactly`);
}

// Rays against the surface as drawn (where the occupancy crosses 0.5): Voxels.raycast.
{
  const v = new Voxels(), mi = n => n;
  v.fill(shapes.block(cf(0, -8, 0), { x: 64, y: 16, z: 64 }), [-32, -16, -32], [32, 0, 32], mi('Grass')); // ground, top at 0
  v.fill(shapes.block(cf(16, 4, 16), { x: 16, y: 8, z: 16 }), [8, 0, 8], [24, 8, 24], mi('Water')); // a pond on it, its top at 8
  const down = v.raycast([1, 10, 1], [0, -1, 0], 100);
  check(down && Math.abs(down.t - 10) < 0.01 && down.normal[1] > 0.999 && down.material === 'Grass', `a ray down onto flat ground: at its top (${down && down.t.toFixed(3)} studs), normal up, Grass`);
  const pond = v.raycast([17, 20, 17], [0, -1, 0], 100), dry = v.raycast([17, 20, 17], [0, -1, 0], 100, true);
  check(pond && Math.abs(pond.t - 12) < 0.01 && pond.material === 'Water' && dry && Math.abs(dry.t - 20) < 0.01 && dry.material === 'Grass', `water: hit at its surface (${pond && pond.t.toFixed(2)}, ${pond && pond.material}); with IgnoreWater, the ground under it (${dry && dry.t.toFixed(2)}, ${dry && dry.material})`);
  const under = v.raycast([17, 4, 17], [0, -1, 0], 100);
  check(under && Math.abs(under.t - 4) < 0.01 && under.material === 'Grass', `from inside the water: the ground (${under && under.t.toFixed(2)})`);
  const side = v.raycast([-60, -4, 3], [1, 0, 0], 200);
  check(side && Math.abs(side.t - 28) < 0.01 && side.normal[0] < -0.999, `sideways into the ground's side: at x -32 (${side && side.t.toFixed(3)}), normal facing the ray`);
  const miss = v.raycast([0, 50, 0], [1, 0, 0], 500), short = v.raycast([1, 10, 1], [0, -1, 0], 5), inside = v.raycast([0, -4, 0], [0, -1, 0], 20);
  check(!miss && !short && !inside, 'no hit: above it, short of it, or starting inside it');
  const b = new Voxels(); b.fill(shapes.ball({ x: 0, y: 0, z: 0 }, 10), [-12, -12, -12], [12, 12, 12], mi('Slate'));
  const hb = b.raycast([-40, 0.3, 0.4], [1, 0, 0], 100), diag = b.raycast([30, 30, 30], [-1 / Math.sqrt(3), -1 / Math.sqrt(3), -1 / Math.sqrt(3)], 100);
  check(hb && Math.abs(hb.t - 30) < 0.6 && hb.normal[0] < -0.95 && hb.material === 'Slate', `a ball of radius 10: hit near its surface (${hb && (40 - hb.t).toFixed(2)} from its centre), normal outward`);
  check(diag && Math.abs(Math.hypot(30, 30, 30) - diag.t - 10) < 0.8 && diag.normal.every(n => n > 0.5), `a ball, along a diagonal: ${diag && (Math.hypot(30, 30, 30) - diag.t).toFixed(2)} from its centre, normal along it`);
  // Against the drawn surface itself: the mesher's triangles, hit by the same rays from 20 directions.
  const { P, T } = meshAll(b);
  const triHit = (o, d) => { let best = Infinity; for (let i = 0; i < T.length; i += 3) {
    const A = T.slice(i, i + 3).map(k => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]), e1 = A[1].map((x, j) => x - A[0][j]), e2 = A[2].map((x, j) => x - A[0][j]);
    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-9) continue;
    const tv = o.map((x, j) => x - A[0][j]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det; if (u < 0 || u > 1) continue;
    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det; if (vv < 0 || u + vv > 1) continue;
    const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det; if (t > 0 && t < best) best = t; } return best; };
  let worst = 0;
  for (let n = 0; n < 20; n++) {
    const th = n * 2.39996, z = 1 - 2 * (n + 0.5) / 20, r = Math.sqrt(1 - z * z), dir = [-r * Math.cos(th), -z, -r * Math.sin(th)], o = dir.map(x => -x * 40);
    const a = b.raycast(o, dir, 100), m = triHit(o, dir);
    worst = Math.max(worst, a && isFinite(m) ? Math.abs(a.t - m) : Infinity);
  }
  check(worst < 0.3, `rays at the ball from 20 directions meet its drawn triangles within ${worst.toFixed(3)} studs`);
  // The nearest hit, not the first found: a long triangle bucketed in the ray's first cell but hit far along it, and a
  // small one in the next cell hit sooner (synthetic triangles in the rays' buckets).
  const sy = new Voxels(); sy.fill(shapes.block(cf(32, -40, 32), { x: 64, y: 8, z: 64 }), [0, -44, 0], [64, -36, 64], 'Slate');
  for (let cx = -1; cx <= 4; cx++) for (let cy = -4; cy <= 1; cy++) for (let cz = -1; cz <= 4; cz++) sy.rayMeshed.add(`${cx},${cy},${cz}`); // (no meshing: only these)
  const far = { p: [[1, 0, -3], [1, 4, -3], [27, 2, 7]], n: [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], mat: 3, water: false }; // spans x 1..27, met at x = 14
  const nearT = { p: [[5.5, 0, 0], [5.5, 4, 0], [5.5, 2, 4]], n: [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], mat: 3, water: false }; // in cell x = 1, met at x = 5.5
  for (let x = 0; x <= 6; x++) { const k = `${x},0,0`; sy.rayCells.set(k, (sy.rayCells.get(k) || []).concat(far)); }
  sy.rayCells.set('1,0,0', (sy.rayCells.get('1,0,0') || []).concat(nearT));
  const nh = sy.raycast([0.5, 2, 2], [1, 0, 0], 100);
  check(nh && Math.abs(nh.t - 5) < 1e-6, `the nearest of two triangles (5 studs on), not the first one found (13.5): ${nh && nh.t.toFixed(2)}`);
}

if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('terrain test PASS');
