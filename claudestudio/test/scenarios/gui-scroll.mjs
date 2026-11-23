// ScrollingFrame (places/scroll-lab.luau), desktop and phone:
// - Roblox's defaults (Instance.new): CanvasSize {0,0},{2,0}, 12 px bars, clipping, XY, WhenScrollable;
// - the canvas and window sizes: a default frame's canvas is twice its height and its window loses
//   the 12 px gutter of the bar it shows; AutomaticCanvasSize grows a list's canvas to its rows and
//   padding (with the layout's AbsoluteContentSize current when the script reads it); a canvas three
//   frames wide (scale); the Roblox gotcha: CanvasSize X scale 1 beside a vertical bar with no inset
//   also scrolls sideways by the bar's width;
// - children are clipped: a row below the window doesn't show (the same pixel with the list hidden);
// - scrolling moves the children (AbsolutePosition) and fires CanvasPosition's change;
// - desktop: the wheel scrolls the list and not the camera (the same wheel over the 3D view zooms),
//   stops at the end, turns sideways on an X-only strip, does nothing with ScrollingEnabled off (a
//   script still can); dragging the bar's thumb moves the canvas by its share of the range; a script's
//   CanvasPosition past the end is clamped (OURS); a click on a row in a scrolled list hits that row;
// - phone: a finger drag moves the canvas with the finger, doesn't click the row it started on and
//   doesn't turn the camera; a tap clicks; a flick keeps going after the finger lifts; pulling past
//   the top stretches the canvas (WhenScrollable) and it springs back, while ElasticBehavior Never
//   doesn't stretch; an X-only strip ignores a vertical drag and follows a horizontal one.
// Goldens: the scrolled shop, desktop and phone.
import { helpers, INSET } from '../gui-helpers.mjs';

export default async function (t) {
  const { check, done, get, box, luau, logs, shotPx, near, drag, tap, touch } = helpers(t);
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(2); await t.frames(2);
  const phone = await t.eval(() => window.studio.controls.isTouch);
  const v2 = (p, k) => [p[k].x, p[k].y];
  const eq = (a, b, tol = 0.01) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

  // Defaults, as a script sees them.
  await luau(`local f = Instance.new("ScrollingFrame") print("defaults", f.CanvasSize, f.ScrollBarThickness, f.ClipsDescendants, f.ScrollingDirection.Name, f.ElasticBehavior.Name, f.AutomaticCanvasSize.Name, f.ScrollBarImageColor3, f.Active, f.ScrollingEnabled, f.VerticalScrollBarInset.Name, f.CanvasPosition)`);
  const dl = logs().find(l => l.startsWith('defaults'));
  check(dl === 'defaults {0, 0}, {2, 0} 12 true XY WhenScrollable None 1, 1, 1 false true None 0, 0', `Instance.new defaults (${dl})`);

  // Sizes.
  const plain = await get('Plain'), list = await get('List'), wide = await get('Wide'), strip = await get('Strip');
  console.log('Plain', v2(plain, 'AbsoluteCanvasSize'), v2(plain, 'AbsoluteWindowSize'), 'List', v2(list, 'AbsoluteCanvasSize'), v2(list, 'AbsoluteWindowSize'), 'Wide', v2(wide, 'AbsoluteCanvasSize'), v2(wide, 'AbsoluteWindowSize'), 'Strip', v2(strip, 'AbsoluteCanvasSize'));
  check(eq(v2(plain, 'AbsoluteCanvasSize'), [148, 180]) && eq(v2(plain, 'AbsoluteWindowSize'), [148, 90]), 'a default 160x90 frame: canvas twice its height; the 12 px bar takes its gutter from the window (and the canvas floor)');
  check(eq(v2(list, 'AbsoluteCanvasSize'), [232, 930]) && eq(v2(list, 'AbsoluteWindowSize'), [232, 240]), 'AutomaticCanvasSize Y: 20 rows of 40 + 19 gaps of 6 + 8 px padding each end = 930; the inset bar narrows the canvas to 232');
  check(logs().includes('content 216 914'), 'the list layout\'s AbsoluteContentSize is current when the building script reads it (216 x 914)');
  check(eq(v2(wide, 'AbsoluteCanvasSize'), [70, 180]) && eq(v2(wide, 'AbsoluteWindowSize'), [58, 78]), 'CanvasSize X scale 1 beside a vertical bar with no inset scrolls sideways too (both bars show)');
  check(eq(v2(strip, 'AbsoluteCanvasSize'), [720, 64]), 'CanvasSize scale 3 on X: three frames wide');

  // Clipping: row 7 lies below the window; at its centre, the screen shows what's behind the list.
  const r7 = await box('Item7'), lb = await box('List');
  const cx = r7.x + r7.w / 2, cy = r7.y + 10;
  check(r7.y > lb.y + lb.h, `row 7 is laid out below the window (${r7.y} > ${lb.y + lb.h})`);
  let px = await shotPx(); const withList = px(cx, cy);
  await luau('game.Players.LocalPlayer.PlayerGui.Shop.List.Visible = false'); await t.frames(1);
  px = await shotPx(); const behind = px(cx, cy);
  await luau('game.Players.LocalPlayer.PlayerGui.Shop.List.Visible = true'); await t.frames(1);
  check(near(withList, behind, 3), `children are clipped: below the window the screen is what's behind the list (${withList} vs ${behind})`);

  const pos = async n => (await get(n)).CanvasPosition.y;
  if (!phone) {
    // The wheel, over the list.
    const zoom0 = await t.eval(() => window.studio.camera.zoom);
    await t.page.mouse.move(lb.x + 100, lb.y + 100);
    await t.page.mouse.wheel(0, 120); await t.page.waitForTimeout(80); await t.sim(2);
    const i1 = await get('Item1');
    check(await pos('List') === 120 && i1.AbsolutePosition.y === 16 + 8 - 120, `the wheel scrolls the list 120 px and its rows move with it (row 1 at ${i1.AbsolutePosition.y})`);
    check(logs().includes('scrolled 120'), 'CanvasPosition\'s change reaches the script');
    check(await t.eval(() => window.studio.camera.zoom) === zoom0, 'the wheel over the list doesn\'t zoom the camera');
    await t.page.mouse.move(900, 500); await t.page.mouse.wheel(0, 120); await t.page.waitForTimeout(80); await t.sim(2);
    check(await t.eval(() => window.studio.camera.zoom) !== zoom0, 'the same wheel over the 3D view zooms it (control)');
    await t.page.mouse.move(lb.x + 100, lb.y + 100);
    await t.page.mouse.wheel(0, 5000); await t.page.waitForTimeout(80); await t.sim(2);
    check(await pos('List') === 690, `the wheel stops at the end: 930 - 240 = 690 (${await pos('List')})`);
    // X only: a vertical wheel scrolls it sideways.
    const sb = await box('Strip');
    await t.page.mouse.move(sb.x + 100, sb.y + 30); await t.page.mouse.wheel(0, 100); await t.page.waitForTimeout(80); await t.sim(2);
    const st = await get('Strip');
    check(st.CanvasPosition.x === 100 && st.CanvasPosition.y === 0, `an X-only strip takes a vertical wheel sideways (${st.CanvasPosition.x}, ${st.CanvasPosition.y})`);
    // ScrollingEnabled off: no wheel; a script still scrolls it.
    await luau('local l = game.Players.LocalPlayer.PlayerGui.Shop.List l.ScrollingEnabled = false l.CanvasPosition = Vector2.new(0, 50)', 2);
    await t.page.mouse.move(lb.x + 100, lb.y + 100); await t.page.mouse.wheel(0, 120); await t.page.waitForTimeout(80); await t.sim(2);
    check(await pos('List') === 50, `ScrollingEnabled false: the wheel does nothing, a script's CanvasPosition still applies (${await pos('List')})`);
    await luau('local l = game.Players.LocalPlayer.PlayerGui.Shop.List l.ScrollingEnabled = true l.CanvasPosition = Vector2.new(0, 99999)', 2);
    check(await pos('List') === 690, `a script's CanvasPosition past the end is clamped to it (${await pos('List')})`);
    // The thumb: from the top, dragged 40 px down, moves the canvas 40 x range / (track - thumb).
    await luau('game.Players.LocalPlayer.PlayerGui.Shop.List.CanvasPosition = Vector2.new(0, 0)', 2); await t.frames(1);
    const th = await t.eval(() => { const s = window.studio, pg = s.players.player.children.find(c => c.ClassName === 'PlayerGui'), l = pg.children.find(g => g.props.Name === 'Shop').children.find(c => c.props.Name === 'List'); const b = s.gui.els.get(l).vbar.thumb.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height }; });
    const len = Math.max(8, 240 * 240 / 930), k = 690 / (240 - len);
    await t.page.mouse.move(th.x, th.y); await t.page.mouse.down(); await t.page.mouse.move(th.x, th.y + 20, { steps: 4 }); await t.page.mouse.move(th.x, th.y + 40, { steps: 4 }); await t.page.mouse.up();
    await t.page.waitForTimeout(80); await t.sim(2);
    check(Math.abs(th.h - len) < 0.6 && Math.abs(await pos('List') - 40 * k) < 0.6, `dragging the thumb (${th.h.toFixed(1)} px of a 240 px track) 40 px moves the canvas ${(40 * k).toFixed(1)} px (${(await pos('List')).toFixed(1)})`);
    // A click on a row of the scrolled list hits that row.
    await luau('game.Players.LocalPlayer.PlayerGui.Shop.List.CanvasPosition = Vector2.new(0, 120)', 2); await t.frames(1);
    const r4 = await box('Item4');
    await t.page.mouse.click(r4.x + 50, r4.y + 20); await t.page.waitForTimeout(80); await t.sim(3);
    await t.page.mouse.move(700, 600); await t.page.waitForTimeout(50); // off the row (its hover tint)
    check(logs().filter(l => l.startsWith('bought')).join(',') === 'bought 4', `a click on row 4 of the scrolled list buys row 4 (${logs().filter(l => l.startsWith('bought'))})`);
  } else {
    const yaw0 = await t.eval(() => window.studio.camera.yaw);
    const r1 = await box('Item1');
    // Drag up 180 px in 6 steps, starting near row 1's bottom: the first step lifts it past the slop, the
    // other five move the canvas with the finger, so the finger lifts 30 px up row 1, still on it (a press
    // and release on the button: only the scroll tells it apart from a click).
    await drag(r1.x + 60, r1.y + 36, 0, -180, { tick: true }); await t.sim(3);
    const p1 = await pos('List');
    check(Math.abs(p1 - 150) < 0.5, `a finger drag scrolls the list with the finger (150 px after the first step: ${p1})`);
    const r1b = await box('Item1');
    check(r1.y + 36 - 180 >= r1b.y && r1.y + 36 - 180 <= r1b.y + r1b.h && !logs().some(l => l.startsWith('bought')), 'the drag doesn\'t click the row it started on, though it lifts over it');
    check(Math.abs(await t.eval(() => window.studio.camera.yaw) - yaw0) < 1e-6, 'nor turn the camera');
    const r5 = await box('Item5');
    await tap(r5.x + 60, r5.y + 20); await t.sim(3);
    check(logs().filter(l => l.startsWith('bought')).join(',') === 'bought 5', `a tap clicks the row under it (${logs().filter(l => l.startsWith('bought'))})`);
    // A flick: lifted while moving, it carries on.
    await drag(lb.x + 100, lb.y + 200, 0, -120, { n: 4, hold: 0, step: 16 });
    const atLift = await pos('List'); await t.sim(30); const later = await pos('List');
    check(later > atLift + 20, `a flick keeps scrolling after the finger lifts (${atLift.toFixed(1)} -> ${later.toFixed(1)})`);
    await t.sim(240);
    // Elastic: from the top, pull down 120 px; the rows follow part way while held, then spring back.
    await luau('game.Players.LocalPlayer.PlayerGui.Shop.List.CanvasPosition = Vector2.new(0, 0)', 2); await t.frames(1);
    const rest = (await t.eval(() => { const s = window.studio, l = [...s.gui.els.keys()].find(i => i.props.Name === 'Item1'); return s.gui.els.get(l).el.getBoundingClientRect().top; }));
    const top = () => t.eval(n => { const s = window.studio, l = [...s.gui.els.keys()].find(i => i.props.Name === n); return s.gui.els.get(l).el.getBoundingClientRect().top; }, 'Item1');
    await touch('touchStart', [{ x: lb.x + 100, y: lb.y + 60, id: 4 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: lb.x + 100, y: lb.y + 60 + 20 * i, id: 4 }]); await t.page.waitForTimeout(20); }
    await t.page.waitForTimeout(100); await t.sim(1);
    const pulled = await top(), held = await pos('List');
    await touch('touchEnd', []); await t.page.waitForTimeout(60); await t.sim(60);
    const back = await top();
    check(pulled > rest + 30 && held === 0, `pulling past the top stretches the canvas (row 1 ${rest.toFixed(0)} -> ${pulled.toFixed(0)} px) while CanvasPosition stays 0`);
    check(Math.abs(back - rest) < 1, `and it springs back on release (${back.toFixed(1)})`);
    const fb = await box('Fixed'), band = () => t.eval(() => { const s = window.studio, l = [...s.gui.els.keys()].find(i => i.props.Name === 'Band0'); return s.gui.els.get(l).el.getBoundingClientRect().top; });
    const b0 = await band();
    await touch('touchStart', [{ x: fb.x + 50, y: fb.y + 30, id: 5 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: fb.x + 50, y: fb.y + 30 + 15 * i, id: 5 }]); await t.page.waitForTimeout(20); }
    await t.page.waitForTimeout(100); await t.sim(1);
    const b1 = await band();
    await touch('touchEnd', []); await t.page.waitForTimeout(60); await t.sim(30);
    check(Math.abs(b1 - b0) < 0.5, `ElasticBehavior Never: the same pull doesn't stretch (${b0.toFixed(1)} -> ${b1.toFixed(1)})`);
    // X only: a vertical drag doesn't move it; a horizontal one does.
    const sb = await box('Strip');
    await drag(sb.x + 200, sb.y + 30, 0, -60); await t.sim(2);
    const sv = (await get('Strip')).CanvasPosition;
    await drag(sb.x + 200, sb.y + 30, -120, 0); await t.sim(2);
    const sh = (await get('Strip')).CanvasPosition;
    check(sv.x === 0 && sv.y === 0 && Math.abs(sh.x - 100) < 0.5, `an X-only strip ignores a vertical drag (${sv.x}) and follows a horizontal one (${sh.x})`);
  }
  // The golden: the list scrolled two rows down.
  await luau('game.Players.LocalPlayer.PlayerGui.Shop.List.CanvasPosition = Vector2.new(0, 92)', 2);
  await t.frames(2);
  await t.shot('gui-scroll'); await t.golden('gui-scroll', { text: true });
  done();
}
