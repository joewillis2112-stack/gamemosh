// UIGradient (places/gradient-lab.luau), desktop and phone, by screen pixels (expected colours worked
// out from the gradient's rule in runtime/gui.js; sRGB, as Roblox's sequences interpolate):
// - Roblox's defaults (Instance.new): white to white, opaque, Rotation 0, Offset 0, Enabled;
// - red to blue left to right on white shows the gradient's own colours along the bar;
// - a transparency gradient fades a white bar into what's behind it;
// - Rotation 90 runs top to bottom; Offset (0.5, 0) moves it right by half the width (the left half
//   holds the first colour);
// - on a yellow frame the colour multiplies (red to black); a disabled gradient leaves the
//   background plain; a child keeps its own colour;
// - a TextLabel's text takes the gradient (yellow at the top of the glyphs, red at the bottom);
// - an ImageLabel's image is tinted by it, and stays clear where the image is clear.
// Golden: the lab, desktop and phone.
import { helpers, INSET } from '../gui-helpers.mjs';

export default async function (t) {
  const { check, done, box, luau, logs, shotPx, near } = helpers(t);
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(2); await t.frames(2);

  await luau('local g = Instance.new("UIGradient") print("defaults", g.Color, "|", g.Transparency, "|", g.Rotation, g.Offset, g.Enabled)');
  const dl = logs().find(l => l.startsWith('defaults'));
  check(dl === 'defaults 0 1 1 1 0 1 1 1 1 0  | 0 0 0 1 0 0  | 0 0, 0 true', `Instance.new defaults (${dl})`);

  // An image with a gradient (as the Vector Editor writes one: an SVG data URL), yellow on its left half.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M0 0L32 0L32 64L0 64Z" fill="#ffff00"/></svg>';
  await luau(`local il = Instance.new("ImageLabel") il.Name = "Icon" il.Size = UDim2.fromOffset(64, 64) il.Position = UDim2.fromOffset(16, 386)
    il.BackgroundTransparency = 1 il.Image = "data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" il.ScaleType = Enum.ScaleType.Stretch
    local g = Instance.new("UIGradient", il) g.Color = ColorSequence.new(Color3.new(1, 0, 0), Color3.new(0, 0, 1))
    il.Parent = game.Players.LocalPlayer.PlayerGui.Shine`, 2);
  await t.frames(2); await t.page.waitForTimeout(200);

  const px = await shotPx();
  const at = async (name, u, v) => { const b = await box(name); return px(b.x + b.w * u, b.y + b.h * v); };
  const lerp = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);
  const red = [255, 0, 0], blue = [0, 0, 255];
  const bar = [await at('Bar', 0.1, 0.5), await at('Bar', 0.5, 0.5), await at('Bar', 0.9, 0.5)];
  check(near(bar[0], lerp(red, blue, 0.1)) && near(bar[1], lerp(red, blue, 0.5)) && near(bar[2], lerp(red, blue, 0.9)), `red to blue along the bar on white (${bar.map(p => p.join(',')).join(' | ')})`);
  const rot = [await at('Rot', 0.5, 0.1), await at('Rot', 0.5, 0.9), await at('Rot', 0.1, 0.5), await at('Rot', 0.9, 0.5)];
  check(near(rot[0], [25.5, 25.5, 25.5]) && near(rot[1], [229.5, 229.5, 229.5]) && near(rot[2], rot[3], 2), `Rotation 90: black at the top to white at the bottom, the same across (${rot.map(p => p.join(',')).join(' | ')})`);
  const sh = [await at('Shifted', 0.25, 0.5), await at('Shifted', 0.75, 0.5)];
  check(near(sh[0], red) && near(sh[1], lerp(red, blue, 0.25)), `Offset (0.5, 0): the first colour fills the left half, the rest follows shifted (${sh.map(p => p.join(',')).join(' | ')})`);
  // 45 degrees, in shares of the box: t = ((u - 0.5) + (v - 0.5)) / 2 + 0.5, so (0.1, 0.1) is at t 0.1 and (0.9, 0.9) at 0.9.
  const dg = [await at('Diagonal', 0.1, 0.1), await at('Diagonal', 0.9, 0.9), await at('Diagonal', 0.9, 0.1)];
  check(near(dg[0], lerp(red, blue, 0.1)) && near(dg[1], lerp(red, blue, 0.9)) && near(dg[2], lerp(red, blue, 0.5)), `Rotation 45 runs corner to corner on a 2:1 box (${dg.map(p => p.join(',')).join(' | ')})`);
  const ti = await at('Tinted', 0.5, 0.5), off = await at('Off', 0.5, 0.5);
  check(near(ti, [127.5, 0, 0]), `on a yellow frame the colours multiply: half way is dark red (${ti})`);
  check(near(off, [40, 170, 90], 2), `Enabled false: the plain background (${off})`);
  const kid = await at('Kid', 0.5, 0.5), pb = await box('Parent'), par = px(pb.x + 100, pb.y + 25);
  check(near(kid, [40, 170, 90], 2) && near(par, lerp(red, blue, 1 / 3)), `a child keeps its own colour (${kid}) while its parent's background is the gradient (${par})`);
  const ic = [await at('Icon', 0.25, 0.5), await at('Icon', 0.75, 0.5)];
  // The fade and the icon's clear half: against the same spots with those objects hidden.
  const fb = await box('Fade'), fp = [px(fb.x + fb.w * 0.1, fb.y + 20), px(fb.x + fb.w * 0.9, fb.y + 20)];
  await luau('local s = game.Players.LocalPlayer.PlayerGui.Shine s.Fade.Visible = false s.Icon.Visible = false', 2); await t.frames(2);
  const px2 = await shotPx(), ib = await box('Icon');
  const behind = [px2(fb.x + fb.w * 0.1, fb.y + 20), px2(fb.x + fb.w * 0.9, fb.y + 20)], iBehind = px2(ib.x + ib.w * 0.75, ib.y + ib.h * 0.5);
  await luau('local s = game.Players.LocalPlayer.PlayerGui.Shine s.Fade.Visible = true s.Icon.Visible = true', 2); await t.frames(2);
  check(near(fp[0], lerp(behind[0], [255, 255, 255], 0.9), 4) && near(fp[1], lerp(behind[1], [255, 255, 255], 0.1), 4), `a transparency gradient fades white into what's behind (${fp.map(p => p.join(',')).join(' | ')} over ${behind.map(p => p.join(',')).join(' | ')})`);
  check(near(ic[0], [191, 0, 0]) && near(ic[1], iBehind, 3), `an image's colours multiply by the gradient's (yellow x red-to-blue at a quarter: dark red) (${ic[0]}) and stays clear where it is clear (${ic[1]} vs ${iBehind})`);

  // The title's glyphs: the text pixels (those that change when the title hides) in the top and bottom thirds.
  const tb = await box('Title');
  const textPx = async () => {
    const a = await shotPx();
    await luau('game.Players.LocalPlayer.PlayerGui.Shine.Title.Visible = false', 2); await t.frames(2);
    const b = await shotPx();
    await luau('game.Players.LocalPlayer.PlayerGui.Shine.Title.Visible = true', 2); await t.frames(2);
    const bands = [[], []], want = [[], []]; // glyph pixels, and the gradient's green at their height (230 at the box's top to 40 at its bottom)
    for (let y = Math.ceil(tb.y); y < tb.y + tb.h; y++) for (let x = Math.ceil(tb.x); x < tb.x + tb.w; x += 2) {
      const p = a(x, y), q = b(x, y);
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 120) continue; // not a solid glyph pixel
      const v = (y - tb.y) / tb.h, k = v < 0.5 ? 0 : 1;
      bands[k].push(p); want[k].push(230 + (40 - 230) * v);
    }
    const mean = l => l.length ? l.reduce((s, p) => s.map((v, i) => v + p[i]), [0, 0, 0]).map(v => v / l.length) : null;
    return [...bands.map(mean), want.map(l => l.reduce((s, v) => s + v, 0) / Math.max(1, l.length))];
  };
  const [top, bottom, wantG] = await textPx();
  check(top && bottom && Math.abs(top[1] - wantG[0]) < 12 && Math.abs(bottom[1] - wantG[1]) < 12 && top[1] > bottom[1] + 40 && top[0] > 230 && bottom[0] > 230 && top[2] < 30,
    `the title's glyphs take the gradient over the label's box: yellower at the top (${top && top.map(Math.round)}; green expected ${wantG[0].toFixed(0)}), redder at the bottom (${bottom && bottom.map(Math.round)}; ${wantG[1].toFixed(0)})`);

  await t.shot('gui-gradient'); await t.golden('gui-gradient', { text: true });
  done();
}
