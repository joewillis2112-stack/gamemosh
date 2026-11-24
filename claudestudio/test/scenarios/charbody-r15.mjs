// An R15 character (run with --character assets/characters/r15/studio.glb, or --body <preset>: a generated body:
// runtime/bodygen.js; Roblox's own R15 clips: runtime/r15clips.js), as scripts see it:
// - Humanoid.RigType is R15; R15's 15 parts beside the HumanoidRootPart, each Motor6D in its Part1,
//   named and joined as R15's (Root, Waist, Neck, Shoulders, Elbows, Wrists, Hips, Knees, Ankles);
// - each part is where its drawn part is, and every joint holds Part1 = Part0 * C0 * Transform *
//   C1:Inverse(), standing and walking;
// - walking, the knees and elbows bend (Roblox's walk), the arms swing opposite each other;
// - a script's Neck.C0 turns the drawn head by that much.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(30);
  const tree = await t.eval(() => {
    const s = window.studio, ch = s.dm.service('Players').children[0].props.Character, hum = ch.children.find(c => c.ClassName === 'Humanoid');
    const parts = ch.children.filter(c => c.ClassName === 'Part').map(c => c.props.Name).sort();
    const joints = []; const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') joints.push([c.props.Name, c.parent.props.Name, c.props.Part0 && c.props.Part0.props.Name, c.props.Part1 && c.props.Part1.props.Name]); walk(c); } }; walk(ch);
    return { rig: hum.props.RigType, parts, joints: joints.sort() };
  });
  check(tree.rig === 'R15', `Humanoid.RigType is R15 (${tree.rig})`);
  const want = ['Head', 'HumanoidRootPart', 'LeftFoot', 'LeftHand', 'LeftLowerArm', 'LeftLowerLeg', 'LeftUpperArm', 'LeftUpperLeg', 'LowerTorso', 'RightFoot', 'RightHand', 'RightLowerArm', 'RightLowerLeg', 'RightUpperArm', 'RightUpperLeg', 'UpperTorso'];
  check(JSON.stringify(tree.parts) === JSON.stringify(want), `R15's 16 parts (${tree.parts.length})`);
  const J = Object.fromEntries(tree.joints.map(([n, ...r]) => [n, r]));
  check(tree.joints.length === 15 && JSON.stringify(J.Root) === '["LowerTorso","HumanoidRootPart","LowerTorso"]' && JSON.stringify(J.Neck) === '["Head","UpperTorso","Head"]' && JSON.stringify(J.LeftKnee) === '["LeftLowerLeg","LeftUpperLeg","LeftLowerLeg"]' && JSON.stringify(J.RightWrist) === '["RightHand","RightLowerArm","RightHand"]', 'its 15 Motor6Ds, each in its Part1, named and joined as R15\'s');

  // Parts on their drawn nodes; joints' equations; the knee's and elbow's bend; the arms' swing.
  const state = () => t.eval(() => {
    const s = window.studio, ch = s.dm.service('Players').children[0].props.Character, kid = n => ch.children.find(c => c.props.Name === n), rig = s.player.rig;
    let off = 0, worst = 0;
    for (const [name, part] of rig) { if (name === 'HumanoidRootPart') continue; const p = kid(name).props.CFrame, q = part.node.getAbsolutePosition(); off = Math.max(off, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)); }
    const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') { const P = c.props, w = P.Part0.props.CFrame.mul(P.C0).mul(P.Transform).mul(P.C1.inverse()), g = P.Part1.props.CFrame; worst = Math.max(worst, ...w.m.map((v, k) => Math.abs(v - g.m[k]))); } walk(c); } };
    walk(ch);
    const bend = (a, b) => { const r = kid(a).props.CFrame.inverse().mul(kid(b).props.CFrame), tr = r.m[3] + r.m[7] + r.m[11]; return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180 / Math.PI; };
    const H = kid('HumanoidRootPart').props.CFrame, swing = n => { const m = H.inverse().mul(kid(n).props.CFrame).m; return Math.atan2(m[10], m[7]) * 180 / Math.PI; };
    return { off, worst, knee: bend('LeftUpperLeg', 'LeftLowerLeg'), elbow: bend('LeftUpperArm', 'LeftLowerArm'), la: swing('LeftUpperArm'), ra: swing('RightUpperArm') };
  });
  const s0 = await state();
  check(s0.off < 1e-3, `standing: each part is where its drawn part is (worst ${s0.off.toExponential(1)} studs)`);
  check(s0.worst < 1e-3, `every joint holds (worst ${s0.worst.toExponential(1)})`);
  // With no clip playing, the drawn layout is exactly the body's own rest pose (from its joints' C0
  // and C1, at the drawn scale): a joint placing its node wrongly breaks it.
  const lay = await t.eval(async () => {
    const s = window.studio, k = s.player.modelScale, rig = s.player.rig;
    const saved = s.player.anim.layers; s.player.anim.layers = []; s.player.anim.update(0); s.players.body.update(); s.player.anim.layers = saved;
    const ch = s.dm.service('Players').children[0].props.Character, kid = n => ch.children.find(c => c.props.Name === n), H = kid('HumanoidRootPart').props.CFrame;
    let worst = 0, which = '';
    // The body's rest pose from its own joints (the rig's C0 and C1, at the drawn scale), from the root.
    const sc = c => new c.constructor([c.x * k, c.y * k, c.z * k, ...c.m.slice(3)]), rest = { HumanoidRootPart: new H.constructor() };
    const order = ['LowerTorso', 'UpperTorso', 'Head', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'RightUpperLeg', 'RightLowerLeg', 'RightFoot'];
    for (const n of order) { const part = rig.get(n), parent = kid(n).children.find(c => c.ClassName === 'Motor6D').props.Part0.props.Name; rest[n] = rest[parent].mul(sc(part.c0)).mul(sc(part.c1).inverse()); }
    for (const n of order) { const r = H.inverse().mul(kid(n).props.CFrame), p = rest[n], d = Math.hypot(r.x - p.x, r.y - p.y, r.z - p.z); if (d > worst) { worst = d; which = n; } }
    return { worst, which };
  });
  check(lay.worst < 1e-3, `at rest, every part is where the body's rest pose puts it (worst ${lay.worst.toExponential(1)} studs, ${lay.which})`);
  let knee = 0, elbow = 0, worst = 0, off = 0; const la = [], ra = [];
  for (let k = 0; k < 24; k++) {
    await t.sim(3, { move: [0, 1] });
    const s = await state();
    knee = Math.max(knee, s.knee); elbow = Math.max(elbow, s.elbow); worst = Math.max(worst, s.worst); off = Math.max(off, s.off);
    la.push(s.la); ra.push(s.ra);
  }
  check(knee > 20 && elbow > 5, `walking, the knees bend (up to ${knee.toFixed(0)}°) and the elbows (${elbow.toFixed(0)}°)`);
  // Opposite: as one arm swings forward the other swings back (their swings' correlation over the
  // walk is strongly negative; Roblox's run carries both arms forward, so their signs often agree).
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length, ma = mean(la), mb = mean(ra);
  const corr = la.reduce((x, v, i) => x + (v - ma) * (ra[i] - mb), 0) / Math.sqrt(la.reduce((x, v) => x + (v - ma) ** 2, 0) * ra.reduce((x, v) => x + (v - mb) ** 2, 0));
  check(corr < -0.5, `the arms swing opposite each other (correlation ${corr.toFixed(2)})`);
  // Each joint's Transform is the clip's own pose at that moment (a steady walk: one layer at weight 1),
  // positions at the drawn scale: the clip turns each part about its joint, nothing else.
  const tf = await t.eval(() => {
    const s = window.studio, p = s.player, lay = p.anim.layers.find(l => l.weight >= 1), k = p.modelScale;
    if (!lay) return null;
    const pose = p.anim.clips[lay.clip].sample(lay.time), ch = s.dm.service('Players').children[0].props.Character;
    let worst = 0, n = 0;
    const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') { const want = pose.get(c.props.Part1.props.Name); if (want) { n++; const w = want.cf, T = c.props.Transform; worst = Math.max(worst, ...T.m.slice(3).map((v, j) => Math.abs(v - w.m[3 + j])), Math.hypot(T.x - w.x * k, T.y - w.y * k, T.z - w.z * k)); } } walk(c); } };
    walk(ch);
    return { worst, n, clip: lay.clip };
  });
  check(tf && tf.n >= 10 && tf.worst < 1e-3, `each joint's Transform is the clip's pose (${tf && tf.clip}, ${tf && tf.n} joints, worst ${tf && tf.worst.toExponential(1)})`);
  check(off < 1e-3 && worst < 1e-3, `and the parts stay on their drawn parts, the joints holding (worst ${off.toExponential(1)}, ${worst.toExponential(1)})`);

  // A script's Neck.C0 turns the drawn head (and the Head part) by that much.
  await t.sim(40);
  const headQ = () => t.eval(() => { const n = window.studio.player.rig.get('Head').node; n.computeWorldMatrix(true); const q = n.absoluteRotationQuaternion; return [q.x, q.y, q.z, q.w]; });
  const before = await headQ();
  await t.eval(() => window.studio.vm.run('neck', `local ch = game:GetService("Players"):GetPlayers()[1].Character; local n = ch.Head.Neck; n.C0 = n.C0 * CFrame.Angles(0, math.rad(60), 0)`));
  await t.sim(2);
  const after = await headQ();
  const turn = 2 * Math.acos(Math.min(1, Math.abs(before.reduce((a, v, i) => a + v * after[i], 0)))) * 180 / Math.PI;
  check(Math.abs(turn - 60) < 4, `a script's Neck.C0 turns the drawn head (${turn.toFixed(1)}°)`);
  const s2 = await state();
  check(s2.off < 1e-3 && s2.worst < 1e-3, 'and the Head part follows it, the joints holding');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
