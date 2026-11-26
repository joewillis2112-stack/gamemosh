// SurfaceGuis (run with --place places/surfacegui-lab.luau; runtime/gui.js, surfacegui.js, surfaces.js), read from
// the page's own pixels (screenshots: the 3D view and the GUI over it), from a scripted camera:
// - every face of a cube, and a wedge's slope, shows its pattern (left half red, right half blue, a green band on
//   top) the right way round and up, seen from outside: the expected places come from the camera's own axes;
// - its text is where the page lays it out: the face's image (glyph outlines) against the same SurfaceGui drawn
//   AlwaysOnTop (live DOM text), as masks of the letters;
// - a wall hides the part of a board behind it; AlwaysOnTop draws over the wall;
// - a change to its contents redraws the image; MaxDistance hides it; Brightness brightens it, LightInfluence lights it;
// - SizingMode: FixedSize is CanvasSize, PixelsPerStud the face's studs times PixelsPerStud, following the part;
// - a button on a SurfaceGui in PlayerGui (adorning a part) takes a click or tap, not through a wall in front of
//   it, and through it when AlwaysOnTop.
import { PNG } from 'pngjs';

export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('sg', s), src);
  const phone = t.variant.includes('phone');
  // Laid out, every image drawn (none waiting or being drawn), then two frames rendered.
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      await t.sim(1);
      const busy = await t.eval(() => [...window.studio.gui.els.values()].some(e => e.sgLayout && (e.sgBusy || e.sgPending)));
      if (!busy) break;
      await new Promise(r => setTimeout(r, 25));
    }
    await t.eval(() => window.studio.frames(2));
  };
  const look = async (eye, at, up = [0, 1, 0]) => {
    await run(`local c = workspace.CurrentCamera; c.CameraType = Enum.CameraType.Scriptable; c.CFrame = CFrame.lookAt(Vector3.new(${eye}), Vector3.new(${at}), Vector3.new(${up}))`);
    await settle();
  };
  const grab = async () => { const png = PNG.sync.read(await t.page.screenshot()); png.k = png.width / (await t.eval(() => innerWidth)); return png; };
  const at = (png, p) => { const x = Math.round(p.x * png.k), y = Math.round(p.y * png.k), i = (y * png.width + x) * 4; return x < 0 || y < 0 || x >= png.width || y >= png.height ? [-1, -1, -1] : [png.data[i], png.data[i + 1], png.data[i + 2]]; }; // (off the page: no colour)
  // A world point's page position, and points on a face from the camera's own right and up.
  const proj = p => t.eval(p => window.studio.gui.view.project(p), p);
  const camAxes = () => t.eval(() => { const m = window.studio.dm.workspace.props.CurrentCamera.props.CFrame.m; return { right: [m[3], m[6], m[9]], up: [m[4], m[7], m[10]] }; });
  const off = (c, A, r, u) => [0, 1, 2].map(i => c[i] + A.right[i] * r + A.up[i] * u);
  const colour = ([r, g, b]) => r > g + 50 && r > b + 50 ? 'red' : b > r + 50 && b > g + 30 ? 'blue' : g > r + 50 && g > b + 50 ? 'green' : `(${r},${g},${b})`;
  // The pattern on a face centred at c (half size h studs, up the canvas): red left, blue right, green on top.
  const pattern = async (c, h) => {
    const A = await camAxes(), png = await grab();
    const got = [];
    for (const [r, u] of [[-h / 2, -h / 6], [h / 2, -h / 6], [0, h * 0.8]]) { const p = await proj(off(c, A, r, u)); got.push(p ? colour(at(png, p)) : 'off'); }
    return got.join(' ');
  };

  // Every face of the cube (at 0, 20, 0; 6 studs), from 12 studs out along its normal: on the sides up is up; on
  // Top the canvas's up points to the part's Back (+Z), on Bottom to its Front (-Z).
  const C = [0, 20, 0], faces = [['Back', [0, 0, 1], [0, 1, 0]], ['Front', [0, 0, -1], [0, 1, 0]], ['Right', [1, 0, 0], [0, 1, 0]], ['Left', [-1, 0, 0], [0, 1, 0]], ['Top', [0, 1, 0], [0, 0, 1]], ['Bottom', [0, -1, 0], [0, 0, -1]]];
  for (const [name, n, up] of faces) {
    const fc = C.map((v, i) => v + n[i] * 3);
    await look(C.map((v, i) => v + n[i] * 15).join(', '), fc.join(', '), up.join(', '));
    const got = await pattern(fc, 3);
    check(got === 'red blue green', `the cube's ${name}: red left, blue right, green on top (${got})`);
  }
  // The wedge's slope (at -20, 2, 0; 6 x 4 x 8): up the slope is up.
  {
    const L = Math.hypot(4, 8), n = [0, 8 / L, -4 / L], up = [0, 4 / L, 8 / L], c = [-20, 2, 0];
    await look(c.map((v, i) => v + n[i] * 14).join(', '), c.join(', '), up.join(', '));
    const got = await pattern(c, L / 2); // (its canvas is the slope's 8.9 studs tall)
    check(got === 'red blue green', `a wedge's slope: the pattern up the slope (${got})`);
  }

  // The board's text: its image against the same GUI drawn AlwaysOnTop (the page's own text), as masks of the
  // light pixels over the board.
  await look('20, 5, 8.5', '20, 5, 0');
  const box = async () => { const a = await proj([24, 8, 0.5]), b = await proj([16, 2, 0.5]); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; };
  const B = await box();
  const mask = png => { const out = []; for (let y = Math.ceil(B[1] * png.k) + 4; y < B[3] * png.k - 4; y++) for (let x = Math.ceil(B[0] * png.k) + 4; x < B[2] * png.k - 4; x++) { const i = (y * png.width + x) * 4; out.push(png.data[i] + png.data[i + 1] + png.data[i + 2] > 3 * 110 ? 1 : 0); } return out; };
  const tex = mask(await grab());
  await run(`workspace.Board.Screen.AlwaysOnTop = true`); await settle();
  const dom = mask(await grab());
  await run(`workspace.Board.Screen.AlwaysOnTop = false`); await settle();
  let both = 0, either = 0; tex.forEach((v, i) => { both += v & dom[i]; either += v | dom[i]; });
  const lit = tex.reduce((s, v) => s + v, 0), iou = either ? both / either : 0;
  check(lit > 500 && iou > 0.75, `the board's text where the page lays it out: ${lit} lit pixels, ${(iou * 100).toFixed(1)}% overlap with the page's own text`);

  // A change redraws it; MaxDistance hides it.
  const mid = await proj([20, 6.5, 0.5]);
  await run(`workspace.Board.Screen.Label.BackgroundColor3 = Color3.fromRGB(230, 30, 30)`); await settle();
  const red = colour(at(await grab(), mid));
  await run(`workspace.Board.Screen.MaxDistance = 5`); await settle();
  const gone = at(await grab(), mid);
  await run(`workspace.Board.Screen.MaxDistance = 0; workspace.Board.Screen.Label.BackgroundColor3 = Color3.new(0, 0, 0)`); await settle();
  check(red === 'red' && colour(gone) !== 'red' && Math.abs(gone[0] - gone[1]) < 30, `a new background colour redraws it (${red}); MaxDistance 5 from 8 studs hides it (${gone})`);

  // Behind a wall: the wall hides the board's left half; AlwaysOnTop draws over it.
  await look('40, 5, 14', '40, 5, 0');
  const hl = await proj([37.5, 3.5, 0.5]), hr = await proj([42.5, 3.5, 0.5]);
  let png = await grab();
  const w1 = colour(at(png, hl)), w2 = colour(at(png, hr));
  await run(`workspace.Hidden.Behind.AlwaysOnTop = true`); await settle();
  const w3 = colour(at(await grab(), hl));
  await run(`workspace.Hidden.Behind.AlwaysOnTop = false`);
  check(w1 !== 'red' && w2 === 'blue' && w3 === 'red', `behind a wall: hidden there (${w1}), drawn beside it (${w2}); AlwaysOnTop over the wall (${w3})`);

  // Brightness and LightInfluence on the strip's blue.
  await look('0, 2, -10', '0, 2, -20');
  const sb = await proj([1.5, 1.5, -19.5]); // (inside a phone's narrow view)
  const b1 = at(await grab(), sb);
  await run(`workspace.Strip.Sized.Brightness = 2`); await settle();
  const b2 = at(await grab(), sb);
  await run(`workspace.Strip.Sized.Brightness = 1; workspace.Strip.Sized.LightInfluence = 1`); await settle();
  const b3 = at(await grab(), sb);
  await run(`workspace.Strip.Sized.LightInfluence = 0`);
  check(b1[2] > 100 && b2[2] > b1[2] + 15 && Math.max(...b3.map((v, i) => Math.abs(v - b1[i]))) > 10, `Brightness 2 brightens its blue (${b1[2]} -> ${b2[2]}); LightInfluence 1 lights it (${b3})`);

  // Sizes: FixedSize is CanvasSize; PixelsPerStud the face's studs x PixelsPerStud, following the part's Size.
  await run(`print("sz", workspace.Board.Screen.AbsoluteSize.X, workspace.Board.Screen.AbsoluteSize.Y, workspace.Strip.Sized.AbsoluteSize.X, workspace.Strip.Sized.AbsoluteSize.Y)`);
  await run(`workspace.Strip.Size = Vector3.new(20, 2, 1); workspace.Strip.Sized.PixelsPerStud = 25`); await settle();
  await run(`print("sz2", workspace.Strip.Sized.AbsoluteSize.X, workspace.Strip.Sized.AbsoluteSize.Y)`); await t.sim(1);
  const nums = tag => (t.logs.filter(l => new RegExp(`\\[luau\\] ${tag} `).test(l)).pop() || '').replace(/^.*\] \S+ /, '').split(/\s+/).map(Number);
  const s1 = nums('sz'), s2 = nums('sz2');
  check(s1.join(',') === '800,600,500,100' && s2.join(',') === '500,50', `sizes: FixedSize ${s1.slice(0, 2)}, PixelsPerStud ${s1.slice(2)} (50/stud on 10 x 2), then ${s2} (25/stud on 20 x 2)`);

  // The panel's button (its SurfaceGui in PlayerGui): a click or tap on it counts; not through a wall; AlwaysOnTop does.
  await look('-40, 5, 10', '-40, 5, 0');
  const bp = await proj([-42, 3.5, 0.5]);
  const press = async () => { if (phone) await t.page.touchscreen.tap(bp.x, bp.y); else await t.page.mouse.click(bp.x, bp.y); await t.sim(2); };
  const presses = async () => { await run(`print("presses", _G.presses)`); await t.sim(1); return nums('presses')[0]; };
  await press();
  const p1 = await presses();
  await run(`local w = Instance.new("Part"); w.Name = "Blocker"; w.Size = Vector3.new(3, 3, 1); w.CFrame = CFrame.new(-42, 3.5, 5); w.Anchored = true; w.Parent = workspace`); await settle();
  await press();
  const p2 = await presses();
  await run(`game.Players.LocalPlayer.PlayerGui.Controls.AlwaysOnTop = true`); await settle();
  await press();
  const p3 = await presses();
  check(p1 === 1 && p2 === 1 && p3 === 2, `the panel's button: ${phone ? 'a tap' : 'a click'} presses it (${p1}); not through a wall (${p2}); AlwaysOnTop, through it (${p3})`);
  // In the Workspace a SurfaceGui takes no input (the docs: only in PlayerGui).
  const inert = await t.eval(() => { const g = window.studio.gui, sg = g.surfaceGuis().find(s => s.props.Name === 'Screen'); const e = g.els.get(sg); return e.el.classList.contains('cs-bb-inert') && !e.sgAt.M; });
  check(inert, 'in the Workspace: no input (no copy over the face)');

  if (t.shot) { await look('14, 14, 34', '0, 8, 0'); await t.shot('surfaceguis'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
