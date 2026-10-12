// Keyframe animation, Roblox's way: a KeyframeSequence holds Keyframes (Time),
// each holding Poses nested by joint (HumanoidRootPart > Torso > Head ...);
// a Pose's CFrame is that joint's offset from its rest (Motor6D.Transform).
// A joint is interpolated between the keyframes that pose it, eased by the
// earlier pose's EasingStyle/EasingDirection. An Animator's AnimationTracks
// play sequences; for each joint the highest-priority playing tracks win and
// tracks at the same priority blend by weight.
// Engine-free: the renderer asks `animatedJoints(animator)` for the offsets.
import { CF } from './cframe.js';
import { ease } from './tween.js';

const IDENTITY = new CF();

/** A KeyframeSequence read into plain data: { length, loop, priority, joints: Map(name -> keys), names: [{t, name}] }. */
export function compileSequence(ks) {
  const joints = new Map(), names = [];
  let length = 0;
  const kfs = ks.children.filter(c => c.ClassName === 'Keyframe').sort((a, b) => a.props.Time - b.props.Time);
  for (const kf of kfs) {
    const t = kf.props.Time;
    length = Math.max(length, t);
    if (kf.props.Name !== 'Keyframe') names.push({ t, name: kf.props.Name });
    const walk = p => {
      for (const c of p.children) {
        if (c.ClassName !== 'Pose') continue;
        // A Pose with weight 0 only carries the hierarchy (Roblox's editor makes these for parents).
        if (c.props.Weight > 0) {
          if (!joints.has(c.props.Name)) joints.set(c.props.Name, []);
          joints.get(c.props.Name).push({ t, cf: c.props.CFrame, w: c.props.Weight, style: c.props.EasingStyle, dir: c.props.EasingDirection });
        }
        walk(c);
      }
    };
    walk(kf);
  }
  return { length, loop: ks.props.Loop, priority: ks.props.Priority, joints, names };
}

// Roblox's legacy pose styles (Cubic, Elastic, Bounce) run In and Out the other
// way round from TweenService's; CubicV2 was added with the TweenService
// direction. UNSURE: taken from Roblox's release notes as remembered, not measured.
const LEGACY_FLIP = { In: 'Out', Out: 'In', InOut: 'InOut' };
export function poseEase(alpha, style, dir) {
  if (style === 'Constant') return alpha >= 1 ? 1 : 0;
  if (style === 'Linear') return alpha;
  if (style === 'CubicV2') return ease(alpha, 'Cubic', dir);
  return ease(alpha, style, LEGACY_FLIP[dir] || dir);
}

/** One joint's offset at time t: { cf, w } (holds the first and last keys outside them). */
export function sampleJoint(keys, t) {
  if (t <= keys[0].t || keys.length === 1) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i], b = keys[i + 1], span = b.t - a.t;
  const e = poseEase(span > 0 ? (t - a.t) / span : 1, a.style, a.dir);
  return { cf: a.cf.lerp(b.cf, e), w: a.w + (b.w - a.w) * e };
}

/** Every joint's offset at time t: Map(name -> { cf, w }). */
export function sampleSequence(seq, t) {
  const out = new Map();
  for (const [name, keys] of seq.joints) out.set(name, sampleJoint(keys, t));
  return out;
}

const PRIORITY = { Idle: 0, Movement: 1, Action: 2, Action2: 3, Action3: 4, Action4: 5, Core: 1000 };

/**
 * What an Animator's playing tracks do to its rig now: Map(joint -> { cf, w }),
 * w the share of the pose (0..1) the tracks take over from whatever else moves
 * the joint (the character's own clips). Per joint: the highest priority with
 * any weight wins, its tracks blended by weight (a lone track at weight 0.5
 * takes half); lower priorities fill only what the higher leave (Roblox's rule).
 */
export function animatedJoints(animator) {
  const tracks = (animator.tracks || []).filter(tr => tr.weight > 0 && tr.seq);
  if (!tracks.length) return new Map();
  const byJoint = new Map(); // joint -> [{ pri, cf, w }]
  for (const tr of tracks) {
    const pri = PRIORITY[tr.props.Priority] ?? 2;
    for (const [name, s] of sampleSequence(tr.seq, tr.time)) {
      if (!byJoint.has(name)) byJoint.set(name, []);
      byJoint.get(name).push({ pri, cf: s.cf, w: s.w * tr.weight });
    }
  }
  const out = new Map();
  for (const [name, list] of byJoint) {
    list.sort((a, b) => b.pri - a.pri);
    let cf = IDENTITY, taken = 0;
    for (let i = 0; i < list.length && taken < 1;) {
      // One priority level: blend its tracks by weight.
      const pri = list[i].pri, level = [];
      while (i < list.length && list[i].pri === pri) level.push(list[i++]);
      const sum = level.reduce((a, l) => a + l.w, 0);
      if (sum <= 0) continue;
      let lcf = level[0].cf, acc = level[0].w;
      for (const l of level.slice(1)) { acc += l.w; lcf = lcf.lerp(l.cf, l.w / acc); }
      const share = Math.min(1, sum) * (1 - taken);
      cf = taken > 0 ? lcf.lerp(cf, taken / (taken + share)) : lcf;
      taken += share;
    }
    if (taken > 0) out.set(name, { cf, w: taken });
  }
  return out;
}

/**
 * Advance one Animator's tracks by dt: time, fades, looping and the events
 * (DidLoop, KeyframeReached, Stopped, Ended). `fire(inst, ev, args)` and
 * `set(inst, prop, value)` are the DataModel's.
 */
export function stepTracks(animator, dt, { fire, set }) {
  for (const tr of [...(animator.tracks || [])]) {
    if (tr.playing && tr.seq) {
      const len = tr.seq.length, before = tr.time;
      tr.time += dt * tr.props.Speed;
      let looped = false;
      if (len <= 0) tr.time = 0;
      else if (tr.time >= len || tr.time < 0) {
        // A looped track wraps once past its end (exactly at the end it shows the last pose).
        if (tr.props.Looped) { if (tr.time > len || tr.time < 0) { tr.time = ((tr.time % len) + len) % len; looped = true; } }
        else tr.time = Math.min(Math.max(tr.time, 0), len);
      }
      // Named keyframes passed this step (forward play), in order.
      if (tr.props.Speed > 0) for (const k of tr.seq.names) {
        if (looped ? (k.t > before || k.t <= tr.time) : (k.t > before && k.t <= tr.time)) fire(tr, 'KeyframeReached', [k.name]);
      }
      if (looped) fire(tr, 'DidLoop', []);
      if (!tr.props.Looped && len > 0 && (tr.time >= len || tr.time <= 0 && tr.props.Speed < 0)) stopTrack(tr, tr.fadeOut ?? 0.1, { fire, set });
    }
    // Fade toward the target weight.
    if (tr.weight !== tr.target) {
      // fadeTime is the time from where the fade began to the target.
      const step = tr.fade > 0 ? Math.max(Math.abs(tr.target - tr.fadeFrom), 1e-3) * dt / tr.fade : Infinity;
      tr.weight = tr.target > tr.weight ? Math.min(tr.target, tr.weight + step) : Math.max(tr.target, tr.weight - step);
    }
    set(tr, 'WeightCurrent', tr.weight);
    set(tr, 'TimePosition', tr.time);
    if (!tr.playing && tr.weight <= 0 && !tr.ended) {
      tr.ended = true;
      animator.tracks = animator.tracks.filter(t => t !== tr);
      fire(tr, 'Ended', []);
    }
  }
}

export function stopTrack(tr, fade, { fire, set }) {
  if (!tr.playing) return;
  tr.playing = false;
  tr.fade = Math.max(0, fade); tr.fadeFrom = tr.weight; tr.target = 0;
  if (tr.fade === 0) tr.weight = 0;
  set(tr, 'IsPlaying', false);
  set(tr, 'WeightTarget', 0);
  fire(tr, 'Stopped', []);
}

// ------------------------------------------------------------------ the rig
// Joint names as Roblox's R6 rig has them, to our blocky rig's nodes. Poses may
// also name the nodes themselves. UNSURE where R6 differs: there the legs hang
// from the Torso, so a Torso pose turns the whole body; ours hang from the root,
// so a Torso pose turns the upper body only (like R15's Waist).
export const R6 = { HumanoidRootPart: 'root', Torso: 'torso', Head: 'head', 'Left Arm': 'arm-left', 'Right Arm': 'arm-right', 'Left Leg': 'leg-left', 'Right Leg': 'leg-right' };
export const R6_TREE = { HumanoidRootPart: null, Torso: 'HumanoidRootPart', Head: 'Torso', 'Left Arm': 'Torso', 'Right Arm': 'Torso', 'Left Leg': 'Torso', 'Right Leg': 'Torso' };
export const nodeOfJoint = name => R6[name] || name;

/**
 * A pose offset in the character's frame (Roblox's: +X its right, +Y up, it
 * faces -Z) to the rig's node frame (the model faces +Z, +X is its left): a
 * half turn about Y. Returns { p: [x,y,z] studs, q: [x,y,z,w] }.
 */
export function offsetToNode(cf) {
  const [x, y, z, w] = cf.toQuat();
  return { p: [-cf.x, cf.y, -cf.z], q: [-x, y, -z, w] };
}
/** The inverse: a node-frame rotation (quaternion) and offset (studs) to a Pose CFrame. */
export function nodeToOffset(p, q) {
  return CF.fromQuat(-p[0], p[1], -p[2], -q[0], q[1], -q[2], q[3]);
}
