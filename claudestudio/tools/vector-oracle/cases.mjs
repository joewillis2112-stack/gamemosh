// The cases web/vector/geom.js is checked on against VectorCraft's Rust (run.sh): shapes,
// Live Corners on rectangles and on any path (straight and curved sides), edge cases included.
// Seeded, so the file only changes when this does.
let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const r2 = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
const KINDS = ['Round', 'InvertedRound', 'Chamfer'];
const C = (x, y) => [x, y, x, y, x, y, 'Corner'];
const cases = [];

cases.push({ op: 'rect', r: [10, 20, 110, 70] }, { op: 'rect', r: [110, 70, 10, 20] });
for (const k of KINDS) cases.push({ op: 'corners', r: [0, 0, 120, 80], radii: [10, 20, 0, 100], kinds: [k, k, k, k] });
cases.push({ op: 'corners', r: [0, 0, 120, 80], radii: [12, 12, 12, 12], kinds: ['Round', 'InvertedRound', 'Chamfer', 'Round'] });
cases.push({ op: 'corners', r: [0, 0, 120, 80], radii: [-5, NaN, 0, 1e9].map(v => Number.isNaN(v) ? 0 : v), kinds: KINDS.concat('Round') });
cases.push({ op: 'ellipse', r: [0, 0, 100, 60] }, { op: 'ellipse', r: [50, 50, -30, 10] });
for (const [a, b] of [[0, 90], [30, 300], [-45, 45], [0, 0], [10, 370], [90, 80], [200, 100], [0, 180], [0, 270]]) cases.push({ op: 'pie', r: [0, 0, 100, 60], start: a, end: b });
for (const n of [1, 3, 5, 6, 12]) cases.push({ op: 'polygon', c: [50, 50], radius: 40, sides: n, rot: n * 7 });
for (const n of [1, 2, 5, 8]) cases.push({ op: 'star', c: [50, 50], r1: 40, r2: 18, points: n, rot: n * 3 });
for (const n of [2, 3, 5, 8]) cases.push({ op: 'starInner', r1: 40, points: n });
cases.push({ op: 'line', a: [1, 2], b: [30, 40] });

const star = { anchors: [], closed: true };
for (let i = 0; i < 10; i++) { const r = i % 2 ? 25 : 50, a = -Math.PI / 2 + Math.PI * i / 5; star.anchors.push(C(100 + r * Math.cos(a), 100 + r * Math.sin(a))); }
const tri = { anchors: [C(0, 0), C(100, 0), C(0, 40)], closed: true };
const zig = { anchors: [C(0, 0), C(50, 0), C(100, 0), C(100, 50), C(150, 80)], closed: false };
const bulge = { anchors: [C(0, 0), [100, 0, 100, 0, 140, 30, 'Corner'], [100, 100, 140, 70, 100, 100, 'Corner'], C(0, 100)], closed: true };
// Curves on both sides of a corner, and a smooth anchor in between.
const curvy = { anchors: [[0, 0, -20, 30, 30, -20, 'Corner'], [100, 10, 70, -15, 130, 35, 'Smooth'], [90, 90, 120, 60, 60, 110, 'Corner'], [10, 80, 30, 100, 10, 80, 'Corner']], closed: true };
const two = [{ anchors: [C(0, 0), C(10, 0), C(0, 10)], closed: true }, { anchors: [C(50, 0), C(60, 0), C(50, 10)], closed: true }];
for (const p of [[star], [tri], [zig], [bulge], [curvy], two]) cases.push({ op: 'pathCorners', path: p });
const n = p => p.reduce((t, sp) => t + sp.anchors.length, 0);
for (const p of [[star], [tri], [zig], [bulge], [curvy], two]) for (const k of KINDS) {
  cases.push({ op: 'cut', path: p, radii: Array.from({ length: n(p) }, () => r2(0, 30)), kinds: Array.from({ length: n(p) }, () => k) });
}
cases.push({ op: 'cut', path: [bulge], radii: [1e6, 1e6, 1e6, 1e6], kinds: ['Round', 'Chamfer', 'InvertedRound', 'Round'] });
cases.push({ op: 'cut', path: two, radii: [0, 0, 0, 1], kinds: [] });
// Random closed polygons with mixed radii and kinds.
for (let t = 0; t < 12; t++) {
  const m = 3 + (t % 5), sp = { anchors: [], closed: t % 4 !== 3 };
  for (let i = 0; i < m; i++) { const a = 2 * Math.PI * i / m + r2(-0.3, 0.3), r = r2(30, 90); sp.anchors.push(C(r2(-1, 1) + 100 + r * Math.cos(a), 100 + r * Math.sin(a))); }
  if (t % 3 === 0) { const a = sp.anchors[1]; a[4] = a[0] + r2(-30, 30); a[5] = a[1] + r2(-30, 30); }
  cases.push({ op: 'cut', path: [sp], radii: sp.anchors.map(() => r2(0, 40)), kinds: sp.anchors.map(() => KINDS[Math.floor(rnd() * 3)]) });
}
console.log(JSON.stringify(cases));
