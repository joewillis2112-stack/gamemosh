// Roblox's R15 clips (assets/characters/r15/anims, tools/r15anims.mjs) on an R15 body drawn from a .glb
// whose part nodes carry their joints (extras.r15: joint, c0, c1, size; tools/body.mjs, tools/r15.mjs).
// Roblox's rule for a joint: Part1 = Part0 * C0 * Transform * C1:Inverse(), so each part's node, a
// child of its Part0's node, sits at C0 * T(t) * C1:Inverse(): a pose turns the part about its joint.
// The clip files become KeyframeSequence-shaped objects for animation.js (Roblox's easing and all).
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { CF } from '../cframe.js';
import { compileSequence, sampleSequence } from '../animation.js';

/** The character's states (runtime/character.js) and the R15 clip each plays. */
export const R15_STATE_CLIPS = { idle: 'idle', walk: 'walk', sprint: 'run', jump: 'jump', fall: 'fall', climb: 'climb', swim: 'swim', sit: 'sit' };

/** An R15 body's parts from a loaded glb: Map(part name -> { node, size, joint, c0, c1 }), or null if
 *  the file isn't an R15 body. */
export function r15Rig(res) {
  const out = new Map();
  for (const n of res.transformNodes.concat(res.meshes)) {
    const x = n.metadata && n.metadata.gltf && n.metadata.gltf.extras && n.metadata.gltf.extras.r15;
    if (x) out.set(x.part, { node: n, size: x.size, joint: x.joint || null, c0: x.c0 ? new CF(x.c0) : null, c1: x.c1 ? new CF(x.c1) : null });
  }
  return out.has('LowerTorso') && out.has('UpperTorso') ? out : null;
}

// A clip file as what compileSequence reads (a KeyframeSequence's children and props).
function toSequence(json) {
  return {
    props: { Loop: json.loop, Priority: json.priority },
    children: json.keyframes.map(k => ({
      ClassName: 'Keyframe', props: { Time: k.t, Name: k.name || 'Keyframe' },
      children: k.poses.map(([joint, v, w, style, dir]) => ({ ClassName: 'Pose', props: { Name: joint, Weight: w, CFrame: CF.fromQuat(...v), EasingStyle: style, EasingDirection: dir }, children: [] })),
    })),
  };
}

const cache = new Map();
/** The clips (compiled), fetched once per page. */
export function loadR15Clips(base = new URL('../../assets/characters/r15/anims/', import.meta.url).href) {
  const names = [...new Set(Object.values(R15_STATE_CLIPS))];
  if (!cache.has(base)) cache.set(base, Promise.all(names.map(async n => {
    const r = await fetch(base + n + '.json');
    if (!r.ok) throw new Error(`no R15 clip ${n}`);
    return [n, compileSequence(toSequence(await r.json()))];
  })).then(Object.fromEntries));
  return cache.get(base);
}

/** Each part's node at C0 * T * C1:Inverse() for a joint's Transform T (identity: rest). */
export function placeNode(part, T) {
  const cf = part.c0.mul(T || new CF()).mul(part.c1.inverse()), [x, y, z, w] = cf.toQuat();
  return { p: new Vector3(cf.x, cf.y, cf.z), q: new Quaternion(x, y, z, w) };
}

/** Scripts' AnimationTracks over an R15 body (animation.js animatedJoints: Part1 name -> { cf, w }):
 *  each part's node at C0 * T * C1:Inverse() from its parent, as the clips place it, blended by weight
 *  over what's there. (R6's overlay turns the pose into the blocky model's node frame instead.) */
export function overlayR15(rig, joints) {
  for (const [name, { cf, w }] of joints) {
    const part = rig.get(name);
    if (!part || !part.joint || w <= 0) continue;
    const { p, q } = placeNode(part, cf), n = part.node;
    if (w >= 1) { n.rotationQuaternion.copyFrom(q); n.position.copyFrom(p); continue; }
    n.rotationQuaternion.copyFrom(Quaternion.Slerp(n.rotationQuaternion, q, w));
    n.position.copyFrom(Vector3.Lerp(n.position, p, w));
  }
}

/** Add the clips to an Animator (runtime/character.js) under the character's state names: per part,
 *  a rotation and a position channel from its joint's pose at the clip's time. */
export function addR15Clips(anim, rig, clips) {
  for (const [state, name] of Object.entries(R15_STATE_CLIPS)) {
    const seq = clips[name];
    if (!seq) continue;
    let at = -1, poses = null; // one sample per time, shared by every channel
    const pose = t => { if (t !== at) { at = t; poses = sampleSequence(seq, Math.min(t, seq.length)); } return poses; };
    const channels = [];
    for (const [partName, part] of rig) {
      if (!part.joint) continue;
      const node = t => { const k = pose(t).get(partName); return placeNode(part, k && k.cf); }; // sampleSequence gives { cf, w }
      channels.push({ target: part.node, path: 'rotationQuaternion', at: t => node(t).q });
      channels.push({ target: part.node, path: 'position', at: t => node(t).p });
    }
    // sample(t): every joint's pose at t (what the channels draw), for checking against.
    anim.clips[state] = { channels, from: 0, to: Math.max(seq.length, 1 / 60) * 60, fps: 60, loop: seq.loop !== false, sample: t => sampleSequence(seq, Math.min(t, seq.length)) };
  }
}
