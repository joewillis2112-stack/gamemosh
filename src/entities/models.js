// Low-poly procedural characters with procedural animation (no external model files).
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE4 = new THREE.ConeGeometry(0.5, 1, 4);
const CONE6 = new THREE.ConeGeometry(0.5, 1, 6);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const SPH = new THREE.IcosahedronGeometry(0.5, 0);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
const paleEyeMat = new THREE.MeshBasicMaterial({ color: 0xbfd6ff });

function part(geo, mats, color, sx, sy, sz, x = 0, y = 0, z = 0, parent) {
  if (!mats[color]) mats[color] = new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(geo, mats[color]);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

export function makeWeapon(model) {
  const g = new THREE.Group();
  const mats = {};
  const steel = 0x8a8d92, dark = 0x2a2420, leather = 0x3a2a1e;
  switch (model) {
    case 'axe':
      part(BOX, mats, dark, 0.06, 1.0, 0.06, 0, -0.4, 0, g);
      part(BOX, mats, steel, 0.04, 0.28, 0.3, 0, -0.8, 0.12, g);
      break;
    case 'spear':
      part(BOX, mats, dark, 0.05, 2.2, 0.05, 0, -0.7, 0, g);
      part(CONE4, mats, steel, 0.09, 0.35, 0.09, 0, -1.95, 0, g).rotation.x = Math.PI;
      break;
    case 'mace':
      part(BOX, mats, dark, 0.06, 0.8, 0.06, 0, -0.3, 0, g);
      part(SPH, mats, 0x55575c, 0.26, 0.26, 0.26, 0, -0.75, 0, g);
      break;
    case 'greatsword':
      part(BOX, mats, leather, 0.06, 0.34, 0.06, 0, 0, 0, g);
      part(BOX, mats, dark, 0.34, 0.06, 0.08, 0, -0.18, 0, g);
      part(BOX, mats, steel, 0.05, 1.45, 0.16, 0, -0.93, 0, g);
      break;
    case 'claw':
      break;
    default: // sword
      part(BOX, mats, leather, 0.05, 0.22, 0.05, 0, 0, 0, g);
      part(BOX, mats, dark, 0.26, 0.05, 0.06, 0, -0.12, 0, g);
      part(BOX, mats, steel, 0.04, 0.85, 0.12, 0, -0.56, 0, g);
  }
  g.rotation.x = -Math.PI / 2;
  return g;
}

export class HumanoidRig {
  constructor(o = {}) {
    const s = o.scale || 1;
    this.scale = s;
    this.mats = {};
    const M = this.mats;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // tilts for rolls/deaths
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.body.add(this.hips);
    this.body.scale.setScalar(s);
    const c = { skin: 0x8a8578, torso: 0x3b342c, legs: 0x2b2622, cloak: 0x2d2a2e, hood: 0x252326, ...o.colors };
    this.torso = part(BOX, M, c.torso, 0.5 * (o.bulk || 1), 0.62, 0.3 * (o.bulk || 1), 0, 0.33, 0, this.hips);
    if (o.slouch) this.torso.rotation.x = 0.25;
    this.head = new THREE.Group();
    this.head.position.set(0, 0.8, o.slouch ? 0.08 : 0);
    this.hips.add(this.head);
    part(BOX, M, o.helm ? c.torso : c.skin, 0.28, 0.3, 0.28, 0, 0.1, 0, this.head);
    if (o.hood) {
      part(CONE4, M, c.hood, 0.52, 0.36, 0.52, 0, 0.3, -0.03, this.head).rotation.y = Math.PI / 4;
      part(BOX, M, c.hood, 0.34, 0.3, 0.34, 0, 0.12, -0.03, this.head);
      part(BOX, M, 0x0a0908, 0.2, 0.14, 0.02, 0, 0.08, 0.15, this.head);
    }
    if (o.helm) part(BOX, M, 0x1a1a1c, 0.2, 0.04, 0.02, 0, 0.12, 0.145, this.head);
    if (o.eyes) {
      for (const x of [-0.06, 0.06]) {
        const e = new THREE.Mesh(BOX, o.eyes === 'pale' ? paleEyeMat : eyeMat);
        e.scale.set(0.045, 0.03, 0.02);
        e.position.set(x, 0.13, 0.145);
        this.head.add(e);
      }
    }
    if (o.skull) {
      part(BOX, M, 0xc4bca6, 0.26, 0.3, 0.26, 0, 0.1, 0, this.head);
      for (const x of [-0.06, 0.06]) part(BOX, M, 0x0a0908, 0.06, 0.05, 0.02, x, 0.13, 0.13, this.head);
    }
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    const aw = o.bulk ? 0.17 : 0.13;
    for (const [arm, x] of [[this.armL, -0.33 * (o.bulk || 1)], [this.armR, 0.33 * (o.bulk || 1)]]) {
      arm.position.set(x, 0.6, 0);
      part(BOX, M, c.torso, aw, 0.62, aw, 0, -0.3, 0, arm);
      part(BOX, M, o.skull ? 0xc4bca6 : c.skin, aw * 0.8, 0.12, aw * 0.8, 0, -0.64, 0, arm);
      this.hips.add(arm);
    }
    this.hand = new THREE.Group();
    this.hand.position.y = -0.64;
    this.armR.add(this.hand);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    for (const [leg, x] of [[this.legL, -0.13], [this.legR, 0.13]]) {
      leg.position.set(x * (o.bulk || 1), 0, 0);
      part(BOX, M, c.legs, 0.17, 0.9, 0.18, 0, -0.45, 0, leg);
      part(BOX, M, 0x1c1714, 0.19, 0.12, 0.26, 0, -0.9, 0.04, leg);
      this.hips.add(leg);
    }
    if (o.cloak) {
      this.cape = part(BOX, M, c.cloak, 0.52, 1.1, 0.05, 0, -0.1, -0.2, this.hips);
      this.cape.geometry = BOX;
      part(BOX, M, c.cloak, 0.6, 0.18, 0.36, 0, 0.62, 0, this.hips);
    }
    if (o.shield) part(BOX, M, 0x3a2e24, 0.08, 0.6, 0.5, -0.1, -0.4, 0.05, this.armL);
    this.weapon = null;
    if (o.weapon) this.setWeapon(o.weapon);
    this.phase = 0;
    this.torch = null;
  }

  setWeapon(model) {
    if (this.weapon) this.hand.remove(this.weapon);
    this.weapon = model ? makeWeapon(model) : null;
    if (this.weapon) this.hand.add(this.weapon);
  }

  setTorch(on) {
    if (on && !this.torch) {
      const g = new THREE.Group();
      part(CYL, this.mats, 0x3a2a1e, 0.06, 0.6, 0.06, 0, -0.2, 0, g);
      g.position.set(0, -0.64, 0.05);
      g.rotation.x = -0.8;
      this.armL.add(g);
      this.torch = g;
    } else if (!on && this.torch) {
      this.armL.remove(this.torch);
      this.torch = null;
    }
  }

  flash(amount) {
    for (const m of Object.values(this.mats)) m.emissive.setRGB(amount * 0.8, amount * 0.25, amount * 0.1);
  }

  // a: { speed, grounded, action, t (0..1 action progress), combo }
  animate(dt, a) {
    const run = Math.min(a.speed / 4, 1.6);
    this.phase += dt * (2 + a.speed * 1.6);
    const sw = Math.sin(this.phase);
    let legL = sw * 0.75 * run, legR = -sw * 0.75 * run;
    let armL = -sw * 0.5 * run, armR = sw * 0.5 * run;
    let armRz = 0, twist = 0, bodyPitch = 0, bodyY = 0, hipsY = 0.95;
    const bob = Math.abs(Math.cos(this.phase)) * 0.05 * run;
    if (!a.grounded) { legL = -0.5; legR = 0.3; armL = -0.8; armR = -0.8; }
    const t = a.t || 0;
    switch (a.action) {
      case 'attack': {
        const style = a.combo % 3;
        if (style === 2 || a.heavy) {
          // Overhead chop
          const k = t < 0.35 ? t / 0.35 : 1;
          const strike = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.25);
          armR = -0.6 - k * 2.3 + strike * 2.5;
          bodyPitch = strike * 0.25;
        } else {
          const dir = style === 0 ? 1 : -1;
          const k = t < 0.3 ? t / 0.3 : 1;
          const strike = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.25);
          armR = -1.35;
          twist = dir * (k * 1.1 - strike * 2.2);
          armRz = dir * 0.3;
        }
        armL = -0.3;
        break;
      }
      case 'windup':
        armR = -2.6 * Math.min(1, t * 2);
        armL = -0.5;
        twist = 0.3 * t;
        break;
      case 'strike':
        armR = -2.6 + Math.min(1, t * 3) * 2.8;
        bodyPitch = 0.2;
        break;
      case 'roll':
        bodyPitch = t * Math.PI * 2;
        hipsY = 0.55;
        legL = -1.4; legR = -1.4; armL = -1.2; armR = -1.2;
        break;
      case 'hit':
        bodyPitch = -0.35 * (1 - t);
        armL = armR = 0.4;
        break;
      case 'cast':
        armL = armR = -2.4 + Math.sin(t * 20) * 0.1;
        break;
      case 'flask':
        armL = -2.2;
        this.head.rotation.x = -0.4;
        break;
      case 'dead': {
        const k = Math.min(1, t * 1.6);
        bodyPitch = -1.45 * k * k;
        legL = 0.2; legR = -0.15; armL = -2.6 * k; armR = -2.2 * k;
        hipsY = 0.95 - 0.35 * k;
        break;
      }
      default:
        break;
    }
    if (a.action !== 'flask') this.head.rotation.x *= 0.8;
    this.legL.rotation.x = legL;
    this.legR.rotation.x = legR;
    this.armL.rotation.x = armL;
    this.armR.rotation.x = armR;
    this.armR.rotation.z = armRz;
    this.hips.rotation.y = twist;
    this.hips.position.y = hipsY + bob;
    this.body.rotation.x = bodyPitch;
    this.body.position.y = bodyY + (a.action === 'roll' ? 0.1 : 0);
    if (this.cape) this.cape.rotation.x = 0.15 + Math.min(a.speed, 7) * 0.06 + Math.sin(this.phase * 0.5) * 0.04;
  }
}

export class WolfRig {
  constructor(o = {}) {
    const s = o.scale || 1;
    this.mats = {};
    const M = this.mats;
    const c = o.color || 0x3a3632;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(s);
    this.root.add(this.body);
    this.torso = part(BOX, M, c, 0.45, 0.45, 1.2, 0, 0.75, 0, this.body);
    part(BOX, M, c, 0.5, 0.5, 0.4, 0, 0.82, 0.4, this.body); // shoulders
    this.head = new THREE.Group();
    this.head.position.set(0, 0.95, 0.72);
    this.body.add(this.head);
    part(BOX, M, c, 0.34, 0.32, 0.36, 0, 0, 0, this.head);
    part(BOX, M, 0x2a2724, 0.2, 0.18, 0.3, 0, -0.06, 0.28, this.head);
    for (const x of [-0.1, 0.1]) {
      part(CONE4, M, c, 0.1, 0.18, 0.08, x, 0.22, -0.05, this.head);
      const e = new THREE.Mesh(BOX, eyeMat);
      e.scale.set(0.05, 0.035, 0.02);
      e.position.set(x, 0.05, 0.18);
      this.head.add(e);
    }
    this.legs = [];
    for (const [x, z] of [[-0.16, 0.42], [0.16, 0.42], [-0.16, -0.45], [0.16, -0.45]]) {
      const l = new THREE.Group();
      l.position.set(x, 0.6, z);
      part(BOX, M, c, 0.12, 0.6, 0.12, 0, -0.3, 0, l);
      this.body.add(l);
      this.legs.push(l);
    }
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.85, -0.6);
    part(BOX, M, c, 0.1, 0.1, 0.5, 0, 0, -0.25, this.tail);
    this.body.add(this.tail);
    this.phase = 0;
  }
  flash(amount) {
    for (const m of Object.values(this.mats)) m.emissive.setRGB(amount * 0.8, amount * 0.25, amount * 0.1);
  }
  animate(dt, a) {
    const run = Math.min(a.speed / 5, 1.5);
    this.phase += dt * (3 + a.speed * 2);
    const sw = Math.sin(this.phase);
    this.legs[0].rotation.x = sw * 0.8 * run;
    this.legs[3].rotation.x = sw * 0.8 * run;
    this.legs[1].rotation.x = -sw * 0.8 * run;
    this.legs[2].rotation.x = -sw * 0.8 * run;
    this.tail.rotation.x = -0.4 + Math.sin(this.phase * 0.5) * 0.2;
    let pitch = 0, headX = 0;
    if (a.action === 'windup') { pitch = -0.2 * Math.min(1, a.t * 2); headX = 0.3; }
    else if (a.action === 'strike') { pitch = 0.15; headX = -0.3; }
    else if (a.action === 'hit') pitch = -0.3 * (1 - a.t);
    this.body.rotation.x = pitch;
    this.head.rotation.x = headX;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.04 * run;
  }
}

export class WraithRig {
  constructor(o = {}) {
    const s = o.scale || 1;
    this.mats = {};
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(s);
    this.root.add(this.body);
    const clothMat = new THREE.MeshLambertMaterial({ color: o.color || 0x1a1c24, transparent: true, opacity: 0.85 });
    this.mats.cloth = clothMat;
    const robe = new THREE.Mesh(CONE6, clothMat);
    robe.scale.set(0.9, 1.7, 0.9);
    robe.position.y = 1.2;
    this.body.add(robe);
    this.head = new THREE.Group();
    this.head.position.y = 2.15;
    this.body.add(this.head);
    const hood = new THREE.Mesh(CONE4, clothMat);
    hood.scale.set(0.5, 0.6, 0.5);
    hood.rotation.y = Math.PI / 4;
    this.head.add(hood);
    for (const x of [-0.07, 0.07]) {
      const e = new THREE.Mesh(BOX, o.eyes === 'ember' ? eyeMat : paleEyeMat);
      e.scale.set(0.05, 0.03, 0.02);
      e.position.set(x, -0.05, 0.17);
      this.head.add(e);
    }
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    for (const [arm, x] of [[this.armL, -0.3], [this.armR, 0.3]]) {
      arm.position.set(x, 1.85, 0.05);
      const a = new THREE.Mesh(BOX, clothMat);
      a.scale.set(0.12, 0.8, 0.12);
      a.position.y = -0.4;
      arm.add(a);
      this.body.add(arm);
    }
    this.phase = Math.random() * 10;
  }
  flash(amount) {
    this.mats.cloth.emissive.setRGB(amount * 0.5, amount * 0.5, amount * 0.7);
  }
  animate(dt, a) {
    this.phase += dt;
    this.body.position.y = 0.3 + Math.sin(this.phase * 1.8) * 0.15;
    let arm = -0.3 + Math.sin(this.phase * 2) * 0.1;
    if (a.action === 'windup' || a.action === 'cast') arm = -2.2 * Math.min(1, a.t * 2);
    else if (a.action === 'strike') arm = -2.2 + Math.min(1, a.t * 3) * 2.4;
    this.armL.rotation.x = arm;
    this.armR.rotation.x = arm;
    this.body.rotation.x = a.action === 'hit' ? -0.3 * (1 - a.t) : 0.08;
  }
}
