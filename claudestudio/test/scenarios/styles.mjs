// Claude Studio's own looks (runtime/styles.js) on places/styles-lab.luau:
// - defaults, and that each is a Lighting effect the place keeps (Enabled toggles it);
// - ToonEffect: across the lit ball, shading falls into flat steps (most neighbouring pixels equal);
// - OutlineEffect: the ball's silhouette against the floor turns to ink; the middle of the flat
//   floor and of the block's face don't (planes never draw lines); Transparency 1 draws nothing;
// - PixelEffect: every PixelSize block is one colour; with Colors, every channel is one of the
//   levels; Dither keeps to the levels too;
// - none of them depends on the fidelity tier (run on phone and low as well).
// Goldens: the cel look (Toon + Outline) and the pixel look.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('styles ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); }
  await t.sim(5); await t.eval(() => window.studio.lighting.settled());
  const run = async src => { await t.eval(s => window.studio.vm.run('st', s), src); await t.sim(1); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  // A fixed view of the lab, from above the character (its idle animation moves pixels near it).
  await t.eval(() => { const c = window.studio.camera, cv = document.getElementById('c'), a = cv.width / cv.height; c.yaw = 0; c.pitch = 0.32; c.zoom = c.z = c.dist = 34 * Math.max(1, 1.3 / a); c.update(0); });

  await run(`local a, b, c = Instance.new("ToonEffect"), Instance.new("OutlineEffect"), Instance.new("PixelEffect")
    print("defaults", a.Enabled, a.Bands, a.Softness, b.Color.R, b.Transparency, b.Thickness, b.DepthSensitivity, b.NormalSensitivity, c.PixelSize, c.Colors, c.Dither)`);
  check(logs().includes('defaults true 3 0.05 0 0 1 0.5 0.5 4 0 false'), 'defaults: Toon 3 bands; Outline black, 1 px, sensitivities 0.5; Pixel 4 px, all colours, no dither');

  // Frames stay in the page; tests ask questions of them there.
  const grab = name => t.eval(async name => {
    const S = window.studio; S.frames(2); await S.scene.whenReadyAsync(); S.frames(2);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    (window.shots_ = window.shots_ || {})[name] = { w: c.width, h: c.height, px };
    return S.styles.key;
  }, name);
  // Screen point (bottom-up, as readPixels) of a world point.
  const at = pt => t.eval(pt => { const S = window.studio, c = document.getElementById('c'), cam = S.cam, V = cam.position.constructor; const p = V.Project(new V(...pt), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [Math.round(p.x), Math.round(c.height - 1 - p.y)]; }, pt);
  const pixel = (name, [x, y]) => t.eval(([n, x, y]) => { const s = window.shots_[n], i = (y * s.w + x) * 4; return [s.px[i], s.px[i + 1], s.px[i + 2]]; }, [name, x, y]);
  const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  const base = await grab('base');
  check(base === '', 'no style effects at first');
  // The ball: a horizontal run of pixels across its middle.
  const [bx, by] = await at([-12, 4, -6]), [ex] = await at([-8.2, 4, -6]);
  const flatShare = name => t.eval(([n, x0, x1, y]) => { const s = window.shots_[n]; let flat = 0, all = 0; for (let x = x0; x < x1; x++) { const i = (y * s.w + x) * 4, j = i + 4; const d = Math.abs(s.px[i] - s.px[j]) + Math.abs(s.px[i + 1] - s.px[j + 1]) + Math.abs(s.px[i + 2] - s.px[j + 2]); all++; if (d === 0) flat++; } return flat / all; }, [name, bx - Math.round((ex - bx) * 0.8), bx + Math.round((ex - bx) * 0.8), by]);
  const smooth = await flatShare('base');

  await run('local e = Instance.new("ToonEffect") e.Parent = game:GetService("Lighting")');
  const k1 = await grab('toon');
  const toon = await flatShare('toon');
  check(k1 === 'toon' && toon > 0.75 && toon > smooth + 0.25, `ToonEffect: across the ball ${Math.round(toon * 100)}% of neighbouring pixels are equal (smooth shading: ${Math.round(smooth * 100)}%)`);
  await run('game:GetService("Lighting").ToonEffect.Enabled = false');
  const off = await grab('toonoff'), back = await flatShare('toonoff');
  check(off === '' && Math.abs(back - smooth) < 0.05, `Enabled false: smooth again (${Math.round(back * 100)}%)`);
  await run('game:GetService("Lighting").ToonEffect.Enabled = true');

  // Outline: silhouettes ink; flat interiors don't.
  await run('local e = Instance.new("OutlineEffect") e.Parent = game:GetService("Lighting")');
  await grab('ink');
  const floorMid = await at([-2, 0, 2]), blockFace = await at([0, 3, -7]);
  // The ball's lower silhouette against the floor: scan down from its centre until the colour changes from the ball's.
  // Across the ball's middle row, from outside it on the left to outside it on the right: two ink crossings.
  const edgeInk = await t.eval(([bx, by, r]) => { const s = window.shots_.ink; let dark = 0; for (let x = bx - r; x <= bx + r; x++) { const i = (by * s.w + x) * 4; if (s.px[i] < 30 && s.px[i + 1] < 30 && s.px[i + 2] < 30) dark++; } return dark; }, [bx, by, Math.round((ex - bx) * 1.4)]);
  check(edgeInk >= 2, `OutlineEffect: the ball's silhouette is inked (${edgeInk} black pixels across its middle row)`);
  const fm0 = await pixel('toon', floorMid), fm1 = await pixel('ink', floorMid), bf0 = await pixel('toon', blockFace), bf1 = await pixel('ink', blockFace);
  check(fm0.every((v, i) => Math.abs(v - fm1[i]) <= 2) && bf0.every((v, i) => Math.abs(v - bf1[i]) <= 2), `flat surfaces draw no lines: the floor (${fm1}) and the block's face (${bf1}) as before`);
  // A crease: the block's top-front edge (two faces at the same distance) is inked; the ball's curve is not.
  const [cx, cy] = await at([1, 6, -7]);
  const creaseInk = await t.eval(([n, x, y]) => { const s = window.shots_[n]; let d = 0; for (let yy = y - 3; yy <= y + 3; yy++) { const i = (yy * s.w + x) * 4; if (s.px[i] < 20 && s.px[i + 1] < 20 && s.px[i + 2] < 20) d++; } return d; }, ['ink', cx, cy]);
  const ballMid = await pixel('ink', [bx, by]), ballMid0 = await pixel('toon', [bx, by]);
  check(creaseInk >= 1 && ballMid.every((v, i) => Math.abs(v - ballMid0[i]) <= 2), `NormalSensitivity: the block's edge is inked (${creaseInk} px), the middle of the ball is not (${ballMid})`);
  await run('game:GetService("Lighting").OutlineEffect.NormalSensitivity = 0'); await grab('nocrease');
  const creaseOff = await t.eval(([n, x, y]) => { const s = window.shots_[n]; let d = 0; for (let yy = y - 3; yy <= y + 3; yy++) { const i = (yy * s.w + x) * 4; if (s.px[i] < 20 && s.px[i + 1] < 20 && s.px[i + 2] < 20) d++; } return d; }, ['nocrease', cx, cy]);
  check(creaseOff === 0, `NormalSensitivity 0: creases draw nothing (${creaseOff} px), silhouettes still do`);
  await run('game:GetService("Lighting").OutlineEffect.NormalSensitivity = 0.5');
  await run('game:GetService("Lighting").OutlineEffect.Transparency = 1');
  await grab('inkoff');
  // Compared around the ball (the character's idle animation moves pixels elsewhere).
  const same = await t.eval(([bx, by, r]) => { const a = window.shots_.toon, b = window.shots_.inkoff; let n = 0; for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) { const i = (y * a.w + x) * 4; if (Math.abs(a.px[i] - b.px[i]) > 2) n++; } return n; }, [bx, by, Math.round((ex - bx) * 1.4)]);
  check(same === 0, `Transparency 1 draws no ink (${same} pixels differ around the ball)`);
  await run('game:GetService("Lighting").OutlineEffect.Transparency = 0');
  await grab('cel');
  await t.golden('styles-cel');
  await run('game:GetService("Lighting").ToonEffect:Destroy() game:GetService("Lighting").OutlineEffect:Destroy()');

  // Pixel: blocks of one colour; palette levels.
  const blocks = (name, size) => t.eval(([n, size]) => {
    const s = window.shots_[n]; let bad = 0, total = 0;
    for (let by = 0; by + size <= s.h; by += size) for (let bx = 0; bx + size <= s.w; bx += size) {
      total++;
      const i0 = (by * s.w + bx) * 4;
      outer: for (let y = by; y < by + size; y++) for (let x = bx; x < bx + size; x++) { const i = (y * s.w + x) * 4; if (s.px[i] !== s.px[i0] || s.px[i + 1] !== s.px[i0 + 1] || s.px[i + 2] !== s.px[i0 + 2]) { bad++; break outer; } }
    }
    return { bad, total };
  }, [name, size]);
  const levels = name => t.eval(n => { const s = window.shots_[n], set = new Set(); for (let i = 0; i < s.px.length; i += 4) { set.add(s.px[i]); set.add(s.px[i + 1]); set.add(s.px[i + 2]); } return [...set].sort((a, b) => a - b); }, name);
  await run('local e = Instance.new("PixelEffect") e.PixelSize = 6 e.Parent = game:GetService("Lighting")');
  await grab('px6');
  const b6 = await blocks('px6', 6);
  check(b6.bad === 0 && b6.total > 1000, `PixelEffect 6: all ${b6.total} blocks of 6 x 6 are one colour`);
  await run('local e = game:GetService("Lighting").PixelEffect e.PixelSize = 4 e.Colors = 4');
  await grab('pal');
  const lv = await levels('pal');
  check(lv.every(v => [0, 85, 170, 255].includes(v)), `Colors 4: every channel is 0, 85, 170 or 255 (${lv.join(',')})`);
  await t.golden('styles-pixel');
  await run('game:GetService("Lighting").PixelEffect.Dither = true');
  await grab('dither');
  const lvd = await levels('dither'), b4 = await blocks('dither', 4);
  const differs = await t.eval(() => { const a = window.shots_.pal.px, b = window.shots_.dither.px; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; });
  check(lvd.every(v => [0, 85, 170, 255].includes(v)) && b4.bad === 0 && differs > 1000, `Dither: still the 4 levels and whole blocks, ${differs} values moved by the pattern`);
  await run('game:GetService("Lighting").PixelEffect:Destroy()');
  check(await grab('end') === '', 'removed, the passes go');
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('styles: all checks passed');
}
