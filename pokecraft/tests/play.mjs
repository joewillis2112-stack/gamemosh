// Headless phone pass over the whole loop, first person:
// new world → walk → START menu over the world → mine a block and put it back
// → throw a ball at a wild Pokémon and run from the battle → a trainer
// battle → the Nurse → save, reload, continue (position, bag, mined blocks).
// Usage: node pokecraft/tests/play.mjs [outDir]
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
const quiet = () => g(() => { document.getElementById('toast').hidden = true; });
// Through text and menus back to walking; in a battle, B, B, then RUN.
const toWorld = async () => {
  for (let i = 0; i < 30 && (await g(() => __pc.mode)) !== 'world'; i++) {
    await press('KeyX', 30); await press('KeyX', 30);
    if ((await g(() => __pc.runner.screen_name())) !== 'Battle') continue;
    await press('ArrowRight', 8); await press('ArrowDown', 8); await press('KeyZ', 40);
  }
  await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 30000 });
};

// 1. New world.
await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'gamemosh');
await page.click('#starters button[data-starter="charmander"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await frames(60);
await quiet();
const start = await g(() => ({ pos: __pc.player.pos, party: __pc.party.map((p) => p.species), worker: __pc.world.mode }));
console.log('world', JSON.stringify(start));
if (start.party[0] !== 'Charmander') fail('starter not in party');
if (start.worker !== 'worker') fail('world is not generating in a worker');
await shot('p1-spawn');

// 2. Walk.
await g(() => { __pc.player.pitch = -0.1; });
await hold('KeyW', 90);
const walked = await g(() => __pc.player.pos);
console.log('walked', JSON.stringify(walked.map((v) => +v.toFixed(2))));
if (Math.hypot(walked[0] - start.pos[0], walked[2] - start.pos[2]) < 1) fail('did not walk');

// 3. START menu over the world.
await toWorld();
await press('Enter', 30);
const menu = await g(() => ({ mode: __pc.mode, screen: __pc.runner.screen_name(), opaque: __pc.opaque }));
console.log('start menu', JSON.stringify(menu));
if (menu.screen !== 'StartMenu' || !(menu.opaque > 1000 && menu.opaque < 160 * 144)) fail('START menu is not drawn over the world');
await shot('p2-start-menu');
await press('KeyX', 30);
await frames(10);
if ((await g(() => __pc.mode)) !== 'world') fail('B did not close the START menu');

// 4. Mine the block ahead and below, then put it back.
await g(() => { __pc.player.pitch = -1.0; __pc.ents.clearAll(); });
await frames(5);
const target = await g(() => { const h = __pcTest.targetBlock(); return h && { x: h.x, y: h.y, z: h.z, name: __pcTest.blockAt(h.x, h.y, h.z) }; });
console.log('target', JSON.stringify(target));
if (!target) fail('no block under the crosshair');
else {
  // Hold B until that one block breaks.
  await page.keyboard.down('KeyX');
  await page.waitForFunction((t) => __pcTest.blockAt(t.x, t.y, t.z) === 'air', target, { timeout: 20000 }).catch(() => {});
  await page.keyboard.up('KeyX');
  await frames(10);
  const mined = await g((t) => ({ now: __pcTest.blockAt(t.x, t.y, t.z), inv: __pc.inv.slots.filter(Boolean).map((s) => s.id + ':' + s.n) }), target);
  console.log('mined', JSON.stringify(mined));
  if (mined.now !== 'air') fail(`block not mined (${mined.now})`);
  await shot('p3-mined');
  // Same aim: the ray now passes through the gap to the block behind it,
  // and USE places the held block into the gap.
  const slot = await g(() => { __pc.inv.add('dirt', 4); return __pc.inv.slots.findIndex((s) => s && s.id === 'dirt'); });
  if (slot < 0 || slot > 8) fail('dirt not in the hotbar');
  else {
    await press(`Digit${slot + 1}`, 4);
    await press('KeyF', 20);
    const placed = await g((t) => __pcTest.blockAt(t.x, t.y, t.z), target);
    console.log('placed back', placed);
    if (placed !== 'dirt') fail('could not place the block back');
  }
}

// 5. A wild Pokémon: turn to it, throw a ball, the battle starts where it stands; run.
await g(() => { __pc.player.pitch = 0; __pc.ents.timer = 49; });
await page.waitForFunction(() => __pc.ents.list.some((e) => e.kind === 'wild'), null, { timeout: 60000 });
const wild = await g(() => {
  const p = __pc.player;
  const e = __pc.ents.list.filter((x) => x.kind === 'wild').sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];
  e.aggressive = false; e.wander = false; e.slow = true;
  // Stand it 6 blocks in front and aim at it.
  const gr = __pc.ents.ground(p.pos[0] - Math.sin(p.yaw) * 6, p.pos[1] + 3, p.pos[2] - Math.cos(p.yaw) * 6);
  if (gr) e.pos = [p.pos[0] - Math.sin(p.yaw) * 6, gr.y, p.pos[2] - Math.cos(p.yaw) * 6];
  const dx = e.pos[0] - p.pos[0], dz = e.pos[2] - p.pos[2], dy = e.pos[1] + 0.5 - (p.pos[1] + 1.62);
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return { species: e.species, level: e.level };
});
await frames(3);
const aim = await g(() => { const p = __pc.player; const e = __pc.ents.pick(p.eye(), p.look(), 28); return e ? e.kind + ':' + e.species : null; });
console.log('wild', JSON.stringify(wild), 'under the crosshair:', aim);
await press('KeyQ', 60);
await page.waitForFunction(() => __pc.runner.screen_name() === 'Battle', null, { timeout: 15000 }).catch(() => fail('throwing a ball did not start a battle'));
await frames(240);
const view = await g(() => JSON.parse(__pc.runner.battle_view()));
console.log('battle view', JSON.stringify(view));
await shot('p4-wild-battle');
if (!view || view.enemy !== wild.species) fail('battle is not against the Pokémon we hit');
if (!(await g(() => __pc.battle && __pc.battle.enemyRoot && __pc.battle.enemyRoot.visible && __pc.battle.monRoot && __pc.battle.monRoot.visible))) fail('the two Pokémon are not standing in the world');
await toWorld();
const after = await g(() => ({ mode: __pc.mode, battle: !!__pc.battle }));
console.log('after wild', JSON.stringify(after));
if (after.battle) fail('battle staging not cleared');

// 6. A trainer walks up: trainer battle in the world (ended by force: no running from trainers).
await g(() => {
  const ents = __pc.ents, p = __pc.player;
  const t = ents.pickTrainer();
  const x = p.pos[0] - Math.sin(p.yaw) * 6, z = p.pos[2] - Math.cos(p.yaw) * 6;
  const gr = ents.ground(x, p.pos[1] + 3, z);
  const e = ents.makeNpc('trainer', t.npc, x, gr ? gr.y : p.pos[1], z, { trainer: t, sees: 9 });
  window.__trainer = t;
});
await page.waitForFunction(() => __pc.runner.screen_name() === 'Battle', null, { timeout: 30000 }).catch(() => fail('trainer never challenged us'));
await frames(300);
const tv = await g(() => ({ view: JSON.parse(__pc.runner.battle_view()), cls: window.__trainer.cls }));
console.log('trainer battle', JSON.stringify(tv));
if (!tv.view || tv.view.wild) fail('trainer battle is not a trainer battle');
await shot('p5-trainer');
await g(() => { __pc.runner.warp_to('PalletTown', 0, 0); });
await toWorld();

// 7. The Nurse heals and sets where you wake up.
const nurse = await g(() => {
  const ents = __pc.ents, p = __pc.player;
  const x = p.pos[0] - Math.sin(p.yaw) * 2, z = p.pos[2] - Math.cos(p.yaw) * 2;
  ents.makeNpc('nurse', 'nurse', x, p.pos[1], z, { still: true });
  const dx = x - p.pos[0], dz = z - p.pos[2];
  p.yaw = Math.atan2(-dx, -dz); p.pitch = -0.1;
  return [x, z];
});
await frames(4);
console.log('nurse at', JSON.stringify(nurse), await g(() => { const p = __pc.player; const e = __pc.ents.pick(p.eye(), p.look(), 4.5); return JSON.stringify({ me: p.pos, pick: e && e.kind, mode: __pc.mode }); }));
await press('KeyF', 20);
const healed = await g(() => ({ spawn: __pc.g.spawn, toast: document.getElementById('toast').textContent }));
console.log('nurse', JSON.stringify(healed));
if (!/NURSE/.test(healed.toast)) fail('the Nurse did not talk');
await shot('p6-nurse');

// 8. Save, reload, continue.
const before = await g(() => { __pcTest.saveAll('test'); return { pos: __pc.player.pos, inv: JSON.stringify(__pc.inv.save()) }; });
await page.reload();
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-continue');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await frames(60);
const back = await g(() => ({ pos: __pc.player.pos, inv: JSON.stringify(__pc.inv.save()), party: __pc.party.map((p) => p.species) }));
console.log('continued', JSON.stringify({ pos: back.pos.map((v) => +v.toFixed(2)), party: back.party }));
if (Math.hypot(back.pos[0] - before.pos[0], back.pos[2] - before.pos[2]) > 0.5) fail('continue lost the position');
if (back.inv !== before.inv) fail('continue lost the inventory');
await shot('p7-continue');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'PLAY OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
