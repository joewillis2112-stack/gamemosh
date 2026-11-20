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
//   Brightness brightens, LightInfluence 1 darkens at night;
// - Claude Studio's extras, by fidelity tier (run with --quality low|ultra too):
//   soft particles fade into a surface just behind them, CastLight lights the
//   floor in the particles' colour, the light budget goes to the nearest
//   emitters while every emitter keeps its particles, Collision Bounce/Stick/Die
//   on a shelf (None falls through, as in Roblox); tiers without an extra show
//   it off, never with fewer particles.
// Goldens: the lab, desktop and phone (and per tier when --quality is given).
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

  // Beyond Roblox: the extras, budgeted by the fidelity tier, which never removes a particle.
  const Q = await t.eval(() => ({ ...window.studio.particles.Q, name: window.studio.particles.quality }));
  console.log(`tier ${Q.name}: ${Q.particleLights} cast lights, ${Q.particleCollisionRays} collision rays a frame, soft ${Q.softParticles}`);
  // Soft particles: a white particle 0.3 studs in front of a dark panel fades into it; 3 studs in front it doesn't.
  const backdrop = async gap => { await run(`local e = workspace.ScreenPart.Screen local f = workspace.CurrentCamera.CFrame local at = workspace.ScreenPart.Position + f.LookVector * ${gap}
    local b = workspace:FindFirstChild("Backdrop") or Instance.new("Part") b.Name = "Backdrop" b.Anchored = true b.Size = Vector3.new(12, 12, 0.2) b.Color = Color3.new(0.05, 0.05, 0.05) b.CFrame = CFrame.lookAt(at, at + f.LookVector) b.Parent = workspace`); return screen('e.LightInfluence = 0 e.Brightness = 1 e.Color = ColorSequence.new(Color3.new(1, 1, 1)) e.Transparency = NumberSequence.new(0) e.LightEmission = 0'); };
  const far = await backdrop(3), near = await backdrop(0.3);
  if (Q.softParticles) check(near.l < far.l - 20, `soft particles: 0.3 studs from a surface it fades (${far.l.toFixed(0)} -> ${near.l.toFixed(0)})`);
  else check(Math.abs(near.l - far.l) < 3, `no soft particles on this tier: the same 0.3 or 3 studs from a surface (${far.l.toFixed(0)}, ${near.l.toFixed(0)})`);
  await run('workspace.Backdrop:Destroy() workspace.ScreenPart.Screen:Clear()');

  // CastLight, at night: an orange glow lights the floor under it, on tiers that cast light.
  const floorLum = pt => t.eval(async pt => {
    const S = window.studio; S.frames(1); await S.scene.whenReadyAsync(); S.frames(1);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, cam = S.cam, V = cam.position.constructor;
    const p = V.Project(new V(...pt), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height));
    const px = new Uint8Array(4 * 9); g.readPixels(Math.round(p.x) - 1, Math.round(c.height - 1 - p.y) - 1, 3, 3, g.RGBA, g.UNSIGNED_BYTE, px);
    const m = [0, 1, 2].map(k => { let s = 0; for (let i = 0; i < 9; i++) s += px[i * 4 + k]; return s / 9; });
    return { rgb: m, l: 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2], on: p.x > 0 && p.y > 0 && p.x < c.width && p.y < c.height };
  }, pt);
  await run(`local p = Instance.new("Part") p.Name = "Torch" p.Anchored = true p.CanCollide = false p.Transparency = 1 p.Size = Vector3.new(1, 1, 1) p.Position = Vector3.new(-6, 1.5, 4) p.Parent = workspace
    local e = Instance.new("ParticleEmitter") e.Name = "Glow" e.Rate = 30 e.Lifetime = NumberRange.new(1) e.Speed = NumberRange.new(1) e.Size = NumberSequence.new(0.6) e.LightEmission = 1 e.Brightness = 3
    e.Color = ColorSequence.new(Color3.fromRGB(255, 150, 60)) e.LightRange = 10 e.Parent = p`);
  await t.sim(60);
  const spot = [-6, 0, 7], dark = await floorLum(spot);
  await run('workspace.Torch.Glow.CastLight = true'); await t.sim(30);
  const glow = await floorLum(spot), lights = await t.eval(() => window.studio.particles.used.lights);
  check(dark.on, 'the floor under the glow is on screen');
  if (Q.particleLights > 0) check(glow.l > dark.l + 6 && glow.rgb[0] > glow.rgb[2] && lights === 1, `CastLight lights the floor in the particles' colour (${dark.l.toFixed(0)} -> ${glow.l.toFixed(0)}, rgb ${glow.rgb.map(v => v.toFixed(0))})`);
  else check(Math.abs(glow.l - dark.l) < 1.5 && lights === 0, `no cast light on this tier: the floor stays (${dark.l.toFixed(0)} -> ${glow.l.toFixed(0)})`);
  // More emitters asking for light than the tier allows: the nearest get it, and every one keeps its particles.
  await run(`for i = 1, 9 do local p = workspace.Torch:Clone() p.Name = "Torch" .. i p.Position = Vector3.new(-30 + i * 6, 1.5, -2) p.Parent = workspace end`);
  await t.sim(30);
  const budget = await t.eval(() => { const P = window.studio.particles; return { lights: P.used.lights, counts: [...P.emitters].filter(([i]) => i.Name === 'Glow').map(([, e]) => e.ps.length) }; });
  check(budget.lights === Math.min(10, Q.particleLights) && budget.counts.length === 10 && budget.counts.every(n => n >= 14), `10 glows ask for light: ${budget.lights} get it (tier: ${Q.particleLights}), all 10 keep their particles (${budget.counts.join(',')})`);
  await run('for i = 1, 9 do workspace["Torch" .. i]:Destroy() end workspace.Torch:Destroy()');

  // Collisions: particles dropped onto a shelf.
  await run(`local s = Instance.new("Part") s.Name = "Shelf" s.Anchored = true s.Size = Vector3.new(12, 1, 12) s.Position = Vector3.new(0, 40, 30) s.Parent = workspace
    local p = Instance.new("Part") p.Name = "Dropper" p.Anchored = true p.CanCollide = false p.Transparency = 1 p.Size = Vector3.new(6, 0.2, 6) p.Position = Vector3.new(0, 44, 30) p.Parent = workspace
    local e = Instance.new("ParticleEmitter") e.Name = "Drops" e.Enabled = false e.Speed = NumberRange.new(0) e.Acceleration = Vector3.new(0, -60, 0) e.Lifetime = NumberRange.new(10) e.Parent = p`);
  const drop = async mode => { await run(`local e = workspace.Dropper.Drops e:Clear() e.Collision = Enum.ParticleCollision.${mode} e:Emit(30)`); await t.sim(70); return ps('Drops'); };
  const none = await drop('None');
  check(none.length === 30 && none.every(p => p.y < 39), 'Collision None: they fall through the shelf, as in Roblox');
  const bounce = await drop('Bounce');
  if (Q.particleCollisionRays > 0) {
    check(bounce.length === 30 && bounce.every(p => p.y > 40.45), `Collision Bounce: all 30 stay on the shelf (lowest ${Math.min(...bounce.map(p => p.y)).toFixed(2)})`);
    await run('local e = workspace.Dropper.Drops e:Clear() e:Emit(30)'); await t.sim(23); // just after they hit
    const up = await ps('Drops');
    check(up.some(p => p.vy > 5), `and bounce back up (fastest up ${Math.max(...up.map(p => p.vy)).toFixed(1)} studs/s)`);
    const stick = await drop('Stick');
    check(stick.length === 30 && stick.every(p => Math.abs(p.y - 40.5) < 0.01 && p.vy === 0), 'Collision Stick: they stop on the surface');
    const die = await drop('Die');
    check(die.length === 0, 'Collision Die: they end where they hit');
  } else check(bounce.length === 30 && bounce.every(p => p.y < 39), 'no collision rays on this tier: they fall through, all 30 kept');
  await run('workspace.Shelf:Destroy() workspace.Dropper:Destroy()');
  await run('game:GetService("Lighting").ClockTime = 16 workspace.ScreenPart:Destroy() workspace.Probe:Destroy()'); await t.sim(2); await t.eval(() => window.studio.lighting.settled());
  check(await t.eval(() => [...window.studio.particles.emitters.keys()].every(i => i.Name !== 'Screen' && i.Name !== 'P')), 'emitters go with their part');

  // Attachments: an emitter in one emits from its world point, along its own axes; a light in one shines
  // from there; its World* values follow the part, and setting WorldPosition sets the local Position.
  await run(`local p = Instance.new("Part") p.Name = "Holder" p.Anchored = true p.Size = Vector3.new(4, 4, 4) p.CFrame = CFrame.new(10, 70, 30) * CFrame.Angles(0, 0, math.pi / 2) p.Parent = workspace
    local a = Instance.new("Attachment") a.Name = "Tip" a.Position = Vector3.new(0, 2, 0) a.Orientation = Vector3.new(0, 0, 90) a.Parent = p
    local e = Instance.new("ParticleEmitter") e.Name = "AttE" e.Enabled = false e.Speed = NumberRange.new(5) e.Lifetime = NumberRange.new(100) e.Parent = a
    local l = Instance.new("PointLight") l.Name = "AttL" l.Range = 6 l.Parent = a
    print("tip", a.WorldPosition.X, a.WorldPosition.Y, a.WorldPosition.Z)
    p.Position = p.Position + Vector3.new(0, 0, 2) print("tip moved", a.WorldPosition.Z)
    a.WorldPosition = Vector3.new(8, 70, 32) print("tip local", a.Position.X, a.Position.Y, a.Position.Z)
    a.WorldPosition = Vector3.new(8, 70, 32) a.Position = Vector3.new(0, 2, 0)
    e:Emit(10)`);
  const tipLog = logs().filter(l => l.startsWith('tip'));
  const nums = l => l.split(' ').slice(l.startsWith('tip moved') ? 2 : l.startsWith('tip local') ? 2 : 1).map(Number);
  const tip = nums(tipLog.find(l => l.startsWith('tip ') && !l.startsWith('tip moved') && !l.startsWith('tip local')) || 'tip NaN'), tipMoved = nums(tipLog.find(l => l.startsWith('tip moved')) || 'tip moved NaN'), tipLocal = nums(tipLog.find(l => l.startsWith('tip local')) || 'tip local NaN');
  // The part is rolled 90 degrees about Z, so its +Y points along world -X: the tip is 2 studs toward -X.
  check(Math.abs(tip[0] - 8) < 1e-4 && Math.abs(tip[1] - 70) < 1e-4 && Math.abs(tip[2] - 30) < 1e-4 && Math.abs(tipMoved[0] - 32) < 1e-4, `Attachment.WorldPosition is the part's CFrame times its own (${tip.map(v => v.toFixed(2))}), and follows the part (z ${tipMoved[0]})`);
  check(Math.abs(tipLocal[0]) < 1e-4 && Math.abs(tipLocal[1] - 2) < 1e-4 && Math.abs(tipLocal[2]) < 1e-4, `setting WorldPosition sets the local Position (${tipLocal.map(v => v.toFixed(2))})`);
  const att = await ps('AttE');
  // Its axes: the part's roll (+Y -> -X) and the attachment's own roll (another 90 about Z): Top points along world -Y.
  check(att.length === 10 && att.every(p => Math.abs(p.x - 8) < 1e-4 && Math.abs(p.y - (70 - 5 * p.age)) < 1e-4 && Math.abs(p.z - 32) < 1e-4 && Math.abs(p.vy + 5) < 1e-4 && Math.abs(p.vx) < 1e-4),
    `an emitter in an attachment: every particle at its point, moving along its turned Top (${att[0] && [att[0].vx, att[0].vy, att[0].vz].map(v => v.toFixed(2))})`);
  const attLight = await t.eval(() => { const L = window.studio.localLights; L.update(); for (const [i, e] of L.lights) if (i.Name === 'AttL') return [e.light.position.x, e.light.position.y, e.light.position.z]; return null; });
  check(attLight && Math.abs(attLight[0] - 8) < 1e-3 && Math.abs(attLight[1] - 70) < 1e-3 && Math.abs(attLight[2] - 32) < 1e-3, `a PointLight in an attachment shines from its point (${attLight})`);
  await run('workspace.Holder:Destroy()');

  // Wind: with WindAffectsDrag, Drag pulls toward Workspace.GlobalWind; without it, or with Drag 0, wind does nothing.
  await run(`workspace.GlobalWind = Vector3.new(10, 0, 0)
    local p = Instance.new("Part") p.Name = "Windy" p.Anchored = true p.Transparency = 1 p.CanCollide = false p.Size = Vector3.new(0.1, 0.1, 0.1) p.Position = Vector3.new(-10, 70, 30) p.Parent = workspace
    for _, c in ipairs({ { "Blown", true, 0.5 }, { "Still", false, 0.5 }, { "NoDrag", true, 0 } }) do
      local e = Instance.new("ParticleEmitter") e.Name = c[1] e.Enabled = false e.Speed = NumberRange.new(0) e.Lifetime = NumberRange.new(100) e.WindAffectsDrag = c[2] e.Drag = c[3] e.Parent = p e:Emit(3)
    end`);
  await t.sim(120);
  const vx = async n => (await ps(n))[0].vx;
  const blown = await vx('Blown'), calm = await vx('Still'), nodrag = await vx('NoDrag');
  const wantV = 10 * (1 - Math.pow(2, -(121 / 60) / 0.5));
  check(Math.abs(blown - wantV) < 0.05 && calm === 0 && nodrag === 0, `GlobalWind 10: WindAffectsDrag with Drag 0.5 reaches ${blown.toFixed(2)} studs/s (expected ${wantV.toFixed(2)}); without it ${calm}; with Drag 0 ${nodrag}`);
  await run('workspace.Windy:Destroy() workspace.GlobalWind = Vector3.new(0, 0, 0)');

  // The tier's table is what the renderer uses.
  const applied = await t.eval(() => { const S = window.studio, R = S.R; return { size: R.shadows.getShadowMap().getSize().width, cascades: R.shadows.numCascades, msaa: R.pipeline.samples, sky: S.sky.n, maxZ: R.shadows.shadowMaxZ, bias: [R.shadows.bias, R.shadows.normalBias] }; });
  check(applied.size === Q.sunShadowSize && applied.cascades === Q.sunCascades && applied.msaa === Q.msaa && applied.sky === Q.skySize && applied.maxZ === Q.sunShadowDistance && applied.bias.join() === Q.sunShadowBias.join(), `the renderer runs the ${Q.name} tier's numbers (${JSON.stringify(applied)})`);

  // Robustness (found in review, 2026-11-15).
  await run(`local p = Instance.new("Part") p.Name = "Stress" p.Anchored = true p.Transparency = 1 p.CanCollide = false p.Position = Vector3.new(0, 80, 30) p.Parent = workspace
    local e = Instance.new("ParticleEmitter") e.Name = "S" e.Enabled = false e.Lifetime = NumberRange.new(1000) e.Parent = p`);
  const t0 = Date.now();
  await run('local e = workspace.Stress.S e.Rate = math.huge e.Enabled = true');
  await run('local e = workspace.Stress.S e.Enabled = false e:Emit(math.huge) e:FastForward(math.huge)');
  const huge = (await ps('S')).length;
  check(huge === 5000 && Date.now() - t0 < 60000, `Rate = math.huge, Emit(math.huge), FastForward(math.huge) fill the emitter to its cap (${huge}) instead of hanging (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await run('local e = workspace.Stress.S e:Clear() e.Rate = 20 e.Speed = NumberRange.new(0) e:Emit(10)');
  await run('workspace.Stress.S.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.5, 3, 1), NumberSequenceKeypoint.new(1, 1) })');
  await t.frames(1); await t.sim(1);
  const nan = await t.eval(() => { const P = window.studio.particles; for (const [i, e] of P.emitters) if (i.Name === 'S') return { bad: [...e.pos.slice(0, e.ps.length * 12)].some(v => !Number.isFinite(v)), n: e.ps[0].size.length }; });
  check(!nan.bad && nan.n === 3, 'a Size sequence with more keypoints, set while particles live: each draws values for the new keypoints, no NaN');
  // LockedToPart toggled with live particles: they stay where they are, then follow the part.
  const before = await ps('S');
  await run('workspace.Stress.S.LockedToPart = true'); const mid = await ps('S');
  await run('workspace.Stress.Position = workspace.Stress.Position + Vector3.new(0, 0, 4)'); const moved = await ps('S');
  await run('workspace.Stress.S.LockedToPart = false workspace.Stress.Position = workspace.Stress.Position - Vector3.new(0, 0, 4)'); const after = await ps('S');
  const close = (a, b, dz = 0) => a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-3 && Math.abs(p.y - b[i].y) < 1e-3 && Math.abs(p.z - b[i].z - dz) < 1e-3);
  check(close(mid, before) && close(moved, mid, 4) && close(after, moved), 'LockedToPart turned on and off with live particles: no jump, locked ones follow the part, unlocked ones stay');
  // A locked emitter moved to another part: its particles stay where they are, then ride the new part.
  await run(`local b = Instance.new("Part") b.Name = "Other" b.Anchored = true b.Transparency = 1 b.CanCollide = false b.CFrame = CFrame.new(20, 80, 30) * CFrame.Angles(0, 1, 0) b.Parent = workspace
    workspace.Stress.S.LockedToPart = true`);
  const onA = await ps('S');
  await run('workspace.Stress.S.Parent = workspace.Other'); const onB = await ps('S');
  await run('workspace.Other.Position = workspace.Other.Position + Vector3.new(0, 0, 5)'); const rodeB = await ps('S');
  check(onA.length && close(onB, onA) && close(rodeB, onB, 5), 'a locked emitter moved to another part: its particles keep their place, then follow the new part');
  await run('workspace.Other.S.LockedToPart = false workspace.Other.S.Parent = workspace.Stress workspace.Other:Destroy()');
  // Textures no emitter uses are let go.
  await run('local e = workspace.Stress.S for _, id in ipairs({ "studio://white", "rbxasset://textures/particles/smoke_main.dds", "rbxasset://textures/particles/fire_main.dds", "studio://white" }) do e.Texture = id task.wait() end');
  await t.sim(5);
  const texs = await t.eval(() => { const P = window.studio.particles, used = new Set([...P.emitters.values()].map(e => e.texFor)); return { n: P.textures.size, emitters: used.size }; });
  check(texs.n <= texs.emitters + 1, `a texture no emitter uses is freed (${texs.n} loaded for ${texs.emitters} textures in use)`);
  // Negative FlipbookFramerate: frames stay in the atlas.
  await run('local e = workspace.Stress.S e:Clear() e.Texture = "studio://white" e.FlipbookLayout = Enum.ParticleFlipbookLayout.Grid2x2 e.FlipbookFramerate = NumberRange.new(-5) e:Emit(5)');
  await t.sim(30); await t.frames(1);
  const uvs = await t.eval(() => { const P = window.studio.particles; for (const [i, e] of P.emitters) if (i.Name === 'S') return [...e.uv.slice(0, e.ps.length * 8), ...e.uv2.slice(0, e.ps.length * 8)]; });
  check(uvs.every(u => u >= 0 && u <= 1), 'a negative FlipbookFramerate keeps every frame inside the atlas');
  // Soft edges: never on emitters whose particles collide (they rest on surfaces) or lie flat.
  await run('local e = workspace.Stress.S e:Clear() e.FlipbookLayout = Enum.ParticleFlipbookLayout.None e.Size = NumberSequence.new(4) e:Emit(3)'); await t.frames(1);
  const softRange = () => t.eval(() => { const P = window.studio.particles; for (const [i, e] of P.emitters) if (i.Name === 'S') return e.bl[1]; });
  const plain = await softRange();
  await run('local e = workspace.Stress.S e.Collision = Enum.ParticleCollision.Stick'); await t.frames(1); const stuck = await softRange();
  await run('local e = workspace.Stress.S e.Collision = Enum.ParticleCollision.None e.Orientation = Enum.ParticleOrientation.VelocityPerpendicular'); await t.frames(1); const flat = await softRange();
  check((Q.softParticles ? plain === 1 : plain === 0) && stuck === 0 && flat === 0, `soft fade distance: ${plain} studs for a 4-stud particle, 0 when it collides (${stuck}) or lies flat (${flat})`);
  // The depth pass soft particles need is let go when the last emitter goes.
  await run('workspace.Stress:Destroy() _G.saved = {} for _, d in ipairs(workspace:GetDescendants()) do if d:IsA("ParticleEmitter") then table.insert(_G.saved, { d, d.Parent }) d.Parent = nil end end'); await t.frames(2);
  const held = await t.eval(() => window.studio.particles.depth !== null);
  check(!held, 'with no emitters left, particles let go of the depth pass (other users, such as sun rays, may keep it)');

  // Fog: a particle past FogEnd turns the fog colour exactly as a part does (Babylon's PBR takes the
  // scene's fog colour as sRGB); and Lighting.FogColor is that colour: a fully fogged wall matches an
  // unfogged particle of the same colour, near the camera.
  await run(`local f = workspace.CurrentCamera.CFrame
    local w = Instance.new("Part") w.Name = "FogWall" w.Anchored = true w.Size = Vector3.new(80, 60, 1) w.CFrame = CFrame.lookAt(f.Position + f.LookVector * 70, f.Position) w.Parent = workspace
    local function at(name, dist, side, color) local p = Instance.new("Part") p.Name = name p.Anchored = true p.CanCollide = false p.Transparency = 1 p.Size = Vector3.new(0.1, 0.1, 0.1) p.Position = f.Position + f.LookVector * dist + f.RightVector * side p.Parent = workspace
      local e = Instance.new("ParticleEmitter") e.Name = "E" e.Enabled = false e.Speed = NumberRange.new(0) e.Lifetime = NumberRange.new(1000) e.Size = NumberSequence.new(dist / 4) e.Texture = "studio://white" e.Color = ColorSequence.new(color) e.Parent = p e:Emit(1) end
    at("NearRef", 12, -3, Color3.new(0.5, 0.5, 0.5)) at("FarRed", 60, 8, Color3.new(1, 0, 0))
    local L = game:GetService("Lighting") _G.atmo = L:FindFirstChildOfClass("Atmosphere") if _G.atmo then _G.atmo.Parent = nil end
    L.FogStart = 30 L.FogEnd = 31 L.FogColor = Color3.new(0.5, 0.5, 0.5)`);
  await t.sim(3);
  const px = pts => t.eval(async pts => {
    const S = window.studio; S.frames(1); await S.scene.whenReadyAsync(); S.frames(1);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, cam = S.cam, V = cam.position.constructor;
    return pts.map(pt => { const p = V.Project(new V(...pt), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); const b = new Uint8Array(4 * 9); g.readPixels(Math.round(p.x) - 1, Math.round(c.height - 1 - p.y) - 1, 3, 3, g.RGBA, g.UNSIGNED_BYTE, b); return [0, 1, 2].map(k => { let s = 0; for (let i = 0; i < 9; i++) s += b[i * 4 + k]; return Math.round(s / 9); }); });
  }, pts);
  const where = await t.eval(() => { const W = window.studio.dm.workspace, get = n => { const p = W.children.find(c => c.props.Name === n).props.Position; return [p.x, p.y, p.z]; }; const f = W.props.CurrentCamera.props.CFrame, m = f.m, look = [-m[5], -m[8], -m[11]], right = [m[3], m[6], m[9]]; const wall = get('FogWall'); return { near: get('NearRef'), far: get('FarRed'), wall: [wall[0] - right[0] * 8, wall[1] + 18, wall[2] - right[2] * 8] }; });
  const [nearPx, farPx, wallPx] = await px([where.near, where.far, where.wall]);
  const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  check(diff(wallPx, nearPx) <= 6, `FogColor (0.5 grey): a fully fogged wall ${wallPx} matches an unfogged 0.5 grey particle ${nearPx}`);
  check(diff(farPx, wallPx) <= 6, `a red particle past FogEnd turns the fog colour like the wall (${farPx} vs ${wallPx})`);
  await run('workspace.FogWall:Destroy() workspace.NearRef:Destroy() workspace.FarRed:Destroy() local L = game:GetService("Lighting") L.FogStart = 0 L.FogEnd = 100000 if _G.atmo then _G.atmo.Parent = L end');
  await run('for _, s in ipairs(_G.saved) do s[1].Parent = s[2] end');
  // The lab, from in front, after the effects have run a while.
  await run('for _, d in ipairs(workspace:GetDescendants()) do if d:IsA("ParticleEmitter") then d.Enabled = true end end');
  await t.sim(150);
  await t.eval(() => { const c = window.studio.camera, cv = document.getElementById('c'), a = cv.width / cv.height; c.yaw = 0; c.pitch = 0.12; c.zoom = c.z = c.dist = 26 * Math.max(1, 1.3 / a); c.update(0); });
  await t.frames(2);
  await t.golden('particles');
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('particles: all checks passed');
}
