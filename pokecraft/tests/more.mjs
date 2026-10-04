// Second headless pass: things the first can't reach by walking a fixed path.
// Rules for steps (ledges, water, walls), SURF, sleeping at night, the
// Wandering Trader's shop, and waking up at your bed after FLY / blacking out.
// Usage: node pokecraft/tests/more.mjs [outDir]
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
const frames = async (n) => { const s = await g(() => __pc.frames); await page.waitForFunction((t) => __pc.frames >= t, s + n, { timeout: 60000 }); };
const press = async (key, n = 12) => { await page.keyboard.press(key); await frames(n); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const toWorld = async () => {
  // Text, menus and a wild battle that jumped in: B, B, then RUN (bottom right).
  for (let i = 0; i < 25 && (await g(() => __pc.mode)) !== 'world'; i++) {
    await press('KeyX', 30); await press('KeyX', 30);
    if ((await g(() => __pc.runner.screen_name())) !== 'Battle') continue;
    await press('ArrowRight', 8); await press('ArrowDown', 8); await press('KeyZ', 40);
  }
  await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 30000 });
};

await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'gamemosh');
await page.click('#starters button[data-starter="squirtle"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 120000 });
await frames(30);

// 1. Step rules on made-up columns.
const rules = await g(() => {
  const land = (gy) => ({ g: { kind: 0 }, gy, d: null });
  const water = { g: { kind: 1 }, gy: 62, d: null };
  const wall = { g: { kind: 3 }, gy: 64, d: null };
  const k = __pcTest.stepKind;
  return [k(land(64), land(65), false), k(land(64), land(63), false), k(land(64), land(66), false),
    k(land(66), land(63), false), k(land(70), land(60), false), k(land(64), water, false),
    k(land(63), water, true), k(water, land(63), true), k(water, land(66), true), k(land(64), wall, false)];
});
const want = ['walk', 'walk', null, 'jump', null, null, 'walk', 'land', null, null];
console.log('rules', JSON.stringify(rules));
if (JSON.stringify(rules) !== JSON.stringify(want)) fail(`step rules ${JSON.stringify(rules)} != ${JSON.stringify(want)}`);

// 2. SURF: go to a lake shore (seed gamemosh has one near 0,-300), stand
// next to the water, face it, press A.
await g(() => { const w = __pc.w; w.x = 0; w.z = -300; w.mobs = []; });
await page.waitForFunction(() => { const w = __pc.w; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!__pc.gen.has((w.x >> 4) + dx, (w.z >> 4) + dz)) return false; return true; }, null, { timeout: 60000 });
const spot = await g(() => {
  const w = __pc.w;
  for (let r = 1; r < 30; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const c = __pcTest.col(w.x + dx, w.z + dz), n = __pcTest.col(w.x + dx + 1, w.z + dz);
    if (c && n && c.g.kind === 0 && !c.cn && n.g.kind === 1 && Math.abs(c.gy - n.gy) <= 1) return [w.x + dx, w.z + dz];
  }
  return null;
});
console.log('shore', JSON.stringify(spot));
if (spot) {
  await g(([x, z]) => { const w = __pc.w; w.x = x; w.z = z; w.facing = 'right'; w.mobs = []; }, spot);
  await frames(20);
  await press('KeyZ', 30);
  const surf = await g(() => ({ surf: __pc.w.surf, x: __pc.w.x }));
  console.log('surf', JSON.stringify(surf));
  if (!surf.surf || surf.x !== spot[0] + 1) fail('SURF did not put the player on the water');
  await shot('m1-surf');
  await press('ArrowLeft', 6);
  await page.keyboard.down('ArrowLeft'); await frames(20); await page.keyboard.up('ArrowLeft');
  await toWorld();
  const landed = await g(() => ({ surf: __pc.w.surf, x: __pc.w.x }));
  console.log('back on land', JSON.stringify(landed));
  if (landed.surf) fail('stepping onto the shore did not end SURF');
} else fail('no shore near spawn for the SURF test');

// 3. Trader: spawn one, walk into it, its shop opens over the world.
await toWorld();
await g(() => { __pc.w.time = 2000; __pc.w.mobs = []; __pcTest.spawnTrader(); });
const trader = await g(() => __pc.w.mobs.find((m) => m.trader));
if (!trader) fail('no trader spawned');
else {
  await g(() => { const m = __pc.w.mobs.find((m) => m.trader); __pcTest.meet(m); });
  await frames(20);
  const shop = await g(() => ({ screen: __pc.runner.screen_name().slice(0, 4), opaque: __pc.opaque, mode: __pc.mode }));
  console.log('trader shop', JSON.stringify(shop));
  if (shop.screen !== 'Shop' || shop.opaque >= 160 * 144) fail('trader shop not drawn over the world');
  await shot('m2-trader');
  await toWorld();
}

// 4. Sleep: refused by day, works at night, heals, moves the bed.
await g(() => { __pc.w.time = 3000; __pc.w.mobs = []; __pcTest.trySleep(); });
const daySleep = await g(() => ({ sleep: !!__pc.w.sleep, toast: document.getElementById('toast').textContent }));
if (daySleep.sleep) fail('slept during the day');
await g(() => { __pc.w.time = 15000; __pc.w.mobs = []; __pcTest.trySleep(); });
await frames(20);
await shot('m3-night-sleep');
await frames(140);
const slept = await g(() => ({ time: Math.floor(__pc.w.time), spawn: __pc.w.spawn, x: __pc.w.x, z: __pc.w.z, sleep: !!__pc.w.sleep }));
console.log('slept', JSON.stringify(slept));
if (slept.sleep || slept.time > 500 || slept.spawn[0] !== slept.x || slept.spawn[1] !== slept.z) fail('sleeping did not set morning and the bed');

// 5. FLY / blackout: Pokémon's player leaves the hidden spot → you wake at the bed.
await g(() => { const w = __pc.w; w.x += 7; w.z += 3; __pc.runner.warp_to('PalletTown', 0, 0); });
await page.waitForFunction(() => __pc.mode === 'poke', null, { timeout: 10000 }).catch(() => {});
await toWorld();
const woke = await g(() => ({ x: __pc.w.x, z: __pc.w.z, spawn: __pc.w.spawn, map: __pc.runner.current_map() }));
console.log('woke', JSON.stringify(woke));
if (woke.x !== woke.spawn[0] || woke.z !== woke.spawn[1] || woke.map !== 'Route1') fail('did not wake at the bed after leaving the hidden map');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'MORE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
