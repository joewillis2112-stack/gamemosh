// Scripted combat check: spawn a hollow next to the player, attack until it dies,
// then let a knight hit the player and confirm damage, death and respawn all work.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', null, { timeout: 90000 });
await page.evaluate(() => window.__game.startNew('combat-test'));
await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 120000 });
// Headless software rendering is slow, so wait on in-game time rather than wall-clock time.
await page.evaluate(() => {
  window.__gsleep = (sec) => new Promise((res) => {
    const g = window.__game;
    const t0 = g.state.stats.playTime;
    const tick = () => (g.state.stats.playTime - t0 >= sec || g.mode !== 'play' ? res() : setTimeout(tick, 30));
    tick();
  });
});
const r1 = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player.pos;
  const e = g.enemies.spawn('hollow', p.x + Math.sin(g.player.facing) * 1.6, p.z + Math.cos(g.player.facing) * 1.6, { level: 1 });
  e.aggro = false;
  const embers0 = g.state.player.embers;
  const hp0 = e.hp;
  for (let i = 0; i < 12 && !e.dead; i++) {
    g.state.player.stamina = 100;
    g.input.press('attack');
    await window.__gsleep(0.05);
    g.input.release('attack');
    await window.__gsleep(0.75);
    if (!e.dead && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 1.8) { g.player.facing = Math.atan2(e.pos.x - p.x, e.pos.z - p.z); }
  }
  return { hp0, hpLeft: Math.round(e.hp), dead: e.dead, embersGained: g.state.player.embers - embers0, kills: g.state.stats.kills, corpses: g.corpses.length };
});
console.log('attack test', JSON.stringify(r1));
const r2 = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player.pos;
  g.state.player.embers = 123;
  const hp0 = g.state.player.hp;
  const e = g.enemies.spawn('knight', p.x + 2, p.z, { level: 3 });
  e.aggro = true;
  await window.__gsleep(4);
  return { hp0, hpNow: Math.round(g.state.player.hp), mode: g.mode };
});
console.log('defend test', JSON.stringify(r2));
const r3 = await page.evaluate(async () => {
  const g = window.__game;
  g.player.hurt(9999, null, 'fall');
  await new Promise((r) => setTimeout(r, 2000));
  const deadMode = g.mode;
  const remnant = g.state.remnant;
  document.getElementById('d-respawn').click();
  await new Promise((r) => setTimeout(r, 3000));
  return { deadMode, remnant: remnant && remnant.embers, afterMode: g.mode, hp: Math.round(g.state.player.hp), dead: g.player.dead };
});
console.log('death test', JSON.stringify(r3));
const r4 = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player.pos;
  const before = g.locations.props.size;
  const prop = g.locations.spawnProp('pitch', p.x + 3, p.y + 1, p.z);
  await window.__gsleep(0.8);
  const e = g.enemies.spawn('hollow', p.x + 4, p.z + 1, { level: 1 });
  g.locations.damageProp(prop, 99, { x: 1, z: 0 }, 'test');
  await window.__gsleep(0.6);
  return { propsBefore: before, exploded: !g.locations.props.has(prop), enemyHurt: e.dead || e.hp < e.maxHp };
});
console.log('explosion test', JSON.stringify(r4));
console.log(errors.length ? `ERRORS: ${errors.join('\n')}` : 'no page errors');
await browser.close();
const ok = r1.dead && r1.embersGained > 0 && r2.hpNow < r2.hp0 && r3.deadMode === 'dead' && r3.afterMode === 'play' && !r3.dead && r4.exploded && r4.enemyHurt && !errors.length;
console.log(ok ? 'COMBAT OK' : 'COMBAT FAILED');
process.exit(ok ? 0 : 1);
