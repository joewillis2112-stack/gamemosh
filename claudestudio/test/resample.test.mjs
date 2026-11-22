// Image Size (web/paint/resample.js) against PhotoCraft's resampler, case by case:
// test/fixtures/paint/resample-cases.json goes through both; tools/resample-oracle/run.sh
// regenerates the Rust side (resample-oracle.json). Every 8-bit value must match. Plus Canvas
// Size, worked out by hand.
import fs from 'node:fs';
import { resample, resampleData, canvasSize, canvasOffset } from '../web/paint/resample.js';

const cases = JSON.parse(fs.readFileSync('test/fixtures/paint/resample-cases.json', 'utf8'));
const oracle = JSON.parse(fs.readFileSync('test/fixtures/paint/resample-oracle.json', 'utf8'));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const fromU8 = (w, h, px) => ({ width: w, height: h, data: Float32Array.from(px, v => Math.fround(v / 255)) });
const toU8 = img => Array.from(img.data, v => Math.trunc(Math.min(Math.max(v, 0), 1) * 255 + 0.5));

let exact = 0;
cases.forEach((c, i) => {
  const ours = c.ch === 1 ? toU8({ data: resampleData(Float32Array.from(c.px, v => Math.fround(v / 255)), c.w, c.h, 1, false, [c.def], c.nw, c.nh, c.filter) })
    : toU8(resample(fromU8(c.w, c.h, c.px), c.nw, c.nh, c.filter)), want = oracle[i];
  let worst = ours.length === want.length ? 0 : Infinity, n = 0;
  for (let k = 0; k < want.length && worst < Infinity; k++) { const d = Math.abs(ours[k] - want[k]); if (d) n++; worst = Math.max(worst, d); }
  if (worst === 0) exact++; else check(false, `${i} ${c.ch === 1 ? 'mask ' : ''}${c.w}x${c.h} -> ${c.nw}x${c.nh} ${c.filter}: ${n} values differ, worst by ${worst}`);
});
check(exact === cases.length, `${exact} of ${cases.length} resamples equal PhotoCraft's, value for value`);

// By hand: an opaque layer stays opaque to its border (the edge repeats outwards).
const opaque = fromU8(4, 4, Array.from({ length: 64 }, (_, i) => i % 4 === 3 ? 255 : 100));
const up = toU8(resample(opaque, 7, 9, 'bicubic'));
check(up.every((v, i) => i % 4 === 3 ? v === 255 : v === 100), 'a flat opaque layer stays flat and opaque at any size (no fading at the border)');
// Canvas Size: centred by default, new area clear, the rest cut off.
check(String(canvasOffset(4, 4, 8, 6)) === '2,1' && String(canvasOffset(4, 4, 8, 6, 0)) === '0,0' && String(canvasOffset(4, 4, 8, 6, 8)) === '4,2' && String(canvasOffset(4, 4, 2, 2)) === '-1,-1', 'Canvas Size anchors: centre, top left, bottom right, and a smaller canvas cuts evenly');
const cs = canvasSize(opaque, 6, 2, 4), px = (x, y) => Array.from(cs.data.slice((y * 6 + x) * 4, (y * 6 + x) * 4 + 4)).map(v => Math.round(v * 255));
check(cs.width === 6 && cs.height === 2 && String(px(0, 0)) === '0,0,0,0' && String(px(1, 0)) === '100,100,100,255' && String(px(4, 1)) === '100,100,100,255' && String(px(5, 1)) === '0,0,0,0', 'a 4x4 layer on a 6x2 canvas: a clear column each side, the middle rows kept');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${cases.length} oracle cases)`);
process.exit(fail.length ? 1 : 0);
