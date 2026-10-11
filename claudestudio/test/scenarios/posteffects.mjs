// Post effects (runtime/posteffects.js) in places/lighting-lab.luau, against
// mashup-research/ROBLOX_LIGHTING_2026-10-09.md section 5:
// - ColorCorrection: Brightness adds, TintColor multiplies, Saturation -1 is grey;
//   several compose; a disabled one does nothing;
// - Blur: the largest Size wins;
// - DepthOfField: far things blur, things at the focus stay sharp;
// - SunRays: a halo toward the sun, nothing with the sun behind the camera; off on phones;
// - ColorGrading: Retro lowers contrast and saturation; only under Lighting, the latest wins;
// - our passes stay after the tonemap when the pipeline rebuilds (bloom toggled).
// Goldens: colour correction, depth of field, retro grading, sun rays.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('lab ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); }
  await t.sim(5); await t.eval(() => window.studio.lighting.settled());
  const phone = await t.eval(() => window.studio.lighting.quality === 'phone');
  // After a change: a step applies it; new passes compile asynchronously, so render until they're ready.
  const run = async src => {
    await t.eval(s => window.studio.vm.run('lab', s), src); await t.sim(1);
    await t.eval(async () => { const S = window.studio; await S.scene.whenReadyAsync(); for (let i = 0; i < 120 && !S.lighting.post.order.every(pp => pp.isReady()); i++) { S.frames(1); await new Promise(r => setTimeout(r, 20)); } });
  };
  // Pixels: [x, y] in 0..1 of the screen, averaged over 3x3; or a whole region's local contrast.
  const read = (pts, region) => t.eval(([pts, region]) => {
    const S = window.studio; S.frames(3, { move: [0, 0] });
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, W = c.width, H = c.height;
    const px = (x, y, w, h) => { const b = new Uint8Array(w * h * 4); g.readPixels(x, H - y - h, w, h, g.RGBA, g.UNSIGNED_BYTE, b); return b; };
    // A point is [u, v] on screen, or [x, y, z] in the world (projected).
    const V = S.cam.position.constructor, proj = p => { if (p.length === 2) return p; const q = V.Project(new V(...p), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), S.cam.viewport.toGlobal(W, H)); return [q.x / W, q.y / H]; };
    const out = pts.map(p => proj(p)).map(([u, v]) => { const b = px(Math.round(u * W) - 1, Math.round(v * H) - 1, 3, 3); return [0, 1, 2].map(k => { let s = 0; for (let i = 0; i < 9; i++) s += b[i * 4 + k]; return s / 9; }); });
    let contrast = null;
    if (region) { // mean squared difference between neighbouring pixels (sharpness: blur lowers it, unlike total variation)
      const [u0, v0, u1, v1] = region, x = Math.round(u0 * W), y = Math.round(v0 * H), w = Math.round((u1 - u0) * W), h = Math.round((v1 - v0) * H), b = px(x, y, w, h);
      // The strongest edges: the mean of the top 2% of squared neighbour differences
      // (a mean over a mostly flat region dilutes the one edge that matters).
      const d = [];
      for (let j = 0; j < h; j++) for (let i = 0; i + 1 < w; i++) { const a = (j * w + i) * 4; d.push((b[a] - b[a + 4]) ** 2 + (b[a + 1] - b[a + 5]) ** 2 + (b[a + 2] - b[a + 6]) ** 2); }
      d.sort((x, y) => y - x);
      const top = d.slice(0, Math.max(1, Math.round(d.length * 0.02)));
      contrast = top.reduce((x, y) => x + y, 0) / top.length;
    }
    const raw = region ? (() => { const [u0, v0, u1, v1] = region; return Array.from(px(Math.round(u0 * W), Math.round(v0 * H), Math.round((u1 - u0) * W), Math.round((v1 - v0) * H))); })() : null;
    return { pts: out, contrast, raw };
  }, [pts, region || null]);
  const passes = () => t.eval(() => window.studio.lighting.post.key);

  check(await passes() === (phone ? '' : 'rays'), `a Baseplate's SunRays (Intensity 0.01) adds the sun-rays pass${phone ? ' (off on phones)' : ''}: "${await passes()}"`);
  await run(`game.Lighting.SunRays.Enabled = false`);
  check(await passes() === '' && await t.eval(() => !window.studio.lighting.post.depthRenderer), 'with no effects there are no passes and no depth pass');

  // ColorCorrection on the back wall's face (226,220,205 plastic, in the open).
  const P = [[-2, 6, -7.99]];
  const base = (await read(P)).pts[0];
  await run(`local c = Instance.new("ColorCorrectionEffect") c.Name = "CC" c.Brightness = 0.1 c.Parent = game.Lighting`);
  const bright = (await read(P)).pts[0];
  check(bright.every((v, k) => Math.abs(v - base[k] - 25.5) <= 3), `Brightness 0.1 adds 0.1 (${base.map(v => v.toFixed(0))} -> ${bright.map(v => v.toFixed(0))})`);
  await run(`local c = Instance.new("ColorCorrectionEffect") c.Name = "CC2" c.Brightness = 0.1 c.Parent = game.Lighting`);
  const twice = (await read(P)).pts[0];
  check(twice.every((v, k) => Math.abs(v - base[k] - 51) <= 4), `two ColorCorrections compose (Brightness 0.1 twice adds 0.2: ${twice.map(v => v.toFixed(0))})`);
  await run(`game.Lighting.CC2.Enabled = false game.Lighting.CC.Brightness = 0 game.Lighting.CC.TintColor = Color3.new(1, 0, 0)`);
  const red = (await read(P)).pts[0];
  check(Math.abs(red[0] - base[0]) <= 2 && red[1] <= 2 && red[2] <= 2, `TintColor red keeps red and zeroes green and blue (${red.map(v => v.toFixed(0))})`);
  await run(`game.Lighting.CC.TintColor = Color3.new(1, 1, 1) game.Lighting.CC.Saturation = -1`);
  const grey = (await read([[-12.5, 1.5, -4.99]])).pts[0]; // the red block's front
  check(Math.max(...grey) - Math.min(...grey) <= 3, `Saturation -1 is grey (${grey.map(v => v.toFixed(0))})`);
  await run(`game.Lighting.CC.Enabled = false`);
  const off = (await read(P)).pts[0];
  check(off.every((v, k) => v === base[k]) && await passes() === '', `a disabled ColorCorrection does nothing (${off.map(v => v.toFixed(0))})`);
  await run(`game.Lighting.CC:Destroy() game.Lighting.CC2:Destroy()`);

  // Blur and depth of field are measured on still things: the character (idling) is hidden meanwhile.
  await t.eval(() => window.studio.player.holder.getChildMeshes().forEach(m => m.isVisible = false));
  // Blur: the largest Size wins; it softens the picture.
  const R = [0.05, 0.25, 0.4, 0.75]; // the walls and blocks, left of the character
  const sharp = (await read([], R)).contrast;
  await run(`local b = Instance.new("BlurEffect") b.Name = "B1" b.Size = 8 b.Parent = game.Lighting`);
  const blur8 = await read(P, R);
  await run(`local b = Instance.new("BlurEffect") b.Name = "B2" b.Size = 2 b.Parent = game.Lighting`);
  const both = await read(P, R);
  check(blur8.contrast < sharp * 0.5 && both.contrast === blur8.contrast, `BlurEffect softens (sharpness ${sharp.toFixed(2)} -> ${blur8.contrast.toFixed(2)}); with Sizes 8 and 2 the largest wins (${both.contrast.toFixed(2)})`);
  await run(`game.Lighting.B1:Destroy() game.Lighting.B2:Destroy()`);
  check(await passes() === '', `destroying the effects removes their passes ("${await passes()}")`);

  // Depth of field: focused at the spawn slab under the camera's subject (about 12 studs
  // away), the sky and horizon blur, the slab doesn't. Regions from the slab's and the horizon's screen boxes.
  const box = await t.eval(() => { const S = window.studio, c = document.getElementById('c'), V = S.cam.position.constructor, W = c.width, H = c.height;
    const pr = p => { const q = V.Project(new V(...p), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), S.cam.viewport.toGlobal(W, H)); return [q.x / W, q.y / H]; };
    const a = pr([-2.5, 1, 7.5]), b = pr([2.5, 1, 12.5]); /* the slab's top face, inset */ return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; });
  // Far: the blue block and the ball against the light wall (about 30 studs away).
  const far = await t.eval(() => { const S = window.studio, c = document.getElementById('c'), V = S.cam.position.constructor, W = c.width, H = c.height;
    const pr = p => { const q = V.Project(new V(...p), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), S.cam.viewport.toGlobal(W, H)); return [q.x / W, q.y / H]; };
    const a = pr([-10.5, 5.5, -6]), b = pr([-3, 0, -6]); return [Math.max(0, Math.min(a[0], b[0])), Math.max(0, Math.min(a[1], b[1])), Math.min(1, Math.max(a[0], b[0])), Math.min(1, Math.max(a[1], b[1]))]; });
  const near = box;
  const n0 = (await read([], near)).raw, f0 = (await read([], far)).contrast;
  await run(`local d = game.Lighting.DepthOfField d.Enabled = true d.FocusDistance = 12 d.InFocusRadius = 5 d.FarIntensity = 1 d.NearIntensity = 1`);
  const n1 = (await read([], near)).raw, f1 = (await read([], far)).contrast;
  let dn = 0; for (let i = 0; i < n0.length; i++) if (i % 4 !== 3) dn += Math.abs(n0[i] - n1[i]); dn /= n0.length * 0.75;
  check(f1 < f0 * 0.5 && dn < 2, `DepthOfField blurs the far field (sharpness ${f0.toFixed(2)} -> ${f1.toFixed(2)}) and leaves the focus as it was (mean change ${dn.toFixed(2)}/255)`);
  // No halo: just above the in-focus character's head, the blurred background
  // doesn't take the character's colours (a plain blur smears them in).
  await t.eval(() => window.studio.player.holder.getChildMeshes().forEach(m => m.isVisible = true));
  const above = await t.eval(() => { const S = window.studio, f = S.player.footPosition; return [f.x, f.y + 5.2, f.z]; });
  const withChar = (await read([above])).pts[0];
  await t.eval(() => window.studio.player.holder.getChildMeshes().forEach(m => m.isVisible = false));
  const withoutChar = (await read([above])).pts[0];
  const halo = withChar.reduce((a, v, k) => a + Math.abs(v - withoutChar[k]), 0);
  check(halo < 12, `no halo: the background just above the in-focus character barely changes with the character there (${halo.toFixed(1)})`);
  // Our passes stay last when the pipeline rebuilds.
  await run(`game.Lighting.Bloom.Enabled = false`); await run(`game.Lighting.Bloom.Enabled = true`);
  check(await t.eval(() => { const L = window.studio.lighting.post, list = window.studio.cam._postProcesses.filter(Boolean); return L.order.every((pp, i) => list[list.length - L.order.length + i] === pp); }), 'after bloom is toggled (the pipeline rebuilds), our passes are still last');
  await t.eval(() => window.studio.player.holder.getChildMeshes().forEach(m => m.isVisible = true));
  await t.frames(3); await t.shot('post-dof'); await t.golden('post-dof');
  await run(`game.Lighting.DepthOfField.Enabled = false`);

  // Colour correction look, for the golden.
  await run(`local c = Instance.new("ColorCorrectionEffect") c.Name = "Warm" c.TintColor = Color3.fromRGB(255, 220, 190) c.Contrast = 0.15 c.Saturation = 0.2 c.Parent = game.Lighting`);
  await t.frames(3); await t.shot('post-cc'); await t.golden('post-cc');
  await run(`game.Lighting.Warm:Destroy()`);

  // ColorGradingEffect (Roblox docs): Default is the post-2019 tone mapper; Retro the pre-2019
  // look, "less saturated, less contrast". Only under Lighting; the most recently parented wins.
  const look = async () => {
    const raw = (await read([], [0, 0, 1, 1])).raw, L = [];
    let sat = 0, n = 0;
    for (let i = 0; i < raw.length; i += 16) { // every 4th pixel
      const r = raw[i], g = raw[i + 1], b = raw[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      L.push(0.2126 * r + 0.7152 * g + 0.0722 * b); if (mx > 20) { sat += (mx - mn) / mx; n++; }
    }
    const m = L.reduce((a, b) => a + b, 0) / L.length, sd = Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length);
    return { sd, sat: sat / n, tm: await t.eval(() => window.studio.lighting.tonemapper) };
  };
  await run(`print("grade", Instance.new("ColorGradingEffect").TonemapperPreset.Name, Enum.TonemapperPreset.Retro.Value)`);
  check(t.logs.some(l => l.endsWith('grade Default 1')), 'ColorGradingEffect: TonemapperPreset defaults to Default; Retro is 1');
  const g0 = await look();
  await run(`local g = Instance.new("ColorGradingEffect") g.Name = "Grade" g.TonemapperPreset = Enum.TonemapperPreset.Retro g.Parent = game.Lighting`);
  const g1 = await look();
  check(g0.tm === 'Default' && g1.tm === 'Retro' && g1.sd < g0.sd * 0.97 && g1.sat < g0.sat * 0.97, `Retro: less contrast (luminance spread ${g0.sd.toFixed(1)} -> ${g1.sd.toFixed(1)}) and less saturated (${g0.sat.toFixed(3)} -> ${g1.sat.toFixed(3)})`);
  await t.frames(3); await t.shot('post-retro'); await t.golden('post-retro');
  await run(`game.Lighting.Grade.Enabled = false`);
  const g2 = await look();
  check(g2.tm === 'Default' && Math.abs(g2.sd - g0.sd) < 0.5, `a disabled ColorGradingEffect does nothing (${g2.tm}, ${g2.sd.toFixed(1)})`);
  await run(`game.Lighting.Grade.Enabled = true local d = Instance.new("ColorGradingEffect") d.Name = "Grade2" d.Parent = game.Lighting`);
  const g3 = (await look()).tm;
  await run(`local g = game.Lighting.Grade g.Parent = nil g.Parent = game.Lighting`);
  const g4 = (await look()).tm;
  check(g3 === 'Default' && g4 === 'Retro', `the most recently parented one wins (a Default added after: ${g3}; the Retro one parented again: ${g4})`);
  await run(`for _, c in ipairs(game.Lighting:GetChildren()) do if c:IsA("ColorGradingEffect") then c:Destroy() end end
    local g = Instance.new("ColorGradingEffect") g.TonemapperPreset = "Retro" g.Parent = workspace.CurrentCamera`);
  check((await look()).tm === 'Default', 'under the Camera it is ignored (it counts only under Lighting)');
  await run(`workspace.CurrentCamera:FindFirstChildOfClass("ColorGradingEffect"):Destroy()`);

  // Sun rays: aim at the sun.
  if (!phone) {
    await t.eval(() => { const S = window.studio, sun = S.R.sun.direction.scale(-1); S.camera.saved = [S.camera.yaw, S.camera.pitch]; S.camera.yaw = Math.atan2(-sun.x, -sun.z); S.camera.pitch = -0.35; S.camera.update(0); });
    await t.frames(1); // the camera's matrices update when it renders
    const sunPt = await t.eval(() => { const S = window.studio, c = document.getElementById('c'), cam = S.cam, V = cam.position.constructor; const p = V.Project(cam.globalPosition.add(S.R.sun.direction.scale(-500)), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [p.x / c.width, p.y / c.height]; });
    const probe = [[sunPt[0] + 0.12, sunPt[1] + 0.05], [0.02, 0.95]];
    await run(`game.Lighting.SunRays.Enabled = true game.Lighting.SunRays.Intensity = 0`);
    const r0 = (await read(probe)).pts;
    await run(`game.Lighting.SunRays.Intensity = 0.25 game.Lighting.SunRays.Spread = 0.5`);
    const r1 = (await read(probe)).pts;
    const sum = v => v[0] + v[1] + v[2];
    check(sum(r1[0]) - sum(r0[0]) > 20 && Math.abs(sum(r1[1]) - sum(r0[1])) < sum(r1[0]) - sum(r0[0]), `SunRays brighten toward the sun (+${(sum(r1[0]) - sum(r0[0])).toFixed(0)}) far more than away from it (+${(sum(r1[1]) - sum(r0[1])).toFixed(0)})`);
    await t.frames(3); await t.shot('post-rays'); await t.golden('post-rays');
    // The sun behind the camera: no rays.
    await t.eval(() => { const S = window.studio; S.camera.yaw += Math.PI; S.camera.pitch = 0.2; S.camera.update(0); });
    await run(`game.Lighting.SunRays.Intensity = 0`); const b0 = (await read([[0.5, 0.3]])).pts[0];
    await run(`game.Lighting.SunRays.Intensity = 0.25`); const b1 = (await read([[0.5, 0.3]])).pts[0];
    check(b0.every((v, k) => v === b1[k]), `with the sun behind the camera, sun rays add nothing (${b0.map(v => v.toFixed(0))} vs ${b1.map(v => v.toFixed(0))})`);
  } else {
    await run(`game.Lighting.SunRays.Enabled = true game.Lighting.SunRays.Intensity = 0.25`);
    check(await passes() === '', 'phones skip sun rays');
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
