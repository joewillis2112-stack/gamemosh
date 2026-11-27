// TrussParts and climbing (run with --place places/truss-lab.luau; runtime/character.js, runtime/world.js):
// - a TrussPart is 2 x 2 x n (n a multiple of 2): a script's Size rounds to it;
// - walking into one climbs it at 70% of WalkSpeed (Humanoid.Climbing fires that speed); no input holds still;
//   input away from it climbs down; at the top the character comes off onto it; a jump pushes off it;
// - a plain wall isn't climbed; a faster WalkSpeed climbs faster.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('truss', s), src);
  const st = () => t.eval(() => { const c = window.studio.player; return { foot: c.footY, z: c.holder.position.z, climbing: !!c.climbing, grounded: c.grounded }; });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const logs = tag => t.logs.filter(l => l.includes(`[luau] ${tag}`)).pop() || '';
  // (The camera's heading reset each time: 'forward' is toward -Z, the truss.)
  const place = async (x, z) => { await run(`game.Players.LocalPlayer.Character.HumanoidRootPart.CFrame = CFrame.new(${x}, 3, ${z})`); await t.eval(() => { const c = window.studio.camera; c.yaw = 0; c.lastCamPos = null; }); await t.sim(20); }; // (and not swung back by the touch camera's follow)
  await t.sim(30);

  // Sizes.
  await run(`local a = Instance.new("TrussPart"); local d = a.Size; a.Size = Vector3.new(3, 9, 1); local b = a.Size; a.Size = Vector3.new(11, 2, 2); local c = a.Size; a.Size = Vector3.new(2, 6.8, 2)
    print("sizes", d.X, d.Y, d.Z, b.X, b.Y, b.Z, c.X, c.Y, c.Z, a.Size.X, a.Size.Y, a.Size.Z)`); await t.sim(1);
  check(logs('sizes').endsWith('2 2 2 2 10 2 12 2 2 2 6 2'), `TrussPart sizes: new 2 x 2 x 2; (3, 9, 1) becomes 2 x 10 x 2; (11, 2, 2) 12 x 2 x 2; (2, 6.8, 2) 2 x 6 x 2 (${logs('sizes').replace(/^.*sizes /, '')})`);

  // Up the tower (2 x 20 x 2 at z = -10): walk into it, climb.
  await place(0, -6);
  await t.sim(20, { move: [0, 1] });
  const a0 = await st(); await t.sim(30, { move: [0, 1] }); const a1 = await st();
  const up = (a1.foot - a0.foot) / 0.5;
  await run(`print("climbs", table.concat(_G.climbs, " "))`); await t.sim(1);
  const speeds = logs('climbs').replace(/^.*climbs /, '').split(' ').map(Number);
  check(a0.climbing && a1.climbing && near(up, 11.2, 0.15), `walking into a truss climbs it at 70% of WalkSpeed 16: ${up.toFixed(2)} studs/s`);
  check(speeds.some(v => near(v, 11.2, 0.01)), `Humanoid.Climbing fires with that speed (${speeds.map(v => v.toFixed(1)).join(', ')})`);
  // Held still, then down.
  await t.sim(30); const h1 = await st();
  check(h1.climbing && near(h1.foot, a1.foot, 0.05), `no input: holds still on it (${a1.foot.toFixed(2)} -> ${h1.foot.toFixed(2)})`);
  await t.sim(30, { move: [0, -1] }); const d1 = await st();
  check(d1.climbing && near((h1.foot - d1.foot) / 0.5, 11.2, 0.15), `input away from it climbs down at 11.2 (${((h1.foot - d1.foot) / 0.5).toFixed(2)} studs/s)`);
  // To the top: off onto it, standing.
  for (let i = 0; i < 60 && (await st()).climbing; i++) await t.sim(5, { move: [0, 1] });
  await t.sim(10, { move: [0, 1] }); await t.sim(20);
  const top = await st();
  check(!top.climbing && top.grounded && near(top.foot, 20, 0.05), `at the top: comes off onto it, standing at 20 (${top.foot.toFixed(3)}, z ${top.z.toFixed(2)})`);

  // A jump pushes off.
  await place(0, -6);
  await t.sim(40, { move: [0, 1] });
  const j0 = await st();
  await t.sim(1, { jump: true }); await t.sim(20);
  const j1 = await st();
  await run(`print("climbs", table.concat(_G.climbs, " "))`); await t.sim(1);
  const last = Number(logs('climbs').split(' ').pop());
  check(j0.climbing && !j1.climbing && j1.z > j0.z + 1 && last === 0, `a jump pushes off it (z ${j0.z.toFixed(2)} -> ${j1.z.toFixed(2)}); Climbing fires 0 (${last})`);

  // A plain wall isn't climbed.
  await place(30, -6);
  await t.sim(40, { move: [0, 1] });
  const w = await st();
  check(!w.climbing && w.grounded && w.foot < 0.1, `walking into a plain wall doesn't climb it (foot ${w.foot.toFixed(2)})`);

  // WalkSpeed 32: 22.4.
  await run(`game.Players.LocalPlayer.Character.Humanoid.WalkSpeed = 32`);
  await place(0, -6);
  await t.sim(20, { move: [0, 1] });
  const f0 = await st(); await t.sim(15, { move: [0, 1] }); const f1 = await st();
  check(f1.climbing && near((f1.foot - f0.foot) / 0.25, 22.4, 0.3), `WalkSpeed 32 climbs at 22.4 (${((f1.foot - f0.foot) / 0.25).toFixed(2)})`);
  await run(`game.Players.LocalPlayer.Character.Humanoid.WalkSpeed = 16`);

  if (t.shot) { await run(`local c = workspace.CurrentCamera; c.CameraType = Enum.CameraType.Scriptable; c.CFrame = CFrame.lookAt(Vector3.new(4, 9, 6), Vector3.new(2, 7, -10))`); await t.sim(2); await t.frames(3); await t.golden('truss'); }
  // PathfindingService with AgentCanClimb: from the spawn to the platform at the tower's top, its waypoints followed
  // with MoveTo (Roblox's usual script): up the truss (waypoints labelled Climb) and onto the platform.
  await run(`workspace.CurrentCamera.CameraType = Enum.CameraType.Custom`); await place(0, 12);
  await run(`local PFS = game:GetService("PathfindingService")
    local hum = game.Players.LocalPlayer.Character.Humanoid; local root = hum.Parent.HumanoidRootPart
    local p = PFS:CreatePath({ AgentCanClimb = true }); p:ComputeAsync(root.Position, Vector3.new(0, 23, -16))
    local w = p:GetWaypoints(); local climbs = 0
    for _, q in ipairs(w) do if q.Label == "Climb" then climbs += 1 end end
    print("trusspath", p.Status.Name, #w, climbs)
    task.spawn(function()
      for i, q in ipairs(w) do
        if q.Action == Enum.PathWaypointAction.Jump then hum.Jump = true end
        hum:MoveTo(q.Position); if not hum.MoveToFinished:Wait() then print("trussfollow stuck", i, string.format("%.1f %.1f %.1f", root.Position.X, root.Position.Y, root.Position.Z)) return end
      end
      print("trussfollow arrived")
    end)`);
  for (let i = 0; i < 60 && !logs('trussfollow').length; i++) await t.sim(15);
  const tp = logs('trusspath').replace(/^.*trusspath /, '').split(' '), tf = logs('trussfollow'), onTop = await st();
  check(tp[0] === 'Success' && +tp[2] >= 4, `a path up the truss (AgentCanClimb): ${tp[0]}, ${tp[1]} waypoints, ${tp[2]} labelled Climb`);
  check(/arrived/.test(tf) && onTop.grounded && near(onTop.foot, 20, 0.1) && onTop.z < -11, `following it with MoveTo: up the truss and onto the platform (${tf.replace(/^.*trussfollow /, '')}; feet ${onTop.foot.toFixed(2)}, z ${onTop.z.toFixed(2)})`);

  if (fail.length) throw new Error(fail.length + ' failed');
}
