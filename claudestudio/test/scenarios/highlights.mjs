// Highlight (runtime/highlights.js), against creator-docs Highlight.yaml and the API dump:
// - Instance.new defaults;
// - every pixel around the highlights checked against the mask: inside it, the fill blended at 1 - FillTransparency;
//   outside it within LineThickness pixels, the outline at 1 - OutlineTransparency; everywhere else,
//   nothing changed;
// - DepthMode: AlwaysOnTop shows through a wall in front, Occluded only where the part is seen;
// - Adornee: a model's parts, from a Highlight kept elsewhere; Enabled false draws nothing;
// - a character's Highlight covers its body; at most 255 count.
// Golden: the scene with three highlights.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !(await t.eval(() => window.studio && window.studio.ready)); i++) await t.page.waitForTimeout(200);
  await t.sim(30); await t.eval(() => window.studio.lighting.settled());
  const run = async src => { await t.eval(s => window.studio.vm.run('hl', s), src); await t.sim(1); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));

  await run(`local h = Instance.new("Highlight") print("defaults", h.Enabled, h.DepthMode.Name, h.FillColor.R, h.FillColor.G, h.FillTransparency, h.OutlineColor.R, h.OutlineTransparency, h.LineThickness, h.Adornee)`);
  check(logs().includes('defaults true AlwaysOnTop 1 0 0.5 1 0 1 nil'), 'Instance.new defaults (API dump): Enabled, AlwaysOnTop, red fill at 0.5, white outline, 1 px, no Adornee');

  // A grey block in front of the camera, a wall covering its left half, and a model of two blocks to the right.
  await run(`local function part(name, size, pos, color, parent) local p = Instance.new("Part") p.Name = name p.Anchored = true p.Size = size p.Position = pos p.Color = color p.Parent = parent or workspace return p end
    local f = workspace.CurrentCamera.CFrame local at = f.Position + f.LookVector * 30 + f.UpVector * 7 -- above the character, whose animation moves pixels
    part("Target", Vector3.new(6, 6, 6), at - f.RightVector * 6, Color3.fromRGB(128, 128, 128))
    local wall = part("Wall", Vector3.new(4, 10, 1), at - f.RightVector * 8 + f.LookVector * -8, Color3.fromRGB(60, 60, 70)) wall.CFrame = CFrame.lookAt(wall.Position, wall.Position - f.LookVector)
    local m = Instance.new("Model") m.Name = "Pair" m.Parent = workspace
    part("A", Vector3.new(3, 3, 3), at + f.RightVector * 6, Color3.fromRGB(90, 140, 90), m) part("B", Vector3.new(3, 3, 3), at + f.RightVector * 10, Color3.fromRGB(90, 90, 140), m)`);

  // The frame and the mask are read and kept in the page (both bottom-up, the canvas size); the
  // comparison runs there too, and only its summary comes back.
  const frame = name => t.eval(async name => {
    const S = window.studio; S.frames(2); await S.scene.whenReadyAsync(); S.frames(2);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    const H = S.highlights, mask = H.mask ? new Uint8Array((await H.mask.readPixels()).buffer) : null;
    (window.frames_ = window.frames_ || {})[name] = { w: c.width, h: c.height, px, mask };
    // (Compared only in the test's box: the character's idle animation moves pixels elsewhere.)
    const B = window.box_, inBox = i => { if (!B) return true; const q = i >> 2, x = q % c.width, y = (q / c.width) | 0; return x >= B[0] && x <= B[2] && y >= B[1] && y <= B[3]; };
    return { count: H.count || 0, same: window.frames_.base ? px.every((v, i) => !inBox(i) || Math.abs(v - window.frames_.base.px[i]) <= 3) : null, body: mask ? mask.filter((v, i) => i % 4 === 0 && v).length : 0 };
  }, name);
  const base = await frame('base');
  // Checks a frame with highlights against the base frame: params by highlight number,
  // [fill rgb, fill opacity, outline rgb, outline opacity, thickness].
  const verify = (name, params) => t.eval(([name, params]) => {
    const b = window.frames_.base, a = window.frames_[name], { w, h } = a;
    const id = i => a.mask[i * 4];
    // The box around everything highlighted, plus the widest outline and a margin: checked pixel by pixel.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < w * h; i++) if (id(i)) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const M = 12; x0 = Math.max(0, x0 - M); y0 = Math.max(0, y0 - M); x1 = Math.min(w - 1, x1 + M); y1 = Math.min(h - 1, y1 + M);
    window.box_ = [x0, y0, x1, y1];
    let inside = 0, outline = 0, bad = 0, badAt = '';
    const mix = (c, f, al) => c + (f - c) * al;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x, k = id(i);
      let want;
      if (k) { const p = params[k]; want = [0, 1, 2].map(c => mix(b.px[i * 4 + c], p[0][c], p[1])); inside++; }
      else {
        let best = 1e9, bk = 0; const R = 8;
        for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -R; dx <= R; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d >= best) continue;
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const n = id(yy * w + xx); if (n && params[n] && d <= params[n][4]) { best = d; bk = n; }
        } }
        if (bk) { const p = params[bk]; want = [0, 1, 2].map(c => mix(b.px[i * 4 + c], p[2][c], p[3])); outline++; }
        else want = [b.px[i * 4], b.px[i * 4 + 1], b.px[i * 4 + 2]];
      }
      if (Math.abs(want[0] - a.px[i * 4]) > 3 || Math.abs(want[1] - a.px[i * 4 + 1]) > 3 || Math.abs(want[2] - a.px[i * 4 + 2]) > 3) { if (!bad) badAt = `${x},${y}: ${[a.px[i * 4], a.px[i * 4 + 1], a.px[i * 4 + 2]]} vs ${want.map(Math.round)}`; bad++; }
    }
    return { inside, outline, bad, badAt };
  }, [name, params]);
  const fill = [255, 0, 0], white = [255, 255, 255];

  await run('local h = Instance.new("Highlight") h.Name = "H1" h.Parent = workspace.Target');
  let f1 = await frame('a'), v = await verify('a', { 1: [fill, 0.5, white, 1, 1] });
  check(f1.count === 1 && v.inside > 500 && v.outline > 50 && v.bad === 0, `the default Highlight: ${v.inside} pixels filled red at 0.5, ${v.outline} outlined white, the rest of the frame untouched (${v.bad} wrong${v.badAt ? ', first at ' + v.badAt : ''})`);
  const topInside = v.inside;
  await run('local h = workspace.Target.H1 h.DepthMode = Enum.HighlightDepthMode.Occluded');
  f1 = await frame('a'); v = await verify('a', { 1: [fill, 0.5, white, 1, 1] });
  check(v.bad === 0 && v.inside < topInside * 0.9 && v.inside > 200, `Occluded: only the part not behind the wall (${v.inside} of ${topInside} pixels), still exact`);
  await run('local h = workspace.Target.H1 h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop h.FillColor = Color3.new(0, 0, 1) h.FillTransparency = 0 h.OutlineColor = Color3.new(1, 1, 0) h.OutlineTransparency = 0.5 h.LineThickness = 3');
  f1 = await frame('a'); v = await verify('a', { 1: [[0, 0, 255], 1, [255, 255, 0], 0.5, 3] });
  check(v.bad === 0 && v.outline > 150, `FillColor blue opaque, OutlineColor yellow at 0.5, LineThickness 3 (${v.outline} outline pixels, ${v.bad} wrong${v.badAt ? ', first at ' + v.badAt : ''})`);
  await run('workspace.Target.H1.Enabled = false');
  f1 = await frame('a');
  check(f1.count === 0 && f1.same, 'Enabled false: the frame is as before');
  // Adornee: a Highlight kept in ReplicatedStorage, pointing at the model.
  await run('local h = Instance.new("Highlight") h.Name = "H2" h.Adornee = workspace.Pair h.FillColor = Color3.new(0, 1, 0) h.Parent = game:GetService("ReplicatedStorage")');
  f1 = await frame('a'); v = await verify('a', { 1: [[0, 255, 0], 0.5, white, 1, 1] });
  check(f1.count === 1 && v.inside > 300 && v.bad === 0, `Adornee = a model: both of its parts (${v.inside} pixels), from a Highlight in ReplicatedStorage`);
  await t.golden('highlights');
  await run('game:GetService("ReplicatedStorage").H2:Destroy()');
  // A character: the player's body.
  await run('local h = Instance.new("Highlight") h.Name = "HC" h.Parent = game:GetService("Players").LocalPlayer.Character');
  f1 = await frame('a');
  const body = f1.body;
  check(f1.count === 1 && body > 200, `a Highlight in the character covers its body (${body} mask pixels)`);
  await run('game:GetService("Players").LocalPlayer.Character.HC:Destroy()');
  // Roblox's limit.
  await run('for i = 1, 260 do local h = Instance.new("Highlight") h.Parent = workspace.Target end');
  f1 = await frame('a');
  check(f1.count === 255, `260 Highlights: ${f1.count} draw (Roblox's limit is 255)`);
  await run('for _, h in ipairs(workspace.Target:GetChildren()) do if h:IsA("Highlight") then h:Destroy() end end');
  f1 = await frame('a');
  check(f1.count === 0 && !(await t.eval(() => !!window.studio.highlights.mask)), 'with none left, the mask pass is gone');
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('highlights: all checks passed');
}
