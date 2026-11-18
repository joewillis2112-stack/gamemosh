// Selections (web/paint/selection.js) against PhotoCraft's selection code, case by case:
// test/fixtures/paint/selection-cases.json goes through both; tools/selection-oracle/run.sh
// regenerates the Rust side. Marquees and lassos in every mode must store the same bytes; lasso
// coverage and feathers (kernels up to 12 px, which PhotoCraft convolves directly) the same f32
// values; wider feathers, where PhotoCraft sums a fitted cosine series, within one 8-bit level once
// stored. Plus moving a selection and its outline, by hand.
import fs from 'node:fs';
import * as S from '../web/paint/selection.js';

const cases = JSON.parse(fs.readFileSync('test/fixtures/paint/selection-cases.json', 'utf8'));
const oracle = JSON.parse(fs.readFileSync('test/fixtures/paint/selection-oracle.json', 'utf8'));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const m8 = a => Float32Array.from(a, b => S.decode8(b));
const toBytes = m => Array.from(m || [], S.encode8);
const worst = (a, b) => a.length !== b.length ? Infinity : a.reduce((w, v, i) => Math.max(w, Math.abs(v - b[i])), 0);

const tally = {};
cases.forEach((c, i) => {
  const W = c.w, H = c.h, old = c.old ? m8(c.old) : null, want = oracle[i];
  let d, label = `${i} ${c.op} ${c.mode || ''}`, tol = 0;
  if (c.op === 'rect' || c.op === 'ellipse') {
    const shape = c.op === 'rect' ? S.rectMask(c.r, W, H) : S.ellipseMask(c.r, W, H, c.aa);
    const ours = toBytes(S.combineMarquee(old, shape, c.mode) || new Float32Array(W * H));
    d = worst(ours, want);
  } else if (c.op === 'lasso') {
    const raw = S.polygonMask(c.points, W, H, c.aa), stored = toBytes(S.combine(old, raw, c.mode) || new Float32Array(W * H));
    d = Math.max(worst(Array.from(raw), want.raw), worst(stored, want.stored));
  } else {
    const ours = S.feather(m8(c.m), W, H, c.radius), wide = Math.ceil(Math.fround(c.radius * 3)) > 12;
    label += ` radius ${c.radius}`;
    if (wide) { tol = 1; d = worst(toBytes(ours), toBytes(want)); } else d = worst(Array.from(ours), want);
  }
  (tally[c.op] = tally[c.op] || { n: 0, worst: 0 }).n++; tally[c.op].worst = Math.max(tally[c.op].worst, d);
  if (d > tol) check(false, `${label}: worst difference ${d}`);
});
for (const [op, t] of Object.entries(tally)) check(t.worst <= (op === 'feather' ? 1 : 0), `${op}: ${t.n} cases equal PhotoCraft's (worst difference ${t.worst}${op === 'feather' ? '; exact where its kernel is direct, within one 8-bit level where it sums a cosine series' : ''})`);

// By hand: moving a selection by whole pixels, and its outline.
const W = 6, H = 4, m = S.rectMask([1, 1, 3, 3], W, H), moved = S.translate(m, W, H, 4, 1);
check(moved[2 * W + 5] === 1 && moved[2 * W + 1] === 0 && moved.reduce((a, b) => a + b) === 2, 'moving by (4, 1) moves it; the column that leaves the canvas is gone');
check(S.outline(m, W, H) === 'M1 1H3M1 3H3M1 1V3M3 1V3', `a 2x2 square's outline is its four pixel edges (${S.outline(m, W, H)})`);
check(S.combineMarquee(null, m, 'subtract') === null && S.combine(null, m, 'intersect') === null, 'subtracting from or intersecting with nothing selects nothing');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${cases.length} oracle cases)`);
process.exit(fail.length ? 1 : 0);
