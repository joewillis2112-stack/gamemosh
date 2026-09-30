// Procedural architecture for every location type.
// Each design writes merged geometry, collider descriptors, interactables, fires,
// physics props and enemy spawn points, all in the location's local space.
import * as THREE from 'three';
import { R } from '../physics.js';
import { RNG, hashInts } from '../core/rng.js';
import { MeshKit, PAL } from './meshkit.js';

const Y = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Builder {
  constructor(loc, protos) {
    this.loc = loc;
    this.P = protos;
    this.kit = new MeshKit();
    this.colliders = []; // { desc builder fn } created on activation
    this.interact = [];
    this.fires = [];
    this.props = [];
    this.spawns = [];
    this.chests = [];
    this.stack = [];
    this.tx = 0; this.tz = 0; this.tr = 0;
    this.rng = new RNG(hashInts(loc.seed, 5));
    this.counter = 0;
  }

  // Nested local frame (e.g. a house inside a hamlet)
  push(x, z, ry) {
    this.stack.push([this.tx, this.tz, this.tr]);
    const [wx, wz] = this.xf(x, z);
    this.tx = wx; this.tz = wz; this.tr += ry;
  }
  pop() {
    [this.tx, this.tz, this.tr] = this.stack.pop();
  }
  xf(x, z) {
    const c = Math.cos(this.tr), s = Math.sin(this.tr);
    return [this.tx + x * c + z * s, this.tz - x * s + z * c];
  }

  // World-space from location-local
  world(x, y, z) {
    _v.set(x, y, z).applyAxisAngle(Y, this.loc.rot);
    return { x: this.loc.x + _v.x, y: this.loc.y + _v.y, z: this.loc.z + _v.z };
  }
  worldRot(rx, ry, rz) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _qr.setFromAxisAngle(Y, this.loc.rot).multiply(_q);
    return { x: _qr.x, y: _qr.y, z: _qr.z, w: _qr.w };
  }

  tint() {
    return this.rng.range(0.82, 1.08);
  }

  // y = bottom of the box
  box(x, y, z, w, h, d, color, o = {}) {
    const [lx, lz] = this.xf(x, z);
    const ry = (o.ry || 0) + this.tr;
    const rx = o.rx || 0, rz = o.rz || 0;
    if (o.visible !== false) this.kit.addAt(this.P.box, lx, y + h / 2, lz, ry, w, h, d, o.tint ?? this.tint(), rx, rz, color);
    if (o.collide !== false) {
      const p = this.world(lx, y + h / 2, lz);
      const q = this.worldRot(rx, ry, rz);
      this.colliders.push(() => R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(q));
    }
  }

  cyl(x, y, z, r, h, color, o = {}) {
    const [lx, lz] = this.xf(x, z);
    const proto = o.seg === 6 ? this.P.cyl6 : o.seg === 12 ? this.P.cyl12 : this.P.cyl8;
    const ry = (o.ry || 0) + this.tr;
    const rx = o.rx || 0, rz = o.rz || 0;
    this.kit.addAt(proto, lx, y + (o.centered ? 0 : h / 2), lz, ry, r * 2, h, r * 2, o.tint ?? this.tint(), rx, rz, color);
    if (o.collide !== false) {
      const p = this.world(lx, y + (o.centered ? 0 : h / 2), lz);
      const q = this.worldRot(rx, ry, rz);
      this.colliders.push(() => R.ColliderDesc.cylinder(h / 2, r).setTranslation(p.x, p.y, p.z).setRotation(q));
    }
  }

  cone(x, y, z, r, h, color, o = {}) {
    const [lx, lz] = this.xf(x, z);
    const proto = o.seg === 4 ? this.P.cone4 : o.seg === 6 ? this.P.cone6 : this.P.cone8;
    this.kit.addAt(proto, lx, y + h / 2, lz, (o.ry || 0) + this.tr, r * 2, h, r * 2, o.tint ?? this.tint(), o.rx || 0, o.rz || 0, color);
    if (o.collide) {
      const p = this.world(lx, y + h / 2, lz);
      this.colliders.push(() => R.ColliderDesc.cone(h / 2, r).setTranslation(p.x, p.y, p.z));
    }
  }

  proto(key, x, y, z, s = 1, ry = 0, o = {}) {
    const [lx, lz] = this.xf(x, z);
    const variants = this.P[key];
    const proto = variants[this.rng.int(0, variants.length - 1)];
    this.kit.addAt(proto, lx, y, lz, ry + this.tr, s, s, s, this.tint());
    if (o.collide === 'rock') {
      const p = this.world(lx, y, lz);
      this.colliders.push(() => R.ColliderDesc.ball(0.8 * s).setTranslation(p.x, p.y, p.z));
    } else if (o.collide === 'tree') {
      const p = this.world(lx, y + 2, lz);
      this.colliders.push(() => R.ColliderDesc.cylinder(2, 0.28 * s).setTranslation(p.x, p.y, p.z));
    }
  }

  // ---- gameplay hooks (positions stored in world space) ----
  _id(prefix) {
    return `${prefix}:${this.loc.id}:${this.counter++}`;
  }
  addInteract(x, y, z, action, label, extra = {}) {
    const [lx, lz] = this.xf(x, z);
    const p = this.world(lx, y, lz);
    const it = { id: this._id(action), x: p.x, y: p.y, z: p.z, r: extra.r || 2.4, action, label, loc: this.loc, ...extra };
    this.interact.push(it);
    return it;
  }
  addFire(x, y, z, kind, scale = 1, lit = true) {
    const [lx, lz] = this.xf(x, z);
    const p = this.world(lx, y, lz);
    const f = { x: p.x, y: p.y, z: p.z, kind, scale, lit, loc: this.loc };
    this.fires.push(f);
    return f;
  }
  addProp(x, y, z, kind) {
    const [lx, lz] = this.xf(x, z);
    const p = this.world(lx, y, lz);
    this.props.push({ ...p, kind, ry: this.rng.range(0, 6) });
  }
  addSpawn(x, z, type, extra = {}) {
    const [lx, lz] = this.xf(x, z);
    const p = this.world(lx, 0, lz);
    this.spawns.push({ x: p.x, z: p.z, type, ...extra });
  }
  addChest(x, z, ry, quality = 0.3) {
    const [lx, lz] = this.xf(x, z);
    const p = this.world(lx, 0, lz);
    const it = this.addInteract(x, 0.6, z, 'chest', 'Open chest', { quality, ry: ry + this.tr + this.loc.rot });
    it.chestPos = p;
    this.chests.push(it);
    this.box(x, 0, z, 1.1, 0.6, 0.7, PAL.darkWood, { ry, collide: true, visible: false });
    return it;
  }
  addNote(x, y, z) {
    this.box(x, y, z, 0.35, 0.03, 0.45, 0xb9ad8c, { collide: false, ry: this.rng.range(-0.4, 0.4) });
    return this.addInteract(x, y + 0.2, z, 'note', 'Read note', { r: 2 });
  }

  crenels(x0, z0, x1, z1, y, n, color) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      this.box(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, 0.8, 0.8, 0.8, color, { collide: false });
    }
  }
}

// ---------------- designs ----------------
const STONE = [PAL.stone, PAL.darkStone, PAL.moss];

function wallSegment(b, x, z, len, h, thick, alongX, color) {
  if (alongX) b.box(x, 0, z, len, h, thick, color);
  else b.box(x, 0, z, thick, h, len, color);
}

function keep(b) {
  const r = b.rng;
  const S = 24, H = 6, T = 1.6, L = 6;
  for (let side = 0; side < 4; side++) {
    for (let k = -S + L / 2; k < S; k += L) {
      const alongX = side % 2 === 0;
      const x = alongX ? k : side === 1 ? S : -S;
      const z = alongX ? (side === 0 ? S : -S) : k;
      if (side === 0 && Math.abs(k) < L / 2 + 0.1) continue; // gate
      const breach = r.chance(0.16);
      const h = breach ? r.range(0.8, 2) : r.chance(0.25) ? H * r.range(0.5, 0.8) : H;
      const col = r.pick(STONE);
      wallSegment(b, x, z, L + 0.02, h, T, alongX, col);
      if (h === H) {
        if (alongX) b.crenels(x - L / 2, z, x + L / 2, z, H, 3, col);
        else b.crenels(x, z - L / 2, x, z + L / 2, H, 3, col);
      }
      if (breach) for (let i = 0; i < 3; i++) b.proto('rock', x + r.range(-2, 2), 0.2, z + r.range(-2, 2), r.range(0.4, 0.8), 0, { collide: 'rock' });
    }
  }
  for (const [cx, cz] of [[S, S], [-S, S], [S, -S], [-S, -S]]) {
    const h = r.chance(0.3) ? r.range(5, 8) : r.range(10, 12);
    b.cyl(cx, 0, cz, 3.4, h, PAL.darkStone, { seg: 12 });
    if (h > 9) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(cx + Math.cos(a) * 3, h, cz + Math.sin(a) * 3, 0.9, 0.9, 0.9, PAL.darkStone, { collide: false });
    }
  }
  // Gatehouse
  b.box(-4.2, 0, S, 2.6, 9, 3.2, PAL.darkStone);
  b.box(4.2, 0, S, 2.6, 9, 3.2, PAL.darkStone);
  b.box(0, 6.4, S, 5.8, 2.6, 3.2, PAL.darkStone);
  b.box(0, 5.2, S + 1.2, 5.6, 1.2, 0.2, PAL.iron, { collide: false }); // raised portcullis
  // Great keep
  b.box(0, 0, -S + 9, 15, 13, 12, PAL.darkStone);
  b.crenels(-7.5, -S + 15, 7.5, -S + 15, 13, 8, PAL.darkStone);
  b.box(0, 0, -S + 15.05, 2.6, 4.2, 0.3, 0x141110, { collide: false });
  b.box(0, 0, -S + 16, 6, 0.5, 2.5, PAL.stone); // step
  // Banners
  for (const x of [-6, 6]) b.box(x, 6, -S + 15.1, 1.4, 5, 0.08, PAL.redCloth, { collide: false });
  // Courtyard clutter
  for (let i = 0; i < 6; i++) b.proto('rock', r.range(-18, 18), 0.1, r.range(-10, 14), r.range(0.3, 0.8), 0);
  for (let i = 0; i < 4; i++) b.addProp(r.range(-16, -8), 0.5, r.range(-8, 10), r.pick(['crate', 'barrel']));
  b.addProp(12, 0.6, 10, 'pitch');
  b.addProp(14, 0.6, 8, 'pitch');
  b.addProp(r.range(8, 16), 0.5, r.range(-6, 4), 'crate');
  // Beacon
  beacon(b, 0, 7);
  b.addChest(-S + 4, -S + 4, 0.8, 0.8);
  b.addChest(S - 5, -S + 16, -0.6, 0.5);
  b.addNote(-3, 0.02, S - 4);
  b.bossSpawn = b.world(...rot(b, 0, -3));
  for (const [x, z] of [[-10, 0], [10, 0], [-6, 15], [6, 15], [0, S + 8], [-16, -14]]) b.addSpawn(x, z, r.chance(0.3) ? 'knight' : 'hollow');
}

function rot(b, x, z) {
  const [lx, lz] = b.xf(x, z);
  return [lx, 0, lz];
}

function beacon(b, x, z, y0 = 0) {
  b.cyl(x, y0, z, 1.4, 0.5, PAL.stone, { seg: 8 });
  b.cyl(x, y0 + 0.5, z, 0.7, 1.6, PAL.darkStone, { seg: 8 });
  b.cyl(x, y0 + 2.1, z, 1.1, 0.5, PAL.iron, { seg: 8, collide: false });
  const fire = b.addFire(x, y0 + 2.6, z, 'beacon', 2.2, false);
  const it = b.addInteract(x, y0 + 1.2, z, 'beacon', 'Light the beacon', { r: 3.4, fire });
  b.beacon = it;
}

function cathedral(b) {
  const r = b.rng;
  const W = 8, L = 20;
  for (const sx of [-1, 1]) {
    for (let z = -L; z <= L; z += 4) {
      b.box(sx * W, 0, z, 1.5, r.chance(0.2) ? r.range(4, 7) : 10.5, 1.5, PAL.darkStone);
      if (z < L) {
        const h = r.chance(0.25) ? r.range(1.5, 3) : r.range(4.5, 7);
        b.box(sx * W, 0, z + 2, 0.9, h, 2.6, r.pick(STONE));
      }
    }
  }
  // Facade
  for (const sx of [-1, 1]) b.box(sx * (W / 2 + 1.5), 0, L, W - 3, 12, 1.3, PAL.darkStone);
  b.box(0, 8.5, L, 4.2, 3.5, 1.3, PAL.darkStone);
  b.box(0, 12, L, W * 1.6, 2, 1.3, PAL.darkStone, { collide: false });
  b.box(0, 14, L, W, 2, 1.3, PAL.darkStone, { collide: false });
  b.box(0, 16, L, 3, 2.4, 1.3, PAL.darkStone, { collide: false });
  b.box(0, 18.4, L, 0.4, 2.2, 0.4, PAL.iron, { collide: false });
  b.box(0, 19.4, L, 1.4, 0.35, 0.35, PAL.iron, { collide: false });
  // Bell tower
  b.box(-W - 3.5, 0, L - 3, 5, 22, 5, PAL.darkStone);
  b.cone(-W - 3.5, 22, L - 3, 3.8, 9, PAL.roof, { seg: 4, ry: Math.PI / 4 });
  // Apse
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    b.box(Math.cos(a) * W, 0, -L - Math.sin(a) * W * 0.8, 1.4, r.range(6, 10), 1.4, PAL.darkStone);
  }
  // Nave pillars
  for (const sx of [-1, 1]) {
    for (let z = -L + 4; z < L - 2; z += 6) {
      const roll = r.next();
      if (roll < 0.15) b.cyl(sx * 4 + r.range(-1, 1), 0.55, z + 1, 0.55, 7, PAL.stone, { rz: Math.PI / 2, ry: r.range(-0.6, 0.6), centered: true });
      else b.cyl(sx * 4, 0, z, 0.6, roll < 0.35 ? r.range(2, 5) : 9.5, PAL.stone, { seg: 8 });
    }
  }
  // Pews
  for (let z = -12; z <= 13; z += 2.6) {
    for (const sx of [-1, 1]) {
      if (r.chance(0.2)) continue;
      b.box(sx * 2.1 + r.range(-0.2, 0.2), 0, z, 2.8, 0.85, 0.7, PAL.darkWood, { ry: r.chance(0.2) ? r.range(-0.5, 0.5) : 0 });
    }
  }
  for (let z = -L + 3; z < L; z += 7) if (r.chance(0.6)) b.box(0, 10.2, z, W * 2 + 1.5, 0.5, 0.5, PAL.darkWood, { collide: false });
  // Altar + beacon
  b.box(-6, 0, -L - 5, 12, 0.6, 8, PAL.stone);
  b.box(0, 0.6, -L + 2, 4, 1.1, 1.8, PAL.stone);
  beacon(b, 0, -L - 2);
  b.addNote(0.8, 1.72, -L + 2);
  b.addChest(-W + 2.5, -L + 3, 0.2, 0.7);
  b.addChest(W - 2.5, L - 3, 3.1, 0.4);
  b.bossSpawn = b.world(...rot(b, 0, -6));
  for (const [x, z] of [[-2, 8], [2, 2], [-5, -6], [5, 12], [0, L + 6], [-6, L + 4]]) b.addSpawn(x, z, r.chance(0.25) ? 'knight' : 'hollow');
  for (let i = 0; i < 3; i++) b.addProp(r.range(-6, 6), 0.5, r.range(-14, 10), 'barrel');
}

function necropolis(b) {
  const r = b.rng;
  const S = 27;
  for (let side = 0; side < 4; side++) {
    for (let k = -S + 3; k < S; k += 6) {
      const alongX = side % 2 === 0;
      const x = alongX ? k : side === 1 ? S : -S;
      const z = alongX ? (side === 0 ? S : -S) : k;
      if (side === 0 && Math.abs(k) < 4) continue;
      if (r.chance(0.1)) continue;
      wallSegment(b, x, z, 6.02, r.range(1.4, 2), 0.8, alongX, r.pick(STONE));
    }
  }
  for (const sx of [-4, 4]) { b.box(sx, 0, S, 1.2, 3.4, 1.2, PAL.darkStone); b.cone(sx, 3.4, S, 0.7, 1, PAL.darkStone, { seg: 4 }); }
  const mauso = [[-15, -15], [15, -15], [-15, 12], [15, 12]];
  for (const [mx, mz] of mauso) {
    b.push(mx, mz, mx < 0 ? Math.PI / 2 : -Math.PI / 2);
    b.box(0, 0, 0, 5, 3.6, 6.4, PAL.darkStone);
    b.box(0, 3.6, -1.6, 5.8, 0.3, 3.8, PAL.roof, { rx: -0.55, collide: false });
    b.box(0, 3.6, 1.6, 5.8, 0.3, 3.8, PAL.roof, { rx: 0.55, collide: false });
    b.box(0, 0, 3.25, 1.5, 2.4, 0.1, 0x121010, { collide: false });
    for (const cx of [-1.8, 1.8]) b.cyl(cx, 0, 3.8, 0.28, 3.6, PAL.stone, { seg: 6 });
    b.pop();
  }
  for (const [ox, oz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
    b.box(ox, 0, oz, 1.1, 6, 1.1, PAL.darkStone);
    b.cone(ox, 6, oz, 0.8, 1.6, PAL.darkStone, { seg: 4, ry: Math.PI / 4 });
  }
  for (let gx = -22; gx <= 22; gx += 3.2) {
    for (let gz = -22; gz <= 22; gz += 3.2) {
      if (Math.abs(gx) < 10 && Math.abs(gz) < 10) continue;
      if (mauso.some(([mx, mz]) => Math.abs(gx - mx) < 5 && Math.abs(gz - mz) < 5)) continue;
      if (Math.abs(gx) < 4 && gz > 18) continue;
      if (r.chance(0.3)) continue;
      const h = r.range(0.7, 1.3);
      if (r.chance(0.2)) {
        b.box(gx, 0, gz, 0.18, h + 0.4, 0.18, PAL.stone, { collide: false });
        b.box(gx, h * 0.7, gz, 0.8, 0.18, 0.18, PAL.stone, { collide: false });
      } else {
        b.box(gx, -0.1, gz, 0.7, h, 0.2, r.pick(STONE), { rx: r.range(-0.2, 0.2), rz: r.range(-0.2, 0.2), collide: false });
      }
      if (r.chance(0.35)) b.box(gx, -0.05, gz + 0.9, 0.8, 0.15, 1.6, 0x3a3428, { collide: false });
    }
  }
  b.box(0, 0, 0, 12, 1, 12, PAL.darkStone);
  b.box(0, 1, 0, 9, 1, 9, PAL.stone);
  b.box(0, 2, 0, 6, 1, 6, PAL.darkStone);
  beacon(b, 0, 0, 3);
  for (let i = 0; i < 4; i++) b.proto('dead', r.range(-24, 24), 0, r.range(-24, 24), r.range(0.9, 1.2), r.range(0, 6), { collide: 'tree' });
  b.addChest(-15, -11, 0, 0.7);
  b.addChest(15, 8, Math.PI, 0.5);
  b.addNote(-3.5, 0.02, 7);
  b.bossSpawn = b.world(...rot(b, 0, 11));
  for (const [x, z] of [[-12, 0], [12, 0], [0, -14], [-18, 18], [18, -20], [0, 18]]) b.addSpawn(x, z, 'skeleton');
}

function house(b, x, z, ry, w, d, collapsed) {
  const r = b.rng;
  b.push(x, z, ry);
  const wallC = r.chance(0.5) ? PAL.darkWood : PAL.darkStone;
  if (collapsed) {
    const h = r.range(1.2, 2.2);
    b.box(0, 0, -d / 2, w, h, 0.4, wallC);
    b.box(-w / 2, 0, 0, 0.4, h * 0.8, d, wallC);
    b.box(w / 2, 0, d / 4, 0.4, h * 0.6, d / 2, wallC);
    for (let i = 0; i < 3; i++) b.box(r.range(-w / 3, w / 3), 0.1, r.range(-d / 3, d / 3), r.range(1.5, 3), 0.2, 0.25, PAL.darkWood, { ry: r.range(0, 3), rz: r.range(-0.3, 0.3), collide: false });
  } else {
    b.box(0, 0, 0, w, 3, d, wallC);
    b.box(0, 2.95, -d * 0.26, w + 0.7, 0.25, d * 0.62, PAL.roof, { rx: -0.62, collide: false });
    b.box(0, 2.95, d * 0.26, w + 0.7, 0.25, d * 0.62, PAL.roof, { rx: 0.62, collide: false });
    b.box(0, 3, 0, w, 1.2, 0.3, wallC, { collide: false });
    b.box(0, 0, d / 2 + 0.02, 1.2, 2.1, 0.08, 0x120f0d, { collide: false });
    b.box(w / 4 + 0.4, 1.3, d / 2 + 0.02, 0.7, 0.6, 0.06, 0x0c0b0a, { collide: false });
    if (r.chance(0.5)) b.box(w / 3, 3, -d / 4, 0.7, 2.4, 0.7, PAL.stone, { collide: false });
  }
  b.pop();
}

function hamlet(b) {
  const r = b.rng;
  const n = r.int(6, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const rad = r.range(19, 28);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const face = Math.atan2(-x, -z);
    house(b, x, z, face, r.range(5, 7), r.range(4.5, 6), r.chance(0.35));
    if (r.chance(0.5)) {
      // fence
      b.push(x, z, face);
      for (let k = -3; k <= 3; k += 1.5) b.box(k, 0, 4.2, 0.12, 1, 0.12, PAL.darkWood, { collide: false });
      b.box(0, 0.6, 4.2, 6, 0.1, 0.08, PAL.darkWood, { collide: false });
      b.pop();
    }
    if (r.chance(0.6)) b.addProp(x * 0.8 + r.range(-2, 2), 0.5, z * 0.8 + r.range(-2, 2), r.pick(['crate', 'barrel', 'barrel']));
  }
  // Well
  b.cyl(7, 0, 5, 1.2, 1, PAL.stone, { seg: 12 });
  b.box(6, 0, 5, 0.2, 2.6, 0.2, PAL.darkWood, { collide: false });
  b.box(8, 0, 5, 0.2, 2.6, 0.2, PAL.darkWood, { collide: false });
  b.box(7, 2.6, 5, 2.6, 0.15, 1.6, PAL.roof, { collide: false });
  // Chapel
  b.push(-8, -12, 0.4);
  b.box(0, 0, 0, 6, 5, 9, PAL.darkStone);
  b.box(0, 4.95, -2.3, 6.8, 0.3, 5.6, PAL.roof, { rx: -0.7, collide: false });
  b.box(0, 4.95, 2.3, 6.8, 0.3, 5.6, PAL.roof, { rx: 0.7, collide: false });
  b.box(0, 5, 4.2, 1.4, 4, 1.4, PAL.darkStone, { collide: false });
  b.cone(0, 9, 4.2, 1.1, 2.4, PAL.roof, { seg: 4, ry: Math.PI / 4 });
  b.pop();
  b.addNote(-8.5, 0.02, -6.8);
  // Pyre beacon in the square
  for (let i = 0; i < 6; i++) b.box(r.range(-1.5, 1.5), 0, r.range(-1.5, 1.5), 2.6, 0.3, 0.3, PAL.darkWood, { ry: r.range(0, 3), collide: false });
  beacon(b, 0, 0);
  b.addProp(-4, 0.6, 7, 'pitch');
  b.addChest(r.range(10, 14), -r.range(8, 12), 0.5, 0.6);
  b.addChest(-r.range(12, 16), r.range(6, 10), 2.4, 0.5);
  b.bossSpawn = b.world(...rot(b, 0, -6));
  for (let i = 0; i < 6; i++) {
    const a = r.range(0, Math.PI * 2);
    b.addSpawn(Math.cos(a) * r.range(8, 22), Math.sin(a) * r.range(8, 22), r.chance(0.3) ? 'wolf' : 'hollow');
  }
}

function shrine(b) {
  const r = b.rng;
  b.cyl(0, -0.2, 0, 3.4, 0.55, PAL.stone, { seg: 12 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.box(Math.cos(a) * 2.9, 0.3, Math.sin(a) * 2.9, 0.5, r.chance(0.3) ? r.range(0.5, 1) : 1.6, 0.5, PAL.darkStone, { collide: false });
  }
  // Kneeling figure
  b.box(0, 0.35, -1.7, 0.8, 0.7, 0.9, PAL.darkStone, { collide: true });
  b.box(0, 1.05, -1.8, 0.6, 0.8, 0.5, PAL.darkStone, { collide: false, rx: 0.25 });
  b.cone(0, 1.75, -1.7, 0.33, 0.6, PAL.darkStone, { seg: 6 });
  b.cyl(0, 0.35, 0.7, 0.45, 0.8, PAL.iron, { seg: 8 });
  const fire = b.addFire(0, 1.3, 0.7, 'shrine', 0.9, true);
  b.addInteract(0, 0.8, 0.7, 'rest', 'Rest at shrine', { fire, r: 3 });
}

function watchtower(b) {
  const r = b.rng;
  const hgt = 8.6;
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    b.box(x, 0, z, 0.35, hgt + 2.4, 0.35, PAL.darkWood);
  }
  b.box(0, hgt, 0, 4.2, 0.3, 4.2, PAL.wood);
  for (const [x, z, w, d] of [[0, 2.05, 4.2, 0.12], [0, -2.05, 4.2, 0.12], [2.05, 0, 0.12, 4.2], [-2.05, 0, 0.12, 4.2]]) b.box(x, hgt + 0.9, z, w, 0.12, d, PAL.darkWood);
  b.cone(0, hgt + 2.4, 0, 3.2, 2, PAL.roof, { seg: 4, ry: Math.PI / 4 });
  for (let y = 0.4; y < hgt; y += 0.6) b.box(0, y, 2.25, 0.9, 0.08, 0.08, PAL.wood, { collide: false });
  b.box(-0.45, 0, 2.25, 0.08, hgt, 0.08, PAL.wood, { collide: false });
  b.box(0.45, 0, 2.25, 0.08, hgt, 0.08, PAL.wood, { collide: false });
  const top = b.world(...rot(b, 0, 0));
  b.addInteract(0, 0.8, 2.6, 'climb', 'Climb the tower', { top: { x: top.x, y: b.loc.y + hgt + 0.5, z: top.z } });
  if (r.chance(0.6)) b.addChest(2.8, -1.5, 0.3, 0.3);
  for (let i = 0; i < r.int(0, 2); i++) b.addSpawn(r.range(-6, 6), r.range(-6, 6), 'hollow');
}

function stones(b) {
  const r = b.rng;
  const n = r.int(7, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (r.chance(0.15)) {
      b.box(Math.cos(a) * 7, 0, Math.sin(a) * 7, 1.2, 0.8, 3.6, PAL.darkStone, { ry: a, rz: 0.1 });
    } else {
      b.box(Math.cos(a) * 7, -0.3, Math.sin(a) * 7, r.range(1, 1.5), r.range(3, 5), 0.8, r.pick(STONE), { ry: -a + Math.PI / 2, rx: r.range(-0.12, 0.12), rz: r.range(-0.12, 0.12) });
    }
  }
  b.box(0, 0, 0, 2.2, 0.8, 1.4, PAL.darkStone);
  b.addNote(0, 0.82, 0);
  if (r.chance(0.5)) b.addSpawn(r.range(-4, 4), r.range(-4, 4), 'wraith', { nightOnly: true });
}

function campfire(b, x, z) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.proto('rock', x + Math.cos(a) * 0.8, 0.05, z + Math.sin(a) * 0.8, 0.22, a);
  }
  b.box(x, 0.05, z, 1.2, 0.18, 0.18, PAL.darkWood, { ry: 0.5, collide: false });
  b.box(x, 0.05, z, 1.2, 0.18, 0.18, PAL.darkWood, { ry: -0.7, collide: false });
  const fire = b.addFire(x, 0.35, z, 'camp', 0.8, true);
  b.addInteract(x, 0.4, z, 'craft', 'Sit by the fire', { fire, r: 2.6 });
}

function camp(b) {
  const r = b.rng;
  const n = r.int(2, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(0, 1);
    b.cone(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5, 1.8, 2.3, r.chance(0.3) ? PAL.redCloth : PAL.cloth, { seg: 4, ry: a + Math.PI / 4, collide: true });
    b.box(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, 0.8, 0.12, 1.9, 0x3b3226, { ry: -a, collide: false });
  }
  campfire(b, 0, 0);
  for (let i = 0; i < 3; i++) b.addProp(r.range(-6, 6), 0.5, r.range(-6, 6), r.pick(['crate', 'barrel']));
  if (r.chance(0.5)) b.addProp(r.range(-6, 6), 0.6, r.range(-6, 6), 'pitch');
  b.addInteract(r.range(-3, 3), 0.3, -5.5, 'loot', 'Search the packs', { quality: 0.3 });
  b.box(0, 0, -5.5, 0.8, 0.5, 0.6, PAL.cloth, { collide: false });
  if (r.chance(0.5)) b.addNote(2, 0.02, 2.5);
  for (let i = 0; i < r.int(1, 3); i++) b.addSpawn(r.range(-6, 6), r.range(-6, 6), 'hollow');
}

function gallows(b) {
  const r = b.rng;
  b.box(0, 0, 0, 5, 1.1, 3.2, PAL.darkWood);
  b.box(-2, 1.1, 0, 0.3, 4, 0.3, PAL.darkWood);
  b.box(2, 1.1, 0, 0.3, 4, 0.3, PAL.darkWood);
  b.box(0, 5, 0, 4.6, 0.3, 0.3, PAL.darkWood);
  for (const x of [-1, 0, 1]) b.box(x, 3.4, 0, 0.05, 1.6, 0.05, 0x7a6a50, { collide: false });
  // Cage
  b.push(4.5, 2, 0);
  b.box(0, 0, 0, 0.2, 5, 0.2, PAL.darkWood);
  b.box(-0.8, 4.8, 0, 1.8, 0.2, 0.2, PAL.darkWood, { collide: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(-1.5 + Math.cos(a) * 0.5, 2.4, Math.sin(a) * 0.5, 0.05, 1.6, 0.05, PAL.iron, { collide: false });
  }
  b.box(-1.5, 2.4, 0, 1.1, 0.06, 1.1, PAL.iron, { collide: false });
  b.pop();
  b.addNote(-1.5, 1.12, 0.8);
  b.addInteract(4, 0.3, 2, 'loot', 'Search the remains', { quality: 0.35 });
  b.proto('bones', 4, 0.02, 2, 1, 0);
  for (let i = 0; i < r.int(0, 2); i++) b.addSpawn(r.range(-6, 6), r.range(-6, 6), 'hollow');
}

function wreck(b) {
  const r = b.rng;
  b.box(0, 0.3, 0, 2, 0.9, 3.6, PAL.wood, { rz: 0.35 });
  b.cyl(1.1, 0.6, 1.1, 0.62, 0.16, PAL.darkWood, { rz: Math.PI / 2, centered: true });
  b.cyl(1.1, 0.6, -1.2, 0.62, 0.16, PAL.darkWood, { rz: Math.PI / 2, centered: true });
  b.cyl(-2.4, 0.08, 1.6, 0.62, 0.16, PAL.darkWood, { collide: false, centered: true });
  b.box(0, 0.05, 3.2, 0.12, 0.12, 2.6, PAL.darkWood, { ry: 0.3, collide: false });
  // Dead horse
  b.box(-3, 0, -2.5, 2.2, 0.8, 0.9, 0x3a2b22, { ry: 0.4 });
  b.box(-4.3, 0.1, -3, 0.9, 0.45, 0.4, 0x3a2b22, { ry: 0.7, collide: false });
  for (let i = 0; i < r.int(3, 5); i++) b.addProp(r.range(-4, 4), 0.5, r.range(-4, 4), r.pick(['crate', 'barrel', 'crate']));
  b.addChest(2.5, -2.5, 0.9, 0.45);
  if (r.chance(0.4)) b.addSpawn(r.range(-8, 8), r.range(-8, 8), 'wolf');
  if (r.chance(0.4)) b.addSpawn(r.range(-8, 8), r.range(-8, 8), 'wolf');
}

function cairn(b) {
  const r = b.rng;
  let y = 0;
  for (let i = 0; i < 7; i++) {
    const s = 1.1 - i * 0.12;
    b.proto('rock', r.range(-0.3, 0.3), y, r.range(-0.3, 0.3), s, r.range(0, 6), { collide: i === 0 ? 'rock' : undefined });
    y += s * 0.6;
  }
  b.cyl(1.6, 0, 0.5, 0.35, 0.25, PAL.iron, { seg: 8, collide: false });
  b.addInteract(1.6, 0.3, 0.5, 'loot', 'Take the offering', { quality: 0.5 });
  if (r.chance(0.5)) b.addNote(-1.4, 0.02, 1);
}

function crypt(b) {
  const r = b.rng;
  b.box(0, 0, 0, 5.2, 3.6, 5.2, PAL.darkStone);
  b.box(0, 3.6, -1.4, 5.8, 0.3, 3.4, PAL.darkStone, { rx: -0.55, collide: false });
  b.box(0, 3.6, 1.4, 5.8, 0.3, 3.4, PAL.darkStone, { rx: 0.55, collide: false });
  b.box(0, 0, 2.62, 1.8, 2.5, 0.1, 0x0b0a09, { collide: false });
  for (const x of [-1.3, 1.3]) b.cyl(x, 0, 3.1, 0.3, 3, PAL.stone, { seg: 6 });
  b.box(0, 0, 3.8, 3.2, 0.25, 1.2, PAL.stone);
  for (const x of [-3.5, 3.5]) b.cyl(x, 0, 4, 0.35, 0.9, 0x5b4a3a, { seg: 8 });
  b.addChest(0, 5.5, Math.PI, 0.55);
  for (let i = 0; i < 6; i++) b.proto('grave', r.range(-7, 7), 0, r.range(-8, -3), 1, r.range(-0.3, 0.3));
  for (let i = 0; i < r.int(2, 3); i++) b.addSpawn(r.range(-6, 6), r.range(4, 9), 'skeleton');
}

const DESIGNS = { keep, cathedral, necropolis, hamlet, shrine, watchtower, stones, camp, gallows, wreck, cairn, crypt };

export function buildLocation(loc, protos) {
  const b = new Builder(loc, protos);
  DESIGNS[loc.type](b);
  return b;
}
