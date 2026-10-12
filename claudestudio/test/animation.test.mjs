// Keyframe animation without the renderer (web/animation.js and the
// DataModel's Animator/AnimationTrack): sampling between keyframes, easing
// from the earlier pose, priorities and weights, loading by id, the track's
// clock and events. Run: node test/animation.test.mjs
import { DataModel, CF, methodOf } from '../web/datamodel.js';
import { compileSequence, sampleSequence, animatedJoints, poseEase, offsetToNode, nodeToOffset } from '../web/animation.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
const rotX = d => { const r = d * Math.PI / 180; return new CF([0, 0, 0, 1, 0, 0, 0, Math.cos(r), -Math.sin(r), 0, Math.sin(r), Math.cos(r)]); };
const angleX = cf => cf.toOrientation()[0];

const dm = new DataModel();
// keys: [[time, { joint: [deg, style?, dir?] }, name?]]
function sequence(keys, { loop = true, priority = 'Action', parent = dm.service('ServerStorage'), name = 'Seq' } = {}) {
  const ks = dm.create('KeyframeSequence'); ks.props.Name = name; ks.props.Loop = loop; ks.props.Priority = priority;
  for (const [t, joints, kname] of keys) {
    const kf = dm.create('Keyframe'); kf.props.Time = t; if (kname) kf.props.Name = kname;
    const root = dm.create('Pose'); root.props.Name = 'HumanoidRootPart'; root.props.Weight = 0; dm.setParent(root, kf);
    for (const [j, [deg, style, dir, w]] of Object.entries(joints)) {
      const p = dm.create('Pose'); p.props.Name = j; p.props.CFrame = rotX(deg);
      if (style) p.props.EasingStyle = style; if (dir) p.props.EasingDirection = dir; if (w !== undefined) p.props.Weight = w;
      dm.setParent(p, root);
    }
    dm.setParent(kf, ks);
  }
  dm.setParent(ks, parent);
  return ks;
}

// ---- sampling
{
  const seq = compileSequence(sequence([[0, { A: [0], B: [10] }], [1, { A: [90] }], [2, { A: [0], B: [30] }]]));
  check(seq.length === 2 && !seq.joints.has('HumanoidRootPart'), 'length is the last keyframe; weight-0 hierarchy poses are not joints');
  check(near(angleX(sampleSequence(seq, 0.5).get('A').cf), 45), 'linear: half way between 0 and 90 is 45');
  check(near(angleX(sampleSequence(seq, 1).get('B').cf), 20), 'a joint missing from a keyframe interpolates across it (B: 10 at 0, 30 at 2 -> 20 at 1)');
  check(near(angleX(sampleSequence(seq, -1).get('A').cf), 0) && near(angleX(sampleSequence(seq, 5).get('A').cf), 0), 'before the first and after the last key, the end keys hold');
}
{
  const seq = compileSequence(sequence([[0, { A: [0, 'Constant'] }], [1, { A: [90] }]]));
  check(near(angleX(sampleSequence(seq, 0.99).get('A').cf), 0) && near(angleX(sampleSequence(seq, 1).get('A').cf), 90), 'Constant holds the earlier pose until the next key');
}
{
  // The earlier pose's easing shapes the segment (the later one's is for the next segment).
  const seq = compileSequence(sequence([[0, { A: [0, 'CubicV2', 'In'] }], [1, { A: [80, 'Linear'] }]]));
  check(near(angleX(sampleSequence(seq, 0.5).get('A').cf), 80 * 0.125, 1e-3), `the segment eases by the earlier pose's style (CubicV2 In at half time: 1/8 of the way, ${angleX(sampleSequence(seq, 0.5).get('A').cf).toFixed(3)})`);
  check(near(poseEase(0.5, 'Cubic', 'In'), 1 - 0.125) && near(poseEase(0.5, 'CubicV2', 'In'), 0.125), "legacy Cubic runs In and Out the other way round from CubicV2 (Roblox's)");
}

// ---- priorities and weights
{
  const anim = dm.create('Animator');
  const mk = (deg, pri, weight) => ({ props: { Priority: pri }, seq: compileSequence(sequence([[0, { A: [deg] }]], { priority: pri })), time: 0, weight });
  anim.tracks = [mk(10, 'Action', 1), mk(80, 'Movement', 1)];
  let j = animatedJoints(anim).get('A');
  check(near(angleX(j.cf), 10) && near(j.w, 1), 'a higher priority at full weight hides a lower one on the same joint');
  anim.tracks = [mk(10, 'Action', 0.5), mk(80, 'Movement', 1)];
  j = animatedJoints(anim).get('A');
  check(near(angleX(j.cf), 45, 1e-3) && near(j.w, 1), `the lower fills what a half-weight higher leaves (10 and 80 half and half: ${angleX(j.cf).toFixed(2)})`);
  anim.tracks = [mk(20, 'Action', 1), mk(60, 'Action', 1)];
  j = animatedJoints(anim).get('A');
  check(near(angleX(j.cf), 40, 1e-3), `the same priority blends by weight (${angleX(j.cf).toFixed(2)})`);
  anim.tracks = [mk(30, 'Action', 0.25)];
  j = animatedJoints(anim).get('A');
  check(near(j.w, 0.25), 'a lone track at weight 0.25 takes a quarter of the joint (the rest is the character\'s own pose)');
}

// ---- the rig's frame: a half turn about Y, and back
{
  const cf = CF.fromOrientation(0.5, 1, -2, 30, 20, 10), o = offsetToNode(cf), back = nodeToOffset(o.p, o.q);
  check(back.m.every((v, i) => near(v, cf.m[i], 1e-5)), 'pose offsets convert to the rig node frame and back exactly');
  check(o.p[0] === -0.5 && o.p[2] === 2, 'character-frame X and Z flip in the node frame (the model faces +Z, Roblox -Z)');
}

// ---- Animator, AnimationTrack (by script, through the DataModel's methods)
{
  const call = (inst, m, ...a) => { const fn = methodOf(inst.ClassName, m); if (!fn) throw new Error('no method ' + m); return fn(inst, ...a)[0]; };
  const hum = dm.create('Humanoid'); dm.setParent(hum, dm.workspace);
  const ks = sequence([[0, { A: [0] }], [0.5, { A: [45] }, 'Mid'], [1, { A: [90] }]], { loop: false, name: 'Wave' });
  const anim = dm.create('Animation'); anim.props.AnimationId = call(dm.service('KeyframeSequenceProvider'), 'RegisterKeyframeSequence', ks);
  const tr = call(hum, 'LoadAnimation', anim);
  check(/^rbxtemp:\/\/\d+$/.test(anim.props.AnimationId) && hum.children.some(c => c.ClassName === 'Animator') && tr.props.Length === 1 && tr.props.Looped === false, `registered id ${anim.props.AnimationId}; Humanoid:LoadAnimation makes an Animator; Length 1, Looped from the sequence`);
  const byPath = dm.create('Animation'); byPath.props.AnimationId = 'studio://ServerStorage.Wave';
  check(dm.sequenceOf(byPath.props.AnimationId) === ks, 'studio:// and the full name finds the sequence');
  const events = [];
  const realFire = dm.fire.bind(dm);
  dm.fire = (i, e, a) => { if (i === tr) events.push(e + (a && a.length ? ':' + a[0] : '')); realFire(i, e, a); };
  call(tr, 'Play', 0);
  for (let i = 0; i < 30; i++) dm.stepAnimations(1 / 60);
  const a = tr.animator;
  check(near(tr.props.TimePosition, 0.5, 1e-9) && near(angleX(animatedJoints(a).get('A').cf), 45, 1e-3), `30 steps of 1/60: TimePosition 0.5, pose 45 (${tr.props.TimePosition})`);
  tr.props.TimePosition = 0.75; // a script seeks
  dm.stepAnimations(0);
  check(near(angleX(animatedJoints(a).get('A').cf), 67.5, 1e-3), 'setting TimePosition seeks');
  call(tr, 'AdjustSpeed', 2);
  for (let i = 0; i < 30; i++) dm.stepAnimations(1 / 60);
  check(events.join(',') === 'Stopped,Ended', `a seek past a named keyframe skips it; the end fires Stopped, then Ended after the fade, once each (${events.join(',')})`);
  check(!tr.props.IsPlaying && !(a.tracks || []).includes(tr) && call(a, 'GetPlayingAnimationTracks').length === 0, 'an ended track is no longer playing or held by its Animator');
  // Looping: DidLoop once per wrap, KeyframeReached each lap.
  events.length = 0; tr.props.Looped = true;
  call(tr, 'Play', 0, 1, 1);
  for (let i = 0; i < 150; i++) dm.stepAnimations(1 / 60);
  check(events.join(',') === 'KeyframeReached:Mid,DidLoop,KeyframeReached:Mid,DidLoop,KeyframeReached:Mid', `looped for 2.5 s: three laps' keyframes, two DidLoops (${events.join(',')})`);
  // Fades: Stop(0.5) takes half a second to reach weight 0.
  call(tr, 'Stop', 0.5);
  for (let i = 0; i < 15; i++) dm.stepAnimations(1 / 60);
  check(near(tr.weight, 0.5, 1e-6), `Stop(0.5): half way through the fade, weight 0.5 (${tr.weight})`);
  dm.fire = realFire;
}

if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('animation test PASS');
