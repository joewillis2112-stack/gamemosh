// Enemy types, AI, bosses, wilderness spawning, physics corpses.
import * as THREE from 'three';
import { R, GROUPS } from '../physics.js';
import { WORLD } from '../config.js';
import { HumanoidRig, WolfRig, WraithRig } from './models.js';
import { dist2, angleWrap, approachAngle, clamp } from '../core/util.js';
import { BOSS_DROPS } from '../items.js';

export const TYPES = {
  hollow: { name: 'Hollow', rig: 'human', hp: 42, dmg: 13, walk: 1.6, run: 4.4, reach: 1.9, windup: 0.62, strike: 0.25, recover: 0.75, aggro: 17, embers: 22, poise: 14, weapon: 'sword', o: { slouch: true, eyes: 'ember', colors: { skin: 0x8a8578, torso: 0x3b342c, legs: 0x2d2723 } }, drops: [['bone', 0.35], ['cloth', 0.3]] },
  knight: { name: 'Vigil Knight', rig: 'human', hp: 115, dmg: 22, walk: 1.4, run: 3.6, reach: 2.6, windup: 0.85, strike: 0.3, recover: 0.9, aggro: 18, embers: 75, poise: 45, weapon: 'greatsword', o: { helm: true, bulk: 1.2, eyes: 'ember', shield: false, colors: { torso: 0x3a3c42, legs: 0x26272b } }, drops: [['iron_scrap', 0.6], ['ember_shard', 0.08]] },
  skeleton: { name: 'Barrow Dead', rig: 'human', hp: 30, dmg: 12, walk: 1.8, run: 4.8, reach: 1.9, windup: 0.5, strike: 0.22, recover: 0.6, aggro: 16, embers: 20, poise: 10, weapon: 'sword', o: { skull: true, colors: { torso: 0x8f887a, legs: 0x8f887a, skin: 0xc4bca6 } }, drops: [['bone', 0.7]] },
  wolf: { name: 'Ashwolf', rig: 'wolf', hp: 30, dmg: 11, walk: 2.5, run: 7.4, reach: 1.7, windup: 0.42, strike: 0.25, recover: 0.8, aggro: 24, embers: 18, poise: 10, lunge: 9, drops: [['bone', 0.4], ['dried_meat', 0.25]] },
  wraith: { name: 'Gloam Wraith', rig: 'wraith', hp: 46, dmg: 15, walk: 1.8, run: 3.4, reach: 2.2, windup: 0.75, strike: 0.25, recover: 0.8, aggro: 26, embers: 45, poise: 30, float: true, dreadAura: 6, drops: [['cloth', 0.5], ['resin', 0.3]] },
};

const BOSSES = {
  warden: { base: 'hollow', name: 'warden', scale: 2.2, hp: 720, dmg: 34, reach: 4.4, weapon: 'greatsword', o: { slouch: true, eyes: 'ember', bulk: 1.2, colors: { skin: 0x7a7468, torso: 0x2f2a25, legs: 0x221e1b } }, moves: ['swing', 'swing', 'slam', 'charge'] },
  knight: { base: 'knight', name: 'knight', scale: 1.9, hp: 680, dmg: 32, reach: 4.0, weapon: 'greatsword', o: { helm: true, bulk: 1.25, eyes: 'ember', colors: { torso: 0x1e1f23, legs: 0x151518 } }, moves: ['swing', 'swing', 'slam', 'charge'] },
  witch: { base: 'wraith', name: 'witch', scale: 1.7, hp: 540, dmg: 26, reach: 3.0, o: { color: 0x2a1512, eyes: 'ember' }, moves: ['volley', 'volley', 'nova', 'blink'] },
  beast: { base: 'wolf', name: 'beast', scale: 2.5, hp: 620, dmg: 30, reach: 3.2, o: { color: 0x2a2522 }, moves: ['lunge', 'lunge', 'lunge', 'howl'] },
};

let nextId = 1;

class Enemy {
  constructor(mgr, type, x, z, opts = {}) {
    const game = mgr.game;
    this.mgr = mgr;
    this.game = game;
    this.id = nextId++;
    this.type = type;
    const bossDef = opts.boss ? BOSSES[opts.boss] : null;
    const base = TYPES[bossDef ? bossDef.base : type];
    this.def = base;
    this.bossDef = bossDef;
    this.level = opts.level || 1;
    const lv = this.level - 1;
    this.scale = bossDef ? bossDef.scale : opts.elite ? 1.25 : 1;
    this.maxHp = (bossDef ? bossDef.hp * (1 + lv * 0.18) : base.hp * (1 + lv * 0.35)) * (opts.elite ? 2 : 1);
    this.hp = this.maxHp;
    this.dmg = (bossDef ? bossDef.dmg : base.dmg) * (1 + lv * 0.16) * (opts.elite ? 1.3 : 1);
    this.reach = bossDef ? bossDef.reach : base.reach * this.scale;
    this.embers = Math.round((bossDef ? 900 + lv * 250 : base.embers * (1 + lv * 0.55)) * (opts.elite ? 3 : 1));
    this.name = opts.name || (opts.elite ? `Elder ${base.name}` : base.name);
    this.isBoss = !!bossDef;
    this.locId = opts.locId ?? null;
    this.wild = !!opts.wild;
    this.home = new THREE.Vector3(x, 0, z);
    this.nightOnly = !!opts.nightOnly;

    const ro = { ...(base.o || {}), ...(bossDef ? bossDef.o : {}), scale: this.scale };
    if (opts.elite && ro.colors) ro.colors = { ...ro.colors, torso: 0x4a2622 };
    const rigKind = base.rig;
    this.rig = rigKind === 'wolf' ? new WolfRig(ro) : rigKind === 'wraith' ? new WraithRig(ro) : new HumanoidRig({ ...ro, weapon: bossDef ? bossDef.weapon : base.weapon });
    this.root = this.rig.root;
    game.scene.add(this.root);

    const y = game.gen.height(x, z) + 1.2 * this.scale + 0.3;
    this.radius = (rigKind === 'wolf' ? 0.45 : 0.36) * this.scale;
    this.halfH = (rigKind === 'wolf' ? 0.3 : 0.55) * this.scale;
    this.body = game.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    this.collider = game.physics.world.createCollider(R.ColliderDesc.capsule(this.halfH, this.radius).setCollisionGroups(GROUPS.enemy), this.body);
    game.physics.info.set(this.collider.handle, { kind: 'enemy', enemy: this });
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.stateT = 0;
    this.wanderT = Math.random() * 3;
    this.wanderTarget = null;
    this.poiseDmg = 0;
    this.flashT = 0;
    this.burn = 0;
    this.aggro = false;
    this.move = null;
    this.moveIdx = 0;
    this.dead = false;
    this.grounded = false;
    this.howled = false;
    this.speed = 0;
  }

  get feetY() {
    return this.pos.y - this.halfH - this.radius;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    const d = dist2(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
    const def = this.def;
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt * 4);
    this.poiseDmg = Math.max(0, this.poiseDmg - dt * 6);
    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= 6 * dt;
      if (Math.random() < dt * 12) game.fx.burst(this.pos.x, this.pos.y, this.pos.z, 0xff7a26, 1, 1);
      if (this.hp <= 0) { this.die(0, 0); return; }
    }
    if (this.nightOnly && !game.sky.isNight && !this.aggro) { this.fade = (this.fade || 0) + dt; if (this.fade > 2) { this.mgr.remove(this); return; } }

    const toX = p.pos.x - this.pos.x, toZ = p.pos.z - this.pos.z;
    const angTo = Math.atan2(toX, toZ);
    const playerAlive = !p.dead;
    const aggroR = def.aggro * (game.sky.isNight ? 1.25 : 1) * (p.s.torchOn && def.rig === 'wolf' ? 0.7 : 1) * (this.isBoss ? 1.6 : 1);
    if (!this.aggro && playerAlive && d < aggroR) {
      this.aggro = true;
      if (this.isBoss) game.onBossAggro(this);
      // alert packmates
      for (const e of this.mgr.list) if (e !== this && !e.aggro && dist2(e.pos.x, e.pos.z, this.pos.x, this.pos.z) < 12) e.aggro = true;
    }
    if (this.aggro && (!playerAlive || d > aggroR * 2.4 || dist2(this.pos.x, this.pos.z, this.home.x, this.home.z) > (this.isBoss ? 45 : 60))) {
      if (!this.isBoss || !playerAlive || d > 60) {
        this.aggro = false;
        this.setState('idle');
        if (this.isBoss) { this.hp = this.maxHp; game.onBossReset(this); }
      }
    }

    let wantX = 0, wantZ = 0, spd = 0, face = null;
    switch (this.state) {
      case 'idle': {
        if (this.aggro) { this.setState('chase'); break; }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 3 + Math.random() * 5;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 8;
          this.wanderTarget = Math.random() < 0.6 ? [this.home.x + Math.cos(a) * r, this.home.z + Math.sin(a) * r] : null;
        }
        if (this.wanderTarget) {
          const wx = this.wanderTarget[0] - this.pos.x, wz = this.wanderTarget[1] - this.pos.z;
          const l = Math.hypot(wx, wz);
          if (l > 0.6) { wantX = wx / l; wantZ = wz / l; spd = def.walk; face = Math.atan2(wx, wz); }
          else this.wanderTarget = null;
        }
        break;
      }
      case 'chase': {
        if (!this.aggro) { this.setState('idle'); break; }
        face = angTo;
        const keep = this.bossDef && this.bossDef.name === 'witch' ? 8 : 0;
        if (this.isBoss) {
          if (this.stateT > 0.5 && (d < this.reach + 1.2 || this.bossDef.name === 'witch' || (d > 9 && this.stateT > 1.2))) this._bossChoose(d);
        } else if (d < this.reach + 0.2 && this.stateT > 0.25) {
          this.setState('windup');
          break;
        }
        if (d > keep + 0.5) { wantX = toX / d; wantZ = toZ / d; spd = d > 5 ? def.run : def.run * 0.7; }
        else if (keep && d < keep - 1) { wantX = -toX / d; wantZ = -toZ / d; spd = def.walk * 1.5; }
        if (this.bossDef && this.bossDef.name === 'witch') spd *= 0.6;
        // Separation from other enemies
        for (const e of this.mgr.list) {
          if (e === this) continue;
          const sx = this.pos.x - e.pos.x, sz = this.pos.z - e.pos.z;
          const sd = Math.hypot(sx, sz);
          if (sd < 1.6 && sd > 0.01) { wantX += (sx / sd) * 0.6; wantZ += (sz / sd) * 0.6; }
        }
        break;
      }
      case 'windup': {
        face = this.stateT < def.windup * 0.7 ? angTo : null;
        const wu = (this.move === 'slam' ? 1.3 : this.move === 'charge' ? 0.7 : 1) * (this.isBoss ? 1.2 : 1) * def.windup;
        if (this.stateT >= wu) {
          this.setState('strike');
          this.struck = false;
          if (def.lunge || this.move === 'lunge') this.vel.set(Math.sin(this.facing) * (def.lunge || 12), 3, Math.cos(this.facing) * (def.lunge || 12));
          if (this.move === 'charge') this.chargeT = 0.9;
          game.audio.play(this.isBoss ? 'swingHeavy' : 'swing', this.pos);
        }
        break;
      }
      case 'strike': {
        if (this.move === 'charge') {
          this.chargeT -= dt;
          wantX = Math.sin(this.facing); wantZ = Math.cos(this.facing); spd = 13;
          if (!this.struck && d < this.reach) { this.struck = true; p.hurt(this.dmg * 0.8, this.pos); game.shake(0.5); }
          if (this.chargeT <= 0) this.setState('recover');
          break;
        }
        if (!this.struck && this.stateT >= def.strike * 0.5) {
          this.struck = true;
          this._resolveStrike();
        }
        if (this.stateT >= def.strike) this.setState('recover');
        break;
      }
      case 'cast': {
        face = angTo;
        if (this.move === 'volley' && this.stateT > 0.6 && !this.struck) {
          this.struck = true;
          for (let i = -1; i <= 1; i++) game.enemyProjectile(this.pos, angTo + i * 0.25, this.dmg * 0.6);
        }
        if (this.move === 'nova' && this.stateT > 1.1 && !this.struck) {
          this.struck = true;
          game.fx.ring(this.pos.x, this.feetY + 0.2, this.pos.z, 7, 0xff6a20);
          if (d < 7) p.hurt(this.dmg * 1.1, this.pos);
          game.shake(0.4);
        }
        if (this.stateT > 1.6) this.setState('recover');
        break;
      }
      case 'recover': {
        const rec = def.recover * (this.isBoss ? 0.8 : 1);
        if (this.stateT >= rec) this.setState(this.aggro ? 'chase' : 'idle');
        break;
      }
      case 'stagger': {
        if (this.stateT >= 0.7) this.setState(this.aggro ? 'chase' : 'idle');
        break;
      }
      default: break;
    }

    // ---- movement ----
    const l = Math.hypot(wantX, wantZ);
    if (l > 0.01) { wantX /= l; wantZ /= l; }
    const grounded = this.grounded || def.float;
    const acc = grounded ? 10 : 1.5;
    this.vel.x += (wantX * spd - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (wantZ * spd - this.vel.z) * Math.min(1, acc * dt);
    if (def.float) {
      const gy = game.gen.height(this.pos.x, this.pos.z) + this.halfH + this.radius + 0.05;
      this.vel.y = (gy - this.pos.y) * 4;
    } else this.vel.y -= 22 * dt;
    if (face !== null) this.facing = approachAngle(this.facing, face, dt * (this.isBoss ? 3.2 : 7));

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    const ctrl = game.physics.controller;
    ctrl.computeColliderMovement(this.collider, desired, undefined, GROUPS.enemy);
    const mv = ctrl.computedMovement();
    this.grounded = ctrl.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    const t = this.body.translation();
    let nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    const gh = game.gen.height(nx, nz);
    if (ny < gh - 2) ny = gh + this.halfH + this.radius + 0.2;
    if (ny < WORLD.WATER - 3) { this.die(0, 0, true); return; }
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.pos.set(nx, ny, nz);
    this.speed = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);

    // ---- visuals ----
    this.root.position.set(nx, this.feetY, nz);
    this.root.rotation.y = this.facing;
    const st = this.state;
    const action = st === 'windup' ? 'windup' : st === 'strike' ? 'strike' : st === 'stagger' ? 'hit' : st === 'cast' ? 'cast' : 'none';
    const dur = st === 'windup' ? def.windup : st === 'strike' ? def.strike : st === 'stagger' ? 0.7 : st === 'cast' ? 1.2 : 1;
    this.rig.animate(dt, { speed: this.speed, grounded: true, action, t: this.stateT / dur, combo: 2 });
    this.rig.flash(this.flashT + (st === 'windup' && this.isBoss ? 0.25 + 0.25 * Math.sin(this.stateT * 30) : 0));
  }

  _bossChoose(d) {
    const moves = this.bossDef.moves;
    let m = moves[this.moveIdx++ % moves.length];
    if (this.bossDef.name === 'witch') {
      if (d < 4.5) m = 'nova';
      else if (m === 'nova') m = 'volley';
    } else {
      if (m === 'charge' && d < 6) m = 'swing';
      if (m !== 'charge' && d > this.reach + 1.5) m = 'charge';
    }
    if (m === 'howl') {
      if (!this.howled) {
        this.howled = true;
        this.game.ui.toast(`${this.name.split(',')[0]} howls. The pack answers.`);
        this.game.audio.play('howl', this.pos);
        for (let i = 0; i < 2; i++) this.mgr.spawn('wolf', this.pos.x + (i ? 4 : -4), this.pos.z + 3, { level: this.level, locId: this.locId }).aggro = true;
      }
      m = 'lunge';
    }
    if (m === 'blink') {
      const a = Math.random() * Math.PI * 2;
      const nx = this.game.player.pos.x + Math.cos(a) * 10, nz = this.game.player.pos.z + Math.sin(a) * 10;
      this.game.fx.burst(this.pos.x, this.pos.y, this.pos.z, 0x331410, 20, 3);
      const ny = this.game.gen.height(nx, nz) + 2;
      this.body.setTranslation({ x: nx, y: ny, z: nz }, true);
      this.pos.set(nx, ny, nz);
      this.setState('recover');
      return;
    }
    this.move = m;
    if (m === 'volley' || m === 'nova') { this.setState('cast'); this.struck = false; }
    else this.setState('windup');
  }

  _resolveStrike() {
    const p = this.game.player;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    if (this.move === 'slam') {
      const cx = this.pos.x + fx * this.reach * 0.7, cz = this.pos.z + fz * this.reach * 0.7;
      this.game.fx.ring(cx, this.feetY + 0.1, cz, 5.5, 0xb0a090);
      this.game.fx.debris(cx, this.feetY + 0.3, cz, 0x4a4540, 8);
      this.game.shake(0.6);
      if (dist2(cx, cz, p.pos.x, p.pos.z) < 5.5) p.hurt(this.dmg * 1.25, { x: cx, z: cz });
      this.game.explodeImpulse(cx, this.feetY, cz, 6, 8);
      return;
    }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const ang = Math.abs(angleWrap(Math.atan2(dx, dz) - this.facing));
    if (d < this.reach + 0.4 && ang < 1.1 && Math.abs(p.pos.y - this.pos.y) < 2.5 * this.scale) {
      p.hurt(this.dmg * (0.9 + Math.random() * 0.2), this.pos);
    }
  }

  damage(amount, fx, fz, poise = 1, effect = null) {
    if (this.dead) return;
    const game = this.game;
    this.hp -= amount;
    this.flashT = 1;
    this.aggro = true;
    if (this.isBoss) game.onBossAggro(this);
    if (effect === 'burn') this.burn = 3;
    game.fx.number(this.pos.x, this.pos.y + 1.2 * this.scale, this.pos.z, Math.round(amount));
    game.fx.burst(this.pos.x, this.pos.y + 0.3, this.pos.z, this.def.rig === 'wraith' ? 0x9aa6c8 : 0x6a1a14, 6, 2.5);
    game.audio.play('hit', this.pos);
    if (!this.isBoss) {
      this.vel.x += fx * 3.5;
      this.vel.z += fz * 3.5;
    }
    this.poiseDmg += amount * poise * 0.6;
    const poiseMax = this.def.poise * (this.isBoss ? 9 : 1) * (1 + (this.level - 1) * 0.2);
    if (this.poiseDmg > poiseMax && this.state !== 'strike') {
      this.poiseDmg = 0;
      this.setState('stagger');
    }
    if (this.hp <= 0) this.die(fx, fz);
  }

  die(fx, fz, silent = false) {
    if (this.dead) return;
    this.dead = true;
    const game = this.game;
    this.mgr.remove(this, true);
    if (!silent) {
      game.onEnemyKilled(this);
      this._corpse(fx, fz);
    } else game.scene.remove(this.root);
  }

  _corpse(fx, fz) {
    const game = this.game;
    const wrap = new THREE.Group();
    const cy = this.def.rig === 'wolf' ? 0.7 : 0.95;
    this.root.position.set(0, -cy * this.scale, 0);
    this.root.rotation.set(0, 0, 0);
    wrap.add(this.root);
    wrap.position.set(this.pos.x, this.feetY + cy * this.scale, this.pos.z);
    wrap.rotation.y = this.facing;
    game.scene.add(wrap);
    this.rig.flash(0);
    const q = wrap.quaternion;
    const body = game.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(wrap.position.x, wrap.position.y, wrap.position.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.3).setAngularDamping(0.6),
    );
    const s = this.scale;
    const cd = this.def.rig === 'wolf' ? R.ColliderDesc.cuboid(0.25 * s, 0.3 * s, 0.6 * s) : R.ColliderDesc.cuboid(0.28 * s, 0.85 * s, 0.18 * s);
    game.physics.world.createCollider(cd.setDensity(1).setFriction(0.9).setCollisionGroups(GROUPS.debris), body);
    const m = body.mass();
    body.applyImpulse({ x: fx * 4 * m, y: 2.2 * m, z: fz * 4 * m }, true);
    body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.8, y: 0, z: (Math.random() - 0.5) * m * 0.8 }, true);
    game.addCorpse({ body, mesh: wrap, t: 0, life: this.isBoss ? 30 : 8 });
  }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.wildTimer = 4;
  }

  spawn(type, x, z, opts = {}) {
    const e = new Enemy(this, type, x, z, opts);
    this.list.push(e);
    return e;
  }

  remove(e, keepMesh = false) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (!keepMesh) this.game.scene.remove(e.root);
    this.game.physics.removeBody(e.body);
    if (this.game.activeBoss === e) this.game.onBossReset(e, true);
  }

  clear() {
    for (const e of [...this.list]) this.remove(e);
  }

  spawnForLocation(rt) {
    const { game } = this;
    const loc = rt.loc;
    const lvl = game.gen.dangerAt(loc.x, loc.z);
    const night = game.sky.isNight;
    for (const s of rt.b.spawns) {
      if (s.nightOnly && !night) continue;
      const elite = loc.kind === 'major' && Math.random() < 0.12;
      this.spawn(s.type, s.x, s.z, { level: lvl, locId: loc.id, elite, nightOnly: s.nightOnly });
    }
    if (loc.kind === 'major' && !game.state.bosses.has(loc.id) && rt.b.bossSpawn) {
      const bs = rt.b.bossSpawn;
      this.spawn(loc.bossKind === 'beast' ? 'wolf' : 'hollow', bs.x, bs.z, { boss: loc.bossKind, level: lvl, locId: loc.id, name: loc.bossName });
    }
    // Night brings wraiths to ruins
    if (night && loc.kind === 'major') {
      for (let i = 0; i < 2; i++) this.spawn('wraith', loc.x + (Math.random() - 0.5) * 30, loc.z + (Math.random() - 0.5) * 30, { level: lvl, locId: loc.id, nightOnly: true });
    }
  }

  despawnForLocation(locId) {
    for (const e of [...this.list]) {
      if (e.locId === locId && !e.aggro) this.remove(e);
    }
  }

  softTarget(pos, ax, az, range) {
    let best = null, bestScore = Infinity;
    for (const e of this.list) {
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      const dot = (dx * ax + dz * az) / (d || 1);
      if (dot < 0.2 && d > 1.2) continue;
      const score = d * (2 - dot);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  update(dt) {
    for (const e of [...this.list]) if (!e.dead) e.update(dt);
    this._wild(dt);
  }

  _wild(dt) {
    const game = this.game;
    const p = game.player;
    this.wildTimer -= dt;
    // Despawn far wild enemies
    for (const e of [...this.list]) {
      if (e.wild && dist2(e.pos.x, e.pos.z, p.pos.x, p.pos.z) > 110) this.remove(e);
    }
    if (this.wildTimer > 0 || p.dead) return;
    const night = game.sky.isNight;
    this.wildTimer = night ? 7 : 12;
    const wildCount = this.list.filter((e) => e.wild).length;
    const cap = night ? 7 : 4;
    if (wildCount >= cap) return;
    // Never spawn right next to a shrine
    if (game.locations.nearestFireDist(p.pos.x, p.pos.z, ['shrine']) < 40) return;
    const a = Math.random() * Math.PI * 2;
    const r = 45 + Math.random() * 25;
    const x = clamp(p.pos.x + Math.cos(a) * r, -WORLD.PLAYABLE, WORLD.PLAYABLE);
    const z = clamp(p.pos.z + Math.sin(a) * r, -WORLD.PLAYABLE, WORLD.PLAYABLE);
    const h = game.gen.height(x, z);
    if (h < 0.5) return;
    const biome = game.gen.biomeAt(x, z, h);
    const lvl = game.gen.dangerAt(x, z);
    let type = 'hollow', n = 1;
    if (biome === 'forest' || biome === 'moor') { if (Math.random() < 0.55) { type = 'wolf'; n = 2 + Math.floor(Math.random() * 2); } }
    else if (biome === 'blight') type = Math.random() < 0.5 ? 'wraith' : 'hollow';
    else if (biome === 'crags' || biome === 'frost') type = Math.random() < 0.5 ? 'skeleton' : 'wolf';
    if (night && Math.random() < 0.4) { type = 'wraith'; n = 1; }
    for (let i = 0; i < n; i++) this.spawn(type, x + i * 2, z + (i % 2) * 2, { level: lvl, wild: true, nightOnly: type === 'wraith' && night });
  }

  // Dread pressure from nearby wraiths
  dreadAura(pos) {
    let a = 0;
    for (const e of this.list) {
      if (!e.def.dreadAura) continue;
      const d = dist2(e.pos.x, e.pos.z, pos.x, pos.z);
      if (d < 15) a += e.def.dreadAura * (1 - d / 15);
    }
    return a;
  }

  bossDrops(kind) {
    return BOSS_DROPS[kind] || [];
  }
}
