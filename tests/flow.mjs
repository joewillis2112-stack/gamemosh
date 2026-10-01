// End-to-end journey: rest, level up, trade, open a chest, torch, firebomb, kill a boss,
// light every beacon, reach the ending, save and continue.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] || 'test-output';
await mkdir(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 600 } })).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message, e.stack && e.stack.split('\n').slice(0, 4).join(' / ')); });
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', null, { timeout: 90000 });
console.log('at title');
await page.evaluate(() => window.__game.startNew('flow-test'));
console.log('started');
await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 120000 });
await page.evaluate(() => {
  window.__gsleep = (sec) => new Promise((res) => {
    const g = window.__game;
    const t0 = g.state.stats.playTime;
    const tick = () => (g.state.stats.playTime - t0 >= sec || g.mode !== 'play' ? res() : setTimeout(tick, 30));
    tick();
  });
});
console.log('playing');
const results = {};
const check = (name, v) => { results[name] = v; console.log("step", name, v); };

// 1. Rest at the starting shrine (player spawns next to it)
const rest = await page.evaluate(async () => {
  const g = window.__game;
  await window.__gsleep(0.3);
  const it = g.nearInteract;
  const label = it && it.action;
  g.state.player.embers = 5000;
  g.input.press('interact'); await window.__gsleep(0.05); g.input.release('interact');
  await new Promise((r) => setTimeout(r, 300));
  return { label, mode: g.mode, shrineOpen: !document.getElementById('shrine').hidden };
});
check('rest', rest.label === 'rest' && rest.mode === 'paused' && rest.shrineOpen);
await page.screenshot({ path: `${out}/f1-shrine.png` });
const lvl = await page.evaluate(async () => {
  const g = window.__game;
  const before = g.state.player.level;
  document.querySelector('[data-stat="vigor"]').click();
  document.querySelector('[data-stat="might"]').click();
  document.querySelector('#shrine [data-stab="travel"]').click();
  document.querySelector('#shrine [data-stab="forge"]').click();
  document.querySelector('#shrine [data-stab="craft"]').click();
  return { before, after: g.state.player.level, vigor: g.state.player.stats.vigor };
});
check('levelup', lvl.after === lvl.before + 2 && lvl.vigor === 2);
await page.screenshot({ path: `${out}/f2-craft.png` });
await page.evaluate(() => document.getElementById('s-leave').click());

// 2. Merchant at the starting shrine
const trade = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.locations.interactables.find((i) => i.action === 'trade');
  if (!m) return { found: false };
  g.player.teleport(m.x + 1, m.y + 1, m.z);
  await window.__gsleep(0.4);
  const near = g.nearInteract && g.nearInteract.action;
  g.tryInteract();
  await new Promise((r) => setTimeout(r, 200));
  const embers0 = g.state.player.embers;
  const torches0 = g.state.inv.torch || 0;
  document.querySelector('[data-buy="0"]').click();
  return { found: true, near, open: !document.getElementById('trade').hidden, spent: embers0 - g.state.player.embers, torches: (g.state.inv.torch || 0) - torches0 };
});
check('merchant', trade.found && trade.open && trade.spent === 60 && trade.torches === 1);
await page.screenshot({ path: `${out}/f3-trade.png` });
await page.evaluate(() => document.getElementById('trade-close').click());

// 3. Torch + firebomb
const tools = await page.evaluate(async () => {
  const g = window.__game;
  g.input.press('torch'); await window.__gsleep(0.05); g.input.release('torch');
  const torchOn = g.state.player.torchOn;
  const bombs0 = g.state.inv.firebomb || 0;
  g.input.press('throw'); await window.__gsleep(0.05); g.input.release('throw');
  await window.__gsleep(0.4);
  const inFlight = g.bombs.length;
  await window.__gsleep(3.5);
  return { torchOn, used: bombs0 - (g.state.inv.firebomb || 0), inFlight, after: g.bombs.length };
});
check('torch', tools.torchOn === true);
check('firebomb', tools.used === 1 && tools.inFlight === 1 && tools.after === 0);

// 4. Chest at a nearby location
const chest = await page.evaluate(async () => {
  const g = window.__game;
  const locs = g.gen.locations.filter((l) => ['wreck', 'crypt', 'watchtower', 'keep'].includes(l.type));
  for (const l of locs) {
    g.player.teleport(l.x, g.gen.height(l.x, l.z) + 3, l.z);
    for (let i = 0; i < 40; i++) { g.chunks.update(l.x, l.z, 50); await new Promise((r) => setTimeout(r, 30)); }
    await window.__gsleep(0.5);
    const c = g.locations.interactables.find((i) => i.action === 'chest' && !g.state.opened.has(i.id));
    if (!c) continue;
    g.enemies.clear();
    g.player.teleport(c.x + 1.2, c.y + 1.5, c.z);
    await window.__gsleep(0.6);
    const inv0 = Object.values(g.state.inv).reduce((a, b) => a + b, 0);
    if (!g.nearInteract || g.nearInteract.action !== 'chest') return { located: true, near: g.nearInteract && g.nearInteract.action };
    g.tryInteract();
    const inv1 = Object.values(g.state.inv).reduce((a, b) => a + b, 0);
    return { located: true, opened: g.state.opened.has(c.id), gained: inv1 - inv0, type: l.type };
  }
  return { located: false };
});
check('chest', chest.opened && chest.gained > 0);

// 5. Boss: go to a major, force the boss to low health, finish it with a swing, light the beacon
const boss = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.gen.locations.find((l) => l.kind === 'major');
  g.player.teleport(m.x, g.gen.height(m.x, m.z) + 3, m.z + 30);
  for (let i = 0; i < 60; i++) { g.chunks.update(m.x, m.z, 50); await new Promise((r) => setTimeout(r, 30)); }
  await window.__gsleep(1);
  g.respawnEnemies(); // earlier steps may have cleared this ruin's defenders
  await window.__gsleep(0.3);
  const b = g.enemies.list.find((e) => e.isBoss);
  if (!b) return { found: false };
  const name = b.name;
  for (const e of [...g.enemies.list]) if (e !== b) g.enemies.remove(e);
  b.hp = 1;
  b.damage(10, 0, 1);
  await window.__gsleep(0.5);
  const killed = g.state.bosses.has(m.id);
  const beacon = g.locations.interactables.find((i) => i.action === 'beacon' && i.loc.id === m.id);
  g.player.teleport(beacon.x + 1.5, beacon.y + 1.5, beacon.z);
  await window.__gsleep(0.8);
  const near = g.nearInteract && g.nearInteract.action;
  g.tryInteract();
  return { found: true, name, killed, near, lit: g.state.beacons.has(m.id) };
});
check('boss', boss.found && boss.killed && boss.lit);
await page.screenshot({ path: `${out}/f4-beacon.png` });

// 6. Light the rest to reach the ending
const ending = await page.evaluate(async () => {
  const g = window.__game;
  for (const m of g.gen.locations.filter((l) => l.kind === 'major')) g.state.bosses.add(m.id);
  for (const m of g.gen.locations.filter((l) => l.kind === 'major' && !g.state.beacons.has(l.id))) {
    g.lightBeacon({ loc: m, x: m.x, y: m.y, z: m.z, fire: { x: m.x, y: m.y + 2, z: m.z, lit: false } });
  }
  await new Promise((r) => setTimeout(r, 4500));
  return { ended: g.state.ended, open: !document.getElementById('ending').hidden };
});
check('ending', ending.ended && ending.open);
await page.screenshot({ path: `${out}/f5-ending.png` });

// 7. Save, quit, continue
const cont = await page.evaluate(async () => {
  const g = window.__game;
  document.getElementById('e-continue').click();
  g.saveAndQuit();
  const titleShown = !document.getElementById('title').hidden && !document.getElementById('t-continue').hidden;
  await g.continueGame();
  return { titleShown, mode: g.mode, beacons: g.state.beacons.size, level: g.state.player.level };
});
check('continue', cont.titleShown && cont.mode === 'play' && cont.beacons === 6 && cont.level >= 3);

console.log(JSON.stringify({ rest, lvl, trade, tools, chest, boss, ending, cont }, null, 0));
console.log(results);
console.log(errors.length ? `ERRORS: ${errors.join('\n')}` : 'no page errors');
await browser.close();
const ok = Object.values(results).every(Boolean) && !errors.length;
console.log(ok ? 'FLOW OK' : 'FLOW FAILED');
process.exit(ok ? 0 : 1);
