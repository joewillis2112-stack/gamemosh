// The place chooses its players' body (run with --place places/bodies-lab.luau): a HumanoidDescription
// in StarterPlayer, its BodyShape child the shape, its scales and colours over it (runtime/bodygen.js
// describedBody). Checked against the body the generator makes from the same properties:
// - the drawn body's height (soles to the head's top) is that body's, not squashed to 5 studs;
// - the DataModel's R15 parts have that body's sizes (scaled);
// - the meshes carry exactly the description's colours, each part its own group's;
// - the physics capsule and the camera's focus follow the body's height and root.
import { describedBody, makeBody, colorGroup } from '../../web/runtime/bodygen.js';
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
  const want = new Set(['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'].map(g => key(got.desc[g + 'Color'])));
  check(got.colors.length === want.size && got.colors.every(c => want.has(c)), `the meshes carry exactly the description's colours (${got.colors.join(' | ')})`);
  const rigid = Object.entries(got.perPart).filter(([n]) => n !== 'Body');
  if (rigid.length) check(rigid.length === 15 && rigid.every(([n, c]) => c.length === 1 && c[0] === key(got.desc[colorGroup(n) + 'Color'])), `each part wears its own group's colour (${rigid.length} parts)`);
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
  if (fail.length) throw new Error(fail.length + ' failed');
}
