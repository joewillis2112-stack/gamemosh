// Develop adjustments (web/paint/develop.js) against LightCraft's develop pipeline: the test image
// in test/fixtures/develop/cases.json goes through LightCraft's `render` under each case's settings
// (tools/develop-oracle/run.sh writes oracle.json) and through ours. Every 8-bit value must match
// within 1 level (the Rust runs in f32, with f32 transcendental functions).
import fs from 'node:fs';
import { developer, developImage, isNeutral, isSpatial } from '../web/paint/develop.js';
import { spatialImage } from '../tools/develop-oracle/cases.mjs';

const C = JSON.parse(fs.readFileSync('test/fixtures/develop/cases.json', 'utf8'));
const oracle = JSON.parse(fs.readFileSync('test/fixtures/develop/oracle.json', 'utf8'));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const src = Buffer.from(C.pixels, 'hex');
const enc = v => Math.floor(Math.min(Math.max(v, 0), 1) * 255 + 0.5);

for (const c of C.cases) {
  const want = Buffer.from(oracle.find(o => o.name === c.name).rgb, 'hex'), dev = developer(c.settings);
  let worst = 0, off = 0, at = -1;
  for (let i = 0; i < src.length; i += 3) {
    const o = dev([src[i] / 255, src[i + 1] / 255, src[i + 2] / 255]);
    for (let k = 0; k < 3; k++) { const d = Math.abs(enc(o[k]) - want[i + k]); if (d > worst) { worst = d; at = i / 3; } if (d) off++; }
  }
  check(worst <= 1, `${c.name}: worst ${worst} level${worst === 1 ? '' : 's'}${worst > 1 ? ` (pixel ${at})` : ''}, ${off} of ${src.length} values off by any`);
}
// The spatial tools on the 512x384 scene (made again here, exactly as the oracle got it): the
// whole image through developImage, every SAMPLE-th pixel compared.
const SP = spatialImage(), { w: SW, h: SH, sample } = C.spatial;
const scene = () => { const d = new Float32Array(SW * SH * 4); for (let i = 0; i < SW * SH; i++) { for (let k = 0; k < 3; k++) d[i * 4 + k] = SP[i * 3 + k] / 255; d[i * 4 + 3] = 1; } return { width: SW, height: SH, data: d }; };
const cache = {};
for (const c of C.spatial.cases) {
  const want = Buffer.from(oracle.find(o => o.name === 'spatial: ' + c.name).rgb, 'hex'), img = developImage(scene(), c.settings, cache);
  let worst = 0, off = 0, at = -1, n = 0;
  for (let i = 0, j = 0; i < SW * SH; i += sample, j += 3, n += 3) for (let k = 0; k < 3; k++) { const d = Math.abs(enc(img.data[i * 4 + k]) - want[j + k]); if (d > worst) { worst = d; at = i; } if (d) off++; }
  check(worst <= 1 && n === want.length, `${c.name}: worst ${worst} level${worst === 1 ? '' : 's'}${worst > 1 ? ` (pixel ${at % SW},${Math.floor(at / SW)})` : ''}, ${off} of ${n} values off by any`);
}
// Each spatial tool moves the picture (a case that changed nothing would pass any port).
{
  const base = scene(), moved = c => { const a = developImage(scene(), c.settings).data; let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - base.data[i])); return m; };
  check(C.spatial.cases.every(c => moved(c) > 0.05), 'every spatial case changes the scene by more than 5%');
}
check(isSpatial({ effects: { dehaze: 10 } }) && !isSpatial({ light: { exposure: 1 } }) && !isNeutral({ light: { shadows: 5 } }) && !isNeutral({ effects: { clarity: -5 } }), 'isSpatial/isNeutral know the spatial tools');
check(isNeutral({}) && !isNeutral({ light: { exposure: 0.1 } }) && !isNeutral({ treatment: 'bw' }) && isNeutral({ curve: { master: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }), 'isNeutral: defaults and identity curves are neutral, any change is not');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${C.cases.length} + ${C.spatial.cases.length} spatial oracle cases)`);
process.exit(fail.length ? 1 : 0);
