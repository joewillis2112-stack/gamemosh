// The UI (places/gui-lab.luau): a HUD built from StarterGui by a LocalScript.
// - Layout follows Roblox's rules, read back through AbsolutePosition/Size
//   (a centred bar of UDim2(0.5, -20, 0, 100) at (0.5, 0, 0, 10), anchor
//   (0.5, 0), in a 1280x720 window under the 58 px inset);
// - a ScreenGui with IgnoreGuiInset starts 58 px above the origin;
// - UIListLayout stacks slots in LayoutOrder with its padding;
// - TextScaled grows the text to fill its box;
// - a real click fires Activated and the script's update shows;
// - a touch that starts on a button doesn't turn the camera; one on the
//   3D view still does (run with --phone).
// Goldens: the HUD on desktop and on a phone.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(1); // a tick lays out again with the loaded fonts (frames() don't tick with --noshots)
  await t.frames(2);
  const phone = await t.eval(() => window.studio.controls.isTouch);
  const A = name => t.eval(n => {
    const pg = window.studio.players.player.children.find(c => c.ClassName === 'PlayerGui');
    const find = i => { for (const c of i.children) { if (c.props.Name === n) return c; const r = find(c); if (r) return r; } return null; };
    const i = find(pg); return i && { x: i.props.AbsolutePosition.x, y: i.props.AbsolutePosition.y, w: i.props.AbsoluteSize.x, h: i.props.AbsoluteSize.y };
  }, name);
  const W = await t.eval(() => innerWidth), H = await t.eval(() => innerHeight);
  const bar = await A('Bar'), strip = await A('Strip'), hud = await A('Hud');
  console.log('window', W, H, 'Hud', JSON.stringify(hud), 'Bar', JSON.stringify(bar), 'Strip', JSON.stringify(strip));
  check(hud.y === 0 && hud.h === H - 58 && hud.w === W, 'a ScreenGui fills the window under the 58 px inset (origin at the inset)');
  const bw = W * 0.5 - 20;
  check(bar.w === Math.fround(bw) || Math.abs(bar.w - bw) < 1e-3, `UDim2 size: half the width less 20 (${bar.w})`);
  check(Math.abs(bar.x - (W / 2 - bw / 2)) < 1e-3 && bar.y === 10 && bar.h === 100, 'AnchorPoint (0.5, 0) centres it; 10 px under the inset');
  check(strip.y === -58 && strip.w === W, 'IgnoreGuiInset: the banner starts 58 px above the origin, full width');
  check(await t.eval(() => window.studio.gui.playerList.el.style.display === 'none'), 'no player list unless the project turns it on (Roblox\'s own UI is opt-in)');
  const s1 = await A('Slot1'), s2 = await A('Slot2'), s3 = await A('Slot3');
  check(s3.y < s2.y && s2.y < s1.y && s2.y - s3.y === 72 && s1.y - s2.y === 72, 'UIListLayout: LayoutOrder 1,2,3 = Slot3, Slot2, Slot1, 64 px tall with 8 px padding');
  const fit = await t.eval(() => { const s = window.studio, pg = s.players.player.children.find(c => c.ClassName === 'PlayerGui'); const title = pg.children.find(g => g.props.Name === 'Hud').children.find(c => c.props.Name === 'Bar').children[0]; const el = s.gui.els.get(title).el; const b = el.firstChild.getBoundingClientRect(); return { size: parseFloat(getComputedStyle(el).fontSize), w: b.width, h: b.height, bw: el.clientWidth, bh: el.clientHeight }; });
  console.log('TextScaled title:', JSON.stringify(fit));
  check(fit.size > 40 && fit.w <= fit.bw + 1 && fit.h <= fit.bh + 1 && (fit.w > fit.bw - 40 || fit.h > fit.bh - 15), 'TextScaled grows the text until its lines fill the box (width or height)');

  // Click (or tap) the button: Activated fires, and the label updates.
  const btn = await A('Boost'), cx = btn.x + btn.w / 2, cy = btn.y + btn.h / 2 + 58;
  const yaw0 = await t.eval(() => window.studio.camera.yaw);
  if (phone) {
    const cdp = await t.page.context().newCDPSession(t.page);
    const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: cx + i * 30, y: cy, id: 1 }]); await t.page.waitForTimeout(20); }
    await touch('touchEnd', []);
    await t.page.waitForTimeout(80); await t.sim(2, 'live');
    const yaw1 = await t.eval(() => window.studio.camera.yaw);
    check(Math.abs(yaw1 - yaw0) < 1e-6, 'a drag that starts on a button doesn\'t turn the camera');
    await touch('touchStart', [{ x: W * 0.75, y: H * 0.3, id: 2 }]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: W * 0.75 + i * 30, y: H * 0.3, id: 2 }]); await t.page.waitForTimeout(20); }
    await touch('touchEnd', []);
    await t.page.waitForTimeout(80); await t.sim(2, 'live');
    const yaw2 = await t.eval(() => window.studio.camera.yaw);
    check(Math.abs(yaw2 - yaw1) > 0.1, 'the same drag on the 3D view still turns it');
    await touch('touchStart', [{ x: cx, y: cy, id: 3 }]); await touch('touchEnd', []);
  } else {
    await t.page.mouse.click(cx, cy);
  }
  await t.page.waitForTimeout(80); await t.sim(3, 'live');
  const logs = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  const label = await t.eval(() => { const pg = window.studio.players.player.children.find(c => c.ClassName === 'PlayerGui'); return pg.children.find(g => g.props.Name === 'Hud').children.find(c => c.props.Name === 'Stage').children.find(c => c.props.Name === 'Label').props.Text; });
  check(logs.includes('hud built') && logs.filter(l => l === 'activated 1').length === 1 && label === 'Boosts: 1', `${phone ? 'a tap' : 'a click'} on the button fires Activated once, and the HUD updates (${label})`);
  await t.frames(2);
  await t.shot('gui'); await t.golden('gui');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
