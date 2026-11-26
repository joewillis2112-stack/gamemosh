// Constraints (Roblox; mashup-research/ROBLOX_CONSTRAINTS_2026-11-26.md) between the bodies World builds (a lone
// part's, or a loose assembly's compound; an anchored part's static one). Run before every physics substep.
// - Mechanical ones are Havok 6DoF constraints at the two attachments (their X axis the constraint's, Y its
//   second): HingeConstraint (turns about X; Motor holds AngularVelocity with MotorMaxTorque, Servo turns to
//   TargetAngle at up to AngularSpeed with ServoMaxTorque; limits LowerAngle..UpperAngle), BallSocketConstraint
//   (free; limits: tilt within UpperAngle, twist within TwistLower..UpperAngle; MaxFrictionTorque as friction),
//   RopeConstraint (no farther than Length; the winch moves it to WinchTarget at WinchSpeed), RodConstraint (at
//   Length), PrismaticConstraint (slides along X; Motor holds Velocity, Servo moves to TargetPosition at up to
//   Speed; limits LowerLimit..UpperLimit), CylindricalConstraint (a prismatic that also turns about X, with its own
//   angular actuator and limits), and SpringConstraint's MinLength..MaxLength limits.
// - Forces are impulses we apply each substep: SpringConstraint (Stiffness x stretch from FreeLength, plus Damping x
//   the rate it stretches, at most MaxForce, on both attachments), VectorForce, Torque, LinearVelocity,
//   AngularVelocity, AlignPosition, AlignOrientation.
// Applying forces: Havok integrates gravity over 4 internal solver steps per step (a body moves 0.625 g dt^2), but an
// impulse before the step moves it its full dv dt, so a force that should cancel gravity (a hovering VectorForce)
// crept up. Each force's impulse is given 0.625 before the step and 0.375 after it, which matches both its velocity
// and position to gravity's; and each body's real response to an impulse is measured once (Havok's effective inverse
// mass and inertia differ from the nominal by up to 0.3%) and the impulses scaled by it. Velocity holds also cancel
// the gravity that acts during the step.
// OURS (Roblox doesn't publish its solver): a servo's speed falls off as Responsiveness x the error near its target;
// Align*'s approach: velocity Responsiveness x the error (within MaxVelocity), reached at Responsiveness per second,
// within MaxForce (RigidityEnabled: the error closed in one step); a ball socket's cone limit as a limit on each of its
// two tilt axes (a square cone); limits don't bounce (Restitution is kept but not applied); MotorMaxAcceleration is
// how fast a motor's target velocity changes. Constraints on a player's or NPC's parts don't act (their parts have no
// bodies here). Readouts written each substep: Active, CurrentAngle, CurrentDistance, CurrentLength, CurrentPosition.
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Physics6DoFConstraint } from '@babylonjs/core/Physics/v2/physicsConstraint.js';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody.js';
import { PhysicsShapeSphere } from '@babylonjs/core/Physics/v2/physicsShape.js';
import { PhysicsConstraintAxis as AX, PhysicsConstraintMotorType as MOTOR, PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { isA } from '../datamodel.js';

const DEG = Math.PI / 180;
const en = v => v && v.name || v;
const MECHANICAL = new Set(['HingeConstraint', 'BallSocketConstraint', 'RopeConstraint', 'RodConstraint', 'PrismaticConstraint', 'CylindricalConstraint', 'SpringConstraint', 'UniversalConstraint']);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k], len = a => Math.hypot(a[0], a[1], a[2]);
const v3 = a => new Vector3(a[0], a[1], a[2]), arr = v => [v.x, v.y, v.z];
const clampLen = (a, m) => { const l = len(a); return l > m && l > 0 ? scale(a, m / l) : a; };
// A CFrame's columns (its X, Y, Z axes) and position.
const axes = cf => ({ x: [cf.m[3], cf.m[6], cf.m[9]], y: [cf.m[4], cf.m[7], cf.m[10]], z: [cf.m[5], cf.m[8], cf.m[11]], p: [cf.x, cf.y, cf.z] });

export class Constraints {
  constructor(world, dm, scene) {
    Object.assign(this, { world, dm, scene });
    this.live = new Map(); // constraint -> { joint, sig, A, B, state }
    this.anchors = new Map(); // part -> { node, body, key }: a static body for an anchored part that has none
    this.list = null;
    this.queue = []; // this substep's impulses: [body, linear impulse at the centre of mass, angular impulse]
    this.response = new WeakMap(); // body -> { lin, ang: [k0, k1, k2] } (measured dv per nominal dv)
    this.gravity = () => -dm.workspace.props.Gravity;
    dm.watch((inst, key) => { if (key === 'Parent' || isA(inst.ClassName, 'Constraint') || inst.ClassName === 'NoCollisionConstraint') this.list = null; });
  }

  constraints() {
    if (this.list) return this.list;
    const out = [], walk = i => { for (const c of i.children) { if (isA(c.ClassName, 'Constraint') || c.ClassName === 'NoCollisionConstraint') out.push(c); walk(c); } };
    walk(this.dm.workspace);
    return (this.list = out);
  }

  // The body a part moves with: its loose assembly's compound, or its own; an anchored part without one (it doesn't
  // collide) gets a static one here. { body, cf (the body's frame now), dynamic } or null (a character's part).
  bodyOf(part) {
    const W = this.world, e = W.parts.get(part);
    if (!e || part.isCharacter) return null;
    if (e.asm && !e.fixed) { const c = W.compounds.get(e.asm.root); return c ? { body: c.body, cf: e.asm.root.props.CFrame, dynamic: true, node: c.node } : null; }
    if (e.agg) return { body: e.agg.body, cf: part.props.CFrame, dynamic: !e.fixed, node: e.mesh };
    if (!e.fixed) return null;
    const cf = part.props.CFrame, key = cf.m.join(',');
    let a = this.anchors.get(part);
    if (a && a.key !== key) { a.body.dispose(); a.node.dispose(); a = null; }
    if (!a) {
      const node = new TransformNode(part.Name + '/anchor', this.scene), [x, y, z, w] = cf.toQuat();
      node.position.set(cf.x, cf.y, cf.z); node.rotationQuaternion = new Quaternion(x, y, z, w);
      const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
      const s = new PhysicsShapeSphere(Vector3.Zero(), 0.01, this.scene); s.filterMembershipMask = 0; s.filterCollideMask = 0;
      body.shape = s;
      a = { node, body, key, shape: s };
      this.anchors.set(part, a);
    }
    return { body: a.body, cf, dynamic: false, node: a.node };
  }

  // Each substep: every constraint built (again, when what it's made of changed), its motors and readouts updated,
  // and the forces applied.
  substep(dt) {
    if (!this.scene.getPhysicsEngine()) return;
    const seen = new Set();
    for (const c of this.constraints()) {
      if (c.destroyed) continue;
      seen.add(c);
      let ok = false;
      try { ok = this.step(c, dt); } catch (err) { console.warn('constraint', c.props.Name, err); }
      if ('Active' in c.props && c.props.Active !== ok) { c.props.Active = ok; this.dm.fire(c, 'Changed', ['Active']); }
    }
    for (const c of [...this.live.keys()]) if (!seen.has(c)) this.drop(c);
    this.apply(0.625);
    for (const [p, a] of this.anchors) if (p.destroyed || !this.world.parts.has(p)) { a.body.dispose(); a.node.dispose(); this.anchors.delete(p); }
  }

  // The queued impulses, a share of them (0.625 before the step, the rest after: after()).
  apply(k) {
    for (const [A, lin, ang] of this.queue) {
      if (A.body._isDisposed) continue;
      const R = this.measure(A), c = this.mass(A).com;
      if (len(lin) > 0) A.body.applyImpulse(v3(scale(lin, k / R.lin)), v3(c));
      if (len(ang) > 0) { const P = this.mass(A).toPrincipal, a = P.to(ang); A.body.applyAngularImpulse(v3(P.from([0, 1, 2].map(i => a[i] * k / R.ang[i])))); }
    }
  }
  /** After each physics substep: the rest of its impulses. */
  after() { this.apply(0.375); this.queue = []; }
  // How a body really answers an impulse, per nominal mass and inertia (measured once: a test impulse and its undo).
  measure(A) {
    let R = this.response.get(A.body);
    if (R) return R;
    const b = A.body, M = this.mass(A), c = v3(M.com), m = M.m || 1;
    const v0 = b.getLinearVelocity(), J = 1 * m;
    b.applyImpulse(new Vector3(J, 0, 0), c); const v1 = b.getLinearVelocity(); b.applyImpulse(new Vector3(-J, 0, 0), c); b.setLinearVelocity(v0);
    const lin = (v1.x - v0.x) || 1, ang = [];
    const w0 = b.getAngularVelocity();
    for (let i = 0; i < 3; i++) {
      const e = [0, 0, 0]; e[i] = 1;
      const axis = M.toPrincipal.from(e), Ii = M.moments[i] || 1;
      b.applyAngularImpulse(v3(scale(axis, Ii))); const w1 = b.getAngularVelocity(); b.setAngularVelocity(w0);
      ang.push(dot(sub(arr(w1), arr(w0)), axis) || 1);
    }
    R = { lin, ang };
    this.response.set(b, R);
    return R;
  }

  stateOf(c) { let L = this.live.get(c); if (!L) { L = { joint: null, sig: '', state: {} }; this.live.set(c, L); } return L.state; }
  // What a velocity hold still lacks after each step (contacts and friction act during it): an integral of the error,
  // left alone while the hold is at its force limit (no wind-up).
  integral(st, k, err, saturated) {
    const b = st[k] || [0, 0, 0];
    if (!saturated) st[k] = b.map((x, i) => x + err[i] * 0.5);
    return st[k] || b;
  }

  drop(c) {
    const L = this.live.get(c);
    this.live.delete(c);
    if (L && L.joint) try { L.joint.dispose(); } catch { /* its body went first */ }
  }

  // A NoCollisionConstraint: a joint that holds nothing, with collisions between its two parts' bodies off.
  noCollision(c) {
    const P = c.props, ok = p => p && !p.destroyed && isA(p.ClassName, 'BasePart') && this.world.parts.has(p);
    if (!P.Enabled || !ok(P.Part0) || !ok(P.Part1)) { this.drop(c); return false; }
    const A = this.bodyOf(P.Part0), B = this.bodyOf(P.Part1);
    if (!A || !B || A.body === B.body || (!A.dynamic && !B.dynamic)) { this.drop(c); return false; }
    const L = this.live.get(c);
    if (L && L.A === A.body && L.B === B.body) return true;
    this.drop(c);
    const joint = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB: Vector3.Zero(), collision: false }, [], this.scene);
    A.body.addConstraint(B.body, joint);
    this.live.set(c, { joint, sig: '', A: A.body, B: B.body, state: {} });
    return true;
  }

  // One constraint this substep; whether it's active.
  step(c, dt) {
    if (c.ClassName === 'NoCollisionConstraint') return this.noCollision(c);
    const P = c.props, a0 = P.Attachment0, a1 = P.Attachment1, two = !['VectorForce', 'Torque', 'LinearVelocity', 'AngularVelocity'].includes(c.ClassName) && !((c.ClassName === 'AlignPosition' || c.ClassName === 'AlignOrientation') && en(P.Mode) === 'OneAttachment');
    const part = a => a && !a.destroyed && a.ClassName === 'Attachment' && a.parent && isA(a.parent.ClassName, 'BasePart') && this.world.parts.has(a.parent) ? a.parent : null;
    const p0 = part(a0), p1 = two ? part(a1) : null;
    const relTo = en(P.RelativeTo);
    const needs1 = two || (relTo === 'Attachment1' && ['VectorForce', 'Torque', 'LinearVelocity', 'AngularVelocity'].includes(c.ClassName));
    if (!P.Enabled || !p0 || (needs1 && !part(a1))) { this.drop(c); return false; }
    const q1 = part(a1), A = this.bodyOf(p0), B = two ? this.bodyOf(p1) : q1 ? this.bodyOf(q1) : null; // (a one-attachment mover's Attachment1: its RelativeTo frame, and a reaction)
    if (!A || (two && !B)) { this.drop(c); return false; }
    if (two && A.body === B.body) { this.drop(c); return false; } // one rigid body: nothing to do
    const w0 = this.dm.attachmentWorld(a0).WorldCFrame, w1 = q1 ? this.dm.attachmentWorld(a1).WorldCFrame : null;
    if (MECHANICAL.has(c.ClassName)) {
      if (!A.dynamic && !B.dynamic) { this.drop(c); return false; }
      this.mechanical(c, P, A, B, a0, a1, w0, w1, dt);
    } else this.mover(c, P, A, B, w0, w1, dt, this.stateOf(c));
    return true;
  }

  // ---- mechanical constraints
  mechanical(c, P, A, B, a0, a1, w0, w1, dt) {
    const cls = c.ClassName, X = axes(w0), Y = axes(w1);
    // Readouts, from the attachments' frames now.
    const d = sub(Y.p, X.p), dist = len(d);
    const angle = Math.atan2(dot(cross(X.y, Y.y), X.x), dot(X.y, Y.y)); // Attachment1's Y from Attachment0's, about X
    if (cls === 'HingeConstraint' || cls === 'CylindricalConstraint') c.props.CurrentAngle = angle / DEG;
    if (cls === 'RopeConstraint' || cls === 'RodConstraint') c.props.CurrentDistance = dist;
    if (cls === 'SpringConstraint') c.props.CurrentLength = dist;
    if (cls === 'PrismaticConstraint' || cls === 'CylindricalConstraint') c.props.CurrentPosition = dot(d, X.x);
    let L = this.live.get(c);
    // What the joint is built from: its kind and limits, where the attachments sit on their bodies, the bodies.
    const local = (body, w) => body.cf.inverse().mul(w);
    const l0 = local(A, w0), l1 = local(B, w1);
    const limits = this.limits(cls, P, L);
    const sig = [cls, JSON.stringify(limits), l0.m.map(v => v.toFixed(5)).join(','), l0.x.toFixed(5), l0.y.toFixed(5), l0.z.toFixed(5), l1.m.map(v => v.toFixed(5)).join(','), l1.x.toFixed(5), l1.y.toFixed(5), l1.z.toFixed(5)].join('|');
    if (!L || L.sig !== sig || L.A !== A.body || L.B !== B.body) {
      const was = L ? L.state : {};
      this.drop(c);
      const la = axes(l0), lb = axes(l1);
      const joint = limits.length ? new Physics6DoFConstraint({ pivotA: v3(la.p), pivotB: v3(lb.p), axisA: v3(la.x), axisB: v3(lb.x), perpAxisA: v3(la.y), perpAxisB: v3(lb.y), collision: true }, limits, this.scene) : null;
      if (joint) A.body.addConstraint(B.body, joint);
      L = { joint, sig, A: A.body, B: B.body, state: { len: was.len, angv: was.angv, linv: was.linv } }; // (a new joint: its motors and the winch's limit set again)
      this.live.set(c, L);
    }
    const J = L.joint;
    // Actuators.
    if (cls === 'HingeConstraint' || cls === 'CylindricalConstraint') {
      const type = en(cls === 'HingeConstraint' ? P.ActuatorType : P.AngularActuatorType), lim = cls === 'HingeConstraint' ? P.LimitsEnabled : P.AngularLimitsEnabled;
      this.actuate(J, AX.ANGULAR_X, type, L.state, 'ang', dt, {
        velocity: P.AngularVelocity, maxMotor: P.MotorMaxTorque, accel: cls === 'HingeConstraint' ? P.MotorMaxAcceleration : P.MotorMaxAngularAcceleration,
        target: (lim ? Math.min(Math.max(P.TargetAngle, P.LowerAngle), P.UpperAngle) : P.TargetAngle) * DEG, now: angle, speed: P.AngularSpeed, maxServo: P.ServoMaxTorque, resp: P.AngularResponsiveness, wrap: true,
      });
    }
    if (cls === 'PrismaticConstraint' || cls === 'CylindricalConstraint') {
      const pos = dot(d, X.x);
      this.actuate(J, AX.LINEAR_X, en(P.ActuatorType), L.state, 'lin', dt, {
        velocity: P.Velocity, maxMotor: P.MotorMaxForce, accel: P.MotorMaxAcceleration,
        target: P.LimitsEnabled ? Math.min(Math.max(P.TargetPosition, P.LowerLimit), P.UpperLimit) : P.TargetPosition, now: pos, speed: P.Speed, maxServo: P.ServoMaxForce, resp: P.LinearResponsiveness,
      });
    }
    if (cls === 'RopeConstraint' && J) {
      // The winch: the rope's length moves to WinchTarget at WinchSpeed (a negative speed is 0: the docs).
      const s = L.state;
      if (s.len === undefined || !P.WinchEnabled) s.len = P.WinchEnabled ? Math.min(P.Length, Math.max(dist, 0)) : P.Length;
      if (P.WinchEnabled) { const step = Math.max(0, P.WinchSpeed) * dt, goal = Math.max(0, P.WinchTarget); s.len += Math.max(-step, Math.min(step, goal - s.len)); }
      if (s.applied !== s.len) { J.setAxisMaxLimit(AX.LINEAR_DISTANCE, s.len); s.applied = s.len; }
    }
    if (cls === 'BallSocketConstraint' && J) {
      const f = Math.max(0, P.MaxFrictionTorque);
      if (L.state.friction !== f) { for (const ax of [AX.ANGULAR_X, AX.ANGULAR_Y, AX.ANGULAR_Z]) J.setAxisFriction(ax, f); L.state.friction = f; }
    }
    if (cls === 'SpringConstraint') this.spring(P, A, B, X.p, Y.p, d, dist, dt);
  }

  // The 6DoF limits for a mechanical constraint (min = max = 0 locks an axis).
  limits(cls, P, L) {
    const lock = axis => ({ axis, minLimit: 0, maxLimit: 0 }), out = [];
    const lin = [AX.LINEAR_X, AX.LINEAR_Y, AX.LINEAR_Z];
    if (cls === 'HingeConstraint') {
      out.push(...lin.map(lock), lock(AX.ANGULAR_Y), lock(AX.ANGULAR_Z));
      if (P.LimitsEnabled) out.push({ axis: AX.ANGULAR_X, minLimit: Math.min(P.LowerAngle, P.UpperAngle) * DEG, maxLimit: Math.max(P.LowerAngle, P.UpperAngle) * DEG });
    } else if (cls === 'BallSocketConstraint') {
      out.push(...lin.map(lock));
      if (P.LimitsEnabled) { const u = Math.max(0, P.UpperAngle) * DEG; out.push({ axis: AX.ANGULAR_Y, minLimit: -u, maxLimit: u }, { axis: AX.ANGULAR_Z, minLimit: -u, maxLimit: u }); }
      if (P.LimitsEnabled && P.TwistLimitsEnabled) out.push({ axis: AX.ANGULAR_X, minLimit: Math.min(P.TwistLowerAngle, P.TwistUpperAngle) * DEG, maxLimit: Math.max(P.TwistLowerAngle, P.TwistUpperAngle) * DEG });
    } else if (cls === 'UniversalConstraint') {
      // The attachments' primary (X) axes kept together but free to tilt (within a cone of MaxAngle: as each tilt
      // axis's limit), no twist between them (UNSURE: the docs say only that "two axes remain perpendicular").
      out.push(...lin.map(lock), lock(AX.ANGULAR_X));
      if (P.LimitsEnabled) { const u = Math.max(0, P.MaxAngle) * DEG; out.push({ axis: AX.ANGULAR_Y, minLimit: -u, maxLimit: u }, { axis: AX.ANGULAR_Z, minLimit: -u, maxLimit: u }); }
    } else if (cls === 'RopeConstraint') {
      out.push({ axis: AX.LINEAR_DISTANCE, minLimit: 0, maxLimit: Math.max(0, P.Length) }); // (the winch moves it without a rebuild)
    } else if (cls === 'RodConstraint') {
      out.push({ axis: AX.LINEAR_DISTANCE, minLimit: Math.max(0, P.Length), maxLimit: Math.max(0, P.Length) });
    } else if (cls === 'SpringConstraint') {
      if (P.LimitsEnabled) out.push({ axis: AX.LINEAR_DISTANCE, minLimit: Math.max(0, Math.min(P.MinLength, P.MaxLength)), maxLimit: Math.max(0, P.MinLength, P.MaxLength) });
    } else if (cls === 'PrismaticConstraint' || cls === 'CylindricalConstraint') {
      out.push(lock(AX.LINEAR_Y), lock(AX.LINEAR_Z), lock(AX.ANGULAR_Y), lock(AX.ANGULAR_Z));
      if (cls === 'PrismaticConstraint') out.push(lock(AX.ANGULAR_X));
      else if (P.AngularLimitsEnabled) out.push({ axis: AX.ANGULAR_X, minLimit: Math.min(P.LowerAngle, P.UpperAngle) * DEG, maxLimit: Math.max(P.LowerAngle, P.UpperAngle) * DEG });
      if (P.LimitsEnabled) out.push({ axis: AX.LINEAR_X, minLimit: Math.min(P.LowerLimit, P.UpperLimit), maxLimit: Math.max(P.LowerLimit, P.UpperLimit) });
    }
    return out;
  }

  // A motor (hold `velocity`, its target changing at up to `accel`) or a servo (towards `target` at up to `speed`,
  // slowing within 1/resp of it: OURS) as a Havok velocity motor on one axis, with at most `maxMotor`/`maxServo`.
  actuate(J, axis, type, state, k, dt, o) {
    if (!J) return;
    if (type !== 'Motor' && type !== 'Servo') { if (state[k + 'type'] !== 'None') { J.setAxisMotorType(axis, MOTOR.NONE); state[k + 'type'] = 'None'; } return; }
    if (state[k + 'type'] !== 'Velocity') { J.setAxisMotorType(axis, MOTOR.VELOCITY); state[k + 'type'] = 'Velocity'; state[k + 'v'] = 0; }
    let v, max;
    if (type === 'Motor') {
      const a = Math.max(0, o.accel) * dt, cur = state[k + 'v'] || 0;
      v = cur + Math.max(-a, Math.min(a, o.velocity - cur)); max = Math.max(0, o.maxMotor);
    } else {
      let e = o.target - o.now;
      if (o.wrap) e = Math.atan2(Math.sin(e), Math.cos(e));
      const s = Math.max(0, o.speed);
      v = Math.sign(e) * Math.min(s, Math.abs(e) * Math.max(0, o.resp)); max = Math.max(0, o.maxServo);
    }
    state[k + 'v'] = v;
    // (Havok's motor drives the child against the parent; ours turns Attachment1 from Attachment0: the same sense.)
    J.setAxisMotorTarget(axis, v);
    J.setAxisMotorMaxForce(axis, max);
  }

  // ---- forces
  // A body's mass, centre of mass (world) and inertia (as a function giving I x v for a world vector).
  mass(A) {
    const mp = A.body.getMassProperties(), node = A.node;
    node.computeWorldMatrix(true);
    const M = node.getWorldMatrix(), rot = new Quaternion(), pos = new Vector3();
    M.decompose(new Vector3(), rot, pos); // (a lone part's node is its mesh, scaled by Size; its body isn't)
    const com = pos.add((mp.centerOfMass || Vector3.Zero()).applyRotationQuaternion(rot));
    // (Havok keeps inertia per unit mass.)
    const q = mp.inertiaOrientation ? rot.multiply(mp.inertiaOrientation) : rot, I0 = mp.inertia || Vector3.One(), m = mp.mass || 0;
    const moments = [I0.x * m, I0.y * m, I0.z * m];
    const R = new Matrix(); q.toRotationMatrix(R); const Rt = R.clone().transpose();
    const toPrincipal = { to: w => arr(Vector3.TransformNormal(v3(w), Rt)), from: l => arr(Vector3.TransformNormal(v3(l), R)) };
    const inertia = w => { const l = toPrincipal.to(w); return toPrincipal.from(l.map((x, i) => x * moments[i])); };
    return { m, com: arr(com), inertia, moments, toPrincipal };
  }
  velAt(A, p, com) { const v = arr(A.body.getLinearVelocity()), w = arr(A.body.getAngularVelocity()); return [v[0], v[1], v[2]].map((x, i) => x + cross(w, sub(p, com))[i]); }
  // A force f at a point for dt: its impulse through the centre of mass, and the turn it gives about it.
  push(A, f, at, dt) { if (A && A.dynamic && len(f) > 0) { const c = this.mass(A).com; this.queue.push([A, scale(f, dt), scale(cross(sub(at, c), f), dt)]); } }
  twist(A, t, dt) { if (A && A.dynamic && len(t) > 0) this.queue.push([A, [0, 0, 0], scale(t, dt)]); }

  spring(P, A, B, pa, pb, d, dist, dt) {
    if (dist < 1e-6) return;
    const dir = scale(d, 1 / dist), ma = this.mass(A), mb = this.mass(B);
    const rate = dot(sub(this.velAt(B, pb, mb.com), this.velAt(A, pa, ma.com)), dir);
    let f = Math.max(0, P.Stiffness) * (dist - P.FreeLength) + Math.max(0, P.Damping) * rate; // > 0: pulled together
    const cap = Math.max(0, P.MaxForce); f = Math.max(-cap, Math.min(cap, f));
    this.push(A, scale(dir, f), pa, dt); this.push(B, scale(dir, -f), pb, dt);
  }

  // A frame's rotation for RelativeTo: the world's, or an attachment's.
  frameAxes(rel, w0, w1) { const f = rel === 'Attachment0' ? w0 : rel === 'Attachment1' ? w1 : null; return f ? axes(f) : { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }; }
  inFrame(F, v) { return [0, 1, 2].map(i => F.x[i] * v[0] + F.y[i] * v[1] + F.z[i] * v[2]); }

  mover(c, P, A, B, w0, w1, dt, st) {
    if (!A.dynamic) return;
    const cls = c.ClassName, X = axes(w0), M = this.mass(A), rel = en(P.RelativeTo);
    if (cls === 'VectorForce') {
      const f = this.inFrame(this.frameAxes(rel, w0, w1), [P.Force.x, P.Force.y, P.Force.z]);
      this.push(A, f, P.ApplyAtCenterOfMass ? M.com : X.p, dt);
    } else if (cls === 'Torque') {
      this.twist(A, this.inFrame(this.frameAxes(rel, w0, w1), [P.Torque.x, P.Torque.y, P.Torque.z]), dt);
    } else if (cls === 'LinearVelocity') {
      const F = this.frameAxes(rel, w0, w1), v = arr(A.body.getLinearVelocity()), mode = en(P.VelocityConstraintMode);
      // The velocity it holds, and the directions it holds it in (the others are left alone).
      let goal, dirs;
      if (mode === 'Line') { const ld = this.inFrame(F, [P.LineDirection.x, P.LineDirection.y, P.LineDirection.z]), l = len(ld) || 1; dirs = [scale(ld, 1 / l)]; goal = scale(dirs[0], P.LineVelocity); }
      else if (mode === 'Plane') { const t1 = this.inFrame(F, [P.PrimaryTangentAxis.x, P.PrimaryTangentAxis.y, P.PrimaryTangentAxis.z]), t2 = this.inFrame(F, [P.SecondaryTangentAxis.x, P.SecondaryTangentAxis.y, P.SecondaryTangentAxis.z]); dirs = [scale(t1, 1 / (len(t1) || 1)), scale(t2, 1 / (len(t2) || 1))]; goal = [0, 1, 2].map(i => dirs[0][i] * P.PlaneVelocity.x + dirs[1][i] * P.PlaneVelocity.y); }
      else { goal = this.inFrame(F, [P.VectorVelocity.x, P.VectorVelocity.y, P.VectorVelocity.z]); dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }
      const err = sub(goal, v), gv = [0, this.gravity() * dt, 0]; // (gravity acts during the step too)
      const want = f0 => { let f = [0, 0, 0]; for (const dd of dirs) f = f.map((x, i) => x + dd[i] * dot(f0, dd) * M.m / dt); return f; };
      let f = want(sub(sub(err, gv), scale(st.lin || [0, 0, 0], -1)));
      const raw = f;
      if (P.ForceLimitsEnabled) {
        if (en(P.ForceLimitMode) === 'PerAxis') { const lim = mode === 'Plane' ? [P.MaxPlanarAxesForce.x, P.MaxPlanarAxesForce.y] : [P.MaxAxesForce.x, P.MaxAxesForce.y, P.MaxAxesForce.z]; const comp = dirs.map((dd, i) => Math.max(-(lim[i] ?? Infinity), Math.min(lim[i] ?? Infinity, dot(f, dd)))); f = [0, 1, 2].map(i => dirs.reduce((s, dd, j) => s + dd[i] * comp[j], 0)); }
        else f = clampLen(f, Math.max(0, P.MaxForce));
      }
      this.integral(st, 'lin', err, len(sub(raw, f)) > 1e-6 * (1 + len(raw)));
      this.push(A, f, M.com, dt);
      if (P.ReactionForceEnabled && B) this.push(B, scale(f, -1), this.mass(B).com, dt);
    } else if (cls === 'AngularVelocity') {
      const goal = this.inFrame(this.frameAxes(rel, w0, w1), [P.AngularVelocity.x, P.AngularVelocity.y, P.AngularVelocity.z]);
      const err = sub(goal, arr(A.body.getAngularVelocity()));
      const raw = scale(M.inertia(sub(err, scale(st.ang || [0, 0, 0], -1))), 1 / dt), t = clampLen(raw, Math.max(0, P.MaxTorque));
      this.integral(st, 'ang', err, len(sub(raw, t)) > 1e-6 * (1 + len(raw)));
      this.twist(A, t, dt);
    } else if (cls === 'AlignPosition') {
      const goal = en(P.Mode) === 'OneAttachment' ? [P.Position.x, P.Position.y, P.Position.z] : axes(w1).p;
      const at = P.ApplyAtCenterOfMass ? M.com : X.p, vgoal = en(P.Mode) === 'TwoAttachment' && B ? this.velAt(B, goal, this.mass(B).com) : [0, 0, 0];
      const vrel = sub(this.velAt(A, at, M.com), vgoal), e = sub(goal, X.p), R = Math.max(0, P.Responsiveness);
      let f;
      const hold = [0, -this.gravity() * M.m, 0]; // (OURS: it holds against gravity, with no sag)
      if (P.RigidityEnabled) f = sub(scale(sub(scale(e, 1 / dt), vrel), M.m / dt), [0, this.gravity() * M.m, 0]);
      else {
        const want = clampLen(scale(e, R), Math.max(0, P.MaxVelocity));
        f = scale(sub(want, vrel), M.m * R).map((x, i) => x + hold[i]);
        f = en(P.ForceLimitMode) === 'PerAxis' ? f.map((x, i) => Math.max(-[P.MaxAxesForce.x, P.MaxAxesForce.y, P.MaxAxesForce.z][i], Math.min([P.MaxAxesForce.x, P.MaxAxesForce.y, P.MaxAxesForce.z][i], x))) : clampLen(f, Math.max(0, P.MaxForce));
      }
      this.push(A, f, at, dt);
      if (P.ReactionForceEnabled && B) this.push(B, scale(f, -1), goal, dt);
    } else if (cls === 'AlignOrientation') {
      const goalCF = en(P.Mode) === 'OneAttachment' ? P.CFrame : w1, G = axes(goalCF), R = Math.max(0, P.Responsiveness);
      // The rotation from Attachment0's frame to the goal, as a world vector (axis x angle).
      let e;
      if (P.PrimaryAxisOnly || en(P.AlignType) === 'PrimaryAxisParallel') { const cx = cross(X.x, G.x), s = len(cx), cth = dot(X.x, G.x); e = s > 1e-9 ? scale(cx, Math.atan2(s, cth) / s) : [0, 0, 0]; }
      else {
        const r = w0.inverse().mul(goalCF), [qx, qy, qz, qw] = r.toQuat(), s = Math.hypot(qx, qy, qz), ang = 2 * Math.atan2(s, qw);
        const loc = s > 1e-9 ? scale([qx, qy, qz], (ang > Math.PI ? ang - 2 * Math.PI : ang) / s) : [0, 0, 0];
        e = this.inFrame(X, loc);
      }
      const wrel = sub(arr(A.body.getAngularVelocity()), en(P.Mode) === 'TwoAttachment' && B ? arr(B.body.getAngularVelocity()) : [0, 0, 0]);
      let t;
      if (P.RigidityEnabled) t = scale(M.inertia(sub(scale(e, 1 / dt), wrel)), 1 / dt);
      else t = clampLen(scale(M.inertia(sub(clampLen(scale(e, R), Math.max(0, P.MaxAngularVelocity)), wrel)), R), Math.max(0, P.MaxTorque));
      this.twist(A, t, dt);
      if (P.ReactionTorqueEnabled && B) this.twist(B, scale(t, -1), dt);
    }
  }
}
