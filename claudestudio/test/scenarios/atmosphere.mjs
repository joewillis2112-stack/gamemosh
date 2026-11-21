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
  // Wall i (from the lab): the middle of its face. Each wall is compared with the sky at the same
  // screen point with the walls gone (an Atmosphere's Density and Offset don't change the sky).
  const WALLS = [[40, -24], [150, -8], [600, 8], [2400, 24]];
  const spot = i => { const [d, a] = WALLS[i], r = a * Math.PI / 180, h = 0.07 * d + 5; return [d * Math.sin(r) * 0.999, h * 0.6, -d * Math.cos(r) * 0.999]; };
  const cols = async name => { const out = []; for (let i = 0; i < 4; i++) out.push(await colour(name, spot(i))); return out; };
  await run('_G.walls = workspace.Walls _G.walls.Parent = nil'); await grab('sky'); const sky = await cols('sky'); await run('_G.walls.Parent = workspace');
  const gaps = async name => (await cols(name)).map((c, i) => dist(c, sky[i]));

  // Density: a Baseplate's Atmosphere (0.3, Offset 0.25).
  await grab('base');
  const g0 = await gaps('base');
  check(g0[0] > g0[1] && g0[1] > g0[2] && g0[2] > g0[3] && g0[0] > 60, `the further a wall, the nearer to the sky behind it (gaps ${r0(g0)})`);
  await run('local a = game:GetService("Lighting").Atmosphere a.Density = 0.6 a.Offset = 0');
  await grab('thick');
  const g1 = await gaps('thick');
  check(g1[2] < 6 && g1[3] < 6 && g1[0] > 25, `Density 0.6, Offset 0: walls at 600 and 2400 studs are the sky behind them (gaps ${r0(g1)}); the near wall isn't`);
  await run('game:GetService("Lighting").Atmosphere.Offset = 1');
  await grab('offset');
  const g2 = await gaps('offset');
  check(g2[3] > g1[3] + 4, `Offset 1: the far wall takes a blurred sky and stands out from the sharp sky behind it (gap ${r0(g2)[3]} vs ${r0(g1)[3]})`);
  await run('game:GetService("Lighting").Atmosphere.Parent = nil');
  await grab('clear');
  const g3 = await gaps('clear');
  check(g3.every(v => v > 60), `no Atmosphere: every wall stands dark against the sky (gaps ${r0(g3)})`);

  // Particles fade like parts: black particles 570 studs off in open sky (Density 0.3: partly fogged) look
  // like a black part in the same place, and not like the sky.
  const away = [-570 * Math.sin(35 * Math.PI / 180), 30, -570 * Math.cos(35 * Math.PI / 180)];
  await run(`local L = game:GetService("Lighting") local a = Instance.new("Atmosphere") a.Name = "Atmosphere" a.Density = 0.3 a.Offset = 0 a.Parent = L
    local p = Instance.new("Part") p.Name = "Smoke" p.Anchored = true p.CanCollide = false p.Size = Vector3.new(60, 60, 1) p.Color = Color3.new(0, 0, 0)
    p.CFrame = CFrame.lookAt(Vector3.new(${away}), Vector3.new(0, 5, 0)) p.Parent = workspace _G.smoke = p`);
  await grab('blackpart'); const blackPart = await colour('blackpart', away);
  await run(`local p = _G.smoke p.Transparency = 1
    local e = Instance.new("ParticleEmitter") e.Color = ColorSequence.new(Color3.new(0, 0, 0)) e.LightEmission = 0 e.Size = NumberSequence.new(40) e.Rate = 0
    e.Lifetime = NumberRange.new(100) e.Speed = NumberRange.new(0) e.Parent = p e:Emit(60)`);
  await t.sim(3); await grab('smoke');
  const smoke = await colour('smoke', away);
  await run('_G.smoke:Destroy()'); await grab('nosmoke');
  const open = await colour('nosmoke', away);
  check(dist(smoke, blackPart) < 10 && dist(smoke, open) > 30, `black particles 570 studs away fog like a black part there (${r0(smoke)} vs ${r0(blackPart)}; the sky ${r0(open)})`);

  // Haze with a red Color: the sky just above the horizon turns red; high up stays as it was.
  // (Looking away from the walls, 20 degrees off centre: the character stands in the middle.)
  await run('local a = game:GetService("Lighting").Atmosphere a.Density = 0.3 a.Offset = 0.25');
  await look(180, 0); await grab('sky0');
  const dirPt = (yaw, el, d = 1000) => { const r = yaw * Math.PI / 180; return [-Math.sin(r) * d, 5 + d * Math.tan(el * Math.PI / 180), -Math.cos(r) * d]; };
  const lowPt = dirPt(160, 1), highPt = dirPt(160, 25, 100);
  const low0 = await colour('sky0', lowPt), high0 = await colour('sky0', highPt);
  // Below the horizon (before the floor's edge, 2.9 degrees down) the sky continues its own colour
  // just above the horizon, at every heading: no band between them.
  const below0 = await colour('sky0', dirPt(160, -1.8)), above0 = await colour('sky0', dirPt(160, 0.5));
  check(dist(below0, above0) < 15, `below the horizon the sky continues the horizon's colour (${r0(below0)} under ${r0(above0)})`);
  await run('local a = game:GetService("Lighting").Atmosphere a.Haze = 2 a.Color = Color3.fromRGB(255, 40, 30)');
  await grab('haze');
  // With Haze from 1, below the horizon is the haze's colour (as Roblox's), as red as the band above it.
  const below1 = await colour('haze', dirPt(160, -1.8)), above1 = await colour('haze', dirPt(160, 0.5));
  const redness = c => c[0] / Math.max(1, (c[1] + c[2]) / 2);
  check(redness(below1) > 2.5 && redness(below1) > 0.8 * redness(above1), `with Haze 2, below the horizon is the haze's red (${r0(below1)} under ${r0(above1)})`);
  const low1 = await colour('haze', lowPt), high1 = await colour('haze', highPt);
  check(redness(low1) > redness(low0) * 1.5 && dist(high1, high0) < 4, `Haze 2, red: 1 degree up the sky reddens (${r0(low0)} -> ${r0(low1)}); 25 degrees up it stays (${r0(high0)} -> ${r0(high1)})`);

  // Glare and Decay, against the same haze with no glare: near the sun brighter; away from it, Decay's hue.
  const sunYaw = await t.eval(() => { const d = window.studio.R.sun.direction; return Math.atan2(d.x, d.z) * 180 / Math.PI; }); // yaw that turns the camera's -Z to the sun
  const shoot = async (name, yaw) => { await look(yaw); await grab(name); return colour(name, dirPt(yaw + 15, 1.5)); };
  await run('local a = game:GetService("Lighting").Atmosphere a.Haze = 2 a.Glare = 0 a.Color = Color3.fromRGB(255, 160, 90) a.Decay = Color3.fromRGB(60, 90, 255)');
  const toSun0 = await shoot('tosun0', sunYaw), fromSun0 = await shoot('fromsun0', sunYaw + 180);
  await run('game:GetService("Lighting").Atmosphere.Glare = 3');
  const toSun = await shoot('tosun', sunYaw), fromSun = await shoot('fromsun', sunYaw + 180);
  const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  check(L(toSun) > L(toSun0) * 1.08, `Glare 3: the haze near the sun brightens (${r0(toSun0)} -> ${r0(toSun)})`);
  check(fromSun0[0] > fromSun0[2] && fromSun[2] > fromSun[0], `Decay: with Glare, the haze away from the sun turns from Color's warm (${r0(fromSun0)}) to Decay's blue (${r0(fromSun)})`);
  await look(sunYaw + 40, 2); await t.golden('atmosphere-haze');
  await run('local a = game:GetService("Lighting").Atmosphere a.Haze = 0 a.Glare = 0');
  const plain0 = await shoot('plain0', sunYaw);
  await run('game:GetService("Lighting").Atmosphere.Glare = 3');
  const plain1 = await shoot('plain1', sunYaw);
  check(dist(plain0, plain1) < 2, `Haze 0: Glare does nothing (${r0(plain0)} vs ${r0(plain1)})`);
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('atmosphere: all checks passed');
}
