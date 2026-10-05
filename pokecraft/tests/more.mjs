// Second headless pass, for what walking around won't reliably reach:
// one-block steps vs. walls, swimming, placing your bed and sleeping in it,
// the merchant's shop, waking at your bed after FLY / a blackout, and how
// night and a landscape phone look.
// Usage: node pokecraft/tests/more.mjs [outDir]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'test-output/pokecraft';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
  await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
  await page.click('#btn-new');
  await page.fill('#seed', 'pokecraft');
  await page.click('#starters button[data-starter="squirtle"]');
  await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const frames = async (n) => { const s = await g(() => __pc.frames); await page.waitForFunction((t) => __pc.frames >= t, s + n, { timeout: 120000 }); };
  await frames(30);
  await g(() => { document.getElementById('toast').hidden = true; __pc.ents.clearAll(); __pc.ents.trainerTimer = 1e9; __pc.ents.merchantTimer = 1e9; });
  return { page, g, frames };
}

const { page, g, frames } = await open({ width: 390, height: 844 });
const press = async (key, n = 12) => { await page.keyboard.press(key); await frames(n); };
const hold = async (key, n) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const toWorld = async () => {
  for (let i = 0; i < 30 && (await g(() => __pc.mode)) !== 'world'; i++) { await press('KeyX', 30); await press('KeyX', 30); }
  await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 30000 });
};

// A flat stone test pad under and around the player, so the results don't
// depend on the terrain the seed puts there.
const pad = await g(() => {
  const p = __pc.player, stone = __pc.names.indexOf('stone'), air = __pc.names.indexOf('air');
  const x0 = Math.floor(p.pos[0]), y0 = Math.floor(p.pos[1]) - 1, z0 = Math.floor(p.pos[2]);
  for (let dz = -8; dz <= 2; dz++) for (let dx = -3; dx <= 3; dx++) {
    __pcTest.edit(x0 + dx, y0, z0 + dz, stone);
    for (let dy = 1; dy <= 4; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, air);
  }
  p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.vel = [0, 0, 0]; p.yaw = 0; p.pitch = 0;
  return { x0, y0, z0 };
});
await frames(60);

// 1. A one-block step is walked up; a two-block wall is not.
await g(({ x0, y0, z0 }) => { const stone = __pc.names.indexOf('stone'); for (let dx = -3; dx <= 3; dx++) __pcTest.edit(x0 + dx, y0 + 1, z0 - 3, stone); }, pad);
await frames(30);
await hold('KeyW', 70);
const stepped = await g(() => __pc.player.pos[1]);
console.log('after the step', stepped.toFixed(2), 'from', pad.y0 + 1);
if (stepped < pad.y0 + 1.9) fail('did not walk up a one-block step');
await g(({ x0, y0, z0 }) => { const stone = __pc.names.indexOf('stone'); for (let dx = -3; dx <= 3; dx++) { __pcTest.edit(x0 + dx, y0 + 2, z0 - 6, stone); __pcTest.edit(x0 + dx, y0 + 3, z0 - 6, stone); } }, pad);
await frames(30);
await hold('KeyW', 120);
const wall = await g(() => __pc.player.pos);
console.log('at the wall', wall.map((v) => +v.toFixed(2)));
if (wall[2] < pad.z0 - 5.4 || wall[1] > pad.y0 + 2.5) fail('climbed a two-block wall');

// 2. Swimming: a pool, fall in, hold jump to rise.
await g(({ x0, y0, z0 }) => {
  const water = __pc.names.indexOf('water');
  for (let dz = -1; dz <= 1; dz++) for (let dx = 1; dx <= 3; dx++) for (let dy = -3; dy <= 0; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, water);
  const p = __pc.player; p.pos = [x0 + 2.5, y0 + 1.5, z0 + 0.5]; p.vel = [0, 0, 0];
}, pad);
await frames(60);
const sank = await g(() => ({ y: __pc.player.pos[1], water: __pc.player.inWater }));
await hold('Space', 50);
const rose = await g(() => __pc.player.pos[1]);
console.log('swimming', JSON.stringify(sank), 'then', rose.toFixed(2));
if (!sank.water) fail('not in the water');
if (!(rose > sank.y + 0.4)) fail('jump did not swim up');

// 3. The bed: place it, refused by day, sleep at night, wake at it.
await g(({ x0, y0, z0 }) => { const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.vel = [0, 0, 0]; p.yaw = Math.PI / 2; p.pitch = -0.7; }, pad);
await frames(30);
await press('Digit1', 4);
await press('KeyF', 20);
const bed = await g(() => { const h = __pcTest.targetBlock(); return h && { x: h.x, y: h.y, z: h.z, name: __pcTest.blockAt(h.x, h.y, h.z) }; });
console.log('bed', JSON.stringify(bed));
if (!bed || !/_bed$/.test(bed.name)) fail('bed not placed');
await g(() => { __pc.g.time = 3000; });
await press('KeyF', 20);
const day = await g(() => ({ sleep: !!__pc.sleep, toast: document.getElementById('toast').textContent }));
if (day.sleep || !/only sleep at night/.test(day.toast)) fail('slept during the day');
await g(() => { __pc.g.time = 15000; });
await frames(20);
await shot('m1-night');
await press('KeyF', 20);
await frames(140);
const slept = await g(() => ({ time: Math.floor(__pc.g.time), spawn: __pc.g.spawn, sleep: !!__pc.sleep }));
console.log('slept', JSON.stringify(slept));
if (slept.sleep || slept.time > 600) fail('sleeping did not bring the morning');
if (!bed || Math.floor(slept.spawn[0]) !== bed.x || Math.floor(slept.spawn[2]) !== bed.z) fail('the bed did not become the wake-up spot');

// 4. The merchant's shop draws over the world.
await g(() => {
  const ents = __pc.ents, p = __pc.player;
  const x = p.pos[0] - Math.sin(p.yaw) * 2, z = p.pos[2] - Math.cos(p.yaw) * 2;
  ents.makeNpc('merchant', 'clerk', x, p.pos[1], z, { still: true });
  p.pitch = -0.1;
});
await frames(4);
await press('KeyF', 30);
const shop = await g(() => ({ screen: __pc.runner.screen_name().slice(0, 4), opaque: __pc.opaque }));
console.log('merchant', JSON.stringify(shop));
if (shop.screen !== 'Shop' || shop.opaque >= 160 * 144) fail('merchant shop not drawn over the world');
await shot('m2-merchant');
await toWorld();

// 5. FLY / blackout: Pokémon's player leaves its hidden spot → you wake at your bed.
await g(() => { const p = __pc.player; p.pos[0] += 9; __pc.runner.warp_to('PalletTown', 0, 0); });
await page.waitForFunction(() => __pc.mode === 'poke', null, { timeout: 10000 }).catch(() => {});
await toWorld();
const woke = await g(() => ({ pos: __pc.player.pos, spawn: __pc.g.spawn, map: __pc.runner.current_map() }));
console.log('woke', JSON.stringify(woke));
if (Math.hypot(woke.pos[0] - woke.spawn[0], woke.pos[2] - woke.spawn[2]) > 0.6 || woke.map !== 'Route1') fail('did not wake at the bed');
await page.close();

// 6. Landscape phone.
const L = await open({ width: 844, height: 390 });
await L.frames(120);
await L.page.screenshot({ path: `${out}/m3-landscape.png` });
await L.page.keyboard.press('Enter');
await L.frames(30);
await L.page.screenshot({ path: `${out}/m4-landscape-menu.png` });
const lw = await L.g(() => document.documentElement.scrollWidth);
if (lw > 844) fail('landscape page scrolls sideways');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'MORE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
