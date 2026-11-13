// ParticleEmitter (places/particles-lab.luau), against
// mashup-research/ROBLOX_PARTICLES_2026-11-13.md:
// - emission: Rate per second, Enabled, Emit(n), Clear(), FastForward(n),
//   Lifetime (0 emits nothing), TimeScale 0 freezes;
// - motion: Speed along EmissionDirection in the part's own axes, Acceleration,
//   Drag (half the speed every Drag seconds), SpreadAngle 0 exact;
// - shapes: Box volume inside the part, Sphere surface on it, Disc across the
//   emission direction, a Cylinder with ShapePartial 0 narrowing to a cone;
// - LockedToPart carries live particles with the part; an emitter not under a
//   part draws nothing;
// - drawing: VelocityParallel quads lie along the velocity, ZOffset keeps the
//   screen size, a OneShot flipbook walks its frames over the life;
//   LightEmission 1 adds light, Transparency 1 draws nothing, Color tints,
//   Brightness brightens, LightInfluence 1 darkens at night.
// Goldens: the lab, desktop and phone.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('particles ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); }
  await t.sim(5); await t.eval(() => window.studio.lighting.settled());
  const run = async src => { await t.eval(s => window.studio.vm.run('lab', s), src); await t.sim(1); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  // Live particles of an emitter (found by name), in world space.
  const ps = name => t.eval(n => {
    const S = window.studio, P = S.particles;
    for (const [inst, e] of P.emitters) if (inst.Name === n) {
      const F = P.frame(inst.parent);
      return e.ps.map(p => {
        if (!p.local) return { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, age: p.age, life: p.life };
        const a = F.ax, w = k => F.o[k] + a[0][k] * p.x + a[1][k] * p.y + a[2][k] * p.z;
        return { x: w(0), y: w(1), z: w(2), age: p.age, life: p.life };
      });
    }
    return null;
  }, name);

  // A probe part high above the lab, out of the way: one emitter at a time.
  await run(`local p = Instance.new("Part") p.Name = "Probe" p.Anchored = true p.Size = Vector3.new(2, 2, 2) p.Position = Vector3.new(0, 60, 30) p.Transparency = 1 p.Parent = workspace
    local e = Instance.new("ParticleEmitter") e.Name = "P" e.Enabled = false e.Lifetime = NumberRange.new(100) e.Parent = p
    _G.probe = function(props) e:Clear() e.Enabled = false for k, v in pairs(props) do e[k] = v end end
    print("probe ready")`);
  const probe = props => run(`_G.probe({ ${props} })`);
  const reset = 'Rate = 20, Speed = NumberRange.new(5), SpreadAngle = Vector2.new(0, 0), Acceleration = Vector3.new(0, 0, 0), Drag = 0, Lifetime = NumberRange.new(100), TimeScale = 1, Shape = Enum.ParticleEmitterShape.Box, ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume, ShapePartial = 1, EmissionDirection = Enum.NormalId.Top, LockedToPart = false';
  const setProbe = src => run(`local p = workspace.Probe ${src}`);

  // Emission.
  await probe(reset + ', Enabled = true');
  await t.sim(60);
  let n = (await ps('P')).length;
  check(n >= 19 && n <= 21, `Rate 20 for one second: ${n} particles`);
  await probe(reset); await t.sim(60);
  check((await ps('P')).length === 0, 'Enabled false emits nothing');
  await run('workspace.Probe.P:Emit(40)');
  check((await ps('P')).length === 40, 'Emit(40) adds 40 at once, even disabled');
  await run('workspace.Probe.P:Emit()');
  check((await ps('P')).length === 56, 'Emit() adds 16 (its default)');
  await run('workspace.Probe.P:Clear()');
  check((await ps('P')).length === 0, 'Clear() removes them all');
  await probe(reset + ', Lifetime = NumberRange.new(0.5)'); await run('workspace.Probe.P:Emit(10)'); await t.sim(40);
  check((await ps('P')).length === 0, 'particles die after their Lifetime');
  await probe(reset + ', Lifetime = NumberRange.new(0)'); await run('workspace.Probe.P:Emit(10)');
  check((await ps('P')).length === 0, 'Lifetime 0 emits nothing');
  await probe(reset + ', Rate = 10'); await run('local e = workspace.Probe.P e.Enabled = true e:FastForward(120)');
  n = (await ps('P')).length;
  check(n >= 20 && n <= 22, `FastForward(120) runs two seconds at Rate 10: ${n}`);
  await probe(reset + ', TimeScale = 0'); await run('workspace.Probe.P:Emit(5) workspace.Probe.P.Enabled = true');
  const f0 = await ps('P'); await t.sim(30); const f1 = await ps('P');
  check(f1.length === 5 && f1.every((p, i) => p.y === f0[i].y && p.age === f0[i].age), 'TimeScale 0 freezes the effect: no new particles, none move');

  // Motion: one particle from the centre of a tiny probe.
  await setProbe('p.Size = Vector3.new(0.01, 0.01, 0.01)');
  await probe(reset + ', Speed = NumberRange.new(10), Acceleration = Vector3.new(0, -10, 0)');
  await run('workspace.Probe.P:Emit(1)');
  let a = (await ps('P'))[0];
  await t.sim(60); let b = (await ps('P'))[0];
  const dy = b.y - a.y, T = b.age - a.age, want = a.vy * T - 5 * T * T;
  check(Math.abs(dy - want) < 1e-3 && Math.abs(b.vy - a.vy + 10 * T) < 1e-6, `Speed 10 up, Acceleration -10: rose ${dy.toFixed(3)} in ${T.toFixed(3)} s (exact ${want.toFixed(3)}), vy ${b.vy.toFixed(3)}`);
  await probe(reset + ', Speed = NumberRange.new(8), Drag = 1'); await run('workspace.Probe.P:Emit(1)');
  a = (await ps('P'))[0]; await t.sim(60); b = (await ps('P'))[0];
  check(Math.abs(Math.hypot(b.vx, b.vy, b.vz) / Math.hypot(a.vx, a.vy, a.vz) - 0.5) < 0.01, `Drag 1: half the speed after a second (${(Math.hypot(b.vx, b.vy, b.vz)).toFixed(3)} of ${Math.hypot(a.vx, a.vy, a.vz).toFixed(3)})`);
  // EmissionDirection is in the part's axes: Top of a part turned 90 degrees about Z points along -X.
  await setProbe('p.CFrame = CFrame.new(p.Position) * CFrame.Angles(0, 0, math.pi / 2)');
  await probe(reset); await run('workspace.Probe.P:Emit(20)');
  let all = await ps('P');
  check(all.every(p => Math.abs(p.vx + 5) < 1e-4 && Math.abs(p.vy) < 1e-4 && Math.abs(p.vz) < 1e-4), 'Top of a part rolled 90 degrees emits along -X at Speed 5, SpreadAngle 0 exact');
  await probe(reset + ', EmissionDirection = Enum.NormalId.Front'); await setProbe('p.CFrame = CFrame.new(p.Position)'); await run('workspace.Probe.P:Emit(20)');
  all = await ps('P');
  check(all.every(p => Math.abs(p.vz + 5) < 1e-4), 'Front emits along -Z');
  await probe(reset + ', SpreadAngle = Vector2.new(30, 0)'); await run('workspace.Probe.P:Emit(200)');
  all = await ps('P');
  const tilt = all.map(p => Math.atan2(p.vx, p.vy) * 180 / Math.PI);
  check(Math.max(...tilt) > 25 && Math.min(...tilt) < -25 && tilt.every(x => Math.abs(x) <= 30.001) && all.every(p => Math.abs(p.vz) < 1e-4), `SpreadAngle (30, 0) spreads ±30 degrees across X only (${Math.min(...tilt).toFixed(1)}..${Math.max(...tilt).toFixed(1)})`);

  // Shapes, on a 4 x 2 x 6 probe at (0, 60, 30).
  await setProbe('p.Size = Vector3.new(4, 2, 6)');
  const rel = p => [p.x, p.y - 60, p.z - 30];
  const still = ', Speed = NumberRange.new(0)'; // they stay where they spawned
  await probe(reset + still); await run('workspace.Probe.P:Emit(300)');
  all = (await ps('P')).map(rel);
  check(all.every(([x, y, z]) => Math.abs(x) <= 2 + 1e-4 && Math.abs(y) <= 1 + 1e-4 && Math.abs(z) <= 3 + 1e-4) && Math.max(...all.map(p => Math.abs(p[2]))) > 2.5, 'Box volume: inside the part, filling it');
  await probe(reset + still + ', Shape = Enum.ParticleEmitterShape.Sphere, ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface'); await run('workspace.Probe.P:Emit(300)');
  all = (await ps('P')).map(rel);
  check(all.every(([x, y, z]) => Math.abs((x / 2) ** 2 + (y / 1) ** 2 + (z / 3) ** 2 - 1) < 1e-3), 'Sphere surface: on the part\'s ellipsoid');
  await probe(reset + still + ', Shape = Enum.ParticleEmitterShape.Sphere, ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface, ShapePartial = 0.5'); await run('workspace.Probe.P:Emit(300)');
  all = (await ps('P')).map(rel);
  check(all.every(([, y]) => y >= -1e-4), 'Sphere ShapePartial 0.5: the half toward EmissionDirection only');
  await probe(reset + still + ', Shape = Enum.ParticleEmitterShape.Disc'); await run('workspace.Probe.P:Emit(300)');
  all = (await ps('P')).map(rel);
  check(all.every(([x, y, z]) => Math.abs(y) < 1e-4 && (x / 2) ** 2 + (z / 3) ** 2 <= 1 + 1e-3), 'Disc: across EmissionDirection, inside the ellipse');
  await probe(reset + still + ', Shape = Enum.ParticleEmitterShape.Disc, ShapePartial = 0.8'); await run('workspace.Probe.P:Emit(300)');
  all = (await ps('P')).map(rel);
  check(all.every(([x, , z]) => (x / 2) ** 2 + (z / 3) ** 2 >= 0.64 - 1e-3), 'Disc ShapePartial 0.8: an annulus from 0.8 of the radius out');
  await probe(reset + still + ', Shape = Enum.ParticleEmitterShape.Cylinder, ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface, ShapePartial = 0'); await run('workspace.Probe.P:Emit(400)');
  all = (await ps('P')).map(rel);
  const radial = ([x, , z]) => Math.sqrt((x / 2) ** 2 + (z / 3) ** 2);
  check(all.every(p => Math.abs(radial(p) - (1 - (p[1] + 1) / 2)) < 1e-3), 'Cylinder ShapePartial 0: a cone, full at the bottom, a point at the EmissionDirection end');

  // LockedToPart: the part moves, its live particles move with it.
  await setProbe('p.Size = Vector3.new(2, 2, 2)');
  await probe(reset + ', LockedToPart = true, Speed = NumberRange.new(0)'); await run('workspace.Probe.P:Emit(10)');
  a = await ps('P'); await setProbe('p.Position = p.Position + Vector3.new(5, 0, 0)'); b = await ps('P');
  check(b.every((p, i) => Math.abs(p.x - a[i].x - 5) < 1e-4 && Math.abs(p.y - a[i].y) < 1e-4), 'LockedToPart: particles move with the part');
  await probe(reset + ', Speed = NumberRange.new(0)'); await run('workspace.Probe.P:Emit(10)');
  a = await ps('P'); await setProbe('p.Position = p.Position - Vector3.new(5, 0, 0)'); b = await ps('P');
  check(b.every((p, i) => Math.abs(p.x - a[i].x) < 1e-4), 'not locked: they stay where they were');
  await run('local m = Instance.new("Model") m.Parent = workspace local e = Instance.new("ParticleEmitter") e.Name = "Loose" e.Parent = m e:Emit(5)');
  check((await ps('Loose')) === null, 'an emitter not under a part draws nothing');
  await probe(reset);

  // Drawing: quads read back from the mesh.
  const quads = name => t.eval(n => {
    const S = window.studio, P = S.particles;
    for (const [inst, e] of P.emitters) if (inst.Name === n) {
      const out = [];
      for (let q = 0; q < e.ps.length; q++) {
        const v = k => [e.pos[(q * 4 + k) * 3], e.pos[(q * 4 + k) * 3 + 1], e.pos[(q * 4 + k) * 3 + 2]];
        out.push({ v: [0, 1, 2, 3].map(v), uv: [e.uv[q * 8], e.uv[q * 8 + 1]] });
      }
      return out;
    }
    return null;
  }, name);
  // (LightEmission 1: additive needs no back-to-front sort, so quads keep the particles' order.)
  const sub = (a, b) => a.map((x, i) => x - b[i]), len = a => Math.hypot(...a);
  await probe(reset + ', Orientation = Enum.ParticleOrientation.VelocityParallel, Speed = NumberRange.new(5), SpreadAngle = Vector2.new(40, 40), Squash = NumberSequence.new(2), LightEmission = 1'); await run('workspace.Probe.P:Emit(20)');
  await t.frames(1);
  let q = await quads('P'); all = await ps('P');
  const along = q.map((qq, i) => { const up = sub(qq.v[3], qq.v[0]), vel = [all[i].vx, all[i].vy, all[i].vz]; return Math.abs(up.reduce((s, x, k) => s + x * vel[k], 0)) / len(up) / len(vel); });
  check(along.every(c => c > 0.9999), 'VelocityParallel: each quad\'s long side lies along its velocity');
  check(q.every(qq => Math.abs(len(sub(qq.v[3], qq.v[0])) / len(sub(qq.v[1], qq.v[0])) - 9) < 1e-3), 'Squash 2: three times taller, a third as wide');
  await probe(reset + ', Speed = NumberRange.new(0), ZOffset = 0, LightEmission = 0'); await run('workspace.Probe.P:Emit(1)'); await t.frames(1);
  const proj = qq => t.eval(vs => { const S = window.studio, c = document.getElementById('c'), cam = S.cam, V = cam.position.constructor; return vs.map(v => { const p = V.Project(new V(...v), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [p.x, p.y]; }); }, qq.v);
  const s0 = await proj((await quads('P'))[0]);
  await run('workspace.Probe.P.ZOffset = 3'); await t.frames(1);
  const q3 = (await quads('P'))[0], s3 = await proj(q3);
  const w0 = len(sub(s0[1], s0[0])), w3 = len(sub(s3[1], s3[0]));
  check(Math.abs(w3 / w0 - 1) < 0.01, `ZOffset 3: same size on screen (${w0.toFixed(1)} px, ${w3.toFixed(1)} px)`);
  await probe(reset + ', ZOffset = 0, Speed = NumberRange.new(0), Lifetime = NumberRange.new(1), FlipbookLayout = Enum.ParticleFlipbookLayout.Grid2x2, FlipbookMode = Enum.ParticleFlipbookMode.OneShot');
  await run('workspace.Probe.P:Emit(1)'); await t.frames(1);
  const fr = async () => { const u = (await quads('P'))[0].uv; return Math.round(u[0] * 2) + 2 * (1 - Math.round(u[1] * 2)); };
  const frames = [await fr()]; for (let k = 0; k < 3; k++) { await t.sim(15); await t.frames(1); frames.push(await fr()); }
  check(frames.join() === '0,1,2,3', `a OneShot 2x2 flipbook walks its frames over the life (${frames.join()})`);
  await probe(reset + ', FlipbookLayout = Enum.ParticleFlipbookLayout.None, FlipbookMode = Enum.ParticleFlipbookMode.Loop');

  // Pixels: one big particle in front of the camera, the lab's own effects off.
  await run('for _, d in ipairs(workspace:GetDescendants()) do if d:IsA("ParticleEmitter") then d.Enabled = false d:Clear() end end');
  await t.eval(() => { const c = window.studio.camera; c.yaw = 0; c.pitch = 0.05; c.zoom = c.z = c.dist = 20; c.update(0); });
  const centre = () => t.eval(async () => {
    const S = window.studio; S.frames(1); await S.scene.whenReadyAsync(); S.frames(1);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, P = S.particles;
    let e = null; for (const [inst, x] of P.emitters) if (inst.Name === 'Screen') e = x;
    const ctr = e.ps.length ? e.mesh.getBoundingInfo().boundingBox.centerWorld : null, cam = S.cam, V = cam.position.constructor;
    const p = ctr ? V.Project(ctr, S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)) : { x: c.width / 2, y: c.height / 2 };
    const px = new Uint8Array(4 * 25); g.readPixels(Math.round(p.x) - 2, Math.round(c.height - 1 - p.y) - 2, 5, 5, g.RGBA, g.UNSIGNED_BYTE, px);
    const m = [0, 1, 2].map(k => { let s = 0; for (let i = 0; i < 25; i++) s += px[i * 4 + k]; return s / 25; });
    return { rgb: m, l: 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] };
  });
  // A 4-stud square of solid colour: one big particle on a white texture.
  const wallAt = 'local cam = workspace.CurrentCamera local f = cam.CFrame local pos = f.Position + f.LookVector * 12 - f.RightVector * 6'; // beside the character, not behind it
  await run(`${wallAt}
    local s = Instance.new("Part") s.Name = "ScreenPart" s.Anchored = true s.Size = Vector3.new(0.01, 0.01, 0.01) s.Transparency = 1 s.CanCollide = false s.Position = pos s.Parent = workspace
    local e = Instance.new("ParticleEmitter") e.Name = "Screen" e.Enabled = false e.Speed = NumberRange.new(0) e.Lifetime = NumberRange.new(1000) e.Size = NumberSequence.new(4) e.Texture = "studio://white" e.Parent = s`);
  const screen = async props => { await run(`local e = workspace.ScreenPart.Screen e:Clear() ${props} e:Emit(1)`); return centre(); };
  const bg = await screen('e.Size = NumberSequence.new(0)'); // the wall there: a particle too small to draw
  const grey = await screen('e.Size = NumberSequence.new(4) e.Color = ColorSequence.new(Color3.new(0.5, 0.5, 0.5)) e.LightEmission = 0 e.Transparency = NumberSequence.new(0) e.Brightness = 1 e.LightInfluence = 0');
  check(Math.abs(grey.l - bg.l) > 10, `a grey particle covers the wall (${bg.l.toFixed(0)} -> ${grey.l.toFixed(0)})`);
  const add = await screen('e.LightEmission = 1');
  check(add.l > grey.l + 5 && add.l > bg.l + 5, `LightEmission 1 adds to what's behind (${add.l.toFixed(0)} vs normal ${grey.l.toFixed(0)}, wall ${bg.l.toFixed(0)})`);
  const clear = await screen('e.LightEmission = 0 e.Transparency = NumberSequence.new(1)');
  check(Math.abs(clear.l - bg.l) < 1.5, `Transparency 1 draws nothing (${clear.l.toFixed(1)} vs ${bg.l.toFixed(1)})`);
  const red = await screen('e.Transparency = NumberSequence.new(0) e.Color = ColorSequence.new(Color3.new(1, 0, 0))');
  check(red.rgb[0] > 3 * Math.max(red.rgb[1], red.rgb[2], 1), `Color tints (${red.rgb.map(v => v.toFixed(0))})`);
  const dim = await screen('e.Color = ColorSequence.new(Color3.new(0.3, 0.3, 0.3)) e.Brightness = 1');
  const lit = await screen('e.Brightness = 3');
  check(lit.l > dim.l + 15, `Brightness 3 brightens (${dim.l.toFixed(0)} -> ${lit.l.toFixed(0)})`);
  await run('game:GetService("Lighting").ClockTime = 0'); await t.sim(2); await t.eval(() => window.studio.lighting.settled());
  const night0 = await screen('e.Brightness = 1 e.Color = ColorSequence.new(Color3.new(1, 1, 1)) e.LightInfluence = 0');
  const night1 = await screen('e.LightInfluence = 1');
  check(night1.l < night0.l - 30, `at night LightInfluence 1 darkens a white particle (${night0.l.toFixed(0)} -> ${night1.l.toFixed(0)})`);
  await run('game:GetService("Lighting").ClockTime = 16 workspace.ScreenPart:Destroy() workspace.Probe:Destroy()'); await t.sim(2); await t.eval(() => window.studio.lighting.settled());
  check(await t.eval(() => [...window.studio.particles.emitters.keys()].every(i => i.Name !== 'Screen' && i.Name !== 'P')), 'emitters go with their part');

  // The lab, from in front, after the effects have run a while.
  await run('for _, d in ipairs(workspace:GetDescendants()) do if d:IsA("ParticleEmitter") then d.Enabled = true end end');
  await t.sim(150);
  await t.eval(() => { const c = window.studio.camera, cv = document.getElementById('c'), a = cv.width / cv.height; c.yaw = 0; c.pitch = 0.12; c.zoom = c.z = c.dist = 26 * Math.max(1, 1.3 / a); c.update(0); });
  await t.frames(2);
  await t.golden('particles');
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('particles: all checks passed');
}
