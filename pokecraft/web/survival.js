// Minecraft survival, gently: 10 hearts, 10 drumsticks of hunger and a
// breath bar underwater. Falling more than 3 blocks hurts, so does lava and
// running out of air, and so do the monsters that come out at night.
// Eating takes a moment, as in Minecraft. When your hearts run out you wake
// at your bed (you keep your things: a phone game shouldn't take them).

const $ = (id) => document.getElementById(id);
const FPS = 59.7275;

export class Survival {
  constructor(opts) {
    this.o = opts; // { onDeath(cause), flash() }
    this.hp = 20;
    this.food = 20;
    this.air = 300; // ticks of breath
    this.exhaust = 0;
    this.regen = 0;
    this.starve = 0;
    this.drown = 0;
    this.burn = 0;
    this.fallFrom = null;
    this.eating = 0;
    this.hurtCool = 0;
    this.dead = false;
    this.perks = null; // your lead Pokémon's (perks.js)
  }

  save() { return { hp: this.hp, food: this.food }; }
  load(d) { if (d) { this.hp = d.hp ?? 20; this.food = d.food ?? 20; } }

  /// Take `n` half-hearts of damage.
  hurt(n, cause) {
    if (this.dead || n <= 0) return;
    if (this.hurtCool > 0 && cause !== 'starving' && cause !== 'drowning') return;
    if (cause === 'fall' && this.perks && this.perks.noFall) return;
    if (this.perks && this.perks.armour && cause !== 'void') n = Math.max(1, Math.round(n * this.perks.armour));
    this.hurtCool = 0.45;
    this.hp = Math.max(0, this.hp - n);
    this.exhaust += 0.1;
    this.o.flash();
    if (this.hp <= 0) { this.dead = true; this.o.onDeath(cause); }
  }

  heal(n) { this.hp = Math.min(20, this.hp + n); }

  /// Eat: returns true when the food was finished (after 1.6 s of holding).
  eat(points, holding, dt) {
    if (!holding || this.food >= 20) { this.eating = 0; return false; }
    this.eating += dt;
    if (this.eating < 1.6) return false;
    this.eating = 0;
    this.food = Math.min(20, this.food + points);
    return true;
  }

  /// Once per game frame. `p` is the player (pos, vel, onGround, inWater).
  step(dt, p, { headInWater, inLava, sprinting, moving, sunlit }) {
    if (this.dead) return;
    const k = this.perks || {};
    if (this.hurtCool > 0) this.hurtCool -= dt;
    // Falling: damage on landing for every block past 3.
    if (!p.onGround && !p.inWater) {
      if (this.fallFrom === null || p.pos[1] > this.fallFrom) this.fallFrom = p.pos[1];
    } else {
      if (this.fallFrom !== null && p.onGround) {
        const d = this.fallFrom - p.pos[1];
        if (d > 3.4) this.hurt(Math.floor(d - 3), 'fall');
      }
      this.fallFrom = null;
    }
    if (p.inWater) this.fallFrom = null;
    // Breath.
    if (headInWater) {
      this.air = Math.max(-1, this.air - 20 / FPS / (k.breath || 1));
      if (this.air <= 0) { this.drown += dt; if (this.drown >= 1) { this.drown = 0; this.hurt(2, 'drowning'); } }
    } else this.air = Math.min(300, this.air + 100 * dt);
    if (inLava) { this.burn += dt; if (this.burn > 0.5) { this.burn = 0; this.hurtCool = 0; this.hurt(Math.max(1, Math.round(4 * (k.lava || 1))), 'lava'); } }
    // Hunger: moving and sprinting tire you; a full belly heals.
    this.exhaust += dt * (sprinting ? 0.12 : moving ? 0.035 : 0.012) * (k.hunger || 1);
    // A Grass-type lead: sunlight heals, with no hunger cost.
    if (k.sunHeal && sunlit && this.hp < 20) { this.sun = (this.sun || 0) + dt; if (this.sun >= 4) { this.sun = 0; this.heal(1); } }
    if (this.exhaust >= 4) { this.exhaust -= 4; this.food = Math.max(0, this.food - 1); }
    if (this.food >= 18 && this.hp < 20) { this.regen += dt; if (this.regen >= 3) { this.regen = 0; this.heal(1); this.exhaust += 0.6; } }
    if (this.food <= 0) { this.starve += dt; if (this.starve >= 4) { this.starve = 0; if (this.hp > 2) this.hurt(1, 'starving'); } }
  }

  revive() { this.dead = false; this.hp = 20; this.food = Math.max(this.food, 14); this.air = 300; this.fallFrom = null; }

  /// The hearts / hunger / bubbles row above the hotbar.
  render() {
    const row = (full, n, cls) => {
      let s = '';
      for (let i = 0; i < 10; i++) {
        const v = n - i * 2;
        s += `<i class="${cls} ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}"></i>`;
      }
      return s;
    };
    const key = `${this.hp}|${this.food}|${Math.ceil(this.air / 30)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    $('hearts').innerHTML = row(20, this.hp, 'heart');
    $('food').innerHTML = row(20, this.food, 'drum');
    $('air').hidden = this.air >= 300;
    $('air').innerHTML = row(20, Math.max(0, Math.ceil(this.air / 15)), 'bubble');
    $('hearts').classList.toggle('low', this.hp <= 6);
  }
}
