// Pokémon's screens on a phone with no Game Boy pad: real touchscreen taps
// on options (the page steers Pokémon's ▶ to them), taps on text, a drag to
// scroll, and BACK.
// Usage: node pokecraft/tests/touch.mjs [outDir]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'test-output/pokecraft';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errors.push(m.text()); });
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };
const g = (fn, arg) => page.evaluate(fn, arg);
const frames = async (n) => { const s = await g(() => __pc.frames); await page.waitForFunction((t) => __pc.frames >= t, s + n, { timeout: 120000 }); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const screen = () => g(() => __pc.runner.screen_name());
const tapEl = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
// Tap Pokémon's screen at Game Boy pixel (gx, gy).
const tapGb = async (gx, gy) => {
  const r = await g(() => { const b = document.getElementById('gb').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  await page.touchscreen.tap(r.x + (gx / 160) * r.w, r.y + (gy / 144) * r.h);
};
const settle = async () => { await page.waitForFunction(() => !__pc.touchGb.goal, null, { timeout: 20000 }).catch(() => fail('tap never finished')); await frames(30); };

await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'touch');
await page.click('#starters button[data-starter="bulbasaur"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await g(() => { document.getElementById('toast').hidden = true; __pc.ents.clearAll(); __pc.ents.trainerTimer = 1e9; __pc.ents.merchantTimer = 1e9; __pc.ents.spawnWild = () => {}; __pc.mobs.spawn = () => {}; });
await frames(150);

// 1. MENU opens Pokémon's START menu; the pad is gone, BACK is there.
await tapEl('.act.menubtn');
await page.waitForFunction(() => __pc.runner.screen_name() === 'StartMenu', null, { timeout: 15000 }).catch(() => fail('MENU did not open the START menu'));
await frames(20);
const ui = await g(() => ({ pad: !!document.getElementById('dpad'), back: !!document.querySelector('#gb-pad .back') && getComputedStyle(document.getElementById('gb-pad')).display !== 'none' }));
console.log('ui', JSON.stringify(ui));
if (ui.pad || !ui.back) fail('the pad is still there, or BACK is missing');
await shot('t1-start-menu');

// 2. Tap ITEM (third option): the bag opens.
await tapGb(112, 54);
await settle();
const bag = await screen();
console.log('tapped ITEM ->', bag);
if (bag !== 'Bag') fail('tapping ITEM did not open the bag');
await shot('t2-bag');

// 3. BACK twice: bag, then START menu, close.
await tapEl('#gb-pad .back');
await frames(30);
const back1 = await screen();
await tapEl('#gb-pad .back');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 15000 }).catch(() => fail('BACK did not close the START menu'));
console.log('BACK ->', back1, '-> world');

// 4. A battle by touch: tap the text on, then FIGHT, then the first move.
await g(() => {
  const p = __pc.player;
  const e = __pc.ents.makeMon('Rattata', 2, p.pos[0] - Math.sin(p.yaw) * 4, p.pos[1], p.pos[2] - Math.cos(p.yaw) * 4);
  __pcTest.startBattle('wild', e);
});
await page.waitForFunction(() => __pc.runner.screen_name() === 'Battle', null, { timeout: 15000 });
await frames(240);
let menu = false;
for (let i = 0; i < 12 && !menu; i++) {
  // The battle menu is up once a ▶ shows; until then taps move the text on.
  const cur = await g(() => __pcTest.findCursors(__pc.lastPx).length);
  if (cur) { menu = true; break; }
  await tapGb(80, 124);
  await settle();
}
if (!menu) fail('the battle menu never came up');
await shot('t3-battle-menu');
await tapGb(90, 118); // FIGHT
await settle();
const moves = await g(() => __pcTest.findCursors(__pc.lastPx));
console.log('after FIGHT, cursor at', JSON.stringify(moves));
if (!moves.length || moves[0].x > 60) fail('FIGHT did not open the move list');
await shot('t4-moves');
await tapGb(70, 110); // first move
await settle();
for (let i = 0; i < 90 && (await g(() => __pc.mode)) !== 'world'; i++) {
  const cur = await g(() => __pcTest.findCursors(__pc.lastPx));
  // Keep fighting with the first move until the battle ends.
  if (cur.length && cur[0].x < 60) await tapGb(70, 110);
  else if (cur.length) await tapGb(90, 118);
  else await tapGb(80, 124);
  await settle();
}
const after = await g(() => ({ mode: __pc.mode, battle: !!__pc.battle, screen: __pc.runner.screen_name(), cur: __pcTest.findCursors(__pc.lastPx), view: __pc.runner.battle_view() }));
if (after.mode !== 'world') await shot('t5-stuck');
console.log('battle by touch ended:', JSON.stringify(after));
if (after.mode !== 'world') fail('could not finish a battle by touch');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'TOUCH OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
