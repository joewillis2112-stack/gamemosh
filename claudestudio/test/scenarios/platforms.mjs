// Moving floors. Roblox's API, but not its limits
// (mashup-research/ROBLOX_PLATFORMS_TWEENS_2026-10-08.md has what Roblox does):
// - a conveyor (anchored part with a velocity; here the deprecated Velocity
//   name) carries a character standing still, which stays idle;
// - a part moved only by CFrame (a tween, a Heartbeat script) carries too:
//   its motion is measured each frame. (In Roblox it has no velocity and the
//   player slides off; creators work around that, here they needn't);
// - the Roblox workaround (velocity set to match as well) isn't doubled;
// - a spinning platform carries the character round and turns it with it;
// - jumping off a moving floor keeps its motion, so you land where you'd expect
//   (Roblox's newer controller does; its legacy Humanoid dropped it);
// - a platform that teleports doesn't fling anyone;
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

  // Jump on it: the conveyor's motion carries through the air.
  await put(-20, 4.5, 40); await t.sim(30);
  // (Air time is 0.51 s, so sample before it lands back on the conveyor.)
  await t.sim(1, { jump: true }); await t.sim(5); const j1 = await S(); await t.sim(15); const j2 = await S();
  console.log('after jumping off: vx', j1.vx.toFixed(2), 'at 0.1 s,', j2.vx.toFixed(2), 'at 0.35 s, grounded', j2.grounded);
  check(j1.vx > 9 && j2.vx > 9 && !j2.grounded, 'jumping on a conveyor keeps its 10 studs/s through the air');

  // A part moved by CFrame alone vs. the same with its velocity set.
  await put(0, 4.5, 60); await t.sim(10); const g0 = await S();
  await t.eval(() => window.studio.vm.run('go', `_G.moving = true`));
  await t.sim(60); const g1 = await S();
  await t.eval(() => window.studio.vm.run('stop', `_G.moving = false`));
  console.log('CFrame-moved part, 1 s: character moved', (g1.x - g0.x).toFixed(2));
  check(Math.abs(g1.x - g0.x - 10) < 0.5 && g1.grounded, 'a part moved only by CFrame carries the character (10 studs in 1 s)');
  await put(0, 4.5, 80); await t.sim(10); const c0 = await S();
  const p0 = await t.eval(() => window.studio.dm.workspace.children.find(c => c.Name === 'Carry').props.Position.x);
  await t.eval(() => window.studio.vm.run('go2', `_G.moving = true`));
  await t.sim(60); const c1 = await S();
  await t.eval(() => window.studio.vm.run('stop2', `_G.moving = false`));
  const p1 = await t.eval(() => window.studio.dm.workspace.children.find(c => c.Name === 'Carry').props.Position.x);
  console.log('CFrame-moved part with velocity set, 1 s: part', (p1 - p0).toFixed(2), 'character', (c1.x - c0.x).toFixed(2));
  check(Math.abs((c1.x - c0.x) - (p1 - p0)) < 0.5 && c1.grounded, 'moved and with its velocity set to match (the Roblox workaround): carried once, not twice');

  // TweenService in the running frame loop: a 1 s Linear tween of an anchored
  // part's CFrame lands exactly, Completed fires, and the character on it rides along.
  await t.eval(() => window.studio.vm.run('tweenpart', `local p = Instance.new("Part") p.Name = "Tweened" p.Anchored = true p.Size = Vector3.new(60, 1, 10) p.Position = Vector3.new(0, 4, 100) p.Parent = workspace`));
  await put(0, 4.5, 100); await t.sim(10); const w0 = await S();
  await t.eval(() => window.studio.vm.run('tween', `
    local p = workspace.Tweened
    local tw = game:GetService("TweenService"):Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { CFrame = p.CFrame + Vector3.new(8, 0, 0) })
    tw.Completed:Connect(function(s) print("tween done", s.Name, p.Position.X) end)
    tw:Play()
  `));
  await t.sim(70); const w1 = await S();
  const tweenLine = t.logs.map(l => l.replace(/^\w+ \[luau\] /, '')).find(l => l.startsWith('tween done')) || '';
  console.log(tweenLine, '; character moved', (w1.x - w0.x).toFixed(2));
  check(tweenLine === 'tween done Completed 8' && Math.abs(w1.x - w0.x - 8) < 0.5, 'a TweenService tween moves the part 8 studs in 1 s, and the character with it');

  // A spinner: 90°/s for 1 s, character 6 studs from the axis.
  await t.eval(() => window.studio.vm.run('spinner', `
    local p = Instance.new("Part") p.Name = "Spinner" p.Anchored = true p.Size = Vector3.new(24, 1, 24) p.Position = Vector3.new(60, 4, -60) p.Parent = workspace
    _G.spin = false
    game:GetService("RunService").Heartbeat:Connect(function(dt) if _G.spin then p.CFrame = p.CFrame * CFrame.Angles(0, dt * math.pi / 2, 0) end end)
  `));
  await put(60, 4.5, -54); await t.sim(10);
  const sp0 = await S(), yaw0 = await t.eval(() => window.studio.player.yaw);
  await t.eval(() => window.studio.vm.run('spin', `_G.spin = true`)); await t.sim(60); await t.eval(() => window.studio.vm.run('nospin', `_G.spin = false`)); await t.sim(2);
  const sp1 = await S(), yaw1 = await t.eval(() => window.studio.player.yaw);
  // Rotating (0, 0, +6) about +Y by 90° gives (+6, 0, 0): the character should end near (66, -60).
  const turned = ((yaw1 - yaw0) * 180 / Math.PI + 540) % 360 - 180;
  console.log('spinner: from', sp0.x.toFixed(2), sp0.z.toFixed(2), 'to', sp1.x.toFixed(2), sp1.z.toFixed(2), 'turned', turned.toFixed(1), 'deg');
  check(Math.hypot(sp1.x - 66, sp1.z + 60) < 0.8 && Math.abs(turned - 90) < 6 && sp1.grounded, 'a spinning platform carries the character round, turning it with the platform');

  // Jumping on a moving platform lands back on the same spot of it.
  await put(0, 4.5, 60); await t.sim(10);
  await t.eval(() => window.studio.vm.run('go3', `_G.moving = true`)); await t.sim(20);
  const rel = () => t.eval(() => { const s = window.studio, f = s.player.footPosition, g = s.dm.workspace.children.find(c => c.Name === 'Glide'); return f.x - g.props.Position.x; });
  const r0 = await rel(); await t.sim(1, { jump: true }); await t.sim(40); const r1 = await rel(), landed = await S();
  await t.eval(() => window.studio.vm.run('stop3', `_G.moving = false`));
  console.log('jump on a moving platform: offset along it', r0.toFixed(2), '->', r1.toFixed(2), 'grounded', landed.grounded);
  check(Math.abs(r1 - r0) < 0.6 && landed.grounded, 'a jump on a moving platform lands on the same spot of it');

  // A platform that jumps 100 studs (a teleport) doesn't fling the character.
  // (Glide, which has no conveyor velocity of its own.)
  const gx = await t.eval(() => window.studio.dm.workspace.children.find(c => c.Name === 'Glide').props.Position.x);
  await put(gx, 4.5, 60); await t.sim(10); const tp0 = await S();
  await t.eval(() => window.studio.vm.run('teleport', `workspace.Glide.CFrame = workspace.Glide.CFrame + Vector3.new(100, 0, 0)`));
  await t.sim(30); const tp1 = await S();
  console.log('platform teleported 100 studs: character moved', (tp1.x - tp0.x).toFixed(2), 'in x');
  check(Math.abs(tp1.x - tp0.x) < 1, 'a teleported platform doesn\'t fling the character');

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
