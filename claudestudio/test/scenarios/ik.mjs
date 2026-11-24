// IKControl (runtime/ik.js) on the player's R15 body (run with --place places/ik-lab.luau):
// - Position on an arm reaches the target exactly, the elbow bending back (Roblox's "Arm" default), or
//   towards a Pole; out of reach, the arm points straight at it; Weight 0.5 goes half way;
// - SmoothTime eases a jump of the target (part way after a frame, there after half a second);
// - Transform puts the hand's whole frame on the target's; LookAt turns the head to face its target;
// - a leg's knee bends forward; the higher Priority wins on a shared chain;
// - the methods (chain count, length, node frames, final targets) read the solve; every part stays on its
//   drawn node and every joint holds (Part1 = Part0 * C0 * Transform * C1:Inverse()).
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  for (let i = 0; i < 60 && !t.logs.some(l => l.includes('[luau] ik ready')); i++) await t.sim(5);
  await t.sim(20);
  const run = src => t.eval(s => window.studio.vm.run('ik', s), src);
  const set = (name, props) => run(`local h = game.Players.LocalPlayer.Character.Humanoid; local c = h:FindFirstChild("${name}"); ${props}`);
  const only = name => run(`for _, c in ipairs(game.Players.LocalPlayer.Character.Humanoid:GetChildren()) do if c:IsA("IKControl") then c.Enabled = (c.Name == "${name}") end end`);
  const moveTarget = (n, p) => run(`workspace.${n}.CFrame = CFrame.new(${p.join(',')})`);
  const st = () => t.eval(() => {
    const s = window.studio, ch = s.dm.service('Players').children[0].props.Character, kid = n => ch.children.find(c => c.props.Name === n);
    const P = n => { const c = kid(n).props.CFrame; return [c.x, c.y, c.z]; }, M = n => kid(n).props.CFrame.m.slice(3);
    let worst = 0, off = 0;
    const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') { const Q = c.props, w = Q.Part0.props.CFrame.mul(Q.C0).mul(Q.Transform).mul(Q.C1.inverse()), g = Q.Part1.props.CFrame; worst = Math.max(worst, ...w.m.map((v, k) => Math.abs(v - g.m[k]))); } walk(c); } }; walk(ch);
    for (const [name, part] of s.player.rig) { if (name === 'HumanoidRootPart') continue; const p = kid(name).props.CFrame, q = part.node.getAbsolutePosition(); off = Math.max(off, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)); }
    const ws = n => { const c = s.dm.workspace.children.find(x => x.props.Name === n).props.CFrame; return { p: [c.x, c.y, c.z], m: c.m.slice(3) }; };
    const jp = (part, joint) => { const pr = kid(part), j = pr.children.find(c => c.props.Name === joint), c = pr.props.CFrame.mul(j.props.C1); return [c.x, c.y, c.z]; };
    const head = kid('Head').props.CFrame, look = [-head.m[5], -head.m[8], -head.m[11]];
    return { hand: P('RightHand'), handM: M('RightHand'), foot: P('LeftFoot'), head: P('Head'), look, torsoLook: (() => { const u = kid('UpperTorso').props.CFrame; return [-u.m[5], -u.m[8], -u.m[11]]; })(),
      shoulder: jp('RightUpperArm', 'RightShoulder'), elbow: jp('RightLowerArm', 'RightElbow'), wrist: jp('RightHand', 'RightWrist'), hip: jp('LeftUpperLeg', 'LeftHip'), knee: jp('LeftLowerLeg', 'LeftKnee'),
      ht: ws('HandTarget'), lt: ws('LookTarget'), pole: ws('PoleTarget').p, worst, off };
  });
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const holds = (s, what) => check(s.worst < 1e-3 && s.off < 1e-3, `${what}: parts on their drawn nodes, joints holding (worst ${s.worst.toExponential(1)}, ${s.off.toExponential(1)})`);
  // The target in reach: in front of the right shoulder, a little below.
  let s = await st();
  const T = [s.shoulder[0] + 0.3, s.shoulder[1] - 0.6, s.shoulder[2] - 1.6];
  await moveTarget('HandTarget', T);
  await only('Reach'); await t.sim(3);
  s = await st();
  // Which side is the elbow on, from the line shoulder -> hand, along the torso's facing?
  const bendAlong = (s, dir) => { const mid = s.shoulder.map((v, k) => (v + s.hand[k]) / 2); return dot(sub(s.elbow, mid), dir); };
  check(d(s.hand, T) < 1e-3, `Position: the right hand reaches the target (${d(s.hand, T).toExponential(1)} studs off)`);
  check(bendAlong(s, s.torsoLook) < -0.05 && bendAlong(s, [0, 1, 0]) < -0.05, `without a Pole the elbow bends down and back, a natural Arm (${bendAlong(s, s.torsoLook).toFixed(2)} along the facing, ${bendAlong(s, [0, 1, 0]).toFixed(2)} up)`);
  holds(s, 'Position');
  // Straight below the shoulder (the facing now across the reach): the elbow goes back, not forward.
  const below = [s.shoulder[0], s.shoulder[1] - 0.7 * (d(s.shoulder, s.elbow) + d(s.elbow, s.hand)), s.shoulder[2]];
  await moveTarget('HandTarget', below); await t.sim(2);
  const sb = await st();
  check(d(sb.hand, below) < 1e-3 && bendAlong(sb, sb.torsoLook) < -0.1, `a target straight below: the elbow bends back (${bendAlong(sb, sb.torsoLook).toFixed(2)} along the facing)`);
  await moveTarget('HandTarget', T); await t.sim(2);
  await run(`local c = game.Players.LocalPlayer.Character.Humanoid.Reach; local w = c:GetNodeWorldCFrame(3).Position; local h = game.Players.LocalPlayer.Character.RightHand.Position; print("ikm", c:GetChainCount(), string.format("%.4f", c:GetChainLength()), string.format("%.5f", (w - h).Magnitude), string.format("%.5f", (c:GetRawFinalTarget().Position - workspace.HandTarget.Position).Magnitude))`);
  await t.sim(1);
  const ml = t.logs.filter(l => l.includes('[luau] ikm')).pop() || '';
  const [, cnt, clen, nodeOff, rawOff] = ml.replace(/^.*ikm\s+/, 'x ').split(/\s+/);
  check(cnt === '2' && +clen > 1 && +nodeOff < 1e-3 && +rawOff < 1e-3, `methods: GetChainCount ${cnt}, GetChainLength ${clen}, GetNodeWorldCFrame(3) is the hand (${nodeOff}), GetRawFinalTarget the target (${rawOff})`);
  // A Pole above: the elbow bends up instead.
  await set('Reach', 'c.Pole = workspace.PoleTarget'); await t.sim(2);
  s = await st();
  check(d(s.hand, T) < 1e-3 && bendAlong(s, [0, 1, 0]) > 0.05, `with a Pole above, the elbow bends up towards it (${bendAlong(s, [0, 1, 0]).toFixed(2)}), the hand still on the target`);
  await set('Reach', 'c.Pole = nil');
  // Out of reach: the arm straight, pointing at it.
  const far = [s.shoulder[0] + 2, s.shoulder[1] + 1, s.shoulder[2] - 8];
  await moveTarget('HandTarget', far); await t.sim(2);
  s = await st();
  const dir = sub(far, s.shoulder), straight = d(s.shoulder, s.elbow) + d(s.elbow, s.wrist) - d(s.shoulder, s.wrist), aim = dot(sub(s.wrist, s.shoulder), dir) / (d(s.wrist, s.shoulder) * Math.hypot(...dir));
  check(straight < 1e-3 && aim > 0.9999, `out of reach the arm is straight (${straight.toExponential(1)}) and points at the target (cos ${aim.toFixed(6)})`);
  // Weight 0.5: half way from the animated hand to the target.
  await moveTarget('HandTarget', T); await only('none'); await t.sim(2);
  const free = (await st()).hand;
  await set('Reach', 'c.Weight = 0.5; c.Enabled = true'); await t.sim(1);
  s = await st();
  const halfway = free.map((v, k) => (v + T[k]) / 2);
  check(d(s.hand, halfway) < 0.05, `Weight 0.5 takes the hand half way (${d(s.hand, halfway).toFixed(3)} studs from the midpoint)`);
  await set('Reach', 'c.Weight = 1');
  // SmoothTime: the target jumps; the hand follows, part way after a frame, there within half a second.
  await set('Reach', 'c.SmoothTime = 0.1'); await t.sim(30);
  const T2 = [T[0] - 0.8, T[1] + 0.9, T[2] + 0.4];
  await moveTarget('HandTarget', T2); await t.sim(1);
  const s1 = await st(); await t.sim(30); const s2 = await st();
  check(d(s1.hand, T2) > 0.2 && d(s1.hand, T2) < d(T, T2) - 0.02 && d(s2.hand, T2) < 0.01, `SmoothTime 0.1: after a frame the hand is part way (${d(s1.hand, T2).toFixed(3)} of ${d(T, T2).toFixed(3)} studs to go), after half a second there (${d(s2.hand, T2).toFixed(4)})`);
  await set('Reach', 'c.SmoothTime = 0');
  // Transform: the hand's whole frame on the target's (turned 40 degrees).
  await run(`workspace.HandTarget.CFrame = CFrame.new(${T.join(',')}) * CFrame.Angles(math.rad(40), math.rad(-25), 0)`);
  await only('Grip'); await t.sim(2);
  s = await st();
  const rotErr = Math.max(...s.handM.map((v, k) => Math.abs(v - s.ht.m[k])));
  check(d(s.hand, s.ht.p) < 1e-3 && rotErr < 1e-3, `Transform: the hand's position and rotation are the target's (${d(s.hand, s.ht.p).toExponential(1)} studs, ${rotErr.toExponential(1)})`);
  holds(s, 'Transform');
  // LookAt: the head faces its target.
  await only('Look'); await t.sim(2);
  s = await st();
  const to = sub(s.lt.p, s.head), cosL = dot(s.look, to) / (Math.hypot(...s.look) * Math.hypot(...to));
  check(cosL > 0.9998, `LookAt: the head looks at its target (${(Math.acos(Math.min(1, cosL)) * 180 / Math.PI).toFixed(2)} degrees off)`);
  // A leg: the knee bends forward.
  const F = [s.hip[0], s.hip[1] - 1.4, s.hip[2] - 1.0];
  await moveTarget('HandTarget', F); await only('Step'); await t.sim(2);
  s = await st();
  const kmid = s.hip.map((v, k) => (v + s.foot[k]) / 2);
  check(d(s.foot, F) < 1e-3 && dot(sub(s.knee, kmid), s.torsoLook) > 0.05, `a leg: the foot reaches its target and the knee bends forward (${dot(sub(s.knee, kmid), s.torsoLook).toFixed(2)})`);
  // Priority: Reach and Grip on the same arm, different targets; the higher priority solves last and wins.
  await moveTarget('HandTarget', T);
  await run(`local h = game.Players.LocalPlayer.Character.Humanoid; for _, c in ipairs(h:GetChildren()) do if c:IsA("IKControl") then c.Enabled = false end end
    h.Reach.Enabled = true; h.Reach.Target = workspace.LookTarget; h.Reach.Priority = 1; h.Grip.Enabled = true; h.Grip.Priority = 0`);
  await t.sim(2);
  const sA = await st();
  await run(`local h = game.Players.LocalPlayer.Character.Humanoid; h.Reach.Priority = 0; h.Grip.Priority = 1`);
  await t.sim(2);
  const sB = await st();
  check(d(sA.hand, sA.ht.p) > 0.5 && d(sB.hand, sB.ht.p) < 1e-3, `Priority: the higher one wins (Reach on top: ${d(sA.hand, sA.ht.p).toFixed(2)} studs from Grip's target; Grip on top: ${d(sB.hand, sB.ht.p).toExponential(1)})`);
  holds(sB, 'two controls');
  if (t.shot) { await t.eval(() => { const s = window.studio; s.camera.yaw = 0.6; s.camera.pitch = 10 * Math.PI / 180; s.camera.zoom = 12; }); await t.frames(20); await t.shot('ik'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
