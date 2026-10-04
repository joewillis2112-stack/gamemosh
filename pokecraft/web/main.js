// Pokécraft: Pokémon Red played in an endless Minecraft world.
// Minecraft's world generator (MinecraftOSS, mcgen.wasm) makes the land; the
// page draws it top-down with Minecraft's block textures and walks Red over
// it. Pokémon Red (open-pokered) runs hidden underneath: its START menu,
// text boxes and shops draw over the Minecraft world, and its battles take
// over the screen when a wild Pokémon jumps out of the grass or a Minecraft
// mob catches you.
import initPokered, { PokeredRunner } from 'pokered-runner';
import { WorldGen } from './gen.js';
import { buildBlocks, buildBiomes, Tiles, tintFor, K, NONE, SHOP_RE } from './world.js';
import { wildFor, levelAt, formAt, MOB_POKEMON, HOSTILE } from './encounters.js';

const ASSETS = window.PC_ASSETS;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
const GB = { A: 1, B: 2, SELECT: 4, START: 8, RIGHT: 16, LEFT: 32, UP: 64, DOWN: 128 };
const POKE_HZ = 59.7275;
const SAVE_KEY = 'pcraft.save';
const FLAGS_KEY = 'pcraft.flags';
const WORLD_KEY = 'pcraft.world';
const MUTE_KEY = 'pcraft.muted';
const AUTOSAVE_MS = 30000;
// Where Pokémon Red's own player waits, unseen, while you walk Minecraft.
// Route 1: its music plays over the world, and nothing there can start a script.
const PARK = { map: 'Route1', x: 10, y: 20 };
const STEP_FRAMES = 8; // frames per tile walking (2 px a frame, as on the Game Boy)
const SPRINT_FRAMES = 4; // holding B: Minecraft's sprint
const JUMP_FRAMES = 16;
const MOB_STEP_FRAMES = 16;
const DAY_TICKS = 24000; // a Minecraft day: 20 minutes
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const STARTERS = {
  bulbasaur: { species: 'Bulbasaur', moves: ['Tackle', 'Growl'] },
  charmander: { species: 'Charmander', moves: ['Scratch', 'Growl'] },
  squirtle: { species: 'Squirtle', moves: ['Tackle', 'TailWhip'] },
};

// ---------------------------------------------------------------- helpers
function b64bytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } };
const chance = (p) => Math.random() < p;
const pickWeighted = (list) => {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = Math.random() * total;
  for (const e of list) { r -= e[1]; if (r < 0) return e[0]; }
  return list[0][0];
};

/// Minecraft's seed rules: a number is used as is; any other text is hashed
/// like Java's String.hashCode. Returns [lo, hi] 32-bit halves.
function parseSeed(text) {
  const t = (text || '').trim();
  if (!t) return [(Math.random() * 2 ** 32) >>> 0, (Math.random() * 2 ** 32) | 0];
  if (/^-?\d+$/.test(t)) {
    let v = BigInt.asIntN(64, BigInt(t));
    return [Number(v & 0xffffffffn) >>> 0, Number(BigInt.asIntN(32, v >> 32n))];
  }
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return [h >>> 0, h < 0 ? -1 : 0];
}
const seedString = ([lo, hi]) => BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo >>> 0)).toString();

// ---------------------------------------------------------------- input
const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
const input = {
  touch: new Set(), keys: new Set(), padHeld: new Set(),
  latched: new Set(), held: new Set(), prev: new Set(), locked: new Set(),
  poll() {
    this.prev = this.held;
    const raw = new Set([...this.touch, ...this.keys]);
    this.padHeld.clear();
    for (const pad of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!pad) continue;
      const b = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (b(12) || pad.axes[1] < -0.5) this.padHeld.add('up');
      if (b(13) || pad.axes[1] > 0.5) this.padHeld.add('down');
      if (b(14) || pad.axes[0] < -0.5) this.padHeld.add('left');
      if (b(15) || pad.axes[0] > 0.5) this.padHeld.add('right');
      if (b(0)) this.padHeld.add('a');
      if (b(1)) this.padHeld.add('b');
      if (b(9)) this.padHeld.add('start');
      if (b(8)) this.padHeld.add('select');
    }
    for (const x of this.padHeld) raw.add(x);
    for (const x of this.locked) if (!raw.has(x)) this.locked.delete(x);
    const held = new Set([...raw, ...this.latched]);
    this.latched.clear();
    for (const x of this.locked) held.delete(x);
    this.held = held;
  },
  down(b) { return this.held.has(b); },
  pressed(b) { return this.held.has(b) && !this.prev.has(b); },
  // Swallow buttons still physically down until they are released, so the
  // press that closed one screen doesn't also act on the next.
  lock() {
    for (const x of [...this.touch, ...this.keys, ...this.padHeld]) this.locked.add(x);
    this.latched.clear();
    this.held = new Set();
  },
  gbMask() {
    let m = 0;
    if (this.down('a')) m |= GB.A;
    if (this.down('b')) m |= GB.B;
    if (this.down('select')) m |= GB.SELECT;
    if (this.down('start')) m |= GB.START;
    if (this.down('right')) m |= GB.RIGHT;
    if (this.down('left')) m |= GB.LEFT;
    if (this.down('up')) m |= GB.UP;
    if (this.down('down')) m |= GB.DOWN;
    return m;
  },
  dir() {
    // The most recently pressed direction wins when two are held.
    for (const d of ['up', 'down', 'left', 'right']) if (this.pressed(d)) { this.last = d; return d; }
    if (this.last && this.down(this.last)) return this.last;
    for (const d of ['up', 'down', 'left', 'right']) if (this.down(d)) { this.last = d; return d; }
    return null;
  },
};

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyZ: 'a', KeyK: 'a', Space: 'a', KeyX: 'b', KeyJ: 'b', Escape: 'b',
  Enter: 'start', ShiftLeft: 'select', ShiftRight: 'select', Backspace: 'select',
};
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const b = KEYS[e.code];
  if (!b) return;
  e.preventDefault();
  if (!e.repeat) input.latched.add(b);
  input.keys.add(b);
  unlockAudio();
});
addEventListener('keyup', (e) => { const b = KEYS[e.code]; if (b) input.keys.delete(b); });
addEventListener('blur', () => { input.keys.clear(); input.touch.clear(); });

function setupTouch() {
  const pointers = new Map();
  const recompute = () => {
    input.touch.clear();
    for (const set of pointers.values()) for (const b of set) input.touch.add(b);
    for (const el of document.querySelectorAll('[data-btn]')) el.classList.toggle('down', input.touch.has(el.dataset.btn));
    const dp = $('dpad');
    for (const d of ['up', 'down', 'left', 'right']) dp.classList.toggle(d, input.touch.has(d));
  };
  const buttonsAt = (x, y) => {
    const out = new Set();
    const dp = $('dpad').getBoundingClientRect();
    if (x >= dp.left && x <= dp.right && y >= dp.top && y <= dp.bottom) {
      const dx = (x - (dp.left + dp.width / 2)) / (dp.width / 2);
      const dy = (y - (dp.top + dp.height / 2)) / (dp.height / 2);
      if (Math.hypot(dx, dy) > 0.18) {
        // 4-way: the world is a grid, so a thumb between two arms picks one.
        if (Math.abs(dx) > Math.abs(dy)) out.add(dx > 0 ? 'right' : 'left');
        else out.add(dy > 0 ? 'down' : 'up');
      }
      return out;
    }
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest('[data-btn]');
    if (btn) out.add(btn.dataset.btn);
    return out;
  };
  const pad = $('pad');
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    pad.setPointerCapture?.(e.pointerId);
    const set = buttonsAt(e.clientX, e.clientY);
    if (set.size) buzz();
    for (const b of set) input.latched.add(b);
    pointers.set(e.pointerId, set);
    recompute();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    const before = pointers.get(e.pointerId);
    const set = buttonsAt(e.clientX, e.clientY);
    const isDir = (b) => b in DIRS;
    const keep = [...before].filter((b) => !isDir(b));
    const next = new Set([...keep, ...[...set].filter(isDir)]);
    if ([...next].some((b) => !before.has(b))) { buzz(5); for (const b of next) if (!before.has(b)) input.latched.add(b); }
    pointers.set(e.pointerId, next);
    recompute();
  });
  const up = (e) => { pointers.delete(e.pointerId); recompute(); };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- audio
const audio = {
  ctx: null, node: null, gain: null,
  muted: store.get(MUTE_KEY) === '1',
  peak: 0,
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.muted ? 0 : 0.8;
    this.gain.connect(this.ctx.destination);
    this.node = this.ctx.createScriptProcessor(2048, 0, 2);
    this.node.onaudioprocess = (e) => this.fill(e.outputBuffer);
    this.node.connect(this.gain);
  },
  fill(buf) {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    // Quiet when muted or when the loop has stopped (hidden tab, stall).
    if (this.muted || !S.runner || performance.now() - S.alive > 250) { L.fill(0); R.fill(0); return; }
    const s = S.runner.render_audio(n, this.ctx.sampleRate);
    for (let i = 0; i < n; i++) { L[i] = s[2 * i]; R[i] = s[2 * i + 1]; }
    for (let i = 0; i < n; i += 16) this.peak = Math.max(this.peak, Math.abs(L[i]));
  },
  setMuted(m) {
    this.muted = m;
    store.set(MUTE_KEY, m ? '1' : '0');
    if (this.gain) this.gain.gain.value = m ? 0 : 0.8;
    $('mute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
  },
};
function unlockAudio() {
  if (!S.started) return;
  audio.start();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
}

// ---------------------------------------------------------------- state
const S = {
  mode: 'loading', // loading | title | newworld | world | poke
  started: false,
  runner: null,
  gen: null,
  blocks: null,
  biomes: null,
  tiles: null,
  w: null, // the world: seed, player, mobs, clock
  frames: 0,
  acc: 0,
  last: 0,
  alive: 0,
  carry: 0,
  clearFor: 0,
  opaque: 0,
  battle: null,
  edges: new Set(), // buttons pressed since the last game frame
  lastSave: 0,
  toastUntil: 0,
  signUntil: 0,
};
window.__pc = S; // test hooks
window.__pcTest = { col, stepKind, wildBattle: () => wildBattle(col(S.w.x, S.w.z)), mobBattle: (m) => mobBattle(m, true), saveAll, party, spawnTrader: () => spawnTrader(), meet: (m) => meet(m), trySleep: () => trySleep() };

const canvas = $('screen');
const g = canvas.getContext('2d', { alpha: false });
g.imageSmoothingEnabled = false;
const layer = document.createElement('canvas');
layer.width = 160; layer.height = 144;
const lg = layer.getContext('2d');
const layerImg = lg.createImageData(160, 144);

// ---------------------------------------------------------------- the world
function col(x, z) {
  const c = S.gen.get(x >> 4, z >> 4);
  if (!c) return null;
  const i = ((z & 15) << 4) | (x & 15);
  const d = c.deco[i], cn = c.canopy[i];
  return {
    g: S.blocks[c.ground[i]], gy: c.gy[i],
    d: d === NONE ? null : S.blocks[d],
    cn: cn === NONE ? null : S.blocks[cn], lift: c.lift[i],
    b: S.biomes[c.biome[i]],
  };
}

/// How (and whether) something on column `a` can step onto column `b`.
function stepKind(a, b, surfing) {
  if (!a || !b) return null;
  if (b.g.kind === K.WALL || b.g.kind === K.LAVA) return null;
  if (b.d && (b.d.kind === K.WALL || b.d.kind === K.LAVA)) return null;
  if (b.g.kind === K.WATER) return surfing ? 'walk' : null;
  const dy = b.gy - a.gy;
  if (surfing) return Math.abs(dy) <= 1 ? 'land' : null;
  if (Math.abs(dy) <= 1) return 'walk';
  if (dy <= -2 && dy >= -4) return 'jump'; // a ledge: one way, down
  return null;
}

const mobAt = (x, z) => S.w.mobs.find((m) => (m.x === x && m.z === z) || (m.move && m.x + m.move.dx === x && m.z + m.move.dz === z));
const distFromOrigin = () => Math.hypot(S.w.x - S.w.origin[0], S.w.z - S.w.origin[1]);
const zoneLevel = () => 3 + Math.floor(distFromOrigin() / 40);
const isNight = () => S.w.time >= 13000 && S.w.time < 23000;
function daylight() {
  const t = S.w.time;
  if (t < 12000) return 1;
  if (t < 13500) return 1 - (t - 12000) / 1500 * 0.68;
  if (t < 22500) return 0.32;
  return 0.32 + (t - 22500) / 1500 * 0.68;
}

function party() {
  try { return JSON.parse(S.runner.party_summary()); } catch { return []; }
}
const canSurf = () => party().some((p) => p.types.includes('Water') || p.moves.includes('Surf'));

// ---------------------------------------------------------------- messages
function toast(text, ms = 2600) {
  S.toastAt = performance.now();
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  S.toastUntil = performance.now() + ms;
}
function sign(text) {
  const el = $('sign');
  el.textContent = text;
  el.hidden = false;
  S.signUntil = performance.now() + 2500;
}
function hideToast() { $('toast').hidden = true; S.toastUntil = 0; }
function hideSign() { $('sign').hidden = true; S.signUntil = 0; }
function updateMessages(now) {
  if (S.toastUntil && now > S.toastUntil) { $('toast').hidden = true; S.toastUntil = 0; }
  if (S.signUntil && now > S.signUntil) { $('sign').hidden = true; S.signUntil = 0; }
}
function updateHud() {
  const w = S.w;
  if (!w) return;
  const hours = Math.floor(w.time / 1000 + 6) % 24, mins = Math.floor((w.time % 1000) * 0.06);
  $('clock').textContent = `${isNight() ? 'NIGHT' : 'DAY'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  $('zone').textContent = `WILD LV~${zoneLevel()}`;
}

// ---------------------------------------------------------------- player
function worldStep(first) {
  const w = S.w;
  w.time = (w.time + 1 / 3) % DAY_TICKS;
  if (w.sleep) { sleepStep(); return; }
  updateMobs();
  if (w.move) {
    w.move.t++;
    if (w.move.t >= w.move.len) finishStep();
    return;
  }
  if (S.mode !== 'world') return;
  if (first && S.edges.has('start')) { S.startEdge = true; return; }
  if (first && S.edges.has('a')) { interact(); return; }
  if (first && S.edges.has('select')) { trySleep(); return; }
  const dir = input.dir();
  if (!dir) { w.turn = 0; return; }
  if (dir !== w.facing) {
    // A tap turns on the spot; holding walks.
    w.facing = dir;
    w.turn = 5;
    return;
  }
  if (w.turn > 0) { w.turn--; if (w.turn > 0) return; }
  tryMove(dir);
}

function tryMove(dir) {
  const w = S.w;
  const [dx, dz] = DIRS[dir];
  const here = col(w.x, w.z), there = col(w.x + dx, w.z + dz);
  if (!here || !there) return; // still generating
  const mob = mobAt(w.x + dx, w.z + dz);
  if (mob) { meet(mob); return; }
  const kind = stepKind(here, there, w.surf);
  if (!kind) {
    if (!w.surf && there.g.kind === K.WATER && !w.bumpedWater) {
      w.bumpedWater = true;
      toast(canSurf() ? 'The water is calm. Press A to SURF.' : 'The water is deep. A WATER POKéMON could carry you.');
    }
    return;
  }
  w.bumpedWater = false;
  const len = kind === 'jump' ? JUMP_FRAMES : input.down('b') && !w.surf ? SPRINT_FRAMES : STEP_FRAMES;
  w.move = { dx, dz, t: 0, len, jump: kind === 'jump', land: kind === 'land' };
}

function finishStep() {
  const w = S.w;
  const m = w.move;
  w.x += m.dx; w.z += m.dz;
  w.move = null;
  w.parity ^= 1;
  if (m.land) w.surf = false;
  w.steps++;
  const here = col(w.x, w.z);
  if (!here) return;
  if (here.b.label !== w.biomeLabel && performance.now() - (w.signAt || 0) > 4000) {
    // Like a Pokémon route sign; not again for a few seconds at a ragged border.
    w.biomeLabel = here.b.label;
    w.signAt = performance.now();
    sign(here.b.label);
  }
  let rate = 0;
  if (w.surf) rate = 1 / 22;
  else if (here.d && here.d.grass) rate = 1 / 10;
  else if (here.g.rough || (here.d && here.d.snow)) rate = 1 / 40;
  if (w.steps > w.safeUntil && chance(rate)) wildBattle(here);
}

function facingCol() {
  const w = S.w;
  const [dx, dz] = DIRS[w.facing];
  return { x: w.x + dx, z: w.z + dz, c: col(w.x + dx, w.z + dz) };
}

function interact() {
  const w = S.w;
  const f = facingCol();
  if (!f.c) return;
  const mob = mobAt(f.x, f.z);
  if (mob) { meet(mob); return; }
  if (SHOP_RE.test(f.c.g.name)) { villageBell(); return; }
  if (!w.surf && f.c.g.kind === K.WATER) {
    if (!canSurf()) { toast('The water is deep. A WATER POKéMON could carry you.'); return; }
    const lead = party().find((p) => p.types.includes('Water') || p.moves.includes('Surf'));
    toast(`${lead.species.toUpperCase()} used SURF!`, 1600);
    w.surf = true;
    w.move = { dx: DIRS[w.facing][0], dz: DIRS[w.facing][1], t: 0, len: STEP_FRAMES, jump: false, land: false };
    return;
  }
  // Pokémon-style: say what's there.
  const thing = f.c.g.kind === K.WALL ? f.c.g : f.c.d && !f.c.d.grass ? f.c.d : null;
  if (thing) {
    const what = thing.name.replace(/_/g, ' ').toUpperCase();
    toast(`It's ${/^[AEIOU]/.test(what) ? 'an' : 'a'} ${what}.`, 1500);
  }
}

function meet(mob) {
  if (!mob.trader) { mobBattle(mob, false); return; }
  mob.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[S.w.facing];
  mob.wait = 200;
  S.runner.open_shop(shopStock().join(','));
}

function shopStock() {
  const lv = zoneLevel();
  const stock = ['POKE_BALL', 'POTION', 'ANTIDOTE', 'PARLYZ_HEAL', 'AWAKENING', 'ESCAPE_ROPE'];
  if (lv >= 12) stock.splice(1, 0, 'GREAT_BALL', 'SUPER_POTION');
  if (lv >= 25) stock.push('REVIVE', 'ICE_HEAL', 'BURN_HEAL');
  if (lv >= 30) stock.splice(0, 0, 'ULTRA_BALL', 'HYPER_POTION');
  if (lv >= 45) stock.push('FULL_RESTORE', 'MAX_REVIVE');
  return stock;
}

function villageBell() {
  S.runner.heal_party();
  S.runner.open_shop(shopStock().join(','));
  S.w.spawn = [S.w.x, S.w.z];
  toast('The village BELL rings. Your POKéMON are healed, and you will wake up here.', 3200);
}

function trySleep() {
  const w = S.w;
  if (!isNight()) { toast('You can only sleep at night.'); return; }
  if (w.mobs.some((m) => m.hostile && Math.abs(m.x - w.x) + Math.abs(m.z - w.z) < 8)) {
    toast('You may not rest now; there are monsters nearby.');
    return;
  }
  w.sleep = { t: 0 };
}
function sleepStep() {
  const w = S.w;
  w.sleep.t++;
  if (w.sleep.t === 60) {
    S.runner.heal_party();
    w.time = 0;
    w.mobs = w.mobs.filter((m) => !m.hostile);
    w.spawn = [w.x, w.z];
  }
  if (w.sleep.t >= 120) {
    w.sleep = null;
    toast('You slept until morning. Your POKéMON are healed. You will wake up here.', 3200);
    saveAll('sleep');
  }
}

// ---------------------------------------------------------------- battles
function wildBattle(here) {
  const w = S.w;
  const level = levelAt(distFromOrigin(), Math.random);
  const species = wildFor(here.b.name, w.surf, level, Math.random, isNight());
  try { S.runner.start_wild_battle(species, level); } catch { return; }
  S.battle = { kind: 'wild', species, level };
  S.mode = 'poke';
}

function mobBattle(mob, ambush) {
  const [line, bonus, prize] = MOB_POKEMON[mob.type];
  const level = Math.min(75, levelAt(distFromOrigin(), Math.random) + bonus);
  const species = formAt(line, level);
  try { S.runner.start_wild_battle(species, level); } catch { return; }
  S.battle = { kind: 'mob', mob, species, level, prize };
  S.mode = 'poke';
  const name = mob.type.replace(/_/g, ' ').toUpperCase();
  toast(ambush ? `A ${name} attacks! It's a ${species.toUpperCase()}!` : `The ${name} is really a ${species.toUpperCase()}!`, 2200);
}

// Back from Pokémon's screens to walking the world.
function backToWorld() {
  const w = S.w, r = S.runner;
  S.mode = 'world';
  S.clearFor = 0;
  input.lock();
  S.edges.clear();
  const outcome = r.take_battle_outcome();
  const b = S.battle;
  S.battle = null;
  if (b) {
    w.safeUntil = w.steps + 3;
    if (b.kind === 'mob') {
      w.mobs = w.mobs.filter((m) => m !== b.mob);
      if (outcome === 'Win' && b.prize) {
        const money = b.prize * b.level;
        r.add_money(money);
        toast(`The ${b.mob.type.toUpperCase()} dropped ¥${money}!`);
      }
    }
  }
  // Blacking out, FLY, DIG, TELEPORT and ESCAPE ROPE all move Pokémon's
  // player off its hidden spot: here, they all take you back to where you
  // last slept (or rang a bell).
  if (r.current_map() !== PARK.map) {
    try { r.warp_to(PARK.map, PARK.x, PARK.y); } catch { /* stays where it is */ }
    w.x = w.spawn[0]; w.z = w.spawn[1];
    w.surf = false; w.move = null;
    w.mobs = [];
    toast(outcome === 'Loss' ? 'You woke up where you last rested.' : 'You return to where you last rested.', 3000);
  }
  saveAll('battle');
}

// ---------------------------------------------------------------- mobs
function updateMobs() {
  const w = S.w;
  w.mobTimer = (w.mobTimer || 0) + 1;
  if (w.mobTimer % 45 === 0) spawnMob();
  if (w.mobTimer % 3600 === 1800 && w.steps > 30) spawnTrader();
  // Hostile mobs burn away in daylight; everything far away despawns.
  w.mobs = w.mobs.filter((m) => {
    if (Math.abs(m.x - w.x) > 18 || Math.abs(m.z - w.z) > 18) return false;
    if (m.hostile && !isNight() && w.time > 1000 && chance(0.004)) return false;
    if (m.trader && --m.life <= 0) return false;
    return true;
  });
  for (const m of w.mobs) {
    if (m.move) {
      m.move.t++;
      if (m.move.t >= MOB_STEP_FRAMES) { m.x += m.move.dx; m.z += m.move.dz; m.move = null; }
      continue;
    }
    if (--m.wait > 0) continue;
    const dx0 = w.x - m.x, dz0 = w.z - m.z;
    const chasing = m.hostile && isNight() && Math.abs(dx0) + Math.abs(dz0) <= 9 && !w.sleep;
    m.wait = chasing ? 10 + Math.floor(Math.random() * 10) : 50 + Math.floor(Math.random() * 120);
    let dir;
    if (chasing) {
      dir = Math.abs(dx0) > Math.abs(dz0) ? (dx0 > 0 ? 'right' : 'left') : (dz0 > 0 ? 'down' : 'up');
      if (Math.abs(dx0) + Math.abs(dz0) === 1) {
        // Next to you: it attacks, unless you're busy.
        m.facing = dir;
        if (S.mode === 'world' && !w.move && !S.battle) mobBattle(m, true);
        continue;
      }
    } else {
      if (chance(0.4)) continue;
      dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
    }
    m.facing = dir;
    const [dx, dz] = DIRS[dir];
    const tx = m.x + dx, tz = m.z + dz;
    if ((tx === w.x && tz === w.z) || (w.move && tx === w.x + w.move.dx && tz === w.z + w.move.dz)) continue;
    if (mobAt(tx, tz)) continue;
    const kind = stepKind(col(m.x, m.z), col(tx, tz), false);
    if (kind === 'walk') m.move = { dx, dz, t: 0 };
  }
}

// Now and then in daylight a Wandering Trader turns up: he runs a Poké Mart.
function spawnTrader() {
  const w = S.w;
  if (isNight() || w.mobs.some((m) => m.trader)) return;
  for (let tries = 0; tries < 8; tries++) {
    const ang = Math.random() * Math.PI * 2, r = 6 + Math.random() * 4;
    const x = Math.round(w.x + Math.cos(ang) * r), z = Math.round(w.z + Math.sin(ang) * r);
    const c = col(x, z);
    if (!c || c.g.kind !== K.LAND || c.cn || mobAt(x, z)) continue;
    w.mobs.push({ type: 'wandering_trader', x, z, facing: 'down', move: null, wait: 60, hostile: false, trader: true, life: 5400 });
    toast('A WANDERING TRADER is nearby. He sells POKé BALLS and medicine.', 3000);
    return;
  }
}

function spawnMob() {
  const w = S.w;
  const night = isNight();
  const cap = night ? 6 : 5;
  if (w.mobs.length >= cap) return;
  for (let tries = 0; tries < 6; tries++) {
    const ang = Math.random() * Math.PI * 2, r = 7 + Math.random() * 5;
    const x = Math.round(w.x + Math.cos(ang) * r), z = Math.round(w.z + Math.sin(ang) * r);
    const c = col(x, z);
    if (!c || c.g.kind !== K.LAND || c.cn || mobAt(x, z)) continue;
    const spawns = (c.b.spawns && c.b.spawns[night ? 'monster' : 'creature']) || [];
    const list = spawns.filter(([t]) => MOB_POKEMON[t] && ASSETS.world.mobs[t] !== undefined);
    if (!list.length) return;
    const type = pickWeighted(list);
    w.mobs.push({ type, x, z, facing: 'down', move: null, wait: 30, hostile: HOSTILE.has(type) });
    return;
  }
}

// ---------------------------------------------------------------- drawing
function drawBlock(block, biome, x, y, anim, alpha = 1) {
  const frame = block.frames > 1 ? anim % block.frames : 0;
  const t = S.tiles.get(block.tile + frame, tintFor(block, biome), block.leaves);
  if (alpha !== 1) { g.globalAlpha = alpha; g.drawImage(t, x, y); g.globalAlpha = 1; } else g.drawImage(t, x, y);
}

function spriteFrame(facing, walking, parity) {
  // Pokémon's sheet: down, up, left standing; then down, up, left stepping.
  // Right is left mirrored; down/up steps alternate feet by mirroring.
  if (facing === 'down') return [walking ? 3 : 0, walking && parity];
  if (facing === 'up') return [walking ? 4 : 1, walking && parity];
  if (facing === 'left') return [walking ? 5 : 2, false];
  return [walking ? 5 : 2, true];
}
function drawTile(tile, x, y, flip) {
  const t = S.tiles.get(tile, '');
  if (!flip) { g.drawImage(t, x, y); return; }
  g.save(); g.translate(x + 16, y); g.scale(-1, 1); g.drawImage(t, 0, 0); g.restore();
}

function drawWorld() {
  const w = S.w;
  const mv = w.move;
  const t = mv ? mv.t / mv.len : 0;
  const camX = Math.round((w.x + (mv ? mv.dx * t : 0)) * 16) - 64;
  const camZ = Math.round((w.z + (mv ? mv.dz * t : 0)) * 16) - 64;
  const tx0 = Math.floor(camX / 16), tz0 = Math.floor(camZ / 16);
  const anim = Math.floor(S.frames / 6);
  const cols = [];
  for (let tz = tz0 - 1; tz <= tz0 + 10; tz++) {
    const row = [];
    for (let tx = tx0 - 1; tx <= tx0 + 11; tx++) row.push(col(tx, tz));
    cols.push(row);
  }
  const at = (tx, tz) => cols[tz - tz0 + 1][tx - tx0 + 1];

  for (let tz = tz0; tz <= tz0 + 9; tz++) {
    for (let tx = tx0; tx <= tx0 + 10; tx++) {
      const sx = tx * 16 - camX, sy = tz * 16 - camZ;
      const c = at(tx, tz);
      if (!c) { g.fillStyle = '#0b0b10'; g.fillRect(sx, sy, 16, 16); continue; }
      drawBlock(c.g, c.b, sx, sy, anim);
      if (c.g.kind !== K.WATER) {
        // Height reads as light: high ground pale, low ground dark.
        const h = c.gy - 64;
        if (h > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.2, h * 0.005)})`; g.fillRect(sx, sy, 16, 16); }
        else if (h < 0) { g.fillStyle = `rgba(0,0,0,${Math.min(0.35, -h * 0.03)})`; g.fillRect(sx, sy, 16, 16); }
        // Edges: a drop to the south is a ledge face; drops east and west
        // and a rise to the north cast thin shadows.
        const s = at(tx, tz + 1), e = at(tx + 1, tz), wv = at(tx - 1, tz), n = at(tx, tz - 1);
        if (s) {
          const d = c.gy - s.gy;
          if (d >= 2) { g.fillStyle = 'rgba(40,24,8,.55)'; g.fillRect(sx, sy + 12, 16, 4); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(sx, sy + 11, 16, 1); }
          else if (d === 1) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(sx, sy + 14, 16, 2); }
        }
        if (e && c.gy - e.gy >= 1) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(sx + 15, sy, 1, 16); }
        if (wv && c.gy - wv.gy >= 1) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(sx, sy, 1, 16); }
        if (n && n.gy - c.gy >= 2) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(sx, sy, 16, 3); }
      }
      if (c.d) drawBlock(c.d, c.b, sx, sy, anim);
    }
  }

  // Mobs and the player, back to front.
  const things = w.mobs.map((m) => {
    const mt = m.move ? m.move.t / MOB_STEP_FRAMES : 0;
    return { z: m.z + (m.move ? m.move.dz * mt : 0), draw() {
      const x = Math.round((m.x + (m.move ? m.move.dx * mt : 0)) * 16) - camX;
      const y = Math.round(this.z * 16) - camZ - 3 - (m.move && m.move.t % 8 < 4 ? 1 : 0);
      if (x < -16 || y < -16 || x > 160 || y > 144) return;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 3, y + 15, 10, 2);
      drawTile(ASSETS.world.mobs[m.type], x, y, m.facing === 'left');
    } };
  });
  things.push({ z: w.z + (mv ? mv.dz * t : 0), draw() {
    const sheet = ASSETS.world.player[w.surf ? 'seel' : 'red'];
    const walking = !!mv && mv.t < mv.len / 2;
    const [f, flip] = spriteFrame(w.facing, walking, w.parity);
    const jump = mv && mv.jump ? Math.round(Math.sin(Math.PI * t) * 8) : 0;
    if (jump) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(66, 74, 12, 2); }
    drawTile(sheet + f, 64, 60 - jump, flip);
  } });
  things.sort((a, b) => a.z - b.z);
  for (const th of things) th.draw();

  // Tall grass hides the player's feet, as in Pokémon.
  const here = mv ? null : at(w.x, w.z);
  if (here && here.d && here.d.grass) {
    const tile = S.tiles.get(here.d.tile, tintFor(here.d, here.b));
    g.drawImage(tile, 0, 10, 16, 6, 64, 70, 16, 6);
  }

  // Tree tops over everything; see-through right around the player.
  for (let tz = tz0; tz <= tz0 + 9; tz++) {
    for (let tx = tx0; tx <= tx0 + 10; tx++) {
      const c = at(tx, tz);
      if (!c || !c.cn) continue;
      const near = Math.abs(tx - w.x) <= 1 && Math.abs(tz - w.z) <= 1;
      const sx = tx * 16 - camX, sy = tz * 16 - camZ;
      drawBlock(c.cn, c.b, sx, sy, anim, near ? 0.4 : 1);
      if (!near && c.cn.leaves) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(sx, sy + 13, 16, 3); }
    }
  }

  // Day and night.
  const light = daylight();
  if (light < 1) {
    g.globalCompositeOperation = 'multiply';
    const r = Math.round(40 + 215 * light), gg = Math.round(56 + 199 * light), b = Math.round(110 + 145 * light);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(0, 0, 160, 144);
    g.globalCompositeOperation = 'source-over';
  }
  if (w.sleep) {
    const a = w.sleep.t < 60 ? w.sleep.t / 60 : 1 - (w.sleep.t - 60) / 60;
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.fillRect(0, 0, 160, 144);
  }
}

function present(px) {
  // A fully opaque Pokémon frame (battle, party, bag…) is the whole picture.
  if (S.opaque === 160 * 144) {
    layerImg.data.set(px);
    g.putImageData(layerImg, 0, 0);
    return;
  }
  drawWorld();
  if (S.opaque > 0) {
    layerImg.data.set(px);
    lg.putImageData(layerImg, 0, 0);
    g.drawImage(layer, 0, 0);
  }
}

// ---------------------------------------------------------------- loop
function tickOnce(first) {
  const r = S.runner;
  let mask;
  if (S.mode === 'world') {
    S.startEdge = false;
    worldStep(first);
    mask = S.startEdge ? GB.START : 0;
  } else {
    if (S.w && (S.w.move || S.w.sleep)) worldStep(false);
    mask = S.carry | input.gbMask();
    S.carry = 0;
  }
  const px = r.tick_layers(mask);
  let opaque = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]) opaque++;
  S.opaque = opaque;
  S.frames++;
  if (opaque === 160 * 144 && S.toastUntil) hideToast(); // a battle or full-screen menu
  const screen = r.screen_name();
  if (S.mode === 'world') {
    if (screen !== 'Overworld' || opaque > 0) {
      S.mode = 'poke';
      S.clearFor = 0;
      // Pokémon's own menus and text take the screen: clear the page's
      // messages, except one that came with this very change (a shop greeting).
      hideSign();
      if (performance.now() - (S.toastAt || 0) > 500) hideToast();
    }
  } else if (screen === 'Overworld' && opaque === 0) {
    if (++S.clearFor >= 2) backToWorld();
  } else {
    S.clearFor = 0;
  }
  if (screen === 'SaveMenu') S.sawSaveMenu = true;
  else if (S.sawSaveMenu) { S.sawSaveMenu = false; saveAll('save menu'); }
  return px;
}

function frame(now) {
  const dt = Math.min(100, now - (S.last || now));
  S.last = now;
  S.alive = performance.now();
  input.poll();
  for (const b of BUTTONS) if (input.pressed(b)) S.edges.add(b);
  updateMessages(now);
  if (S.mode === 'world' || S.mode === 'poke') {
    const w = S.w;
    S.gen.want(w.x >> 4, w.z >> 4, 2);
    S.gen.pump();
    S.acc += dt;
    const step = 1000 / POKE_HZ;
    if (S.mode === 'poke') S.carry |= input.gbMask();
    let n = 0, px = null;
    while (S.acc >= step && n < 4) {
      S.acc -= step;
      px = tickOnce(n === 0);
      if (n === 0) S.edges.clear();
      n++;
    }
    if (n === 4) S.acc = 0;
    if (px) present(px);
    if (S.frames % 30 === 0) updateHud();
    if (S.mode === 'world' && now - S.lastSave > AUTOSAVE_MS) saveAll('timer');
  } else if (S.mode === 'title') {
    titleInput();
  } else if (S.mode === 'newworld') {
    newWorldInput();
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- saving
function saveAll(reason) {
  const r = S.runner, w = S.w;
  if (!r || !w) return;
  const s = r.export_live_save();
  if (!s) return;
  store.set(SAVE_KEY, s);
  store.set(FLAGS_KEY, r.export_flags());
  store.set(WORLD_KEY, JSON.stringify({
    v: 1, seed: w.seed, seedText: w.seedText, x: w.x, z: w.z, facing: w.facing, surf: w.surf,
    spawn: w.spawn, origin: w.origin, time: Math.floor(w.time), steps: w.steps,
  }));
  S.lastSave = performance.now();
  S.lastSaveReason = reason;
}

// ---------------------------------------------------------------- starting
function newWorldState(saved) {
  return {
    seed: saved.seed, seedText: saved.seedText || '', x: saved.x, z: saved.z,
    facing: saved.facing || 'down', surf: !!saved.surf, move: null, parity: 0, turn: 0,
    spawn: saved.spawn, origin: saved.origin, time: saved.time ?? 1000,
    mobs: [], steps: saved.steps || 0, safeUntil: (saved.steps || 0) + 4, biomeLabel: '', sleep: null,
  };
}

async function startGenerator(seed, status) {
  status('MINECRAFT IS GENERATING THE WORLD…');
  const gen = new WorldGen();
  const ready = await gen.init(S.mcWasm, S.mcData, seed);
  S.blocks = buildBlocks(ready.blocks, ASSETS.world);
  S.biomes = buildBiomes(ready.biomes, ASSETS.world);
  S.gen = gen;
  return ready;
}

/// A dry, open spot near Minecraft's own spawn point.
async function findSpawn(spawnChunk, status) {
  const [sx, sz] = spawnChunk;
  for (let r = 0; r <= 8; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        status(`LOOKING FOR LAND… ${r ? `(${r * 16} BLOCKS OUT)` : ''}`);
        const cx = sx + dx, cz = sz + dz;
        await S.gen.load(cx, cz);
        let best = null, bestScore = -1;
        for (let z = 2; z < 14; z++) {
          for (let x = 2; x < 14; x++) {
            const wx = cx * 16 + x, wz = cz * 16 + z;
            const c = col(wx, wz);
            if (!c || c.g.kind !== K.LAND || c.cn) continue;
            let open = 0;
            for (let oz = -2; oz <= 2; oz++) for (let ox = -2; ox <= 2; ox++) {
              const n = col(wx + ox, wz + oz);
              if (n && stepKind(c, n, false) === 'walk' && !n.cn) open++;
            }
            const score = open * 10 - Math.abs(x - 8) - Math.abs(z - 8) - (c.d && c.d.grass ? 15 : 0);
            if (open >= 18 && score > bestScore) { bestScore = score; best = [wx, wz]; }
          }
        }
        if (best) return best;
      }
    }
  }
  return [sx * 16 + 8, sz * 16 + 8];
}

function bootRunner(saveJson, flags) {
  const r = new PokeredRunner(saveJson);
  if (flags) r.import_flags(flags);
  S.runner = r;
  // Re-enter the hidden spot so Route 1's music starts.
  try { r.warp_to(PARK.map, PARK.x, PARK.y); } catch { /* silent start */ }
  return r;
}

async function continueGame() {
  const saved = JSON.parse(store.get(WORLD_KEY));
  const status = (t) => { $('loading').textContent = t; };
  enterLoading();
  await startGenerator(saved.seed, status);
  status('LOADING CHUNKS…');
  await S.gen.load(saved.x >> 4, saved.z >> 4);
  S.w = newWorldState(saved);
  bootRunner(store.get(SAVE_KEY), store.get(FLAGS_KEY));
  enterWorld();
}

async function newGame(starterKey, seedText) {
  const seed = parseSeed(seedText);
  const status = (t) => { $('loading').textContent = t; };
  enterLoading();
  const ready = await startGenerator(seed, status);
  const spot = await findSpawn(ready.spawn, status);
  // Pokémon's own save from a previous run would load on boot; a new world must not.
  store.del('pokered.save');
  store.del('pokered.script_flags');
  const starter = STARTERS[starterKey];
  const r = new PokeredRunner(null);
  r.import_editor_save(JSON.stringify({
    player: {
      playerName: 'RED', rivalName: 'BLUE', mapName: PARK.map, positionX: PARK.x, positionY: PARK.y,
      playTimeHours: 0, playTimeMinutes: 0, money: 3000,
    },
    badges: [],
    party: [{ species: starter.species, level: 5, currentHp: 999, maxHp: 999, moves: starter.moves, nickname: '' }],
    items: [{ name: 'POKE_BALL', quantity: 10 }, { name: 'POTION', quantity: 5 }, { name: 'ANTIDOTE', quantity: 1 }],
    flags: { EVENT_GOT_POKEDEX: true, EVENT_GOT_STARTER: true },
  }));
  S.runner = r;
  try { r.warp_to(PARK.map, PARK.x, PARK.y); } catch { /* silent start */ }
  S.w = newWorldState({ seed, seedText: seedText || seedString(seed), x: spot[0], z: spot[1], spawn: spot, origin: spot, time: 1000 });
  enterWorld();
  toast(`SEED ${S.w.seedText}. Wild POKéMON hide in tall grass, and Minecraft's mobs are POKéMON too. The farther you go, the stronger they get. A: talk/SURF · B: sprint · SELECT: sleep at night · START: menu`, 8000);
}

function enterLoading() {
  S.started = true;
  unlockAudio();
  $('title').hidden = false;
  $('title').querySelector('.menu').hidden = true;
  $('newworld').hidden = true;
  $('loading').hidden = false;
  S.mode = 'loading';
}
function enterWorld() {
  $('title').hidden = true;
  $('newworld').hidden = true;
  $('hud-world').hidden = false;
  S.mode = 'world';
  S.acc = 0;
  S.carry = 0;
  input.lock();
  const here = col(S.w.x, S.w.z);
  if (here) { S.w.biomeLabel = here.b.label; sign(here.b.label); }
  updateHud();
  saveAll('start');
}

// ---------------------------------------------------------------- title + new world
let titleIndex = 0;
function titleButtons() { return [...document.querySelectorAll('#title .menu button')].filter((b) => !b.hidden); }
function renderTitle() { titleButtons().forEach((b, i) => b.classList.toggle('sel', i === titleIndex)); }
function titleInput() {
  const bs = titleButtons();
  if (!bs.length) return;
  if (input.pressed('up')) { titleIndex = (titleIndex + bs.length - 1) % bs.length; renderTitle(); }
  if (input.pressed('down')) { titleIndex = (titleIndex + 1) % bs.length; renderTitle(); }
  if (input.pressed('a') || input.pressed('start')) bs[titleIndex]?.click();
}

let armed = false;
function openNewWorld() {
  if (store.get(WORLD_KEY) && !armed) {
    armed = true;
    $('btn-new').textContent = 'TAP AGAIN: ERASE SAVE';
    return;
  }
  S.started = true;
  unlockAudio();
  $('title').hidden = true;
  $('newworld').hidden = false;
  S.mode = 'newworld';
  starterIndex = 0;
  renderStarters();
  input.lock();
}
let starterIndex = 0;
function starterButtons() { return [...document.querySelectorAll('#starters button')]; }
function renderStarters() { starterButtons().forEach((b, i) => b.classList.toggle('sel', i === starterIndex)); }
function newWorldInput() {
  const bs = starterButtons();
  if (input.pressed('left') || input.pressed('up')) { starterIndex = (starterIndex + bs.length - 1) % bs.length; renderStarters(); }
  if (input.pressed('right') || input.pressed('down')) { starterIndex = (starterIndex + 1) % bs.length; renderStarters(); }
  if (input.pressed('a') || input.pressed('start')) bs[starterIndex].click();
  if (input.pressed('b')) { $('newworld').hidden = true; $('title').hidden = false; S.mode = 'title'; input.lock(); }
}

function fail(e) {
  $('title').hidden = false;
  $('loading').hidden = false;
  $('loading').textContent = `Couldn't start: ${e && e.message ? e.message : e}`;
  S.mode = 'error';
  console.error(e);
}

async function main() {
  setupTouch();
  $('mute').addEventListener('click', () => { unlockAudio(); audio.setMuted(!audio.muted); });
  audio.setMuted(audio.muted);
  $('btn-continue').addEventListener('click', () => continueGame().catch(fail));
  $('btn-new').addEventListener('click', openNewWorld);
  for (const b of starterButtons()) {
    b.addEventListener('click', () => newGame(b.dataset.starter, $('seed').value).catch(fail));
  }
  $('toast').addEventListener('click', () => { $('toast').hidden = true; S.toastUntil = 0; });
  const leaving = (why) => { if (S.mode === 'world' || S.mode === 'poke') saveAll(why); };
  addEventListener('visibilitychange', () => {
    if (document.hidden) {
      leaving('hidden');
      if (audio.ctx) audio.ctx.suspend().catch(() => {});
    } else if (audio.ctx && S.started) {
      audio.ctx.resume().catch(() => {});
    }
  });
  addEventListener('pagehide', () => leaving('pagehide'));

  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser is too old (no DecompressionStream)');
    const [pk, mc] = await Promise.all([gunzip(b64bytes(ASSETS.pk)), gunzip(b64bytes(ASSETS.mc))]);
    await initPokered({ module_or_path: pk });
    S.mcWasm = mc;
    S.mcData = b64bytes(ASSETS.data);
    const img = new Image();
    img.src = 'data:image/png;base64,' + ASSETS.atlas;
    await img.decode();
    S.tiles = new Tiles(img, ASSETS.world.cols);
  } catch (e) {
    fail(e);
    throw e;
  }
  delete ASSETS.pk; delete ASSETS.mc; delete ASSETS.data; delete ASSETS.atlas;
  $('loading').hidden = true;
  $('btn-continue').hidden = !(store.get(WORLD_KEY) && store.get(SAVE_KEY));
  if (!store.set('pcraft.probe', '1')) $('nosave').hidden = false;
  $('title').querySelector('.menu').hidden = false;
  titleIndex = 0;
  renderTitle();
  S.mode = 'title';
  requestAnimationFrame(frame);
}
main();
