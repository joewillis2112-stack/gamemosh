// Local lights (places/lights-lab.luau, at night), against
// mashup-research/ROBLOX_LIGHTING_2026-10-09.md section 7:
// - Instance.new defaults (rbx-dom) and the Range/Angle clamps;
// - each light lights what it should and nothing past its Range; Brightness
//   doesn't change the reach; Color tints;
// - a SpotLight shines along its Face and follows its part;
// - a light not under a part draws nothing;
// - Soft: no specular, no shadows. Realistic: specular, and Shadows casts them.
// Brightness is read from screen pixels at floor points, light on vs off.
// Goldens: Soft and Realistic.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('lights ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); }
  await t.sim(5); await t.eval(() => window.studio.lighting.settled());
  const run = async src => { await t.eval(s => window.studio.vm.run('lab', s), src); await t.sim(1); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));

  // Defaults and clamps.
  await run(`local p, s, f = Instance.new("PointLight"), Instance.new("SpotLight"), Instance.new("SurfaceLight")
    print("defaults", p.Range, p.Brightness, p.Enabled, p.Shadows, s.Range, s.Angle, s.Face.Name, f.Range, f.Angle, f.Face.Name)
    p.Range = 500 s.Angle = 270 f.Angle = -5 print("clamped", p.Range, s.Angle, f.Angle)`);
  check(logs().includes('defaults 8 1 true false 16 90 Front 16 90 Front'), 'Instance.new defaults (rbx-dom): Point Range 8; Spot and Surface Range 16, Angle 90, Face Front; Brightness 1, Enabled, no Shadows');
  check(logs().includes('clamped 120 180 0'), 'Range clamps to 120 studs, Angle to [0, 180]');

  // A high view of the whole floor (farther back on a portrait phone, so the width fits).
  await t.eval(() => { const c = window.studio.camera, cv = document.getElementById('c'), a = cv.width / cv.height; c.yaw = 0; c.pitch = 1.15; c.zoom = c.z = c.dist = 62 * Math.max(1, 1.3 / a); c.update(0); });
  const lum = pts => t.eval(async pts => {
    // A light turned on changes the shaders' light count; they compile asynchronously, so wait.
    const S = window.studio; S.frames(1, { move: [0, 0] }); await S.scene.whenReadyAsync(); S.frames(2, { move: [0, 0] });
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, cam = S.cam, V = cam.position.constructor;
    return pts.map(([x, y, z]) => {
      const p = V.Project(new V(x, y, z), S.scene.getTransformMatrix().constructor.Identity(), S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height));
      const px = new Uint8Array(4 * 9); g.readPixels(Math.round(p.x) - 1, Math.round(c.height - 1 - p.y) - 1, 3, 3, g.RGBA, g.UNSIGNED_BYTE, px);
      const m = [0, 1, 2].map(k => { let s = 0; for (let i = 0; i < 9; i++) s += px[i * 4 + k]; return s / 9; });
      return { rgb: m, l: 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2], on: p.x > 0 && p.y > 0 && p.x < c.width && p.y < c.height };
    });
  }, pts);
  const setLight = (name, prop, v) => run(`for _, d in ipairs(workspace:GetDescendants()) do if d.Name == "${name}" then d.${prop} = ${v} end end`);
  // Floor points: [inside, past the light's reach].
  const P = {
    Point: [[-14, 0, -6], [-14, 0, 2]],         // lamp at (-14,3,-12), Range 12: 6.7 and 14.3 studs away
    Spot: [[0, 0, -6], [0, 0, 3]],              // fixture at (0,12,-6) down, Angle 60: cone radius ~6.8 on the floor
    Surface: [[14, 0, -13], [14, 0, 2]],        // panel at (14,6,-19.3) facing +Z, Range 14
    Red: [[-26, 0, 7], [-26, 0, 17]],           // red lamp at (-26,2,4), Range 10
  };
  const all = Object.values(P).flat();
  const base = await lum(all);
  check(base.every(p => p.on), 'every probe point is on screen');
  // Each light measured alone, so a phone's light budget (below) doesn't decide what's seen.
  const NAMES = ['Point', 'Spot', 'Surface', 'Red', 'ShadowSpot'];
  const only = async name => { for (const n of NAMES) await setLight(n, 'Enabled', n === name ? 'true' : 'false'); };
  const delta = async (name, prop = 'Enabled', off = 'false', on = 'true') => {
    await only(name);
    await setLight(name, prop, off); const a = await lum(P[name]);
    await setLight(name, prop, on); const b = await lum(P[name]);
    return b.map((p, i) => ({ dl: p.l - a[i].l, drgb: p.rgb.map((v, k) => v - a[i].rgb[k]) }));
  };
  for (const name of ['Point', 'Spot', 'Surface']) {
    const d = await delta(name);
    check(d[0].dl > 8 && Math.abs(d[1].dl) <= 1, `${name}Light lights the floor in reach (+${d[0].dl.toFixed(1)}) and nothing past it (${d[1].dl.toFixed(1)})`);
  }
  const red = await delta('Red');
  check(red[0].drgb[0] > 2 * Math.max(red[0].drgb[1], red[0].drgb[2], 1) && Math.abs(red[1].dl) <= 1, `a red light tints red (+${red[0].drgb.map(v => v.toFixed(0))}), not past its Range`);
  // Brightness raises the light, not its reach.
  const bright = await delta('Point', 'Brightness', '2', '6');
  check(bright[0].dl > 5 && Math.abs(bright[1].dl) <= 1, `Brightness 2 -> 6: brighter in reach (+${bright[0].dl.toFixed(1)}), still nothing past Range (${bright[1].dl.toFixed(1)})`);
  await setLight('Point', 'Brightness', '2');
  for (const n of NAMES) await setLight(n, 'Enabled', 'true');
  // The light budget: a mesh shades at most MAX_LIGHTS - 2 local lights (10 - 2 on a
  // desktop, 6 - 2 on a phone), the ones nearest the camera; the floor is in reach of all five.
  const budget = await t.eval(() => {
    const S = window.studio, L = S.localLights, floor = S.scene.meshes.find(m => m.name === 'Floor'), eye = S.cam.globalPosition;
    const max = floor.material.maxSimultaneousLights - 2;
    const shading = [...L.lights.values()].filter(e => e.light.isEnabled() && (e.light.includedOnlyMeshes || []).includes(floor));
    const all = [...L.lights.values()].map(e => e.light.position.subtract(eye).length()).sort((a, b) => a - b);
    const far = Math.max(...shading.map(e => e.light.position.subtract(eye).length()));
    return { max, n: shading.length, nearest: shading.length === Math.min(max, all.length) && far <= all[Math.min(max, all.length) - 1] + 1e-6 };
  });
  check(budget.n === Math.min(budget.max, 5) && budget.nearest, `the floor shades ${budget.n} of 5 lights in reach (budget ${budget.max}), the nearest to the camera`);

  // The spot follows its part: moved 12 studs toward the camera, its pool moves too.
  await run(`workspace.Fixture.Position = Vector3.new(0, 12, 6)`);
  const moved = await lum([[0, 0, -6], [0, 0, 6]]);
  await run(`workspace.Fixture.Position = Vector3.new(0, 12, -6)`);
  const back = await lum([[0, 0, -6], [0, 0, 6]]);
  check(moved[1].l > back[1].l + 8 && back[0].l > moved[0].l + 8, `a SpotLight follows its part (the pool moved from z -6 to 6: ${back[0].l.toFixed(0)}->${moved[0].l.toFixed(0)}, ${back[1].l.toFixed(0)}->${moved[1].l.toFixed(0)})`);
  // ...and shines along its Face, turning with the part.
  await run(`workspace.Fixture.CFrame = CFrame.new(0, 12, -6) * CFrame.Angles(math.rad(90), 0, 0)`);
  await t.sim(1);
  const dir = await t.eval(() => [...window.studio.localLights.lights.entries()].find(([i]) => i.Name === 'Spot')[1].light.direction.asArray());
  await run(`workspace.Fixture.CFrame = CFrame.new(0, 12, -6)`);
  // Bottom (-Y local) turned +90 degrees about X faces -Z.
  check(Math.abs(dir[0]) < 1e-3 && Math.abs(dir[1]) < 1e-3 && Math.abs(dir[2] + 1) < 1e-3, `a SpotLight shines along its Face and turns with its part (${dir.map(v => v.toFixed(3))})`);

  // Not under a part: nothing drawn.
  await run(`local l = Instance.new("PointLight") l.Name = "Loose" l.Parent = workspace`);
  check(await t.eval(() => ![...window.studio.localLights.lights.keys()].some(i => i.Name === 'Loose')), 'a light parented to the Workspace (not a part) draws nothing');

  // Soft: no specular, no shadows.
  const style = () => t.eval(() => { const L = window.studio.localLights; return [...L.lights.values()].map(e => ({ spec: e.light.specular.r + e.light.specular.g + e.light.specular.b, shadow: !!e.shadow })); });
  let st = await style();
  check(st.every(s => s.spec === 0 && !s.shadow), 'Soft: local lights have no specular and no shadows');
  await t.eval(() => window.studio.camera.update(0));
  await t.frames(3); await t.shot('lights-soft'); await t.golden('lights-soft');

  // Realistic: specular, and Shadows casts them (the pillar shades the floor beyond it).
  const shade = [[29, 0, 0]], lit = [[22, 0, 4]];
  await run(`game:GetService("Lighting").LightingStyle = Enum.LightingStyle.Realistic`);
  await t.eval(() => window.studio.lighting.settled());
  const withShadow = await lum([...shade, ...lit]);
  st = await style();
  await setLight('ShadowSpot', 'Shadows', 'false');
  const noShadow = await lum([...shade, ...lit]);
  check(st.every(s => s.spec > 0) && st.filter(s => s.shadow).length === 1, `Realistic: specular on, and one light (Shadows = true) casts shadows`);
  check(noShadow[0].l - withShadow[0].l > 8 && Math.abs(noShadow[1].l - withShadow[1].l) <= 3, `the pillar's shadow darkens the floor beyond it (${noShadow[0].l.toFixed(0)} -> ${withShadow[0].l.toFixed(0)}), not the floor in the open (${noShadow[1].l.toFixed(0)} vs ${withShadow[1].l.toFixed(0)})`);
  await setLight('ShadowSpot', 'Shadows', 'true');
  // A lamp's own part doesn't block its light: the PointLight sits inside its 1-stud cube.
  const lampOff = await lum([P.Point[0]]);
  await setLight('Point', 'Shadows', 'true');
  const lampShadow = await lum([P.Point[0]]);
  await setLight('Point', 'Shadows', 'false');
  check(Math.abs(lampShadow[0].l - lampOff[0].l) <= 3, `a shadow-casting PointLight inside its lamp still lights the floor (${lampOff[0].l.toFixed(0)} -> ${lampShadow[0].l.toFixed(0)})`);
  await t.frames(3); await t.shot('lights-realistic'); await t.golden('lights-realistic');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
