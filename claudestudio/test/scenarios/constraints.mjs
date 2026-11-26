// Constraints (run with --place places/constraints-lab.luau; runtime/constraints.js), measured from the parts and the
// constraints' own readouts against what physics gives:
// - HingeConstraint: a motor turns at its AngularVelocity; a servo settles on its TargetAngle; limits stop a motor;
// - RopeConstraint never stretches past Length as its ball swings; the winch pulls it in to WinchTarget at
//   WinchSpeed; RodConstraint keeps its Length;
// - SpringConstraint settles where Stiffness x stretch holds the weight (FreeLength + m g / k);
// - PrismaticConstraint: a servo slides to TargetPosition; limits cap a target beyond them;
// - VectorForce of m g hovers a block; LinearVelocity holds its velocity (gravity included); AngularVelocity holds
//   its spin on the ground against friction; Torque spins a falling block up at T / I; AlignPosition takes a block
//   to its Position and holds it there (and can't with a MaxForce below its weight); AlignOrientation turns one;
// - Active: false when disabled or missing an attachment.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('cons', s), src);
  const q = () => t.eval(() => {
    const S = window.studio, ws = S.dm.workspace, f = n => ws.children.find(c => c.props.Name === n), k = (p, n) => f(p).children.find(c => c.props.Name === n);
    const P = n => { const cf = f(n).props.CFrame; return [cf.x, cf.y, cf.z]; };
    return {
      angle: k('Post', 'Hinge').props.CurrentAngle, rope: k('Beam', 'Rope').props.CurrentDistance, rod: k('Beam2', 'Rod').props.CurrentDistance, ball: P('Ball'),
      spring: k('Hook', 'Spring').props.CurrentLength, slide: k('Rail', 'Slide').props.CurrentPosition, hover: P('Hover'), runner: P('Runner'),
      runV: f('Runner').props.AssemblyLinearVelocity, spinW: f('Spinner').props.AssemblyAngularVelocity, twistW: f('Torquer').props.AssemblyAngularVelocity,
      seeker: P('Seeker'), turned: f('Turned').props.Orientation, active: k('Post', 'Hinge').props.Active, doorUp: f('Door').props.CFrame.m[7],
    };
  });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // Watching a value over n frames: its min and max.
  const watch = async (n, fn) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { await t.sim(1); const v = fn(await q()); lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };

  // The rope while its ball swings (let go 4 studs aside, 6 below... at most 6 from the beam), and the rod.
  const [, ropeMax] = await watch(60, s => s.rope);
  const s0 = await q();
  // The rod pushes back too: its ball thrown at its beam stays at its Length (a rope would let it close in).
  await run(`workspace.Bob.AssemblyLinearVelocity = (workspace.Beam2.Position - workspace.Bob.Position).Unit * 40`);
  const [rodLo, rodHi] = await watch(30, s => s.rod);
  check(ropeMax <= 6.01 && Math.abs(s0.ball[0] - 34) > 0.5, `RopeConstraint: the ball swings (x ${s0.ball[0].toFixed(2)}), never more than its Length 6 away (at most ${ropeMax.toFixed(3)})`);
  check(rodLo >= 4.99 && rodHi <= 5.01, `RodConstraint: kept at its Length 5, its ball thrown at its beam (${rodLo.toFixed(3)}..${rodHi.toFixed(3)})`);
  // Movers settled by now (1.5 s).
  const s1 = await q();
  check(Math.abs(s1.hover[1] - 10) < 0.01, `VectorForce of m g (RelativeTo World) hovers its block (y ${s1.hover[1].toFixed(4)}, from 10)`);
  check(near(s1.runV.x, 5, 0.05) && Math.abs(s1.runV.y) < 0.05 && Math.abs(s1.runner[1] - 10) < 0.02, `LinearVelocity (5, 0, 0) held, gravity included (v ${s1.runV.x.toFixed(3)}, ${s1.runV.y.toFixed(3)}; y ${s1.runner[1].toFixed(3)})`);
  check(near(s1.seeker[1], 12, 0.02) && near(s1.seeker[2], 6, 0.02), `AlignPosition (OneAttachment) takes its block to (-50, 12, 6) and holds it (${s1.seeker.map(v => v.toFixed(3))})`);
  check(near(s1.turned.y, 60, 1), `AlignOrientation turns a block to its goal's 60 degrees (${s1.turned.y.toFixed(2)})`);
  // The spring: at rest where k x holds m g (the weight 2 x 2 x 2 of Plastic: 5.6 RMU).
  await t.sim(120);
  const s2 = await q(), mg = 5.6 * 196.2, rest = 3 + mg / 400;
  check(near(s2.spring, rest, 0.02 * rest), `SpringConstraint settles at FreeLength + m g / k = ${rest.toFixed(3)} (${s2.spring.toFixed(3)})`);
  check(near(s2.spinW.y, 3, 0.06), `AngularVelocity (0, 3, 0) holds a block's spin on the ground, against friction (${s2.spinW.y.toFixed(3)})`);
  check(near(s2.slide, 4, 0.02), `PrismaticConstraint servo slides to its TargetPosition 4 (${s2.slide.toFixed(3)})`);
  // Torque: a fresh falling block spun up for half a second: T / I x t (I = m (x^2 + z^2) / 12 for 2 x 2 x 4 of Plastic).
  await run(`workspace.Torquer.CFrame = CFrame.new(-70, 120, 0); workspace.Torquer.AssemblyLinearVelocity = Vector3.zero; workspace.Torquer.AssemblyAngularVelocity = Vector3.zero`);
  await t.sim(6);
  const w0 = (await q()).twistW.y; await t.sim(30); const w1 = (await q()).twistW.y;
  const I = 11.2 * (4 + 16) / 12, alpha = (w1 - w0) / 0.5;
  check(near(alpha, 200 / I, 0.01 * 200 / I), `Torque 200 spins a falling block up at T / I = ${(200 / I).toFixed(3)} rad/s^2 (${alpha.toFixed(3)})`);

  // The hinge: a motor at 1 rad/s turns the door at 1 rad/s.
  await run(`local h = workspace.Post.Hinge; h.ActuatorType = Enum.ActuatorType.Motor; h.AngularVelocity = 1; h.MotorMaxTorque = 1e8`);
  await t.sim(15);
  const a0 = (await q()).angle; await t.sim(30); const a1 = (await q()).angle;
  const rate = (a1 - a0) * Math.PI / 180 / 0.5;
  check(near(rate, 1, 0.03) && (await q()).doorUp > 0.999, `HingeConstraint motor: turns at its AngularVelocity 1 rad/s (${rate.toFixed(3)}), the door upright on its hinge (up ${(await q()).doorUp.toFixed(4)})`);
  // A servo to -40 at 2 rad/s: there, and staying.
  await run(`local h = workspace.Post.Hinge; h.ActuatorType = Enum.ActuatorType.Servo; h.TargetAngle = -40; h.AngularSpeed = 2; h.ServoMaxTorque = 1e8`);
  await t.sim(90);
  const [sLo, sHi] = await watch(30, s => s.angle);
  check(sLo > -41 && sHi < -39, `HingeConstraint servo: settles on its TargetAngle -40 (${sLo.toFixed(2)}..${sHi.toFixed(2)})`);
  // Limits: a motor pushing past UpperAngle 30 stops there.
  await run(`local h = workspace.Post.Hinge; h.LimitsEnabled = true; h.LowerAngle = -30; h.UpperAngle = 30; h.ActuatorType = Enum.ActuatorType.Motor; h.AngularVelocity = 2`);
  await t.sim(90);
  const lim = (await q()).angle;
  check(near(lim, 30, 1), `HingeConstraint limits: a motor stops at UpperAngle 30 (${lim.toFixed(2)})`);
  // Prismatic limits: a target beyond UpperLimit 2 stops at 2.
  await run(`local p = workspace.Rail.Slide; p.UpperLimit = 2; p.TargetPosition = 8`);
  await t.sim(90);
  check(near((await q()).slide, 2, 0.02), `PrismaticConstraint limits: a target beyond UpperLimit 2 stops there (${(await q()).slide.toFixed(3)})`);
  // The winch: from 6 in to 3 at 2 studs/s.
  await run(`local r = workspace.Beam.Rope; r.WinchEnabled = true; r.WinchTarget = 3; r.WinchSpeed = 2`);
  await t.sim(30);
  const wHalf = (await q()).rope; await t.sim(90); const wEnd = (await q()).rope;
  check(wHalf < 5.2 && wHalf > 4.8 && near(wEnd, 3, 0.05), `RopeConstraint winch: in at WinchSpeed 2 (${wHalf.toFixed(2)} after 0.5 s) to WinchTarget 3 (${wEnd.toFixed(3)})`);
  // AlignPosition with a MaxForce below the block's weight can't hold it up.
  await run(`workspace.Seeker.Seek.MaxForce = 500`);
  await t.sim(60);
  check((await q()).seeker[1] < 11, `AlignPosition with MaxForce 500 (below its weight ${mg.toFixed(0)}) can't hold its block up (y ${(await q()).seeker[1].toFixed(2)})`);
  // Active.
  await run(`workspace.Post.Hinge.Enabled = false`); await t.sim(2);
  const off = (await q()).active;
  await run(`workspace.Post.Hinge.Enabled = true; workspace.Post.Hinge.Attachment1 = nil`); await t.sim(2);
  const none = (await q()).active;
  await run(`workspace.Post.Hinge.Attachment1 = workspace.Door.H1`); await t.sim(2);
  check(off === false && none === false && (await q()).active === true, `Active: false when disabled (${off}), and without Attachment1 (${none}); true again`);
  if (t.shot) { await run(`local c = workspace.CurrentCamera; c.CameraType = Enum.CameraType.Scriptable; c.CFrame = CFrame.lookAt(Vector3.new(20, 25, 60), Vector3.new(20, 8, 0))`); await t.frames(3); await t.shot('constraints'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
