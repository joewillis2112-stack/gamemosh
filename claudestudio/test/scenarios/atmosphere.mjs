// Roblox's Atmosphere (runtime/atmosphere.js, runtime/sky.js) on places/atmosphere-lab.luau: dark
// walls from 40 to 2400 studs, each just above the horizon.
// - Density: the further a wall, the nearer its colour to the sky just above it; at a high Density
//   with Offset 0 a far wall is the sky behind it (aerial perspective); with no Atmosphere it isn't;
// - Offset: higher blurs the sky the fog takes, so a far wall stands out against the sharp sky;
// - Haze: a red Color turns the sky at the horizon red and leaves the sky high up as it was;
// - Glare: the haze around the sun brightens; Decay: away from the sun the haze turns to Decay;
// - particles fade like parts.
// Golden: the lab with haze and glare at a low sun.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('atmosphere ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); }
  const settle = () => t.eval(() => window.studio.lighting.settled());
  const run = async src => { await t.eval(s => window.studio.vm.run('atmo', s), src); await t.sim(1); await settle(); await t.sim(1); };
  const look = (yawDeg, pitchDeg = 0) => run(`local cam = workspace.CurrentCamera cam.CameraType = Enum.CameraType.Scriptable
    cam.CFrame = CFrame.new(0, 5, 0) * CFrame.Angles(0, math.rad(${yawDeg}), 0) * CFrame.Angles(math.rad(${pitchDeg}), 0, 0)`);
  await t.sim(5); await look(0);

  const grab = name => t.eval(async name => {
    const S = window.studio; S.frames(2); await S.scene.whenReadyAsync(); S.frames(2);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    (window.shots_ = window.shots_ || {})[name] = { w: c.width, h: c.height, px };
  }, name);
  // A world point's colour in a grab (projected with the camera as it is now).
  const colour = (name, pt) => t.eval(([n, pt]) => {
    const S = window.studio, c = document.getElementById('c'), cam = S.cam, V = cam.position.constructor, M = S.scene.getTransformMatrix();
    const p = V.Project(new V(...pt), M.constructor.Identity(), M, cam.viewport.toGlobal(c.width, c.height));
    const x = Math.round(p.x), y = Math.round(c.height - 1 - p.y), s = window.shots_[n];
    if (x < 1 || y < 1 || x >= s.w - 1 || y >= s.h - 1) return null;
    let r = 0, g = 0, b = 0; // a 3 x 3 mean
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = ((y + dy) * s.w + x + dx) * 4; r += s.px[i]; g += s.px[i + 1]; b += s.px[i + 2]; }
    return [r / 9, g / 9, b / 9];
  }, [name, pt]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const r0 = v => v.map(x => Math.round(x));
  // Wall i (from the lab): its face just under its top edge, and the sky just above that edge.
  const WALLS = [[40, -24], [150, -8], [600, 8], [2400, 24]];
  const spot = (i, k) => { const [d, a] = WALLS[i], r = a * Math.PI / 180, h = 0.07 * d + 5, z = h * k; return [d * Math.sin(r) * 0.999, z, -d * Math.cos(r) * 0.999]; };
  const gaps = async name => { const out = []; for (let i = 0; i < 4; i++) out.push(dist(await colour(name, spot(i, 0.85)), await colour(name, spot(i, 1.15)))); return out; };

  // Density: a Baseplate's Atmosphere (0.3, Offset 0.25).
  await grab('base');
  const g0 = await gaps('base');
  check(g0[0] > g0[1] && g0[1] > g0[2] && g0[2] > g0[3] && g0[0] > 60, `the further a wall, the nearer to the sky above it (gaps ${r0(g0)})`);
  await run('local a = game:GetService("Lighting").Atmosphere a.Density = 0.6 a.Offset = 0');
  await grab('thick');
  const g1 = await gaps('thick');
  check(g1[2] < 10 && g1[3] < 10 && g1[0] > 25, `Density 0.6, Offset 0: walls at 600 and 2400 studs are the sky behind them (gaps ${r0(g1)}); the near wall isn't`);
  await run('game:GetService("Lighting").Atmosphere.Offset = 1');
  await grab('offset');
  const g2 = await gaps('offset');
  check(g2[3] > g1[3] + 3, `Offset 1: the far wall takes a blurred sky and stands out against the sharp one (gap ${r0(g2)[3]} vs ${r0(g1)[3]})`);
  await run('game:GetService("Lighting").Atmosphere.Parent = nil');
  await grab('clear');
  const g3 = await gaps('clear');
  check(g3.every(v => v > 60), `no Atmosphere: every wall stands dark against the sky (gaps ${r0(g3)})`);

  // Particles fade like parts: a dark emitter in front of the far wall at Density 0.6.
  await run(`local L = game:GetService("Lighting") local a = Instance.new("Atmosphere") a.Name = "Atmosphere" a.Density = 0.6 a.Offset = 0 a.Parent = L
    local p = Instance.new("Part") p.Name = "Smoke" p.Anchored = true p.Transparency = 1 p.CanCollide = false p.Size = Vector3.new(60, 60, 1)
    p.CFrame = workspace.Walls.Wall3.CFrame * CFrame.new(0, 0, 30) p.Parent = workspace
    local e = Instance.new("ParticleEmitter") e.Color = ColorSequence.new(Color3.new(0, 0, 0)) e.LightEmission = 0 e.Size = NumberSequence.new(30) e.Rate = 0
    e.Lifetime = NumberRange.new(100) e.Speed = NumberRange.new(0) e.Parent = p e:Emit(40)`);
  await t.sim(3); await grab('smoke');
  const smokeAt = spot(2, 0.5), smoke = await colour('smoke', smokeAt), horizonSky = await colour('smoke', spot(2, 1.15));
  await run('workspace.Smoke:Destroy()'); await grab('nosmoke');
  const behind = await colour('nosmoke', smokeAt);
  check(dist(smoke, behind) < 25 && dist(smoke, [0, 0, 0]) > 80, `black particles 570 studs away fade into the fog (${r0(smoke)}; without them ${r0(behind)}, sky ${r0(horizonSky)})`);

  // Haze with a red Color: the horizon turns red; high up stays as it was.
  await run('local a = game:GetService("Lighting").Atmosphere a.Density = 0.3 a.Offset = 0.25');
  await look(180, 0); await grab('sky0'); // away from the walls: open sky over the floor's edge
  const lowPt = [0, 5 + 1000 * Math.tan(1 * Math.PI / 180), 1000], highPt = [0, 5 + 100 * Math.tan(25 * Math.PI / 180), 100];
  const low0 = await colour('sky0', lowPt), high0 = await colour('sky0', highPt);
  await run('local a = game:GetService("Lighting").Atmosphere a.Haze = 2 a.Color = Color3.fromRGB(255, 40, 30)');
  await grab('haze');
  const low1 = await colour('haze', lowPt), high1 = await colour('haze', highPt);
  const redness = c => c[0] / Math.max(1, (c[1] + c[2]) / 2);
  check(redness(low1) > redness(low0) * 1.5 && dist(high1, high0) < 12, `Haze 2, red: the horizon reddens (${r0(low0)} -> ${r0(low1)}), the sky 25 degrees up stays (${r0(high0)} -> ${r0(high1)})`);

  // Glare and Decay: towards the sun the haze is Color and brighter; away from it, Decay.
  await run(`local a = game:GetService("Lighting").Atmosphere a.Haze = 2 a.Glare = 3 a.Color = Color3.fromRGB(255, 120, 60) a.Decay = Color3.fromRGB(60, 90, 255)
    game:GetService("Lighting").ClockTime = 17.2`);
  const sunYaw = await t.eval(() => { const d = window.studio.R.sun.direction; return Math.atan2(d.x, d.z) * 180 / Math.PI; }); // the camera's -Z towards the sun
  const ahead = yaw => { const r = yaw * Math.PI / 180; return [-Math.sin(r) * 1000, 5 + 1000 * Math.tan(1.5 * Math.PI / 180), -Math.cos(r) * 1000]; };
  await look(sunYaw); await grab('tosun'); const toSun = await colour('tosun', ahead(sunYaw + 12));
  await look(sunYaw + 180); await grab('fromsun'); const fromSun = await colour('fromsun', ahead(sunYaw + 180));
  const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  check(L(toSun) > L(fromSun) * 1.3 && toSun[0] > toSun[2] && fromSun[2] > fromSun[0], `Glare 3: the horizon near the sun ${r0(toSun)} is brighter and Color-warm; away from it ${r0(fromSun)} turns to Decay's blue`);
  await look(sunYaw + 40, 2); await t.golden('atmosphere-haze');
  await run('local a = game:GetService("Lighting").Atmosphere a.Haze = 0');
  await look(sunYaw); await grab('nohaze'); const plain = await colour('nohaze', ahead(sunYaw + 12));
  check(dist(plain, toSun) > 20, `Haze 0: Glare and Decay do nothing (near the sun ${r0(plain)})`);
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('atmosphere: all checks passed');
}
