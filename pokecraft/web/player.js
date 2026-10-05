// Walking in Minecraft: a 0.6 x 1.8 box with gravity that collides with
// blocks, steps up one block on its own (Minecraft's auto-jump, handy on a
// phone), swims, and a ray for the block you're looking at.

const WIDTH = 0.3; // half width
const HEIGHT = 1.8;
export const EYE = 1.62;
const GRAVITY = 30;
const JUMP = 8.6;
const WALK = 4.3, SPRINT = 6.2, SWIM = 2.6;

export class Player {
  constructor(x, y, z) {
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.stepAgo = 0;
  }

  /// `solid(x, y, z)` -> height of the solid part of that block (0 none,
  /// 0.5 slab, 1 full); `water(x, y, z)` -> bool. `move` is [right, forward]
  /// in -1..1; `jump`, `sprint` held.
  step(dt, move, jump, sprint, solid, water) {
    const [mx, mz] = move;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // Forward is -Z when yaw is 0 (three.js camera convention).
    const speed = this.inWater ? SWIM : sprint ? SPRINT : WALK;
    let wx = (mx * c - mz * s) * speed, wz = (-mx * s - mz * c) * speed;
    const len = Math.hypot(mx, mz);
    if (len > 1) { wx /= len; wz /= len; }
    const accel = this.onGround || this.inWater ? 14 : 4;
    this.vel[0] += (wx - this.vel[0]) * Math.min(1, accel * dt);
    this.vel[2] += (wz - this.vel[2]) * Math.min(1, accel * dt);

    const feet = [this.pos[0], this.pos[1] + 0.2, this.pos[2]];
    this.inWater = water(Math.floor(feet[0]), Math.floor(feet[1]), Math.floor(feet[2]));
    if (this.inWater) {
      this.vel[1] -= GRAVITY * 0.18 * dt;
      this.vel[1] *= 0.9;
      if (jump) this.vel[1] = Math.min(this.vel[1] + 20 * dt, 3.2);
    } else {
      this.vel[1] -= GRAVITY * dt;
      if (jump && this.onGround) this.vel[1] = JUMP;
    }
    this.vel[1] = Math.max(this.vel[1], -40);

    const before = [this.pos[0], this.pos[2]];
    const wasOnGround = this.onGround;
    this.moveAxis(0, this.vel[0] * dt, solid);
    this.moveAxis(2, this.vel[2] * dt, solid);
    // Bumped into a one-block step while walking: hop it.
    const blocked = Math.hypot(this.pos[0] - before[0], this.pos[2] - before[1]) < Math.hypot(wx, wz) * dt * 0.3;
    if (blocked && wasOnGround && Math.hypot(wx, wz) > 0.5 && !this.inWater && this.canStepUp(wx, wz, solid)) this.vel[1] = JUMP;
    this.onGround = false;
    this.moveAxis(1, this.vel[1] * dt, solid);
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

  eye() { return [this.pos[0], this.pos[1] + EYE, this.pos[2]]; }

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
