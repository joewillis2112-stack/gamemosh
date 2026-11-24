// Walking humanoids (run with --place places/npc-lab.luau): runtime/npcs.js and runtime/walk.js.
// - An NPC from CreateHumanoidModelFromDescriptionAsync stands as a character: R15's parts and Motor6Ds on
//   its body, its feet on the ground, idle;
// - MoveTo walks it there (the walk clip playing, at about WalkSpeed) and MoveToFinished(true) fires within
//   a stud of the goal; MoveTo with a part follows the part when it moves;
// - stuck behind a wall, MoveToFinished(false) fires after 8 s and it stops;
// - Move walks it in a direction until Move(0); Jump lifts it; a teleport (the root's CFrame) ends a MoveTo;
// - WalkSpeed 32 walks twice as fast; Health 0: Died, it stops;
// - the player's own MoveTo walks the player while no key is held.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('npc', s), src);
  const logs = re => t.logs.filter(l => re.test(l));
  for (let i = 0; i < 60; i++) { const ok = await t.eval(() => { const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Walker'), e = m && s.npcs.npcs.get(m); return !!(e && e.char); }); if (ok) break; await t.sim(5); }
  await t.sim(30);
  const st = () => t.eval(() => {
    const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Walker'), e = s.npcs.npcs.get(m), ch = e.char, root = m.children.find(c => c.props.Name === 'HumanoidRootPart').props.CFrame;
    const parts = m.children.filter(c => c.ClassName === 'Part').length, motors = []; const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') motors.push(c.props.Name); walk(c); } }; walk(m);
    const lay = ch.anim.layers.slice().sort((a, b) => b.weight - a.weight)[0];
    return { foot: [ch.holder.position.x, ch.holder.position.y, ch.holder.position.z], root: [root.x, root.y, root.z], rootH: ch.rootHeight, parts, motors: motors.length, clip: lay ? lay.clip : null, state: ch.state, grounded: ch.grounded };
  });
  let s = await st();
  check(s.parts === 16 && s.motors === 15 && Math.abs(s.foot[1]) < 0.05 && Math.abs(s.root[1] - s.foot[1] - s.rootH) < 1e-3 && s.clip === 'idle', `the NPC stands as a character: R15's ${s.parts} parts and ${s.motors} Motor6Ds, feet on the ground (${s.foot[1].toFixed(3)}), idle`);
  // MoveTo 24 studs ahead.
  await run(`local h = workspace.Walker.Humanoid; h.MoveToFinished:Connect(function(r) print("finished", r, string.format("%.2f", time())) end); _G.t0 = time(); print("t0", string.format("%.2f", time())); h:MoveTo(Vector3.new(0, 0, -24))`);
  await t.sim(30);
  s = await st();
  const mid = s;
  for (let i = 0; i < 40 && !logs(/\[luau\] finished/).length; i++) await t.sim(10);
  s = await st();
  const fin = logs(/\[luau\] finished/), t0 = +(logs(/\[luau\] t0/)[0] || '').split(' ').pop(), tf = fin.length ? +fin[0].split(' ').pop() : NaN;
  check(mid.state === 'walk' && ['walk', 'sprint'].includes(mid.clip) && fin.length && /finished true/.test(fin[0]) && Math.hypot(s.foot[0], s.foot[2] + 24) < 1.05, `MoveTo walks it there, walking (its clip ${mid.clip}: at 16 studs/s R15 blends to Roblox's run), and MoveToFinished(true) fires within a stud (${fin[0] && fin[0].replace(/^.*finished /, '')}; ${Math.hypot(s.foot[0], s.foot[2] + 24).toFixed(2)} studs off)`);
  const speed = 23 / (tf - t0);
  check(speed > 12 && speed < 17, `at about WalkSpeed 16 (${speed.toFixed(1)} studs/s over the walk)`);
  await t.sim(20); s = await st();
  check(s.clip === 'idle', `arrived, it stands idle (${s.clip})`);
  if (t.shot) { await t.eval(() => { const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Walker'), p = s.npcs.npcs.get(m).char.holder.position; s.camera.focus = [p.x, p.y + 2.5, p.z]; s.camera.yaw = 0; s.camera.zoom = 10; s.camera.pitch = 0.2; }); await t.frames(20); await t.shot('npcs'); await t.eval(() => { window.studio.camera.focus = null; }); }
  // MoveTo with a part: the pad moves; the goal follows it.
  t.logs.length = 0;
  await run(`workspace.Walker.Humanoid:MoveTo(workspace.Pad.Position, workspace.Pad)`);
  await t.sim(20);
  await run(`workspace.Pad.CFrame = CFrame.new(30, 0.2, -20)`);
  for (let i = 0; i < 40 && !logs(/\[luau\] finished/).length; i++) await t.sim(10);
  s = await st();
  check(logs(/\[luau\] finished true/).length && Math.hypot(s.foot[0] - 30, s.foot[2] + 20) < 1.05, `MoveTo with a part follows it when it moves (${Math.hypot(s.foot[0] - 30, s.foot[2] + 20).toFixed(2)} studs from the pad's new place)`);
  // Stuck behind the wall: false after 8 s, then it stops.
  t.logs.length = 0;
  await run(`workspace.Walker:PivotTo(CFrame.new(0, workspace.Walker.HumanoidRootPart.Position.Y, 50)); workspace.Walker.Humanoid:MoveTo(Vector3.new(0, 0, 75))`);
  await t.sim(60 * 7);
  const early = logs(/\[luau\] finished/).length;
  await t.sim(60 * 1.5);
  const stuck = logs(/\[luau\] finished/);
  const s1 = await st(); await t.sim(30); const s2 = await st();
  check(early === 0 && stuck.length === 1 && /finished false/.test(stuck[0]) && Math.hypot(s2.foot[0] - s1.foot[0], s2.foot[2] - s1.foot[2]) < 0.05 && s1.foot[2] < 59, `stuck behind a wall: MoveToFinished(false) after 8 s (none at 7 s), and it stops (${stuck.map(l => l.replace(/^.*finished /, '')).join()})`);
  // Move walks in a direction until Move(0).
  await run(`workspace.Walker.Humanoid:Move(Vector3.new(1, 0, 0))`);
  const m0 = await st(); await t.sim(60); const m1 = await st();
  await run(`workspace.Walker.Humanoid:Move(Vector3.new(0, 0, 0))`);
  await t.sim(30); const m2 = await st(); await t.sim(30); const m3 = await st();
  check(m1.foot[0] - m0.foot[0] > 12 && Math.abs(m1.foot[2] - m0.foot[2]) < 0.5 && Math.abs(m3.foot[0] - m2.foot[0]) < 0.05, `Move walks it along +X (${(m1.foot[0] - m0.foot[0]).toFixed(1)} studs in 1 s) until Move(0) stops it`);
  // Jump.
  await run(`workspace.Walker.Humanoid.Jump = true`);
  await t.sim(12); const j = await st();
  check(j.foot[1] - m3.foot[1] > 3, `Jump lifts it (${(j.foot[1] - m3.foot[1]).toFixed(2)} studs up after 0.2 s)`);
  await t.sim(90);
  // A teleport ends a MoveTo (false).
  t.logs.length = 0;
  await run(`workspace.Walker.Humanoid:MoveTo(Vector3.new(-20, 0, 0)); task.wait(0.2); workspace.Walker.HumanoidRootPart.CFrame = CFrame.new(10, 4, 10)`);
  await t.sim(30);
  const tp = await st();
  check(logs(/\[luau\] finished false/).length === 1 && Math.hypot(tp.foot[0] - 10, tp.foot[2] - 10) < 0.5, `setting the root's CFrame teleports it and ends its MoveTo (${logs(/\[luau\] finished/).map(l => l.replace(/^.*finished /, '')).join()})`);
  // WalkSpeed 32.
  await run(`workspace.Walker.Humanoid.WalkSpeed = 32; workspace.Walker.Humanoid:Move(Vector3.new(0, 0, 1))`);
  await t.sim(30); const w0 = await st(); await t.sim(60); const w1 = await st();
  await run(`workspace.Walker.Humanoid:Move(Vector3.new(0, 0, 0)); workspace.Walker.Humanoid.WalkSpeed = 16`);
  check(w1.foot[2] - w0.foot[2] > 29 && w1.foot[2] - w0.foot[2] < 33, `WalkSpeed 32 walks 32 studs a second (${(w1.foot[2] - w0.foot[2]).toFixed(1)})`);
  await t.sim(30);
  // Health 0: Died, it stops.
  t.logs.length = 0;
  await run(`local h = workspace.Walker.Humanoid; h.Died:Connect(function() print("died") end); h:Move(Vector3.new(1, 0, 0)); task.wait(0.2); h.Health = 0`);
  await t.sim(30); const d0 = await st(); await t.sim(60); const d1 = await st();
  check(logs(/\[luau\] died/).length === 1 && Math.hypot(d1.foot[0] - d0.foot[0], d1.foot[2] - d0.foot[2]) < 0.1, `Health 0: Died fires and it stops (${Math.hypot(d1.foot[0] - d0.foot[0], d1.foot[2] - d0.foot[2]).toFixed(3)} studs in 1 s)`);
  // The player's MoveTo (no key held).
  t.logs.length = 0;
  const p0 = await t.eval(() => { const p = window.studio.player.holder.position; return [p.x, p.z]; });
  await run(`local h = game.Players.LocalPlayer.Character.Humanoid; h.MoveToFinished:Connect(function(r) print("pfinished", r) end); h:MoveTo(Vector3.new(${p0[0] + 10}, 0, ${p0[1]}))`);
  for (let i = 0; i < 30 && !logs(/\[luau\] pfinished/).length; i++) await t.sim(10);
  const p1 = await t.eval(() => { const p = window.studio.player.holder.position; return [p.x, p.z]; });
  check(logs(/\[luau\] pfinished true/).length && Math.hypot(p1[0] - p0[0] - 10, p1[1] - p0[1]) < 1.05, `the player's own MoveTo walks the player there while no key is held (${(p1[0] - p0[0]).toFixed(2)} studs)`);
  if (fail.length) throw new Error(fail.length + ' failed');
}
