// The character's body in the DataModel: Roblox's R6 parts (Head, Torso, Left/Right Arm, Left/Right
// Leg, beside the HumanoidRootPart) joined by its Motor6Ds (RootJoint in HumanoidRootPart; Neck,
// Left/Right Shoulder, Left/Right Hip in Torso), with R6's standard sizes, C0 and C1. Scripts see
// and read them as in Roblox (character.Head, Torso.Neck, ...).
// The drawn rig (runtime/character.js) leads: each frame every part is placed where its node is
// (a fixed node-to-part frame, taken from the rest pose), and each joint's Transform is what places
// it (C0:Inverse() * Part0:Inverse() * Part1 * C1), as an Animator would have written it. A script's
// C0 or C1 differing from the standard one turns or moves the drawn node by that difference (the
// common Neck.C0 head-turn), and the parts follow it. UNSURE: a script setting Transform itself is
// overwritten the next frame (Roblox runs Animators before Stepped; here the rig poses itself in
// the controller step, after Stepped).
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.js';
import { CF } from '../cframe.js';
import { V3 } from '../datamodel.js';
import { offsetToNode, nodeToOffset, R6 } from '../animation.js';

const R = (x, y, z, ...m) => new CF([x, y, z, ...m]);
// R6's parts and joints (Roblox's default R6 character).
export const R6_PARTS = [
  ['Head', [2, 1, 1], [0, 1.5, 0]], ['Torso', [2, 2, 1], [0, 0, 0]],
  ['Left Arm', [1, 2, 1], [-1.5, 0, 0]], ['Right Arm', [1, 2, 1], [1.5, 0, 0]],
  ['Left Leg', [1, 2, 1], [-0.5, -2, 0]], ['Right Leg', [1, 2, 1], [0.5, -2, 0]],
];
export const R6_JOINTS = [
  // name, in, Part0, Part1, C0, C1
  ['RootJoint', 'HumanoidRootPart', 'HumanoidRootPart', 'Torso', R(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0), R(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)],
  ['Neck', 'Torso', 'Torso', 'Head', R(0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0), R(0, -0.5, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)],
  ['Left Shoulder', 'Torso', 'Torso', 'Left Arm', R(-1, 0.5, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0), R(0.5, 0.5, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0)],
  ['Right Shoulder', 'Torso', 'Torso', 'Right Arm', R(1, 0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0), R(-0.5, 0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0)],
  ['Left Hip', 'Torso', 'Torso', 'Left Leg', R(-1, -1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0), R(-0.5, 1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0)],
  ['Right Hip', 'Torso', 'Torso', 'Right Leg', R(1, -1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0), R(0.5, 1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0)],
];

// A node's world frame without its scale (the model is scaled to studs), as a CFrame.
function nodeCF(n) {
  const m = n.computeWorldMatrix(true), s = new Vector3(), q = new Quaternion(), p = new Vector3();
  m.decompose(s, q, p);
  return CF.fromQuat(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
}

export class CharacterBody {
  /** dm; the drawn character (runtime/character.js); the character Model and its HumanoidRootPart. */
  constructor(dm, char, model, root) {
    Object.assign(this, { dm, char, model, root });
    const byName = {};
    for (const [name, size, at] of R6_PARTS) {
      const p = dm.create('Part');
      Object.assign(p.props, { Name: name, Size: new V3(...size), CanCollide: name === 'Head' || name === 'Torso', CFrame: root.props.CFrame.mul(new CF([...at, 1, 0, 0, 0, 1, 0, 0, 0, 1])) });
      p.isCharacter = true; // drawn and moved by the rig, not the World
      dm.setParent(p, model);
      byName[name] = p;
    }
    byName.HumanoidRootPart = root;
    this.parts = byName;
    this.joints = R6_JOINTS.map(([name, holder, a, b, C0, C1]) => {
      const j = dm.create('Motor6D');
      Object.assign(j.props, { Name: name, C0, C1 });
      dm.set(j, 'Part0', byName[a]); dm.set(j, 'Part1', byName[b]);
      dm.setParent(j, byName[holder]);
      return { j, C0, C1, part0: byName[a], part1: byName[b], node: char.anim.byName(R6[b]) };
    });
    this.mapping();
  }

  // Node to part frames, from the rest pose with the character at the origin facing as the HRP's
  // CFrame says it does: part = node * map.
  mapping() {
    const ch = this.char, saved = ch.anim.nodes.map(n => [n, n.position.clone(), n.rotationQuaternion.clone(), n.scaling.clone()]);
    const hp = ch.holder.position.clone(), hq = ch.holder.rotationQuaternion ? ch.holder.rotationQuaternion.clone() : null;
    for (const n of ch.anim.nodes) { const r = ch.anim.rest.get(n); n.position.copyFrom(r.p); n.rotationQuaternion.copyFrom(r.q); n.scaling.copyFrom(r.s); }
    ch.holder.position.set(0, 0, 0); ch.holder.rotationQuaternion = Quaternion.Identity();
    // The HRP at rest: 3 studs above the feet, facing +Z (yaw 0, as players.syncRoot writes it).
    const hrp = CF.fromOrientation(0, 3, 0, 0, -180, 0);
    const restOf = {}; for (const [name, , at] of R6_PARTS) restOf[name] = hrp.mul(new CF([...at, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
    this.map = new Map();
    for (const J of this.joints) if (J.node) this.map.set(J.part1, nodeCF(J.node).inverse().mul(restOf[J.part1.props.Name]));
    for (const [n, p, q, s] of saved) { n.position.copyFrom(p); n.rotationQuaternion.copyFrom(q); n.scaling.copyFrom(s); }
    ch.holder.position.copyFrom(hp); if (hq) ch.holder.rotationQuaternion = hq;
  }

  /** Each frame, after the rig is posed and the HRP placed: scripts' C0/C1 onto the rig, then the
   *  parts where the rig is and the joints' Transforms. */
  update() {
    const ch = this.char, k = 1 / ch.modelScale;
    // A script's C0 or C1: the difference from R6's, as an offset at the joint (Part1 = Part0 * C0 *
    // D * T * E:Inverse() * C1:Inverse()), drawn on the node.
    for (const J of this.joints) {
      const P = J.j.props;
      if (!J.node || (P.C0.equals(J.C0) && P.C1.equals(J.C1))) continue;
      const D = J.C0.inverse().mul(P.C0), E = J.C1.inverse().mul(P.C1);
      const r = ch.anim.rest.get(J.node), n = J.node;
      const rel = r.q.conjugate().multiply(n.rotationQuaternion), dp = n.position.subtract(r.p).scale(ch.modelScale);
      const T = nodeToOffset([dp.x, dp.y, dp.z], [rel.x, rel.y, rel.z, rel.w]);
      const o = offsetToNode(D.mul(T).mul(E.inverse()));
      n.rotationQuaternion.copyFrom(r.q.multiply(new Quaternion(...o.q)));
      n.position.copyFrom(r.p.add(new Vector3(o.p[0], o.p[1], o.p[2]).scale(k)));
    }
    // The parts where their nodes are (written as physics writes: no Changed), then the Transforms.
    const write = (p, cf) => {
      const [ox, oy, oz] = cf.toOrientation();
      Object.assign(p.props, { CFrame: cf, Position: new V3(cf.x, cf.y, cf.z), Orientation: new V3(Math.fround(ox), Math.fround(oy), Math.fround(oz)) });
      this.dm.notify(p, 'CFrame');
    };
    for (const J of this.joints) if (J.node) write(J.part1, nodeCF(J.node).mul(this.map.get(J.part1)));
    for (const J of this.joints) { const P = J.j.props; P.Transform = P.C0.inverse().mul(J.part0.props.CFrame.inverse()).mul(J.part1.props.CFrame).mul(P.C1); }
  }
}
