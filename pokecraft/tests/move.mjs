// Getting around and eating: sneaking at an edge, ladders, sprint-swimming,
// riding your partner on land, on water and in the air; wild Pokémon that
// faint and drop food; feeding your partner; a Bug/Grass partner keeping
// weaker Pokémon hidden in the grass.
// Usage: node pokecraft/tests/move.mjs [outDir]
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
const hold = async (keys, n) => { for (const k of keys) await page.keyboard.down(k); await frames(n); for (const k of keys) await page.keyboard.up(k); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const P = () => g(() => ({ pos: __pc.player.pos.map((v) => +v.toFixed(2)), vel: __pc.player.vel.map((v) => +v.toFixed(2)), water: __pc.player.inWater, ground: __pc.player.onGround }));

await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'move');
await page.click('#starters button[data-starter="charmander"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await frames(30);
await g(() => {
  document.getElementById('toast').hidden = true;
  __pc.ents.clearAll(); __pc.mobs.clearAll();
  __pc.ents.trainerTimer = 1e9; __pc.ents.merchantTimer = 1e9; __pc.ents.spawnWild = () => {}; __pc.mobs.spawn = () => {};
  __pc.grace = 1e9; __pc.g.time = 3000;
});
// A flat stone pad with room above.
const pad = await g(() => {
  const p = __pc.player, stone = __pc.names.indexOf('stone'), air = __pc.names.indexOf('air');
  const x0 = Math.floor(p.pos[0]), y0 = Math.floor(p.pos[1]) - 1, z0 = Math.floor(p.pos[2]);
  for (let dz = -10; dz <= 4; dz++) for (let dx = -6; dx <= 6; dx++) {
    for (let dy = -4; dy <= 0; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, stone);
    for (let dy = 1; dy <= 8; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, air);
  }
  p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.vel = [0, 0, 0]; p.yaw = 0; p.pitch = 0;
  return { x0, y0, z0 };
});
const at = (dx, dy, dz, yaw = 0, pitch = 0) => g(({ x0, y0, z0, dx, dy, dz, yaw, pitch }) => { const p = __pc.player; p.pos = [x0 + dx, y0 + dy, z0 + dz]; p.vel = [0, 0, 0]; p.yaw = yaw; p.pitch = pitch; }, { ...pad, dx, dy, dz, yaw, pitch });
await frames(40);

// 1. Sneaking at an edge: you stop; walking: you fall.
await g(({ x0, y0, z0 }) => { const air = __pc.names.indexOf('air'); for (let dz = -6; dz <= -3; dz++) for (let dx = -2; dx <= 2; dx++) for (let dy = -3; dy <= 0; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, air); }, pad);
await at(0.5, 1, 0.5);
await frames(20);
await hold(['KeyC', 'KeyW'], 120);
const sneaked = await P();
console.log('sneaking toward a drop', JSON.stringify(sneaked));
if (sneaked.pos[1] < pad.y0 + 0.99 || sneaked.pos[2] < pad.z0 - 2.4) fail('sneaking walked off the edge');
await hold(['KeyW'], 60);
const walked = await P();
console.log('walking toward it', JSON.stringify(walked));
if (walked.pos[1] > pad.y0 + 0.5) fail('walking did not go over the edge');

// 2. A ladder up a wall: walk into it to climb.
await g(({ x0, y0, z0 }) => {
  const stone = __pc.names.indexOf('stone'), ladder = __pc.names.indexOf('ladder');
  for (let dy = 1; dy <= 6; dy++) { __pcTest.edit(x0 + 4, y0 + dy, z0 - 1, stone); __pcTest.edit(x0 + 4, y0 + dy, z0, ladder); }
  __pcTest.edit(x0 + 4, y0 + 7, z0 - 1, stone);
}, pad);
await at(4.5, 1, 1.5, 0, 0);
await frames(30);
await hold(['KeyW'], 150);
const climbed = await P();
console.log('up the ladder', JSON.stringify(climbed));
if (climbed.pos[1] < pad.y0 + 4) fail('could not climb the ladder');
await shot('m1-ladder');

// 3. Sprint-swimming underwater is faster than swimming.
await g(({ x0, y0, z0 }) => {
  const water = __pc.names.indexOf('water');
  for (let dz = -10; dz <= -7; dz++) for (let dx = -6; dx <= 6; dx++) for (let dy = -3; dy <= 1; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, water);
}, pad);
const swim = async (keys) => {
  await at(-5.5, -2, -8.5, -Math.PI / 2, 0);
  await frames(10);
  const a = await P();
  await hold(keys, 60);
  const b = await P();
  return +(b.pos[0] - a.pos[0]).toFixed(2);
};
const plain = await swim(['KeyW']);
const fast = await swim(['KeyW', 'ShiftLeft']);
console.log('underwater over 1 s: swimming', plain, 'sprint-swimming', fast);
if (!(fast > plain * 1.5)) fail('sprint-swimming is not faster');

// 4. Faint drops: Charmander beats a wild Magikarp, which leaves fish.
await at(0.5, 1, 2.5, Math.PI, 0);
await g(() => { const p = __pc.player; const e = __pc.ents.makeMon('Magikarp', 3, p.pos[0], p.pos[1], p.pos[2] + 4); __pcTest.startBattle('wild', e); });
await page.waitForFunction(() => __pc.runner.screen_name() === 'Battle', null, { timeout: 15000 });
for (let i = 0; i < 120 && (await g(() => __pc.mode)) !== 'world'; i++) await press('KeyZ', 25);
const fish = await g(() => ({ cod: __pc.inv.count('cod'), toast: document.getElementById('toast').textContent }));
console.log('after beating Magikarp', JSON.stringify(fish));
if (!(fish.cod > 0) || !/fainted/.test(fish.toast)) fail('a fainted Magikarp dropped no fish');

// 5. Feeding your partner heals it.
await g(() => { __pc.runner.hurt_party(0, 8); __pcTest.updateParty(); });
await frames(20);
const fed = await g(() => {
  const f = __pc.ents.follower, p = __pc.player;
  f.pos = [p.pos[0], p.pos[1], p.pos[2] - 2]; f.root.position.set(...f.pos);
  const e = p.eye(), dx = f.pos[0] - e[0], dy = f.pos[1] + 0.5 - e[1], dz = f.pos[2] - e[2];
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  __pc.inv.slots[2] = { id: 'sweet_berries', n: 3 }; __pc.inv.sel = 2;
  return __pc.party[0].hp;
});
await frames(3);
await press('KeyF', 20);
const after = await g(() => ({ hp: __pc.party[0].hp, berries: __pc.inv.count('sweet_berries') }));
console.log('fed berries: HP', fed, '->', after.hp, 'berries left', after.berries);
if (!(after.hp > fed) || after.berries !== 2) fail('feeding the partner did not heal it');

// 6. A Bug/Grass partner: sneak through tall grass and weaker wild Pokémon stay hidden.
await g(({ x0, y0, z0 }) => {
  const grass = __pc.names.indexOf('grass_block'), tall = __pc.names.indexOf('short_grass');
  for (let dz = -2; dz <= 3; dz++) for (let dx = -6; dx <= -4; dx++) { __pcTest.edit(x0 + dx, y0, z0 + dz, grass); __pcTest.edit(x0 + dx, y0 + 1, z0 + dz, tall); }
  __pcTest.forceLead({ species: 'Butterfree', types: ['Bug', 'Flying'], hp: 40, max_hp: 40, level: 30 });
  __pc.party[0].level = 30; // stronger than anything near spawn
  __pc.grace = 0;
}, pad);
await at(-4.5, 1, 3.5, 0, -0.1);
await frames(10);
await g(() => { __pc.grace = 0; __pc._r = Math.random; Math.random = () => 0.01; });
await hold(['KeyC', 'KeyW'], 120);
await g(() => { Math.random = __pc._r; __pcTest.forceLead(null); });
await frames(10);
const repelled = await g(() => ({ mode: __pc.mode, battle: !!__pc.battle }));
console.log('sneaking through grass with a strong Bug partner', JSON.stringify(repelled));
if (repelled.battle) fail('a weaker Pokémon jumped out despite the Bug partner');
for (let i = 0; i < 20 && (await g(() => __pc.mode)) !== 'world'; i++) await press('KeyX', 20);
await g(() => { __pc.grace = 1e9; __pcTest.updateParty(); });

// 7. Riding: Tauros on land, Lapras on water, Pidgeot in the air. Each is
// made the lead by fainting the rest of the party.
const lead = async (species) => {
  await g((sp) => { __pc.runner.give_pokemon(sp, 30); }, species);
  await frames(10);
  await g((sp) => {
    const party = JSON.parse(__pc.runner.party_summary());
    party.forEach((m, i) => { if (m.species !== sp) __pc.runner.hurt_party(i, 999); });
    __pcTest.updateParty();
  }, species);
  await frames(5);
  return g(() => __pc.party.find((m) => m.hp > 0)?.species);
};
console.log('lead now', await lead('Tauros'));
await at(0.5, 1, 3.5, Math.PI / 2, 0);
await frames(10);
await press('KeyV', 10);
const riding = await g(() => __pc.riding && __pc.riding.species);
await g(() => { const p = __pc.player; p.yaw = -Math.PI / 2; });
const r0 = await P();
await hold(['KeyW'], 60);
const r1 = await P();
const rideSpeed = Math.abs(r1.pos[0] - r0.pos[0]);
console.log('riding', riding, 'moved', rideSpeed.toFixed(2), 'blocks in 1 s');
if (riding !== 'Tauros' || !(rideSpeed > 5.5)) fail('riding Tauros is not fast');
await shot('m2-riding');
await press('KeyV', 10);

console.log('lead now', await lead('Lapras'));
await at(-4.5, 1.5, -8.5, 0, 0); // in the pool
await frames(10);
await press('KeyV', 10);
await g(() => { __pc.player.yaw = -Math.PI / 2; });
await hold(['KeyW'], 60);
const surf = await g(() => ({ riding: __pc.riding && __pc.riding.kind, ...{ pos: __pc.player.pos.map((v) => +v.toFixed(2)), water: __pc.player.inWater } }));
console.log('surfing', JSON.stringify(surf));
if (surf.riding !== 'surf' || surf.water || surf.pos[1] < pad.y0 + 1.5) fail('surfing on Lapras failed');
await shot('m3-surf');
await press('KeyV', 10);

console.log('lead now', await lead('Pidgeot'));
await at(0.5, 1, 2.5, 0, 0);
await frames(10);
await press('KeyV', 10);
await hold(['Space'], 60);
const flew = await P();
console.log('flying up', JSON.stringify(flew));
if (flew.pos[1] < pad.y0 + 4) fail('flying on Pidgeot did not climb');
await shot('m4-fly');
await hold(['KeyC'], 120);
const landed = await g(() => ({ hp: __pc.surv.hp, y: __pc.player.pos[1] }));
console.log('flew back down', JSON.stringify(landed));
if (landed.hp < 20) fail('took damage flying down');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'MOVE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
