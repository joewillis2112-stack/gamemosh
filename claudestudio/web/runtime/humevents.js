// A driven character's Humanoid events and touches, written once for the player's character
// (runtime/players.js) and NPCs (runtime/npcs.js):
// - after each step: MoveDirection, FloorMaterial; Jumping(true) on takeoff, FreeFalling(true/false)
//   entering and leaving a fall, Running(speed over the floor) whenever it changes (including to 0);
// - Touched / TouchEnded: the body as a capsule from the soles to the top of the head, radius the collision
//   capsule's plus a 0.15-stud skin, tested exactly against each part's shape (box, ball, cylinder, wedge);
//   on the part, the root part and the Humanoid, as Roblox fires them.
// - Characters touching characters (their parts aren't the World's): two bodies whose capsules meet touch
//   root part to root part, so `hit.Parent:FindFirstChildOfClass("Humanoid")` finds the other (OURS: Roblox
//   fires it per limb).
import { V3 } from '../datamodel.js';
import { capsuleHits } from './shapes.js';

const SKIN = 0.15;

export class HumanoidEvents {
  constructor(dm, world) { Object.assign(this, { dm, world }); this.touching = new Set(); this.lastState = undefined; this.lastSpeed = undefined; }

  /** After the character `c` stepped: the Humanoid's movement properties and events. */
  step(c, hum) {
    const md = c.moveDir, H = hum.props;
    H.MoveDirection = new V3(md.x, 0, md.z);
    H.FloorMaterial = c.grounded && c.floorPart ? c.floorPart.props.Material : 'Air';
    if (c.state !== this.lastState) {
      if (c.state === 'jump' && this.lastState !== 'jump') this.dm.fire(hum, 'Jumping', [true]);
      if (c.state === 'fall') this.dm.fire(hum, 'FreeFalling', [true]);
      if (this.lastState === 'fall') this.dm.fire(hum, 'FreeFalling', [false]);
      this.lastState = c.state;
    }
    const speed = c.grounded ? Math.hypot(c.velocity.x - c.floorVel.x, c.velocity.z - c.floorVel.z) : 0; // over the floor (ours: Roblox doesn't say)
    if (c.grounded && Math.abs(speed - (this.lastSpeed ?? -1)) > 0.1) { this.lastSpeed = speed; this.dm.fire(hum, 'Running', [speed]); }
  }

  // The body's touching capsule: [ax, ay, az, by, R] (vertical, from the soles up).
  static capsule(c) { const f = c.holder.position, R = c.p.Radius + SKIN; return [f.x, f.y + R - SKIN, f.z, f.y + c.p.Height - R + SKIN, R]; }

  /** What the body touches now: World parts, and other characters' roots (others: [{ root, char }]). */
  touches(c, hum, root, others = []) {
    const [ax, ay, az, by, R] = HumanoidEvents.capsule(c), now = new Set();
    for (const [inst, e] of this.world.parts) {
      if (inst.isCharacter || inst.props.CanTouch === false) continue;
      if (capsuleHits(ax, ay, az, ax, by, az, R, e.shape)) now.add(inst);
    }
    for (const o of others) {
      if (!o.char || o.root === root || o.root.destroyed) continue;
      const [bx, oy0, bz, oy1, oR] = HumanoidEvents.capsule(o.char);
      if (Math.hypot(ax - bx, az - bz) < R + oR && ay <= oy1 + oR && oy0 <= by + R) now.add(o.root);
    }
    for (const part of now) if (!this.touching.has(part)) {
      this.dm.fire(part, 'Touched', [root]);
      this.dm.fire(root, 'Touched', [part]);
      this.dm.fire(hum, 'Touched', [part, root]);
    }
    for (const part of this.touching) if (!now.has(part) && !part.destroyed) {
      this.dm.fire(part, 'TouchEnded', [root]);
      this.dm.fire(root, 'TouchEnded', [part]);
    }
    this.touching = now;
  }

  /** The body leaves (respawn, removal, death): what it touched gets TouchEnded. */
  endTouches(root) {
    for (const part of this.touching) if (!part.destroyed) {
      this.dm.fire(part, 'TouchEnded', [root]);
      if (root && !root.destroyed) this.dm.fire(root, 'TouchEnded', [part]);
    }
    this.touching = new Set();
  }
}
