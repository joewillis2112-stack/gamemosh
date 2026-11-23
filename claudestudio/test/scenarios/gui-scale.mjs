// UIScale and UISizeConstraint (places/scale-lab.luau), desktop and phone:
// - defaults: UIScale.Scale 1; UISizeConstraint MinSize (0, 0), MaxSize (inf, inf);
// - a 200 x 100 card at 1.5x, anchored at its centre (180, 120): AbsoluteSize 300 x 150 about the same
//   centre; its children scale with it (a 0.5-wide, 20 px badge at (10, 10) becomes 150 x 30 at
//   (15, 15) from the card's corner; the title's 20 px text is drawn 30 px tall); on screen the card
//   reaches 330 px across, where unscaled it would stop at 280;
// - a 100 x 40 box at 0.5 anchored at its top left stays at its corner, 50 x 20;
// - UISizeConstraint: a full-width bar is held to 250 px; a 10 x 10 box is held up to 60 x 30;
// - a ScreenGui with a UIScale of 0.5: a 100 x 100 frame pinned 10 px in from the bottom-right corner
//   is 50 x 50, 5 px in, so scaled screens still reach their edges (OURS: our reading).
// Golden: the lab, desktop and phone.
import { helpers, INSET } from '../gui-helpers.mjs';

export default async function (t) {
  const { check, done, get, box, luau, logs, shotPx, near } = helpers(t);
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(2); await t.frames(2);
  const eq = (a, b, tol = 0.01) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const abs = async n => { const p = await get(n); return [p.AbsolutePosition.x, p.AbsolutePosition.y, p.AbsoluteSize.x, p.AbsoluteSize.y]; };

  await luau('print("defaults", Instance.new("UIScale").Scale, Instance.new("UISizeConstraint").MinSize, Instance.new("UISizeConstraint").MaxSize)');
  const dl = logs().find(l => l.startsWith('defaults'));
  check(dl === 'defaults 1 0, 0 inf, inf', `Instance.new defaults (${dl})`);
  check(logs().includes('scales built 250, inf 60, 30 inf, inf'), `a script sets and reads the constraint's sizes (${logs().find(l => l.startsWith('scales'))})`);

  const card = await abs('Card');
  check(eq(card, [30, 45, 300, 150]), `UIScale 1.5 on a 200 x 100 card anchored at its centre (180, 120): 300 x 150 about that centre (${card})`);
  const badge = await abs('Badge');
  check(eq(badge, [45, 60, 150, 30]), `its children scale with it: the badge is 150 x 30 at 15 px in (${badge})`);
  const th = await t.eval(() => { const s = window.studio, l = [...s.gui.els.keys()].find(i => i.props.Name === 'CardTitle'); return s.gui.els.get(l).span.getBoundingClientRect().height; });
  check(Math.abs(th - 30) < 1.5, `and its 20 px text is drawn 30 px tall (${th.toFixed(1)})`);
  const px = await shotPx(), cb = await box('Card');
  const inside = px(cb.x + cb.w - 6, cb.y + cb.h / 2), behind = px(cb.x + cb.w + 6, cb.y + cb.h / 2);
  check(near(inside, [250, 245, 235], 3) && !near(behind, [250, 245, 235], 20), `on screen the card reaches ${cb.x + cb.w} px (unscaled it would stop at 280): ${inside} inside, ${behind} past it`);
  const small = await abs('Small');
  check(eq(small, [30, 220, 50, 20]), `UIScale 0.5 anchored at the top left keeps that corner: 50 x 20 at (30, 220) (${small})`);
  const wide = await abs('Wide'), tiny = await abs('Tiny');
  check(wide[2] === 250 && wide[3] === 30, `UISizeConstraint MaxSize 250: a full-width bar is 250 px (${wide[2]} x ${wide[3]})`);
  check(tiny[2] === 60 && tiny[3] === 30, `UISizeConstraint MinSize 60 x 30: a 10 x 10 box grows to it (${tiny[2]} x ${tiny[3]})`);
  const W = await t.eval(() => innerWidth), H = await t.eval(() => innerHeight);
  const corner = await abs('Corner');
  check(eq(corner, [W - 55, H - INSET - 55, 50, 50]), `a ScreenGui's UIScale 0.5: a frame pinned 10 px from the bottom-right corner is 50 x 50, 5 px in (${corner} on ${W} x ${H - INSET})`);
  const cp = px(W - 10, H - 10);
  check(near(cp, [150, 60, 200], 3), `and it is drawn there (${cp})`);

  await t.shot('gui-scale'); await t.golden('gui-scale', { text: true });
  done();
}
