// The brush engine (web/paint/brush.js) against PhotoCraft's own, case by case:
// test/fixtures/paint/cases.json is rendered by both; tools/paint-oracle/run.sh
// regenerates the Rust side (oracle.json). Dabs must match (position, size,
// flow, opacity ceiling, angle, roundness) and so must every pixel.
import fs from 'node:fs';
import { brush, dabs, image, paintStroke } from '../web/paint/brush.js';
import { composite } from '../web/paint/blend.js';
import { LayeredImage } from '../web/paint/layers.js';

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
// Blend modes: every (mode, backdrop, source, opacity) of blend-cases.json against PhotoCraft's blend::composite.
const bc = JSON.parse(fs.readFileSync('test/fixtures/paint/blend-cases.json', 'utf8'));
const bo = hexF32(JSON.parse(fs.readFileSync('test/fixtures/paint/blend-oracle.json', 'utf8')).results);
let k = 0;
for (const m of bc.modes) {
  let worst = 0, n = 0;
  for (const b of bc.colors) for (const src of bc.colors) for (const o of bc.opacities) {
    const got = composite(m, b, src, o);
    for (let i = 0; i < 4; i++, k++) worst = Math.max(worst, Math.abs(got[i] - bo[k]));
    n++;
  }
  check(worst <= 2e-6, `blend ${m}: ${n} composites match PhotoCraft's (worst ${worst.toExponential(1)})`);
}
check(k === bo.length, `every blend result compared (${k} of ${bo.length})`);
// Layers: a stack flattened bottom to top (hand-worked values).
{
  const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)).map(v => +v.toFixed(4));
  const eq = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
  const L = new LayeredImage(4, 2);
  L.add('Background', image(4, 2, [0.8, 0.6, 0.4, 1]));
  const top = L.add('Shade', image(4, 2, [0.5, 0.5, 0.5, 1]));
  check(eq(px(L.flatten(), 1, 1), [0.5, 0.5, 0.5, 1]), `Normal: the opaque top layer covers (${px(L.flatten(), 1, 1)})`);
  L.set(1, 'blend', 'Multiply');
  check(eq(px(L.flatten(), 1, 1), [0.4, 0.3, 0.2, 1]), `Multiply 0.5 grey over (0.8, 0.6, 0.4) halves it (${px(L.flatten(), 1, 1)})`);
  L.set(1, 'blend', 'Normal'); L.set(1, 'opacity', 0.5);
  check(eq(px(L.flatten(), 0, 0), [0.65, 0.55, 0.45, 1]), `half opacity mixes halfway (${px(L.flatten(), 0, 0)})`);
  L.set(1, 'visible', false);
  check(eq(px(L.flatten(), 0, 0), [0.8, 0.6, 0.4, 1]), `a hidden layer is left out`);
  L.set(1, 'visible', true); L.set(1, 'opacity', 1);
  top.img.data.fill(0); top.img.data.set([0, 0, 1, 1], 0); // one blue pixel at (0,0), the rest clear
  const f1 = L.flatten();
  check(eq(px(f1, 0, 0), [0, 0, 1, 1]) && eq(px(f1, 3, 1), [0.8, 0.6, 0.4, 1]), `transparent pixels show the layer below`);
  L.move(1, -1);
  check(L.layers[0].name === 'Shade' && L.active === 0 && eq(px(L.flatten(), 0, 0), [0.8, 0.6, 0.4, 1]), `moving a layer down reorders the stack; the active layer follows it`);
  check(L.remove(0) && !L.remove(0) && L.layers.length === 1, `a layer can be removed, but never the last`);
  let threw = false; try { L.add('Wrong', image(2, 2)); } catch { threw = true; }
  check(threw, `a layer of another size is refused`);
}
console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
