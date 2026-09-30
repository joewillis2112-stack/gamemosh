// The wanderer: movement, combat, stamina, rolling, flasks, torch, fall damage.
import * as THREE from 'three';
import { R, GROUPS, G, groups } from '../physics.js';
import { PLAYER, WORLD } from '../config.js';
import { ITEMS } from '../items.js';
import { clamp, approachAngle, angleWrap, dist2 } from '../core/util.js';
import { HumanoidRig } from './models.js';

const HIT_FILTER = groups(0xffff, G.ENEMY | G.PROP | G.STATIC);

export class Player {
  constructor(game) {
    this.game = game;
    const { physics } = game;
    this.rig = new HumanoidRig({ hood: true, cloak: true, colors: { torso: 0x5a4a3c, legs: 0x3a322b, cloak: 0x4a3f3a, hood: 0x3e3533, skin: 0x8a7462 } });
    this.root = this.rig.root;
    game.scene.add(this.root);
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 50, 0));
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius).setCollisionGroups(GROUPS.player),
      this.body,
    );
    physics.info.set(this.collider.handle, { kind: 'player' });
    this.pos = new THREE.Vector3(0, 50, 0);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.grounded = false;
    this.action = 'none';
    this.actionT = 0;
    this.actionDur = 0;
    this.combo = 0;
    this.queued = false;
    this.heavy = false;
    this.swingHit = false;
    this.hitSet = new Set();
    this.iframes = 0;
    this.staminaDelay = 0;
    this.airTime = 0;
    this.minVy = 0;
    this.regen = 0;
    this.hurtCooldown = 0;
    this.charging = false;
    this.torchLight = new THREE.PointLight(0xffa050, 0, 18, 1.4);
    game.scene.add(this.torchLight);
    this.speedNow = 0;
    this.dead = false;
  }

  get s() {
    return this.game.state.player;
  }

  // ---- derived stats ----
  get maxHp() { return PLAYER.baseHp + (this.s.stats.vigor - 1) * 14; }
  get maxStamina() { return PLAYER.baseStamina + (this.s.stats.endurance - 1) * 9; }
  get weaponId() { return this.game.state.equip.weapon; }
  get weapon() { return ITEMS[this.weaponId] || ITEMS.rusted_sword; }
  get weaponLvl() { return this.game.state.weaponLvl[this.weaponId] || 0; }
  get armor() { return ITEMS[this.game.state.equip.armor] || ITEMS.tattered_cloak; }
  get charm() { return this.game.state.equip.charm; }
  get damageMul() {
    return (1 + (this.s.stats.might - 1) * 0.07) * (1 + this.weaponLvl * 0.14) * (this.charm === 'bone_talisman' ? 1.15 : 1);
  }
  get moveMul() { return this.charm === 'wolf_fang' ? 1.1 : 1; }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.vel.set(0, 0, 0);
    this.minVy = 0;
    this.airTime = 0;
  }

  busy() {
    return this.action === 'attack' || this.action === 'roll' || this.action === 'flask' || this.action === 'hit' || this.action === 'throw';
  }

  startAction(name, dur) {
    this.action = name;
    this.actionT = 0;
    this.actionDur = dur;
  }

  useStamina(n) {
    this.s.stamina = Math.max(0, this.s.stamina - n);
    this.staminaDelay = 0.7;
  }

  update(dt, input, camYaw) {
    const game = this.game;
    const s = this.s;
    if (this.dead) {
      this.rig.animate(dt, { speed: 0, grounded: true, action: 'dead' });
      return;
    }
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    if (this.actionDur > 0) {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) this._endAction();
    }

    // ---- input → intent ----
    const mx = input.move.x, my = input.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dirX = fx * my + rx * mx, dirZ = fz * my + rz * mx;
    const dl = Math.hypot(dirX, dirZ);
    if (dl > 0.001) { dirX /= dl; dirZ /= dl; }

    const deep = this.pos.y < WORLD.WATER - 0.6;
    const canAct = !this.busy();

    // Attack: tap = light, hold = heavy
    if (input.consume('attack')) {
      if (this.action === 'attack' && this.actionT > 0.45) this.queued = true;
      else if (canAct) this.charging = true;
    }
    if (this.charging) {
      if (!input.isHeld('attack')) {
        this.charging = false;
        if (!this.busy()) this._startAttack(false, dirX, dirZ, dl);
      } else if (input.holdTime('attack') > 0.32) {
        this.charging = false;
        if (!this.busy()) this._startAttack(true, dirX, dirZ, dl);
      }
    }
    if (input.consume('heavy') && canAct) this._startAttack(true, dirX, dirZ, dl);

    if (input.consume('dodge') && (canAct || (this.action === 'attack' && this.actionT > 0.6)) && s.stamina > 5 && !deep) {
      this.useStamina(PLAYER.rollCost * (1 + (this.armor.weight || 0)));
      const rdx = dl > 0.01 ? dirX : Math.sin(this.facing);
      const rdz = dl > 0.01 ? dirZ : Math.cos(this.facing);
      this.facing = Math.atan2(rdx, rdz);
      this.startAction('roll', PLAYER.rollTime * (1 + (this.armor.weight || 0)));
      this.iframes = PLAYER.iframes;
      this.rollDir = [rdx, rdz];
      game.audio.play('roll');
    }
    if (input.consume('jump') && canAct && this.grounded && s.stamina > 5 && !deep) {
      this.vel.y = PLAYER.jump;
      this.grounded = false;
      this.useStamina(PLAYER.jumpCost);
    }
    if (input.consume('flask') && canAct) {
      if (s.flasks > 0) {
        s.flasks--;
        this.startAction('flask', 1.1);
        this.flaskDone = false;
        game.audio.play('drink');
      } else game.ui.toast('Your flask is empty. Rest at a shrine to refill it.');
    }
    if (input.consume('throw') && canAct) {
      if (game.hasItem('firebomb')) {
        game.takeItem('firebomb', 1);
        this.startAction('throw', 0.45);
        this.thrown = false;
      } else game.ui.toast('No firebombs. Craft them at a fire from resin, cloth and bone.');
    }
    if (input.consume('torch')) this.toggleTorch();
    if (input.consume('interact')) game.tryInteract();

    // ---- movement ----
    let speed = 0;
    let tx = 0, tz = 0;
    if (this.action === 'roll') {
      const k = 1 - this.actionT * 0.5;
      speed = PLAYER.rollSpeed * k / (1 + (this.armor.weight || 0));
      tx = this.rollDir[0]; tz = this.rollDir[1];
    } else if (dl > 0.01) {
      const sprint = input.sprinting && s.stamina > 1 && this.action === 'none' && !deep;
      let base = sprint ? PLAYER.sprint : PLAYER.walk * Math.max(0.35, mag);
      if (sprint) { s.stamina -= PLAYER.sprintCost * dt; this.staminaDelay = 0.4; }
      if (this.action === 'attack') base *= 0.15;
      if (this.action === 'flask' || this.charging) base *= 0.35;
      if (this.action === 'hit' || this.action === 'throw') base *= 0.1;
      if (deep) base *= 0.45;
      speed = base * this.moveMul;
      tx = dirX; tz = dirZ;
      if (this.action !== 'attack') this.facing = approachAngle(this.facing, Math.atan2(dirX, dirZ), dt * 12);
    }
    if (this.action === 'attack' && this.lunge > 0) {
      speed = Math.max(speed, this.lunge * (1 - this.actionT));
      tx = Math.sin(this.facing); tz = Math.cos(this.facing);
    }
    const accel = this.grounded ? 14 : 3;
    this.vel.x += (tx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tz * speed - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= PLAYER.gravity * dt;
    if (deep) this.vel.y = Math.max(this.vel.y, -2);

    // Collide and slide against the world
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    const ctrl = game.physics.controller;
    ctrl.computeColliderMovement(this.collider, desired, undefined, GROUPS.player);
    const mv = ctrl.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = ctrl.computedGrounded();
    const t = this.body.translation();
    let nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    const lim = WORLD.PLAYABLE;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) {
      nx = clamp(nx, -lim, lim); nz = clamp(nz, -lim, lim);
      if (!this._edgeWarned) { game.ui.toast('The Gloam is too thick to pass. There is nothing beyond but grey.'); this._edgeWarned = true; }
    } else this._edgeWarned = false;
    // Safety net: never fall through the ground
    const gh = game.gen.height(nx, nz);
    if (ny < gh - 2) { ny = gh + 1; this.vel.y = 0; }
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.pos.set(nx, ny, nz);

    if (this.grounded) {
      if (!wasGrounded && this.minVy < -15 && !deep) {
        const dmg = Math.round((-this.minVy - 15) * 7);
        if (dmg > 0) this.hurt(dmg, null, 'fall');
      }
      this.minVy = 0;
      if (this.vel.y < 0) this.vel.y = -1;
      this.airTime = 0;
    } else {
      this.airTime += dt;
      this.minVy = Math.min(this.minVy, this.vel.y);
    }
    // Ceiling / wall stop
    if (mv.y > desired.y + 0.001 && this.vel.y > 0 === false) { /* landed on slope */ }
    if (desired.y > 0 && mv.y < desired.y * 0.5) this.vel.y = Math.min(this.vel.y, 0);

    this.speedNow = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);

    // ---- action effects ----
    if (this.action === 'attack' && !this.swingHit && this.actionT >= (this.heavy ? 0.55 : 0.4)) {
      this.swingHit = true;
      this._sweep();
    }
    if (this.action === 'flask' && !this.flaskDone && this.actionT > 0.6) {
      this.flaskDone = true;
      s.hp = Math.min(this.maxHp, s.hp + this.maxHp * 0.45 + (s.flaskLvl || 0) * 8);
      game.fx.burst(this.pos.x, this.pos.y + 1, this.pos.z, 0xffa040, 14, 2);
    }
    if (this.action === 'throw' && !this.thrown && this.actionT > 0.5) {
      this.thrown = true;
      game.throwFirebomb(this.pos, camYaw, game.cameraPitch);
    }

    // ---- stamina / regen ----
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.action !== 'roll') {
      const rate = PLAYER.staminaRegen * (this.charm === 'ember_locket' ? 1.3 : 1) * (this.action === 'none' ? 1 : 0.4);
      s.stamina = Math.min(this.maxStamina, s.stamina + rate * dt);
    }
    s.stamina = Math.max(0, s.stamina);
    if (this.regen > 0) {
      const r = Math.min(this.regen, 10 * dt);
      s.hp = Math.min(this.maxHp, s.hp + r);
      this.regen -= r;
    }
    if (deep) {
      s.stamina -= 6 * dt;
      if (s.stamina <= 0) this.hurt(10 * dt, null, 'drown', true);
    }

    // ---- torch ----
    if (s.torchOn) {
      s.torchFuel -= dt;
      if (s.torchFuel <= 0) { s.torchFuel = 0; this.toggleTorch(false); game.ui.toast('Your torch gutters out.'); }
    }
    this.torchLight.intensity = s.torchOn ? 9 * (0.92 + 0.08 * Math.sin(performance.now() * 0.02)) : 0;
    this.torchLight.position.set(this.pos.x + Math.sin(this.facing) * 0.4, this.pos.y + 1.6, this.pos.z + Math.cos(this.facing) * 0.4);

    // ---- visuals ----
    this.root.position.set(this.pos.x, this.pos.y - PLAYER.halfHeight - PLAYER.radius, this.pos.z);
    this.root.rotation.y = this.facing;
    this.rig.animate(dt, {
      speed: this.action === 'roll' ? 0 : this.speedNow,
      grounded: this.grounded || this.airTime < 0.15,
      action: this.charging ? 'windup' : this.action === 'throw' ? 'strike' : this.action,
      t: this.charging ? input.holdTime('attack') / 0.32 * 0.5 : this.actionT,
      combo: this.combo,
      heavy: this.heavy,
    });
    this.rig.flash(this.hurtFlash || 0);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt * 4);
  }

  _startAttack(heavy, dirX, dirZ, dl) {
    const w = this.weapon;
    const s = this.s;
    const cost = w.stamina * (heavy ? 1.6 : 1);
    if (s.stamina < 4) { this.game.ui.toast('Too exhausted to swing.', 1.2); return; }
    this.useStamina(cost);
    // Soft lock: face the best enemy near the intended direction
    const aimX = dl > 0.01 ? dirX : Math.sin(this.facing);
    const aimZ = dl > 0.01 ? dirZ : Math.cos(this.facing);
    const target = this.game.enemies.softTarget(this.pos, aimX, aimZ, w.reach + 3);
    if (target) this.facing = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    else if (dl > 0.01) this.facing = Math.atan2(dirX, dirZ);
    this.heavy = heavy;
    this.combo = this.action === 'attack' ? (this.combo + 1) % 3 : 0;
    this.lunge = target && dist2(target.pos.x, target.pos.z, this.pos.x, this.pos.z) > w.reach * 0.8 ? 5 : 1.5;
    this.startAction('attack', (heavy ? 0.95 : 0.6) / w.speed);
    this.swingHit = false;
    this.queued = false;
    this.game.audio.play(heavy ? 'swingHeavy' : 'swing');
  }

  _endAction() {
    const was = this.action;
    this.action = 'none';
    this.actionT = 0;
    this.actionDur = 0;
    if (was === 'attack' && this.queued) {
      this.queued = false;
      this.action = 'attack'; // lets combo counter advance
      this._startAttack(false, 0, 0, 0);
    }
  }

  _sweep() {
    const w = this.weapon;
    const reach = w.reach * (this.heavy ? 1.1 : 1);
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const c = { x: this.pos.x + fx * reach * 0.55, y: this.pos.y + 0.2, z: this.pos.z + fz * reach * 0.55 };
    const dmgBase = w.dmg * this.damageMul * (this.heavy ? 1.75 : 1) * (this.combo === 2 ? 1.2 : 1);
    const found = new Set();
    let any = false;
    // Collect first, act after: the physics world must not change during a query
    this.game.physics.overlapSphere(c, reach * 0.62, HIT_FILTER, (col) => {
      const info = this.game.physics.info.get(col.handle);
      if (info) found.add(info);
      return true;
    });
    for (const info of found) {
      if (info.kind === 'enemy') {
        const e = info.enemy;
        const poise = (w.poise || 1) * (this.heavy ? 2 : 1);
        e.damage(dmgBase * (0.9 + Math.random() * 0.2), fx, fz, poise, w.burn ? 'burn' : null);
        any = true;
      } else if (info.kind === 'prop') {
        this.game.locations.damageProp(info.prop, dmgBase, { x: fx, z: fz }, 'player');
        any = true;
      } else if (info.kind === 'tree') {
        this.game.harvestTree(info, w.model === 'axe');
        any = true;
      } else if (info.kind === 'rock') {
        this.game.harvestRock(info);
        any = true;
      }
    }
    if (any) {
      this.game.hitstop(this.heavy ? 0.09 : 0.05);
      this.game.shake(this.heavy ? 0.35 : 0.18);
    }
  }

  toggleTorch(force) {
    const s = this.s;
    const on = force !== undefined ? force : !s.torchOn;
    if (on && s.torchFuel <= 0) {
      if (this.game.hasItem('torch')) {
        this.game.takeItem('torch', 1);
        s.torchFuel += 240;
      } else { this.game.ui.toast('No torch. Craft one at a fire from wood and cloth.'); return; }
    }
    s.torchOn = on;
    this.rig.setTorch(on);
    this.game.setTorchFlame(on);
  }

  hurt(amount, from, kind = 'hit', silent = false) {
    const s = this.s;
    if (this.dead) return false;
    if (kind === 'hit' && this.iframes > 0) {
      if (!this._dodgeToast || performance.now() - this._dodgeToast > 1500) this._dodgeToast = performance.now();
      return false;
    }
    let dmg = amount;
    if (kind === 'hit') {
      const def = this.armor.def || 0;
      dmg = amount * (1 - def / (def + 40));
    }
    s.hp -= dmg;
    if (!silent) {
      this.hurtFlash = 1;
      this.game.onPlayerHurt(dmg, kind);
      if (from && kind === 'hit') {
        const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
        const l = Math.hypot(dx, dz) || 1;
        this.vel.x += (dx / l) * 5;
        this.vel.z += (dz / l) * 5;
        if (amount > 12 && this.action !== 'roll') { this.startAction('hit', 0.35); this.charging = false; }
      }
    }
    if (s.hp <= 0) {
      s.hp = 0;
      this.dead = true;
      this.action = 'none';
      this.game.onPlayerDeath();
    }
    return true;
  }
}

export { angleWrap };
