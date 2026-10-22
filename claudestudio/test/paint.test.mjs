// The brush engine (web/paint/brush.js) against PhotoCraft's own, case by case:
// test/fixtures/paint/cases.json is rendered by both; tools/paint-oracle/run.sh
// regenerates the Rust side (oracle.json). Dabs must match (position, size,
// flow, opacity ceiling, angle, roundness) and so must every pixel.
import fs from 'node:fs';
import { brush, dabs, image, paintStroke } from '../web/paint/brush.js';

const cases = JSON.parse(fs.readFileSync('test/fixtures/paint/cases.json', 'utf8'));
const oracle = JSON.parse(fs.readFileSync('test/fixtures/paint/oracle.json', 'utf8'));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const hexF32 = hex => { const n = hex.length / 8, out = new Float32Array(n), u = new Uint32Array(out.buffer); for (let i = 0; i < n; i++) u[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16); return out; };

const PIXEL_TOL = 2e-6; // float rounding (sin/cos and sqrt may differ in the last bit)
for (const c of cases) {
  const o = oracle.find(x => x.name === c.name);
  const ours = dabs(brush(c.brush), c.points);
  let worstDab = 0;
  if (ours.length === o.dabs.length) ours.forEach((d, i) => {
    const [x, y, r, a, op, an, ro] = o.dabs[i];
    worstDab = Math.max(worstDab, Math.abs(d.x - x), Math.abs(d.y - y), Math.abs(d.radius - r), Math.abs(d.alpha - a), Math.abs(d.opacity - op), Math.abs(d.angle - an), Math.abs(d.roundness - ro));
  });
  check(ours.length === o.dabs.length && worstDab < 1e-6, `${c.name}: ${ours.length} dabs (PhotoCraft ${o.dabs.length}), worst difference ${worstDab.toExponential(1)}`);
  const img = image(c.w, c.h, c.fill || null);
  paintStroke(img, c.brush, c.points);
  const want = hexF32(o.pixels);
  let worst = 0, painted = 0;
  for (let i = 0; i < want.length; i++) { worst = Math.max(worst, Math.abs(img.data[i] - want[i])); if (i % 4 === 3 && want[i] !== (c.fill ? c.fill[3] : 0)) painted++; }
  check(worst <= PIXEL_TOL && painted > 0, `${c.name}: every pixel matches (worst ${worst.toExponential(1)} over ${c.w}x${c.h}; ${painted} pixels changed)`);
}
console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
