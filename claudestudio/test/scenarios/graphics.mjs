// The graphics quality (runtime/graphics.js, quality.js, menu.js) on places/lighting-lab.luau, run
// with --quality auto (the page picks the tier, as a player's would):
// - Automatic starts at the device's guess (this software renderer: low) and the setting says so;
// - UserGameSettings.SavedQualityLevel set by a script switches every system live to that level's
//   tier, to the numbers in quality.js (sun shadows, anti-aliasing, ambient occlusion, sun-ray taps,
//   the sky's size, lights per surface, local shadow maps, particle soft edges), and still draws;
// - back at the first tier the picture is the first picture; two rounds leak nothing;
// - the menu (Esc or the button): Graphics Mode Automatic/Manual, the 10-step slider (dimmed while
//   Automatic), F10 / Shift+F10; scripts see each change; the game's keys stay out while it's open;
// - the choice survives a reload.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const phone = await t.eval(() => matchMedia('(pointer: coarse)').matches);
  const waitReady = async () => { for (let i = 0; i < 60 && !t.logs.some(l => l.includes('lab ready')); i++) { await t.sim(10); await t.page.waitForTimeout(100); } await t.sim(5); await t.eval(() => window.studio.lighting.settled()); };
  await waitReady();
  const run = async src => { await t.eval(s => window.studio.vm.run('gfx', s), src); await t.sim(1); await t.eval(() => window.studio.lighting.settled()); await t.sim(1); };
  const logs = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  // The state each system is in, against the tier table.
  const state = () => t.eval(() => {
    const S = window.studio, { R, lighting, localLights, particles, sky, scene, graphics } = S;
    const rays = scene.postProcesses.find(p => p && p.name === 'sunRays');
    const partMat = [...S.world.parts.values()].map(e => e.mat).find(m => m && 'maxSimultaneousLights' in m);
    const shadowed = [...localLights.lights.values()].find(e => e.shadow);
    const em = [...particles.emitters.values()][0];
    const view = sky.mesh && sky.mesh.material && sky.mesh.material.reflectionTexture;
    return {
      tier: graphics.tier, level: graphics.manager.level, setting: String(graphics.settings.props.SavedQualityLevel),
      shadow: R.shadows.mapSize, cascades: R.shadows.numCascades, msaa: R.pipeline.samples, ssao: lighting.ssao ? lighting.ssaoRatio : 0,
      rays: rays ? rays.getEffectName() : null, sky: sky.n, skyTex: sky.env.getSize().width, skyShared: scene.environmentTexture === sky.env && !!view && view._texture === sky.env._texture,
      lights: partMat ? partMat.maxSimultaneousLights : null, localShadow: shadowed ? shadowed.shadow.getShadowMap().getSize().width : 0,
      soft: em ? em.mat.options.defines.includes('#define SOFT') : null, particlesQ: particles.Q.softParticles,
    };
  });
  const TIERS = { // runtime/quality.js
    low: { shadow: 512, cascades: 2, msaa: 1, ssao: 0, taps: 6, sky: 64, lights: 4, localShadow: 0, soft: false },
    phone: { shadow: 1024, cascades: 2, msaa: 1, ssao: 0.5, taps: 8, sky: 128, lights: 6, localShadow: 512, soft: false },
    high: { shadow: 2048, cascades: 4, msaa: 4, ssao: 1, taps: 12, sky: 256, lights: 10, localShadow: 1024, soft: true },
    ultra: { shadow: 4096, cascades: 4, msaa: 4, ssao: 1, taps: 16, sky: 512, lights: 14, localShadow: 2048, soft: true },
  };
  const matches = (s, name) => { const T = TIERS[name]; return s.tier === name && s.shadow === T.shadow && s.cascades === T.cascades && s.msaa === T.msaa && s.ssao === T.ssao && s.rays === 'studioSunRays' + T.taps && s.sky === T.sky && s.skyTex === T.sky && s.skyShared && s.lights === T.lights && s.localShadow === T.localShadow && s.soft === T.soft && s.particlesQ === T.soft; };
  const grab = name => t.eval(async name => {
    const S = window.studio; S.frames(2); await S.scene.whenReadyAsync(); S.frames(2);
    const c = document.getElementById('c'), g = S.scene.getEngine()._gl, px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    (window.shots_ = window.shots_ || {})[name] = { w: c.width, h: c.height, px };
  }, name);
  const counts = () => t.eval(() => { const sc = window.studio.scene; return { materials: sc.materials.length, textures: sc.textures.length, meshes: sc.meshes.length, posts: sc.postProcesses.filter(Boolean).length, lights: sc.lights.length }; });

  // Realistic (ambient occlusion and local shadows exist), a lamp with a shadow and an emitter.
  await run(`local L = game:GetService("Lighting") L.LightingStyle = Enum.LightingStyle.Realistic
    local lamp = Instance.new("Part") lamp.Anchored = true lamp.Size = Vector3.new(1, 1, 1) lamp.Position = Vector3.new(-6, 6, -2) lamp.Transparency = 1 lamp.Parent = workspace
    local l = Instance.new("PointLight") l.Range = 20 l.Brightness = 2 l.Shadows = true l.Parent = lamp
    local e = Instance.new("ParticleEmitter") e.Rate = 20 e.Parent = workspace.WallBack
    print("setting", UserSettings():GetService("UserGameSettings").SavedQualityLevel)`);
  let s = await state();
  check(s.tier === 'low' && s.level === 0 && s.setting === 'Automatic' && logs().includes('setting Enum.SavedQualitySetting.Automatic') && matches(s, 'low'), `Automatic starts at this device's guess: low (a software renderer), and scripts read Automatic`);
  await grab('start'); await t.sim(30); await grab('start2'); // twice: what moves by itself (particles, the idle character)
  const c0 = await counts();

  // A script sets the level: every system follows, live.
  const LEVEL_OF = { low: 2, phone: 5, high: 7, ultra: 10 };
  const roundStates = [];
  for (const round of [0, 1]) {
    for (const name of ['phone', 'high', 'ultra', 'low']) {
      await run(`UserSettings():GetService("UserGameSettings").SavedQualityLevel = Enum.SavedQualitySetting.QualityLevel${LEVEL_OF[name]}`);
      await t.sim(30); await grab('t-' + name);
      s = await state();
      if (round === 0) check(matches(s, name), `QualityLevel${LEVEL_OF[name]} (a script): every system at ${name}: shadows ${s.shadow} x ${s.cascades}, MSAA ${s.msaa}, AO ${s.ssao}, ${s.rays}, sky ${s.sky}, ${s.lights} lights, local shadow ${s.localShadow}, soft particles ${s.soft}`);
    }
    roundStates.push(await counts());
  }
  const differ = (x, y) => t.eval(([x, y]) => { const a = window.shots_[x], b = window.shots_[y]; let far = 0; for (let i = 0; i < a.px.length; i += 4) if (Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2])) > 12) far++; return far / (a.px.length / 4); }, [x, y]);
  const noise = await differ('start', 'start2'), back = await differ('start', 't-low'), apart = await differ('start', 't-ultra');
  check(back <= noise + 0.003 && apart > back + 0.01, `back at low, the picture is the first one: ${(back * 100).toFixed(2)}% of pixels differ, as much as two frames of the same tier (${(noise * 100).toFixed(2)}%; ultra: ${(apart * 100).toFixed(2)}%)`);
  const keys = ['materials', 'textures', 'meshes', 'posts', 'lights'];
  check(keys.every(k => roundStates[0][k] === roundStates[1][k]), `two rounds of all four tiers leak nothing (${keys.map(k => `${k} ${c0[k]} -> ${roundStates[0][k]} -> ${roundStates[1][k]}`).join(', ')})`);
  await run(`UserSettings():GetService("UserGameSettings").SavedQualityLevel = Enum.SavedQualitySetting.Automatic`);
  s = await state();
  check(s.level === 0 && s.tier === 'low', 'Automatic again: back to its own tier');

  // The menu.
  await run(`local s = UserSettings():GetService("UserGameSettings") s:GetPropertyChangedSignal("SavedQualityLevel"):Connect(function() print("now", s.SavedQualityLevel) end)`);
  const ui = () => t.eval(() => { const m = window.studio.menu; return { open: m.open, shown: m.el.style.display, mode: m.modeText.textContent, lit: m.bars.filter(b => b.style.background.startsWith('rgb(255') || b.style.background === '#fff').length, dim: m.quality.style.opacity }; });
  const press = async (fnSrc) => { const [x, y] = await t.eval(src => { const m = window.studio.menu, el = new Function('m', 'return ' + src)(m), r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, fnSrc); if (phone) await t.page.touchscreen.tap(x, y); else await t.page.mouse.click(x, y); await t.sim(2); };
  if (phone) await press('m.button'); else await t.page.keyboard.press('Escape');
  await t.sim(2);
  let u = await ui();
  const at = u.lit; // the slider where the last Manual level left it (Roblox's starts at 5)
  check(u.open && u.shown === 'flex' && u.mode === 'Automatic' && u.dim === '0.4' && at >= 1, `${phone ? 'the menu button' : 'Esc'} opens the menu: Graphics Mode Automatic, the slider dimmed (at ${at})`);
  // The game's keys stay out while it's open (desktop: hold W; the character doesn't move).
  if (!phone) {
    const p0 = await t.eval(() => window.studio.player.holder.position.asArray());
    await t.page.keyboard.down('KeyW'); await t.sim(30); await t.page.keyboard.up('KeyW'); await t.sim(5);
    const p1 = await t.eval(() => window.studio.player.holder.position.asArray());
    check(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 0.05, `W held with the menu open: the character stays (moved ${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(3)} studs)`);
  }
  await press('m.modeRight');
  s = await state(); u = await ui();
  check(u.mode === 'Manual' && u.dim === '1' && s.level === at && logs().includes('now Enum.SavedQualitySetting.QualityLevel' + at), `Manual: the slider's ${at} applies (${s.tier}), and scripts see QualityLevel${at}`);
  await press('m.bars[8]');
  s = await state(); u = await ui();
  check(s.level === 9 && s.tier === 'ultra' && u.lit === 9 && logs().includes('now Enum.SavedQualitySetting.QualityLevel9'), `${phone ? 'tapping' : 'clicking'} bar 9: level 9, ultra`);
  await press('m.minus');
  s = await state();
  check(s.level === 8 && s.tier === 'high', `− steps down: level 8, high`);
  if (!phone) {
    await t.page.keyboard.press('F10'); await t.sim(2); const up = (await state()).level;
    await t.page.keyboard.press('Shift+F10'); await t.sim(2); await t.page.keyboard.press('Shift+F10'); await t.sim(2); const down = (await state()).level;
    check(up === 9 && down === 7, `F10 raises the level (${up}), Shift+F10 lowers it (${down})`);
  }
  await press('m.modeLeft');
  s = await state(); u = await ui();
  check(u.mode === 'Automatic' && s.level === 0 && s.tier === 'low' && u.dim === '0.4', 'back to Automatic: its own tier, the slider dimmed');
  if (!phone) { await t.page.keyboard.press('F10'); await t.sim(2); check((await state()).level === 0, 'F10 does nothing while Automatic (as Roblox)'); }
  await press('m.modeRight'); // Manual at the slider's last value
  s = await state();
  const kept = s.level;
  await t.golden('graphics-menu');
  await press('m.resume');
  u = await ui();
  check(!u.open && u.shown === 'none', 'Resume closes the menu');

  // The choice survives a reload (saved for the player).
  t.logs.length = 0;
  await t.page.reload();
  await t.page.waitForFunction(() => window.studio && window.studio.ready, null, { timeout: 120000 });
  await waitReady();
  s = await state();
  await run('print("after reload", UserSettings():GetService("UserGameSettings").SavedQualityLevel)');
  check(s.level === kept && kept > 0 && logs().includes(`after reload Enum.SavedQualitySetting.QualityLevel${kept}`), `after a reload: still level ${kept} (${s.tier}), and scripts read it`);
  await t.eval(() => localStorage.clear());
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('graphics: all checks passed');
}
