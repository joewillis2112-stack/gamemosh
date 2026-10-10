// Asset gate, step 1: render an asset from five views and save a contact
// sheet + metrics. With --golden, compare the views with saved goldens.
// node tools/turntable.mjs <asset.glb> [--height 5] [--anim idle --t 0.3] [--out dir] [--golden name] [--update]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { checkGolden, LIMIT } from './golden.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const asset = args[0];
const outDir = opt('out', 'build/turntable');
const golden = opt('golden', null);
const root = path.resolve('.');
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
const logs = [];
page.on('console', m => logs.push(m.text()));
page.on('pageerror', e => logs.push('pageerror ' + e.message));
const q = new URLSearchParams({ asset: '../' + asset, height: opt('height', '5'), anim: opt('anim', ''), t: opt('t', '0') });
for (const f of ['nosky', 'nopost', 'noskybox', 'extra']) if (args.includes('--' + f)) q.set(f, '1');
if (opt('strip')) q.set('strip', opt('strip'));
if (opt('pose')) q.set('pose', opt('pose'));
if (opt('skin')) q.set('skin', '../' + opt('skin'));
await page.goto(`http://127.0.0.1:${port}/web/turntable.html?${q}`);
await page.waitForFunction(() => window.result, null, { timeout: 180000 });
const result = await page.evaluate(() => window.result);
await browser.close();
server.close();
if (result.error) { console.log('ERROR', result.error, logs.join('\n')); process.exit(1); }

const base = path.join(outDir, path.basename(asset, path.extname(asset)) + (opt('anim') ? '-' + opt('anim') + '-' + opt('t', '0') : '') + (opt('strip') ? '-strip-' + opt('strip') : '') + (opt('pose') ? '-pose-' + opt('pose') : ''));
const png = d => Buffer.from(d.split(',')[1], 'base64');
fs.writeFileSync(base + '.sheet.png', png(result.sheet));
fs.writeFileSync(base + '.metrics.json', JSON.stringify(result.metrics, null, 2));
console.log(JSON.stringify(result.metrics));
console.log('sheet', base + '.sheet.png');

// Goldens: one PNG per view under goldens/<name>/.
if (golden) {
  const gdir = path.join('goldens', golden);
  fs.mkdirSync(gdir, { recursive: true });
  let worst = 0;
  for (const [view, data] of result.views) {
    const v = view.split(' ')[0], f = path.join(gdir, v + '.png');
    const r = checkGolden(f, png(data), { update: args.includes('--update'), diffBase: base + '.' + v });
    if (r.saved) { console.log('golden saved', f); continue; }
    worst = Math.max(worst, r.frac);
    console.log(`golden ${view}: ${(r.frac * 100).toFixed(3)}% pixels differ, mean error ${r.mean.toFixed(3)}/255`);
  }
  if (worst > LIMIT) { console.log('GOLDEN MISMATCH'); process.exit(2); }
}
