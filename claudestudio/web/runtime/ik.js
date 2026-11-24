// IKControl (Roblox; mashup-research/ROBLOX_IKCONTROL_2026-11-24.md): procedural poses from inverse
// kinematics on a character's body. Solved each frame after its animation, on the DataModel's part frames
// (the parts are where the drawn nodes are: runtime/charbody.js), then written back into the drawn nodes,
// so the parts, their Motor6D.Transforms and the picture all follow.
// - The chain: EndEffector's part (a BasePart, a Motor6D's Part1, or an Attachment's part with the
//   attachment's frame as the effector) up through the joints to ChainRoot. Each chain part turns about
//   its own joint (its joint's point: the part's frame times its C1).
// - Position: two segments (upper limb, lower limb, end) solve exactly (law of cosines) in the plane of the
//   Pole, or, without one, of the limb's natural bend: elbows down, back and a little out, knees forward (an
//   Arm or Leg chain as Roblox names them); other chains keep their current bend. Any other length: cyclic coordinate descent.
//   Out of reach, the chain stretches straight towards the target.
// - Rotation: the end effector turns to the target's rotation. Transform: Position, then Rotation.
// - LookAt: the effector's forward axis (EndEffectorOffset's, if set) aimed at the target, the turn shared
//   along the chain from the root.
// - Weight blends the target from the animated effector to the IK target; SmoothTime eases the target with
//   a critically damped spring; Priority orders the solves (higher later).
// OURS where Roblox doesn't say: the solvers above; the spring's rate (2 / SmoothTime, so it arrives in
// about SmoothTime); Rotation turning only the end effector; LookAt sharing the turn equally.
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.js';
import { CF } from '../cframe.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const l = len(a); return l > 1e-12 ? mulS(a, 1 / l) : [0, 0, 0]; };
const pos = cf => [cf.x, cf.y, cf.z];
const at = p => new CF([p[0], p[1], p[2], 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const turnOnly = cf => new CF([0, 0, 0, ...cf.m.slice(3)]);
const withPos = (cf, p) => new CF([p[0], p[1], p[2], ...cf.m.slice(3)]);
const look = cf => [-cf.m[5], -cf.m[8], -cf.m[11]]; // LookVector: -Z column
const upV = cf => [cf.m[4], cf.m[7], cf.m[10]], rightV = cf => [cf.m[3], cf.m[6], cf.m[9]]; // UpVector, RightVector

function axisAngle(a, ang) { const s = Math.sin(ang / 2); return CF.fromQuat(0, 0, 0, a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)); }
// The shortest turn taking direction u to v (unit vectors), as a CF with no translation.
function fromTo(u, v, share = 1) {
  const c = Math.max(-1, Math.min(1, dot(u, v)));
  if (c > 1 - 1e-10) return new CF();
  let ax = cross(u, v);
  if (len(ax) < 1e-9) ax = Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]);
  return axisAngle(unit(ax), Math.acos(c) * share);
}
// cf turned by R (world space) about the world point p.
const turnAbout = (cf, p, R) => at(p).mul(R).mul(at(mulS(p, -1))).mul(cf);
// Spherical blend of two rotations (as CFs), t in 0..1.
function slerpRot(a, b, t) {
  const qa = Quaternion.FromArray(a.toQuat()), qb = Quaternion.FromArray(b.toQuat()), q = Quaternion.Slerp(qa, qb, t);
  return CF.fromQuat(0, 0, 0, q.x, q.y, q.z, q.w);
}

/** The IKControls on a character, solved each frame. body: its CharacterBody (parts, joints, the node map). */
export class IKSolver {
  constructor(dm) { this.dm = dm; }

  // An instance's world frame (a part, an attachment, a Motor6D's Part1), or null.
  frameOf(i) {
    if (!i || i.destroyed) return null;
    if (i.ClassName === 'Attachment') return i.props.WorldCFrame || null;
    if (i.ClassName === 'Motor6D') return this.frameOf(i.props.Part1);
    return i.props.CFrame || null;
  }

  // The chain for a control on this body: { parts: [root ... end], joints, effectorOffset } or null.
  chain(body, c) {
    const P = c.props;
    let end = P.EndEffector, offset = new CF();
    if (!end || !P.ChainRoot || !P.Target) return null;
    if (end.ClassName === 'Attachment') { offset = end.props.CFrame; end = end.parent; }
    else if (end.ClassName === 'Motor6D') end = end.props.Part1;
    const byPart1 = new Map(body.joints.map(J => [J.part1, J]));
    const parts = [], joints = [];
    for (let p = end; p; ) {
      const J = byPart1.get(p);
      if (!J) return null; // not a jointed part of this body (the root part, or another model's)
      parts.unshift(p); joints.unshift(J);
      if (p === P.ChainRoot) return { parts, joints, offset };
      p = J.part0;
    }
    return null;
  }

  /** Solve every enabled control under the body's Humanoid, then write the result into the drawn nodes.
   *  Returns whether anything moved. */
  solve(body, dt) {
    const hum = body.model.children.find(c => c.ClassName === 'Humanoid');
    if (!hum) return false;
    const controls = hum.children.filter(c => c.ClassName === 'IKControl' && c.props.Enabled && c.props.Type).sort((a, b) => a.props.Priority - b.props.Priority);
    if (!controls.length) return false;
    const W = new Map(); // part -> solved world CFrame (starts as animated)
    const frame = p => W.get(p) || p.props.CFrame;
    let moved = false;
    for (const c of controls) {
      const ch = this.chain(body, c), st = c.ik || (c.ik = {});
      st.chain = ch;
      if (!ch) continue;
      const P = c.props, n = ch.parts.length - 1;
      const target = this.frameOf(P.Target); if (!target) continue;
      const jointPoint = i => pos(frame(ch.parts[i]).mul(ch.joints[i].j.props.C1));
      const rel = ch.offset.mul(P.EndEffectorOffset); // the effector frame in its part's frame
      const effector = () => frame(ch.parts[n]).mul(rel);
      // The final target: the Target's frame with Offset, from the animated effector by Weight, smoothed.
      const raw0 = target.mul(P.Offset), w = Math.max(0, Math.min(1, P.Weight)), e0 = effector();
      const raw = withPos(slerpRot(turnOnly(e0), turnOnly(raw0), w), add(pos(e0), mulS(sub(pos(raw0), pos(e0)), w)));
      st.raw = raw;
      let goal = raw;
      if (P.SmoothTime > 0 && st.smooth) {
        if (dt > 0) {
          const om = 2 / P.SmoothTime, x = om * dt, k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
          const change = sub(pos(st.smooth), pos(raw)), temp = mulS(add(st.vel, mulS(change, om)), dt);
          st.vel = mulS(sub(st.vel, mulS(temp, om)), k);
          st.smooth = withPos(slerpRot(turnOnly(st.smooth), turnOnly(raw), 1 - k), add(pos(raw), mulS(add(change, temp), k)));
        }
        goal = st.smooth;
      } else { st.smooth = raw; st.vel = [0, 0, 0]; }
      st.goal = goal;
      const T = pos(goal), type = P.Type;
      // Turn chain parts i..n about part i's joint by R (world).
      const turn = (i, R) => { const p = jointPoint(i); for (let k = i; k <= n; k++) W.set(ch.parts[k], turnAbout(frame(ch.parts[k]), p, R)); };
      // Bring point eff() to T by turning joints 0..k: two of them exactly, otherwise by coordinate descent.
      const reach = (k, eff, T) => {
        if (k === 1) return this.twoBone(ch, c, jointPoint, eff, turn, T, body);
        for (let it = 0; it < 16; it++) {
          for (let i = k; i >= 0; i--) { const J = jointPoint(i), a = sub(eff(), J), b = sub(T, J); if (len(a) > 1e-6 && len(b) > 1e-6) turn(i, fromTo(unit(a), unit(b))); }
          if (len(sub(eff(), T)) < 1e-4) break;
        }
      };
      if (type === 'Position') reach(n === 2 ? 1 : n, () => pos(effector()), T);
      if (type === 'Rotation' || type === 'Transform') {
        // Where the end part must be for its effector frame to be the goal; Transform first brings its joint
        // there through the chain above it, then both turn the end part to it about that joint.
        const D = goal.mul(rel.inverse());
        if (type === 'Transform' && n > 0) reach(n - 1, () => jointPoint(n), pos(D.mul(ch.joints[n].j.props.C1)));
        turn(n, turnOnly(D).mul(turnOnly(frame(ch.parts[n])).inverse()));
      }
      if (type === 'LookAt') {
        for (let i = 0; i <= n; i++) {
          const e = effector(), f = unit(look(e)), d = unit(sub(T, pos(e)));
          if (len(d) > 0) turn(i, fromTo(f, d, 1 / (n - i + 1)));
        }
      }
      st.nodes = ch.parts.map(p => frame(p));
      moved = true;
    }
    if (moved) this.write(body, W);
    return moved;
  }

  // Two segments: the middle joint placed by the law of cosines in the bend plane, then each segment
  // turned onto it (the end keeps its pose relative to the lower limb).
  twoBone(ch, c, jointPoint, eff, turn, T, body) {
    const S = jointPoint(0), E = jointPoint(1), H = eff();
    const a = len(sub(E, S)), b = len(sub(H, E));
    const toT = sub(T, S), dRaw = len(toT);
    if (a < 1e-6 || b < 1e-6 || dRaw < 1e-6) return;
    const d = Math.max(Math.abs(a - b) + 1e-6, Math.min(a + b - 1e-6, dRaw)), u = unit(toT);
    // The bend plane: towards the Pole, or the limb's natural bend, or the current one.
    let hint = null;
    const pole = c.props.Pole && this.frameOf(c.props.Pole);
    const end = ch.parts[ch.parts.length - 1].props.Name, root = ch.parts[0].props.Name;
    if (pole) hint = sub(pos(pole), S);
    else if (/^(Left|Right)Hand$/.test(end) && root === end.replace('Hand', 'UpperArm')) { // elbows down, back and a little out
      const t = body.parts.UpperTorso && body.parts.UpperTorso.props.CFrame, side = end.startsWith('Right') ? 1 : -1;
      if (t) hint = add(add(mulS(upV(t), -1), mulS(look(t), -0.6)), mulS(rightV(t), 0.3 * side));
    } else if (/^(Left|Right)Foot$/.test(end) && root === end.replace('Foot', 'UpperLeg')) { // knees forward (and up, reaching forward)
      const t = body.parts.LowerTorso && body.parts.LowerTorso.props.CFrame;
      if (t) hint = add(look(t), mulS(upV(t), 0.3));
    }
    if (!hint) hint = sub(E, S);
    let v = sub(hint, mulS(u, dot(hint, u)));
    if (len(v) < 1e-6) v = sub(sub(E, S), mulS(u, dot(sub(E, S), u)));
    if (len(v) < 1e-6) v = Math.abs(u[1]) < 0.9 ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0]);
    v = unit(v);
    const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))), sinA = Math.sqrt(1 - cosA * cosA);
    const E2 = add(S, mulS(add(mulS(u, cosA), mulS(v, sinA)), a));
    turn(0, fromTo(unit(sub(E, S)), unit(sub(E2, S))));
    const Hn = eff(), En = jointPoint(1), Tn = add(S, mulS(u, d));
    turn(1, fromTo(unit(sub(Hn, En)), unit(sub(Tn, En))));
  }

  // The solved part frames into the drawn nodes (part = node * map), root first so children follow; the
  // body then writes the parts and Transforms from the nodes as every frame.
  write(body, W) {
    const order = body.joints.filter(J => W.has(J.part1)); // body.joints run from the root outward
    for (const J of order) {
      const n = J.node; if (!n) continue;
      const want = W.get(J.part1).mul(body.map.get(J.part1).inverse());
      const m = n.computeWorldMatrix(true), s = new Vector3(); m.decompose(s, undefined, undefined);
      const [x, y, z, w] = want.toQuat(), world = Matrix.Compose(s, new Quaternion(x, y, z, w), new Vector3(want.x, want.y, want.z));
      const parent = n.parent; parent.computeWorldMatrix(true);
      const local = world.multiply(Matrix.Invert(parent.getWorldMatrix())), ls = new Vector3(), lq = new Quaternion(), lp = new Vector3();
      local.decompose(ls, lq, lp);
      n.position.copyFrom(lp); n.rotationQuaternion.copyFrom(lq);
      n.computeWorldMatrix(true);
    }
  }
}
