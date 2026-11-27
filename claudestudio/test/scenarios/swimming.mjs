// Swimming in Terrain water (run with --place places/swim-lab.luau; runtime/character.js, terrain/voxels.js):
// - dropped into the pool the character swims (FloorMaterial Water), floats up and rests at the surface, chest out;
// - it swims at 87.5% of WalkSpeed (Humanoid.Swimming fires it); holding jump under water swims up at that speed;
// - at the surface a jump leaps out; at the pool's edge a jump gets it out onto the bank, standing, not swimming.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('swim', s), src);
  const st = () => t.eval(() => { const S = window.studio, c = S.player, p = c.holder.position, w = h => c.water(p.x, c.footY + h, p.z); return { foot: c.footY, z: p.z, vy: c.vy, swimming: !!c.swimming, grounded: c.grounded, waist: w(c.p.Height * 0.5), chest: w(c.p.Height * 0.75), floor: S.players.humanoid.props.FloorMaterial }; });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const logs = tag => t.logs.filter(l => l.includes(`[luau] ${tag}`)).pop() || '';
  const place = async (x, y, z) => { await run(`game.Players.LocalPlayer.Character.HumanoidRootPart.CFrame = CFrame.new(${x}, ${y}, ${z})`); await t.eval(() => { const c = window.studio.camera; c.yaw = 0; c.lastCamPos = null; }); };
  await t.sim(30);
  const dry = await st();
  check(!dry.swimming && dry.grounded && dry.floor !== 'Water', `on dry land: not swimming (FloorMaterial ${dry.floor})`);

  // Into the deep end: swims, rises, rests at the surface (waist in, chest out), still.
  await place(0, 3, -20); await t.sim(150);
  const s1 = await st();
  check(s1.swimming && s1.floor === 'Water' && s1.waist >= 0.5 && s1.chest < 0.5 && Math.abs(s1.vy) < 0.1, `in the pool: swimming (FloorMaterial ${s1.floor}), resting at the surface (waist ${s1.waist.toFixed(2)} in, chest ${s1.chest.toFixed(2)} out, vy ${s1.vy.toFixed(3)})`);
  // Swimming along: 87.5% of WalkSpeed 16 = 14 (the camera looking level).
  const cam = async (pitchDeg) => { await run(`local c = workspace.CurrentCamera; c.CameraType = Enum.CameraType.Scriptable; local p = game.Players.LocalPlayer.Character.HumanoidRootPart.Position; c.CFrame = CFrame.new(p + Vector3.new(0, 4, 10)) * CFrame.Angles(math.rad(-${pitchDeg}), 0, 0)`); };
  await cam(0);
  await t.sim(20, { move: [0, 1] });
  const a0 = await st(); await t.sim(30, { move: [0, 1] }); const a1 = await st();
  const speed = (a0.z - a1.z) / 0.5;
  await run(`print("swims", table.concat(_G.swims, " "))`); await t.sim(1);
  const swims = logs('swims').replace(/^.*swims /, '').split(' ').map(Number);
  check(near(speed, 14, 0.2) && a1.swimming, `swims at 87.5% of WalkSpeed 16: ${speed.toFixed(2)} studs/s`);
  check(swims.some(v => near(v, 14, 0.1)), `Humanoid.Swimming fires that speed (${swims.filter(v => v > 13).slice(0, 3).map(v => v.toFixed(2)).join(', ')})`);
  // Looking 45 degrees down under water: forward swims down it, 14 x sin 45 = 9.9 down and along.
  await place(0, -2, -20); await t.sim(5); await cam(45); // (under, chest and all, well above the floor at -12)
  await t.sim(15, { move: [0, 1] });
  const d0 = await st(); await t.sim(12, { move: [0, 1] }); const d1 = await st();
  const down = (d0.foot - d1.foot) / 0.2, along = (d0.z - d1.z) / 0.2;
  check(d1.swimming && near(down, 9.9, 0.4) && near(along, 9.9, 0.4), `looking 45 degrees down, forward swims down along the look (${down.toFixed(2)} down, ${along.toFixed(2)} along, studs/s)`);
  // At the surface, the camera 15 degrees down (as it starts): along the surface, not under.
  await place(0, 3, -20); await t.sim(150); await cam(15);
  const g0 = await st(); await t.sim(30, { move: [0, 1] }); const g1 = await st();
  check(g1.swimming && Math.abs(g1.foot - g0.foot) < 0.15, `at the surface, looking 15 degrees down, it swims along the surface (feet ${g0.foot.toFixed(2)} -> ${g1.foot.toFixed(2)})`);
  await run(`workspace.CurrentCamera.CameraType = Enum.CameraType.Custom`);
  // Deep under, holding jump: up at 14.
  await place(0, -8, -20); await t.sim(10);
  await t.sim(20, { jump: true });
  const u0 = await st(); await t.sim(10, { jump: true }); const u1 = await st();
  check(u0.swimming && near((u1.foot - u0.foot) / (10 / 60), 14, 0.5), `holding jump under water swims up at 14 (${((u1.foot - u0.foot) / (10 / 60)).toFixed(2)} studs/s)`);
  // At the surface: a jump leaps out of the water.
  await t.sim(90); const sf = await st();
  await t.sim(1, { jump: true }); await t.sim(12);
  const lp = await st();
  check(lp.foot > sf.foot + 3 && !lp.swimming, `at the surface a jump leaps out (feet ${sf.foot.toFixed(2)} -> ${lp.foot.toFixed(2)})`);
  // Out at the edge (the bank's top at 0 beyond z = 0): swim to it, jump, walk on.
  await t.sim(60);
  await place(0, -3, -6); await t.sim(60);
  for (let i = 0; i < 30 && (await st()).z > -1.4; i++) await t.sim(3, { move: [0, -1] });
  await t.sim(1, { move: [0, -1], jump: true }); await t.sim(40, { move: [0, -1] }); await t.sim(30);
  const out = await st();
  check(!out.swimming && out.grounded && near(out.foot, 0, 0.1) && out.z > 0, `at the edge a jump gets it out onto the bank, standing (feet ${out.foot.toFixed(2)}, z ${out.z.toFixed(2)})`);
  // Parts in the water (they fell in at the start, 6 s ago): a 1-stud slab of Plastic (0.7) floats with 70% under (its
  // centre 0.2 below the surface at 0), of Wood (0.35) with 35% (0.15 above), Concrete sinks to the floor (-12); the
  // sensors say so; and the water drags: a block thrown along it slows.
  const bl = () => t.eval(() => { const ws = window.studio.dm.workspace, f = n => ws.children.find(c => c.props.Name === n), out = {};
    for (const n of ['Float', 'Raft', 'Sink', 'Dry']) { const p = f(n), s = p.children.find(c => c.ClassName === 'BuoyancySensor'); out[n] = { y: p.props.CFrame.y, full: s.props.FullySubmerged, touch: s.props.TouchingSurface, v: p.props.AssemblyLinearVelocity }; }
    return out; });
  const w0 = await bl();
  const wood = (await t.eval(() => window.studio.dm.workspace.children.find(c => c.props.Name === 'Raft').props.Material)) === 'Wood' ? 0.35 : null;
  check(near(w0.Float.y, -0.2, 0.04), `a Plastic slab floats with 70% of it under: its centre at ${w0.Float.y.toFixed(3)} (-0.2)`);
  check(wood !== null && near(w0.Raft.y, 0.5 - wood, 0.04), `a Wood slab (density 0.35) floats higher: ${w0.Raft.y.toFixed(3)} (${(0.5 - wood).toFixed(2)})`);
  check(near(w0.Sink.y, -11, 0.1), `a Concrete block sinks to the floor: ${w0.Sink.y.toFixed(2)} (-11)`);
  check(w0.Sink.full && w0.Sink.touch && !w0.Float.full && w0.Float.touch && !w0.Dry.full && !w0.Dry.touch, `BuoyancySensor: the sunk block FullySubmerged (${w0.Sink.full}), the floating one TouchingSurface only (${w0.Float.touch}, ${w0.Float.full}), the dry one neither (${w0.Dry.touch})`);
  await run(`workspace.Float.AssemblyLinearVelocity = Vector3.new(0, 0, 20)`); await t.sim(60); // (along the pool, 30 studs of open water: not into the bank)
  const w1 = await bl();
  check(Math.abs(w1.Float.v.z) < 20 * Math.exp(-1.5 * 0.7) * 1.15 && Math.abs(w1.Float.v.z) > 1, `the water drags: a floating block thrown at 20 studs/s goes ${w1.Float.v.z.toFixed(2)} a second later`);
  // workspace:Raycast meets the Terrain as drawn: the ground (Rock, normal up), the pool's surface (Water), the pool's
  // floor with IgnoreWater; and nothing with the Terrain filtered out.
  await run(`local function r(o, d, p) local h = workspace:Raycast(o, d, p); return h and string.format("%s %.3f %s %.2f", h.Instance.ClassName, h.Position.Y, h.Material.Name, h.Normal.Y) or "none" end
    local iw = RaycastParams.new(); iw.IgnoreWater = true
    local ex = RaycastParams.new(); ex.FilterDescendantsInstances = { workspace.Terrain }
    print("rays|" .. r(Vector3.new(30, 10, 30), Vector3.new(0, -50, 0)) .. "|" .. r(Vector3.new(4, 10, -24), Vector3.new(0, -50, 0)) .. "|" .. r(Vector3.new(4, 10, -24), Vector3.new(0, -50, 0), iw) .. "|" .. r(Vector3.new(30, 10, 30), Vector3.new(0, -50, 0), ex))`); await t.sim(1);
  const rays = (logs('rays|').split('rays|')[1] || '').split('|');
  check(rays[0] === 'Terrain 0.000 Rock 1.00' && rays[1] === 'Terrain 0.000 Water 1.00' && rays[2] === 'Terrain -12.000 Rock 1.00' && rays[3] === 'none', `workspace:Raycast hits the Terrain: the ground (${rays[0]}), the water (${rays[1]}), its floor with IgnoreWater (${rays[2]}); filtered out: ${rays[3]}`);
  // PathfindingService over the Terrain: from the spawn's side across the pool to the far bank, swum straight over
  // (its waypoints on the water's surface); with Costs.Water = math.huge, round it. The character follows the first
  // with MoveTo, through the water and out.
  await place(0, 3, 10); await t.sim(30);
  await run(`local PFS = game:GetService("PathfindingService")
    local hum = game.Players.LocalPlayer.Character.Humanoid; local root = hum.Parent.HumanoidRootPart
    local a = PFS:CreatePath(); a:ComputeAsync(root.Position, Vector3.new(0, 3, -50))
    local b = PFS:CreatePath({ Costs = { Water = math.huge } }); b:ComputeAsync(root.Position, Vector3.new(0, 3, -50))
    local function info(p) local w = p:GetWaypoints(); local len, wet, wide = 0, 0, 0
      for i = 2, #w do len += (Vector3.new(w[i].Position.X, 0, w[i].Position.Z) - Vector3.new(w[i - 1].Position.X, 0, w[i - 1].Position.Z)).Magnitude end
      for _, q in ipairs(w) do if q.Position.Z < -4 and q.Position.Z > -36 and math.abs(q.Position.X) < 19 then wet += 1; wide = math.max(wide, math.abs(q.Position.X)) end end
      return string.format("%s %.1f %d %.1f", p.Status.Name, len, wet, wide) end
    print("paths|" .. info(a) .. "|" .. info(b))
    task.spawn(function()
      for i, w in ipairs(a:GetWaypoints()) do
        if w.Action == Enum.PathWaypointAction.Jump then hum.Jump = true end
        hum:MoveTo(w.Position); if not hum.MoveToFinished:Wait() then print("swum stuck", i, string.format("%.1f %.1f", root.Position.Z, root.Position.Y)) return end
      end
      local j = 0; for _, q in ipairs(a:GetWaypoints()) do if q.Action == Enum.PathWaypointAction.Jump then j += 1 end end
      print("swum arrived", string.format("%.1f %.1f, %d jump", root.Position.Z, root.Position.Y, j))
    end)`);
  for (let i = 0; i < 80 && !logs('swum ').length; i++) await t.sim(15);
  const pa = (logs('paths|').split('paths|')[1] || '').split('|').map(x => x.split(' ')), swum = logs('swum ');
  check(pa[0][0] === 'Success' && Math.abs(+pa[0][1] - 60) < 2 && +pa[0][2] >= 6 && +pa[0][3] < 1, `a path across the pool: ${pa[0].join(' ')} (status, studs, waypoints over the water, widest)`);
  check(pa[1] && pa[1][0] === 'Success' && +pa[1][2] === 0 && +pa[1][1] > 80, `Costs.Water = math.huge: round it (${pa[1] && pa[1].join(' ')})`);
  const end = await st();
  check(/arrived/.test(swum) && near(end.z, -50, 1.5) && end.grounded && !end.swimming, `following it with MoveTo: across the water and out onto the far bank (${swum.replace(/^.*swum /, '')}; grounded ${end.grounded})`);
  if (t.shot) { await place(0, 3, -16); await t.sim(120); await t.frames(3); await t.shot('swimming'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
