// The Lighting service (places/lighting-lab.luau), against
// mashup-research/ROBLOX_LIGHTING_2026-10-09.md:
// - a new place starts from a Baseplate's Lighting (values and children);
// - the sun's direction from ClockTime and GeographicLatitude, and the renderer's
//   light along it; the moon at night;
// - ClockTime and TimeOfDay are one time; SetMinutesAfterMidnight;
// - ExposureCompensation in stops; GlobalShadows; environment diffuse vs
//   specular scales; an Atmosphere's fog replaces FogStart/FogEnd; Bloom follows its effect;
// - LightingStyle Realistic adds ambient occlusion.
// Goldens: the lab at a Baseplate's defaults, Realistic, sunset, night, and flat.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('lab ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); }
  await t.sim(5);
  const settle = () => t.eval(() => window.studio.lighting.settled());
  // After a change: a frame step applies it, then the sky's environment re-renders (async).
  const run = async src => { await t.eval(s => window.studio.vm.run('lab', s), src); await t.sim(1); await settle(); };
  const state = () => t.eval(() => {
    const S = window.studio, L = S.dm.service('Lighting'), R = S.R, sp = S.scene.environmentTexture.sphericalPolynomial;
    return {
      kids: L.children.map(c => c.ClassName).sort(), clock: L.props.ClockTime, tod: L.props.TimeOfDay,
      sunDir: R.sun.direction.asArray(), sunI: R.sun.intensity, shadows: R.sun.shadowEnabled,
      exposure: R.pipeline.imageProcessing.exposure, envI: S.scene.environmentIntensity, shY: sp.y.length(), shXX: sp.xx.length(),
      fog: [S.scene.fogMode, S.scene.fogStart, S.scene.fogEnd], bloom: R.pipeline.bloomEnabled, ssao: !!S.lighting.ssao,
    };
  });
  const near = (a, b, tol = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));

  let s = await state();
  check(JSON.stringify(s.kids) === '["Atmosphere","BloomEffect","DepthOfFieldEffect","Sky","SunRaysEffect"]' && s.tod === '14:30:00', 'a new place has a Baseplate\'s Lighting: Sky, SunRays, Atmosphere, Bloom, DepthOfField; 14:30');
  await run(`local L = game:GetService("Lighting") local d = L:GetSunDirection() print(string.format("sun %.4f %.4f %.4f", d.X, d.Y, d.Z))`);
  check(logs().includes('sun -0.5583 0.7276 -0.3987') && near(s.sunDir, [0.5583, -0.7276, 0.3987]), 'GetSunDirection at 14:30, latitude 0, and the sun shines along it');
  await run(`local L = game:GetService("Lighting") L.GeographicLatitude = 41.7333 L.ClockTime = 6 local d = L:GetSunDirection() print(string.format("dawn %.3f %.3f %.3f", d.X, d.Y, d.Z))`);
  check(logs().includes('dawn 0.950 -0.000 0.313') || logs().includes('dawn 0.950 0.000 0.313'), 'the sun rises at +X at 06:00 (tilted by latitude)');

  await run(`local L = game:GetService("Lighting") L.TimeOfDay = "06:15:00" print("tod", L.ClockTime) L.ClockTime = 25 print("wrap", L.TimeOfDay) L:SetMinutesAfterMidnight(90) print("min", L.ClockTime, L:GetMinutesAfterMidnight())`);
  check(logs().includes('tod 6.25') && logs().includes('wrap 01:00:00') && logs().includes('min 1.5 90'), 'TimeOfDay and ClockTime are one time (wrapping past 24); SetMinutesAfterMidnight');

  await run(`local L = game:GetService("Lighting") L.GeographicLatitude = 0 L.ClockTime = 0`);
  await t.sim(1); s = await state();
  // midnight, latitude 0: sun = (0, -cos L, sin L) -> the moon is (0, cos L, sin L) with L = -23.5 deg
  check(near(s.sunDir, [-0, -Math.cos(23.5 * Math.PI / 180), Math.sin(23.5 * Math.PI / 180)]) && Math.abs(s.sunI - 3 * 0.06) < 1e-6, `at midnight the light is the moon (mirrored in X and Y), dim (${s.sunI.toFixed(3)})`);

  await run(`local L = game:GetService("Lighting") L.ClockTime = 14.5 L.ExposureCompensation = 1 L.GlobalShadows = false`);
  await t.sim(1); s = await state();
  check(Math.abs(s.exposure - 2) < 1e-6 && s.shadows === false, 'ExposureCompensation 1 doubles exposure; GlobalShadows off turns sun shadows off');
  await run(`local L = game:GetService("Lighting") L.ExposureCompensation = 0 L.GlobalShadows = true`);

  await t.sim(1); const base = await state();
  await run(`local L = game:GetService("Lighting") L.EnvironmentDiffuseScale = 0.25 L.EnvironmentSpecularScale = 0.5`);
  await t.sim(1); s = await state();
  check(Math.abs(s.envI - 0.5) < 1e-6 && Math.abs(s.shY / base.shY - 0.5) < 1e-4, `environment specular 0.5 (intensity ${s.envI}) and diffuse 0.25 (harmonics x${(s.shY / base.shY).toFixed(3)}, times 0.5 = 0.25)`);
  await run(`local L = game:GetService("Lighting") L.EnvironmentDiffuseScale = 1 L.EnvironmentSpecularScale = 1`);

  await t.sim(1); s = await state();
  check(s.fog[0] === 3 && Math.abs(s.fog[2] - 520) < 1e-6, `an Atmosphere (Density 0.3) fogs out at ${s.fog[2]} studs`);
  await run(`local L = game:GetService("Lighting") L.Atmosphere.Parent = nil L.FogStart = 20 L.FogEnd = 200`);
  await t.sim(1); s = await state();
  check(s.fog[0] === 3 && s.fog[1] === 20 && s.fog[2] === 200, 'without an Atmosphere, FogStart and FogEnd apply');
  await run(`local L = game:GetService("Lighting") L.Bloom.Enabled = false`);
  await t.sim(1); s = await state();
  const bloomOff = !s.bloom;
  await run(`local L = game:GetService("Lighting") L.Bloom.Enabled = true L.FogEnd = 100000 local a = Instance.new("Atmosphere") a.Density = 0.3 a.Parent = L`);
  await t.sim(1); s = await state();
  check(bloomOff && s.bloom && Math.abs(s.fog[2] - 520) < 1e-6, 'Bloom follows its effect\'s Enabled; a new Atmosphere brings its fog back');

  await t.frames(3);
  await t.shot('lighting-default'); await t.golden('lighting-default');

  // The sun disc is drawn where the sun is: aim the camera at the sun, project the
  // sun's direction to the screen, and the pixel there is the disc (bright), while
  // the direction mirrored in Z (a handedness slip) is ordinary sky.
  const aim = await t.eval(() => {
    const S = window.studio, sun = S.R.sun.direction.scale(-1);
    S.savedCam = { yaw: S.camera.yaw, pitch: S.camera.pitch, zoom: S.camera.zoom, z: S.camera.z, dist: S.camera.dist };
    let best = null;
    for (let yi = 0; yi < 72; yi++) for (let pi = -16; pi <= 16; pi++) {
      // The camera sits at focus + r (sin yaw cos pitch, sin pitch, cos yaw cos pitch) and looks back along it.
      const yaw = yi * Math.PI / 36, pitch = pi * 0.075;
      const d = -(Math.sin(yaw) * Math.cos(pitch) * sun.x + Math.sin(pitch) * sun.y + Math.cos(yaw) * Math.cos(pitch) * sun.z);
      if (!best || d > best.d) best = { d, yaw, pitch };
    }
    S.camera.yaw = best.yaw; S.camera.pitch = best.pitch; S.camera.zoom = S.camera.dist = 0.5; S.camera.update(0); // first person, character hidden: nothing in the way
    S.player.holder.getChildMeshes().forEach(m => m.isVisible = false);
    return best.d;
  });
  await t.frames(3);
  const disc = await t.eval(() => {
    const S = window.studio, c = document.getElementById('c'), g = S.scene.getEngine()._gl, cam = S.cam;
    const sun = S.R.sun.direction.scale(-1), BV = cam.position.constructor;
    const at = d => { const p = BV.Project(cam.globalPosition.add(d.scale(200)), BV.Zero ? S.scene.getTransformMatrix().constructor.Identity() : null, S.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height));
      const px = new Uint8Array(4); g.readPixels(Math.round(p.x), Math.round(c.height - 1 - p.y), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); return { x: p.x / c.width, y: p.y / c.height, rgb: [...px.slice(0, 3)] }; };
    return { sun: at(sun), mirrored: at(new BV(sun.x, sun.y, -sun.z)) };
  });
  console.log('aim', aim.toFixed(3), JSON.stringify(disc));
  if (process.env.SHOT_AIM) { await t.shot('aim-debug'); await t.eval(() => { window.studio.R.pipeline.bloomEnabled = false; }); await t.frames(2); await t.shot('aim-debug-nobloom'); await t.eval(() => { window.studio.R.pipeline.bloomEnabled = true; }); }
  await t.eval(() => { const S = window.studio; S.player.holder.getChildMeshes().forEach(m => m.isVisible = true); Object.assign(S.camera, S.savedCam); S.camera.update(0); });
  const lum = p => p.rgb[0] + p.rgb[1] + p.rgb[2];
  check(aim > 0.95 && Math.min(...disc.sun.rgb) >= 245 && lum(disc.mirrored) < 700, `the sun disc is where the sun is (${disc.sun.rgb}), not mirrored (${disc.mirrored.rgb})`);
  await run(`game:GetService("Lighting").LightingStyle = Enum.LightingStyle.Realistic`);
  await t.sim(1); s = await state();
  check(s.ssao, 'LightingStyle Realistic adds ambient occlusion');
  await t.frames(3);
  await t.shot('lighting-realistic'); await t.golden('lighting-realistic');
  await run(`local L = game:GetService("Lighting") L.LightingStyle = Enum.LightingStyle.Soft L.ClockTime = 17.2`);
  await t.sim(1); s = await state();
  check(!s.ssao, 'back to Soft: no ambient occlusion');
  await t.frames(3);
  await t.shot('lighting-sunset'); await t.golden('lighting-sunset');
  await run(`game:GetService("Lighting").ClockTime = 0`);
  await t.frames(3);
  await t.shot('lighting-night'); await t.golden('lighting-night');
  // Flat: no shadows, no environment light, bright even ambient (the blocky end of the range).
  await run(`local L = game:GetService("Lighting") L.ClockTime = 14.5 L.GlobalShadows = false L.EnvironmentDiffuseScale = 0 L.EnvironmentSpecularScale = 0 L.Ambient = Color3.fromRGB(150, 150, 150)`);
  await t.frames(3);
  await t.shot('lighting-flat'); await t.golden('lighting-flat');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
