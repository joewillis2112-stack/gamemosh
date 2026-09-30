// Streams locations in and out: merged meshes when visible, colliders/props/enemies when near.
import * as THREE from 'three';
import { R, GROUPS } from '../physics.js';
import { buildLocation } from './structures.js';
import { PAL } from './meshkit.js';
import { dist2 } from '../core/util.js';

const VISUAL_PAD = 120; // metres beyond chunk view distance to keep silhouettes
const ACTIVE_R = 150;
const DEACTIVE_R = 200;

const fireMatA = new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const fireMatB = new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a3a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
const flameGeo = new THREE.ConeGeometry(0.28, 1, 5);
flameGeo.translate(0, 0.5, 0);

export function makeFireMesh(scale = 1) {
  const g = new THREE.Group();
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(flameGeo, i % 2 ? fireMatB : fireMatA);
    const a = (i / 4) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    m.userData.phase = Math.random() * 10;
    m.userData.base = i % 2 ? 0.7 : 1;
    g.add(m);
    flames.push(m);
  }
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(2.2, 2.2, 1);
  glow.position.y = 0.4;
  g.add(glow);
  g.scale.setScalar(scale);
  g.userData.flames = flames;
  return g;
}

export function animateFire(g, t) {
  for (const m of g.userData.flames) {
    const p = m.userData.phase;
    const s = m.userData.base * (0.8 + 0.25 * Math.sin(t * 9 + p) + 0.1 * Math.sin(t * 23 + p * 3));
    m.scale.set(0.9 + 0.1 * Math.sin(t * 7 + p), s, 0.9 + 0.1 * Math.cos(t * 6 + p));
    m.rotation.y = t * 0.8 + p;
  }
}

const propGeo = {
  crate: new THREE.BoxGeometry(0.9, 0.9, 0.9),
  barrel: new THREE.CylinderGeometry(0.38, 0.38, 1, 10),
  pitch: new THREE.CylinderGeometry(0.4, 0.4, 1.05, 10),
};
const propMat = {
  crate: new THREE.MeshLambertMaterial({ color: 0x5a4130 }),
  barrel: new THREE.MeshLambertMaterial({ color: 0x4a3526 }),
  pitch: new THREE.MeshLambertMaterial({ color: 0x241a17, emissive: 0x2a0800 }),
};
const chestBaseGeo = new THREE.BoxGeometry(1.1, 0.5, 0.7);
const chestLidGeo = new THREE.BoxGeometry(1.1, 0.18, 0.7);
chestLidGeo.translate(0, 0.09, 0.35);
const chestMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1e });
const chestTrimMat = new THREE.MeshLambertMaterial({ color: PAL.gold });

export class LocationManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.physics = game.physics;
    this.gen = game.gen;
    this.protos = game.protos;
    this.rt = new Map(); // loc.id -> runtime
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.props = new Set();
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
      this.scene.add(l);
      this.lights.push(l);
    }
    this.interactables = [];
    this.fires = [];
  }

  update(px, pz, dt, t, viewDist) {
    const vis = viewDist + VISUAL_PAD;
    for (const loc of this.gen.locations) {
      const d = dist2(px, pz, loc.x, loc.z);
      let rt = this.rt.get(loc.id);
      const visR = loc.kind === 'major' ? vis + 150 : vis;
      if (d < visR && !rt) rt = this._makeVisual(loc);
      else if (rt && d > visR + 40) { this._destroy(rt); continue; }
      if (!rt) continue;
      if (d < ACTIVE_R && !rt.active) this._activate(rt);
      else if (d > DEACTIVE_R && rt.active) this._deactivate(rt);
    }
    // Animate fires, assign pooled lights to nearest lit fires
    const lit = [];
    for (const rt of this.rt.values()) {
      for (const f of rt.b.fires) {
        if (!f.mesh) continue;
        f.mesh.visible = f.lit;
        if (!f.lit) continue;
        const d = dist2(px, pz, f.x, f.z);
        if (d < 90) animateFire(f.mesh, t);
        lit.push([d, f]);
      }
    }
    lit.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const e = lit[i];
      if (e && e[0] < 70) {
        const f = e[1];
        l.position.set(f.x, f.y + 1, f.z);
        l.intensity = (f.kind === 'beacon' ? 30 : 10) * (0.9 + 0.1 * Math.sin(t * 13 + i));
        l.distance = f.kind === 'beacon' ? 30 : 15;
      } else l.intensity = 0;
    }
    // Chest lids
    for (const rt of this.rt.values()) {
      for (const c of rt.b.chests) {
        if (!c.lid) continue;
        const target = this.game.state.opened.has(c.id) ? -1.25 : 0;
        c.lid.rotation.x += (target - c.lid.rotation.x) * Math.min(1, dt * 6);
      }
    }
  }

  nearestFireDist(x, z, kinds) {
    let best = Infinity;
    for (const rt of this.rt.values()) {
      for (const f of rt.b.fires) {
        if (!f.lit) continue;
        if (kinds && !kinds.includes(f.kind)) continue;
        const d = dist2(x, z, f.x, f.z);
        if (d < best) best = d;
      }
    }
    return best;
  }

  _makeVisual(loc) {
    const b = buildLocation(loc, this.protos);
    const mesh = new THREE.Mesh(b.kit.build(), this.mat);
    mesh.position.set(loc.x, loc.y, loc.z);
    mesh.rotation.y = loc.rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const group = new THREE.Group();
    this.scene.add(group);
    const state = this.game.state;
    for (const f of b.fires) {
      f.mesh = makeFireMesh(f.scale);
      f.mesh.position.set(f.x, f.y, f.z);
      group.add(f.mesh);
      if (f.kind === 'beacon') f.lit = state.beacons.has(loc.id);
    }
    for (const c of b.chests) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(chestBaseGeo, chestMat);
      base.position.y = 0.25;
      const lid = new THREE.Mesh(chestLidGeo, chestMat);
      lid.position.set(0, 0.5, -0.35);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.72), chestTrimMat);
      trim.position.y = 0.42;
      g.add(base, lid, trim);
      g.position.set(c.chestPos.x, c.chestPos.y, c.chestPos.z);
      g.rotation.y = c.ry;
      c.lid = lid;
      if (state.opened.has(c.id)) lid.rotation.x = -1.25;
      group.add(g);
    }
    const rt = { loc, b, mesh, group, active: false, colliders: [], props: [] };
    this.rt.set(loc.id, rt);
    return rt;
  }

  _activate(rt) {
    rt.active = true;
    for (const mk of rt.b.colliders) rt.colliders.push(this.physics.fixed(mk(), { kind: 'structure' }));
    for (const p of rt.b.props) rt.props.push(this.spawnProp(p.kind, p.x, p.y + 0.1, p.z, p.ry));
    for (const it of rt.b.interact) this.interactables.push(it);
    this.game.enemies.spawnForLocation(rt);
  }

  _deactivate(rt) {
    rt.active = false;
    for (const c of rt.colliders) this.physics.removeCollider(c);
    rt.colliders = [];
    for (const p of rt.props) this.removeProp(p);
    rt.props = [];
    this.interactables = this.interactables.filter((i) => i.loc !== rt.loc);
    this.game.enemies.despawnForLocation(rt.loc.id);
  }

  _destroy(rt) {
    if (rt.active) this._deactivate(rt);
    this.scene.remove(rt.mesh);
    rt.mesh.geometry.dispose();
    this.scene.remove(rt.group);
    this.rt.delete(rt.loc.id);
  }

  clear() {
    for (const rt of [...this.rt.values()]) this._destroy(rt);
    for (const p of [...this.props]) this.removeProp(p);
  }

  spawnProp(kind, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(propGeo[kind], propMat[kind]);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.2).setAngularDamping(0.4),
    );
    const cd = kind === 'crate' ? R.ColliderDesc.cuboid(0.45, 0.45, 0.45) : R.ColliderDesc.cylinder(0.5, kind === 'pitch' ? 0.4 : 0.38);
    cd.setDensity(kind === 'crate' ? 0.35 : 0.5).setFriction(0.7).setCollisionGroups(GROUPS.prop);
    const col = this.physics.world.createCollider(cd, body);
    const prop = { kind, body, mesh, hp: kind === 'pitch' ? 10 : kind === 'crate' ? 22 : 30 };
    this.physics.info.set(col.handle, { kind: 'prop', prop });
    this.physics.dynamic.add(prop);
    this.props.add(prop);
    return prop;
  }

  removeProp(p) {
    if (!this.props.has(p)) return;
    this.props.delete(p);
    this.physics.dynamic.delete(p);
    this.scene.remove(p.mesh);
    this.physics.removeBody(p.body);
  }

  damageProp(p, dmg, dir, source) {
    if (!this.props.has(p)) return;
    p.hp -= dmg;
    p.body.applyImpulse({ x: dir.x * dmg * 0.6, y: 2 + dmg * 0.1, z: dir.z * dmg * 0.6 }, true);
    if (p.hp > 0) return;
    const t = p.body.translation();
    this.removeProp(p);
    this.game.fx.debris(t.x, t.y, t.z, p.kind === 'pitch' ? 0x241a17 : 0x5a4130, 6);
    if (p.kind === 'pitch') {
      this.game.explode(t.x, t.y, t.z, 5, 55, source);
    } else if (Math.random() < 0.45) {
      const drop = Math.random() < 0.5 ? 'wood' : Math.random() < 0.5 ? 'cloth' : 'resin';
      this.game.giveItem(drop, 1, true);
    }
  }
}
