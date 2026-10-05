// Your Minecraft inventory: 36 slots (the bottom row is the hotbar), and the
// screen that shows it. Crafting works like Minecraft's recipe book: it lists
// what you can make from what you carry, from Minecraft's own recipes. Small
// recipes work anywhere; 3x3 ones need a crafting table nearby; smelting
// needs a furnace. A fourth tab turns Minecraft materials into Pokémon items.
import { POKE_RECIPES } from './items.js';

const $ = (id) => document.getElementById(id);
const PRIORITY = ['crafting_table', 'stick', 'torch', 'furnace', 'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe',
  'wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'wooden_axe', 'stone_axe', 'iron_axe', 'wooden_shovel', 'stone_shovel',
  'iron_shovel', 'fishing_rod', 'chest', 'white_bed', 'red_bed', 'bread', 'glass_bottle', 'red_dye', 'stone_button', 'bucket', 'ladder'];

export class Inventory {
  constructor(opts) {
    this.o = opts; // { items, recipes, icon(id) -> css, giveItem(name, n), nearTable(), nearFurnace(), say(text), onChange() }
    this.slots = Array(36).fill(null);
    this.sel = 0;
    this.fuel = 0;
    this.open = false;
    this.tab = 'bag';
    this.pick = -1; // slot picked up in the bag view
    this.bind();
  }

  // ---------------------------------------------------------------- model
  get held() { const s = this.slots[this.sel]; return s ? s.id : null; }
  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.n; return n; }
  countAny(ids) { let n = 0; for (const id of ids) n += this.count(id); return n; }

  /// Add items; returns how many didn't fit.
  add(id, n = 1) {
    const max = this.o.items.maxStack(id);
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
    // Empty slots: hotbar first, then the rest.
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(n, max); this.slots[i] = { id, n: k }; n -= k; }
    }
    this.changed();
    return n;
  }

  remove(id, n = 1) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n, s.n);
      s.n -= k; n -= k;
      if (!s.n) this.slots[i] = null;
    }
    this.changed();
    return n === 0;
  }

  /// Use one of the held item (placing a block, eating).
  useHeld() {
    const s = this.slots[this.sel];
    if (!s) return null;
    s.n--;
    if (!s.n) this.slots[this.sel] = null;
    this.changed();
    return s.id;
  }

  changed() { if (this.o.onChange) this.o.onChange(); if (this.open) this.render(); }

  save() { return { slots: this.slots.map((s) => (s ? [s.id, s.n] : null)), sel: this.sel, fuel: this.fuel }; }
  load(d) {
    if (!d) return;
    this.slots = (d.slots || []).concat(Array(36).fill(null)).slice(0, 36).map((s) => (s ? { id: s[0], n: s[1] } : null));
    this.sel = d.sel || 0;
    this.fuel = d.fuel || 0;
  }

  // ---------------------------------------------------------------- crafting
  enough(ings) { return ings.every(([alts, n]) => this.countAny(alts) >= n); }

  take(ings) {
    for (const [alts, n] of ings) {
      let left = n;
      for (const id of alts) {
        const k = Math.min(left, this.count(id));
        if (k) { this.remove(id, k); left -= k; }
        if (!left) break;
      }
    }
  }

  craft(r) {
    if (!this.enough(r.in)) return false;
    this.take(r.in);
    const left = this.add(r.out, r.n);
    if (left) this.o.say(`No room for ${left} ${this.o.items.name(r.out)}.`);
    return true;
  }

  smelt(r) {
    if (!this.enough(r.in)) return false;
    if (this.fuel < 1) {
      // Burn the cheapest fuel you carry.
      const fuels = this.slots.filter(Boolean).map((s) => s.id).filter((id, i, a) => a.indexOf(id) === i && this.o.items.fuel(id) > 0)
        .sort((a, b) => this.o.items.fuel(a) - this.o.items.fuel(b));
      const pick = fuels.find((id) => !r.in[0][0].includes(id) || this.count(id) > 1);
      if (!pick) { this.o.say('The furnace needs fuel: coal, charcoal, planks or logs.'); return false; }
      this.remove(pick, 1);
      this.fuel += this.o.items.fuel(pick);
    }
    this.fuel -= 1;
    this.take(r.in);
    this.add(r.out, r.n);
    return true;
  }

  pokeCraft(r) {
    const ings = r.in.map(([id, n]) => [[id], n]);
    if (!this.enough(ings)) return false;
    if (!this.o.giveItem(r.out, r.n)) { this.o.say('Your POKéMON bag is full.'); return false; }
    this.take(ings);
    this.o.say(`${r.n} ${r.label} went into your POKéMON bag.`);
    return true;
  }

  // ---------------------------------------------------------------- screen
  bind() {
    $('inv-close').addEventListener('click', () => this.hide());
    for (const b of document.querySelectorAll('#inv-tabs button')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.pick = -1; this.render(); });
    $('inv-drop').addEventListener('click', () => {
      if (this.pick < 0 || !this.slots[this.pick]) return;
      this.o.say(`Dropped ${this.slots[this.pick].n} ${this.o.items.name(this.slots[this.pick].id)}.`);
      this.slots[this.pick] = null;
      this.pick = -1;
      this.changed();
    });
  }

  show(tab) {
    this.open = true;
    this.tab = tab || (this.o.nearFurnace() ? 'furnace' : 'bag');
    this.pick = -1;
    $('inv').hidden = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.render();
  }

  hide() { this.open = false; $('inv').hidden = true; this.pick = -1; }

  slotEl(i) {
    const s = this.slots[i];
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'islot' + (i === this.pick ? ' picked' : '') + (i === this.sel && i < 9 ? ' held' : '');
    if (s) {
      d.style.cssText = this.o.icon(s.id);
      d.innerHTML = s.n > 1 ? `<span>${s.n}</span>` : '';
      d.title = this.o.items.name(s.id);
    }
    d.addEventListener('click', () => this.tapSlot(i));
    return d;
  }

  tapSlot(i) {
    if (this.pick < 0) {
      if (!this.slots[i]) { if (i < 9) { this.sel = i; this.changed(); } return; }
      this.pick = i;
    } else if (this.pick === i) {
      this.pick = -1;
    } else {
      const a = this.slots[this.pick], b = this.slots[i];
      if (a && b && a.id === b.id) {
        const max = this.o.items.maxStack(a.id);
        const k = Math.min(a.n, max - b.n);
        b.n += k; a.n -= k;
        if (!a.n) this.slots[this.pick] = null;
      } else {
        this.slots[i] = a; this.slots[this.pick] = b;
      }
      this.pick = -1;
      if (i < 9) this.sel = i;
    }
    this.changed();
  }

  render() {
    const tabs = document.querySelectorAll('#inv-tabs button');
    const furnace = this.o.nearFurnace();
    for (const b of tabs) {
      b.classList.toggle('on', b.dataset.tab === this.tab);
      if (b.dataset.tab === 'furnace') b.hidden = !furnace;
    }
    if (this.tab === 'furnace' && !furnace) this.tab = 'bag';
    const body = $('inv-body');
    body.innerHTML = '';
    const info = $('inv-info');
    if (this.tab === 'bag') {
      const grid = document.createElement('div');
      grid.className = 'igrid';
      for (let i = 9; i < 36; i++) grid.appendChild(this.slotEl(i));
      const bar = document.createElement('div');
      bar.className = 'igrid hotrow';
      for (let i = 0; i < 9; i++) bar.appendChild(this.slotEl(i));
      body.append(grid, bar);
      const p = this.slots[this.pick];
      info.textContent = p ? `${this.o.items.name(p.id)} ×${p.n}. Tap another slot to move it there.` : 'Tap an item to pick it up, then tap where it should go. The bottom row is your hotbar.';
      $('inv-drop').hidden = !p;
    } else {
      $('inv-drop').hidden = true;
      const list = this.tab === 'craft' ? this.craftList() : this.tab === 'furnace' ? this.smeltList() : this.pokeList();
      for (const row of list) body.appendChild(row);
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'iempty';
        p.textContent = this.tab === 'craft' ? 'Nothing to craft yet. Punch a tree (hold MINE on a log) for wood.' : this.tab === 'furnace' ? 'Nothing here smelts. Raw ore, sand, food and logs do.' : 'Nothing yet.';
        body.appendChild(p);
      }
      info.textContent = this.tab === 'craft'
        ? (this.o.nearTable() ? 'At a crafting table: every recipe.' : 'Small recipes only. Stand by a CRAFTING TABLE for 3x3 recipes like tools.')
        : this.tab === 'furnace' ? `Furnace fuel: ${Math.floor(this.fuel)} item${Math.floor(this.fuel) === 1 ? '' : 's'} left. Coal smelts 8.`
          : 'Minecraft materials made into POKéMON items. They go into your POKéMON bag (START → ITEM).';
    }
  }

  recipeRow(outId, n, label, ings, ok, onTap, need) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'irow' + (ok ? '' : ' off');
    const ic = document.createElement('i');
    ic.className = 'iicon';
    if (outId) ic.style.cssText = this.o.icon(outId);
    else ic.classList.add('poke');
    const t = document.createElement('b');
    t.textContent = `${label}${n > 1 ? ' ×' + n : ''}`;
    const req = document.createElement('small');
    req.textContent = need || ings.map(([alts, k]) => `${k} ${this.o.items.name(alts[0])}${alts.length > 1 ? '*' : ''}`).join(' + ');
    row.append(ic, t, req);
    if (ok) row.addEventListener('click', () => { onTap(); this.render(); });
    return row;
  }

  craftList() {
    const table = this.o.nearTable();
    const seen = new Set(), rows = [], later = [];
    const recipes = this.o.recipes.filter((r) => r.g === 2 || r.g === 3);
    for (const r of recipes) {
      if (seen.has(r.out)) continue;
      const ok = this.enough(r.in) && (r.g === 2 || table);
      const partial = r.in.some(([alts]) => this.countAny(alts) > 0);
      if (!ok && !partial) continue;
      // The best recipe for this result: one you can make, if any.
      const best = ok ? r : recipes.find((x) => x.out === r.out && this.enough(x.in) && (x.g === 2 || table)) || r;
      const can = this.enough(best.in) && (best.g === 2 || table);
      seen.add(r.out);
      const need = !can && best.g === 3 && !table && this.enough(best.in) ? 'Needs a CRAFTING TABLE' : null;
      const row = this.recipeRow(best.out, best.n, this.o.items.name(best.out), best.in, can, () => this.craft(best), need);
      (can ? rows : later).push([PRIORITY.indexOf(best.out), row]);
    }
    const order = (a, b) => (a[0] < 0 ? 999 : a[0]) - (b[0] < 0 ? 999 : b[0]);
    rows.sort(order); later.sort(order);
    return [...rows, ...later.slice(0, 24)].map((x) => x[1]);
  }

  smeltList() {
    const out = [], seen = new Set();
    for (const r of this.o.recipes.filter((x) => x.g === 'furnace')) {
      const key = r.out + '|' + r.in[0][0].join();
      if (seen.has(key) || !this.enough(r.in)) continue;
      seen.add(key);
      const src = r.in[0][0].find((id) => this.count(id) > 0);
      out.push(this.recipeRow(r.out, r.n, this.o.items.name(r.out), [[[src], 1]], true, () => this.smelt({ ...r, in: [[[src], 1]] })));
    }
    return out;
  }

  pokeList() {
    return POKE_RECIPES.map((r) => {
      const ings = r.in.map(([id, n]) => [[id], n]);
      return this.recipeRow(null, r.n, r.label, ings, this.enough(ings), () => this.pokeCraft(r));
    });
  }
}
