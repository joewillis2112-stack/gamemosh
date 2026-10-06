// Dukecraft smoke test: a world loads, Duke's aliens run on their CON
// scripts in it, the pistol kills one, a blast breaks blocks.
// Usage: node dukecraft/tests/smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'test-output/dukecraft';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errors.push(m.text()); });
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };
const g = (fn, arg) => page.evaluate(fn, arg);
const frames = async (n) => { const s = await g(() => __dc.frames); await page.waitForFunction((t) => __dc.frames >= t, s + n, { timeout: 120000 }); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

await page.goto(pathToFileURL(resolve('dukecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'duke');
await page.click('#btn-start');
await page.waitForFunction(() => __dc.mode === 'world', null, { timeout: 180000 });
await g(() => { document.getElementById('toast').hidden = true; __dc.mobs.spawn = () => {}; });
await frames(60);
const start = await g(() => ({ pos: __dc.player.pos, scripted: __dc.duke.scripted, held: __dc.inv.held, ammo: __dc.inv.count('duke_pistol_ammo') }));
console.log('start', JSON.stringify(start));
if (start.scripted < 100) fail('GAME.CON did not load');

// A trooper and a pig cop 10 blocks in front of you.
const spawned = await g(() => {
  const p = __dc.player, f = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
  const at = (d, side) => { const x = p.pos[0] + f[0] * d - f[1] * side, z = p.pos[2] + f[1] * d + f[0] * side; const s = __dcTest.surface(x, z); return [x, s ? s.y : p.pos[1], z]; };
  p.pitch = -0.05;
  return [__dc.duke.spawn('LIZTROOP', at(10, -1.5)), __dc.duke.spawn('PIGCOP', at(12, 2))];
});
await frames(90);
const seen = await g(() => [...__dc.duke.actors.entries()].map(([id, a]) => ({ id, pos: a.pos.map((v) => +v.toFixed(1)), vis: !!(a.sprite && a.sprite.visible), key: a.sprite && a.sprite.userData.key })));
console.log('actors', JSON.stringify(seen));
if (seen.filter((a) => a.vis).length < 2) fail('the aliens are not drawn');
await shot('d1-aliens');
// They move on their own (Duke's AI).
const p0 = seen.map((a) => a.pos);
await frames(240);
const later = await g(() => [...__dc.duke.actors.values()].map((a) => a.pos));
const movedAny = later.some((p, i) => p0[i] && Math.hypot(p[0] - p0[i][0], p[2] - p0[i][2]) > 0.5);
console.log('moved', movedAny, JSON.stringify(later.map((p) => p.map((v) => +v.toFixed(1)))));
if (!movedAny) fail('the aliens did not move');
await shot('d2-later');
const hp0 = await g(() => __dc.surv.hp);

// Shoot the trooper with the pistol until it dies.
let killed = false;
for (let i = 0; i < 40 && !killed; i++) {
  await g((id) => {
    const a = __dc.duke.actors.get(id);
    if (!a) return;
    const p = __dc.player, e = p.eye();
    const dx = a.pos[0] - e[0], dz = a.pos[2] - e[2], dy = a.pos[1] + 0.9 - e[1];
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    __dc.gun.cool = 0; __dc.gun.reload = 0;
    __dcTest.fire();
  }, spawned[0]);
  await frames(6);
  killed = await g(() => (__dc.g.kills || 0) > 0);
}
await frames(60);
const after = await g(() => ({ kills: __dc.g.kills, ammo: __dc.inv.count('duke_pistol_ammo'), hp: __dc.surv.health }));
console.log('after shooting', JSON.stringify(after), 'hp before', hp0);
if (!killed) fail('the pistol did not kill the trooper');
await shot('d3-dead');

// A Duke blast breaks blocks.
const blast = await g(() => {
  const p = __dc.player, x = Math.floor(p.pos[0] + 4), z = Math.floor(p.pos[2]);
  let y = Math.floor(p.pos[1]) + 3;
  while (y > 0 && __dcTest.blockAt(x, y, z) === 'air') y--;
  const before = __dcTest.blockAt(x, y, z);
  __dc.duke.blast([x + 0.5, y + 0.5, z + 0.5], 3, [10, 10, 10, 10], -1);
  return { before, after: __dcTest.blockAt(x, y, z) };
});
console.log('blast', JSON.stringify(blast));
if (blast.after !== 'air') fail('a blast did not break the ground');

// At night, aliens land on their own.
const night = await g(() => {
  __dc.duke.clearAll();
  __dc.g.time = 15000;
  for (let i = 0; i < 6; i++) __dcTest.spawnAliens();
  return { n: __dc.duke.count(), types: [...__dc.duke.actors.keys()].map((id) => __dc.duke.state()[id * 16 + 1]) };
});
console.log('night', JSON.stringify(night));
if (night.n < 3) fail('aliens did not land at night');
await frames(120);
await shot('d4-night');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'DUKECRAFT SMOKE OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
