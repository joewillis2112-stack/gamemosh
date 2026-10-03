// Headless phone run of the full loop: quick start → slot machine → cabinet →
// score → cash out → coins credited → reload → continue keeps coins.
// Usage: node gamecorner/tests/play.mjs [outDir]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'test-output/gamecorner';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_NAME|ERR_INTERNET|ERR_TUNNEL|ERR_CERT/.test(m.text())) errors.push(m.text()); });
const url = pathToFileURL(resolve('gamecorner/dist/index.html')).href;
const fail = (msg) => { console.log('FAIL:', msg); errors.push(msg); };
const g = (fn) => page.evaluate(fn);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
// Waits for n overworld ticks, or until the game leaves the overworld.
const waitFrames = async (n) => {
  const start = await g(() => window.__gca.frames);
  await page.waitForFunction((s) => window.__gca.frames >= s || window.__gca.mode !== 'poke', start + n, { timeout: 60000 });
};
const tapBtn = async (sel) => {
  const box = await page.locator(sel).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

const t0 = Date.now();
await page.goto(url);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
console.log(`title after ${Date.now() - t0} ms`);
await shot('1-title');

await tapBtn('#btn-quick');
await page.waitForFunction(() => window.__gca.mode === 'poke' && window.__gca.frames > 90, null, { timeout: 60000 });
let s = await g(() => ({ map: __gca.runner.current_map(), pos: __gca.runner.player_position(), coins: __gca.runner.coins(), caseOk: __gca.runner.has_item('COIN_CASE') }));
console.log('quick start', JSON.stringify(s));
if (s.map !== 'GameCorner') fail('quick start not in GameCorner');
await shot('2-gamecorner');

// Face the machine to the right using the touch d-pad, then press A on the touch pad.
const dp = await page.locator('#dpad').boundingBox();
await page.touchscreen.tap(dp.x + dp.width * 0.92, dp.y + dp.height / 2);
await waitFrames(20);
for (let i = 0; i < 6 && (await g(() => __gca.mode)) === 'poke'; i++) {
  await tapBtn('[data-btn=a]');
  await waitFrames(25);
}
s = await g(() => ({ mode: __gca.mode, opened: __gca.slotsOpened }));
console.log('after A at machine', JSON.stringify(s));
if (s.mode !== 'picker') fail('cabinet picker did not open');
await shot('3-picker');

// Pick Bubblegum Spin (second row) and play it with random inputs.
await page.keyboard.press('ArrowDown');
await page.keyboard.press('KeyZ');
await page.waitForFunction(() => window.__gca.mode === 'arcade', null, { timeout: 10000 });
await shot('4-arcade-start');
const keys = ['ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX', 'ArrowUp'];
const playUntil = Date.now() + 45000;
let seed = 7;
while (Date.now() < playUntil) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  await hold(keys[seed % keys.length], 60 + (seed % 120));
  if ((await g(() => __gca.best)) >= 3000) break;
}
const best = await g(() => __gca.best);
const expectWin = await g(() => __gca.cart.payout(__gca.best));
console.log('arcade best', best, 'expected payout', expectWin);
await shot('5-arcade-play');
if (!(best > 0)) fail('no arcade score recorded');

// Cash out through START → confirm (A) → payout (A).
const before = await g(() => __gca.runner.coins());
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__gca.mode === 'confirm', null, { timeout: 5000 });
await shot('6-confirm');
await tapBtn('#confirm-yes');
await page.waitForFunction(() => window.__gca.mode === 'payout', null, { timeout: 5000 });
await shot('7-payout');
await page.keyboard.press('KeyZ');
await page.waitForFunction(() => window.__gca.mode === 'poke', null, { timeout: 5000 });
const after = await g(() => __gca.runner.coins());
console.log('coins', before, '->', after);
if (after !== Math.min(9999, before + expectWin)) fail(`coins not credited (${before} + ${expectWin} != ${after})`);
await waitFrames(30);
await shot('8-back');

// Reload: Continue restores position and coins.
await page.reload();
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
if (await page.locator('#btn-continue').isHidden()) fail('no CONTINUE after reload');
await tapBtn('#btn-continue');
await page.waitForFunction(() => window.__gca.mode === 'poke' && window.__gca.frames > 60, null, { timeout: 60000 });
s = await g(() => ({ map: __gca.runner.current_map(), coins: __gca.runner.coins() }));
console.log('continue', JSON.stringify(s));
if (s.map !== 'GameCorner' || s.coins !== after) fail('continue lost state');
await shot('9-continue');

// Frame pacing over 5 s of overworld.
const f0 = await g(() => __gca.frames); await page.waitForTimeout(5000); const f1 = await g(() => __gca.frames);
console.log('overworld ticks/s', ((f1 - f0) / 5).toFixed(1));

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'GAMECORNER OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
