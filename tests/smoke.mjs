// Headless smoke test: boots the built game, starts a journey, plays a few seconds,
// and fails on any console error. Usage: node tests/smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] || 'test-output';
await mkdir(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = process.argv.includes('--mobile');
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
// Font requests can fail in sandboxes without internet; that is not a game error.
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|ERR_NAME|ERR_INTERNET|ERR_TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));
const url = pathToFileURL(resolve('dist/index.html')).href;
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', null, { timeout: 90000 });
console.log(`title after ${Date.now() - t0} ms`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/1-title.png` });

await page.click('#t-new');
await page.fill('#seed-input', 'ash-crow-12');
await page.click('#ng-begin');
await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 120000 });
console.log(`play after ${Date.now() - t0} ms`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/2-spawn.png` });

// Walk forward, swing, roll
if (!mobile) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  await page.mouse.move(640, 360);
  const yaw0 = await page.evaluate(() => window.__game.cameraYaw);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(760, 360, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(400);
  const yaw1 = await page.evaluate(() => window.__game.cameraYaw);
  if (Math.abs(yaw1 - yaw0) < 0.05) errors.push('mouse drag did not turn the camera');
  const st0 = await page.evaluate(() => window.__game.state.player.stamina);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForTimeout(1200);
  const attacked = await page.evaluate((s0) => window.__game.state.player.stamina < s0 - 5 || window.__game.player.action === 'attack', st0);
  if (!attacked) errors.push('mouse click did not attack');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(800);
} else {
  const s = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const cdp = await ctx.newCDPSession(page);
  const tp = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(80, s.h - 160) });
  for (let i = 0; i < 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(80, s.h - 160 - i * 6) });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.tap('[data-btn=attack]');
  await page.waitForTimeout(800);
}
await page.screenshot({ path: `${out}/3-moved.png` });
const info = await page.evaluate(() => {
  const g = window.__game;
  return {
    mode: g.mode, pos: g.player.pos.toArray().map((v) => +v.toFixed(1)), hp: g.state.player.hp, chunks: g.chunks.chunks.size,
    enemies: g.enemies.list.length, locs: g.locations.rt.size, draw: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
    touch: document.body.classList.contains('touch'),
  };
});
console.log(JSON.stringify(info));
// Open menu tabs
await page.evaluate(() => window.__game.openMenu('map'));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/4-map.png` });
for (const tab of ['gear', 'char', 'craft', 'journal', 'settings']) {
  await page.evaluate((t) => window.__game.ui.menuTab(t), tab);
  await page.waitForTimeout(150);
}
await page.screenshot({ path: `${out}/5-settings.png` });
await page.evaluate(() => window.__game.closeMenu());
// Night + teleport to a major location to exercise bosses and structures
await page.evaluate(() => {
  const g = window.__game;
  const m = g.gen.locations.find((l) => l.kind === 'major');
  g.player.teleport(m.x + 30, g.gen.height(m.x + 30, m.z) + 2, m.z);
  g.sky.time = 0.9;
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/6-major-night.png` });
// Daytime views of every major location type
const majors = await page.evaluate(() => window.__game.gen.locations.filter((l) => l.kind === 'major').map((l) => ({ id: l.id, type: l.type })));
const seenTypes = new Set();
for (const m of majors) {
  if (seenTypes.has(m.type)) continue;
  seenTypes.add(m.type);
  await page.evaluate((id) => {
    const g = window.__game;
    const l = g.gen.locations[id];
    const x = l.x, z = l.z + 48;
    g.player.teleport(x, g.gen.height(x, z) + 2, z);
    g.cameraYaw = Math.atan2(l.x - x, l.z - z);
    g.player.facing = g.cameraYaw;
    g.cameraPitch = 0.18;
    g.sky.time = 0.42;
  }, m.id);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/7-${m.type}.png` });
}
const info2 = await page.evaluate(() => ({ enemies: window.__game.enemies.list.map((e) => e.name).slice(0, 12), mode: window.__game.mode, hp: window.__game.state.player.hp }));
console.log(JSON.stringify(info2));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
