// The phone controls and menus: every button on screen and not overlapping,
// tap uses, hold mines, SNEAK only sneaks, the bag and crafting fit the
// screen and scroll by touch, at several phone sizes.
// Usage: xvfb-run -a node pokecraft/tests/controls.mjs [outDir]
// (headed: headless Chromium can't scroll by touch, so the scroll check needs a display)
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'test-output/pokecraft';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, headless: !process.env.DISPLAY, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errors.push(m.text()); });
const fail = (m) => { console.log('FAIL:', m); errors.push(m); };
const g = (fn, arg) => page.evaluate(fn, arg);
const frames = async (n) => { const s = await g(() => __pc.frames); await page.waitForFunction((t) => __pc.frames >= t, s + n, { timeout: 120000 }); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const box = (sel) => page.locator(sel).first().boundingBox();
const tapEl = async (sel) => { const b = await box(sel); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
// A touch held at (x, y) for ms, through CDP so it is one real touch.
const touch = async (x, y, ms) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const vp = () => page.viewportSize();
// The look area: right side, away from the buttons.
const lookPoint = () => { const v = vp(); return [v.width * 0.72, v.height * 0.32]; };

await page.goto(pathToFileURL(resolve('pokecraft/dist/index.html')).href);
await page.waitForSelector('#title .menu:not([hidden])', { timeout: 60000 });
await page.click('#btn-new');
await page.fill('#seed', 'controls');
await page.click('#starters button[data-starter="charmander"]');
await page.waitForFunction(() => __pc.mode === 'world', null, { timeout: 180000 });
await g(() => { document.getElementById('toast').hidden = true; __pc.ents.clearAll(); __pc.ents.trainerTimer = 1e9; __pc.ents.merchantTimer = 1e9; __pc.ents.spawnWild = () => {}; __pc.mobs.spawn = () => {}; __pc.mobs.clearAll?.(); });
await frames(120);

// A flat test pad: stone floor, clear air, the player looking down at it.
const pad = () => g(() => {
  const p = __pc.player;
  const x0 = Math.floor(p.pos[0]), y0 = Math.floor(p.pos[1]) + 20, z0 = Math.floor(p.pos[2]);
  const stone = __pc.names.indexOf('stone'), air = __pc.names.indexOf('air');
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    __pcTest.edit(x0 + dx, y0 - 1, z0 + dz, stone);
    for (let dy = 0; dy < 4; dy++) __pcTest.edit(x0 + dx, y0 + dy, z0 + dz, air);
  }
  p.pos = [x0 + 0.5, y0, z0 + 0.5]; p.vel = [0, 0, 0];
  p.yaw = 0; p.pitch = -0.9;
  return [x0, y0, z0];
});

// --- 1. The layout at each phone size: buttons on screen, none overlapping.
const sizes = [[390, 844, 'tall'], [375, 553, 'short'], [360, 640, 'small'], [844, 390, 'landscape']];
for (const [w, h, name] of sizes) {
  await page.setViewportSize({ width: w, height: h });
  await frames(20);
  const r = await g(() => {
    const els = [...document.querySelectorAll('#acts .act, #topbtns .act:not([hidden]), #hotbar .slot, #stats, #mute, #lefthud')]
      .filter((e) => e.offsetParent !== null);
    const rects = els.map((e) => ({ id: e.dataset.act || e.dataset.slot || e.id || e.className, r: e.getBoundingClientRect() }));
    const W = innerWidth, H = innerHeight;
    const off = rects.filter(({ r }) => r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1).map((x) => x.id);
    const hit = [];
    const btns = rects;
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].r, b = btns[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) hit.push(`${btns[i].id}×${btns[j].id}`);
    }
    // Smallest tap target among the action buttons.
    const small = rects.filter((x) => ['ball', 'sneak', 'jump', 'start', 'inv'].includes(x.id)).map((x) => [x.id, Math.round(Math.min(x.r.width, x.r.height))]);
    return { off, hit, small, n: rects.length };
  });
  console.log(name, w + '×' + h, JSON.stringify(r));
  if (r.off.length) fail(`${name}: off screen: ${r.off}`);
  if (r.hit.length) fail(`${name}: overlapping: ${r.hit}`);
  for (const [id, s] of r.small) if (s < (id === 'inv' ? 30 : 44)) fail(`${name}: ${id} is only ${s}px`);
  await shot(`c-${name}-world`);

  // The bag: open with •••, everything inside the screen, the list scrolls by touch.
  await g(() => { for (const id of ['oak_planks', 'cobblestone', 'stick', 'coal', 'iron_ingot', 'string', 'wheat', 'white_wool', 'sand', 'glass']) __pc.inv.add(id, 32); });
  await tapEl('#hotbar .slot.more');
  await page.waitForFunction(() => __pc.inv.open, null, { timeout: 5000 }).catch(() => fail(`${name}: ••• did not open the bag`));
  await tapEl('#inv-tabs button[data-tab="craft"]');
  await frames(5);
  const inv = await g(() => {
    const W = innerWidth, H = innerHeight;
    const on = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= -1 && r.left >= -1 && r.bottom <= H + 1 && r.right <= W + 1 && r.height > 0; };
    const b = document.getElementById('inv-body');
    return { tab: __pc.inv.tab, close: on('#inv-close'), tabs: on('#inv-tabs'), foot: on('.ifoot'), body: on('#inv-body'), sh: b.scrollHeight, ch: b.clientHeight };
  });
  console.log(' bag', JSON.stringify(inv));
  if (inv.tab !== 'craft') fail(`${name}: tapping CRAFT did nothing`);
  if (!inv.close || !inv.tabs || !inv.foot || !inv.body) fail(`${name}: part of the bag is off screen`);
  if (inv.sh > inv.ch) {
    const b = await box('#inv-body');
    // A finger drag up the list (needs a headed browser: headless Chromium never touch-scrolls).
    const x = b.x + b.width / 2, y = b.y + b.height * 0.8, dy = b.height * 0.5;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (dy * i) / 12 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const top = await g(() => document.getElementById('inv-body').scrollTop);
    console.log(' scrolled to', top);
    if (top < 20) fail(`${name}: the craft list does not scroll by touch`);
  } else fail(`${name}: the craft list was short enough not to need scrolling, so scrolling went untested`);
  await shot(`c-${name}-craft`);
  // Crafting by tap: a stick row.
  const before = await g(() => __pc.inv.count('crafting_table'));
  await g(() => document.getElementById('inv-body').scrollTop = 0);
  await tapEl('#inv-body .irow:not(.off)');
  const after = await g(() => __pc.inv.count('crafting_table'));
  if (after <= before) fail(`${name}: tapping the first recipe crafted nothing (${before} → ${after})`);
  await tapEl('#inv-close');
  await page.waitForFunction(() => !__pc.inv.open, null, { timeout: 5000 }).catch(() => fail(`${name}: ✕ did not close the bag`));
  await frames(5);
}
await page.setViewportSize({ width: 390, height: 844 });
await frames(20);

// --- 2. Tap places, hold mines, the hint says which.
const [x0, y0, z0] = await pad();
await frames(10);
await g(() => { __pc.inv.slots[0] = { id: 'dirt', n: 10 }; __pc.inv.sel = 0; __pc.inv.changed(); });
await frames(12);
const hint = await g(() => ({ text: document.getElementById('ctx').textContent, hidden: document.getElementById('ctx').hidden }));
console.log('hint', JSON.stringify(hint));
if (hint.hidden || !/TAP: PLACE DIRT/.test(hint.text) || !/HOLD: MINE/.test(hint.text)) fail('the hint does not say TAP: PLACE DIRT · HOLD: MINE');
await shot('c-hint');
const tgt = await g(() => __pcTest.targetBlock());
const [lx, ly] = lookPoint();
await touch(lx, ly, 60);
await frames(6);
const placed = await g(() => __pc.inv.count('dirt'));
console.log('after tap, dirt left', placed);
if (placed !== 9) fail('a tap did not place the held block');
// Hold on the placed dirt until it breaks (dirt by hand: 0.75 s).
const t2 = await g(() => __pcTest.targetBlock());
const name0 = await g((t) => __pcTest.blockAt(t.x, t.y, t.z), t2);
await touch(lx, ly, 1600);
await frames(6);
const name1 = await g((t) => __pcTest.blockAt(t.x, t.y, t.z), t2);
console.log('held on', name0, '->', name1, 'target', JSON.stringify(tgt), JSON.stringify(t2));
if (name0 !== 'dirt' || name1 === 'dirt') fail('holding did not mine the block');
// A drag only looks.
const yaw0 = await g(() => __pc.player.yaw);
const d0 = await g(() => __pc.inv.count('dirt'));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lx, y: ly }] });
for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: lx - i * 10, y: ly }] }); await page.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await frames(6);
const yaw1 = await g(() => __pc.player.yaw);
const d1 = await g(() => __pc.inv.count('dirt'));
console.log('drag: yaw', yaw0.toFixed(2), '->', yaw1.toFixed(2), 'dirt', d0, '->', d1);
if (Math.abs(yaw1 - yaw0) < 0.2) fail('a drag did not turn the view');
if (d1 !== d0) fail('a drag placed a block');

// --- 3. SNEAK only sneaks.
await g(() => { const p = __pc.player; p.yaw = 0; p.pitch = -0.9; });
await frames(6);
const s0 = await g(() => ({ dirt: __pc.inv.count('dirt'), sneak: __pc.player.sneaking, open: __pc.inv.open }));
await tapEl('.act.sneak');
await frames(10);
const s1 = await g(() => ({ dirt: __pc.inv.count('dirt'), sneak: __pc.player.sneaking, on: document.querySelector('.act.sneak').classList.contains('on'), open: __pc.inv.open }));
console.log('sneak', JSON.stringify(s0), '->', JSON.stringify(s1));
if (!s1.on || !s1.sneak) fail('SNEAK did not turn sneaking on');
if (s1.dirt !== s0.dirt || s1.open) fail('SNEAK also used the held item');
await tapEl('.act.sneak');
await frames(10);
if (await g(() => __pc.player.sneaking)) fail('a second SNEAK tap did not stop sneaking');

// --- 4. Tap a crafting table: the craft screen opens, fits, and closes.
await g(([x, y, z]) => __pcTest.edit(x, y, z - 2, __pc.names.indexOf('crafting_table')), [x0, y0, z0]);
await g(() => { const p = __pc.player; p.yaw = 0; p.pitch = -0.35; });
await frames(10);
const aim = await g(() => { const t = __pcTest.targetBlock(); return t && __pcTest.blockAt(t.x, t.y, t.z); });
const hint2 = await g(() => document.getElementById('ctx').textContent);
console.log('aiming at', aim, 'hint', hint2);
if (aim !== 'crafting_table') fail('could not aim at the crafting table');
if (!/TAP: CRAFT/.test(hint2)) fail('the hint does not say TAP: CRAFT');
await touch(lx, ly, 60);
await page.waitForFunction(() => __pc.inv.open && __pc.inv.tab === 'craft', null, { timeout: 5000 }).catch(() => fail('tapping the table did not open crafting'));
const tableInfo = await g(() => document.getElementById('inv-info').textContent);
if (!/crafting table/i.test(tableInfo)) fail('the craft screen does not know it is at a table');
await shot('c-table-craft');
await tapEl('#inv-close');
await page.waitForFunction(() => !__pc.inv.open, null, { timeout: 5000 }).catch(() => fail('✕ did not close crafting'));

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'CONTROLS OK');
await browser.close();
process.exit(errors.length ? 1 : 0);
