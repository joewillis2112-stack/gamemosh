// PathfindingService (run with --place places/path-lab.luau): Roblox's usual script, a Path computed from the NPC to a
// goal behind a wall and up a ledge, its waypoints followed with MoveTo (Jump where a waypoint says so):
// - Status Success; waypoints are PathWaypoints (typeof, Position, Action, Label), one a Jump labelled "Jump";
//   PathWaypoint.new makes one;
// - the NPC gets round the wall and up the ledge to the goal;
// - a part dropped across the path: Blocked(index) fires and CheckOcclusionAsync says the same; removed: Unblocked;
// - a goal inside a part: FailFinishNotEmpty and no waypoints; no way up a cliff: NoPath.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('path', s), src);
  const logs = re => t.logs.filter(l => re.test(l));
  for (let i = 0; i < 60; i++) { const ok = await t.eval(() => { const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Seeker'), e = m && s.npcs.npcs.get(m); return !!(e && e.char); }); if (ok) break; await t.sim(5); }
  await t.sim(20);
  await run(`
    local PFS = game:GetService("PathfindingService")
    local npc = workspace.Seeker; local hum = npc.Humanoid
    local path = PFS:CreatePath({ AgentRadius = 2, AgentHeight = 5, AgentCanJump = true })
    _G.path = path
    task.spawn(function()
      local ok, err = pcall(function() path:ComputeAsync(npc.HumanoidRootPart.Position, workspace.Goal.Position) end)
      local wps = path:GetWaypoints()
      local jumps, labels = 0, {}
      for _, w in ipairs(wps) do if w.Action == Enum.PathWaypointAction.Jump then jumps += 1; table.insert(labels, w.Label) end end
      print("computed", ok, path.Status.Name, #wps, typeof(wps[1]), typeof(wps[1].Position), jumps, table.concat(labels, ","))
      local made = PathWaypoint.new(Vector3.new(1, 2, 3), Enum.PathWaypointAction.Jump, "Jump")
      print("made", typeof(made), made.Position.Y, made.Action.Name, made.Label)
      for i, w in ipairs(wps) do
        if w.Action == Enum.PathWaypointAction.Jump then hum.Jump = true end
        hum:MoveTo(w.Position)
        local reached = hum.MoveToFinished:Wait()
        if not reached then print("stuck at", i) break end
      end
      print("arrived", string.format("%.1f %.1f %.1f", npc.HumanoidRootPart.Position.X, npc.HumanoidRootPart.Position.Y, npc.HumanoidRootPart.Position.Z))
    end)`);
  for (let i = 0; i < 80 && !logs(/\[luau\] (arrived|stuck)/).length; i++) await t.sim(15);
  const comp = (logs(/\[luau\] computed/)[0] || '').replace(/^.*computed /, '').split(' ');
  check(comp[0] === 'true' && comp[1] === 'Success' && +comp[2] > 5 && comp[3] === 'PathWaypoint' && comp[4] === 'Vector3' && +comp[5] >= 1 && /Jump/.test(comp[6] || ''), `ComputeAsync: ${comp[1]}, ${comp[2]} PathWaypoints, ${comp[5]} Jump labelled "${comp[6]}"`);
  const made = (logs(/\[luau\] made/)[0] || '').replace(/^.*made /, '');
  check(made === 'PathWaypoint 2 Jump Jump', `PathWaypoint.new (${made})`);
  const arr = (logs(/\[luau\] arrived/)[0] || '').replace(/^.*arrived /, '').split(' ').map(Number), stuck = logs(/\[luau\] stuck/);
  check(!stuck.length && arr.length === 3 && Math.hypot(arr[0] - 36, arr[2]) < 1.5 && arr[1] > 5, `following the waypoints, the NPC gets round the wall and up the ledge to the goal (${stuck[0] || arr.map(v => v.toFixed(1)).join(', ')})`);
  // Blocked: a part across the path's first stretch (behind the NPC now: Roblox says that counts too).
  t.logs.length = 0;
  await run(`_G.path.Blocked:Connect(function(i) print("blocked", i) end); _G.path.Unblocked:Connect(function(i) print("unblocked", i) end)
    local w = _G.path:GetWaypoints()[3].Position
    local b = Instance.new("Part"); b.Name = "Rubble"; b.Anchored = true; b.Size = Vector3.new(8, 6, 8); b.CFrame = CFrame.new(w + Vector3.new(0, 3, 0)); b.Parent = workspace
    task.spawn(function() print("occluded", _G.path:CheckOcclusionAsync(1)) end)`);
  await t.sim(45);
  const bl = logs(/\[luau\] blocked/), oc = logs(/\[luau\] occluded/);
  const bi = bl.length ? +bl[0].split(' ').pop() : NaN, oi = oc.length ? +oc[0].split(' ').pop() : NaN;
  check(bl.length === 1 && bi > 1 && bi <= 4 && oi === bi, `a part dropped on the path: Blocked(${bi}) fires once, CheckOcclusionAsync(1) says ${oi}`);
  await run(`workspace.Rubble:Destroy()`);
  await t.sim(45);
  const ub = logs(/\[luau\] unblocked/);
  check(ub.length === 1, `removed: Unblocked (${ub[0] && ub[0].replace(/^.*\[luau\] /, '')})`);
  // A goal inside a part, and no way up.
  t.logs.length = 0;
  await run(`task.spawn(function()
      local PFS = game:GetService("PathfindingService")
      local p1 = PFS:CreatePath(); p1:ComputeAsync(Vector3.new(-6, 3, 0), workspace.Wall.Position)
      local c = Instance.new("Part"); c.Name = "Cliff"; c.Anchored = true; c.Size = Vector3.new(20, 12, 20); c.CFrame = CFrame.new(-40, 6, -40); c.Parent = workspace
      local p2 = PFS:CreatePath({ AgentCanJump = true }); p2:ComputeAsync(Vector3.new(-6, 3, 0), Vector3.new(-40, 13, -40))
      local p3 = PFS:FindPathAsync(Vector3.new(-6, 3, 0), Vector3.new(-20, 3, 20))
      print("fails", p1.Status.Name, #p1:GetWaypoints(), p2.Status.Name, p3.Status.Name, #p3:GetWaypoints() > 1)
    end)`);
  await t.sim(10);
  const fl = (logs(/\[luau\] fails/)[0] || '').replace(/^.*fails /, '');
  check(fl === 'FailFinishNotEmpty 0 NoPath Success true', `a goal inside the wall: FailFinishNotEmpty, no waypoints; up a 12-stud cliff: NoPath; FindPathAsync on open ground: Success (${fl})`);
  if (t.shot) { await t.eval(() => { const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Seeker'), p = s.npcs.npcs.get(m).char.holder.position; s.camera.focus = [p.x - 4, p.y + 2, p.z]; s.camera.yaw = 2.2; s.camera.zoom = 34; s.camera.pitch = 0.45; }); await t.frames(20); await t.shot('pathfinding'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
