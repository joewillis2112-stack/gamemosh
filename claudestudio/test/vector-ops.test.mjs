// The Vector Editor's booleans and gradients against VectorCraft's Rust, case by case
// (test/fixtures/vector/pathops-cases.json; tools/vector-oracle/run.sh regenerates the Rust side,
// pathops-oracle.json, and the wasm):
// - booleans: web/vector/pathops.wasm (VectorCraft's pathops compiled to wasm) must give what the
//   same crate gives natively, number for number; plus areas worked out by hand, so the binding
//   can't agree with the oracle by both being wrong.
// - gradients: web/vector/gradient.js (a port) must match vectorcraft-color's gradient model.
import fs from 'node:fs';
import * as G from '../web/vector/geom.js';
import * as Grad from '../web/vector/gradient.js';
import { loadPathops, runFlat, pathfinder } from '../web/vector/pathops.js';

const cases = JSON.parse(fs.readFileSync('test/fixtures/vector/pathops-cases.json', 'utf8'));
const oracle = JSON.parse(fs.readFileSync('test/fixtures/vector/pathops-oracle.json', 'utf8'));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
function diff(a, b) { // worst numeric difference between two JSON values; Infinity if their shapes differ
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length !== b.length ? Infinity : a.reduce((w, x, i) => Math.max(w, diff(x, b[i])), 0);
  if (a && b && typeof a === 'object' && typeof b === 'object') { const k = Object.keys(b); return k.length !== Object.keys(a).length ? Infinity : k.reduce((w, x) => Math.max(w, diff(a[x], b[x])), 0); }
  return a === b ? 0 : Infinity;
}
await loadPathops(fs.readFileSync('web/vector/pathops.wasm'));

let worstPf = 0, nPf = 0;
cases.forEach((c, i) => {
  let ours, tol;
  switch (c.op) {
    case 'pathfinder': ours = runFlat(c.flat); tol = 1e-9; break;
    case 'gradFit': ours = Grad.fit(c.kind, c.r, c.angle); ours = { start: ours.start, end: ours.end }; tol = 0; break;
    case 'gradSample': ours = c.t.map(t => { const [col, o] = Grad.sample(c.stops, t); return [...col, o]; }); tol = 0; break;
    case 'gradExpanded': ours = Grad.expanded(c.stops).map(([t, col, o]) => [t, ...col, o]); tol = 0; break;
    case 'gradParam': ours = c.points.map(p => Grad.paramAt(c.kind, { start: c.start, end: c.end, aspect: c.aspect }, p)); tol = 1e-12; break;
  }
  const d = diff(ours, oracle[i]);
  if (c.op === 'pathfinder') { nPf++; worstPf = Math.max(worstPf, d); if (d > tol) check(false, `${i} pathfinder ${c.name}: worst difference ${d}`); return; }
  check(d <= tol, `${i} ${c.op}${c.kind ? ' ' + c.kind : ''}: worst difference ${d.toExponential(1)} (tolerance ${tol})`);
});
check(worstPf <= 1e-9, `${nPf} Pathfinder cases: the wasm gives what VectorCraft's pathops gives natively (worst difference ${worstPf.toExponential(1)})`);

// Areas by hand. A path's area: its curves flattened finely, the shoelace over every subpath (holes run the other way).
function area(path) {
  let s = 0;
  for (const sp of path) {
    const pts = [];
    for (let i = 0; i < G.segmentCount(sp); i++) { const c = G.segment(sp, i); for (let k = 0; k < 256; k++) pts.push(G.evalCubic(c, k / 256)); }
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  }
  return Math.abs(s / 2);
}
const sq = [G.rectangle([0, 0, 100, 100]), G.rectangle([50, 50, 150, 150])];
const want = { unite: 17500, minusFront: 7500, intersect: 2500, exclude: 15000 };
for (const [op, a] of Object.entries(want)) {
  const r = pathfinder(op, sq), got = r && r.length === 1 ? area(r[0].path) : NaN;
  check(Math.abs(got - a) < 1e-6, `two 100-squares overlapping by a quarter: ${op} has area ${a} (${got})`);
}
const keys = Object.keys(want).map(op => pathfinder(op, sq)[0].key);
check(diff(keys, [1, 0, 1, 1]) === 0, `each result keeps the paint Illustrator's does: the front's, the back's for Minus Front (${keys})`);
// Divide, Trim, Merge, Crop on the same squares: each result's area and the paint it keeps.
const sig = r => r ? r.map(x => `${x.key}:${Math.round(area(x.path))}`).sort().join(' ') : 'null';
check(sig(pathfinder('divide', sq)) === '0:7500 1:2500 1:7500', `Divide: three faces, the overlap the front's (${sig(pathfinder('divide', sq))})`);
check(sig(pathfinder('trim', sq)) === '0:7500 1:10000', `Trim: the back loses what the front hides (${sig(pathfinder('trim', sq))})`);
check(sig(pathfinder('merge', sq, [0, 0])) === '0:17500' && sig(pathfinder('merge', sq)) === '0:7500 1:10000', `Merge: one shape where the paints match, as Trim where they don't (${sig(pathfinder('merge', sq, [0, 0]))})`);
check(sig(pathfinder('crop', sq)) === '0:2500', `Crop: the back inside the front, the front gone (${sig(pathfinder('crop', sq))})`);
const ring = pathfinder('minusFront', [G.ellipse([0, 0, 200, 200]), G.ellipse([60, 60, 140, 140])]);
const ra = ring && area(ring[0].path), rexact = Math.PI * (100 * 100 - 40 * 40);
check(ring && ring[0].path.length === 2 && Math.abs(ra - rexact) / rexact < 1e-3, `a circle minus a circle inside it is a ring: 2 subpaths, area ${ra && ra.toFixed(1)} (π(100²-40²) = ${rexact.toFixed(1)}; Bézier circles are 0.03% off)`);
check(ring && ring[0].path[0].anchors.length <= 8 && ring[0].path.every(sp => sp.anchors.some(a => G.hasOut(a))), `its curves stay curves, refitted to few anchors (${ring && ring[0].path.map(sp => sp.anchors.length)})`);
const dis = pathfinder('intersect', [G.rectangle([0, 0, 50, 50]), G.rectangle([100, 100, 150, 150])]);
check(Array.isArray(dis) && dis.length === 0, 'disjoint shapes intersect in nothing');
check(pathfinder('unite', [[{ anchors: [G.corner([0, 0]), G.corner([NaN, 5]), G.corner([5, 5])], closed: true }]]) === null, 'a NaN coordinate is refused (null), not a crash');
check(pathfinder('unite', sq) !== null, 'and the module still works after refusing it');

// Gradients by hand.
const [mid] = Grad.sample([Grad.stop(0, [1, 1, 1]), Grad.stop(1, [0, 0, 0])], 0.5);
check(Math.abs(mid[0] - 0.5) < 1e-6, `white to black is grey half way (${mid[0]})`);
const f0 = Grad.fit('linear', [0, 0, 100, 50], 0), f90 = Grad.fit('linear', [0, 0, 100, 50], 90);
check(diff(f0, { start: [0, 25], end: [100, 25], aspect: 1 }) < 1e-12 && diff(f90.end, [50, 0]) < 1e-12, 'at 0° a linear gradient runs left to right across the box; at 90° bottom to top');
check(/<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="25" x2="100" y2="25"><stop offset="0" stop-color="#ff0000"\/><stop offset="0.25" stop-color="#800080"\/><stop offset="1" stop-color="#0000ff"\/>/.test(Grad.toSvgDef('g', { kind: 'linear', angle: 0, stops: [Grad.stop(0, [1, 0, 0], 1, 0.25), Grad.stop(1, [0, 0, 1])] }, [0, 0, 100, 50])), 'as SVG: a userSpace linearGradient with the midpoint as a stop of its own');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${cases.length} oracle cases)`);
process.exit(fail.length ? 1 : 0);
