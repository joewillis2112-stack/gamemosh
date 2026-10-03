// Third headless pass, covering what the playtest couldn't reach:
// the quick-start erase guard, an unfinished run paid out on CONTINUE,
// the slot-machine woman's PLAY option, and buying a prize with coins.
// Usage: node gamecorner/tests/more.mjs [outDir]
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
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };
const g = (fn, arg) => page.evaluate(fn, arg);
const ticks = async (n) => {
  const s = await g(() => __gca.frames);
  await page.waitForFunction((t) => __gca.frames >= t || __gca.mode !== 'poke', s + n, { timeout: 60000 });
};
const press = async (key, wait = 12) => { await page.keyboard.press(key); await ticks(wait); };
const party = () => g(() => JSON.parse(__gca.runner.export_live_save()).party);
const title = async () => { await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 }); };

// 1. Quick start with a save on file asks for a second tap.
await page.goto(url);
await title();
await page.click('#btn-quick');
await page.waitForFunction(() => __gca.mode === 'poke' && __gca.frames > 60, null, { timeout: 60000 });
await g(() => { __gca.runner.add_coins(321); });
await page.reload();
await title();
await page.click('#btn-continue');
await page.waitForFunction(() => __gca.mode === 'poke' && __gca.frames > 30, null, { timeout: 60000 });
await g(() => window.dispatchEvent(new Event('pagehide')));
await page.reload();
await title();
await page.click('#btn-quick');
await page.waitForTimeout(300);
const guard = await g(() => ({ mode: __gca.mode, label: document.getElementById('btn-quick').textContent }));
console.log('quick with save, first tap', JSON.stringify(guard));
if (guard.mode !== 'title' || !/TAP AGAIN/.test(guard.label)) fail('quick start did not ask before erasing the save');
await page.click('#btn-continue');
await page.waitForFunction(() => __gca.mode === 'poke' && __gca.frames > 30, null, { timeout: 60000 });
const kept = await g(() => __gca.runner.coins());
console.log('coins kept after declining', kept);
if (kept !== 321) fail('save changed after declining the erase');

// 2. Slot-machine woman: talk, PLAY → cabinet picker.
await g(() => { __gca.runner.warp_to('GameCorner', 2, 14); });
await ticks(90);
await press('ArrowUp', 15);
for (let i = 0; i < 12 && (await g(() => __gca.mode)) === 'poke'; i++) await press('KeyZ', 30);
const woman = await g(() => __gca.mode);
console.log('slot woman', woman);
if (woman !== 'picker') fail('slot woman PLAY did not open the cabinet');
await page.screenshot({ path: `${out}/m1-woman-picker.png` });

// 3. Unfinished run: score in Bubblegum, close the page mid-run, CONTINUE pays it.
await page.locator('#cabinets li').nth(1).click();
await page.waitForFunction(() => __gca.mode === 'arcade', null, { timeout: 5000 });
const keys = ['ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyZ', 'KeyX'];
let seed = 3;
const until = Date.now() + 40000;
while (Date.now() < until && (await g(() => __gca.best)) < 2000) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  await page.keyboard.down(keys[seed % keys.length]); await page.waitForTimeout(80); await page.keyboard.up(keys[seed % keys.length]);
}
const best = await g(() => __gca.best);
const owed = await g(() => __gca.cart.payout(__gca.best));
await g(() => window.dispatchEvent(new Event('pagehide')));
const before = await g(() => __gca.runner.coins());
console.log('mid-run best', best, 'owed', owed, 'coins', before);
await page.reload();
await title();
await page.click('#btn-continue');
await page.waitForFunction(() => __gca.mode === 'payout' || (__gca.mode === 'poke' && __gca.frames > 60), null, { timeout: 60000 });
const rec = await g(() => ({ mode: __gca.mode, coins: __gca.runner.coins(), text: document.getElementById('payout-detail').textContent }));
console.log('recovered', JSON.stringify(rec));
if (owed > 0 && (rec.mode !== 'payout' || rec.coins !== before + owed)) fail('unfinished run not paid on CONTINUE');
await page.screenshot({ path: `${out}/m2-recovered.png` });
await page.keyboard.press('KeyZ');
await page.waitForFunction(() => __gca.mode === 'poke', null, { timeout: 5000 });

// 4. Prize counter: buy an ABRA (180 coins).
await g(() => { __gca.runner.add_coins(500); __gca.runner.warp_to('GameCornerPrizeRoom', 2, 3); });
await ticks(90);
const p0 = (await party()).length ?? Object.keys(await party()).length;
const c0 = await g(() => __gca.runner.coins());
await press('ArrowUp', 15);
for (let i = 0; i < 16; i++) {
  await press('KeyZ', 35);
  if ((await g(() => __gca.runner.coins())) < c0) break;
}
for (let i = 0; i < 8; i++) await press('KeyX', 20);
const c1 = await g(() => __gca.runner.coins());
const pAfter = await party();
console.log('prize', JSON.stringify({ coins: [c0, c1], party: JSON.stringify(pAfter).slice(0, 120), screen: await g(() => __gca.runner.screen_name()), mode: await g(() => __gca.mode) }));
if (!(c1 === c0 - 180)) fail('prize purchase did not take 180 coins');
if ((await g(() => __gca.mode)) !== 'poke') fail('prize room triggered the cabinet hook');
await page.screenshot({ path: `${out}/m3-prize.png` });

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'MORE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
