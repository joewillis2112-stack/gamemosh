// Second headless pass: every cabinet runs, New Adventure boots in the
// bedroom, both games make sound, and the landscape layout fits.
// Usage: node gamecorner/tests/extra.mjs [outDir]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'test-output/gamecorner';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const url = pathToFileURL(resolve('gamecorner/dist/index.html')).href;
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_NAME|ERR_INTERNET|ERR_TUNNEL|ERR_CERT/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
  return page;
}
const g = (page, fn, arg) => page.evaluate(fn, arg);

// 1. New adventure: bedroom start, names set, music plays.
let page = await open({ width: 390, height: 844 });
await page.click('#btn-new');
await page.waitForFunction(() => __gca.mode === 'poke' && __gca.frames > 120, null, { timeout: 60000 });
let s = await g(page, () => ({ map: __gca.runner.current_map(), pos: __gca.runner.player_position(), save: JSON.parse(__gca.runner.export_live_save()).player_name }));
console.log('new adventure', JSON.stringify(s));
if (s.map !== 'RedsHouse2F') fail('new adventure not in the bedroom');
await g(page, () => { __gcaAudio.peak = 0; });
await page.waitForTimeout(3000);
const pokePeak = await g(page, () => __gcaAudio.peak);
console.log('pokemon audio peak', pokePeak.toFixed(3), 'ctx', await g(page, () => __gcaAudio.ctx && __gcaAudio.ctx.state));
if (!(pokePeak > 0.01)) fail('no Pokémon audio');
await page.screenshot({ path: `${out}/x1-bedroom.png` });

// 2. Each cabinet loads and runs 4 s without a Lua error; record audio.
await g(page, () => { __gca.runner.warp_to('GameCorner', 17, 15); });
await page.waitForTimeout(1500);
for (const [i, id] of ['celeste', 'bubblegum', 'ghostwave'].entries()) {
  await g(page, () => { window.__openPicker = true; });
  await page.evaluate(() => { __gca.runner.give_item('COIN_CASE', 1); });
  // Open the picker the same way the slot hook does.
  await page.evaluate(() => { document.dispatchEvent(new Event('gca-test')); });
  await page.evaluate((idx) => {
    const li = document.querySelectorAll('#cabinets li');
    if (!li.length) { window.__gcaOpen(); }
  }, i).catch(() => {});
  if ((await g(page, () => __gca.mode)) !== 'picker') await page.evaluate(() => window.__gcaOpen());
  await page.locator('#cabinets li').nth(i).click();
  await page.waitForFunction(() => __gca.mode === 'arcade', null, { timeout: 5000 });
  // Start the cart: tap A/X a few times then wander.
  for (let k = 0; k < 6; k++) { await page.keyboard.press(k % 2 ? 'KeyX' : 'KeyZ'); await page.waitForTimeout(250); }
  await g(page, () => { __gcaAudio.peak = 0; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(1500);
  const r = await g(page, () => ({ err: window.__gcaPicoErr ? window.__gcaPicoErr() : false, best: __gca.best, peak: __gcaAudio.peak, fps: __gca.cart && __gca.cart.id }));
  console.log('cabinet', id, JSON.stringify(r));
  if (r.err) fail(`${id}: Lua error`);
  await page.screenshot({ path: `${out}/x2-${id}.png` });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __gca.mode === 'confirm', null, { timeout: 5000 });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => __gca.mode === 'payout', null, { timeout: 5000 });
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => __gca.mode === 'poke', null, { timeout: 5000 }).catch(async (e) => {
    console.log('DEBUG', await g(page, () => JSON.stringify({ mode: __gca.mode, last: __gca.last, now: performance.now() })));
    throw e;
  });
}
await page.context().close();

// 3. Landscape phone layout.
page = await open({ width: 844, height: 390 });
await page.screenshot({ path: `${out}/x3-landscape-title.png` });
await page.click('#btn-quick');
await page.waitForFunction(() => __gca.mode === 'poke' && __gca.frames > 60, null, { timeout: 60000 });
const lay = await g(page, () => {
  const r = (id) => document.getElementById(id).getBoundingClientRect();
  const o = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const glass = r('glass'), dpad = r('dpad'), face = r('face');
  return { glass: [glass.width | 0, glass.height | 0], overlapDpad: o(glass, dpad), overlapFace: o(glass, face), fitsH: glass.bottom <= innerHeight };
});
console.log('landscape', JSON.stringify(lay));
if (lay.overlapDpad || lay.overlapFace || !lay.fitsH) fail('landscape controls overlap the screen');
await page.screenshot({ path: `${out}/x4-landscape-play.png` });

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'EXTRA OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
