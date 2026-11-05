// Develop adjustments (web/paint/develop.js) against LightCraft's develop pipeline: the test image
// in test/fixtures/develop/cases.json goes through LightCraft's `render` under each case's settings
// (tools/develop-oracle/run.sh writes oracle.json) and through ours. Every 8-bit value must match
// within 1 level (the Rust runs in f32, with f32 transcendental functions).
import fs from 'node:fs';
import { developer, isNeutral } from '../web/paint/develop.js';

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
check(isNeutral({}) && !isNeutral({ light: { exposure: 0.1 } }) && !isNeutral({ treatment: 'bw' }) && isNeutral({ curve: { master: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }), 'isNeutral: defaults and identity curves are neutral, any change is not');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${C.cases.length} oracle cases)`);
process.exit(fail.length ? 1 : 0);
