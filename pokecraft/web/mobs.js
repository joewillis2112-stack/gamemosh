// Minecraft's mobs, as blocky 3D models made from Minecraft's own skins.
// By day, cows, pigs, sheep and chickens wander the grass (food, wool,
// leather). At night zombies, skeletons, spiders and creepers spawn from
// each biome's real monster list and come for you: they hit you, skeletons
// shoot, creepers blow holes in the world. Zombies and skeletons burn at
// sunrise. You fight back with your fists or a sword, and your lead
// Pokémon helps.
import * as THREE from 'three';
import { Player } from './player.js';

const TAU = Math.PI * 2;
const rand = Math.random;
const P = 1 / 16; // a model pixel, in blocks

// ---------------------------------------------------------------- models
/// A box `w x h x d` model pixels, Minecraft's skin layout at (u, v).
function box(w, h, d, u, v, tw, th, mirror = false) {
  const hx = (w * P) / 2, hy = (h * P) / 2, hz = (d * P) / 2;
  const pos = [], uv = [], idx = [];
  const face = (corners, ru, rv, rw, rh) => {
    const n = pos.length / 3;
    for (const c of corners) pos.push(...c);
    let u0 = ru / tw, u1 = (ru + rw) / tw;
    if (mirror) [u0, u1] = [u1, u0];
    const v0 = rv / th, v1 = (rv + rh) / th;
    uv.push(u0, v0, u1, v0, u0, v1, u1, v1); // top-left, top-right, bottom-left, bottom-right
    idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  };
  // The model faces -Z (Minecraft's north); its right side is +X.
  face([[hx, hy, -hz], [-hx, hy, -hz], [hx, -hy, -hz], [-hx, -hy, -hz]], u + d, v + d, w, h); // front
  face([[-hx, hy, hz], [hx, hy, hz], [-hx, -hy, hz], [hx, -hy, hz]], u + 2 * d + w, v + d, w, h); // back
  face([[hx, hy, hz], [hx, hy, -hz], [hx, -hy, hz], [hx, -hy, -hz]], u, v + d, d, h); // right
  face([[-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, -hz], [-hx, -hy, hz]], u + d + w, v + d, d, h); // left
  face([[hx, hy, hz], [-hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], u + d, v, w, d); // top
  face([[hx, -hy, -hz], [-hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], u + d + w, v, w, d); // bottom
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/// A part: a box hung from a pivot (so legs swing from the hip).
function part(group, mat, geo, px, py, pz, ox = 0, oy = 0, oz = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(px * P, py * P, pz * P);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(ox * P, oy * P, oz * P);
  pivot.add(m);
  group.add(pivot);
  return pivot;
}

const MODELS = {
  humanoid(mat, tw, th, thin) {
    const g = new THREE.Group();
    const lw = thin ? 2 : 4;
    const parts = {
      head: part(g, mat, box(8, 8, 8, 0, 0, tw, th), 0, 24, 0, 0, 4, 0),
      body: part(g, mat, box(8, 12, 4, 16, 16, tw, th), 0, 18, 0),
      armR: part(g, mat, box(lw, 12, lw, 40, 16, tw, th), 5 + lw / 2 - 1, 22, 0, 0, -4, 0),
      armL: part(g, mat, box(lw, 12, lw, 40, 16, tw, th, true), -(5 + lw / 2 - 1), 22, 0, 0, -4, 0),
      legR: part(g, mat, box(lw, 12, lw, 0, 16, tw, th), 2, 12, 0, 0, -6, 0),
      legL: part(g, mat, box(lw, 12, lw, 0, 16, tw, th, true), -2, 12, 0, 0, -6, 0),
    };
    return { g, parts, legs: ['legR', 'legL'], height: 1.95 };
  },
  creeper(mat, tw, th) {
    const g = new THREE.Group();
    const parts = {
      head: part(g, mat, box(8, 8, 8, 0, 0, tw, th), 0, 18, 0, 0, 4, 0),
      body: part(g, mat, box(8, 12, 4, 16, 16, tw, th), 0, 12, 0),
      leg1: part(g, mat, box(4, 6, 4, 0, 16, tw, th), 2, 6, -4, 0, -3, 0),
      leg2: part(g, mat, box(4, 6, 4, 0, 16, tw, th, true), -2, 6, -4, 0, -3, 0),
      leg3: part(g, mat, box(4, 6, 4, 0, 16, tw, th), 2, 6, 4, 0, -3, 0),
      leg4: part(g, mat, box(4, 6, 4, 0, 16, tw, th, true), -2, 6, 4, 0, -3, 0),
    };
    return { g, parts, legs: ['leg1', 'leg4', 'leg2', 'leg3'], height: 1.7 };
  },
  spider(mat, tw, th) {
    const g = new THREE.Group();
    const parts = {
      head: part(g, mat, box(8, 8, 8, 32, 4, tw, th), 0, 9, -3, 0, 0, -4),
      neck: part(g, mat, box(6, 6, 6, 0, 0, tw, th), 0, 9, 0),
      body: part(g, mat, box(10, 8, 12, 0, 12, tw, th), 0, 9, 3, 0, 0, 6),
    };
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 1 : -1, z = [-3, -1, 1, 3][i % 4];
      const p = part(g, mat, box(16, 2, 2, 18, 0, tw, th, side < 0), side * 4, 9, z, side * 8, 0, 0);
      p.rotation.z = side * 0.7;
      p.rotation.y = side * [0.5, 0.15, -0.15, -0.5][i % 4];
      parts['leg' + i] = p;
      legs.push('leg' + i);
    }
    return { g, parts, legs, height: 0.9, spider: true };
  },
  quadruped(mat, tw, th, spec) {
    const g = new THREE.Group();
    const parts = {};
    parts.head = part(g, mat, box(...spec.head, tw, th), 0, spec.headY, spec.headZ, 0, 0, -spec.head[2] / 2 + 1);
    const body = part(g, mat, box(...spec.body, tw, th), 0, spec.bodyY, 0);
    body.rotation.x = Math.PI / 2;
    parts.body = body;
    if (spec.snout) part(parts.head, mat, box(...spec.snout, tw, th), 0, spec.snoutY || -1, -spec.head[2] - 0.5);
    const [lw, lh] = spec.leg;
    const xs = spec.legX, zs = spec.legZ;
    [[xs, -zs], [-xs, -zs], [xs, zs], [-xs, zs]].forEach(([x, z], i) => {
      parts['leg' + i] = part(g, mat, box(lw, lh, lw, 0, 16, tw, th, x < 0), x, lh, z, 0, -lh / 2, 0);
    });
    return { g, parts, legs: ['leg0', 'leg3', 'leg1', 'leg2'], height: spec.height };
  },
  chicken(mat, tw, th) {
    const g = new THREE.Group();
    const parts = {
      head: part(g, mat, box(4, 6, 3, 0, 0, tw, th), 0, 9, -4, 0, 3, -1),
      body: part(g, mat, box(6, 8, 6, 0, 9, tw, th), 0, 8, 0),
      legR: part(g, mat, box(3, 5, 3, 26, 0, tw, th), 1.5, 5, 1, 0, -2.5, 0),
      legL: part(g, mat, box(3, 5, 3, 26, 0, tw, th, true), -1.5, 5, 1, 0, -2.5, 0),
      wingR: part(g, mat, box(1, 4, 6, 24, 13, tw, th), 3.5, 10, 0, 0, -2, 0),
      wingL: part(g, mat, box(1, 4, 6, 24, 13, tw, th, true), -3.5, 10, 0, 0, -2, 0),
    };
    parts.body.rotation.x = Math.PI / 2;
    part(parts.head, mat, box(4, 2, 2, 14, 0, tw, th), 0, 2.5, -2.5);
    return { g, parts, legs: ['legR', 'legL'], height: 0.7 };
  },
};

const KINDS = {
  zombie: { model: 'humanoid', hp: 20, hostile: true, burns: true, speed: 2.3, dmg: 3, drops: [['rotten_flesh', 0, 2]] },
  husk: { model: 'humanoid', skin: 'husk', hp: 20, hostile: true, speed: 2.3, dmg: 3, drops: [['rotten_flesh', 0, 2]] },
  drowned: { model: 'humanoid', skin: 'drowned', hp: 20, hostile: true, burns: true, speed: 2.0, dmg: 3, drops: [['rotten_flesh', 0, 2]] },
  skeleton: { model: 'humanoid', thin: true, hp: 20, hostile: true, burns: true, speed: 2.4, dmg: 3, ranged: true, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  stray: { model: 'humanoid', skin: 'stray', thin: true, hp: 20, hostile: true, burns: true, speed: 2.4, dmg: 3, ranged: true, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  spider: { model: 'spider', hp: 16, hostile: true, speed: 3.6, dmg: 2, drops: [['string', 0, 2], ['spider_eye', 0, 1]] },
  creeper: { model: 'creeper', hp: 20, hostile: true, speed: 2.2, creeper: true, drops: [['gunpowder', 0, 2]] },
  cow: { model: 'quadruped', hp: 10, speed: 1.6, drops: [['beef', 1, 3], ['leather', 0, 2]], q: { head: [8, 8, 6, 0, 0], headY: 20, headZ: -8, body: [12, 18, 10, 18, 4], bodyY: 17, leg: [4, 12], legX: 4, legZ: 6, height: 1.4 } },
  pig: { model: 'quadruped', hp: 10, speed: 1.6, drops: [['porkchop', 1, 3]], q: { head: [8, 8, 8, 0, 0], headY: 12, headZ: -6, body: [10, 16, 8, 28, 8], bodyY: 11, leg: [4, 6], legX: 3, legZ: 5, height: 0.9, snout: [4, 3, 1, 16, 16], snoutY: -1.5 } },
  sheep: { model: 'quadruped', hp: 8, speed: 1.5, drops: [['mutton', 1, 2], ['white_wool', 1, 1]], wool: true, q: { head: [6, 6, 8, 0, 0], headY: 18, headZ: -8, body: [8, 16, 6, 28, 8], bodyY: 17, leg: [4, 12], legX: 3, legZ: 5, height: 1.3 } },
  chicken: { model: 'chicken', hp: 4, speed: 1.4, drops: [['chicken', 1, 1], ['feather', 0, 2]] },
};

export class Mobs {
  constructor(ctx) {
    this.ctx = ctx; // { view, world, blockInfo, solidAt, waterAt, player, survival, isNight, biome(x, z) -> {name, spawns}, ground(x,y,z), edit(x,y,z,name), drop(item, n, pos), say, follower() }
    this.list = [];
    this.arrows = [];
    this.skins = {};
    this.timer = 0;
    this.helpCool = 0;
  }

  async loadSkins(skins) {
    for (const [name, b64] of Object.entries(skins)) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const t = new THREE.Texture(img);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
      this.skins[name] = t;
    }
  }

  make(type, x, y, z) {
    const k = KINDS[type];
    const tex = this.skins[k.skin || type];
    if (!tex) return null;
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
    const tw = tex.image.width, th = tex.image.height;
    const model = k.model === 'quadruped' ? MODELS.quadruped(mat, tw, th, k.q) : MODELS[k.model](mat, tw, th, k.thin);
    if (k.wool && this.skins.sheep_wool) {
      const wm = new THREE.MeshBasicMaterial({ map: this.skins.sheep_wool, alphaTest: 0.5 });
      const w = part(model.g, wm, box(8, 16, 6, 28, 8, 64, 32), 0, k.q.bodyY, 0);
      w.rotation.x = Math.PI / 2;
      w.scale.setScalar(1.25);
      model.extraMats = [wm];
    }
    if (type === 'zombie' || type === 'husk' || type === 'drowned') {
      model.parts.armR.rotation.x = -Math.PI / 2;
      model.parts.armL.rotation.x = -Math.PI / 2;
    }
    model.g.position.set(x, y, z);
    this.ctx.view.scene.add(model.g);
    const body = new Player(x, y, z);
    const m = { type, k, model, mat, body, hp: k.hp, yaw: rand() * TAU, timer: 0, walk: 0, hurt: 0, flee: 0, fuse: 0, shoot: 1 + rand() * 2, attackCool: 0, mobile: true };
    this.list.push(m);
    return m;
  }

  remove(m) {
    this.ctx.view.scene.remove(m.model.g);
    m.model.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.list = this.list.filter((x) => x !== m);
  }

  clearAll() { for (const m of [...this.list]) this.remove(m); for (const a of this.arrows) this.ctx.view.scene.remove(a.mesh); this.arrows = []; }

  // ---------------------------------------------------------------- spawning
  spawn() {
    const { player, isNight, biome } = this.ctx;
    const night = isNight();
    const hostile = this.list.filter((m) => m.k.hostile).length;
    const passive = this.list.length - hostile;
    const wantHostile = night && hostile < 8;
    const wantPassive = !night && passive < 6;
    if (!wantHostile && !wantPassive) return;
    for (let tries = 0; tries < 4; tries++) {
      const a = rand() * TAU, r = (wantHostile ? 18 : 16) + rand() * 18;
      const x = Math.floor(player.pos[0] + Math.cos(a) * r) + 0.5, z = Math.floor(player.pos[2] + Math.sin(a) * r) + 0.5;
      const g = this.ctx.surface(x, z);
      if (!g || g.water) continue;
      const b = biome(x, z);
      if (!b) continue;
      const list = ((b.spawns || {})[wantHostile ? 'monster' : 'creature'] || []).filter(([t]) => KINDS[t]);
      if (!list.length) continue;
      if (!wantHostile && g.top !== 'grass_block') continue;
      let total = 0;
      for (const [, w] of list) total += w;
      let pick = rand() * total, type = list[0][0];
      for (const [t, w] of list) { pick -= w; if (pick < 0) { type = t; break; } }
      // Minecraft spawns animals in little herds.
      const n = wantHostile ? 1 : 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) this.make(type, x + (rand() - 0.5) * 3, g.y + 0.05, z + (rand() - 0.5) * 3);
      return;
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt, frozen) {
    const c = this.ctx, p = c.player;
    this.timer++;
    if (!frozen && this.timer % 60 === 0) this.spawn();
    const light = c.view.mobLight ?? 1;
    const day = !c.isNight();
    for (const m of [...this.list]) {
      const dx = p.pos[0] - m.body.pos[0], dz = p.pos[2] - m.body.pos[2], dy = p.pos[1] - m.body.pos[1];
      const dist = Math.hypot(dx, dz);
      if (dist > 80) { this.remove(m); continue; }
      if (m.k.hostile && day && !m.k.burns && dist > 24 && rand() < 0.002) { this.remove(m); continue; }
      if (!frozen) this.think(m, dt, dx, dz, dy, dist, day);
      // Pose.
      const g = m.model.g;
      g.position.set(m.body.pos[0], m.body.pos[1], m.body.pos[2]);
      g.rotation.y = m.yaw;
      const swing = Math.sin(m.walk * 9) * Math.min(1, Math.hypot(m.body.vel[0], m.body.vel[2]) / 2) * 0.8;
      m.model.legs.forEach((name, i) => { const leg = m.model.parts[name]; if (m.model.spider) leg.rotation.x = swing * (i % 2 ? 0.4 : -0.4); else leg.rotation.x = i % 2 ? -swing : swing; });
      if (m.model.parts.armR && !/zombie|husk|drowned/.test(m.type)) { m.model.parts.armR.rotation.x = -swing; m.model.parts.armL.rotation.x = swing; }
      // Colour: night light, red when hurt, white flashes on a lit creeper.
      const flash = m.fuse > 0 && Math.floor(m.fuse * 8) % 2 === 0;
      if (m.hurt > 0) m.mat.color.setRGB(1.2, 0.35, 0.35);
      else if (flash) m.mat.color.setRGB(2.2, 2.2, 2.2);
      else m.mat.color.setRGB(light, light, light * 1.05);
      if (m.model.extraMats) for (const em of m.model.extraMats) em.color.copy(m.mat.color);
      g.scale.setScalar(m.fuse > 0 ? 1 + m.fuse * 0.12 : 1);
      if (m.hurt > 0) m.hurt -= dt;
    }
    this.updateArrows(dt, frozen);
    if (!frozen) this.followerHelps(dt);
  }

  think(m, dt, dx, dz, dy, dist, day) {
    const c = this.ctx, k = m.k;
    m.timer -= dt;
    m.attackCool -= dt;
    let move = [0, 0], jump = false, sprint = false;
    const toPlayer = Math.atan2(-dx, -dz); // yaw that faces the player (forward is -Z at yaw 0)
    // Monsters hunt at night; by day only if you've hit them (spiders, creepers).
    // Your lead Pokémon's type can make some of them leave you be (until you hit them).
    const chase = k.hostile && (!day || m.angry) && dist < 28 && !c.survival.dead && (m.angry || !(c.calm && c.calm(m.type)));
    if (k.burns && day && c.skyOpen(m.body.pos)) {
      // Caught in the sun.
      m.burnT = (m.burnT || 0) + dt;
      if (m.burnT > 1) { m.burnT = 0; this.damage(m, 2, null); c.view.burst(m.body.pos[0], m.body.pos[1] + 1.2, m.body.pos[2], [1, 0.55, 0.1], 6, 1, 1.5); }
    }
    if (k.creeper && (chase || m.fuse > 0)) {
      if (m.fuse > 0 || dist < 2.6) {
        m.fuse += dt;
        if (dist > 6) m.fuse = 0;
        else if (m.fuse >= 1.5) { this.explode(m); return; }
      } else {
        m.yaw = toPlayer;
        move = [0, 1];
      }
    } else if (k.ranged && chase) {
      m.yaw = toPlayer;
      if (dist > 10) move = [0, 1];
      else if (dist < 5) move = [0, -0.8];
      else move = [Math.sin(m.walk * 0.6) > 0 ? 0.6 : -0.6, 0];
      m.shoot -= dt;
      if (m.shoot <= 0 && dist < 18 && c.clearLine([m.body.pos[0], m.body.pos[1] + 1.5, m.body.pos[2]], c.player.eye())) {
        m.shoot = 1.6 + rand();
        this.fire(m);
      }
    } else if (chase) {
      m.yaw = toPlayer;
      move = [0, 1];
      sprint = k.speed > 3;
      if (m.model.spider && dist < 4 && m.body.onGround && rand() < 0.04) jump = true;
      if (dist < 1.3 && Math.abs(dy) < 1.6 && m.attackCool <= 0) {
        m.attackCool = 1;
        c.survival.hurt(k.dmg, m.type);
        // Knock you back.
        const l = dist || 1;
        c.player.vel[0] += (dx / l) * 6; c.player.vel[2] += (dz / l) * 6; c.player.vel[1] = Math.max(c.player.vel[1], 4);
      }
    } else if (m.flee > 0) {
      m.flee -= dt;
      m.yaw = toPlayer + Math.PI;
      move = [0, 1];
      sprint = true;
    } else {
      if (m.timer <= 0) { m.timer = 2 + rand() * 5; m.wander = rand() < 0.5; m.yaw += (rand() - 0.5) * 2.5; }
      if (m.wander) move = [0, 0.5];
    }
    const before = [m.body.pos[0], m.body.pos[2]];
    m.body.yaw = m.yaw;
    const speedScale = k.speed / 4.3;
    m.body.step(dt, [move[0] * speedScale, move[1] * speedScale], jump || (m.body.inWater && rand() < 0.5), sprint, c.solidAt, c.waterAt);
    m.walk += Math.hypot(m.body.pos[0] - before[0], m.body.pos[2] - before[1]) * 2.5;
    if (m.body.pos[1] < -70) this.remove(m);
  }

  // ---------------------------------------------------------------- fighting
  /// Hit a mob for `n` half-hearts; `from` is where the blow came from.
  damage(m, n, from) {
    if (!this.list.includes(m)) return;
    m.hp -= n;
    m.hurt = 0.3;
    if (from) {
      const dx = m.body.pos[0] - from[0], dz = m.body.pos[2] - from[2], l = Math.hypot(dx, dz) || 1;
      m.body.vel[0] += (dx / l) * 7; m.body.vel[2] += (dz / l) * 7; m.body.vel[1] = 5;
    }
    if (!m.k.hostile) m.flee = 4;
    else m.angry = true;
    if (m.k.creeper) m.fuse = 0;
    if (m.hp <= 0) this.kill(m);
  }

  kill(m) {
    const c = this.ctx;
    const [x, y, z] = m.body.pos;
    c.view.burst(x, y + 0.6, z, [0.9, 0.9, 0.9], 14, 2, 2.5);
    for (const [item, lo, hi] of m.k.drops) {
      const n = lo + Math.floor(rand() * (hi - lo + 1));
      if (n > 0) c.drop(item, n);
    }
    if (m.k.hostile) c.reward(m.type);
    this.remove(m);
  }

  /// The mob under the crosshair within `reach`, or null.
  pick(eye, dir, reach) {
    let best = null, bestT = reach;
    for (const m of this.list) {
      const r = m.model.spider ? 0.7 : 0.45, h = m.model.height;
      for (let t = 0.3; t < bestT; t += 0.1) {
        const x = eye[0] + dir[0] * t, y = eye[1] + dir[1] * t, z = eye[2] + dir[2] * t;
        if (Math.hypot(x - m.body.pos[0], z - m.body.pos[2]) < r && y > m.body.pos[1] && y < m.body.pos[1] + h) { best = m; bestT = t; break; }
      }
    }
    return best;
  }

  fire(m) {
    const c = this.ctx;
    const from = [m.body.pos[0], m.body.pos[1] + 1.5, m.body.pos[2]];
    const to = c.player.eye();
    const d = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const t = d / 18; // seconds to reach you
    const vel = [(to[0] - from[0]) / t, (to[1] - 0.4 - from[1]) / t + 6 * t, (to[2] - from[2]) / t];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: 0x8a6a3a }));
    mesh.position.set(...from);
    c.view.scene.add(mesh);
    this.arrows.push({ pos: from, vel, mesh, life: 3 });
  }

  updateArrows(dt, frozen) {
    const c = this.ctx;
    for (const a of [...this.arrows]) {
      if (!frozen) {
        a.vel[1] -= 12 * dt;
        for (let i = 0; i < 3; i++) a.pos[i] += a.vel[i] * dt;
        a.life -= dt;
      }
      a.mesh.position.set(...a.pos);
      a.mesh.lookAt(a.pos[0] + a.vel[0], a.pos[1] + a.vel[1], a.pos[2] + a.vel[2]);
      const p = c.player.pos;
      const hit = Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) < 0.5 && a.pos[1] > p[1] && a.pos[1] < p[1] + 1.9;
      if (hit) c.survival.hurt(3, 'arrow');
      if (hit || a.life <= 0 || c.solidAt(Math.floor(a.pos[0]), Math.floor(a.pos[1]), Math.floor(a.pos[2]))) {
        c.view.scene.remove(a.mesh);
        this.arrows = this.arrows.filter((x) => x !== a);
      }
    }
  }

  /// A creeper goes off: a crater, and it hurts by distance.
  explode(m) {
    const c = this.ctx;
    const [x, y, z] = m.body.pos;
    this.remove(m);
    const R = 2.6;
    for (let bx = Math.floor(x - R); bx <= Math.floor(x + R); bx++) {
      for (let by = Math.floor(y - R + 0.5); by <= Math.floor(y + R); by++) {
        for (let bz = Math.floor(z - R); bz <= Math.floor(z + R); bz++) {
          if (Math.hypot(bx + 0.5 - x, by + 0.5 - y - 0.5, bz + 0.5 - z) > R + rand() * 0.6 - 0.3) continue;
          const b = c.blockInfo(c.world.block(bx, by, bz));
          if (!b || b.air || b.water || b.lava || b.name === 'bedrock') continue;
          c.edit(bx, by, bz, 'air');
        }
      }
    }
    for (let i = 0; i < 4; i++) c.view.burst(x, y + 1, z, [0.35, 0.35, 0.35], 25, 7, 5);
    const p = c.player.pos;
    const d = Math.hypot(p[0] - x, p[1] - y, p[2] - z);
    if (d < 6) {
      c.survival.hurtCool = 0;
      c.survival.hurt(Math.round(16 * (1 - d / 6)), 'creeper');
      const l = Math.hypot(p[0] - x, p[2] - z) || 1;
      c.player.vel[0] += ((p[0] - x) / l) * 10; c.player.vel[2] += ((p[2] - z) / l) * 10; c.player.vel[1] = 7;
    }
    // The blast reaches Pokémon too: your follower (real HP), and wild ones (c.blast).
    const f = c.follower && c.follower();
    if (f && c.followerHurt) {
      const fd = Math.hypot(f.pos[0] - x, f.pos[2] - z);
      if (fd < 5) c.followerHurt('creeper', Math.round(10 * (1 - fd / 5)));
    }
    if (c.blast) c.blast(x, y, z, 5);
    for (const o of [...this.list]) {
      const od = Math.hypot(o.body.pos[0] - x, o.body.pos[2] - z);
      if (od < 5) this.damage(o, Math.round(14 * (1 - od / 5)), [x, y, z]);
    }
  }

  /// Your lead Pokémon fights the monsters that come for you.
  followerHelps(dt) {
    const c = this.ctx;
    const f = c.follower();
    if (!f) return;
    this.helpCool -= dt;
    if (this.helpCool > 0) return;
    const p = c.player.pos;
    let target = null, best = 8;
    for (const m of this.list) {
      // Not the ones your lead's type keeps calm, unless they've turned on you.
      if (!m.k.hostile || (c.calm && c.calm(m.type) && !m.angry)) continue;
      const d = Math.hypot(m.body.pos[0] - p[0], m.body.pos[2] - p[2]);
      if (d < best) { best = d; target = m; }
    }
    if (!target) return;
    this.helpCool = 1.4;
    const dmg = 2 + Math.floor(f.level / 6);
    c.view.burst(target.body.pos[0], target.body.pos[1] + 1, target.body.pos[2], f.colour, 10, 3, 2);
    this.damage(target, dmg, f.pos);
    // It hits back: real HP off your Pokémon (Pokémon's own party, not a copy).
    if (target.hp > 0 && c.followerHurt && Math.random() < 0.5) c.followerHurt(target.type, target.k.dmg || 2);
    if (!this.cheered || performance.now() - this.cheered > 60000) {
      this.cheered = performance.now();
      c.say(`${f.species.toUpperCase()} is fighting the ${target.type.toUpperCase()}!`);
    }
  }
}

export const MOB_KINDS = KINDS;
