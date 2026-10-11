// workspace.CurrentCamera in the player (runtime/camera.js CameraSync):
// - Custom: the engine writes CFrame, Focus and ViewportSize each frame, and
//   they are the drawn camera's; CameraSubject is the spawned Humanoid;
// - Scriptable: the script's CFrame is what's drawn and the engine leaves it,
//   roll included; FieldOfView applies; WorldToViewportPoint lands on the
//   pixels the part is drawn at (projection and renderer agree);
// - a RenderStepped handler that moves the camera in Custom (shake) is drawn
//   that frame and doesn't accumulate;
// - CameraSubject a part: the camera follows it.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(20);
  const run = async src => { await t.eval(s => window.studio.vm.run('cam', s), src); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  const last = k => logs().filter(l => l.startsWith(k + ' ')).pop() || '';
  const nums = k => last(k).split(' ').slice(1).map(Number);
  const near = (a, b, e) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= e);
  // The drawn camera: Babylon's position and forward after a render.
  const drawn = () => t.eval(() => { const S = window.studio; S.frames(1); const c = S.cam, f = c.getForwardRay(1).direction; return { pos: c.position.asArray(), fwd: f.asArray(), up: c.upVector.asArray(), fov: c.fov }; });
  // Pixels at viewport points (CSS px from the top-left), after rendering one frame.
  const pixels = pts => t.eval(async pts => {
    const S = window.studio; S.frames(1); await S.scene.whenReadyAsync(); S.frames(1);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, s = c.width / c.clientWidth;
    return pts.map(([x, y]) => { const px = new Uint8Array(4); g.readPixels(Math.round(x * s), Math.round(c.height - 1 - y * s), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); return [...px.slice(0, 3)]; });
  }, pts);
  const red = p => p[0] > 120 && p[0] > p[1] + 60 && p[0] > p[2] + 60;

  // Custom: the Camera's properties are the drawn camera's.
  await run(`local c = workspace.CurrentCamera
    print("subject", c.CameraSubject and c.CameraSubject.ClassName, c.CameraSubject == game.Players.LocalPlayer.Character.Humanoid, c.CameraType.Name)`);
  await t.sim(1);
  check(last('subject') === 'subject Humanoid true Custom', `Custom; CameraSubject is the character's Humanoid after spawn (${last('subject')})`);
  let d = await drawn();
  await run(`local c = workspace.CurrentCamera local p, l = c.CFrame.Position, c.CFrame.LookVector
    print("cf", p.X, p.Y, p.Z, l.X, l.Y, l.Z) print("vp", c.ViewportSize.X, c.ViewportSize.Y)
    local f = c.Focus.Position local root = game.Players.LocalPlayer.Character.HumanoidRootPart.Position
    print("focus", f.X - root.X, f.Y - root.Y, f.Z - root.Z, (f - p).Unit:Dot(l))`);
  await t.sim(1);
  const css = await t.eval(() => { const c = document.getElementById('c'); return [c.clientWidth, c.clientHeight]; });
  check(near(nums('cf').slice(0, 3), d.pos, 0.02) && near(nums('cf').slice(3), d.fwd, 1e-3), `Custom: Camera.CFrame is the drawn camera (${last('cf')} vs ${d.pos.map(v => v.toFixed(2))})`);
  check(near(nums('vp'), css, 0.5), `ViewportSize is the canvas in CSS pixels (${last('vp')} vs ${css})`);
  check(near(nums('focus'), [0, 1.5, 0, 1], 0.05), `Focus: 1.5 studs above the root part, straight ahead (${last('focus')})`);
  // It follows the character.
  const before = nums('cf');
  await t.sim(40, { move: [0, 1] });
  await run(`local p = workspace.CurrentCamera.CFrame.Position print("moved", p.X, p.Y, p.Z)`); await t.sim(1);
  check(Math.hypot(...nums('moved').map((v, i) => v - before[i])) > 3, `Custom: the CFrame follows the walking character (${last('moved')})`);

  // Scriptable: a red block 30 studs ahead of a script-placed camera.
  await run(`local b = Instance.new("Part") b.Name = "Target" b.Anchored = true b.Size = Vector3.new(4, 4, 4)
    b.Color = Color3.new(1, 0, 0) b.Material = Enum.Material.Neon b.Position = Vector3.new(60, 40, 60) b.Parent = workspace
    local c = workspace.CurrentCamera c.CameraType = Enum.CameraType.Scriptable
    c.CFrame = CFrame.lookAt(Vector3.new(60, 40, 90), Vector3.new(60, 40, 60))
    local v, on = c:WorldToViewportPoint(b.Position) print("proj", v.X, v.Y, on)`);
  await t.sim(1);
  let pv = nums('proj');
  d = await drawn();
  check(near(d.pos, [60, 40, 90], 1e-3) && near(d.fwd, [0, 0, -1], 1e-4), `Scriptable: the script's CFrame is what's drawn (${d.pos}, ${d.fwd.map(v => v.toFixed(4))})`);
  let px = await pixels([[pv[0], pv[1]], [pv[0] + 0.3 * css[0], pv[1]]]);
  check(red(px[0]) && !red(px[1]), `WorldToViewportPoint lands on the part as drawn (${px[0]}), and off it isn't red (${px[1]})`);
  await t.sim(30, { move: [1, 0] });
  d = await drawn();
  check(near(d.pos, [60, 40, 90], 1e-3), 'Scriptable: the engine leaves it while the character moves');

  // Roll: the block 6 studs to the camera's right, then the camera rolled 90°: it's drawn above centre.
  await run(`local c = workspace.CurrentCamera
    c.CFrame = CFrame.lookAt(Vector3.new(66, 40, 90), Vector3.new(66, 40, 60)) * CFrame.Angles(0, 0, math.rad(90))
    local v = c:WorldToViewportPoint(workspace.Target.Position) print("roll", v.X, v.Y)`);
  await t.sim(1);
  pv = nums('roll');
  px = await pixels([[pv[0], pv[1]], [css[0] / 2, css[1] / 2]]);
  check(Math.abs(pv[0] - css[0] / 2) < 2 && pv[1] < css[1] / 2 - 20 && red(px[0]) && !red(px[1]), `roll: the block is drawn where the rolled projection says, above centre (${pv.map(v => v.toFixed(1))}: ${px[0]}; centre ${px[1]})`);

  // FieldOfView: narrower makes it bigger on screen; the projection still lands on it.
  await run(`local c = workspace.CurrentCamera c.CFrame = CFrame.lookAt(Vector3.new(60, 40, 90), Vector3.new(60, 40, 60))
    local e, o = workspace.Target.Position + Vector3.new(1.8, 0, 2), workspace.Target.Position + Vector3.new(2.2, 0, 2) -- just inside and outside its right edge
    c.FieldOfView = 70 local a = c:WorldToViewportPoint(e) local m = c:WorldToViewportPoint(workspace.Target.Position)
    c.FieldOfView = 20 local b = c:WorldToViewportPoint(e) local m2 = c:WorldToViewportPoint(workspace.Target.Position)
    local out = c:WorldToViewportPoint(o) print("fov", a.X - m.X, b.X - m2.X, b.X, b.Y, out.X, out.Y)`);
  await t.sim(1);
  const fv = nums('fov');
  d = await drawn();
  px = await pixels([[fv[2], fv[3]], [fv[4], fv[5]]]);
  check(Math.abs(d.fov - 20 * Math.PI / 180) < 1e-6 && fv[1] > 3 * fv[0] && red(px[0]) && !red(px[1]), `FieldOfView 20: drawn at 20°, the block ~3.9x wider, its edge where projected (0.2 studs either side) (${fv.slice(0, 2).map(v => v.toFixed(1))}; ${px[0]} | ${px[1]})`);

  // Back to Custom; a RenderStepped shake: drawn that frame, not accumulated.
  await run(`local c = workspace.CurrentCamera c.FieldOfView = 70 c.CameraType = Enum.CameraType.Custom
    _G.shake = game:GetService("RunService").RenderStepped:Connect(function() c.CFrame = c.CFrame * CFrame.new(0, 3, 0) end)`);
  await t.sim(5);
  d = await drawn();
  await run(`local p = workspace.CurrentCamera.CFrame.Position print("shaken", p.X, p.Y, p.Z)`); await t.sim(1);
  const sh1 = nums('shaken');
  await t.sim(30);
  await run(`local p = workspace.CurrentCamera.CFrame.Position print("shaken", p.X, p.Y, p.Z)`); await t.sim(1);
  const sh2 = nums('shaken');
  check(near(d.pos, sh1, 0.05) && Math.abs(sh2[1] - sh1[1]) < 0.05, `Custom: a RenderStepped offset is drawn and doesn't accumulate (${d.pos.map(v => v.toFixed(2))} vs ${sh1.map(v => v.toFixed(2))}; y ${sh1[1].toFixed(2)} then ${sh2[1].toFixed(2)})`);
  await run(`_G.shake:Disconnect()`); await t.sim(2);
  const shaken = d;
  d = await drawn();
  const off = Math.hypot(...d.pos.map((v, i) => shaken.pos[i] - v));
  check(Math.abs(off - 3) < 0.05, `the shake was really drawn: 3 studs from the unshaken camera (${off.toFixed(3)})`);
  check(near(d.up, [0, 1, 0], 1e-9), 'the drawn camera is upright again after the roll');

  // CameraSubject a part: the camera follows it.
  await run(`workspace.CurrentCamera.CameraSubject = workspace.Target`);
  await t.sim(10);
  await run(`local c = workspace.CurrentCamera local f = c.Focus.Position print("subj", f.X, f.Y, f.Z, (c.CFrame.Position - f).Magnitude)
    local v = c:WorldToViewportPoint(workspace.Target.Position) print("subjpx", v.X, v.Y)`); await t.sim(1);
  const sp = nums('subjpx');
  px = await pixels([sp]);
  check(near(nums('subj').slice(0, 3), [60, 40, 60], 0.01) && nums('subj')[3] > 5 && red(px[0]), `CameraSubject a part: the camera focuses on it from outside it (its own part doesn't pull the camera in) and it's drawn there (${last('subj')}; ${px[0]})`);
  await t.frames(2);
  await t.golden('camera-subject');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
