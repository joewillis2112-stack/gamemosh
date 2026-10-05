// The merge test as a suite: each check is a cell of the interaction matrix,
// one game's system acting on the other game's thing.
// - Your lead Pokémon's type changes Minecraft survival (spiders calm, sun heals,
//   fire light and cooking, ice over water, gliding, breath underwater).
// - Minecraft gives Pokémon EXP (ore, monsters), which levels up and evolves
//   through Pokémon Red's own code and cutscene.
// - Minecraft monsters hurt your follower's real HP; it faints.
// - A creeper blast scatters wild Pokémon.
// Usage: node pokecraft/tests/merge.mjs [outDir]
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
const press = async (key, n = 12) => { await page.keyboard.press(key); await frames(n); };
const hold = async (key, n) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const feed = () => g(() => [...document.querySelectorAll('#feed div')].map((d) => d.textContent).join(' | '));
const toast = () => g(() => document.getElementById('toast').textContent);

await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'merge');
await page.click('#starters button[data-starter="bulbasaur"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await frames(30);
const calm = () => g(() => {
  document.getElementById('toast').hidden = true;
  __pc.ents.clearAll(); __pc.mobs.clearAll();
  __pc.ents.trainerTimer = 1e9; __pc.ents.merchantTimer = 1e9;
  __pc.ents.spawnWild = () => {}; __pc.mobs.spawn = () => {};
  __pc.grace = 1e9; // no grass encounters in this suite
});
await calm();
const pad = await g(() => {
  const p = __pc.player, stone = __pc.names.indexOf('stone'), air = __pc.names.indexOf('air');
  const x0 = Math.floor(p.pos[0]), y0 = Math.floor(p.pos[1]) - 1, z0 = Math.floor(p.pos[2]);
  for (let dz = -8; dz <= 3; dz++) for (let dx = -5; dx <= 5; dx++) {
    __pcTest.edit(x0 + dx, y0, z0 + dz, stone);
    for (let dy = 1; dy <= 14; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, air);
  }
  p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.vel = [0, 0, 0]; p.yaw = 0; p.pitch = 0;
  __pc.g.time = 3000;
  return { x0, y0, z0 };
});
const home = () => g(({ x0, y0, z0 }) => { const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.vel = [0, 0, 0]; p.yaw = 0; p.pitch = 0; }, pad);
await frames(40);

// 1. The real lead (Bulbasaur: Grass/Poison) shows its perks.
const tags = await g(() => document.getElementById('perk').textContent);
console.log('lead perks', tags);
if (!/GRASS/.test(tags) || !/POISON/.test(tags)) fail('lead perk tags missing');
await shot('g1-perks');

// 2. Poison: a spider at night leaves you alone; a zombie doesn't.
await g(() => { __pc.g.time = 16000; const p = __pc.player; window.__sp = __pc.mobs.make('spider', p.pos[0] + 4, p.pos[1], p.pos[2] - 3); });
await frames(120);
const spider = await g(() => { const p = __pc.player, m = window.__sp; return { d: Math.hypot(m.body.pos[0] - p.pos[0], m.body.pos[2] - p.pos[2]), hp: __pc.surv.hp }; });
console.log('spider after 2 s', JSON.stringify(spider));
if (spider.hp < 20) fail('a spider hurt a Poison-type lead');
await calm();

// 3. Grass: sunlight heals with no food.
await home();
await g(() => { __pc.g.time = 3000; __pc.surv.hp = 10; __pc.surv.food = 6; });
await frames(60 * 9);
const sun = await g(() => ({ hp: __pc.surv.hp, food: __pc.surv.food }));
console.log('9 s in the sun', JSON.stringify(sun));
if (!(sun.hp > 10)) fail('a Grass-type lead did not heal in sunlight');

// 4. Minecraft EXP feeds Pokémon: ore EXP, then enough to level up and evolve (Pokémon Red's cutscene).
const before = await g(() => __pc.party[0].level);
await g(({ x0, y0, z0 }) => {
  __pcTest.edit(x0, y0 + 1, z0 - 2, __pc.names.indexOf('diamond_ore'));
  __pc.inv.slots[5] = { id: 'iron_pickaxe', n: 1 }; __pc.inv.sel = 5;
  const p = __pc.player; p.pitch = Math.atan2(y0 + 1.5 - (p.pos[1] + 1.62), 1.5);
}, pad);
await frames(5);
await page.keyboard.down('KeyX');
await page.waitForFunction((t) => __pcTest.blockAt(t.x, t.y, t.z) === 'air', { x: pad.x0, y: pad.y0 + 1, z: pad.z0 - 2 }, { timeout: 20000 }).catch(() => fail('diamond ore not mined'));
await page.keyboard.up('KeyX');
await frames(5);
const oreFeed = await feed();
console.log('after the diamond ore:', oreFeed);
if (!/EXP BULBASAUR/.test(oreFeed)) fail('mining ore gave no EXP');
await g(() => __pcTest.giveExp(9000, 'test'));
await frames(10);
const lv = await g(() => ({ level: __pc.party[0].level, toast: document.getElementById('toast').textContent, mode: __pc.mode }));
console.log('after 9000 EXP', JSON.stringify(lv), 'from LV', before);
if (!(lv.level > before)) fail('EXP did not level up');
if (!/evolving/.test(lv.toast)) fail('no evolution announced');
await frames(150);
await shot('g2-evolving');
const evoMode = await g(() => __pc.mode);
if (evoMode !== 'poke') fail('the evolution cutscene did not take over');
// Let it play (A through the text).
for (let i = 0; i < 40 && (await g(() => __pc.mode)) !== 'world'; i++) await press('KeyZ', 30);
const evolved = await g(() => __pc.party[0].species);
console.log('evolved into', evolved);
if (evolved !== 'Ivysaur') fail('did not evolve into Ivysaur');
await calm();

// 5. Monsters hurt your follower's real HP; it faints.
const hp0 = await g(() => __pc.party[0].hp);
await g(() => __pcTest.followerHurt('zombie', 4));
const hp1 = await g(() => __pc.party[0].hp);
console.log('follower HP', hp0, '->', hp1);
if (!(hp1 < hp0)) fail('the follower took no damage');
for (let i = 0; i < 40 && (await g(() => __pc.party[0].hp)) > 0; i++) await g(() => __pcTest.followerHurt('zombie', 8));
const fainted = await g(() => ({ hp: __pc.party[0].hp, toast: document.getElementById('toast').textContent, follower: !!__pc.ents.follower }));
console.log('fainted', JSON.stringify(fainted));
if (fainted.hp !== 0 || !/fainted/.test(fainted.toast)) fail('the follower did not faint');
await g(() => { __pc.runner.full_heal(); __pcTest.updateParty(); });
await frames(5);

// 6. Fire (forced lead): a light that follows your Pokémon, raw food cooks as you eat.
await home();
await g(() => { __pc.g.time = 18000; __pc.player.pitch = -0.5; });
await frames(30);
await g(() => { document.getElementById('toast').hidden = true; });
await shot('g3a-night-no-light');
await g(() => __pcTest.forceLead({ species: 'Charmander', types: ['Fire', 'Fire'], hp: 20, max_hp: 20, level: 10 }));
await frames(10);
await g(() => { document.getElementById('toast').hidden = true; });
await shot('g3b-fire-light');
await g(() => { __pc.surv.food = 6; __pc.inv.slots[3] = { id: 'beef', n: 2 }; __pc.inv.sel = 3; __pc.player.pitch = 1.2; });
await hold('KeyF', 130);
const ate = await g(() => ({ food: __pc.surv.food, feed: [...document.querySelectorAll('#feed div')].map((d) => d.textContent).join(' | ') }));
console.log('fire ate', JSON.stringify(ate));
if (!/Cooked|Steak/i.test(ate.feed) || !(ate.food >= 12)) fail('a Fire-type lead did not cook the beef');

// 7. Ice (forced lead): water freezes under your feet.
await g(({ x0, y0, z0 }) => {
  __pcTest.forceLead({ species: 'Lapras', types: ['Water', 'Ice'], hp: 20, max_hp: 20, level: 20 });
  const water = __pc.names.indexOf('water');
  for (let dz = -7; dz <= -2; dz++) for (let dx = -2; dx <= 2; dx++) __pcTest.edit(x0 + dx, y0, z0 + dz, water);
  __pc.g.time = 3000;
}, pad);
await home();
await frames(30);
await hold('KeyW', 70);
const ice = await g(({ x0, y0 }) => ({ pos: __pc.player.pos, inWater: __pc.player.inWater, under: __pcTest.blockAt(Math.floor(__pc.player.pos[0]), y0, Math.floor(__pc.player.pos[2])) }), pad);
console.log('walked onto the pool', JSON.stringify(ice));
if (ice.inWater || ice.under !== 'frosted_ice') fail('an Ice-type lead did not freeze the water');
await shot('g4-frost');

// 8. Water (same lead): breath lasts 3× longer.
await g(({ x0, y0, z0 }) => {
  const water = __pc.names.indexOf('water');
  for (let dz = -1; dz <= 1; dz++) for (let dx = 2; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, water);
  const p = __pc.player; p.pos = [x0 + 3.5, y0 - 2.5, z0 + 0.5]; p.vel = [0, 0, 0]; __pc.surv.air = 300;
}, pad);
await frames(240);
const air = await g(() => __pc.surv.air);
console.log('air after 4 s underwater', Math.round(air));
if (!(air > 220)) fail('a Water-type lead did not hold its breath longer');

// 9. Flying (forced lead): glide down with JUMP held, no fall damage.
await g(({ x0, y0, z0 }) => {
  __pcTest.forceLead({ species: 'Pidgeotto', types: ['Normal', 'Flying'], hp: 20, max_hp: 20, level: 20 });
  __pc.surv.hp = 20;
  const p = __pc.player; p.pos = [x0 - 3.5, y0 + 13, z0 + 0.5]; p.vel = [0, 0, 0];
}, pad);
await page.keyboard.down('Space');
await frames(30);
const glide = await g(() => __pc.player.vel[1]);
await page.waitForFunction(() => __pc.player.onGround, null, { timeout: 20000 });
await page.keyboard.up('Space');
await frames(10);
const landed = await g(() => __pc.surv.hp);
console.log('gliding vel', glide.toFixed(2), 'hp after landing', landed);
if (glide < -2.5) fail('did not glide');
if (landed < 20) fail('a Flying-type lead took fall damage');

// 10. A creeper blast scatters wild Pokémon.
await g(() => __pcTest.forceLead(null));
await g(() => {
  delete window.__pcTestLead;
  const p = __pc.player;
  const e = __pc.ents.makeMon('Pidgey', 5, p.pos[0] + 2, p.pos[1], p.pos[2] - 4);
  window.__wild = e;
  const m = __pc.mobs.make('creeper', p.pos[0] + 2, p.pos[1], p.pos[2] - 3);
  __pc.mobs.explode(m);
});
await frames(5);
const scattered = await g(() => !__pc.ents.list.includes(window.__wild));
console.log('wild Pokémon after the blast: gone =', scattered, '|', await feed());
if (!scattered) fail('the creeper blast did not reach the wild Pokémon');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'MERGE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
