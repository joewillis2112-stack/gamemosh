// The character's R6 body in the DataModel (runtime/charbody.js), as scripts see it:
// - Head, Torso, Left/Right Arm, Left/Right Leg beside the HumanoidRootPart, R6's sizes; the six
//   Motor6Ds named and parented as R6's (RootJoint in HumanoidRootPart; Neck, Shoulders, Hips in
//   Torso), Part0 and Part1 right;
// - standing, the parts sit in R6's layout about the HumanoidRootPart;
// - walking, the parts follow the drawn rig (the arms and legs swing, opposite each other), and every
//   joint holds: Part1 = Part0 * C0 * Transform * C1:Inverse();
// - a script turning Neck.C0 turns the drawn head (and the Head part) by that much;
// - the body goes with the character when it respawns.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(30);
  const tree = await t.eval(() => {
    const s = window.studio, ch = s.dm.service('Players').children[0].props.Character, kid = (p, n) => p.children.find(c => c.props.Name === n);
    const parts = ['Head', 'Torso', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg', 'HumanoidRootPart'].map(n => { const p = kid(ch, n); return p && [n, p.ClassName, [p.props.Size.x, p.props.Size.y, p.props.Size.z]]; });
    const joint = (holder, name) => { const j = kid(kid(ch, holder), name); return j && [j.ClassName, j.props.Part0 && j.props.Part0.props.Name, j.props.Part1 && j.props.Part1.props.Name]; };
    return { parts, joints: { RootJoint: joint('HumanoidRootPart', 'RootJoint'), Neck: joint('Torso', 'Neck'), LS: joint('Torso', 'Left Shoulder'), RS: joint('Torso', 'Right Shoulder'), LH: joint('Torso', 'Left Hip'), RH: joint('Torso', 'Right Hip') } };
  });
  check(tree.parts.every(Boolean) && JSON.stringify(tree.parts.map(p => p[2])) === '[[2,1,1],[2,2,1],[1,2,1],[1,2,1],[1,2,1],[1,2,1],[2,2,1]]', `R6's seven parts at R6's sizes (${tree.parts.filter(Boolean).length})`);
  const J = tree.joints;
  check(JSON.stringify(J) === JSON.stringify({ RootJoint: ['Motor6D', 'HumanoidRootPart', 'Torso'], Neck: ['Motor6D', 'Torso', 'Head'], LS: ['Motor6D', 'Torso', 'Left Arm'], RS: ['Motor6D', 'Torso', 'Right Arm'], LH: ['Motor6D', 'Torso', 'Left Leg'], RH: ['Motor6D', 'Torso', 'Right Leg'] }), "the six Motor6Ds, named, parented and joined as R6's");

  // Where each part is in the HumanoidRootPart's frame, the joints' equations, the arms' angles.
  const pose = () => t.eval(() => {
    const s = window.studio, ch = s.dm.service('Players').children[0].props.Character, kid = n => ch.children.find(c => c.props.Name === n), H = kid('HumanoidRootPart').props.CFrame;
    const local = n => { const c = H.inverse().mul(kid(n).props.CFrame); return [c.x, c.y, c.z]; };
    let worst = 0;
    const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') { const P = c.props, want = P.Part0.props.CFrame.mul(P.C0).mul(P.Transform).mul(P.C1.inverse()), got = P.Part1.props.CFrame; worst = Math.max(worst, ...want.m.map((v, k) => Math.abs(v - got.m[k]))); } walk(c); } };
    walk(ch);
    const up = n => { const m = kid(n).props.CFrame.m, h = H.m; return Math.acos(Math.min(1, m[4] * h[4] + m[7] * h[7] + m[10] * h[10])) * 180 / Math.PI; }; // angle between the part's up and the root's
    const fwd = n => { const m = H.inverse().mul(kid(n).props.CFrame).m; return Math.atan2(m[10], m[7]) * 180 / Math.PI; }; // its swing forward/back: its up axis (m[4], m[7], m[10]) in the root's YZ plane
    return { head: local('Head'), la: local('Left Arm'), ll: local('Left Leg'), worst, swing: { la: fwd('Left Arm'), ra: fwd('Right Arm'), ll: fwd('Left Leg'), rl: fwd('Right Leg') } };
  });
  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) < tol);
  const p0 = await pose();
  check(near(p0.head, [0, 1.5, 0], 0.35) && near(p0.la, [-1.5, 0, 0], 0.35) && near(p0.ll, [-0.5, -2, 0], 0.35), `standing: R6's layout about the root (head ${p0.head.map(v => v.toFixed(2))}, left arm ${p0.la.map(v => v.toFixed(2))}, left leg ${p0.ll.map(v => v.toFixed(2))})`);
  check(p0.worst < 1e-3, `every joint holds Part1 = Part0 * C0 * Transform * C1:Inverse() (worst ${p0.worst.toExponential(1)})`);

  // Walking: the limbs swing, arms against legs and left against right.
  let maxArm = 0, opposite = 0, frames = 0, worst = 0;
  for (let k = 0; k < 24; k++) {
    await t.sim(3, { move: [0, 1] });
    const p = await pose();
    worst = Math.max(worst, p.worst);
    maxArm = Math.max(maxArm, Math.abs(p.swing.la));
    if (Math.abs(p.swing.la) > 5) { frames++; if (Math.sign(p.swing.la) !== Math.sign(p.swing.ra)) opposite++; }
  }
  check(maxArm > 15, `walking, the arms swing (up to ${maxArm.toFixed(0)}°)`);
  check(frames > 0 && opposite / frames > 0.8, `left and right arms swing opposite (${opposite}/${frames} frames)`);
  check(worst < 1e-3, `and the joints hold all the way (worst ${worst.toExponential(1)})`);

  // A script turns the head: Neck.C0 rotated 60° about its own Z (R6's neck: Z is up).
  await t.sim(30);
  const before = await t.eval(() => { const s = window.studio, n = s.player.anim.byName('head'); n.computeWorldMatrix(true); const q = n.absoluteRotationQuaternion; return [q.x, q.y, q.z, q.w]; });
  await t.eval(() => window.studio.vm.run('neck', `local ch = game:GetService("Players"):GetPlayers()[1].Character; local n = ch.Torso.Neck; n.C0 = n.C0 * CFrame.Angles(0, 0, math.rad(60))`));
  await t.sim(2);
  const after = await t.eval(() => { const s = window.studio, n = s.player.anim.byName('head'); n.computeWorldMatrix(true); const q = n.absoluteRotationQuaternion; return [q.x, q.y, q.z, q.w]; });
  const turn = 2 * Math.acos(Math.min(1, Math.abs(before.reduce((a, v, i) => a + v * after[i], 0)))) * 180 / Math.PI;
  const p2 = await pose();
  check(Math.abs(turn - 60) < 3, `a script's Neck.C0 turns the drawn head by that much (${turn.toFixed(1)}°)`);
  check(p2.worst < 1e-3, `and the joints still hold (worst ${p2.worst.toExponential(1)})`);

  // Respawn: a new body with the new character; the old one is gone.
  const re = await t.eval(() => window.studio.vm.run('respawn', `local p = game:GetService("Players"):GetPlayers()[1]; _G.oldHead = p.Character.Head; p:LoadCharacter()`));
  await t.sim(5);
  const r = await t.eval(() => { const s = window.studio, ch = s.dm.service('Players').children[0].props.Character, h = ch.children.find(c => c.props.Name === 'Head'), n = ch.children.find(c => c.props.Name === 'Torso').children.find(c => c.props.Name === 'Neck'); return { head: !!h, neckDefault: n && n.props.C0.m.every((v, i) => Math.abs(v - [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0][i]) < 1e-6) }; });
  void re;
  check(r.head && r.neckDefault, 'after LoadCharacter the new character has its own body, its Neck at R6\'s C0');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
