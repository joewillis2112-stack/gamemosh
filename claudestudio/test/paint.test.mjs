// The brush engine (web/paint/brush.js) against PhotoCraft's own, case by case:
// test/fixtures/paint/cases.json is rendered by both; tools/paint-oracle/run.sh
// regenerates the Rust side (oracle.json). Dabs must match (position, size,
// flow, opacity ceiling, angle, roundness) and so must every pixel.
import fs from 'node:fs';
import { brush, dabs, image, paintStroke } from '../web/paint/brush.js';
import { composite } from '../web/paint/blend.js';
import { LayeredImage } from '../web/paint/layers.js';
import { PRESETS, applyPreset } from '../web/paint/presets.js';

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
// Brush presets (web/paint/presets.js) against PhotoCraft's built-in ones (presets_oracle.rs): the
// same settings in every field brush.js reads, nothing switched on that brush.js hasn't ported, and
// one stroke (varying pressure) painted with each covers the same pixels.
{
  const pc = JSON.parse(fs.readFileSync('test/fixtures/paint/preset-cases.json', 'utf8'));
  const po = JSON.parse(fs.readFileSync('test/fixtures/paint/preset-oracle.json', 'utf8'));
  check(PRESETS.length === pc.names.length && PRESETS.every((p, i) => p.name === pc.names[i]), `the presets are the ${pc.names.length} the oracle renders, in order`);
  const dyn = d => [d.control, f32(d.jitter), f32(d.minimum), d.fadeSteps];
  const f32 = Math.fround, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const p of PRESETS) {
    const o = po.find(x => x.name === p.name), ours = brush(p.brush), R = o && o.brush;
    if (!R) { check(false, `preset ${p.name}: in PhotoCraft's built-ins`); continue; }
    const fields = ['size', 'hardness', 'spacing', 'opacity', 'flow', 'roundness', 'angle'].filter(k => f32(R[k]) !== ours[k]);
    const flags = ['aliased', 'pressureSize', 'pressureOpacity', 'flipX', 'flipY'].filter(k => R[k] !== ours[k]);
    const sd = ['size', 'angle', 'roundness'].filter(k => !same(dyn(R.shapeDynamics[k]), dyn(ours.shapeDynamics[k])));
    const tr = ['opacity', 'flow'].filter(k => !same(dyn(R.transfer[k]), dyn(ours.transfer[k])));
    if (R.shapeDynamics.enabled !== ours.shapeDynamics.enabled || R.shapeDynamics.flipXJitter !== ours.shapeDynamics.flipXJitter || R.shapeDynamics.flipYJitter !== ours.shapeDynamics.flipYJitter) sd.push('enabled/flips');
    if (R.transfer.enabled !== ours.transfer.enabled) tr.push('enabled');
    const unported = [['tip', R.tip !== 'round'], ['texture', R.texture.enabled], ['scattering', R.scattering.enabled], ['dual brush', R.dualBrush.enabled], ['colour dynamics', R.colorDynamics.enabled],
      ['wet edges', R.wetEdges], ['build-up', R.buildUp], ['noise', R.noise], ['smoothing', R.smoothing.amount > 0], ['pose', R.pose.enabled], ['mode', R.mode !== 'Normal'],
      ['transfer wetness/mix', R.transfer.wetness.control !== 'off' || R.transfer.mix.control !== 'off'], ['tilt scale', R.shapeDynamics.tiltScale !== 0]].filter(x => x[1]).map(x => x[0]);
    // The stroke: coverage (alpha) per pixel, the oracle's in 16 bits.
    const img = image(pc.w, pc.h);
    paintStroke(img, { ...p.brush, color: [0.8, 0.2, 0.1, 1] }, pc.points);
    let worst = 0, painted = 0;
    for (let i = 0; i < pc.w * pc.h; i++) { const want = parseInt(o.alpha16.slice(i * 4, i * 4 + 4), 16) / 65535; worst = Math.max(worst, Math.abs(img.data[i * 4 + 3] - want)); if (want > 0) painted++; }
    check(!fields.length && !flags.length && !sd.length && !tr.length && !unported.length && worst <= 1 / 65535 + 1e-6 && painted > 20,
      `preset ${p.name}: PhotoCraft's settings${[...fields, ...flags, ...sd.map(k => 'shape ' + k), ...tr.map(k => 'transfer ' + k)].map(k => ' (differs: ' + k + ')').join('')}${unported.map(k => ' (needs ' + k + ')').join('')}; its stroke covers the same pixels (worst ${(worst * 65535).toFixed(2)}/65535, ${painted} painted)`);
  }
  const t = applyPreset({ color: [0, 0, 1, 1], erase: true, size: 99, roundness: 0.5 }, PRESETS[0]);
  check(t.size === 30 && t.roundness === 1 && t.erase && t.color[2] === 1 && t.preset === 'Hard Round', 'applying a preset sets its brush, resets what it leaves unset, keeps colour and eraser');
}
console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
