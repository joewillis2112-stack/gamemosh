// glTF import fidelity: render Khronos Render Fidelity scenarios through the
// studio's import path (web/fidelity.html) and diff against Babylon's golden
// and the glTF Sample Viewer's (ground truth). Fetch first: tools/fetch-fidelity.sh.
// node tools/fidelity.mjs [scenario ...] [--env-rotation N] [--out build/fidelity]
// Writes <out>/<scenario>.png: ours | Babylon golden | Sample Viewer golden | |ours - Babylon| x4.
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { serve } from './serve.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const outDir = opt('out', 'build/fidelity'), envRotation = opt('env-rotation', null), skyRotation = opt('sky-rotation', null);
const D = '.cache/fidelity';
const cfg = JSON.parse(fs.readFileSync(`${D}/gen/test/config.json`, 'utf8'));
// Defaults from the generator's src/config-reader.ts.
const defaults = { lighting: '../../../environments/lightroom_14b.hdr', dimensions: { width: 768, height: 768 }, target: { x: 0, y: 0, z: 0 }, orbit: { theta: 0, phi: 90, radius: 1 }, verticalFoV: 45, renderSkybox: false };
const resolve = s => ({ ...defaults, ...s, dimensions: { ...defaults.dimensions, ...s.dimensions }, target: { ...defaults.target, ...s.target }, orbit: { ...defaults.orbit, ...s.orbit } });
// Scenario paths are relative to test/goldens/<name>/ in the generator repo.
const url = rel => '/' + path.normalize(`${D}/gen/test/goldens/x/${rel}`).replace('glTF-Sample-Assets/', '../assets/').replace(`${D}/gen/../assets`, `${D}/assets`);
const have = s => fs.existsSync('.' + url(s.model)) && fs.existsSync(`${D}/gen/test/goldens/${s.name}/babylon-golden.png`);
let scenarios = cfg.scenarios.map(resolve);
scenarios = args.length ? scenarios.filter(s => args.includes(s.name) || args.includes(s.name.replace('khronos-', ''))) : scenarios.filter(have);
fs.mkdirSync(outDir, { recursive: true });

const readPng = f => { const b = fs.readFileSync(f); return b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? PNG.sync.read(b) : null; };
// Premultiplied colour per pixel (the goldens have transparent backgrounds).
function compare(a, b) {
  let sum = 0, n = 0, big = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3] / 255, ba = b.data[i + 3] / 255;
    if (aa === 0 && ba === 0) continue;
    let m = 0;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[i + c] * aa - b.data[i + c] * ba); sum += d; m = Math.max(m, d); }
    m = Math.max(m, Math.abs(aa - ba) * 255);
    n++; if (m > 16) big++;
  }
  return { mean: n ? sum / (n * 3) : 0, over16: n ? 100 * big / n : 0 };
}
function sheet(file, imgs, W, H) {
  const out = new PNG({ width: W * imgs.length, height: H });
  imgs.forEach((im, k) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * out.width + x + k * W) * 4, i = (y * W + x) * 4;
      const checker = ((x >> 5) + (y >> 5)) & 1 ? 200 : 230; // transparency shows as a checkerboard
      const a = im ? im.data[i + 3] / 255 : 0;
      for (let c = 0; c < 3; c++) out.data[o + c] = im ? Math.round(im.data[i + c] * a + checker * (1 - a)) : 0;
      out.data[o + 3] = 255;
    }
  });
  fs.writeFileSync(file, PNG.sync.write(out));
}

const srv = serve();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
for (const s of scenarios) {
  const page = await browser.newPage({ viewport: { width: s.dimensions.width, height: s.dimensions.height }, deviceScaleFactor: 1 });
  const logs = []; page.on('console', m => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/web/fidelity.html`);
  await page.waitForFunction(() => window.fidelityReady, null, { timeout: 60000 });
  const scen = { ...s, model: url(s.model), lighting: url(s.lighting), dpr: 2 };
  if (envRotation !== null) scen.envRotation = +envRotation;
  if (skyRotation !== null) scen.skyRotation = +skyRotation;
  let info;
  try { info = await page.evaluate(sc => window.renderScenario(sc), scen); }
  catch (e) { console.log(`${s.name}: FAILED ${e.message.split('\n')[0]}`); logs.slice(-5).forEach(l => console.log('  ' + l)); await page.close(); continue; }
  const dataUrl = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  const ours = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const bab = readPng(`${D}/gen/test/goldens/${s.name}/babylon-golden.png`), ref = readPng(`${D}/gen/test/goldens/${s.name}/gltf-sample-viewer-golden.png`);
  const W = ours.width, H = ours.height;
  const same = g => g && g.width === W && g.height === H ? g : null;
  const vsB = same(bab) ? compare(ours, bab) : null, vsR = same(ref) ? compare(ours, ref) : null, bVsR = same(bab) && same(ref) ? compare(bab, ref) : null;
  let diff = null;
  if (same(bab)) { diff = new PNG({ width: W, height: H }); for (let i = 0; i < ours.data.length; i += 4) { for (let c = 0; c < 3; c++) diff.data[i + c] = Math.min(255, 4 * Math.abs(ours.data[i + c] * ours.data[i + 3] / 255 - bab.data[i + c] * bab.data[i + 3] / 255)); diff.data[i + 3] = 255; } }
  sheet(path.join(outDir, s.name + '.png'), [ours, same(bab), same(ref), diff], W, H);
  const f = r => r ? `${r.mean.toFixed(2)} mean, ${r.over16.toFixed(1)}% >16` : 'n/a';
  console.log(`${s.name} (${info.meshes} meshes): vs Babylon ${f(vsB)} | vs Sample Viewer ${f(vsR)} | Babylon vs Sample Viewer ${f(bVsR)}`);
  results.push({ name: s.name, vsBabylon: vsB, vsReference: vsR, babylonVsReference: bVsR, info });
  await page.close();
}
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
await browser.close(); srv.close();
