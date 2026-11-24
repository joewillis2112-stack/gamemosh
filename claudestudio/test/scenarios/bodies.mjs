// The place chooses its players' body (run with --place places/bodies-lab.luau): a HumanoidDescription
// in StarterPlayer, its BodyShape child the shape, its scales and colours over it (runtime/bodygen.js
// describedBody). Checked against the body the generator makes from the same properties:
// - the drawn body's height (soles to the head's top) is that body's, not squashed to 5 studs;
// - the DataModel's R15 parts have that body's sizes (scaled);
// - the meshes carry exactly the description's colours, each part its own group's;
// - the physics capsule and the camera's focus follow the body's height and root;
// - the character's BodyColors hold them, and a script changing one recolours that part of the body;
// - Humanoid:ApplyDescriptionAsync reshapes the body where it stands: the same R15 parts and Motor6Ds
//   take the new sizes and joints (the generator's), ApplyDescriptionFinished fires, and
//   GetAppliedDescription returns it; a tier change rebuilds it at that tier's detail; a respawn brings
//   back the place's body;
// - an NPC made by Players:CreateHumanoidModelFromDescriptionAsync is drawn as its own described body
//   (height, colours, feet on the ground), a script's AnimationTrack poses it about its joints, and
//   ApplyDescriptionAsync on it rebuilds it.
import { describedBody, makeBody, colorGroup, FACE_COLOR } from '../../web/runtime/bodygen.js';
const FACE = FACE_COLOR.map(v => Math.round(v * 255)).join(','); // the face's own colour (it isn't the body's)
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(30);
  const got = await t.eval(() => {
    const s = window.studio, sp = s.dm.service('StarterPlayer'), d = sp.children.find(c => c.ClassName === 'HumanoidDescription'), sh = d.children.find(c => c.ClassName === 'BodyShape');
    const plain = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v && typeof v === 'object' && 'r' in v ? { r: v.r, g: v.g, b: v.b } : v]).filter(([, v]) => typeof v !== 'object' || (v && 'r' in v)));
    const ch = s.dm.service('Players').children[0].props.Character, hum = ch.children.find(c => c.ClassName === 'Humanoid');
    const sizes = Object.fromEntries(ch.children.filter(c => c.ClassName === 'Part').map(c => [c.props.Name, [c.props.Size.x, c.props.Size.y, c.props.Size.z]]));
    const p = s.player;
    // The drawn body's bounds at rest (the idle clip bends it; the next frame poses it again), from every
    // mesh with vertices (a skinned one through its bones).
    for (const n of p.anim.nodes) { const r = p.anim.rest.get(n); n.position.copyFrom(r.p); n.rotationQuaternion.copyFrom(r.q); n.scaling.copyFrom(r.s); }
    for (let k = 0; k < 2; k++) { p.holder.computeWorldMatrix(true); p.holder.getChildTransformNodes(false).forEach(n => n.computeWorldMatrix(true)); p.holder.getChildMeshes(false).forEach(n => n.computeWorldMatrix(true)); }
    p.meshes.forEach(m => m.skeleton && m.skeleton.prepare(true));
    let lo = Infinity, hi = -Infinity;
    for (const m of p.meshes) if (m.getTotalVertices() > 0) { m.computeWorldMatrix(true); m.refreshBoundingInfo && m.refreshBoundingInfo(!!m.skeleton); const b = m.getBoundingInfo().boundingBox; lo = Math.min(lo, b.minimumWorld.y); hi = Math.max(hi, b.maximumWorld.y); }
    // The colours on the meshes: distinct RGB triples, and per rigid part mesh its own.
    const srgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; // (the file's colours are linear)
    const key = (r, g, b) => [r, g, b].map(v => Math.round(srgb(v) * 255)).join(',');
    const all = new Set(), perPart = {};
    for (const m of p.meshes) { const c = m.getVerticesData && m.getVerticesData('color'); if (!c) continue; const own = new Set(); for (let i = 0; i < c.length; i += 4) { const k = key(c[i], c[i + 1], c[i + 2]); all.add(k); own.add(k); } perPart[m.name] = [...own]; }
    const foot = p.holder.position.y;
    return { desc: plain(d.props), shape: plain(sh.props), rig: hum.props.RigType, sizes, height: hi - lo, soles: lo - foot, colors: [...all], perPart, tier: s.R.quality,
      capH: p.capH, stepUp: p.p.StepUp, rootHeight: p.rootHeight, focus: s.camera.focusPoint().y - foot, modelScale: p.modelScale };
  });
  const params = describedBody(got.desc, got.shape), body = makeBody(params);
  check(got.rig === 'R15', `the place's body is R15 (${got.rig})`);
  check(got.modelScale === 1 && Math.abs(got.height - body.height) < 0.03, `drawn at its own height: ${got.height.toFixed(3)} studs, the generator's ${body.height.toFixed(3)} (not squashed to 5)`);
  check(Math.abs(got.soles) < 0.03, `its soles on the ground (${got.soles.toFixed(3)})`);
  let worst = 0, worstPart = '';
  for (const [n, sz] of Object.entries(got.sizes)) { const w = body.parts[n] && body.parts[n].size; if (!w) { worst = Infinity; worstPart = n; continue; } const e = Math.max(...sz.map((v, i) => Math.abs(v - w[i]))); if (e > worst) { worst = e; worstPart = n; } }
  check(Object.keys(got.sizes).length === 16 && worst < 1e-3, `the DataModel's 16 R15 parts have the described body's sizes (worst ${worst.toExponential(1)}, ${worstPart}; Head ${got.sizes.Head.map(v => v.toFixed(2))})`);
  const key = c => [c.r, c.g, c.b].map(v => Math.round(v * 255)).join(',');
  const want = new Set([...['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'].map(g => key(got.desc[g + 'Color'])), FACE]);
  check(got.colors.length === want.size && got.colors.every(c => want.has(c)), `the meshes carry exactly the description's colours (${got.colors.join(' | ')})`);
  const rigid = Object.entries(got.perPart).filter(([n]) => n !== 'Body');
  if (rigid.length) check(rigid.length === 15 && rigid.every(([n, c]) => { const own = c.filter(x => n !== 'Head' || x !== FACE); return own.length === 1 && own[0] === key(got.desc[colorGroup(n) + 'Color']) && (n !== 'Head' || c.includes(FACE)); }), `each part wears its own group's colour, the head its face too (${rigid.length} parts)`);
  else check(got.perPart.Body && got.perPart.Body.length === want.size, `one skinned mesh carrying all ${want.size} colours`);
  check(Math.abs(got.capH - (body.height - got.stepUp)) < 1e-6, `the collision capsule is the body's height above the step (${got.capH.toFixed(2)})`);
  check(Math.abs(got.rootHeight - body.hrpHeight) < 0.02 && Math.abs(got.focus - (got.rootHeight + 1.5)) < 1e-6, `the camera looks 1.5 studs above the body's own root (${got.focus.toFixed(2)}; root ${got.rootHeight.toFixed(2)}, the generator's ${body.hrpHeight.toFixed(2)})`);
  // A look at it from the front (looked at: proportions and colours as described).
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(0, 1, 0), Math.PI); s.camera.yaw = 0; s.camera.pitch = 8 * Math.PI / 180; s.camera.zoom = 14; });
  await t.sim(30); await t.frames(30);
  await t.shot('bodies');
  // It walks: 2 s forward covers ground at about WalkSpeed.
  const x0 = await t.eval(() => { const p = window.studio.player.holder.position; return [p.x, p.z]; });
  await t.sim(120, { move: [0, 1] });
  const x1 = await t.eval(() => { const p = window.studio.player.holder.position; return [p.x, p.z]; });
  const d = Math.hypot(x1[0] - x0[0], x1[1] - x0[1]);
  check(d > 25 && d < 33, `it walks (${d.toFixed(1)} studs in 2 s)`);

  // The body as drawn and as the DataModel has it, for the steps below.
  const look = () => t.eval(() => {
    const s = window.studio, p = s.player, ch = s.dm.service('Players').children[0].props.Character, hum = ch.children.find(c => c.ClassName === 'Humanoid');
    for (const n of p.anim.nodes) { const r = p.anim.rest.get(n); n.position.copyFrom(r.p); n.rotationQuaternion.copyFrom(r.q); n.scaling.copyFrom(r.s); }
    for (let k = 0; k < 2; k++) { p.holder.computeWorldMatrix(true); p.holder.getChildTransformNodes(false).forEach(n => n.computeWorldMatrix(true)); p.holder.getChildMeshes(false).forEach(n => n.computeWorldMatrix(true)); }
    p.meshes.forEach(m => m.skeleton && m.skeleton.prepare(true));
    let lo = Infinity, hi = -Infinity, top = null, topY = -Infinity;
    const srgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055, key = (r, g, b) => [r, g, b].map(v => Math.round(srgb(v) * 255)).join(',');
    const all = new Set();
    for (const m of p.meshes) if (m.getTotalVertices() > 0) {
      m.refreshBoundingInfo && m.refreshBoundingInfo(!!m.skeleton); const b = m.getBoundingInfo().boundingBox; lo = Math.min(lo, b.minimumWorld.y); hi = Math.max(hi, b.maximumWorld.y);
      const c = m.getVerticesData('color'); if (c) for (let i = 0; i < c.length; i += 4) all.add(key(c[i], c[i + 1], c[i + 2]));
    }
    const kid = n => ch.children.find(c => c.props.Name === n), bc = ch.children.find(c => c.ClassName === 'BodyColors');
    window.__parts = window.__parts || {};
    let worst = 0; const walk = i => { for (const c of i.children) { if (c.ClassName === 'Motor6D') { const P = c.props, w = P.Part0.props.CFrame.mul(P.C0).mul(P.Transform).mul(P.C1.inverse()), g = P.Part1.props.CFrame; worst = Math.max(worst, ...w.m.map((v, k) => Math.abs(v - g.m[k]))); } walk(c); } }; walk(ch);
    return { height: hi - lo, colors: [...all], tier: s.graphics.tier, skinned: p.meshes.filter(m => m.skeleton).length,
      bc: bc && Object.fromEntries(['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'].map(g => [g, [bc.props[g + 'Color3'].r, bc.props[g + 'Color3'].g, bc.props[g + 'Color3'].b]])),
      head: [kid('Head').props.Size.x, kid('Head').props.Size.y, kid('Head').props.Size.z], leg: kid('LeftUpperLeg').props.Size.y, kneeC0: kid('LeftLowerLeg').children.find(c => c.props.Name === 'LeftKnee').props.C0.y,
      same: ['Head', 'LeftUpperLeg'].map(n => (window.__parts[n] = window.__parts[n] || kid(n)) === kid(n)), worst };
  });
  const k255 = c => c.map(v => Math.round(v * 255)).join(',');
  const a0 = await look();
  check(a0.bc && ['Head', 'Torso', 'LeftLeg'].every(g => k255(a0.bc[g]) === key(got.desc[g + 'Color'])), `the character's BodyColors hold the body's colours (${a0.bc && k255(a0.bc.Torso)})`);
  // A script recolours the torso through BodyColors.
  await t.eval(() => window.studio.vm.run('bc', 'game.Players.LocalPlayer.Character.BodyColors.TorsoColor3 = Color3.fromRGB(40, 160, 90)'));
  await t.sim(2);
  const a1 = await look();
  check(a1.colors.includes('40,160,90') && !a1.colors.includes(key(got.desc.TorsoColor)) && a1.colors.includes(key(got.desc.HeadColor)), `BodyColors.TorsoColor3 recolours the torso, the rest kept (${a1.colors.join(' | ')})`);
  // ApplyDescriptionAsync: shorter, a wider head, longer legs; the colours given.
  await t.eval(() => window.studio.vm.run('apply', `
    task.spawn(function()
      local hum = game.Players.LocalPlayer.Character.Humanoid
      hum.ApplyDescriptionFinished:Connect(function(d) print("finished", d.HeightScale) end)
      local d = hum:GetAppliedDescription()
      d.HeightScale = 0.9; d.HeadScale = 1.25; d.TorsoColor = Color3.fromRGB(240, 200, 40)
      local s = d:FindFirstChildOfClass("BodyShape"); s.LegLength = 3.1; s.HeadWidth = 1.6
      hum:ApplyDescriptionAsync(d)
      print("applied", hum:GetAppliedDescription().HeightScale, hum:GetAppliedDescription():FindFirstChildOfClass("BodyShape").LegLength)
    end)`));
  for (let i = 0; i < 40 && !t.logs.some(l => l.includes('[luau] applied')); i++) await t.sim(5);
  const a2 = await look();
  const nd = { ...got.desc, HeightScale: 0.9, HeadScale: 1.25, TorsoColor: { r: 240 / 255, g: 200 / 255, b: 40 / 255 } }, ns = { ...got.shape, LegLength: 3.1, HeadWidth: 1.6 }, nb = makeBody(describedBody(nd, ns));
  check(t.logs.some(l => /\[luau\] finished 0\.9/.test(l)) && t.logs.some(l => /\[luau\] applied 0\.9\d* 3\.1/.test(l)), 'ApplyDescriptionAsync yields until done, fires ApplyDescriptionFinished, and GetAppliedDescription returns it');
  check(Math.abs(a2.height - nb.height) < 0.03, `the body is reshaped: ${a2.height.toFixed(3)} studs tall, the generator's ${nb.height.toFixed(3)} (was ${a0.height.toFixed(3)})`);
  check(a2.same.every(Boolean) && Math.abs(a2.head[0] - nb.parts.Head.size[0]) < 1e-6 && Math.abs(a2.leg - nb.parts.LeftUpperLeg.size[1]) < 1e-6 && Math.abs(a2.kneeC0 - nb.joints.find(j => j.name === 'LeftKnee').c0.y) < 1e-6 && a2.worst < 1e-3, `the same R15 parts and Motor6Ds take the new sizes and joints (head ${a2.head.map(v => v.toFixed(2))}; knee C0 ${a2.kneeC0.toFixed(3)}; joints hold, worst ${a2.worst.toExponential(1)})`);
  check(a2.colors.includes('240,200,40') && !a2.colors.includes('40,160,90'), `its colours the description's (${a2.colors.join(' | ')})`);
  // A tier change rebuilds it at that tier's detail (skinned on high and ultra, rigid below), the same shape.
  // (Graphics' systems switched directly: the run's --quality pins the tier against the player's setting.)
  const tierWas = a2.tier, other = tierWas === 'low' ? 'high' : 'low';
  await t.eval(x => window.studio.graphics.apply(x), other);
  await t.sim(30);
  const a3 = { ...(await look()), tier: other };
  await t.eval(x => window.studio.graphics.apply(x), tierWas); // (back, for the rest)
  await t.sim(30);
  check((a3.tier === 'high' || a3.tier === 'ultra' ? a3.skinned === 1 : a3.skinned === 0) && Math.abs(a3.height - nb.height) < 0.03 && a3.colors.includes('240,200,40'), `a tier change (${tierWas} to ${a3.tier}) rebuilds it at that tier's detail (${a3.skinned} skinned), the same shape and colours (${a3.height.toFixed(3)})`);
  // A respawn brings back the place's body.
  await t.eval(() => window.studio.vm.run('die', 'game.Players.LocalPlayer.Character.Humanoid.Health = 0'));
  await t.sim(60 * 6);
  await t.sim(30);
  const a4 = await look();
  check(Math.abs(a4.height - body.height) < 0.03 && a4.bc && k255(a4.bc.Torso) === key(got.desc.TorsoColor) && a4.colors.includes(key(got.desc.TorsoColor)) && !a4.colors.includes('240,200,40'), `a respawn brings back the place's body (${a4.height.toFixed(3)} studs; torso ${a4.bc && k255(a4.bc.Torso)})`);

  // The NPC.
  const npcLook = () => t.eval(() => {
    const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Greeter'), hum = m && m.children.find(c => c.ClassName === 'Humanoid'), root = m && m.children.find(c => c.props.Name === 'HumanoidRootPart');
    const d = hum && hum.children.find(c => c.ClassName === 'HumanoidDescription'), sh = d && d.children.find(c => c.ClassName === 'BodyShape');
    const plain = p => Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number' || (v && typeof v === 'object' && 'r' in v)).map(([k, v]) => [k, typeof v === 'number' ? v : { r: v.r, g: v.g, b: v.b }]));
    const v = s.rigs.views.get(m);
    if (!v || !v.holder) return { model: !!m, rig: hum && hum.props.RigType, desc: !!d, drawn: false };
    for (const n of v.anim.nodes) { const r = v.anim.rest.get(n); n.position.copyFrom(r.p); n.rotationQuaternion.copyFrom(r.q); n.scaling.copyFrom(r.s); }
    for (let k = 0; k < 2; k++) { v.holder.computeWorldMatrix(true); v.holder.getChildTransformNodes(false).forEach(n => n.computeWorldMatrix(true)); v.holder.getChildMeshes(false).forEach(n => n.computeWorldMatrix(true)); }
    v.meshes.forEach(x => x.skeleton && x.skeleton.prepare(true));
    let lo = Infinity, hi = -Infinity; const all = new Set();
    const srgb = x => x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
    for (const x of v.meshes) if (x.getTotalVertices() > 0) { x.refreshBoundingInfo && x.refreshBoundingInfo(!!x.skeleton); const b = x.getBoundingInfo().boundingBox; lo = Math.min(lo, b.minimumWorld.y); hi = Math.max(hi, b.maximumWorld.y); const c = x.getVerticesData('color'); if (c) for (let i = 0; i < c.length; i += 4) all.add([c[i], c[i + 1], c[i + 2]].map(y => Math.round(srgb(y) * 255)).join(',')); }
    return { model: true, rig: hum.props.RigType, desc: plain(d.props), shape: sh ? plain(sh.props) : null, drawn: true, lo, hi, rootY: root.props.CFrame.y, rootSize: [root.props.Size.x, root.props.Size.y, root.props.Size.z], colors: [...all], generated: !!v.rig };
  });
  let n0 = await npcLook();
  for (let i = 0; i < 20 && !n0.drawn; i++) { await t.sim(5); n0 = await npcLook(); }
  const nb0 = n0.drawn ? makeBody(describedBody(n0.desc, n0.shape)) : null;
  check(n0.drawn && n0.rig === 'R15' && n0.generated && n0.shape, `an NPC from CreateHumanoidModelFromDescriptionAsync: R15, its description under its Humanoid, drawn as a generated body (${n0.drawn ? 'drawn' : 'not drawn'})`);
  if (nb0) {
    check(Math.abs(n0.hi - n0.lo - nb0.height) < 0.03 && Math.abs(n0.lo) < 0.03 && Math.abs(n0.rootY - nb0.hrpHeight) < 1e-6 && Math.abs(n0.rootSize[1] - nb0.parts.HumanoidRootPart.size[1]) < 1e-6, `drawn at its described height, ${(n0.hi - n0.lo).toFixed(3)} studs (the generator's ${nb0.height.toFixed(3)}), its feet on the ground (${n0.lo.toFixed(3)}), its root part the body's`);
    const wantN = new Set([...['Head', 'Torso', 'LeftLeg'].map(g => key(n0.desc[g + 'Color'])), FACE]);
    check(n0.colors.length === wantN.size && n0.colors.every(c => wantN.has(c)), `in its own colours (${n0.colors.join(' | ')})`);
  }
  // A script's AnimationTrack poses the NPC about its joints (its left upper arm turned 90 degrees).
  const armQ = () => t.eval(() => { const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Greeter'), v = s.rigs.views.get(m), n = v.rig.get('LeftUpperArm').node, r = v.anim.rest.get(n).q, q = n.rotationQuaternion; return Math.abs(r.x * q.x + r.y * q.y + r.z * q.z + r.w * q.w); });
  await t.eval(() => window.studio.vm.run('npcanim', `
    local KSP = game:GetService("KeyframeSequenceProvider")
    local ks = Instance.new("KeyframeSequence") ks.Loop = true ks.Priority = Enum.AnimationPriority.Action
    for _, tm in ipairs({ 0, 1 }) do
      local kf = Instance.new("Keyframe") kf.Time = tm
      local function pose(name, parent, cf) local p = Instance.new("Pose") p.Name = name p.Weight = cf and 1 or 0 if cf then p.CFrame = cf end p.Parent = parent return p end
      pose("LeftUpperArm", pose("UpperTorso", pose("LowerTorso", pose("HumanoidRootPart", kf))), CFrame.Angles(math.rad(90), 0, 0))
      ks:AddKeyframe(kf)
    end
    local a = Instance.new("Animation") a.AnimationId = KSP:RegisterKeyframeSequence(ks)
    workspace.Greeter.Humanoid:LoadAnimation(a):Play(0)`));
  await t.sim(10); await t.frames(2);
  const dq = await armQ(), turned = 2 * Math.acos(Math.min(1, dq)) * 180 / Math.PI;
  check(Math.abs(turned - 90) < 1, `a script's AnimationTrack turns the NPC's arm about its shoulder (${turned.toFixed(1)} degrees)`);
  // ApplyDescriptionAsync on the NPC rebuilds it.
  await t.eval(() => window.studio.vm.run('npcapply', `
    task.spawn(function()
      local hum = workspace.Greeter.Humanoid
      local d = hum:GetAppliedDescription(); d.HeightScale = 1.25
      hum:ApplyDescriptionAsync(d)
      print("npc applied", hum:FindFirstChildOfClass("HumanoidDescription").HeightScale)
    end)`));
  let n1 = null;
  for (let i = 0; i < 30; i++) { await t.sim(5); await t.frames(1); n1 = await npcLook(); if (n1.drawn && n1.desc.HeightScale === 1.25 && Math.abs(n1.hi - n1.lo - (n0.hi - n0.lo)) > 0.1) break; }
  const nb1 = makeBody(describedBody(n1.desc, n1.shape));
  check(t.logs.some(l => /\[luau\] npc applied 1\.25/.test(l)) && Math.abs(n1.hi - n1.lo - nb1.height) < 0.03, `ApplyDescriptionAsync rebuilds the NPC (${(n1.hi - n1.lo).toFixed(3)} studs, the generator's ${nb1.height.toFixed(3)})`);
  await t.eval(() => { const s = window.studio, V = s.player.holder.position.constructor; s.player.teleport(new V(2, 1, 4), Math.PI); s.camera.yaw = 0.5; s.camera.pitch = 6 * Math.PI / 180; s.camera.zoom = 20; });
  await t.sim(20); await t.frames(30);
  await t.shot('bodies-npc');
  if (fail.length) throw new Error(fail.length + ' failed');
}
