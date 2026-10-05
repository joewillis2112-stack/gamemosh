// Walking in Minecraft: a 0.6 x 1.8 box with gravity that collides with
// blocks, steps up one block on its own (Minecraft's auto-jump, handy on a
// phone), swims, and a ray for the block you're looking at.

const WIDTH = 0.3; // half width
const HEIGHT = 1.8;
export const EYE = 1.62;
const GRAVITY = 30;
const JUMP = 8.6;
const WALK = 4.3, SPRINT = 6.2, SWIM = 2.6, SNEAK = 1.3, SWIM_SPRINT = 5.6, CLIMB = 2.4, FLY = 10;

export class Player {
  constructor(x, y, z) {
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    // Your partner Pokémon: perks (swim, jump, glide) and riding it (speed; fly; surf is handled by the page's collision).
    this.mods = { swim: 1, jump: 1, glide: false, speed: 1, fly: false, ride: 0 };
    this.sneaking = false;
    this.swimming = false; // sprint-swimming underwater
    this.climbing = false;
    this.stepAgo = 0;
  }

  /// `solid(x, y, z)` -> height of the solid part of that block (0 none,
  /// 0.5 slab, 1 full); `water(x, y, z)` -> bool. `move` is [right, forward]
  /// in -1..1; `jump`, `sprint` held. `o.sneak` held; `o.climb(x, y, z)` says
  /// whether a block is a ladder or vine.
  step(dt, move, jump, sprint, solid, water, o = {}) {
    const [mx, mz] = move;
    const m = this.mods;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const sneak = !!o.sneak && !m.fly;
    this.sneaking = sneak && !this.inWater;
    if (m.fly) return this.flyStep(dt, mx, mz, jump, !!o.sneak, sprint, solid);
    // Forward is -Z when yaw is 0 (three.js camera convention).
    // Sprinting underwater (head under): Minecraft's swim, fast and along where you look.
    const headUnder = this.inWater && water(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 1.5), Math.floor(this.pos[2]));
    this.swimming = headUnder && sprint && mz > 0.3;
    let speed = this.swimming ? SWIM_SPRINT * m.swim : this.inWater ? SWIM * m.swim : this.sneaking ? SNEAK : sprint ? SPRINT : WALK;
    if (m.ride && !this.inWater) speed *= m.speed;
    let wx = (mx * c - mz * s) * speed, wz = (-mx * s - mz * c) * speed;
    const len = Math.hypot(mx, mz);
    if (len > 1) { wx /= len; wz /= len; }
    const accel = this.onGround || this.inWater ? 14 : 4;
    this.vel[0] += (wx - this.vel[0]) * Math.min(1, accel * dt);
    this.vel[2] += (wz - this.vel[2]) * Math.min(1, accel * dt);

    const feet = [this.pos[0], this.pos[1] + 0.2, this.pos[2]];
    this.inWater = water(Math.floor(feet[0]), Math.floor(feet[1]), Math.floor(feet[2]));
    if (this.swimming) {
      // Up or down with your view while sprint-swimming.
      this.vel[1] += (this.look()[1] * SWIM_SPRINT * m.swim - this.vel[1]) * Math.min(1, 6 * dt);
    } else if (this.inWater) {
      this.vel[1] -= GRAVITY * 0.18 * dt;
      this.vel[1] *= 0.9;
      if (jump) this.vel[1] = Math.min(this.vel[1] + 20 * dt, 3.2);
      if (o.sneak) this.vel[1] = Math.max(this.vel[1] - 14 * dt, -3); // sneak to dive
    } else {
      this.vel[1] -= GRAVITY * dt;
      if (jump && this.onGround) this.vel[1] = JUMP * m.jump * (m.ride ? m.rideJump || 1 : 1);
      // A Flying-type lead: hold JUMP in the air to glide down.
      if (jump && !this.onGround && this.mods.glide && this.vel[1] < -2.2) this.vel[1] = -2.2;
    }
    this.vel[1] = Math.max(this.vel[1], -40);
    // Ladders and vines: walk into them or hold JUMP to climb, sneak to hold on, otherwise slide down slowly.
    this.climbing = !!o.climb && !m.ride && this.onClimbable(o.climb);
    if (this.climbing) {
      if (jump || mz > 0.3) this.vel[1] = CLIMB;
      else if (o.sneak) this.vel[1] = 0;
      else this.vel[1] = Math.max(this.vel[1], -CLIMB);
    }

    const before = [this.pos[0], this.pos[2]];
    const wasOnGround = this.onGround;
    // Sneaking on the ground: you don't step off edges.
    const guard = this.sneaking && wasOnGround;
    const px = this.pos[0];
    this.moveAxis(0, this.vel[0] * dt, solid);
    if (guard && !this.supported(solid)) { this.pos[0] = px; this.vel[0] = 0; }
    const pz = this.pos[2];
    this.moveAxis(2, this.vel[2] * dt, solid);
    if (guard && !this.supported(solid)) { this.pos[2] = pz; this.vel[2] = 0; }
    // Bumped into a one-block step while walking: hop it.
    const blocked = Math.hypot(this.pos[0] - before[0], this.pos[2] - before[1]) < Math.hypot(wx, wz) * dt * 0.3;
    if (blocked && wasOnGround && Math.hypot(wx, wz) > 0.5 && !this.inWater && this.canStepUp(wx, wz, solid)) this.vel[1] = JUMP;
    // Swimming into a bank: climb out, as in Minecraft (swim against a wall
    // and you rise). Without this, swimming up stops at the surface and the
    // edge of a pond is always just out of reach.
    else if (blocked && Math.hypot(wx, wz) > 0.5 && this.wet(water) && this.canClimbOut(wx, wz, solid)) this.vel[1] = Math.max(this.vel[1], 6.5);
    this.onGround = false;
    this.moveAxis(1, this.vel[1] * dt, solid);
  }

  /// Flying on your partner: no gravity, JUMP climbs, sneak descends.
  flyStep(dt, mx, mz, jump, down, sprint, solid) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const speed = FLY * (sprint ? 1.5 : 1) * (this.mods.speed || 1);
    let wx = (mx * c - mz * s) * speed, wz = (-mx * s - mz * c) * speed;
    const len = Math.hypot(mx, mz);
    if (len > 1) { wx /= len; wz /= len; }
    const k = Math.min(1, 5 * dt);
    this.vel[0] += (wx - this.vel[0]) * k;
    this.vel[2] += (wz - this.vel[2]) * k;
    this.vel[1] += ((jump ? 7 : 0) - (down ? 7 : 0) - this.vel[1]) * k;
    this.inWater = false;
    this.moveAxis(0, this.vel[0] * dt, solid);
    this.moveAxis(2, this.vel[2] * dt, solid);
    this.onGround = false;
    this.moveAxis(1, this.vel[1] * dt, solid);
  }

  /// Something under your feet within half a block (for sneaking at edges).
  supported(solid) {
    const y = Math.floor(this.pos[1] - 0.5);
    for (const dx of [-WIDTH, WIDTH]) for (const dz of [-WIDTH, WIDTH]) {
      if (solid(Math.floor(this.pos[0] + dx), y, Math.floor(this.pos[2] + dz)) > 0) return true;
    }
    return false;
  }

  /// In or against a ladder or vine.
  onClimbable(climb) {
    const y0 = Math.floor(this.pos[1] + 0.1), y1 = Math.floor(this.pos[1] + 1.2);
    for (const [dx, dz] of [[0, 0], [WIDTH + 0.1, 0], [-WIDTH - 0.1, 0], [0, WIDTH + 0.1], [0, -WIDTH - 0.1]]) {
      const x = Math.floor(this.pos[0] + dx), z = Math.floor(this.pos[2] + dz);
      if (climb(x, y0, z) || climb(x, y1, z)) return true;
    }
    return false;
  }

  /// In the water, or bobbing just above it.
  wet(water) {
    const x = Math.floor(this.pos[0]), z = Math.floor(this.pos[2]);
    return this.inWater || water(x, Math.floor(this.pos[1] - 0.3), z);
  }

  /// Is there room to stand within two blocks above your feet, on the far side of what you're swimming into?
  canClimbOut(wx, wz, solid) {
    const l = Math.hypot(wx, wz);
    const ax = Math.floor(this.pos[0] + (wx / l) * (WIDTH + 0.3)), az = Math.floor(this.pos[2] + (wz / l) * (WIDTH + 0.3));
    const y = Math.floor(this.pos[1] + 0.01), x = Math.floor(this.pos[0]), z = Math.floor(this.pos[2]);
    if (solid(x, y + 2, z) > 0) return false; // no headroom
    for (let yy = y; yy <= y + 2; yy++) if (solid(ax, yy, az) === 0 && solid(ax, yy + 1, az) === 0) return true;
    return false;
  }

  canStepUp(wx, wz, solid) {
    const l = Math.hypot(wx, wz);
    const ax = this.pos[0] + (wx / l) * (WIDTH + 0.3), az = this.pos[2] + (wz / l) * (WIDTH + 0.3);
    const y = Math.floor(this.pos[1] + 0.01);
    return solid(Math.floor(ax), y, Math.floor(az)) > 0 && solid(Math.floor(ax), y + 1, Math.floor(az)) === 0 && solid(Math.floor(ax), y + 2, Math.floor(az)) === 0
      && solid(Math.floor(this.pos[0]), y + 2, Math.floor(this.pos[2])) === 0;
  }

  // Move along one axis, then push out of anything solid.
  moveAxis(axis, d, solid) {
    if (!d) return;
    this.pos[axis] += d;
    const [x, y, z] = this.pos;
    const x0 = Math.floor(x - WIDTH), x1 = Math.floor(x + WIDTH);
    const y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT - 0.001);
    const z0 = Math.floor(z - WIDTH), z1 = Math.floor(z + WIDTH);
    for (let by = y0 - 1; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          const h = solid(bx, by, bz);
          if (!h) continue;
          // The block's box: [bx, bx+1] x [by, by+h] x [bz, bz+1]
          if (!(x + WIDTH > bx && x - WIDTH < bx + 1 && y + HEIGHT > by && y < by + h && z + WIDTH > bz && z - WIDTH < bz + 1)) continue;
          if (axis === 0) this.pos[0] = d > 0 ? bx - WIDTH - 0.0001 : bx + 1 + WIDTH + 0.0001;
          else if (axis === 2) this.pos[2] = d > 0 ? bz - WIDTH - 0.0001 : bz + 1 + WIDTH + 0.0001;
          else if (d < 0) { this.pos[1] = by + h; this.onGround = true; }
          else this.pos[1] = by - HEIGHT - 0.0001;
          this.vel[axis] = 0;
          return;
        }
      }
    }
  }

  /// Your eyes: lower when sneaking, higher when riding.
  eye() { return [this.pos[0], this.pos[1] + EYE + (this.mods.ride || 0) - (this.sneaking ? 0.3 : 0), this.pos[2]]; }

  look() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }
}

/// Walk a ray through the block grid (Amanatides & Woo) until `hit(x, y, z)`
/// says yes, up to `max` blocks. Returns { x, y, z, face: [nx, ny, nz], t }.
export function raycast(o, d, max, hit) {
  let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
  const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
  const tDelta = d.map((v) => (v ? Math.abs(1 / v) : Infinity));
  const next = (p, i) => (step[i] > 0 ? Math.floor(p) + 1 - p : p - Math.floor(p)) * tDelta[i];
  const tMax = [next(o[0], 0), next(o[1], 1), next(o[2], 2)];
  let face = [0, 0, 0], t = 0;
  while (t <= max) {
    if (hit(x, y, z)) return { x, y, z, face, t };
    if (tMax[0] < tMax[1] && tMax[0] < tMax[2]) { x += step[0]; t = tMax[0]; tMax[0] += tDelta[0]; face = [-step[0], 0, 0]; }
    else if (tMax[1] < tMax[2]) { y += step[1]; t = tMax[1]; tMax[1] += tDelta[1]; face = [0, -step[1], 0]; }
    else { z += step[2]; t = tMax[2]; tMax[2] += tDelta[2]; face = [0, 0, -step[2]]; }
  }
  return null;
}
