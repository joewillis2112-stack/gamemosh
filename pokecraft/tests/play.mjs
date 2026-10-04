// Headless phone pass over the whole loop: new world → walk → START menu
// drawn over the world → wild battle → mob battle → save → reload → continue.
// Usage: node pokecraft/tests/play.mjs [outDir]
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
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };
const g = (fn, arg) => page.evaluate(fn, arg);
const url = pathToFileURL(resolve('pokecraft/dist/index.html')).href;
const frames = async (n) => { const s = await g(() => __pc.frames); await page.waitForFunction((t) => __pc.frames >= t, s + n, { timeout: 60000 }); };
const press = async (key, n = 12) => { await page.keyboard.press(key); await frames(n); };
// Through the opening text to FIGHT/PKMN/ITEM/RUN (B backs out of FIGHT if
// an extra A opened it), then RUN: bottom right.
const runAway = async () => {
  // B advances text and backs out of FIGHT; Right+Down puts the cursor on RUN.
  for (let i = 0; i < 25 && (await g(() => __pc.mode)) === 'poke'; i++) {
    await press('KeyX', 30); await press('KeyX', 30);
    await press('ArrowRight', 8); await press('ArrowDown', 8); await press('KeyZ', 40);
  }
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

// 1. New world.
await page.goto(url);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'gamemosh');
await page.click('#starters button[data-starter="charmander"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 120000 });
await frames(60);
const start = await g(() => ({ x: __pc.w.x, z: __pc.w.z, party: __pcTest.party() }));
console.log('world', JSON.stringify(start));
if (start.party[0]?.species !== 'Charmander') fail('starter not in party');

// 2. Walk: positions must change and stay walkable.
await page.keyboard.down('ArrowRight'); await frames(80); await page.keyboard.up('ArrowRight');
await page.keyboard.down('ArrowDown'); await frames(80); await page.keyboard.up('ArrowDown');
await frames(20);
const walked = await g(() => ({ x: __pc.w.x, z: __pc.w.z, steps: __pc.w.steps, mode: __pc.mode }));
console.log('walked', JSON.stringify(walked));
if (walked.steps < 3 && walked.mode === 'world') fail('player did not walk');
if (walked.mode === 'poke') { // a wild encounter interrupted the walk: run from it
  for (let i = 0; i < 40 && (await g(() => __pc.mode)) === 'poke'; i++) await press('KeyX', 20);
}

// 3. START menu over the world.
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 60000 });
await press('Enter', 30);
const menu = await g(() => ({ mode: __pc.mode, screen: __pc.runner.screen_name(), opaque: __pc.opaque }));
console.log('start menu', JSON.stringify(menu));
if (menu.screen !== 'StartMenu' || !(menu.opaque > 1000 && menu.opaque < 160 * 144)) fail('START menu is not drawn over the world');
await shot('p1-start-menu');
await press('KeyX', 30);
await frames(10);
if ((await g(() => __pc.mode)) !== 'world') fail('B did not close the START menu');

// 4. Wild battle, then run.
await g(() => __pcTest.wildBattle());
await frames(40);
await shot('p2-battle-intro');
await page.waitForFunction(() => __pc.opaque === 160 * 144, null, { timeout: 20000 });
const wild = await g(() => ({ screen: __pc.runner.screen_name(), battle: __pc.battle }));
console.log('wild', JSON.stringify(wild));
await frames(200);
await shot('p3-battle');
await runAway();
const after = await g(() => ({ mode: __pc.mode, map: __pc.runner.current_map() }));
console.log('after wild', JSON.stringify(after));
if (after.mode !== 'world') fail('did not get back to the world after running');

// 5. A mob ambush (forced): the battle starts with the mob's Pokémon.
// A creeper is a VOLTORB; a pig is a SLOWPOKE, slow enough to always run from.
await g(() => { const w = __pc.w; const m = { type: 'creeper', x: w.x + 1, z: w.z, facing: 'left', move: null, wait: 999, hostile: true }; w.mobs.push(m); __pcTest.mobBattle(m); });
await frames(30);
const creeper = await g(() => __pc.battle && __pc.battle.species);
console.log('creeper is', creeper);
if (!/Voltorb|Electrode/.test(creeper || '')) fail('creeper did not become VOLTORB');
await shot('p4-creeper');
// Leave that battle by force (VOLTORB is too fast to run from) and meet a pig.
await g(() => { __pc.runner.warp_to('Route1', 10, 20); });
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 60000 });
await g(() => { const w = __pc.w; w.mobs = []; const m = { type: 'pig', x: w.x + 1, z: w.z, facing: 'left', move: null, wait: 999, hostile: false, test: true }; w.mobs.push(m); __pcTest.mobBattle(m); });
await frames(30);
const mob = await g(() => ({ mode: __pc.mode, battle: __pc.battle && __pc.battle.species, toast: document.getElementById('toast').textContent }));
console.log('mob', JSON.stringify(mob));
if (!/Slowpoke|Slowbro/.test(mob.battle || '')) fail('pig did not become SLOWPOKE');
await runAway();
const gone = await g(() => ({ mode: __pc.mode, mobs: __pc.w.mobs.filter((m) => m.test).length }));
console.log('after mob', JSON.stringify(gone));
if (gone.mobs) fail('mob stayed after its battle');

// 6. Save, reload, continue.
const before = await g(() => { __pcTest.saveAll('test'); return { x: __pc.w.x, z: __pc.w.z, time: Math.floor(__pc.w.time) }; });
await page.reload();
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-continue');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 120000 });
await frames(120);
const back = await g(() => ({ x: __pc.w.x, z: __pc.w.z, party: __pcTest.party().map((p) => p.species) }));
console.log('continued', JSON.stringify(back));
if (back.x !== before.x || back.z !== before.z) fail('continue lost the position');
await shot('p5-continue');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'PLAY OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
