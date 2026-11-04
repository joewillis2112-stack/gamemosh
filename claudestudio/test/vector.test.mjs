// Vector geometry (web/vector/geom.js) against VectorCraft's Rust kernel, case by case:
// test/fixtures/vector/cases.json goes through both; tools/vector-oracle/run.sh regenerates
// the Rust side (oracle.json). Every anchor and handle must match: to 1e-9 for straight
// geometry, 1e-5 where a cut runs along a curve (arc lengths are measured numerically on both
// sides, each to 1e-6).
import fs from 'node:fs';
import * as G from '../web/vector/geom.js';

const cases = JSON.parse(fs.readFileSync('test/fixtures/vector/cases.json', 'utf8'));
const oracle = JSON.parse(fs.readFileSync('test/fixtures/vector/oracle.json', 'utf8'));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };

const pathIn = p => p.map(sp => ({ closed: sp.closed, anchors: sp.anchors.map(a => G.anchor([a[0], a[1]], [a[2], a[3]], [a[4], a[5]], a[6])) }));
const pathOut = p => p.map(sp => ({ closed: sp.closed, anchors: sp.anchors.map(a => [...a.p, ...a.in, ...a.out, a.kind]) }));
function diff(a, b) { // worst numeric difference between two JSON values; Infinity if their shapes differ
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length !== b.length ? Infinity : a.reduce((w, x, i) => Math.max(w, diff(x, b[i])), 0);
  if (a && b && typeof a === 'object' && typeof b === 'object') { const k = Object.keys(b); return k.length !== Object.keys(a).length ? Infinity : k.reduce((w, x) => Math.max(w, diff(a[x], b[x])), 0); }
  return a === b ? 0 : Infinity;
}
const curved = p => p.some(sp => sp.anchors.some(a => a[0] !== a[2] || a[1] !== a[3] || a[0] !== a[4] || a[1] !== a[5]));

cases.forEach((c, i) => {
  let ours;
  switch (c.op) {
    case 'rect': ours = pathOut(G.rectangle(c.r)); break;
    case 'corners': ours = pathOut(G.rectangleWithCorners(c.r, c.radii, c.kinds)); break;
    case 'ellipse': ours = pathOut(G.ellipse(c.r)); break;
    case 'pie': ours = pathOut(G.ellipsePie(c.r, c.start, c.end)); break;
    case 'polygon': ours = pathOut(G.polygon(c.c, c.radius, c.sides, c.rot)); break;
    case 'star': ours = pathOut(G.star(c.c, c.r1, c.r2, c.points, c.rot)); break;
    case 'starInner': ours = G.straightStarInnerRadius(c.r1, c.points); break;
    case 'line': ours = pathOut(G.line(c.a, c.b)); break;
    case 'pathCorners': ours = G.pathCorners(pathIn(c.path)).map(k => ({ index: k.index, angle: k.angleDeg(), lu: k.lu, lv: k.lv, max: k.maxRadius() })); break;
    case 'cut': { const r = G.cutCorners(pathIn(c.path), c.radii, c.kinds); ours = { path: pathOut(r.path), from: r.from }; break; }
  }
  const tol = c.path && curved(c.path) ? 1e-5 : 1e-9, d = diff(ours, oracle[i]);
  check(d <= tol, `${i} ${c.op}${c.kinds ? ' ' + [...new Set(c.kinds)].join('/') : ''}: worst difference ${d.toExponential(1)} (tolerance ${tol})`);
});

// Our own: SVG output, bounds, set_handle.
check(G.toSvgD(G.rectangle([0, 0, 10, 5])) === 'M0 0L10 0L10 5L0 5Z', 'a rectangle is four lines, closed');
check(/^M0 30C/.test(G.toSvgD(G.ellipse([0, 0, 100, 60]))), 'an ellipse is cubics');
const b = G.bounds(G.ellipse([0, 0, 100, 60]));
check(diff(b, [0, 0, 100, 60]) < 1e-9, `ellipse bounds are its rect (${b})`);
const bb = G.bounds([{ closed: false, anchors: [G.anchor([0, 0], [0, 0], [50, -40]), G.anchor([100, 0], [50, -40], [100, 0])] }]);
check(Math.abs(bb[1] + 30) < 1e-9 && bb[3] === 0, `a bulging curve's bounds reach its peak, not its handles (${bb})`);
const sm = G.anchor([0, 0], [-10, 0], [10, 0], 'Smooth'); G.setHandle(sm, true, [0, 5]);
check(diff(sm.in, [0, -10]) < 1e-9, 'a smooth anchor turns its other handle, keeping its length');
const co = G.anchor([0, 0], [-10, 0], [10, 0], 'Smooth'); G.setHandle(co, true, [0, 5], true);
check(co.kind === 'Corner' && diff(co.in, [-10, 0]) === 0, 'an independent handle drag makes a corner');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${cases.length} oracle cases)`);
process.exit(fail.length ? 1 : 0);
