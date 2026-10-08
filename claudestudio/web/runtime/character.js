// The player's character: a Havok character controller with Roblox's
// numbers, a blocky CC0 model, and an animator that blends clips from the
// rest pose every frame (a clip never inherits another clip's pose).
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.js';
import { PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController.js';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { POSES, poseRotations, posePeriod } from './poses.js';
import '@babylonjs/loaders/glTF/2.0/index.js';

export const HUMANOID = {
  WalkSpeed: 16,      // studs/s
  JumpPower: 50,      // studs/s upward
  Height: 5,          // studs
  MaxSlopeAngle: 89,  // degrees; Roblox's documented default ("climb pretty much any slope")
  StepUp: 0.8,        // studs walked over seamlessly. Roblox's is undocumented; its forum says ~0.8
                      // seamless, 1 with a slight hop, taller needs a jump. Measured here (slopes
                      // scenario): 0.8 full speed, 1.0 at 93%, 1.2 at 63%, 1.5+ blocked.
  SnapDown: 1.3,      // studs the feet follow the floor down (stairs, slopes) before it counts as falling
  Spring: 20,         // 1/s, how fast the body settles onto the floor height
  AutoJumpEnabled: true, // touch only, as in Roblox: jump when walking into something jumpable
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
    this.fade = 0.15; // set by play(); a default so a pose measured before any play() isn't NaN
  }

  // A pose as a clip. `at(t)` gives { nodeName: Quaternion } at time t (s);
  // a pose that sways loops over `period` seconds, a still one holds.
  addPose(name, at, period = 0) {
    const channels = [];
    for (const nodeName of Object.keys(at(0))) {
      const target = this.nodes.find(n => n.name === nodeName);
      if (target) channels.push({ target, path: 'rotationQuaternion', at: t => at(t)[nodeName] });
    }
    this.clips[name] = { channels, from: 0, to: period * 60, fps: 60, loop: period > 0 };
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
      const step = this.fade > 0 ? dt / this.fade : 1;
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
        const v = ch.at ? ch.at(l.time) : ch.anim.evaluate(frame);
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

// The times (s) in a walk-type clip when a sole passes under the hip, which is
// when it touches the ground: where the leg's swing angle changes sign.
function clipContacts(anim, clipName, legName) {
  const c = anim.clips[clipName];
  const leg = c && c.channels.find(ch => ch.target.name === legName && ch.path === 'rotationQuaternion');
  if (!leg) return [];
  const rest = anim.rest.get(leg.target).q;
  const angle = f => { const q = Quaternion.Inverse(rest).multiply(leg.anim.evaluate(f)); return 2 * Math.atan2(q.w < 0 ? -q.x : q.x, Math.abs(q.w)); };
  const out = [];
  for (let f = c.from; f + 0.25 <= c.to; f += 0.25) if (Math.sign(angle(f)) !== Math.sign(angle(f + 0.25))) out.push((f + 0.125 - c.from) / c.fps);
  return out;
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
    // This character's numbers: Roblox's defaults, overridden live from its
    // Humanoid (WalkSpeed, JumpPower, ...) by bindHumanoid.
    this.p = { ...HUMANOID };
    const H = this.p;
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
    for (const name of Object.keys(POSES)) this.anim.addPose(name, t => poseRotations(name, restOf, t), posePeriod(name));
    // Hip-to-sole distance in studs: the leg's pivot height (soles are at y 0).
    const leg = res.transformNodes.concat(res.meshes).find(n => n.name === 'leg-left');
    this.holder.computeWorldMatrix(true); root.computeWorldMatrix(true); leg.computeWorldMatrix(true);
    this.legLength = leg.getAbsolutePosition().y - this.holder.position.y;
    this.walkNatural = clipGroundSpeed(this.anim, 'walk', 'leg-left', this.legLength);
    this.sprintNatural = clipGroundSpeed(this.anim, 'sprint', 'leg-left', this.legLength);
    this.contacts = { walk: clipContacts(this.anim, 'walk', 'leg-left'), sprint: clipContacts(this.anim, 'sprint', 'leg-left') };
    this.on = {}; // event hooks: step(), jump(), land(fallSpeed)
    if (this.anim.clips.die) this.anim.clips.die.loop = false; // plays once and holds
    this.deadBox = this.anim.clips.die ? this.measurePose('die', this.anim.duration('die'), res.meshes) : null;
    this.anim.play('idle', 0);

    // Physics, Roblox's way: the body hovers. The collision capsule starts
    // StepUp above the feet, and floor rays plus a spring hold it at that
    // height. So anything lower than StepUp is walked over, stairs and slopes
    // are followed smoothly, and only taller things block.
    this.capH = H.Height - H.StepUp;
    this.ctrl = new PhysicsCharacterController(Vector3.Zero(), { capsuleHeight: this.capH, capsuleRadius: H.Radius }, scene);
    this.ctrl.maxSlopeCosine = Math.cos(H.MaxSlopeAngle * Math.PI / 180);
    this.ctrl.maxStepHeight = 0; // stepping is the hover spring's job
    this.ctrl.maxCharacterSpeedForSolver = 300; // default 10 would cap walking and jumping
    this.meshes = res.meshes;
    this.visible = true;
    this.yaw = 0;          // facing, radians; 0 = +Z
    this.moveDir = Vector3.Zero();
    this.jumpHeld = false;
    this.state = 'idle';
    this.grounded = false;
    this.velocity = Vector3.Zero();
    this.vy = 0;
    this.ray = new PhysicsRaycastResult();
    this.teleport(spawn ? spawn.clone() : Vector3.Zero());
  }

  /** Put the feet at `foot` (world), standing still. */
  teleport(foot, yaw = this.yaw) {
    this.ctrl.setPosition(new Vector3(foot.x, foot.y + this.p.StepUp + this.capH / 2, foot.z));
    this.ctrl.setVelocity(Vector3.Zero());
    this.vy = 0; this.yaw = yaw; this.grounded = true; this.airTime = 0; this.justJumped = 0; this.jumpAnim = 0;
    this.place();
  }

  // The box a clip's pose occupies at time `t`, in the character's own frame
  // (feet at the origin, facing +Z): {min, max} in studs.
  measurePose(clip, t, meshes) {
    if (!this.anim.clips[clip]) return null;
    this.anim.layers = [{ clip, time: t, weight: 1, target: 1, speed: 0 }];
    this.anim.update(0);
    const inv = this.holder.computeWorldMatrix(true).clone().invert();
    const min = new Vector3(Infinity, Infinity, Infinity), max = min.scale(-1);
    for (const m of meshes) {
      if (!m.getTotalVertices()) continue;
      m.computeWorldMatrix(true);
      for (const c of m.getBoundingInfo().boundingBox.vectorsWorld) {
        const l = Vector3.TransformCoordinates(c, inv);
        min.minimizeInPlace(l); max.maximizeInPlace(l);
      }
    }
    this.anim.layers = [];
    return { min, max };
  }

  // How far the current (dying) pose reaches below the soles, in studs.
  deadLift() {
    let low = 0;
    this.holder.computeWorldMatrix(true);
    const base = this.holder.position.y;
    for (const m of this.meshes) {
      if (!m.getTotalVertices()) continue;
      m.computeWorldMatrix(true);
      low = Math.min(low, m.getBoundingInfo().boundingBox.minimumWorld.y - base);
    }
    this.lift = Math.max(this.lift || 0, -low); // never sink back once lifted
    return this.lift;
  }

  /** Back to life at `foot`: standing, idle, facing `yaw`. */
  respawn(foot, yaw = 0) {
    this.dead = false;
    this.lift = 0;
    this.anim.layers = [];
    this.anim.play('idle', 0);
    this.teleport(foot, yaw);
  }

  get footY() { return this.ctrl.getPosition().y - this.capH / 2 - this.p.StepUp; }

  // The floor under the body: physics rays (so CanCollide=false parts don't
  // count) from the capsule centre and four points around it, down past the
  // feet. Returns the highest walkable hit at most StepUp above the feet.
  probeFloor() {
    const H = this.p, c = this.ctrl.getPosition(), foot = this.footY;
    const eng = this.scene.getPhysicsEngine();
    const minNy = Math.cos(H.MaxSlopeAngle * Math.PI / 180);
    let best = null;
    const r = H.Radius * 0.7;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      eng.raycastToRef(new Vector3(c.x + ox, c.y, c.z + oz), new Vector3(c.x + ox, foot - H.SnapDown - 0.5, c.z + oz), this.ray);
      if (!this.ray.hasHit) continue;
      const y = this.ray.hitPointWorld.y, n = this.ray.hitNormalWorld;
      if (n.y < minNy || y > foot + H.StepUp + 0.05) continue;
      if (!best || y > best.y + 1e-4 || (ox === 0 && oz === 0 && Math.abs(y - best.y) <= 1e-4)) best = { y, n: n.clone(), node: this.ray.body && this.ray.body.transformNode };
    }
    return best;
  }

  // Input for this frame: world-space direction (x, z), length <= 1; jump pressed.
  setInput(dirX, dirZ, jump, touch = false) {
    if (this.dead) { dirX = dirZ = 0; jump = false; }
    this.moveDir.set(dirX, 0, dirZ);
    if (this.moveDir.lengthSquared() > 1) this.moveDir.normalize();
    this.jumpHeld = jump;
    this.touchInput = touch;
  }

  // Auto-jump (touch): walking into something, held back for a moment, and
  // the thing ahead has a top we can land on within jump reach.
  wantsAutoJump(dt, horiz, gravity) {
    const H = this.p;
    const wish = this.moveDir.length();
    const blocked = wish > 0.5 && horiz.length() < 0.5 * wish * H.WalkSpeed;
    this.blockedTime = blocked ? (this.blockedTime || 0) + dt : 0;
    if (!H.AutoJumpEnabled || !this.touchInput || this.blockedTime < 0.1) return false;
    const d = this.moveDir.normalizeToNew(), foot = this.footY, p = this.ctrl.getPosition();
    const reach = H.JumpPower * H.JumpPower / (2 * gravity) - 0.4; // clear it with a little room
    const x = p.x + d.x * (H.Radius + 0.6), z = p.z + d.z * (H.Radius + 0.6);
    this.scene.getPhysicsEngine().raycastToRef(new Vector3(x, foot + reach + 0.5, z), new Vector3(x, foot, z), this.ray);
    if (!this.ray.hasHit) return false;
    const top = this.ray.hitPointWorld.y - foot;
    return top > H.StepUp && top <= reach && this.ray.hitNormalWorld.y > 0.5;
  }

  step(dt, gravity) {
    const H = this.p;
    const g = new Vector3(0, -gravity, 0);
    this.justJumped = Math.max(0, (this.justJumped || 0) - dt);
    const v = this.ctrl.getVelocity();
    const foot = this.footY;
    const floor = this.justJumped > 0 ? null : this.probeFloor();
    // On the ground: following the floor down to SnapDown if we were already
    // on it; landing only when falling and the floor is within this step.
    let grounded = false;
    if (floor) {
      const gap = foot - floor.y;
      grounded = this.grounded ? gap <= H.SnapDown : this.vy <= 0 && gap <= Math.max(0.05, -this.vy * dt + 0.05);
    }
    this.lastSupport = floor ? +floor.n.y.toFixed(3) : null;
    this.floorPart = floor && floor.node && floor.node.metadata ? floor.node.metadata.instance : null;

    const want = this.moveDir.scale(H.WalkSpeed);
    const k = 1 - Math.exp(-(grounded ? H.Accel : H.AirAccel) * dt);
    const horiz = new Vector3(v.x, 0, v.z);
    horiz.addInPlace(want.subtract(horiz).scale(k));
    let outY;
    if (grounded && (this.jumpHeld || this.wantsAutoJump(dt, new Vector3(v.x, 0, v.z), gravity))) {
      // Jump: vertical speed is tracked here and the body moves by the step's
      // mean velocity, so the arc is exact: JumpPower²/2g = 6.37 studs.
      grounded = false;
      this.justJumped = 0.1;
      this.jumpAnim = 0.31; // Roblox's Animate: the jump animation plays 0.31 s before fall
      this.blockedTime = 0;
      this.on.jump && this.on.jump();
      const vy1 = H.JumpPower - gravity * dt;
      outY = (H.JumpPower + vy1) / 2; this.vy = vy1;
    } else if (grounded) {
      // Hold the feet on the floor: follow its slope under the horizontal
      // velocity (horizontal speed stays WalkSpeed on a ramp) and spring out
      // any height error (a step up or down).
      const n = floor.n;
      const along = -(n.x * horiz.x + n.z * horiz.z) / n.y;
      const err = floor.y - foot;
      outY = along + err * Math.min(H.Spring, 1 / dt);
      this.vy = along;
    } else {
      const vy0 = this.vy, vy1 = vy0 - gravity * dt;
      outY = (vy0 + vy1) / 2; this.vy = vy1;
    }
    const out = new Vector3(horiz.x, outY, horiz.z);
    this.ctrl.setVelocity(out);
    const support = this.ctrl.checkSupport(dt, new Vector3(0, -1, 0));
    this.ctrl.integrate(dt, support, g);
    this.velocity = this.ctrl.getVelocity().clone(); // a copy: getVelocity returns the controller's own vector
    // A ceiling (or a wall's slope) changed the vertical speed: take the solver's.
    if (!grounded && Math.abs(this.velocity.y - out.y) > 1e-3) this.vy = this.velocity.y;
    this.velocity.y = this.vy;
    if (grounded && !this.grounded && this.airTime > 0) this.on.land && this.on.land(-this.lastAirVy);
    this.lastAirVy = grounded ? 0 : this.vy;
    this.grounded = grounded;
    this.airTime = grounded ? 0 : (this.airTime || 0) + dt;
    if (!grounded) this.blockedTime = 0;

    // Turn toward movement.
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.moveDir.lengthSquared() > 0.01) {
      const target = Math.atan2(this.moveDir.x, this.moveDir.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-H.TurnRate * dt));
    }

    // Animation state, with Roblox's Animate timings: jump fades in over 0.1 s
    // and holds 0.31 s, then fall fades in over 0.2 s; idle and walk over 0.2 s.
    // Airborne without a jump only counts after a moment off the ground, so
    // stepping off a ledge edge or a contact flicker on landing doesn't pop.
    this.jumpAnim = Math.max(0, (this.jumpAnim || 0) - dt);
    let state;
    if (this.dead) state = this.anim.clips.die ? 'die' : 'idle';
    else if (!this.grounded && this.jumpAnim > 0) state = 'jump';
    else if (!this.grounded && (this.justJumped > 0 || this.airTime > 0.12 || this.state === 'jump' || this.state === 'fall')) state = 'fall';
    else if (sp > (this.state === 'walk' ? 0.3 : 0.8)) state = 'walk'; // hysteresis: no flicker when pushing into a wall
    else state = 'idle';
    if (state === 'walk') {
      // Walk or sprint clip, whichever's natural speed is closer; rate matches the ground.
      // Switch clips only once the other is clearly closer (10% margin), so a
      // speed near the midpoint doesn't flip clips every frame.
      const dW = Math.abs(sp - this.walkNatural), dS = Math.abs(sp - this.sprintNatural);
      const cur = this.anim.current === 'sprint' || this.anim.current === 'walk' ? this.anim.current : null;
      const clip = cur === 'sprint' ? (dW < dS * 0.9 ? 'walk' : 'sprint') : cur === 'walk' ? (dS < dW * 0.9 ? 'sprint' : 'walk') : (dS < dW ? 'sprint' : 'walk');
      const natural = clip === 'sprint' ? this.sprintNatural : this.walkNatural;
      const rate = Math.min(2.2, Math.max(0.4, sp / natural));
      if (this.anim.current !== clip) this.anim.play(clip, 0.2, rate);
      else this.anim.layers.find(l => l.clip === clip).speed = rate;
    } else if (this.anim.current !== state) {
      this.anim.play(state, state === 'jump' ? 0.1 : 0.2);
    }
    this.state = state;
    // A footstep when the leading walk/run layer passes a sole contact.
    const lead = this.anim.layers.filter(l => this.contacts[l.clip]).sort((a, b) => b.weight - a.weight)[0];
    const before = lead ? lead.time : 0;
    this.anim.update(dt);
    if (lead && lead.weight > 0.5 && state === 'walk' && this.grounded) {
      const len = this.anim.duration(lead.clip), after = lead.time;
      const crossed = c => (after >= before ? c > before && c <= after : c > before || c <= after);
      if (this.contacts[lead.clip].some(crossed)) this.on.step && this.on.step();
    }
    this.place();
  }

  place() {
    const p = this.ctrl.getPosition();
    let foot = this.footY;
    // The die pose dips below the soles (the body lies with its back below
    // the feet' level): lift the body so its lowest point rests on the floor.
    if (this.dead && this.deadBox) foot += this.deadLift();
    this.holder.position.set(p.x, foot, p.z);
    this.holder.rotationQuaternion = Quaternion.RotationAxis(UP, this.yaw);
  }

  // Hidden (e.g. before spawning) and faded (the camera's closeness, 0-1) combine.
  setVisible(v) { if (v !== this.visible) { this.visible = v; this.applyVisibility(); } }
  setFade(a) { if (a !== this.fade) { this.fade = a; this.applyVisibility(); } }
  applyVisibility() {
    const a = this.fade || 0;
    this.meshes.forEach(m => { m.isVisible = this.visible && a < 0.999; m.visibility = 1 - a; });
  }
  faceYaw(yaw) { this.yaw = yaw; }

  get footPosition() { return this.holder.position; }
}
