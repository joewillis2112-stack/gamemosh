// Drive the play page headless: load a place, run a scenario, take shots.
// node tools/play.mjs [--page play|editor] [--place places/x.luau] [--character x.glb] [--phone] [--scenario test/scenarios/x.mjs] [--out build/play]
// --page editor drives web/editor.html instead (its handle is window.editor; sim() is play-only).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { serve } from './serve.mjs';
import { checkGolden } from './golden.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const phone = args.includes('--phone');
const noShots = args.includes('--noshots'); // measurements only
const outDir = opt('out', 'build/play');
const pageName = opt('page', 'play'), G = pageName === 'editor' ? 'editor' : 'studio'; // the page's window handle
fs.mkdirSync(outDir, { recursive: true });
const srv = serve();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(m.type() + ' ' + m.text()));
page.on('pageerror', e => logs.push('pageerror ' + e.message));
page.on('response', r => { if (r.status() >= 400) logs.push('error ' + r.status() + ' ' + r.url()); });
const q = new URLSearchParams({ test: '1', quality: phone ? 'phone' : 'high' });
if (opt('place')) q.set('place', '../' + opt('place'));
if (opt('skin')) q.set('skin', '../' + opt('skin'));
if (opt('character')) q.set('character', '../' + opt('character'));
async function load(extra = {}) {
  const p = new URLSearchParams(q);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  await page.goto(`http://127.0.0.1:${srv.port}/web/${pageName}.html?${p}`);
  try { await page.waitForFunction(g => window[g] && (window[g].ready || window[g].error), G, { timeout: 120000 }); }
  catch (e) { console.log('TIMEOUT\n' + logs.join('\n')); process.exit(1); }
  const err = await page.evaluate(g => window[g].error, G);
  if (err) { console.log('ERROR', err, '\n' + logs.join('\n')); process.exit(1); }
}
await load();

// The test clock: render frames at a fixed 1/60 s so runs are repeatable.
const api = {
  page, outDir, logs, // logs: console lines from the page (Luau prints arrive as '[luau] ...')
  async frames(n, input = null) { if (noShots) return; await page.evaluate(([n, input, g]) => window[g].frames(n, input), [n, input, G]); },
  async sim(n, input = null) { await page.evaluate(([n, input]) => window.studio.sim(n, input), [n, input]); },
  async shot(name) { if (noShots) return null; const f = path.join(outDir, name + '.png'); await page.screenshot({ path: f, timeout: 300000 }); console.log('shot', f); return f; },
  // Screenshot compared with goldens/play/<name>.png (saved if missing or with --update).
  async golden(name) {
    if (noShots) return;
    const buf = await page.screenshot({ timeout: 300000 });
    const r = checkGolden(path.join('goldens/play', name + (phone ? '-phone' : '') + '.png'), buf, { update: args.includes('--update'), diffBase: path.join(outDir, name) });
    if (r.saved) console.log('golden saved', name);
    else { console.log(`golden ${name}: ${(r.frac * 100).toFixed(3)}% pixels differ, mean ${r.mean.toFixed(3)}/255`); if (!r.ok) mismatches.push(name); }
  },
  async eval(fn, arg) { return page.evaluate(fn, arg); },
  // Load the page again with extra query parameters (e.g. { character: '../x.glb' }).
  reload: load,
};
const mismatches = [];
const scenario = opt('scenario');
if (scenario) { const mod = await import(path.resolve(scenario)); await mod.default(api); }
else { await api.frames(30); await api.shot(path.basename(opt('place', 'baseplate'), '.luau')); }
const errs = logs.filter(l => /^error|pageerror/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
srv.close();
if (mismatches.length) { console.log('GOLDEN MISMATCH', mismatches.join(' ')); process.exit(2); }
