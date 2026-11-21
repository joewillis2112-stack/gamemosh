// Stress: content made and destroyed over and over leaves nothing behind. Each cycle a script makes
// 200 parts of every shape (some with a Decal, a ParticleEmitter, a PointLight or a Highlight), every
// Lighting effect and style, glTF MeshParts and a union, lets them draw, then destroys them all.
// After a warm-up cycle (caches fill once), the scene's meshes, materials, textures, post passes,
// physics bodies and the DataModel's instances return to the same counts every cycle, the JS heap
// doesn't keep growing, and the page logs no errors.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(5);
  const run = async src => { await t.eval(s => window.studio.vm.run('stress', s), src); };
  const MAKE = `
    local L = game:GetService("Lighting")
    local f = Instance.new("Folder") f.Name = "Stress" f.Parent = workspace
    local shapes = { Enum.PartType.Block, Enum.PartType.Ball, Enum.PartType.Cylinder, Enum.PartType.Wedge }
    for i = 1, 200 do
      local p = Instance.new(i % 7 == 0 and "WedgePart" or "Part")
      p.Anchored = (i % 3 ~= 0) p.Size = Vector3.new(2, 2, 2) p.Position = Vector3.new((i % 20) * 3 - 30, 2 + math.floor(i / 20) * 3, -20)
      if p.ClassName == "Part" then p.Shape = shapes[i % 4 + 1] end
      p.Color = Color3.fromHSV(i / 200, 0.7, 0.9) p.Material = (i % 2 == 0) and Enum.Material.SmoothPlastic or Enum.Material.Metal
      if i % 10 == 0 then local d = Instance.new("Decal") d.Texture = "rbxasset://textures/SpawnLocation.png" d.Parent = p end
      if i % 25 == 0 then local e = Instance.new("ParticleEmitter") e.Rate = 50 e.Parent = p end
      if i % 40 == 0 then local l = Instance.new("PointLight") l.Range = 12 l.Parent = p end
      if i % 50 == 0 then local h = Instance.new("Highlight") h.Parent = p end
      p.Parent = f
    end
    for _, cls in ipairs({ "ToonEffect", "OutlineEffect", "PixelEffect", "ColorCorrectionEffect", "BlurEffect", "SunRaysEffect" }) do
      local e = Instance.new(cls) e.Name = "Stress" .. cls e.Parent = L
    end
    L.LightingStyle = Enum.LightingStyle.Realistic
    L.Atmosphere.Haze = 1 L.Atmosphere.Density = 0.4
    task.spawn(function()
      local AS = game:GetService("AssetService")
      for i = 1, 4 do local m = AS:CreateMeshPartAsync("assets/models/BoxTextured.glb") m.Anchored = true m.Position = Vector3.new(i * 5, 3, -30) m.Parent = f end
      local a = Instance.new("Part") a.Anchored = true a.Size = Vector3.new(6, 2, 6) a.Position = Vector3.new(0, 10, -40) a.Parent = f
      local b = Instance.new("Part") b.Anchored = true b.Shape = Enum.PartType.Ball b.Size = Vector3.new(4, 4, 4) b.Position = Vector3.new(0, 11, -40) b.Parent = f
      local u = a:UnionAsync({ b }) u.Parent = f
      _G.stressDone = true
    end)`;
  const CLEAR = `
    local L = game:GetService("Lighting")
    workspace.Stress:Destroy()
    for _, c in ipairs(L:GetChildren()) do if c.Name:sub(1, 6) == "Stress" then c:Destroy() end end
    L.LightingStyle = Enum.LightingStyle.Soft
    L.Atmosphere.Haze = 0 L.Atmosphere.Density = 0.3
    _G.stressDone = false`;
  const counts = () => t.eval(() => {
    const S = window.studio, sc = S.scene, cam = sc.activeCamera;
    let insts = 0; const walk = i => { insts++; i.children.forEach(walk); }; walk(S.dm.game);
    return {
      meshes: sc.meshes.length, materials: sc.materials.length, textures: sc.textures.length, posts: (cam && cam._postProcesses.filter(Boolean).length) || 0,
      bodies: sc.getPhysicsEngine() ? sc.getPhysicsEngine().getBodies().length : 0, parts: S.world.parts.size, insts, lights: sc.lights.length, conns: S.dm.conns.size, emitters: S.particles.emitters.size,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0,
    };
  });
  const gc = () => t.page.evaluate(() => window.gc && window.gc());
  const errors = [];
  const cycle = async () => {
    const from = t.logs.length;
    await run(MAKE);
    for (let i = 0; i < 100; i++) {
      await run('if _G.stressDone then print("stress made") end'); await t.sim(2);
      if (t.logs.slice(from).some(l => l.includes('stress made'))) break;
      await t.page.waitForTimeout(50);
    }
    await t.frames(10);
    await run(CLEAR);
    await t.frames(5); await t.sim(5);
    errors.push(...t.logs.slice(from).filter(l => /^(error|pageerror)/.test(l)));
  };
  const base = await counts();
  console.log('before', JSON.stringify(base));
  await cycle(); await gc();
  const warm = await counts();
  console.log('warm', JSON.stringify(warm));
  const after = [];
  for (let k = 0; k < 4; k++) { await cycle(); await gc(); after.push(await counts()); console.log('cycle', k + 2, JSON.stringify(after[k])); }
  const last = after[after.length - 1];
  for (const key of ['meshes', 'materials', 'textures', 'posts', 'bodies', 'parts', 'insts', 'lights', 'conns', 'emitters']) {
    check(after.every(a => a[key] === warm[key]), `${key}: ${warm[key]} after the warm-up, ${after.map(a => a[key]).join(', ')} after each further cycle`);
  }
  if (warm.heap) check(last.heap <= warm.heap * 1.25 + 10, `JS heap ${warm.heap} MB after the warm-up, ${after.map(a => a.heap).join(', ')} MB after (no steady growth)`);
  check(!errors.length, `no page errors in any cycle (${errors.slice(0, 3).join(' | ')})`);
  if (fail.length) throw new Error(fail.length + ' failed: ' + fail.join('; '));
  console.log('stress: all checks passed');
}
