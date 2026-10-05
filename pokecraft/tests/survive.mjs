// Headless pass over the gameplay systems: the bag and crafting screens,
// mining with and without the right tool, Pokémon jumping out of tall grass,
// gentle Pokémon by day and aggressive ones at night, Minecraft's night
// monsters, fishing, Poké item crafting, eating, falling, dying and waking up.
// Usage: node pokecraft/tests/survive.mjs [outDir]
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
const toWorld = async () => {
  for (let i = 0; i < 30 && (await g(() => __pc.mode)) !== 'world'; i++) {
    await press('KeyX', 30); await press('KeyX', 30);
    if ((await g(() => __pc.runner.screen_name())) !== 'Battle') continue;
    await press('ArrowRight', 8); await press('ArrowDown', 8); await press('KeyZ', 40);
  }
  await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 30000 });
};

await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'survive');
await page.click('#starters button[data-starter="bulbasaur"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await frames(30);
// Quiet world: no spawns unless a step asks for them.
const calm = () => g(() => {
  document.getElementById('toast').hidden = true;
  __pc.ents.clearAll(); __pc.mobs.clearAll();
  __pc.ents.trainerTimer = 1e9; __pc.ents.merchantTimer = 1e9;
  __pc.ents._spawnWild = __pc.ents._spawnWild || __pc.ents.spawnWild; __pc.ents.spawnWild = () => {};
  __pc.mobs.spawn = () => {};
  __pc.grace = 0;
});
await calm();
const start = await g(() => ({ inv: __pc.inv.slots.filter(Boolean).map((s) => s.id + ':' + s.n), hp: __pc.surv.hp, food: __pc.surv.food }));
console.log('start', JSON.stringify(start));
if (!start.inv.includes('bread:4') || start.hp !== 20) fail('new world kit / health wrong');

// A flat stone pad, two blocks of air above it.
const pad = await g(() => {
  const p = __pc.player, stone = __pc.names.indexOf('stone'), air = __pc.names.indexOf('air');
  const x0 = Math.floor(p.pos[0]), y0 = Math.floor(p.pos[1]) - 1, z0 = Math.floor(p.pos[2]);
  for (let dz = -8; dz <= 3; dz++) for (let dx = -4; dx <= 4; dx++) {
    __pcTest.edit(x0 + dx, y0, z0 + dz, stone);
    for (let dy = 1; dy <= 5; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, air);
  }
  p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.vel = [0, 0, 0]; p.yaw = 0; p.pitch = 0;
  __pc.g.time = 3000;
  return { x0, y0, z0 };
});
await frames(40);

// 1. The bag: E opens it with names; crafting from logs to a pickaxe.
await press('KeyE', 10);
const bag = await g(() => ({ open: __pc.inv.open, shown: !document.getElementById('inv').hidden, slots: document.querySelectorAll('#inv .islot').length, title: document.querySelector('#inv .islot[title]')?.title }));
console.log('bag', JSON.stringify(bag));
if (!bag.open || !bag.shown || bag.slots !== 36 || !bag.title) fail('inventory screen did not open with 36 named slots');
await shot('s1-bag');
await g(() => { __pc.inv.add('oak_log', 5); __pc.inv.add('cobblestone', 3); });
await page.click('#inv-tabs button[data-tab="craft"]');
const clickRow = async (label) => {
  const ok = await g((l) => { const r = [...document.querySelectorAll('#inv-body .irow:not(.off)')].find((x) => x.querySelector('b').textContent.startsWith(l)); if (r) r.click(); return !!r; }, label);
  if (!ok) fail(`no craftable row "${label}"`);
};
await clickRow('Oak Planks'); await clickRow('Oak Planks'); await clickRow('Oak Planks');
await clickRow('Stick');
await clickRow('Crafting Table');
const crafted = await g(() => ({ planks: __pc.inv.count('oak_planks'), sticks: __pc.inv.count('stick'), table: __pc.inv.count('crafting_table'), pickRow: [...document.querySelectorAll('#inv-body .irow')].find((x) => /Stone Pickaxe/.test(x.textContent))?.className }));
console.log('crafted', JSON.stringify(crafted));
if (crafted.table !== 1 || crafted.sticks < 4) fail('crafting planks / sticks / table failed');
if (crafted.pickRow && !/off/.test(crafted.pickRow)) fail('a 3x3 recipe was allowed without a crafting table');
await shot('s2-craft');
await press('KeyE', 6);
if (await g(() => __pc.inv.open)) fail('E did not close the bag');
// Place the table and craft at it.
await g(({ x0, y0, z0 }) => { const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.yaw = 0; p.pitch = -0.75; const i = __pc.inv.slots.findIndex((s) => s && s.id === 'crafting_table'); __pc.inv.slots[i] = null; __pc.inv.slots[2] = { id: 'crafting_table', n: 1 }; __pc.inv.sel = 2; }, pad);
await frames(4);
await press('KeyF', 10);
const table = await g(() => __pcTest.nearBlock(/^crafting_table$/));
if (!table) fail('crafting table not placed');
await press('KeyF', 10);
const atTable = await g(() => ({ open: __pc.inv.open, tab: __pc.inv.tab }));
if (!atTable.open || atTable.tab !== 'craft') fail('using the crafting table did not open crafting');
await clickRow('Stone Pickaxe');
await clickRow('Wooden Sword');
const tools = await g(() => ({ pick: __pc.inv.count('stone_pickaxe'), sword: __pc.inv.count('wooden_sword') }));
console.log('tools', JSON.stringify(tools));
if (tools.pick !== 1 || tools.sword !== 1) fail('crafting tools at the table failed');
await shot('s3-table');
await g(() => __pc.inv.hide());

// 2. Mining: stone by hand gives nothing; with a pickaxe, cobblestone.
const mineAt = async (x, y, z, tool) => {
  await g(({ x, y, z, tool }) => {
    __pcTest.edit(x, y, z, __pc.names.indexOf('stone'));
    const p = __pc.player;
    const i = tool ? __pc.inv.slots.findIndex((s) => s && s.id === tool) : -1;
    if (tool) { const t = __pc.inv.slots[i]; __pc.inv.slots[i] = __pc.inv.slots[5]; __pc.inv.slots[5] = t; __pc.inv.sel = 5; } else { __pc.inv.sel = 8; __pc.inv.slots[8] = null; }
    const dx = x + 0.5 - p.pos[0], dz = z + 0.5 - p.pos[2], dy = y + 0.5 - (p.pos[1] + 1.62);
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, { x, y, z, tool });
  await frames(4);
  const before = await g(() => __pc.inv.count('cobblestone'));
  await page.keyboard.down('KeyX');
  await page.waitForFunction(({ x, y, z }) => __pcTest.blockAt(x, y, z) === 'air', { x, y, z }, { timeout: 30000 }).catch(() => {});
  await page.keyboard.up('KeyX');
  return g(({ x, y, z, before }) => ({ now: __pcTest.blockAt(x, y, z), got: __pc.inv.count('cobblestone') - before }), { x, y, z, before });
};
await g(({ x0, y0, z0 }) => { const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; }, pad);
const t0 = Date.now();
const hand = await mineAt(pad.x0 + 2, pad.y0 + 1, pad.z0 - 2, null);
const handMs = Date.now() - t0;
const t1 = Date.now();
const pick = await mineAt(pad.x0 - 2, pad.y0 + 1, pad.z0 - 2, 'stone_pickaxe');
const pickMs = Date.now() - t1;
console.log('mining by hand', JSON.stringify(hand), handMs, 'ms; with a stone pickaxe', JSON.stringify(pick), pickMs, 'ms');
if (hand.now !== 'air' || hand.got !== 0) fail('stone by hand should break and drop nothing');
if (pick.now !== 'air' || pick.got !== 1) fail('stone with a pickaxe should drop cobblestone');
if (!(pickMs < handMs)) fail('the pickaxe was not faster');

// 3. Poké crafting: iron + red dye + a button make POKé BALLs in Pokémon's bag.
await g(() => { __pc.inv.add('iron_ingot', 1); __pc.inv.add('red_dye', 1); __pc.inv.add('stone_button', 1); __pc.inv.show('poke'); });
const balls0 = await g(() => JSON.parse(__pc.runner.export_live_save()));
await clickRow('POKé BALL');
const balls1 = await g(() => JSON.parse(__pc.runner.export_live_save()));
const count = (s) => { const it = s.game_data.bag.items.find(([n]) => n === 'PokeBall'); return it ? it[1] : 0; };
console.log('poke balls', count(balls0), '->', count(balls1), 'iron left', await g(() => __pc.inv.count('iron_ingot')));
if (await g(() => __pc.inv.count('iron_ingot')) !== 0) fail('Poké crafting did not use the iron');
if (count(balls1) !== count(balls0) + 3) fail('Poké crafting did not add POKé BALLs');
await shot('s4-poke-craft');
await g(() => __pc.inv.hide());

// 4. Tall grass: walking through it makes Pokémon jump out (a gentle one by day).
await calm();
await g(({ x0, y0, z0 }) => {
  const grass = __pc.names.indexOf('grass_block'), tall = __pc.names.indexOf('short_grass');
  for (let dz = -6; dz <= 0; dz++) for (let dx = -1; dx <= 1; dx++) { __pcTest.edit(x0 + dx, y0, z0 + dz, grass); __pcTest.edit(x0 + dx, y0 + 1, z0 + dz, tall); }
  const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.yaw = 0; p.pitch = -0.1; __pc.g.time = 3000;
}, pad);
await frames(20);
const terrain = await g(() => __pcTest.terrainHere());
console.log('standing in', terrain);
if (terrain !== 'grass') fail('tall grass not detected under the player');
await g(() => { __pc.grace = 0; __pc._rand = Math.random; Math.random = () => 0.01; });
await hold('KeyW', 40);
await g(() => { Math.random = __pc._rand; });
await page.waitForFunction(() => __pc.runner.screen_name() === 'Battle', null, { timeout: 15000 }).catch(() => fail('no Pokémon jumped out of the grass'));
const grassMon = await g(() => __pc.battle && { species: __pc.battle.ent.species, hidden: !!__pc.battle.ent.hidden });
console.log('grass encounter', JSON.stringify(grassMon));
await frames(200);
await shot('s5-grass-battle');
await toWorld();
const gone = await g(() => !__pc.ents.list.some((e) => e.hidden));
if (!gone) fail('the grass Pokémon stayed in the world after the battle');
// Off the grass, by day: nothing jumps out however unlucky you are.
await g(({ x0, y0, z0 }) => { const p = __pc.player; p.pos = [x0 + 3.5, y0 + 1, z0 + 0.5]; __pc.grace = 0; __pc._rand = Math.random; Math.random = () => 0.01; }, pad);
await hold('KeyW', 40);
await g(() => { Math.random = __pc._rand; });
await frames(10);
if (await g(() => __pc.mode !== 'world' || !!__pc.battle)) { fail('a Pokémon jumped out on bare stone by day'); await toWorld(); }

// 5. By day roaming Pokémon leave you alone; at night they're scary and come for you.
await calm();
const roam = await g(() => {
  const ents = __pc.ents;
  __pc.g.time = 3000;
  for (let i = 0; i < 30; i++) ents._spawnWild();
  const day = ents.list.filter((e) => e.kind === 'wild').map((e) => [e.species, e.aggressive]);
  ents.clearAll();
  __pc.g.time = 16000;
  for (let i = 0; i < 30; i++) ents._spawnWild();
  const night = ents.list.filter((e) => e.kind === 'wild').map((e) => [e.species, e.aggressive]);
  return { day, night };
});
console.log('day roamers', JSON.stringify(roam.day.map((x) => x[0])));
console.log('night roamers', JSON.stringify(roam.night.map((x) => x[0])));
if (!roam.day.length || roam.day.some((x) => x[1])) fail('day roamers missing or aggressive');
if (!roam.night.length || roam.night.some((x) => !x[1])) fail('night roamers missing or not aggressive');
// One of them charges at you.
await g(() => {
  const p = __pc.player, e = __pc.ents.list.find((x) => x.kind === 'wild');
  __pc.ents.list.filter((x) => x !== e).forEach((x) => __pc.ents.remove(x));
  const gr = __pc.ents.ground(p.pos[0] - Math.sin(p.yaw) * 7, p.pos[1] + 2, p.pos[2] - Math.cos(p.yaw) * 7);
  e.pos = [p.pos[0] - Math.sin(p.yaw) * 7, gr ? gr.y : p.pos[1], p.pos[2] - Math.cos(p.yaw) * 7];
  e.cooldown = 0;
});
await shot('s6-night-roamer');
await page.waitForFunction(() => __pc.runner.screen_name() === 'Battle', null, { timeout: 30000 }).catch(() => fail('the night Pokémon never attacked'));
await frames(60);
await toWorld();

// 6. Minecraft's night: a zombie hurts you, your sword and your Pokémon fight back.
await calm();
const zombie = await g(() => {
  const p = __pc.player;
  __pc.g.time = 16000;
  window.__z = __pc.mobs.make('zombie', p.pos[0] - Math.sin(p.yaw) * 4, p.pos[1], p.pos[2] - Math.cos(p.yaw) * 4);
  return !!window.__z;
});
if (!zombie) fail('could not make a zombie');
await frames(20);
await shot('s7-zombie');
await page.waitForFunction(() => __pc.surv.hp < 20, null, { timeout: 30000 }).catch(() => fail('the zombie never hit'));
const hurt = await g(() => __pc.surv.hp);
await g(() => {
  const i = __pc.inv.slots.findIndex((s) => s && s.id === 'wooden_sword');
  const t = __pc.inv.slots[i]; __pc.inv.slots[i] = __pc.inv.slots[4]; __pc.inv.slots[4] = t; __pc.inv.sel = 4;
});
// Keep facing it while holding attack.
for (let i = 0; i < 40 && (await g(() => __pc.mobs.list.includes(window.__z))); i++) {
  await g(() => {
    const p = __pc.player, m = window.__z;
    const dx = m.body.pos[0] - p.pos[0], dz = m.body.pos[2] - p.pos[2], dy = m.body.pos[1] + 1 - (p.pos[1] + 1.62);
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  });
  await page.keyboard.down('KeyX'); await frames(15); await page.keyboard.up('KeyX');
}
if (await g(() => __pc.mobs.list.includes(window.__z))) fail('could not kill the zombie');
const after = await g(() => ({ hp: __pc.surv.hp, flesh: __pc.inv.count('rotten_flesh') }));
console.log('zombie hit us to', hurt, 'hp; after the fight', JSON.stringify(after));

// 7. Eating: hold USE with bread.
await calm();
await g(() => { __pc.g.time = 3000; __pc.surv.food = 10; const i = __pc.inv.slots.findIndex((s) => s && s.id === 'bread'); const t = __pc.inv.slots[i]; __pc.inv.slots[i] = __pc.inv.slots[3]; __pc.inv.slots[3] = t; __pc.inv.sel = 3; __pc.player.pitch = 1.2; });
await hold('KeyF', 130);
const ate = await g(() => ({ food: __pc.surv.food, bread: __pc.inv.count('bread') }));
console.log('ate', JSON.stringify(ate));
if (!(ate.food > 10) || ate.bread !== 3) fail('eating bread did not work');

// 8. Fishing: cast at water, a bite, reel in.
await g(({ x0, y0, z0 }) => {
  const water = __pc.names.indexOf('water');
  for (let dz = -6; dz <= -3; dz++) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 0; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, water);
  const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 0.5]; p.yaw = 0; p.pitch = -0.45;
  __pc.inv.slots[7] = { id: 'fishing_rod', n: 1 }; __pc.inv.sel = 7;
}, pad);
await frames(30);
await press('KeyF', 6);
const cast = await g(() => !!__pc.fishing);
if (!cast) fail('could not cast at the water');
await g(() => { __pc.fishing.t = 0.02; });
await page.waitForFunction(() => __pc.fishing && __pc.fishing.phase === 'bite', null, { timeout: 10000 }).catch(() => fail('no bite'));
await shot('s8-bite');
await g(() => { __pc._rand = Math.random; Math.random = () => 0.9; }); // not a Pokémon: a fish
await press('KeyF', 6);
await g(() => { Math.random = __pc._rand; });
const fish = await g(() => ({ cod: __pc.inv.count('cod'), salmon: __pc.inv.count('salmon'), any: __pc.inv.slots.filter(Boolean).map((s) => s.id) }));
console.log('fished', JSON.stringify(fish));
if (!fish.any.some((id) => /cod|salmon|pufferfish|stick|string|bone|lily_pad|leather/.test(id))) fail('reeling in caught nothing');

// 9. Falling hurts; dying shows the screen; respawn wakes you at your bed with full hearts.
await calm();
await g(({ x0, y0, z0 }) => { __pc.surv.hp = 20; const p = __pc.player; p.pos = [x0 + 3.5, y0 + 12, z0 + 0.5]; p.vel = [0, 0, 0]; }, pad);
await page.waitForFunction(() => !__pc.player.onGround, null, { timeout: 20000 });
await page.waitForFunction(() => __pc.player.onGround, null, { timeout: 20000 });
await frames(5);
const fell = await g(() => __pc.surv.hp);
console.log('fell 11 blocks: hp', fell);
if (!(fell < 20 && fell > 6)) fail('fall damage wrong');
await g(() => { __pc.surv.hurtCool = 0; __pc.surv.hurt(40, 'zombie'); });
await frames(5);
const dead = await g(() => ({ shown: !document.getElementById('dead').hidden, why: document.getElementById('dead-why').textContent }));
console.log('dead', JSON.stringify(dead));
if (!dead.shown) fail('no death screen');
await shot('s9-dead');
await page.click('#respawn');
await frames(10);
const woke = await g(() => ({ hp: __pc.surv.hp, dead: __pc.surv.dead, pos: __pc.player.pos, spawn: __pc.g.spawn, inv: __pc.inv.count('stone_pickaxe') }));
console.log('respawned', JSON.stringify(woke));
if (woke.dead || woke.hp !== 20 || Math.hypot(woke.pos[0] - woke.spawn[0], woke.pos[2] - woke.spawn[2]) > 0.5) fail('respawn wrong');
if (woke.inv !== 1) fail('dying lost your things');

// 10. Torches light the night.
await g(({ x0, y0, z0 }) => {
  __pc.g.time = 18000;
  const p = __pc.player; p.pos = [x0 + 0.5, y0 + 1, z0 + 2.5]; p.yaw = 0; p.pitch = -0.3;
  __pcTest.edit(x0, y0 + 1, z0 - 1, __pc.names.indexOf('torch'));
}, pad);
await frames(60);
await shot('s10-torch');

// 11. Save and continue keeps the bag and the hearts.
const before = await g(() => { __pc.surv.food = 13; __pcTest.saveAll('test'); return JSON.stringify([__pc.inv.save(), __pc.surv.save()]); });
await page.reload();
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-continue');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await frames(30);
const back = await g(() => JSON.stringify([__pc.inv.save(), __pc.surv.save()]));
if (back !== before) fail(`continue changed the bag or hearts:\n${before}\n${back}`);
await shot('s11-continue');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'SURVIVE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
