// The player's character: a Havok character controller with Roblox's
// numbers, a blocky CC0 model, and an animator that blends clips from the
// rest pose every frame (a clip never inherits another clip's pose).
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { PhysicsCharacterController, CharacterSupportedState } from '@babylonjs/core/Physics/v2/characterController.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { POSES, poseRotations } from './poses.js';
import '@babylonjs/loaders/glTF/2.0/index.js';

export const HUMANOID = {
  WalkSpeed: 16,      // studs/s
  JumpPower: 50,      // studs/s upward
  Height: 5,          // studs
  Radius: 1,          // capsule radius, studs
  TurnRate: 14,       // 1/s, how fast the body turns toward the move direction
  Accel: 30,          // 1/s, ground velocity response (snappy, not instant)
  AirAccel: 10,       // 1/s
};

const UP = new Vector3(0, 1, 0);

// ------------------------------------------------------------------ animator
// Samples clips itself: each frame every animated node starts at rest, then
// clips are mixed by weight. Positions lerp; rotations nlerp on the shortest arc.
class Animator {
  constructor(res) {
    this.nodes = res.transformNodes.concat(res.meshes);
    this.rest = new Map(this.nodes.map(n => [n, {
      p: n.position.clone(),
      q: (n.rotationQuaternion || Quaternion.FromEulerVector(n.rotation)).clone(),
      s: n.scaling.clone(),
    }]));
    this.nodes.forEach(n => { if (!n.rotationQuaternion) n.rotationQuaternion = Quaternion.FromEulerVector(n.rotation); });
    this.clips = {};
    for (const g of res.animationGroups) {
      g.stop();
      const fps = g.targetedAnimations[0] ? g.targetedAnimations[0].animation.framePerSecond : 60;
      this.clips[g.name] = { channels: g.targetedAnimations.map(t => ({ target: t.target, path: t.animation.targetProperty, anim: t.animation })), from: g.from, to: g.to, fps, loop: true };
    }
    this.layers = []; // { clip, time, weight, target, speed }
  }

  // A pose as a clip: { nodeName: Quaternion } held still.
  addPose(name, rotations) {
    const channels = [];
    for (const [nodeName, q] of Object.entries(rotations)) {
      const target = this.nodes.find(n => n.name === nodeName);
      if (target) channels.push({ target, path: 'rotationQuaternion', fixed: q });
    }
    this.clips[name] = { channels, from: 0, to: 0, fps: 60, loop: false };
  }

  duration(name) { const c = this.clips[name]; return (c.to - c.from) / c.fps; }

  // Make `name` the target clip; others fade out over `fade` seconds.
  play(name, fade = 0.15, speed = 1) {
    let l = this.layers.find(l => l.clip === name);
    if (!l) { l = { clip: name, time: 0, weight: 0 }; this.layers.push(l); }
    l.speed = speed;
    for (const o of this.layers) o.target = o === l ? 1 : 0;
    this.fade = Math.max(fade, 1e-3);
    this.current = name;
  }

  update(dt) {
    // Advance and fade layers.
    for (const l of this.layers) {
      const c = this.clips[l.clip];
      const len = (c.to - c.from) / c.fps;
      l.time += dt * (l.speed || 1);
      if (len > 0) l.time = c.loop ? l.time % len : Math.min(l.time, len);
      const step = dt / this.fade;
      l.weight = l.target > l.weight ? Math.min(l.target, l.weight + step) : Math.max(l.target, l.weight - step);
    }
    this.layers = this.layers.filter(l => l.weight > 0 || l.target > 0);
    const total = this.layers.reduce((a, l) => a + l.weight, 0) || 1;

    // Start from rest.
    const acc = new Map();
    for (const n of this.nodes) {
      const r = this.rest.get(n);
      acc.set(n, { p: r.p.clone(), q: r.q.clone(), s: r.s.clone(), pw: 0, qw: 0, P: Vector3.Zero(), Q: new Quaternion(0, 0, 0, 0) });
    }
    for (const l of this.layers) {
      const w = l.weight / total;
      if (w <= 0) continue;
      const c = this.clips[l.clip];
      const frame = c.from + l.time * c.fps;
      for (const ch of c.channels) {
        const a = acc.get(ch.target);
        if (!a) continue;
        const v = ch.fixed || ch.anim.evaluate(frame);
        if (ch.path === 'position') { a.P.addInPlace(v.scale(w)); a.pw += w; }
        else if (ch.path === 'rotationQuaternion') {
          const q = v.clone();
          if (Quaternion.Dot(q, a.Q.lengthSquared() > 0 ? a.Q : a.q) < 0) q.scaleInPlace(-1);
          a.Q.addInPlace(q.scale(w)); a.qw += w;
        }
      }
    }
    for (const [n, a] of acc) {
      // Channels not animated by every layer keep rest for the remaining weight.
      const p = a.pw > 0 ? a.p.scale(1 - a.pw).add(a.P) : a.p;
      let q = a.q;
      if (a.qw > 0) {
        const restPart = a.q.clone();
        if (Quaternion.Dot(restPart, a.Q) < 0) restPart.scaleInPlace(-1);
        q = a.Q.add(restPart.scale(1 - a.qw)).normalize();
      }
      n.position.copyFrom(p);
      n.rotationQuaternion.copyFrom(q);
      n.scaling.copyFrom(a.s);
    }
  }
}

// The ground speed at which `clip`, played at rate 1, doesn't slide its feet.
// These blocky legs swing like scissors, so a sole touches the ground only as
// the leg passes under the hip; there its speed relative to the body must
// equal the body's. That speed is r·dθ/dt at the crossing, r being the
// hip-to-sole distance (studs) and θ the leg's swing angle about X.
function clipGroundSpeed(anim, clipName, legName, r) {
  const c = anim.clips[clipName];
  const leg = c && c.channels.find(ch => ch.target.name === legName && ch.path === 'rotationQuaternion');
  if (!leg) return 0;
  const rest = anim.rest.get(leg.target).q;
  const angle = f => {
    const q = Quaternion.Inverse(rest).multiply(leg.anim.evaluate(f));
    return 2 * Math.atan2(q.w < 0 ? -q.x : q.x, Math.abs(q.w)); // q and -q are the same turn
  };
  const df = 0.25, rates = [];
  for (let f = c.from; f + df <= c.to; f += df) {
    const a0 = angle(f), a1 = angle(f + df);
    if (Math.sign(a0) !== Math.sign(a1)) rates.push(Math.abs(a1 - a0) / df * c.fps);
  }
  return rates.length ? r * rates.reduce((x, y) => x + y) / rates.length : 0;
}

// ------------------------------------------------------------------ character
export class Character {
  static async load(scene, url, shadows, spawn) {
    const cut = url.lastIndexOf('/') + 1;
    const res = await SceneLoader.ImportMeshAsync('', url.slice(0, cut), url.slice(cut), scene);
    return new Character(scene, res, shadows, spawn);
  }

  constructor(scene, res, shadows, spawn) {
    this.scene = scene;
    const H = HUMANOID;
    // Visual: the glTF root under a holder we move and turn; feet at holder origin.
    this.holder = new TransformNode('character', scene);
    const root = res.meshes[0];
    root.parent = this.holder;
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    this.modelScale = H.Height / (max.y - min.y);
    root.scaling.scaleInPlace(this.modelScale);
    root.position.y -= min.y * this.modelScale;
    res.meshes.forEach(m => { if (m.getTotalVertices() > 0) { shadows.addShadowCaster(m); m.receiveShadows = true; } });

    this.anim = new Animator(res);
    // Jump and fall: held poses (the pack has no clips), shared with the turntable gate.
    const restOf = name => { const n = this.anim.nodes.find(n => n.name === name); return n && this.anim.rest.get(n).q; };
    for (const name of Object.keys(POSES)) this.anim.addPose(name, poseRotations(name, restOf));
    // Hip-to-sole distance in studs: the leg's pivot height (soles are at y 0).
    const leg = res.transformNodes.concat(res.meshes).find(n => n.name === 'leg-left');
    this.holder.computeWorldMatrix(true); root.computeWorldMatrix(true); leg.computeWorldMatrix(true);
    this.legLength = leg.getAbsolutePosition().y - this.holder.position.y;
    this.walkNatural = clipGroundSpeed(this.anim, 'walk', 'leg-left', this.legLength);
    this.sprintNatural = clipGroundSpeed(this.anim, 'sprint', 'leg-left', this.legLength);
    this.anim.play('idle', 0);

    // Physics: a capsule standing on the spawn.
    const start = spawn ? spawn.clone() : new Vector3(0, 0, 0);
    this.ctrl = new PhysicsCharacterController(start.add(new Vector3(0, H.Height / 2 + 0.05, 0)), { capsuleHeight: H.Height, capsuleRadius: H.Radius }, scene);
    this.ctrl.maxSlopeCosine = Math.cos(50 * Math.PI / 180);
    this.ctrl.maxStepHeight = 1.1;
    this.ctrl.maxCharacterSpeedForSolver = 300; // default 10 would cap walking and jumping
    this.meshes = res.meshes;
    this.visible = true;
    this.yaw = 0;          // facing, radians; 0 = +Z
    this.moveDir = Vector3.Zero();
    this.jumpHeld = false;
    this.state = 'idle';
    this.grounded = false;
    this.velocity = Vector3.Zero();
    this.place();
  }

  // Input for this frame: world-space direction (x, z), length <= 1; jump pressed.
  setInput(dirX, dirZ, jump) {
    this.moveDir.set(dirX, 0, dirZ);
    if (this.moveDir.lengthSquared() > 1) this.moveDir.normalize();
    this.jumpHeld = jump;
  }

  step(dt, gravity) {
    const H = HUMANOID;
    const g = new Vector3(0, -gravity, 0);
    const support = this.ctrl.checkSupport(dt, new Vector3(0, -1, 0));
    this.justJumped = Math.max(0, (this.justJumped || 0) - dt);
    this.lastSupport = support.supportedState;
    // Just after a jump the capsule still touches the ground; don't let that cancel it.
    const grounded = support.supportedState === CharacterSupportedState.SUPPORTED && this.justJumped <= 0;
    const v = this.ctrl.getVelocity();
    const want = this.moveDir.scale(H.WalkSpeed);

    // Vertical speed is tracked here and the capsule moves by the step's mean
    // velocity, so a jump traces the exact parabola: height JumpPower²/2g
    // (6.37 studs at Roblox's defaults), whatever the frame rate.
    let vy0 = grounded ? 0 : (this.vy ?? v.y), vy1;
    if (grounded && this.jumpHeld) { vy0 = H.JumpPower; this.justJumped = 0.1; } // holding jump re-jumps on landing, as in Roblox
    if (grounded && vy0 === 0) vy1 = 0;
    else vy1 = vy0 - gravity * dt;
    const k = 1 - Math.exp(-(grounded ? H.Accel : H.AirAccel) * dt);
    const horiz = new Vector3(v.x, 0, v.z);
    if (grounded) horiz.subtractInPlace(new Vector3(support.averageSurfaceVelocity.x, 0, support.averageSurfaceVelocity.z));
    horiz.addInPlace(want.subtract(horiz).scale(k));
    const out = new Vector3(horiz.x, (vy0 + vy1) / 2, horiz.z);
    if (grounded) out.addInPlace(support.averageSurfaceVelocity);
    this.ctrl.setVelocity(out);
    this.ctrl.integrate(dt, support, g);
    this.velocity = this.ctrl.getVelocity();
    // A ceiling or the ground changed the vertical speed: take the solver's.
    this.vy = Math.abs(this.velocity.y - out.y) > 1e-3 ? this.velocity.y : vy1;
    this.velocity.y = this.vy;
    this.grounded = grounded;
    this.airTime = grounded ? 0 : (this.airTime || 0) + dt;

    // Turn toward movement.
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.moveDir.lengthSquared() > 0.01) {
      const target = Math.atan2(this.moveDir.x, this.moveDir.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-H.TurnRate * dt));
    }

    // Animation state.
    let state;
    // Airborne only after a moment off the ground (or a jump), so stepping
    // off a ledge edge or a contact flicker on landing doesn't pop the pose.
    if (!this.grounded && (this.justJumped > 0 || this.vy > 0 || this.airTime > 0.12)) state = this.vy > 0 ? 'jump' : 'fall';
    else if (sp > 0.5) state = 'walk';
    else state = 'idle';
    if (state === 'walk') {
      // Walk or sprint clip, whichever's natural speed is closer; rate matches the ground.
      const clip = Math.abs(sp - this.sprintNatural) < Math.abs(sp - this.walkNatural) ? 'sprint' : 'walk';
      const natural = clip === 'sprint' ? this.sprintNatural : this.walkNatural;
      const rate = Math.min(2.2, Math.max(0.4, sp / natural));
      if (this.anim.current !== clip) this.anim.play(clip, 0.15, rate);
      else this.anim.layers.find(l => l.clip === clip).speed = rate;
    } else if (this.anim.current !== state) {
      this.anim.play(state, state === 'jump' ? 0.08 : state === 'fall' ? 0.25 : 0.2);
    }
    this.state = state;
    this.anim.update(dt);
    this.place();
  }

  place() {
    const p = this.ctrl.getPosition();
    let foot = p.y - HUMANOID.Height / 2;
    // The controller floats a few hundredths of a stud above what it stands on
    // (and the amount varies); on the ground, put the soles on the surface.
    if (this.grounded) {
      const own = new Set(this.meshes);
      const hit = this.scene.pickWithRay(new Ray(new Vector3(p.x, foot + 0.5, p.z), new Vector3(0, -1, 0), 0.8), m => m.isPickable && m.isVisible && !own.has(m));
      if (hit && hit.hit) foot = hit.pickedPoint.y;
    }
    this.holder.position.set(p.x, foot, p.z);
    this.holder.rotationQuaternion = Quaternion.RotationAxis(UP, this.yaw);
  }

  setVisible(v) { if (v !== this.visible) { this.visible = v; this.meshes.forEach(m => { m.isVisible = v; }); } }
  faceYaw(yaw) { this.yaw = yaw; }

  get footPosition() { return this.holder.position; }
  get headPosition() { return this.holder.position.add(new Vector3(0, HUMANOID.Height - 0.8, 0)); }
}
