// Thin wrapper over Rapier (a Rust physics engine compiled to WebAssembly).
import RAPIER from '@dimforge/rapier3d-compat';

export let R = null;

export async function initPhysics() {
  await RAPIER.init();
  R = RAPIER;
}

// Collision group bits
export const G = {
  STATIC: 1,
  PLAYER: 2,
  ENEMY: 4,
  PROP: 8,
  DEBRIS: 16,
  PROJECTILE: 32,
};
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const GROUPS = {
  static: groups(G.STATIC, 0xffff),
  player: groups(G.PLAYER, G.STATIC | G.ENEMY | G.PROP),
  enemy: groups(G.ENEMY, G.STATIC | G.PLAYER | G.ENEMY | G.PROP),
  prop: groups(G.PROP, G.STATIC | G.PLAYER | G.ENEMY | G.PROP | G.DEBRIS | G.PROJECTILE),
  debris: groups(G.DEBRIS, G.STATIC | G.PROP | G.DEBRIS),
  projectile: groups(G.PROJECTILE, G.STATIC | G.PROP),
  // query filters
  worldOnly: groups(0xffff, G.STATIC),
  worldAndProps: groups(0xffff, G.STATIC | G.PROP),
};

export class Physics {
  constructor() {
    this.world = new R.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = 1 / 60;
    this.acc = 0;
    this.info = new Map(); // collider handle -> gameplay info
    this.dynamic = new Set(); // { body, mesh, ... } synced each frame
    this.controller = this.world.createCharacterController(0.03);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    this.controller.enableAutostep(0.55, 0.2, false);
    this.controller.enableSnapToGround(0.4);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(70);
  }

  // Runs gameplay at a fixed 60 Hz so kinematic movement is frame-rate independent.
  step(dt, fixedUpdate) {
    const h = 1 / 60;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= h && n < 4) {
      if (fixedUpdate) fixedUpdate(h, n);
      this.world.step();
      this.acc -= h;
      n++;
    }
    if (n === 4) this.acc = 0;
    for (const d of this.dynamic) {
      if (!d.body || !d.mesh) continue;
      const t = d.body.translation();
      const r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    return n;
  }

  fixed(desc, info) {
    const c = this.world.createCollider(desc.setCollisionGroups(GROUPS.static));
    if (info) this.info.set(c.handle, info);
    return c;
  }

  removeCollider(c) {
    if (!c) return;
    this.info.delete(c.handle);
    this.world.removeCollider(c, false);
  }

  removeBody(b) {
    if (!b) return;
    const n = b.numColliders();
    for (let i = 0; i < n; i++) this.info.delete(b.collider(i).handle);
    this.world.removeRigidBody(b);
  }

  raycast(from, dir, maxToi, filter = GROUPS.worldOnly, excludeBody) {
    const ray = new R.Ray(from, dir);
    const hit = this.world.castRay(ray, maxToi, true, undefined, filter, undefined, excludeBody);
    return hit ? hit.timeOfImpact : null;
  }

  // Colliders overlapping a sphere
  overlapSphere(center, radius, filter, cb) {
    const shape = new R.Ball(radius);
    this.world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, shape, cb, undefined, filter);
  }
}
