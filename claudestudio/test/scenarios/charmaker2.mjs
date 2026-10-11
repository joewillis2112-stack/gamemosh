// Character maker, stage 2, in play: a generated mesh rigged to the blocky rig
// (web/runtime/rigmesh.js) plays like the blocky character.
// - Mechanics: the same input trace (walk, stop, jump, turn) run with the
//   blocky character, then with the rigged one: feet, velocity, state and
//   facing match frame for frame. (Leg poses differ on purpose: the stride
//   is synced to each body's own legs.)
// - Skinning, as the engine draws it: mid-walk, every vertex bound wholly to
//   one joint sits where that joint's motion since rest puts it (Babylon's
//   CPU skinning of the same data the GPU draws).
// - The death pose's footprint is measured from the joints' part boxes.
// - Golden: the rigged character mid-walk, from the front three-quarters.
import fs from 'node:fs';
import { readMeshGlb, rigFromKenney, fitMesh, writeRiggedGlb } from '../../web/runtime/rigmesh.js';
import { findParts } from '../../web/runtime/charmaker.js';
import { loadPNG } from '../../tools/charmaker.mjs';

const OUT = 'build/stage2/scenario-rigged.glb';

export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  fs.mkdirSync('build/stage2', { recursive: true });
  const rig = rigFromKenney(fs.readFileSync('assets/characters/character-a.glb'));
  const mesh = readMeshGlb(fs.readFileSync('test/fixtures/stage2/male-adventurer-tripo.glb'));
  fs.writeFileSync(OUT, writeRiggedGlb(rig, mesh, fitMesh(mesh, rig, { reference: findParts(loadPNG('test/fixtures/characters/male-adventurer.png')) })));

  const frame = () => t.eval(() => {
    const p = window.studio.player, f = p.footPosition;
    return [f.x, f.y, f.z, p.velocity.x, p.velocity.y, p.velocity.z, p.yaw, p.state].map(v => typeof v === 'number' ? +v.toPrecision(12) : v).join(',');
  });
  const trace = async () => {
    await t.sim(30);
    const spawn = await t.eval(() => { const f = window.studio.player.footPosition; return [f.x, f.y, f.z]; });
    const out = [];
    for (let run = 0; run < 2; run++) { // the second run, so physics-engine history is the same in both pages
      await t.eval(s => { const p = window.studio.player; p.teleport(new p.footPosition.constructor(...s), 0); p.anim.play('idle', 0); }, spawn);
      await t.sim(20);
      out.length = 0;
      const step = async (n, input) => { for (let i = 0; i < n; i++) { await t.sim(1, input); out.push(await frame()); } };
      await step(70, { move: [0, 1] }); await step(30); await step(1, { jump: true }); await step(50); await step(40, { move: [1, 0] });
    }
    return out;
  };
  const A = await trace();
  await t.reload({ character: '../' + OUT });
  const loaded = await t.eval(() => window.studio.player.meshes.filter(m => m.skeleton).map(m => m.name));
  check(loaded.length === 1, `the rigged character loaded with one skinned body (${loaded.join(', ')})`);
  const B = await trace();
  const diff = A.findIndex((v, i) => v !== B[i]);
  check(diff === -1 && B.length === 191, `the rigged character moves exactly like the blocky one (191 frames of feet, velocity, state and facing; first difference ${diff}${diff >= 0 ? ': ' + A[diff] + ' vs ' + B[diff] : ''})`);

  // Skinning as the engine does it.
  const sk = await t.eval(() => {
    const S = window.studio, p = S.player, body = p.meshes.find(m => m.skeleton);
    const joints = p.anim.nodes.filter(n => /^(root|leg-left|leg-right|torso|arm-left|arm-right|head)$/.test(n.name));
    const snap = () => {
      p.holder.computeWorldMatrix(true); joints.forEach(j => j.computeWorldMatrix(true));
      body.computeWorldMatrix(true); body.skeleton.prepare(true);
      const pd = body.getPositionData(true, false), wm = body.getWorldMatrix(), V = p.holder.position.constructor;
      const world = []; for (let i = 0; i < pd.length; i += 3) { const v = V.TransformCoordinates(new V(pd[i], pd[i + 1], pd[i + 2]), wm); world.push([v.x, v.y, v.z]); }
      return { world, J: Object.fromEntries(joints.map(j => [j.name, j.getWorldMatrix().clone()])) };
    };
    // Rest: no clip layers (the animator resets every node to rest, then mixes clips).
    p.anim.layers = []; p.anim.update(0);
    const rest = snap();
    const swing = [0.125, 0.25, 0.375].map(f => f * p.anim.duration('walk')); // try a few phases, keep the widest swing
    let posed = null;
    for (const time of swing) { p.anim.layers = [{ clip: 'walk', time, weight: 1, target: 1, speed: 0 }]; p.anim.update(0); const s = snap(); const d = Math.max(...s.world.map((w, i) => Math.hypot(w[0] - rest.world[i][0], w[1] - rest.world[i][1], w[2] - rest.world[i][2]))); if (!posed || d > posed.d) posed = { ...s, d }; }
    p.anim.layers = []; p.anim.play('idle', 0);
    // Which joint holds each vertex wholly: from the vertex data.
    const jIdx = body.getVerticesData('matricesIndices'), jW = body.getVerticesData('matricesWeights');
    // A vertex's joint index is the bone's matrix index (Bone.getIndex), not its place in skeleton.bones.
    const bones = []; body.skeleton.bones.forEach(b => { if (b.getIndex() >= 0) bones[b.getIndex()] = (b.getTransformNode() || b).name; });
    let worst = 0, n = 0, moved = 0; const per = {};
    const V = p.holder.position.constructor;
    for (let v = 0; v < rest.world.length; v++) {
      if (!(jW[v * 4] > 0.999)) continue;
      const name = bones[jIdx[v * 4]], Jr = rest.J[name], Jp = posed.J[name];
      if (!Jr) return { error: "no joint node for bone " + name, bones, joints: Object.keys(rest.J) };
      const inv = Jr.clone().invert(), local = V.TransformCoordinates(new V(...rest.world[v]), inv), want = V.TransformCoordinates(local, Jp);
      const got = posed.world[v];
      const e = Math.hypot(want.x - got[0], want.y - got[1], want.z - got[2]);
      worst = Math.max(worst, e);
      const pb = (per[name] ||= { n: 0, worst: 0, moved: 0, wantMoved: 0 }); pb.n++; pb.worst = Math.max(pb.worst, e);
      pb.moved = Math.max(pb.moved, Math.hypot(got[0] - rest.world[v][0], got[1] - rest.world[v][1], got[2] - rest.world[v][2]));
      pb.wantMoved = Math.max(pb.wantMoved, Math.hypot(want.x - rest.world[v][0], want.y - rest.world[v][1], want.z - rest.world[v][2]));
      moved = Math.max(moved, Math.hypot(got[0] - rest.world[v][0], got[1] - rest.world[v][1], got[2] - rest.world[v][2]));
      n++;
    }
    return { worst, n, total: rest.world.length, moved, bones, per };
  });
  if (sk.error || sk.worst > 1e-3) console.log(JSON.stringify(sk.error ? sk : sk.per));
  check(sk.n > sk.total * 0.6 && sk.worst < 1e-3 && sk.moved > 1, `mid-walk, Babylon's skinned vertices follow their joints (${sk.n}/${sk.total} wholly bound; worst ${sk.worst.toExponential(1)} studs; moved up to ${sk.moved.toFixed(2)} studs; bones ${sk.bones.join(' ')})`);

  const dead = await t.eval(() => { const b = window.studio.player.deadBox; return b && [b.min.y, b.max.y, b.max.x - b.min.x, b.max.z - b.min.z]; });
  check(dead && dead[1] - dead[0] < 3 && Math.max(dead[2], dead[3]) > 2.5, `the death pose's footprint is measured on the joints' boxes (height ${dead && (dead[1] - dead[0]).toFixed(2)}, length ${dead && Math.max(dead[2], dead[3]).toFixed(2)} studs, lying down)`);

  // Golden: mid-walk, from the front three-quarters. Walk away from the
  // camera over open ground, then swing the camera round to the face (camera
  // yaw = the character's yaw looks at its front) for two frames: the stride
  // is still mid-walk, and the fixed test clock makes its phase repeatable.
  await t.eval(() => { const c = window.studio.camera; c.yaw = Math.PI * 0.8; c.pitch = 0.15; c.zoom = c.z = c.dist = 10; c.update(0); });
  await t.sim(24, { move: [0, 1] });
  await t.eval(() => { const S = window.studio, c = S.camera; c.yaw = S.player.yaw + 0.6; c.pitch = 0.12; c.zoom = c.z = c.dist = 9; c.update(0); });
  await t.frames(2);
  await t.shot('charmaker2-walk'); await t.golden('charmaker2-walk');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
