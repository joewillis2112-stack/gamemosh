// Moving floors, as Roblox behaves (mashup-research/ROBLOX_PLATFORMS_TWEENS_2026-10-08.md):
// - a conveyor (anchored part with a velocity; here the deprecated Velocity
//   name) carries a character standing still, which stays idle;
// - a part moved only by CFrame (a tween, a Heartbeat script) has no velocity
//   and doesn't carry: the character stays put and the part slides away;
// - the same part with AssemblyLinearVelocity set to match does (Roblox's
//   own advice);
// - jumping off a conveyor, the legacy Humanoid keeps no momentum: air
//   control brings it back toward the input;
// - an unanchored part's AssemblyLinearVelocity reads back from physics.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(20);
  const S = () => t.eval(() => { const p = window.studio.player, f = p.footPosition; return { x: f.x, y: f.y, z: f.z, vx: p.velocity.x, grounded: p.grounded, state: p.state }; });
  const put = (x, y, z) => t.eval(([x, y, z]) => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(x, y, z), 0); }, [x, y, z]);
  await t.eval(() => window.studio.vm.run('platforms', `
    local function slab(name, x)
      local p = Instance.new("Part")
      p.Name = name p.Anchored = true p.Size = Vector3.new(60, 1, 10) p.Position = Vector3.new(x, 4, 40)
      p.Parent = workspace
      return p
    end
    slab("Conveyor", 0).Velocity = Vector3.new(10, 0, 0)
    local glide, carry = slab("Glide", 0), slab("Carry", 0)
    glide.Position = Vector3.new(0, 4, 60) carry.Position = Vector3.new(0, 4, 80)
    carry.AssemblyLinearVelocity = Vector3.new(10, 0, 0)
    _G.moving = false
    game:GetService("RunService").Heartbeat:Connect(function(dt)
      if not _G.moving then return end
      glide.CFrame = glide.CFrame + Vector3.new(10 * dt, 0, 0)
      carry.CFrame = carry.CFrame + Vector3.new(10 * dt, 0, 0)
    end)
    print("velocity alias", workspace.Conveyor.AssemblyLinearVelocity == Vector3.new(10, 0, 0), workspace.Conveyor.Velocity.X)
  `));

  // Conveyor.
  await put(-20, 4.5, 40); await t.sim(10);
  let a = await S(); await t.sim(60); let b = await S();
  console.log('conveyor 1 s:', (b.x - a.x).toFixed(2), 'studs, state', b.state);
  check(b.x - a.x > 9.5 && b.x - a.x < 10.1 && Math.abs(b.z - a.z) < 0.05 && b.state === 'idle', 'a conveyor at 10 studs/s carries a standing character 10 studs, idle');

  // Jump off it: momentum fades in the air.
  await put(-20, 4.5, 40); await t.sim(30);
  // (Air time is 0.51 s, so sample before it lands back on the conveyor.)
  await t.sim(1, { jump: true }); await t.sim(5); const j1 = await S(); await t.sim(15); const j2 = await S();
  console.log('after jumping off: vx', j1.vx.toFixed(2), 'at 0.1 s,', j2.vx.toFixed(2), 'at 0.35 s, grounded', j2.grounded);
  check(j1.vx > 2 && Math.abs(j2.vx) < 0.5 && !j2.grounded, 'jumping off, the conveyor\'s speed fades in the air (legacy Humanoid keeps no momentum)');

  // A part moved by CFrame alone vs. the same with its velocity set.
  await put(0, 4.5, 60); await t.sim(10); const g0 = await S();
  await t.eval(() => window.studio.vm.run('go', `_G.moving = true`));
  await t.sim(60); const g1 = await S();
  await t.eval(() => window.studio.vm.run('stop', `_G.moving = false`));
  console.log('CFrame-moved part, 1 s: character moved', (g1.x - g0.x).toFixed(2));
  check(Math.abs(g1.x - g0.x) < 0.3, 'a part moved only by CFrame doesn\'t carry (no velocity)');
  await put(0, 4.5, 80); await t.sim(10); const c0 = await S();
  const p0 = await t.eval(() => window.studio.dm.workspace.children.find(c => c.Name === 'Carry').props.Position.x);
  await t.eval(() => window.studio.vm.run('go2', `_G.moving = true`));
  await t.sim(60); const c1 = await S();
  await t.eval(() => window.studio.vm.run('stop2', `_G.moving = false`));
  const p1 = await t.eval(() => window.studio.dm.workspace.children.find(c => c.Name === 'Carry').props.Position.x);
  console.log('CFrame-moved part with velocity set, 1 s: part', (p1 - p0).toFixed(2), 'character', (c1.x - c0.x).toFixed(2));
  check(Math.abs((c1.x - c0.x) - (p1 - p0)) < 0.4 && c1.grounded, 'with AssemblyLinearVelocity set to match, it carries the character along');

  // TweenService in the running frame loop: a 1 s Linear tween of an anchored
  // part's CFrame lands exactly, Completed fires, and (no velocity) a
  // character standing on it isn't carried.
  await put(0, 4.5, 100); await t.sim(10); const w0 = await S();
  await t.eval(() => window.studio.vm.run('tween', `
    local p = Instance.new("Part") p.Name = "Tweened" p.Anchored = true p.Size = Vector3.new(60, 1, 10) p.Position = Vector3.new(0, 4, 100) p.Parent = workspace
    local tw = game:GetService("TweenService"):Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { CFrame = p.CFrame + Vector3.new(8, 0, 0) })
    tw.Completed:Connect(function(s) print("tween done", s.Name, p.Position.X) end)
    tw:Play()
  `));
  await t.sim(70); const w1 = await S();
  const tweenLine = t.logs.map(l => l.replace(/^\w+ \[luau\] /, '')).find(l => l.startsWith('tween done')) || '';
  console.log(tweenLine, '; character moved', (w1.x - w0.x).toFixed(2));
  check(tweenLine === 'tween done Completed 8' && Math.abs(w1.x - w0.x) < 0.3, 'a TweenService tween moves the part 8 studs in 1 s; it carries no one');

  // Unanchored: velocity reads back from physics.
  await t.eval(() => window.studio.vm.run('drop', `
    local d = Instance.new("Part") d.Name = "Dropped" d.Size = Vector3.new(2, 2, 2) d.Position = Vector3.new(40, 60, -30) d.CanCollide = false d.Parent = workspace
    task.wait(0.5)
    print("falling", math.floor(-d.AssemblyLinearVelocity.Y + 0.5))
  `));
  await t.sim(40);
  const luau = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  console.log(luau.join('\n'));
  check(luau.includes('velocity alias true 10'), 'Velocity is AssemblyLinearVelocity');
  const fall = +(luau.find(l => l.startsWith('falling')) || 'falling 0').split(' ')[1];
  check(Math.abs(fall - 98) <= 4, `an unanchored part falling 0.5 s reads ~98 studs/s down (${fall})`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
