// The character maker page (web/maker.html), driven like a creator would, on
// a desktop and a phone: a sample becomes a skin on the preview character;
// the detail buttons and a dragged box edge remake it; "Play as this
// character" opens the game wearing it. Screenshots go to build/maker/.
import fs from 'node:fs';
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { serve } from '../tools/serve.mjs';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
fs.mkdirSync('build/maker', { recursive: true });
const srv = serve();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.port}/web/maker.html`);
  const ready = n => page.waitForFunction(n => (window.maker.ready || 0) >= n, n, { timeout: 240000 });
  await ready(1);
  const st = await page.evaluate(() => ({ status: document.getElementById('status').textContent, skin: (window.maker.skinUrl || '').slice(0, 22), parts: JSON.stringify(window.maker.parts.head) }));
  check(st.skin === 'data:image/png;base64,' && /neck found/.test(st.status), `${label}: the first sample becomes a skin (${st.status})`);
  // The preview shows the character: the skin's colours on screen (the male adventurer's green shirt).
  const green = await page.evaluate(() => {
    const c = document.getElementById('view'), g = c.getContext('webgl2') || c.getContext('webgl'), w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 1] > 120 && px[i + 1] > px[i] + 40 && px[i + 1] > px[i + 2] + 30) n++;
    return n / (w * h);
  });
  check(green > 0.003, `${label}: the preview shows the skinned character (${(green * 100).toFixed(2)}% shirt-green pixels)`);
  await page.screenshot({ path: `build/maker/maker-${label}.png` });

  // Detail 8 remakes the skin.
  const before = await page.evaluate(() => window.maker.skinUrl);
  await page.click('#detail button[data-px="8"]');
  await ready(2);
  check(await page.evaluate(b => window.maker.skinUrl !== b && window.maker.headPx === 8, before), `${label}: detail 8 remakes the skin`);

  // Drag the head's bottom edge (the neck) down 10 image px: the boxes change and the skin is remade.
  await page.evaluate(() => document.getElementById('ref').scrollIntoView({ block: 'center' })); // the detail buttons scrolled it away on a phone
  const drag = await page.evaluate(() => {
    const m = window.maker, c = document.getElementById('ref'), b = c.getBoundingClientRect(), r = m.parts.head;
    const W = c.width, H = c.height, iw = m.img.width, ih = m.img.height, k = Math.min(W / iw, H / ih) * 0.94, dpr = W / b.width;
    const ox = (W - iw * k) / 2, oy = (H - ih * k) / 2;
    const at = (x, y) => [b.left + (ox + x * k) / dpr, b.top + (oy + y * k) / dpr];
    return { from: at((r.x0 + r.x1) / 2, r.y1), to: at((r.x0 + r.x1) / 2, r.y1 + 10), neck: r.y1 };
  });
  if (opts.hasTouch) {
    // A finger, through real touch events.
    const cdp = await ctx.newCDPSession(page), touch = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', drag.from);
    for (let i = 1; i <= 4; i++) await touch('touchMove', [drag.from[0] + (drag.to[0] - drag.from[0]) * i / 4, drag.from[1] + (drag.to[1] - drag.from[1]) * i / 4]);
    await touch('touchEnd', drag.to);
  } else { await page.mouse.move(...drag.from); await page.mouse.down(); await page.mouse.move(...drag.to, { steps: 4 }); await page.mouse.up(); }
  await ready(3);
  const neck = await page.evaluate(() => window.maker.parts.head.y1);
  check(Math.abs(neck - (drag.neck + 10)) <= 1, `${label}: dragging the neck edge moves it (${drag.neck} -> ${neck}) and remakes the skin`);

  // Another sample.
  await page.click('#samples img:nth-child(3)');
  await ready(4);
  check(await page.evaluate(() => /robot/.test(document.querySelector('#samples img.on').src)), `${label}: picking the robot sample remakes it`);

  // Play as this character: the game opens wearing the skin.
  const skin = await page.evaluate(() => window.maker.skinUrl);
  await page.click('#play');
  await page.waitForFunction(() => window.studio && window.studio.player, null, { timeout: 240000 });
  const worn = await page.evaluate(() => { const m = window.studio.player.meshes.find(m => m.material && m.material.albedoTexture); return m && m.material.albedoTexture.url; });
  check(worn === skin, `${label}: "Play as this character" opens the game wearing the skin`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `build/maker/play-${label}.png` });
  check(!errors.length, `${label}: no page errors${errors.length ? ' (' + errors.slice(0, 3).join(' | ') + ')' : ''}`);
  await ctx.close();
}
await browser.close(); srv.close();
console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
