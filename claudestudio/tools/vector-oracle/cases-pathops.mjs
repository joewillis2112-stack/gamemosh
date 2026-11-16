// The cases the Vector Editor's booleans (web/vector/pathops.wasm) and gradients
// (web/vector/gradient.js) are checked on against VectorCraft's Rust, built natively (run.sh).
// Seeded, so the file only changes when this does.
import * as G from '../../web/vector/geom.js';
import { encodePathfinder } from '../../web/vector/pathops.js';

let s = 11; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const r2 = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
const cases = [];
const OPS = ['unite', 'minusFront', 'intersect', 'exclude'];
const pf = (name, paths) => { for (const op of OPS) cases.push({ op: 'pathfinder', name: `${name} ${op}`, flat: encodePathfinder(op, paths) }); };

const rect = (x0, y0, x1, y1) => G.rectangle([x0, y0, x1, y1]);
pf('two overlapping squares', [rect(0, 0, 100, 100), rect(50, 50, 150, 150)]);
pf('rect and ellipse', [rect(20, 40, 220, 160), G.ellipse([120, 0, 260, 200])]);
pf('ring (a circle inside a circle)', [G.ellipse([0, 0, 200, 200]), G.ellipse([60, 60, 140, 140])]);
pf('star and circle', [G.star([100, 100], 90, 40, 5), G.ellipse([40, 40, 160, 160])]);
pf('disjoint', [rect(0, 0, 50, 50), rect(100, 100, 150, 150)]);
pf('identical', [G.ellipse([0, 0, 80, 60]), G.ellipse([0, 0, 80, 60])]);
pf('touching edges', [rect(0, 0, 50, 50), rect(50, 0, 100, 50)]);
pf('three shapes', [rect(0, 0, 120, 120), G.ellipse([60, 20, 180, 140]), G.polygon([90, 120], 60, 6)]);
pf('rounded corners', [G.cutCorners(rect(0, 0, 160, 100), [20, 20, 20, 20], ['Round', 'Round', 'Round', 'Round']).path, G.cutCorners(rect(80, 40, 240, 180), [30, 30, 30, 30], ['InvertedRound', 'Chamfer', 'Round', 'Round']).path]);
pf('open path (closed for the fill)', [[G.polyline([[0, 0], [200, 0], [100, 150]], false)], rect(50, 50, 150, 200)]);
pf('bowtie (self-intersecting)', [[G.polyline([[0, 0], [100, 100], [100, 0], [0, 100]], true)], rect(25, 25, 75, 75)]);
const curvy = [{ anchors: [G.anchor([0, 0], [-20, 30], [30, -20]), G.anchor([100, 10], [70, -15], [130, 35], 'Smooth'), G.anchor([90, 90], [120, 60], [60, 110]), G.anchor([10, 80], [30, 100], [10, 80])], closed: true }];
pf('pen curves and a circle', [curvy, G.ellipse([30, 20, 130, 120])]);
pf('one shape', [G.star([0, 0], 50, 20, 6)]);
pf('an empty path', [rect(0, 0, 10, 10), []]);
pf('a shape inside another', [rect(0, 0, 300, 300), G.star([150, 150], 80, 35, 7)]);
for (let t = 0; t < 6; t++) {
  const poly = () => { const m = 3 + Math.floor(rnd() * 5), pts = []; for (let i = 0; i < m; i++) { const a = 2 * Math.PI * i / m + r2(-0.3, 0.3), r = r2(40, 120); pts.push([200 + r * Math.cos(a) + r2(-60, 60), 200 + r * Math.sin(a)]); } return [G.polyline(pts, true)]; };
  pf(`random polygons ${t}`, [poly(), G.ellipse([r2(80, 200), r2(80, 200), r2(220, 340), r2(220, 340)]), poly()]);
}
// The binding's failure path: a bad op, a truncated input (non-finite input is checked in the test: JSON has no NaN).
cases.push({ op: 'pathfinder', name: 'bad op', flat: [9, 0] }, { op: 'pathfinder', name: 'truncated', flat: [0, 2, 1, 1, 4, 0] });

// Gradients.
for (const kind of ['linear', 'radial']) for (const r of [[0, 0, 100, 50], [20, 30, 220, 330], [10, 10, 10, 90]]) for (const angle of [0, 45, 90, 135, -30, 200]) cases.push({ op: 'gradFit', kind, r, angle });
const C = () => [r2(0, 1), r2(0, 1), r2(0, 1)];
const stopsSets = [
  [{ offset: 0, color: [1, 1, 1], opacity: 1, midpoint: 0.5 }, { offset: 1, color: [0, 0, 0], opacity: 1, midpoint: 0.5 }],
  [{ offset: 0, color: [1, 0, 0], opacity: 1, midpoint: 0.25 }, { offset: 1, color: [0, 0, 1], opacity: 0.5, midpoint: 0.5 }],
  [{ offset: 0.1, color: C(), opacity: 0.8, midpoint: 0.7 }, { offset: 0.4, color: C(), opacity: 1, midpoint: 0.13 }, { offset: 0.9, color: C(), opacity: 0.2, midpoint: 0.5 }],
  [{ offset: 0, color: C(), opacity: 1, midpoint: 0.5 }, { offset: 0.5, color: C(), opacity: 1, midpoint: 0.87 }, { offset: 0.5, color: C(), opacity: 1, midpoint: 0.3 }, { offset: 1, color: C(), opacity: 1, midpoint: 0.5 }],
  // Midpoints just off centre (a stop of their own) and within 1e-3 of it (none).
  [{ offset: 0, color: C(), opacity: 1, midpoint: 0.55 }, { offset: 0.6, color: C(), opacity: 0.7, midpoint: 0.5004 }, { offset: 1, color: C(), opacity: 1, midpoint: 0.5 }],
];
const ts = [-0.5, 0, 0.05, 0.1, 0.2, 0.25, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.75, 0.9, 0.99, 1, 1.5];
for (const stops of stopsSets) { cases.push({ op: 'gradSample', stops, t: ts }); cases.push({ op: 'gradExpanded', stops }); }
const pts = Array.from({ length: 12 }, () => [r2(-50, 250), r2(-50, 250)]);
for (const kind of ['linear', 'radial']) for (const [start, end, aspect] of [[[0, 50], [100, 50], 1], [[50, 50], [80, 10], 1], [[30, 40], [80, 55], 0.6], [[5, 5], [5, 5], 1]]) cases.push({ op: 'gradParam', kind, start, end, aspect, points: pts });
console.log(JSON.stringify(cases));
