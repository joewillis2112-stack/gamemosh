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
  // A generated body (?body=) is drawn at its tier's detail: 15 parts, each 6 faces of (2 x segments)^2
  // quads (runtime/bodygen.js TIER_SEGMENTS: rounder on higher tiers).
  const detail = await t.eval(() => ({ body: new URLSearchParams(location.search).has('body'), tier: window.studio.R.quality, tris: window.studio.player.meshes.reduce((n, m) => n + (m.getTotalIndices ? m.getTotalIndices() / 3 : 0), 0) }));
  if (detail.body) {
    const seg = { low: 3, phone: 4, high: 6, ultra: 8 }[detail.tier];
    const fs = seg >= 6 ? 3 : 2, face = 7 * 6 * (2 * fs) ** 2 * 2; // the face's seven small pieces (bodygen.js faceMesh)
    check(detail.tris === 15 * 6 * (2 * seg) ** 2 * 2 + face, `a generated body at the ${detail.tier} tier's detail (${detail.tris} triangles; ${seg} segments, the face ${face})`);
    // High and ultra: one skinned mesh whose 16 bones are the animated joint nodes; below, a rigid mesh per part.
    const sk = await t.eval(() => { const p = window.studio.player, m = p.meshes.filter(x => x.skeleton); const bones = m[0] ? m[0].skeleton.bones : []; return { skinned: m.length, bones: bones.length, linked: bones.filter(b => { const n = b.getTransformNode(); return n && p.rig.has(n.name) && p.rig.get(n.name).node === n; }).length }; });
    const want = detail.tier === 'high' || detail.tier === 'ultra';
    check(want ? sk.skinned === 1 && sk.bones === 16 && sk.linked === 16 : sk.skinned === 0, want ? `one skinned mesh, its 16 bones the animated joints (${sk.skinned} skinned, ${sk.linked}/${sk.bones} bones linked)` : `rigid parts below high (${sk.skinned} skinned)`);
  }
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
  // Footsteps: each walk clip has a touchdown per foot per cycle, and walking fires them.
  const contacts = await t.eval(() => { const p = window.studio.player, prev = p.on.step; window.__steps = 0; p.on.step = () => { window.__steps++; prev && prev(); }; return { walk: p.contacts.walk.length, sprint: p.contacts.sprint.length }; });
  check(contacts.walk >= 2 && contacts.sprint >= 2, `the walk and run clips put each foot down once a cycle (${contacts.walk}, ${contacts.sprint} touchdowns)`);
  let knee = 0, elbow = 0, worst = 0, off = 0; const la = [], ra = [];
  for (let k = 0; k < 24; k++) {
    await t.sim(3, { move: [0, 1] });
    const s = await state();
    knee = Math.max(knee, s.knee); elbow = Math.max(elbow, s.elbow); worst = Math.max(worst, s.worst); off = Math.max(off, s.off);
    la.push(s.la); ra.push(s.ra);
  }
  const steps = await t.eval(() => window.__steps);
  check(steps >= 2, `walking 72 frames (about two run cycles, from standing) fires footsteps (${steps})`);
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

  // A script's AnimationTrack (an R15 KeyframeSequence, Action priority) poses the body about its joints:
  // the shoulder's Motor6D.Transform becomes the Pose's CFrame (R15's rule; R6's overlay would turn it
  // into the blocky model's node frame and miss).
  await t.eval(() => window.studio.vm.run('track', `
    local KSP = game:GetService("KeyframeSequenceProvider")
    local ks = Instance.new("KeyframeSequence") ks.Loop = true ks.Priority = Enum.AnimationPriority.Action
    for _, tm in ipairs({ 0, 1 }) do
      local kf = Instance.new("Keyframe") kf.Time = tm
      local function pose(name, parent, cf) local p = Instance.new("Pose") p.Name = name p.Weight = cf and 1 or 0 if cf then p.CFrame = cf end p.Parent = parent return p end
      local ut = pose("UpperTorso", pose("LowerTorso", pose("HumanoidRootPart", kf)))
      pose("LeftUpperArm", ut, CFrame.Angles(math.rad(90), 0, math.rad(20)))
      ks:AddKeyframe(kf)
    end
    local a = Instance.new("Animation") a.AnimationId = KSP:RegisterKeyframeSequence(ks)
    local tr = game:GetService("Players"):GetPlayers()[1].Character.Humanoid:LoadAnimation(a)
    tr:Play(0)`));
  await t.sim(10);
  const sh = await t.eval(() => {
    const ch = window.studio.dm.service('Players').children[0].props.Character, j = ch.children.find(c => c.props.Name === 'LeftUpperArm').children.find(c => c.props.Name === 'LeftShoulder');
    return j.props.Transform.m.slice(3);
  });
  const wantT = (() => { const a = Math.PI / 2, b = 20 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b); return [cb, -sb, 0, ca * sb, ca * cb, -sa, sa * sb, sa * cb, ca]; })(); // Rx(90) * Rz(20), row-major
  const err = Math.max(...sh.map((v, i) => Math.abs(v - wantT[i])));
  check(err < 2e-3, `a script's AnimationTrack poses the R15 shoulder: its Transform is the Pose's CFrame (worst ${err.toExponential(1)})`);
  const s3 = await state();
  check(s3.off < 1e-3 && s3.worst < 1e-3, 'and the parts follow, the joints holding');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
