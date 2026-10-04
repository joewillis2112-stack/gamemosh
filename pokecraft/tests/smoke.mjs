// Quick look: new world from a seed, walk a little, screenshot.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'test-output/pokecraft';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errors.push(m.text()); });
const t0 = Date.now();
await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
console.log('title after', Date.now() - t0, 'ms');
await page.click('#btn-new');
await page.fill('#seed', process.env.SEED || 'gamemosh');
const t1 = Date.now();
await page.click('#starters button[data-starter="squirtle"]');
await page.waitForFunction(() => window.__pc.mode === 'world', null, { timeout: 120000 });
console.log('world after', Date.now() - t1, 'ms', await page.evaluate(() => JSON.stringify({ x: __pc.w.x, z: __pc.w.z, gen: __pc.gen.stats })));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/s1-spawn.png` });
for (const [key, ms] of [['ArrowRight', 1500], ['ArrowDown', 1500], ['ArrowLeft', 1200]]) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}
await page.waitForTimeout(500);
console.log('after walk', await page.evaluate(() => JSON.stringify({ mode: __pc.mode, x: __pc.w.x, z: __pc.w.z, steps: __pc.w.steps, mobs: __pc.w.mobs.length, gen: __pc.gen.stats, chunks: __pc.gen.chunks.size })));
await page.screenshot({ path: `${out}/s2-walk.png` });
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'SMOKE OK');
await browser.close();
