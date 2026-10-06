// Duke Nukem 3D's actors in a Minecraft world.
//
// Each actor is run by Duke's own 1996 CON script (conwasm: the CON VM plus
// Duke's move()/alterang()). This file is the host Build used to be: it
// answers the scripts' questions from Minecraft's blocks (can I see the
// player, where are the floor and ceiling, how far to the wall ahead), moves
// actors with block collision, carries out their orders (shoot, spawn,
// explode, play a sound) and draws them as Duke drew them: flat sprites that
// face you, picked from 5 view angles, from Duke's own ART tiles.
import * as THREE from 'three';
import { Art } from './art.js';
import { Sounds } from './sound.js';

/// Build units per block: a Duke trooper (78 px × repeat 40 / 4 = 780 units)
/// stands about 1.8 blocks, as tall as Steve.
export const B = 432;
export const BZ = B * 16; // Build z is 16× finer and points down
const TICK_HZ = 30;
const STRIDE = 16, EVENT = 8;
const EV = { SHOOT: 1, SPAWN: 2, SOUND: 3, HITRADIUS: 4, DEBRIS: 5, KILLED: 6, QUOTE: 7, PALFROM: 8, PHEALTH: 9, AMMO: 10, INVENTORY: 11 };
const PF = { ON_GROUND: 1, RUNNING: 2, CROUCHING: 4, JETPACK: 8, SHRUNK: 16, DEAD: 32, STEROIDS: 64, USE: 128 };

const toAng = (dx, dz) => Math.round(Math.atan2(dz, dx) * 1024 / Math.PI) & 2047;
const angDir = (a) => [Math.cos(a * Math.PI / 1024), Math.sin(a * Math.PI / 1024)];

export class Duke {
  /// ctx: { scene, solidAt(x,y,z)→height, opaqueAt(x,y,z), waterAt(x,y,z),
  ///        player (pos, eye(), yaw), hurtPlayer(hearts, cause), healPlayer(hearts),
  ///        health() → 0..20, say(text), breakBlock(x,y,z, power), burst(...),
  ///        mobsNear(x,y,z,r) → [{damage(n)}] }
  constructor(ctx) {
    this.ctx = ctx;
    this.actors = new Map(); // id → { sprite, pos[3] world, vy, last[3], tile, flip, pal }
    this.shots = []; // enemy projectiles in flight
    this.fx = []; // short-lived sprites (sparks, gibs without scripts)
    this.texCache = new Map();
    this.acc = 0;
    this.kills = 0;
  }

  async init(wasmBytes, grp) {
    this.grp = grp;
    this.art = new Art(grp);
    const self = this;
    const { instance } = await WebAssembly.instantiate(wasmBytes, {
      env: { host_hits: (x, y, z, ang) => self.hits(x, y, z, ang) },
    });
    this.w = instance.exports;
    // GAME.CON first; it includes DEFS.CON and USER.CON.
    const enc = new TextEncoder();
    const parts = [];
    for (const n of ['GAME.CON', 'DEFS.CON', 'USER.CON']) {
      parts.push(enc.encode(n), new Uint8Array([0]), grp.get(n), new Uint8Array([0]));
    }
    const total = parts.reduce((s, p) => s + p.length, 0);
    let ptr = this.w.con_input(total);
    let o = 0;
    for (const p of parts) { new Uint8Array(this.w.memory.buffer, ptr + o, p.length).set(p); o += p.length; }
    this.scripted = this.w.con_load();
    if (this.scripted < 0) throw new Error('GAME.CON: ' + this.output());
    const len = this.w.con_meta();
    this.meta = JSON.parse(new TextDecoder().decode(new Uint8Array(this.w.memory.buffer, this.w.con_output(), len)));
    this.sounds = new Sounds(grp, this.meta.sounds);
    this.symCache = new Map();
    for (const k of ['LIZTROOP', 'PIGCOP', 'LIZMAN', 'OCTABRAIN', 'COMMANDER', 'DRONE', 'FIRELASER', 'SPIT', 'SHOTSPARK1', 'SHOTGUN', 'CHAINGUN', 'RPG', 'COOLEXPLOSION1', 'MORTER', 'FREEZEBLAST', 'SHRINKSPARK', 'BLOODPOOL', 'EXPLOSION2', 'FIRSTGUN', 'KNEE', 'FIRELASER_WEAPON_STRENGTH', 'SPIT_WEAPON_STRENGTH', 'SHOTGUN_WEAPON_STRENGTH', 'CHAINGUN_WEAPON_STRENGTH', 'RPG_WEAPON_STRENGTH', 'MORTER_WEAPON_STRENGTH', 'COOL_EXPLOSION_STRENGTH', 'PISTOL_WEAPON_STRENGTH', 'FREEZETHROWER_WEAPON_STRENGTH']) this.sym(k);
    this.flyers = new Set(['OCTABRAIN', 'COMMANDER', 'DRONE'].map((n) => this.sym(n)));
  }

  output() { return new TextDecoder().decode(new Uint8Array(this.w.memory.buffer, this.w.con_output(), this.w.con_output_len())); }

  /// The value of a CON define, e.g. sym('LIZTROOP') → 1680.
  sym(name) {
    if (this.symCache.has(name)) return this.symCache.get(name);
    const b = new TextEncoder().encode(name);
    new Uint8Array(this.w.memory.buffer, this.w.con_input(b.length), b.length).set(b);
    const v = this.w.con_symbol();
    const out = v === -2147483648 ? null : v;
    this.symCache.set(name, out);
    return out;
  }

  // ---------------------------------------------------------------- the world as Build sees it
  /// Build's hits(): distance from (x, y, z) to the first wall along `ang`.
  hits(x, y, z, ang) {
    const [dx, dz] = angDir(ang);
    const wx = x / B, wz = y / B, wy = -z / BZ + 0.5;
    for (let t = 0.25; t < 32; t += 0.25) {
      if (this.ctx.solidAt(Math.floor(wx + dx * t), Math.floor(wy), Math.floor(wz + dz * t)) >= 1) return Math.round(t * B);
    }
    return 32 * B;
  }

  /// Nothing opaque between two points (Build's cansee).
  clear(a, b) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...d);
    const n = Math.ceil(len * 3);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (this.ctx.opaqueAt(Math.floor(a[0] + d[0] * k), Math.floor(a[1] + d[1] * k), Math.floor(a[2] + d[2] * k))) return false;
    }
    return true;
  }

  floorAt(x, y, z) {
    for (let yy = Math.floor(y + 0.5); yy > y - 24; yy--) {
      const h = this.ctx.solidAt(Math.floor(x), yy, Math.floor(z));
      if (h > 0) return yy + h;
    }
    return y - 24;
  }
  ceilingAt(x, y, z) {
    for (let yy = Math.floor(y) + 1; yy < y + 24; yy++) if (this.ctx.solidAt(Math.floor(x), yy, Math.floor(z)) >= 1) return yy;
    return y + 24;
  }

  // ---------------------------------------------------------------- actors
  /// Spawn a Duke actor by name or tile at world position `pos` (its feet).
  spawn(what, pos, ang = 0) {
    const tile = typeof what === 'number' ? what : this.sym(what);
    if (tile == null) return -1;
    const id = this.w.con_spawn(tile, Math.round(pos[0] * B), Math.round(pos[2] * B), Math.round(-pos[1] * BZ), ang);
    this.track(id, pos);
    return id;
  }

  track(id, pos) {
    if (this.actors.has(id)) this.drop(id);
    this.actors.set(id, { pos: [...pos], vy: 0, last: [...pos], sprite: null, tileKey: '', blocked: false, hp: 1 });
  }

  drop(id) {
    const a = this.actors.get(id);
    if (!a) return;
    if (a.sprite) { this.ctx.scene.remove(a.sprite); a.sprite.material.dispose(); }
    this.actors.delete(id);
  }

  remove(id) { this.w.con_remove(id); this.drop(id); }

  damage(id, amount, weaponTile) {
    this.w.con_damage(id, Math.round(amount), weaponTile || 0);
  }

  state() {
    const n = this.w.con_count();
    return new Int32Array(this.w.memory.buffer, this.w.con_actors(), n * STRIDE);
  }

  /// Live badguys (by the script's view: alive and health above 0).
  count() {
    const s = this.state();
    let n = 0;
    for (const [id] of this.actors) if (s[id * STRIDE] && s[id * STRIDE + 8] > 0 && this.isEnemy(s[id * STRIDE + 1])) n++;
    return n;
  }
  isEnemy(pic) { return [this.sym('LIZTROOP'), this.sym('PIGCOP'), this.sym('LIZMAN'), this.sym('OCTABRAIN'), this.sym('COMMANDER'), this.sym('DRONE')].includes(pic); }

  // ---------------------------------------------------------------- ticking
  /// Advance by dt seconds: Duke's world ticks at 30 Hz.
  update(dt, frozen) {
    if (frozen) return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= 1 / TICK_HZ && n < 3) { this.acc -= 1 / TICK_HZ; this.tick(); n++; }
    if (n === 3) this.acc = 0;
    this.updateShots(dt);
  }

  tick() {
    const c = this.ctx, w = this.w, p = c.player;
    const eye = p.eye();
    const fwd = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    let flags = PF.ON_GROUND;
    if (c.health() <= 0) flags |= PF.DEAD;
    w.con_player(Math.round(eye[0] * B), Math.round(eye[2] * B), Math.round(-eye[1] * BZ), toAng(fwd[0], fwd[1]), Math.round(c.health() * 5), 0, flags, 1);
    let s = this.state();
    // Sense, from the blocks.
    for (const [id, a] of this.actors) {
      if (!s[id * STRIDE]) continue;
      const [x, y, z] = a.pos;
      const head = [x, y + 1.5, z];
      let f = 0;
      if (Math.hypot(eye[0] - x, eye[2] - z) < 64 && this.clear(head, eye)) f |= 1;
      const r = 0.25;
      if ([[r, 0], [-r, 0], [0, r], [0, -r]].every(([ox, oz]) => c.solidAt(Math.floor(x + ox), Math.floor(y + 0.5), Math.floor(z + oz)) < 1)) f |= 2;
      if (a.blocked) f |= 8;
      if (c.waterAt(Math.floor(x), Math.floor(y + 0.3), Math.floor(z))) f |= 16;
      w.con_sense(id, f, Math.round(-this.floorAt(x, y, z) * BZ), Math.round(-this.ceilingAt(x, y + 1.6, z) * BZ));
    }
    const ne = w.con_tick();
    const ev = new Int32Array(w.memory.buffer, w.con_events(), ne * EVENT).slice();
    s = this.state();
    // New actors from `spawn` (blood pools, explosions, dropped items) start where their parent is.
    for (let i = 0; i < ev.length; i += EVENT) {
      if (ev[i] === EV.SPAWN && ev[i + 6] >= 0) this.track(ev[i + 6], [ev[i + 3] / B, -ev[i + 5] / BZ, ev[i + 4] / B]);
    }
    // Kills, as the scripts see them: health dropping to 0.
    for (const [id, a] of this.actors) {
      const o = id * STRIDE;
      if (!s[o]) continue;
      const hp = s[o + 8];
      if (a.hp > 0 && hp <= 0 && this.isEnemy(s[o + 1])) { this.kills++; if (this.ctx.onKill) this.ctx.onKill(this.nameOf(s, id)); }
      a.hp = hp;
    }
    // Move: the script's position change, with block collision and gravity.
    for (const [id, a] of this.actors) {
      const o = id * STRIDE;
      if (!s[o]) { this.drop(id); continue; }
      const tx = s[o + 2] / B, tz = s[o + 3] / B, ty = -s[o + 4] / BZ;
      const pic = s[o + 1];
      const fly = this.flyers.has(pic);
      const before = [...a.pos];
      this.moveBody(a, tx - a.pos[0], tz - a.pos[2], fly ? ty - a.pos[1] : 0, fly);
      a.blocked = s[o + 6] !== 0 && Math.hypot(a.pos[0] - before[0], a.pos[2] - before[2]) < 0.001;
      w.con_place(id, Math.round(a.pos[0] * B), Math.round(a.pos[2] * B), Math.round(-a.pos[1] * BZ), fly ? s[o + 7] : Math.round(-a.vy * BZ / TICK_HZ));
    }
    for (let i = 0; i < ev.length; i += EVENT) this.event(ev.subarray(i, i + EVENT), s);
  }

  moveBody(a, dx, dz, dy, fly) {
    const c = this.ctx, R = 0.3, H = 1.7;
    const free = (x, y, z) => {
      for (const [ox, oz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
        for (let yy = Math.floor(y + 0.01); yy <= Math.floor(y + H); yy++) {
          const h = c.solidAt(Math.floor(x + ox), yy, Math.floor(z + oz));
          if (h > 0 && yy + h > y + 0.01) return false;
        }
      }
      return true;
    };
    const p = a.pos;
    // The player is solid to them, as Duke's sprites clip against each other.
    const pp = c.player.pos;
    const nearPlayer = (x, y, z) => Math.hypot(x - pp[0], z - pp[2]) < 0.7 && y < pp[1] + 1.8 && y + H > pp[1];
    for (const [i, d] of [[0, dx], [2, dz]]) {
      if (!d) continue;
      const q = [...p];
      q[i] += d;
      if (nearPlayer(q[0], q[1], q[2]) && !nearPlayer(p[0], p[1], p[2])) continue;
      if (free(q[0], q[1], q[2])) { p[i] = q[i]; continue; }
      // Step up one block, as Minecraft's mobs do.
      if (!fly && free(q[0], q[1] + 1.01, q[2]) && free(p[0], p[1] + 1.01, p[2])) { p[1] += 1.01; p[i] = q[i]; }
    }
    if (fly) {
      const q = [p[0], p[1] + dy, p[2]];
      if (free(...q)) p[1] = q[1];
      return;
    }
    // Gravity.
    a.vy = Math.max(-40, a.vy - 32 / TICK_HZ);
    const ny = p[1] + a.vy / TICK_HZ;
    const floor = this.floorAt(p[0], p[1] + 0.01, p[2]);
    if (ny <= floor) { p[1] = floor; a.vy = 0; } else p[1] = ny;
    if (!free(p[0], p[1], p[2])) p[1] = Math.floor(p[1]) + 1;
  }

  event(e, s) {
    const c = this.ctx;
    const a = this.actors.get(e[1]);
    const at = a ? a.pos : null;
    const dist = at ? Math.hypot(at[0] - c.player.pos[0], at[1] - c.player.pos[1], at[2] - c.player.pos[2]) : 0;
    switch (e[0]) {
      case EV.SHOOT: if (at) this.shoot(e[2], at, s, e[1]); break;
      case EV.SOUND: this.sounds.play(e[2], e[3] ? 0 : dist); break;
      case EV.HITRADIUS: if (at) this.blast(at, e[2] / B, [e[3], e[4], e[5], e[6]], e[1]); break;
      case EV.QUOTE: { const q = this.meta.quotes[e[2]]; if (q && dist < 4) c.say(q); break; }
      case EV.PALFROM: c.flash && c.flash(e[3], e[4], e[5]); break;
      case EV.PHEALTH: if (e[2] > 0) c.healPlayer(e[2] / 5); else if (e[2] < 0) c.hurtPlayer(-e[2] / 5, 'duke'); break;
      case EV.AMMO: c.ammo && c.ammo(e[2], e[3]); break;
      case EV.INVENTORY: c.inventory && c.inventory(e[2], e[3]); break;
      case EV.DEBRIS: if (at) c.burst(at[0], at[1] + 1, at[2], [0.6, 0.05, 0.05], Math.min(16, e[3] * 3), 3, 3); break;
      case EV.KILLED: this.drop(e[1]); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- enemy fire
  shoot(tile, from, s, ownerId) {
    const c = this.ctx, sym = (n) => this.sym(n);
    const eye = c.player.eye();
    const src = [from[0], from[1] + 1.2, from[2]];
    const aim = [eye[0] - src[0], eye[1] - 0.3 - src[1], eye[2] - src[2]];
    const L = Math.hypot(...aim) || 1;
    const dmgOf = { [sym('FIRELASER')]: 'FIRELASER_WEAPON_STRENGTH', [sym('SPIT')]: 'SPIT_WEAPON_STRENGTH', [sym('SHOTSPARK1')]: 'SHOTGUN_WEAPON_STRENGTH', [sym('SHOTGUN')]: 'SHOTGUN_WEAPON_STRENGTH', [sym('CHAINGUN')]: 'CHAINGUN_WEAPON_STRENGTH', [sym('RPG')]: 'RPG_WEAPON_STRENGTH', [sym('MORTER')]: 'MORTER_WEAPON_STRENGTH', [sym('COOLEXPLOSION1')]: 'COOL_EXPLOSION_STRENGTH', [sym('FREEZEBLAST')]: 'FREEZETHROWER_WEAPON_STRENGTH' };
    const dmg = this.sym(dmgOf[tile] || 'FIRELASER_WEAPON_STRENGTH') || 7;
    // Hitscan weapons hit (or miss) at once; the rest fly.
    if (tile === sym('SHOTSPARK1') || tile === sym('SHOTGUN') || tile === sym('CHAINGUN')) {
      const pellets = tile === sym('SHOTGUN') ? 3 : 1;
      for (let i = 0; i < pellets; i++) {
        if (Math.random() < 0.55 && this.clear(src, eye)) { c.hurtPlayer(dmg / 5, this.nameOf(s, ownerId)); break; }
      }
      return;
    }
    const speed = { [sym('SPIT')]: 292, [sym('RPG')]: 644, [sym('MORTER')]: 400, [sym('COOLEXPLOSION1')]: 600 }[tile] || 840;
    const v = speed * TICK_HZ / B / 4; // Build units per tick → blocks per second, kept dodgeable
    const spread = 0.04;
    const dir = aim.map((d) => d / L + (Math.random() - 0.5) * spread);
    const sprite = this.makeSprite(tile, 0);
    const shot = { tile, pos: [...src], vel: dir.map((d) => d * v), dmg, life: 4, sprite, owner: this.nameOf(s, ownerId), explode: tile === sym('RPG') || tile === sym('MORTER') };
    this.place(sprite, tile, shot.pos, 0, false);
    this.shots.push(shot);
  }

  nameOf(s, id) {
    const pic = s[id * STRIDE + 1];
    for (const n of ['LIZTROOP', 'PIGCOP', 'LIZMAN', 'OCTABRAIN', 'COMMANDER', 'DRONE']) if (this.sym(n) === pic) return n;
    return 'ALIEN';
  }

  updateShots(dt) {
    const c = this.ctx, eye = c.player.eye();
    for (const sh of [...this.shots]) {
      sh.life -= dt;
      const next = sh.pos.map((v, i) => v + sh.vel[i] * dt);
      let gone = sh.life <= 0;
      if (Math.hypot(next[0] - eye[0], next[1] - (eye[1] - 0.6), next[2] - eye[2]) < 0.7) {
        c.hurtPlayer(sh.dmg / 5, sh.owner);
        gone = true;
      } else if (c.opaqueAt(Math.floor(next[0]), Math.floor(next[1]), Math.floor(next[2]))) {
        if (sh.explode) this.blast(sh.pos, 3, [sh.dmg, sh.dmg, sh.dmg, sh.dmg], -1);
        c.burst(sh.pos[0], sh.pos[1], sh.pos[2], [1, 0.6, 0.2], 6, 2, 1);
        gone = true;
      }
      sh.pos = next;
      if (gone) { this.ctx.scene.remove(sh.sprite); sh.sprite.material.dispose(); this.shots.splice(this.shots.indexOf(sh), 1); continue; }
      sh.sprite.position.set(...sh.pos);
    }
  }

  /// Duke's hitradius: damage falls off with distance, and in a block world
  /// the blast also breaks blocks (as a creeper's does).
  blast(at, r, [d1, d2, d3, d4], fromId) {
    const c = this.ctx;
    const s = this.state();
    for (const [id, a] of this.actors) {
      if (id === fromId || !s[id * STRIDE]) continue;
      const d = Math.hypot(a.pos[0] - at[0], a.pos[1] - at[1], a.pos[2] - at[2]);
      if (d > r) continue;
      const k = d / r;
      const dmg = k < 0.333 ? d4 : k < 0.666 ? d3 : d2 || d1;
      this.damage(id, dmg, this.sym('RPG'));
    }
    const pe = c.player.pos;
    const dp = Math.hypot(pe[0] - at[0], pe[1] + 1 - at[1], pe[2] - at[2]);
    if (dp < r) c.hurtPlayer(((dp / r < 0.5 ? d3 : d1) || 10) / 5, 'explosion');
    for (const m of c.mobsNear(at[0], at[1], at[2], r)) m.damage(Math.ceil((d2 || 20) / 5));
    c.burst(at[0], at[1] + 0.5, at[2], [1, 0.7, 0.2], 30, 6, 4);
    const br = Math.min(3, r * 0.6);
    for (let x = Math.floor(at[0] - br); x <= at[0] + br; x++) for (let y = Math.floor(at[1] - br); y <= at[1] + br; y++) for (let z = Math.floor(at[2] - br); z <= at[2] + br; z++) {
      if (Math.hypot(x + 0.5 - at[0], y + 0.5 - at[1], z + 0.5 - at[2]) < br * (0.7 + Math.random() * 0.3)) c.breakBlock(x, y, z);
    }
  }

  // ---------------------------------------------------------------- the player's weapons
  /// The first actor along a ray, nearer than `maxT`: { id, t } or null.
  pick(eye, dir, maxT) {
    const s = this.state();
    let best = null;
    for (const [id, a] of this.actors) {
      const o = id * STRIDE;
      if (!s[o] || s[o + 8] <= 0 || !this.isEnemy(s[o + 1])) continue;
      const tile = this.art.info(s[o + 9]) || this.art.info(s[o + 1]);
      const h = tile ? tile.h * s[o + 13] / 4 / B : 1.8, rad = tile ? tile.w * s[o + 12] / 8 / B : 0.4;
      // Closest approach of the ray to the actor's vertical axis.
      const rx = a.pos[0] - eye[0], rz = a.pos[2] - eye[2];
      const flat = Math.hypot(dir[0], dir[2]) || 1e-6;
      const t = (rx * dir[0] + rz * dir[2]) / (flat * flat);
      if (t < 0 || t > maxT) continue;
      const px = eye[0] + dir[0] * t - a.pos[0], pz = eye[2] + dir[2] * t - a.pos[2];
      const py = eye[1] + dir[1] * t;
      if (Math.hypot(px, pz) > Math.max(0.35, rad * 0.7) || py < a.pos[1] || py > a.pos[1] + h) continue;
      if (!best || t < best.t) best = { id, t };
    }
    return best;
  }

  // ---------------------------------------------------------------- drawing
  makeSprite(tile, pal) {
    const mat = new THREE.SpriteMaterial({ map: this.texture(tile, false, pal), alphaTest: 0.5, fog: true });
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0);
    this.ctx.scene.add(sp);
    return sp;
  }

  texture(tile, flip, pal) {
    const key = `${tile}|${flip ? 1 : 0}|${pal}`;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const cv = this.art.canvas(tile, flip, pal);
    let t = null;
    if (cv) {
      t = new THREE.CanvasTexture(cv);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
    }
    this.texCache.set(key, t);
    return t;
  }

  /// Size and place a sprite for `tile` (repeat 40-style scale `rep`).
  place(sp, tile, pos, rep, flip, pal = 0) {
    const info = this.art.info(tile);
    if (!info) { sp.visible = false; return; }
    const key = `${tile}|${flip ? 1 : 0}|${pal}`;
    if (sp.userData.key !== key) {
      sp.material.map = this.texture(tile, flip, pal);
      sp.material.needsUpdate = true;
      sp.userData.key = key;
    }
    const r = rep || 32;
    sp.scale.set(info.w * r / 4 / B, info.h * r / 4 / B, 1);
    // ART's y offset shifts the picture; most actors stand on their bottom edge.
    sp.position.set(pos[0], pos[1] - (info.yoff * r / 4 / B) * 0, pos[2]);
    sp.visible = true;
  }

  /// Draw every actor from the camera's position, with Duke's view angles.
  render(camPos) {
    const s = this.state();
    for (const [id, a] of this.actors) {
      const o = id * STRIDE;
      if (!s[o]) continue;
      const pic = s[o + 1], views = s[o + 10];
      let tile = s[o + 9], flip = false;
      if (views === 5 || views === 7 || views === 8) {
        // Duke's animatesprites(): which of the angles you see it from.
        const toCam = toAng(a.pos[0] - camPos[0], a.pos[2] - camPos[2]);
        let k = (((s[o + 5] + 3072 + 128 - toCam) & 2047) >> 8) & 7;
        if (views === 5) { if (k > 4) { k = 8 - k; flip = true; } }
        else if (views === 7) { if (k > 4) { k = 8 - k; flip = true; } k = Math.min(k, 6); }
        tile += k;
      }
      if (!this.art.has(tile)) tile = pic;
      if (!a.sprite) a.sprite = this.makeSprite(tile, s[o + 11]);
      this.place(a.sprite, tile, a.pos, s[o + 12], flip, s[o + 11]);
      if (s[o + 12] === 0) a.sprite.visible = false;
    }
  }

  clearAll() {
    for (const id of [...this.actors.keys()]) this.remove(id);
    for (const sh of this.shots) this.ctx.scene.remove(sh.sprite);
    this.shots = [];
  }
}
