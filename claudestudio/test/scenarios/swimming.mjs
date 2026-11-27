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
  await run(`workspace.Float.AssemblyLinearVelocity = Vector3.new(20, 0, 0)`); await t.sim(60);
  const w1 = await bl();
  check(Math.abs(w1.Float.v.x) < 20 * Math.exp(-1.5 * 0.7) * 1.15 && Math.abs(w1.Float.v.x) > 1, `the water drags: a floating block thrown at 20 studs/s goes ${w1.Float.v.x.toFixed(2)} a second later`);
  if (t.shot) { await place(0, 3, -16); await t.sim(120); await t.frames(3); await t.shot('swimming'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
