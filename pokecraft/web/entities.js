// Everything that walks around besides you, Pixelmon-style: wild Pokémon
// that live in the world (by biome, by time of day), your lead Pokémon
// following you, a Nurse and a Clerk at every village bell, a merchant who
// wanders by in daylight, and trainers who walk up and challenge you.
import { roamer, levelAt } from './encounters.js';

const rand = Math.random;
const TAU = Math.PI * 2;

export class Entities {
  constructor(ctx) {
    this.ctx = ctx; // { view, world, blockInfo, assets, player, zoneLevel, isNight, biomeName }
    this.list = [];
    this.follower = null;
    this.timer = 0;
    this.trainerTimer = 60 * 40;
    this.merchantTimer = 60 * 90;
    this.bells = new Map(); // "x,y,z" -> true (NPCs placed)
  }

  // ---------------------------------------------------------------- ground
  /// The y your feet would stand at near (x, ~y, z), or null.
  ground(x, y, z) {
    const { world, blockInfo } = this.ctx;
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let yy = Math.floor(y) + 3; yy >= Math.floor(y) - 12; yy--) {
      const below = blockInfo(world.block(bx, yy - 1, bz)), here = blockInfo(world.block(bx, yy, bz)), up = blockInfo(world.block(bx, yy + 1, bz));
      if (!below || !here || !up) return null;
      // Real ground only: Pokémon and people don't stand on tree tops.
      if ((below.h > 0 || below.water) && here.h === 0 && up.h === 0 && !below.leaves) {
        if (below.water) return { y: yy - 0.15, water: true };
        return { y: yy - 1 + below.h, water: false };
      }
    }
    return null;
  }

  /// Top of the column at (x, z): first standable spot from the sky down.
  surface(x, z) {
    const { world } = this.ctx;
    const c = world.chunks.get(Math.floor(x / 16) + ',' + Math.floor(z / 16));
    if (!c) return null;
    // From the sky down, past any tree canopy, to the first real ground.
    let y = c.hi + 1;
    for (let i = 0; i < 4; i++) {
      const g = this.ground(x, y, z);
      if (g) return g;
      y -= 15;
      if (y < c.lo) break;
    }
    return null;
  }

  // ---------------------------------------------------------------- making things
  spritePic(species, back) {
    const { assets } = this.ctx;
    const p = assets.pokemon[species];
    if (!p) return null;
    const cell = assets.cells[back ? p.b : p.f];
    // Size in blocks from the Pokédex height, squashed so a 9 m Onix still fits.
    const height = Math.max(0.7, Math.min(3.4, 0.55 + 0.75 * Math.sqrt(p.m)));
    return { cell, height };
  }

  makeMon(species, level, x, y, z, opts = {}) {
    const pic = this.spritePic(species, false);
    if (!pic) return null;
    const root = this.ctx.view.sprite(pic.cell, pic.height);
    root.position.set(x, y, z);
    const e = {
      kind: 'wild', species, level, pos: [x, y, z], root, heading: rand() * TAU, timer: 60 + rand() * 120,
      aggressive: !!opts.aggressive, water: !!opts.water, hop: rand() * TAU, cooldown: 0, ...opts,
    };
    this.list.push(e);
    return e;
  }

  makeNpc(kind, npc, x, y, z, opts = {}) {
    const { assets, view } = this.ctx;
    const root = view.sprite(assets.cells[assets.npcs[npc]], 1.8);
    root.position.set(x, y, z);
    const e = { kind, npc, pos: [x, y, z], root, heading: rand() * TAU, timer: 120, hop: 0, ...opts };
    this.list.push(e);
    return e;
  }

  remove(e) {
    this.ctx.view.drop(e.root);
    this.list = this.list.filter((x) => x !== e);
  }

  clearAll() {
    for (const e of [...this.list]) this.remove(e);
    this.bells.clear();
  }

  // ---------------------------------------------------------------- spawning
  /// Pokémon roaming in plain sight. By day: gentle ones that leave you be.
  /// At night: scary ones, anywhere, that come for you.
  spawnWild() {
    const { player, isNight, biomeName } = this.ctx;
    const night = isNight();
    const wild = this.list.filter((e) => e.kind === 'wild' && !!e.night === night);
    if (wild.length >= (night ? 7 : 9)) return;
    for (let tries = 0; tries < 4; tries++) {
      const a = rand() * TAU, r = (night ? 18 : 14) + rand() * 20;
      const x = Math.floor(player.pos[0] + Math.cos(a) * r) + 0.5, z = Math.floor(player.pos[2] + Math.sin(a) * r) + 0.5;
      const g = this.surface(x, z);
      if (!g || (g.water && night)) continue;
      const biome = biomeName(x, z);
      if (!biome) continue;
      const level = levelAt(Math.hypot(x - this.ctx.origin()[0], z - this.ctx.origin()[1]), rand, night);
      const species = roamer(biome, level, rand, night);
      this.makeMon(species, level, x, g.y, z, { water: g.water, aggressive: night, night });
      return;
    }
  }

  spawnNear(kind, npc, minR, maxR, opts) {
    const { player } = this.ctx;
    for (let tries = 0; tries < 8; tries++) {
      const a = rand() * TAU, r = minR + rand() * (maxR - minR);
      const x = Math.floor(player.pos[0] + Math.cos(a) * r) + 0.5, z = Math.floor(player.pos[2] + Math.sin(a) * r) + 0.5;
      const g = this.surface(x, z);
      if (!g || g.water) continue;
      return this.makeNpc(kind, npc, x, g.y, z, opts);
    }
    return null;
  }

  /// A Nurse and a Clerk beside every village bell that comes into view.
  addBells(bells) {
    for (const [x, y, z] of bells) {
      const k = `${x},${y},${z}`;
      if (this.bells.has(k)) continue;
      const spots = [[x + 1.5, z + 0.5], [x - 0.5, z + 0.5], [x + 0.5, z + 1.5], [x + 0.5, z - 0.5]];
      const placed = [];
      for (const [sx, sz] of spots) {
        if (placed.length === 2) break;
        const g = this.ground(sx, y + 1, sz);
        if (g && !g.water) placed.push([sx, g.y, sz]);
      }
      if (placed[0]) this.makeNpc('nurse', 'nurse', ...placed[0], { still: true, bell: k });
      if (placed[1]) this.makeNpc('clerk', 'clerk', ...placed[1], { still: true, bell: k });
      this.bells.set(k, true);
    }
  }

  pickTrainer() {
    const { assets, zoneLevel, isNight } = this.ctx;
    const want = zoneLevel() + 2;
    const options = [];
    for (const [cls, t] of Object.entries(assets.trainers)) {
      for (const [index, max, n] of t.parties) {
        const d = Math.abs(max - want);
        if (d <= 6) options.push({ cls, index, max, n, npc: t.npc, w: 7 - d });
      }
    }
    if (!options.length) {
      let best = null;
      for (const [cls, t] of Object.entries(assets.trainers)) for (const [index, max, n] of t.parties) {
        if (!best || Math.abs(max - want) < Math.abs(best.max - want)) best = { cls, index, max, n, npc: t.npc };
      }
      return best;
    }
    let total = 0;
    for (const o of options) total += o.w;
    let r = rand() * total;
    for (const o of options) { r -= o.w; if (r < 0) return o; }
    return options[0];
  }

  // ---------------------------------------------------------------- per frame
  update(dt, frozen) {
    const { player, isNight, view } = this.ctx;
    this.timer++;
    if (!frozen) {
      if (this.timer % 50 === 0) this.spawnWild();
      if (--this.trainerTimer <= 0) {
        this.trainerTimer = 60 * (70 + rand() * 60);
        if (!this.list.some((e) => e.kind === 'trainer' && !e.beaten)) {
          const t = this.pickTrainer();
          if (t) this.spawnNear('trainer', t.npc, 20, 30, { trainer: t, sees: 9 });
        }
      }
      if (--this.merchantTimer <= 0) {
        this.merchantTimer = 60 * (120 + rand() * 120);
        if (!isNight() && !this.list.some((e) => e.kind === 'merchant')) {
          if (this.spawnNear('merchant', 'clerk', 10, 16, { life: 60 * 150 })) this.ctx.say('A travelling MERCHANT is nearby. He sells POKé BALLS and medicine.');
        }
      }
    }
    const [px, , pz] = player.pos;
    for (const e of [...this.list]) {
      const dx = px - e.pos[0], dz = pz - e.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist > 64 && !e.bell) { this.remove(e); continue; }
      // Night ones fade away by morning, day ones by nightfall, out of your sight.
      if (e.kind === 'wild' && !e.inBattle && !!e.night !== isNight() && dist > 10 && rand() < 0.01) { this.remove(e); continue; }
      if (e.life !== undefined && --e.life <= 0 && dist > 8) { this.remove(e); continue; }
      if (!frozen && !e.inBattle) this.think(e, dx, dz, dist, dt);
      // Idle hop and facing.
      e.hop += dt * (e.moving ? 9 : 2.2);
      const bob = e.kind === 'wild' ? Math.abs(Math.sin(e.hop)) * (e.moving ? 0.12 : 0.04) : 0;
      e.root.position.set(e.pos[0], e.pos[1] + bob, e.pos[2]);
      view.face(e.root, e.kind === 'wild' && Math.sin(e.heading - Math.atan2(dx, dz)) > 0);
      if (e.alert) e.alert.position.set(e.pos[0], e.pos[1] + e.root.userData.height + 0.4, e.pos[2]);
    }
    this.updateFollower(dt, frozen);
  }

  walk(e, speed, dt) {
    const nx = e.pos[0] + Math.sin(e.heading) * speed * dt, nz = e.pos[2] + Math.cos(e.heading) * speed * dt;
    const g = this.ground(nx, e.pos[1], nz);
    if (!g || g.water !== !!e.water || Math.abs(g.y - e.pos[1]) > 1.2) { e.heading += Math.PI * (0.5 + rand()); return false; }
    e.pos[0] = nx; e.pos[2] = nz; e.pos[1] += (g.y - e.pos[1]) * Math.min(1, dt * 12);
    return true;
  }

  think(e, dx, dz, dist, dt) {
    const { player } = this.ctx;
    e.moving = false;
    if (e.cooldown > 0) e.cooldown -= dt;
    if (e.kind === 'wild') {
      if (e.aggressive && dist < 16 && e.cooldown <= 0 && this.ctx.canBattle()) {
        e.heading = Math.atan2(dx, dz);
        e.moving = this.walk(e, 3.6, dt);
        e.chase = (e.chase || 0) + 1;
        // It reaches you, or gets as close as the ground lets it and jumps in.
        if ((dist < 1.4 && Math.abs(player.pos[1] - e.pos[1]) < 2) || (dist < 5 && e.chase > 150)) { e.chase = 0; this.ctx.onTouch(e); }
        return;
      }
      e.chase = 0;
      if (--e.timer <= 0) { e.timer = 60 + rand() * 200; e.heading = rand() * TAU; e.wander = rand() < 0.55; }
      if (e.wander) e.moving = this.walk(e, 1.3, dt);
    } else if (e.kind === 'trainer' && !e.beaten) {
      if (!e.spotted && dist < e.sees && Math.abs(player.pos[1] - e.pos[1]) < 4) {
        e.spotted = true;
        this.ctx.onSpotted(e);
      }
      if (e.spotted) {
        // Walks up to you; if the ground won't let it, it challenges you from there.
        e.heading = Math.atan2(dx, dz);
        e.spottedFor = (e.spottedFor || 0) + 1;
        if (dist > 2.2 && e.spottedFor < 120) e.moving = this.walk(e, 3.6, dt);
        else this.ctx.onTouch(e);
      } else if (--e.timer <= 0) { e.timer = 120 + rand() * 200; e.heading = rand() * TAU; e.wander = rand() < 0.3; }
      else if (e.wander) e.moving = this.walk(e, 1.1, dt);
    } else if (!e.still) {
      if (--e.timer <= 0) { e.timer = 120 + rand() * 200; e.heading = rand() * TAU; e.wander = rand() < 0.4; }
      if (e.wander && dist > 3) e.moving = this.walk(e, 1.0, dt);
    }
  }

  // ---------------------------------------------------------------- your Pokémon
  setFollower(species) {
    if (this.follower && this.follower.species === species) return;
    if (this.follower) this.ctx.view.drop(this.follower.root);
    this.follower = null;
    if (!species) return;
    const front = this.spritePic(species, false), back = this.spritePic(species, true);
    if (!front) return;
    const { player } = this.ctx;
    const root = this.ctx.view.sprite(front.cell, front.height);
    root.position.set(player.pos[0], player.pos[1], player.pos[2] + 2);
    this.follower = { species, root, pos: [player.pos[0], player.pos[1], player.pos[2] + 2], front, back, showingBack: false, hop: 0, vel: [0, 0] };
  }

  updateFollower(dt, frozen) {
    const f = this.follower;
    if (!f || f.root.visible === false) return;
    const { player, view } = this.ctx;
    const dx = player.pos[0] - f.pos[0], dz = player.pos[2] - f.pos[2];
    const dist = Math.hypot(dx, dz);
    let moving = false;
    if (!frozen && dist > 2.4) {
      if (dist > 14) {
        // Fell behind: catch up the way Pokémon do.
        const g = this.ground(player.pos[0] - Math.sin(player.yaw) * -1.5, player.pos[1] + 1, player.pos[2] - Math.cos(player.yaw) * -1.5);
        f.pos = [player.pos[0], g ? g.y : player.pos[1], player.pos[2]];
      } else {
        const sp = Math.min(7, 2 + dist * 1.4) * dt;
        const nx = f.pos[0] + (dx / dist) * sp, nz = f.pos[2] + (dz / dist) * sp;
        const g = this.ground(nx, f.pos[1] + 0.5, nz);
        if (g) { f.vel = [nx - f.pos[0], nz - f.pos[2]]; f.pos[0] = nx; f.pos[2] = nz; f.pos[1] += (g.y - f.pos[1]) * Math.min(1, dt * 14); moving = true; }
        else if (dist > 5) { f.pos = [player.pos[0], player.pos[1], player.pos[2]]; }
      }
    }
    // Walking away from the camera: show its back.
    const cam = view.camera.position;
    const away = moving && (f.vel[0] * (f.pos[0] - cam.x) + f.vel[1] * (f.pos[2] - cam.z)) > 0;
    if (away !== f.showingBack && f.back) {
      f.showingBack = away;
      const pic = away ? f.back : f.front;
      view.repaint(f.root, pic.cell, pic.height);
    }
    f.hop += dt * (moving ? 10 : 2);
    f.root.position.set(f.pos[0], f.pos[1] + Math.abs(Math.sin(f.hop)) * (moving ? 0.1 : 0.03), f.pos[2]);
    view.face(f.root);
  }

  /// The thing under the crosshair: first entity whose box the ray passes within `max`.
  pick(eye, dir, max) {
    let best = null, bestT = max;
    const cp = Math.hypot(dir[0], dir[2]) || 1e-6;
    const hx = dir[0] / cp, hz = dir[2] / cp, slope = dir[1] / cp;
    for (const e of this.list) {
      const { width, height } = e.root.userData;
      // Along the look direction, flat distance to the nearest point to its middle.
      const t = (e.pos[0] - eye[0]) * hx + (e.pos[2] - eye[2]) * hz;
      if (t < 0 || t > bestT) continue;
      const ox = eye[0] + hx * t - e.pos[0], oz = eye[2] + hz * t - e.pos[2];
      const y = eye[1] + slope * t - e.pos[1];
      if (Math.hypot(ox, oz) < Math.max(0.55, width / 2) && y > -0.3 && y < height + 0.3) { best = e; bestT = t; }
    }
    return best;
  }

}
