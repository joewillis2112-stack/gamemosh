// Pokécraft: Pokémon Red in an endless first-person Minecraft world.
//
// Minecraft's world generator (MinecraftOSS, mcgen.wasm) makes the land in a
// worker that also turns it into meshes; three.js draws it. Wild Pokémon live
// in the world as sprites coloured with their Super Game Boy palettes, your
// lead Pokémon follows you, and trainers walk up to challenge you.
// Pokémon Red (open-pokered) runs hidden underneath: battles happen right in
// the world (your Pokémon and the wild one face off where you met), with
// Pokémon's own HUD, text and menus drawn on top; START opens its menu.
import initPokered, { PokeredRunner } from 'pokered-runner';
import { World } from './gen.js';
import { View } from './view.js';
import { Player, raycast, EYE } from './player.js';
import { Controls, GB } from './controls.js';
import { Entities } from './entities.js';
import { Items } from './items.js';
import { Inventory } from './inventory.js';
import { Survival } from './survival.js';
import { Mobs } from './mobs.js';
import { hiding, fished, levelAt } from './encounters.js';
import { perksFor, calms } from './perks.js';
import { TouchGB, findCursors } from './touchgb.js';

const ASSETS = window.PC_ASSETS;
const W = ASSETS.world;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
const POKE_HZ = 59.7275;
const DT = 1 / POKE_HZ;
const SAVE_KEY = 'pcraft3.save', FLAGS_KEY = 'pcraft3.flags', WORLD_KEY = 'pcraft3.world', EDITS_KEY = 'pcraft3.edits', MUTE_KEY = 'pcraft.muted';
const AUTOSAVE_MS = 30000;
// Pokémon Red's own player stands still on Route 1, unseen: its music plays
// and nothing there can start a script.
const PARK = { map: 'Route1', x: 10, y: 20 };
const DAY_TICKS = 24000; // Minecraft's day: 20 minutes
const TOUCH = matchMedia('(pointer: coarse)').matches;
const RADIUS = TOUCH ? 3 : 4; // chunks drawn around you
const REACH = 5;
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
async function image(b64) {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  return img;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

/// Minecraft's seed rules: a number is used as is; other text is hashed like
/// Java's String.hashCode. Returns [lo, hi] 32-bit halves.
function parseSeed(text) {
  const t = (text || '').trim();
  if (!t) return [(Math.random() * 2 ** 32) >>> 0, (Math.random() * 2 ** 32) | 0];
  if (/^-?\d+$/.test(t)) {
    const v = BigInt.asIntN(64, BigInt(t));
    return [Number(v & 0xffffffffn) >>> 0, Number(BigInt.asIntN(32, v >> 32n))];
  }
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return [h >>> 0, h < 0 ? -1 : 0];
}
const seedString = ([lo, hi]) => BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo >>> 0)).toString();

// ---------------------------------------------------------------- state
const S = {
  mode: 'loading', // loading | title | newworld | world | poke
  started: false,
  runner: null,
  world: null,
  view: null,
  player: null,
  ents: null,
  controls: null,
  names: null, // block names by id
  info: null, // block info by id
  biomeNames: null,
  g: null, // the saved world state: seed, spawn, time, inventory...
  frames: 0,
  acc: 0,
  last: 0,
  alive: 0,
  clearFor: 0,
  opaque: 0,
  battle: null,
  mining: null,
  lastSave: 0,
  toastUntil: 0,
  signUntil: 0,
  party: [],
  edits: {},
};
window.__pc = S;

// ---------------------------------------------------------------- audio
const audio = {
  ctx: null, node: null, gain: null, muted: store.get(MUTE_KEY) === '1', peak: 0,
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.muted ? 0 : 0.8;
    this.gain.connect(this.ctx.destination);
    this.node = this.ctx.createScriptProcessor(2048, 0, 2);
    this.node.onaudioprocess = (e) => {
      const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1), n = L.length;
      if (this.muted || !S.runner || performance.now() - S.alive > 250) { L.fill(0); R.fill(0); return; }
      const s = S.runner.render_audio(n, this.ctx.sampleRate);
      for (let i = 0; i < n; i++) { L[i] = s[2 * i]; R[i] = s[2 * i + 1]; }
      for (let i = 0; i < n; i += 16) this.peak = Math.max(this.peak, Math.abs(L[i]));
    };
    this.node.connect(this.gain);
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

// ---------------------------------------------------------------- blocks
function blockInfo(id) {
  if (id < 0) return null;
  return S.info[id];
}
function buildInfo(names) {
  return names.map((name) => {
    const b = W.blocks[name];
    return {
      name,
      h: !b || !b.c ? 0 : b.s === 'slab' ? 0.5 : 1,
      water: name === 'water' || name === 'bubble_column',
      leaves: /_leaves$/.test(name),
      lava: name === 'lava',
      air: !b,
      shape: b ? b.s : 'air',
      tile: b ? b.f[1] : 0,
    };
  });
}
const solidAt = (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return b ? b.h : 1; };
const waterAt = (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return !!(b && b.water); };

// ---------------------------------------------------------------- clock
const isNight = () => S.g.time >= 13000 && S.g.time < 23000;
function daylight() {
  const t = S.g.time;
  if (t < 12000) return 1;
  if (t < 13500) return 1 - ((t - 12000) / 1500) * 0.82;
  if (t < 22500) return 0.18;
  return 0.18 + ((t - 22500) / 1500) * 0.82;
}
const dist0 = () => Math.hypot(S.player.pos[0] - S.g.origin[0], S.player.pos[2] - S.g.origin[1]);
const zoneLevel = () => 3 + Math.floor(dist0() / 40);
function biomeName(x, z) {
  const b = S.world.biomeAt(Math.floor(x), Math.floor(z));
  return b < 0 ? null : S.biomeNames[b];
}

// ---------------------------------------------------------------- messages
function toast(text, ms = 2800) {
  S.toastAt = performance.now();
  $('toast').textContent = text;
  $('toast').hidden = false;
  S.toastUntil = performance.now() + ms;
}
function hideToast() { $('toast').hidden = true; S.toastUntil = 0; }
function sign(text) {
  $('sign').textContent = text;
  $('sign').hidden = false;
  S.signUntil = performance.now() + 2600;
}
function updateMessages(now) {
  if (S.toastUntil && now > S.toastUntil) hideToast();
  if (S.signUntil && now > S.signUntil) { $('sign').hidden = true; S.signUntil = 0; }
}

// ---------------------------------------------------------------- HUD
function updateParty() {
  try { S.party = JSON.parse(S.runner.party_summary()); } catch { S.party = []; }
  const el = $('party');
  el.innerHTML = '';
  for (const p of S.party) {
    const row = document.createElement('div');
    row.className = 'mon' + (p.hp === 0 ? ' fainted' : '');
    const pct = p.max_hp ? Math.max(0, p.hp / p.max_hp) : 0;
    row.innerHTML = `<b>${p.species.toUpperCase()}</b><i>L${p.level}</i><span class="hp"><span style="width:${(pct * 100).toFixed(0)}%" class="${pct < 0.2 ? 'red' : pct < 0.5 ? 'yellow' : ''}"></span></span>`;
    el.appendChild(row);
  }
  const lead = S.party.find((p) => p.hp > 0);
  if (S.ents) S.ents.setFollower(lead ? lead.species : null);
  applyPerks(lead);
}

// ---------------------------------------------------------------- the lead's perks
/// Your lead Pokémon's types as survival perks (perks.js).
function applyPerks(lead) {
  if (S.testLead) lead = S.testLead;
  const key = lead ? lead.species + '|' + lead.types.join() : '';
  if (key === S.perkKey) return;
  const first = S.perkKey === undefined;
  S.perkKey = key;
  S.perks = perksFor(lead ? lead.types : []);
  if (S.surv) S.surv.perks = S.perks;
  if (S.player) S.player.mods = { swim: S.perks.swim || 1, jump: S.perks.jump || 1, glide: !!S.perks.glide };
  if (S.view) {
    S.view.setLightFloor(S.perks.floor || 0.035);
    if (!S.perks.hand) S.view.setHandLight(0, -999, 0, 0);
  }
  $('perk').innerHTML = lead ? S.perks.types.map((t) => `<b class="t-${t.toLowerCase()}">${t.toUpperCase()}</b>`).join('') : '';
  $('perk').title = S.perks.text.join('\n');
  if (lead && !first) toast(`${lead.species.toUpperCase()} leads. ${S.perks.text.join('. ')}.`, 4200);
}

/// The lead's party slot: the first Pokémon that hasn't fainted.
const leadIndex = () => S.party.findIndex((p) => p.hp > 0);

/// EXP for the lead, earned in the Minecraft world. Pokémon Red levels it up,
/// teaches it moves, and plays its evolution when one is due.
function giveExp(amount, from) {
  const i = leadIndex();
  if (i < 0 || amount <= 0 || S.mode !== 'world' || S.battle) return;
  let r = null;
  try { r = JSON.parse(S.runner.give_exp(i, Math.round(amount))); } catch { r = null; }
  if (!r) return;
  const name = r.species.toUpperCase();
  feed(`+${Math.round(amount)} EXP ${name}${from ? ' (' + from + ')' : ''}`);
  const f = S.ents.follower;
  if (f) S.view.burst(f.pos[0], f.pos[1] + 0.8, f.pos[2], [0.55, 1, 0.3], 10, 1.5, 2);
  if (r.level > r.old_level) {
    const nice = (m) => m.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    const moves = r.learned.map(nice).join(' and ');
    toast(`${name} grew to LV ${r.level}!${moves ? ` ${name} learned ${moves}!` : ''}${r.blocked.length ? ` (It wants to learn ${r.blocked.map(nice).join(', ')}, but knows 4 moves.)` : ''}${r.evolves ? ` What? ${name} is evolving!` : ''}`, 3800);
  }
  updateParty();
}

/// Your follower takes a hit from a Minecraft monster: real HP off the real Pokémon.
function followerHurt(type, dmg) {
  const i = leadIndex();
  if (i < 0 || S.mode !== 'world' || S.battle) return;
  const mon = S.party[i];
  const hp = Math.max(1, Math.round(dmg * mon.max_hp / 40));
  let left = 0;
  try { left = S.runner.hurt_party(i, hp); } catch { return; }
  const f = S.ents.follower;
  if (f) S.view.burst(f.pos[0], f.pos[1] + 0.8, f.pos[2], [0.9, 0.15, 0.15], 6, 2, 1.5);
  if (left === 0) toast(`${mon.species.toUpperCase()} fainted fighting the ${type.toUpperCase()}!`, 3000);
  updateParty();
}

// Minecraft gives XP for these ores; here the XP goes to your lead Pokémon.
const ORE_EXP = { coal_ore: [0, 2], deepslate_coal_ore: [0, 2], diamond_ore: [3, 7], deepslate_diamond_ore: [3, 7], emerald_ore: [3, 7], deepslate_emerald_ore: [3, 7],
  lapis_ore: [2, 5], deepslate_lapis_ore: [2, 5], redstone_ore: [1, 5], deepslate_redstone_ore: [1, 5], nether_quartz_ore: [2, 5], nether_gold_ore: [0, 1] };
// Base EXP per monster beaten, as Pokémon would give for a wild one (× level / 7).
const MOB_EXP = { zombie: 60, husk: 65, drowned: 65, skeleton: 70, stray: 75, spider: 60, creeper: 90 };
// A Fire-type lead cooks raw food as you eat it.
const COOKED = { beef: 'cooked_beef', porkchop: 'cooked_porkchop', chicken: 'cooked_chicken', mutton: 'cooked_mutton', cod: 'cooked_cod', salmon: 'cooked_salmon', potato: 'baked_potato', rabbit: 'cooked_rabbit' };

/// An Ice-type lead freezes the water you walk onto; it melts behind you.
function frostWalk() {
  const p = S.player, ice = S.names.indexOf('frosted_ice'), water = S.names.indexOf('water');
  const y = Math.floor(p.pos[1] - 0.5);
  if (p.inWater || ice < 0) return;
  S.frost = S.frost || [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.floor(p.pos[0]) + dx, z = Math.floor(p.pos[2]) + dz;
    if (S.world.block(x, y, z) === water && blockInfo(S.world.block(x, y + 1, z))?.air) {
      edit(x, y, z, ice);
      S.frost.push({ x, y, z, t: performance.now() });
    }
  }
}
function meltFrost() {
  if (!S.frost || !S.frost.length) return;
  const now = performance.now(), p = S.player.pos, water = S.names.indexOf('water'), ice = S.names.indexOf('frosted_ice');
  S.frost = S.frost.filter((f) => {
    const under = Math.abs(f.x + 0.5 - p[0]) < 1.3 && Math.abs(f.z + 0.5 - p[2]) < 1.3 && Math.abs(f.y + 1 - p[1]) < 1.5;
    if (now - f.t < 7000 || under) return true;
    if (S.world.block(f.x, f.y, f.z) === ice) edit(f.x, f.y, f.z, water);
    return false;
  });
}

/// A Psychic-type lead senses monsters coming, and where.
function sense() {
  const p = S.player;
  for (const m of S.mobs.list) {
    if (!m.k.hostile || m.sensed) continue;
    const dx = m.body.pos[0] - p.pos[0], dz = m.body.pos[2] - p.pos[2];
    if (Math.hypot(dx, dz) > 22) continue;
    m.sensed = true;
    let a = Math.atan2(-dx, -dz) - p.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const where = Math.abs(a) < 0.8 ? 'ahead' : Math.abs(a) > 2.3 ? 'behind you' : a > 0 ? 'to your left' : 'to your right';
    feed(`${S.party[leadIndex()]?.species.toUpperCase() || 'Your POKéMON'} senses a ${m.type.toUpperCase()} ${where}`);
    return;
  }
}

function updateHud() {
  const g = S.g;
  const hours = Math.floor(g.time / 1000 + 6) % 24, mins = Math.floor((g.time % 1000) * 0.06);
  $('clock').textContent = `${isNight() ? 'NIGHT' : 'DAY'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  $('zone').textContent = `WILD LV~${zoneLevel()}`;
}

/// CSS for an item's icon: a block face from the block atlas, or an item picture.
function iconCss(id) {
  const ic = W.icons[id];
  if (!ic) return '';
  const blockIcon = ic.b !== undefined;
  const tile = blockIcon ? ic.b : ic.i;
  const cols = 32, rows = blockIcon ? S.atlasRows : S.itemRows;
  const url = blockIcon ? S.atlasUrl : S.itemsUrl;
  return `background-image:url(${url});background-size:${cols * 100}% ${rows * 100}%;background-position:${((tile % cols) / (cols - 1)) * 100}% ${(Math.floor(tile / cols) / Math.max(1, rows - 1)) * 100}%`;
}

function renderHotbar() {
  const el = $('hotbar');
  el.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const slot = S.inv.slots[i];
    const d = document.createElement('div');
    d.className = 'slot' + (i === S.inv.sel ? ' sel' : '');
    d.dataset.slot = i;
    if (slot) {
      d.style.cssText = iconCss(slot.id);
      d.innerHTML = slot.n > 1 ? `<span>${slot.n}</span>` : '';
    }
    el.appendChild(d);
  }
  const held = S.inv.held;
  if (held !== S.lastHeld) {
    S.lastHeld = held;
    if (held) {
      $('itemname').textContent = S.items.name(held);
      $('itemname').hidden = false;
      S.itemNameUntil = performance.now() + 1800;
    }
  }
}
function selectSlot(i) { S.inv.sel = i; renderHotbar(); }

/// A line in the pickup feed: "+3 Cobblestone".
function feed(text) {
  const el = $('feed');
  const line = document.createElement('div');
  line.textContent = text;
  el.prepend(line);
  while (el.children.length > 5) el.lastChild.remove();
  setTimeout(() => line.classList.add('old'), 2600);
  setTimeout(() => line.remove(), 3400);
}
function gain(item, n) {
  const left = S.inv.add(item, n);
  if (n - left > 0) feed(`+${n - left} ${S.items.name(item)}`);
  if (left) feed(`No room for ${S.items.name(item)}`);
}

/// Pokémon's bag gets an item (crafted, or found in an ore).
function givePoke(name, n = 1) {
  try { return S.runner.give_item(name, n); } catch { return false; }
}

// ---------------------------------------------------------------- the Pokémon layer
const gbCanvas = $('gb');
const gb = gbCanvas.getContext('2d');
const layer = document.createElement('canvas');
layer.width = 160; layer.height = 144;
const lg = layer.getContext('2d');
const layerImg = lg.createImageData(160, 144);

/// Draw Pokémon's frame: opaque screens as they are; over the world, only
/// what Pokémon drew (menus, text, HUD), with a pale panel behind the
/// battle HUD so it reads against the world.
function drawLayer(px, screen) {
  // The battle's opening wipe (black over a see-through screen) becomes a
  // fade of the whole view, not a black box over part of it.
  if (screen === 'Battle') {
    let black = 0, other = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      if (px[i] < 16 && px[i + 1] < 16 && px[i + 2] < 16) black++; else other++;
    }
    if (!other && black > 160 * 144 * 0.3) {
      $('fade').style.opacity = String(Math.min(1, black / (160 * 144) * 1.4));
      gb.clearRect(0, 0, 160, 144);
      S.fading = true;
      return;
    }
  }
  if (S.fading && !S.sleep) { $('fade').style.opacity = '0'; S.fading = false; }
  // An evolution happens out in the world: its white backdrop is keyed out.
  if (screen === 'Evolution') {
    for (let i = 0; i < px.length; i += 4) if (px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232) px[i + 3] = 0;
  }
  layerImg.data.set(px);
  lg.putImageData(layerImg, 0, 0);
  gb.clearRect(0, 0, 160, 144);
  if ((screen === 'Battle' && S.opaque < 160 * 144) || screen === 'Evolution') {
    // Pale panels behind the HUD rows so they read over the world (not behind an evolving Pokémon).
    for (const [y0, y1] of screen === 'Evolution' ? [[96, 144]] : [[0, 40], [40, 96], [96, 144]]) {
      let minx = 160, miny = 144, maxx = -1, maxy = -1;
      for (let y = y0; y < y1; y++) for (let x = 0; x < 160; x++) {
        if (px[(y * 160 + x) * 4 + 3]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      }
      if (maxx < 0) continue;
      gb.fillStyle = 'rgba(248,248,240,0.92)';
      gb.fillRect(Math.max(0, minx - 3), Math.max(0, miny - 2), Math.min(160, maxx + 4) - Math.max(0, minx - 3), Math.min(144, maxy + 3) - Math.max(0, miny - 2));
    }
  }
  gb.drawImage(layer, 0, 0);
}

// ---------------------------------------------------------------- battles in the world
function startBattle(kind, ent) {
  if (S.battle || S.mode !== 'world') return;
  const r = S.runner;
  try {
    if (kind === 'trainer') r.start_trainer_battle(ent.trainer.cls, ent.trainer.index);
    else r.start_wild_battle(ent.species, ent.level);
  } catch (e) { console.warn(e); return; }
  ent.inBattle = true;
  const p = S.player;
  const ex = ent.pos[0], ez = ent.pos[2];
  let dx = ex - p.pos[0], dz = ez - p.pos[2];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  // Pixelmon-style: you stay where you are and watch; your Pokémon comes out
  // a couple of blocks ahead of you, a little to the left.
  // The opponent comes to a spot about 5 blocks off that you can see:
  // straight ahead if it can, otherwise a little to either side.
  let d = Math.hypot(ex - p.pos[0], ez - p.pos[2]);
  const eye = p.eye();
  const seen = (x, y, z) => clearLine(eye, [x, y + 0.6, z]);
  // Too close fills the screen (a Pokémon out of the grass at your feet, or
  // one that ran into you): it hops back to battle distance.
  if (d > 6 || d < 3.5 || !seen(ex, ent.pos[1], ez)) {
    const base = Math.atan2(dx, dz);
    let found = false;
    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1]) {
      for (const want of [5, 4, 6, 3.5, 3]) {
        const a = base + turn, nx = p.pos[0] + Math.sin(a) * want, nz = p.pos[2] + Math.cos(a) * want;
        const gg = S.ents.ground(nx, p.pos[1] + 3, nz);
        if (gg && gg.water === !!ent.water && Math.abs(gg.y - p.pos[1]) < 4 && seen(nx, gg.y, nz)) {
          ent.pos = [nx, gg.y, nz]; d = want; dx = Math.sin(a); dz = Math.cos(a); found = true; break;
        }
      }
      if (found) break;
    }
  }
  const ahead = Math.min(2.6, Math.max(1.4, d * 0.5));
  const mx = p.pos[0] + dx * ahead + dz * 1.3, mz = p.pos[2] + dz * ahead - dx * 1.3;
  const g = S.ents.ground(mx, p.pos[1] + 2, mz);
  S.battle = {
    kind, ent, dir: [dx, dz], enemyPos: [ent.pos[0], ent.pos[1], ent.pos[2]],
    monPos: [mx, g ? g.y : p.pos[1], mz], eye: p.eye(),
    enemyRoot: null, monRoot: null, enemySpecies: null, monSpecies: null,
  };
  if (kind === 'wild') { S.battle.enemyRoot = ent.root; S.battle.enemySpecies = ent.species; }
  if (S.ents.follower) S.ents.follower.root.visible = false;
  S.mode = 'poke';
  S.clearFor = 0;
}

/// Nothing solid (leaves aside) on the straight line from a to b.
function clearLine(a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 4);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const bi = blockInfo(S.world.block(Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t), Math.floor(a[2] + (b[2] - a[2]) * t)));
    if (!bi || (bi.h > 0 && !bi.leaves)) return false;
  }
  return true;
}

function stageBattle() {
  const b = S.battle, r = S.runner, view = S.view;
  let v = null;
  try { v = JSON.parse(r.battle_view()); } catch { v = null; }
  const [dx, dz] = b.dir;
  const rx = -dz, rz = dx; // to the right, looking at the opponent
  // Enemy picture (a trainer's Pokémon appears in front of the trainer).
  if (v && v.enemy !== b.enemySpecies) {
    const pic = S.ents.spritePic(v.enemy, false);
    if (pic) {
      if (b.kind === 'wild' && b.enemyRoot) view.repaint(b.enemyRoot, pic.cell, pic.height);
      else {
        if (b.enemyRoot && b.enemyRoot !== b.ent.root) view.drop(b.enemyRoot);
        b.enemyRoot = view.sprite(pic.cell, pic.height);
        const ep = [b.ent.pos[0] - dx * 1.6, b.ent.pos[1], b.ent.pos[2] - dz * 1.6];
        const g = S.ents.ground(ep[0], ep[1] + 1, ep[2]);
        b.enemyPos = [ep[0], g ? g.y : ep[1], ep[2]];
      }
      b.enemySpecies = v.enemy;
    }
  }
  if (v && v.player !== b.monSpecies) {
    const pic = S.ents.spritePic(v.player, true);
    if (pic) {
      if (b.monRoot) view.repaint(b.monRoot, pic.cell, pic.height);
      else b.monRoot = view.sprite(pic.cell, pic.height);
      b.monSpecies = v.player;
    }
  }
  if (b.enemyRoot) {
    const off = v ? v.enemy_dx / 20 : 0, up = v ? -v.enemy_dy / 20 : 0;
    b.enemyRoot.position.set(b.enemyPos[0] + rx * off, b.enemyPos[1] + up, b.enemyPos[2] + rz * off);
    b.enemyRoot.visible = !!(v && v.enemy_shown);
  }
  if (b.monRoot) {
    const off = v ? v.player_dx / 20 : 0, up = v ? -v.player_dy / 20 : 0;
    b.monRoot.position.set(b.monPos[0] + rx * off, b.monPos[1] + up, b.monPos[2] + rz * off);
    b.monRoot.visible = !!(v && v.player_shown);
  }
  // Camera: your own eyes, turned toward the opponent, which sits up and to
  // the right of centre like on the Game Boy.
  const cam = view.camera;
  const eh = b.enemyRoot ? b.enemyRoot.userData.height : 1;
  cam.position.set(b.eye[0], b.eye[1], b.eye[2]);
  cam.lookAt(b.enemyPos[0] - rx * 1.0, b.enemyPos[1] + eh * 0.1, b.enemyPos[2] - rz * 1.0);
  if (b.monRoot) view.face(b.monRoot);
  if (b.enemyRoot) view.face(b.enemyRoot);
}

function endBattle(outcome) {
  const b = S.battle;
  S.battle = null;
  if (!b) return;
  const view = S.view;
  if (b.monRoot) view.drop(b.monRoot);
  if (b.enemyRoot && b.enemyRoot !== b.ent.root) view.drop(b.enemyRoot);
  b.ent.inBattle = false;
  S.grace = 3; // a few steps of peace after a fight
  if (b.kind === 'wild') {
    if (outcome === 'Win' || outcome === 'Captured' || b.ent.hidden) S.ents.remove(b.ent);
    else {
      b.ent.root.visible = true;
      b.ent.aggressive = false;
      b.ent.cooldown = 8;
      if (b.enemySpecies !== b.ent.species) { const pic = S.ents.spritePic(b.ent.species, false); view.repaint(b.ent.root, pic.cell, pic.height); }
    }
  } else if (b.kind === 'trainer') {
    if (outcome !== 'Loss') b.ent.beaten = true;
    if (b.ent.alert) { view.scene.remove(b.ent.alert); b.ent.alert = null; }
    b.ent.life = 60 * 60;
  }
  if (S.ents.follower) S.ents.follower.root.visible = true;
}

// ---------------------------------------------------------------- a thrown Poké Ball
let ballTex = null;
function ballSprite() {
  if (!ballTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d');
    x.fillStyle = '#e8302c'; x.beginPath(); x.arc(8, 8, 7, Math.PI, 0); x.fill();
    x.fillStyle = '#f8f8f0'; x.beginPath(); x.arc(8, 8, 7, 0, Math.PI); x.fill();
    x.fillStyle = '#181818'; x.fillRect(1, 7, 14, 2); x.beginPath(); x.arc(8, 8, 2.6, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f8f8f0'; x.beginPath(); x.arc(8, 8, 1.4, 0, Math.PI * 2); x.fill();
    ballTex = c;
  }
  return ballTex;
}
function throwBall() {
  if (S.ball) return;
  if (!S.party.some((p) => p.hp > 0)) { toast('Your POKéMON have no strength left. Rest or visit a NURSE.'); return; }
  const p = S.player;
  const eye = p.eye(), dir = p.look();
  const target = S.ents.pick(eye, dir, 28);
  const end = target && (target.kind === 'wild' || (target.kind === 'trainer' && !target.beaten))
    ? [target.pos[0], target.pos[1] + 0.6, target.pos[2]]
    : [eye[0] + dir[0] * 10, eye[1] + dir[1] * 10, eye[2] + dir[2] * 10];
  const sprite = S.view.sprite3(ballSprite());
  sprite.scale.setScalar(0.35);
  S.ball = { t: 0, from: [eye[0] + dir[0] * 0.6, eye[1] - 0.3, eye[2] + dir[2] * 0.6], to: end, target, sprite };
}
function updateBall() {
  const b = S.ball;
  if (!b) return;
  b.t += DT / 0.55;
  const t = Math.min(1, b.t);
  const pos = b.from.map((v, i) => v + (b.to[i] - v) * t);
  pos[1] += Math.sin(Math.PI * t) * 1.4;
  b.sprite.position.set(...pos);
  if (t >= 1) {
    S.view.scene.remove(b.sprite);
    S.ball = null;
    if (b.target && S.mode === 'world') {
      const lead = S.party.find((x) => x.hp > 0);
      if (lead) toast(`Go! ${lead.species.toUpperCase()}!`, 1400);
      startBattle(b.target.kind === 'trainer' ? 'trainer' : 'wild', b.target);
    }
  }
}

// ---------------------------------------------------------------- doing things
function targetBlock() {
  const p = S.player;
  return raycast(p.eye(), p.look(), REACH, (x, y, z) => {
    const b = blockInfo(S.world.block(x, y, z));
    return b && !b.air && !b.water;
  });
}

function interact() {
  const p = S.player;
  const eye = p.eye(), dir = p.look();
  const ent = S.ents.pick(eye, dir, 4.5);
  if (ent) return talk(ent);
  const held = S.inv.held;
  if (held === 'fishing_rod') return fish();
  const hit = targetBlock();
  const name = hit ? S.names[S.world.block(hit.x, hit.y, hit.z)] : null;
  if (name && /_bed$/.test(name)) return sleep(hit);
  if (name === 'crafting_table') { S.inv.show('craft'); return; }
  if (name && /^(furnace|smoker|blast_furnace)$/.test(name)) { S.inv.show('furnace'); return; }
  if (name === 'bell') { toast('DING! The village NURSE and CLERK are right here.'); return; }
  if (held && S.items.food(held)) {
    if (S.surv.food >= 20) toast("You're not hungry.", 1200);
    return; // eating happens while you hold USE
  }
  if (hit && held && S.items.isBlock(held)) place(hit, held);
}

function talk(e) {
  const r = S.runner;
  if (e.kind === 'wild') return startBattle('wild', e);
  if (e.kind === 'trainer') {
    if (e.beaten) { toast('TRAINER: You beat me fair and square.'); return; }
    return startBattle('trainer', e);
  }
  if (e.kind === 'nurse') {
    r.heal_party();
    S.surv.heal(20);
    S.g.spawn = [e.pos[0], e.pos[1], e.pos[2] + 1];
    toast('NURSE: Your POKéMON are fighting fit, and so are you! (You will wake up here.)', 3600);
    saveAll('nurse');
    return;
  }
  if (e.kind === 'clerk' || e.kind === 'merchant') {
    r.open_shop(shopStock().join(','));
  }
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

function sleep(hit) {
  if (!isNight()) { toast('You can only sleep at night.'); return; }
  const near = (x, z) => Math.hypot(x - S.player.pos[0], z - S.player.pos[2]) < 8;
  if (S.ents.list.some((e) => e.kind === 'wild' && e.aggressive && near(e.pos[0], e.pos[2])) || S.mobs.list.some((m) => m.k.hostile && near(m.body.pos[0], m.body.pos[2]))) {
    toast('You may not rest now; there are monsters nearby.');
    return;
  }
  S.sleep = { t: 0, bed: [hit.x + 0.5, hit.y + 1, hit.z + 0.5] };
}
function sleepStep() {
  const s = S.sleep;
  s.t++;
  $('fade').style.opacity = String(s.t < 60 ? s.t / 60 : Math.max(0, 1 - (s.t - 60) / 60));
  if (s.t === 60) {
    S.runner.heal_party();
    S.surv.heal(20);
    S.g.time = 0;
    S.g.spawn = s.bed;
    S.mobs.clearAll();
  }
  if (s.t >= 120) {
    S.sleep = null;
    $('fade').style.opacity = '0';
    toast('You slept until morning. Your POKéMON are healed, and you will wake up here.', 3400);
    saveAll('sleep');
  }
}

function place(hit, held) {
  const x = hit.x + hit.face[0], y = hit.y + hit.face[1], z = hit.z + hit.face[2];
  const here = blockInfo(S.world.block(x, y, z));
  if (!here || !(here.air || here.water || here.shape === 'cross' || here.shape === 'flat')) return;
  // Not inside yourself.
  const p = S.player.pos;
  const solid = W.blocks[held] && W.blocks[held].c;
  if (solid && x + 1 > p[0] - 0.3 && x < p[0] + 0.3 && z + 1 > p[2] - 0.3 && z < p[2] + 0.3 && y + 1 > p[1] && y < p[1] + 1.8) return;
  const id = S.names.indexOf(held);
  if (id < 0) return;
  edit(x, y, z, id);
  S.inv.useHeld();
}

function edit(x, y, z, id) {
  S.world.set(x, y, z, id);
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  const k = cx + ',' + cz;
  (S.edits[k] = S.edits[k] || {})[`${x - cx * 16},${y},${z - cz * 16}`] = id;
}

// Average colour of each block texture, for the bits that fly off.
const tileColours = new Map();
function tileColour(tile) {
  if (tileColours.has(tile)) return tileColours.get(tile);
  if (!S.atlasData) {
    const c = document.createElement('canvas');
    c.width = S.atlasImg.width; c.height = S.atlasImg.height;
    const g = c.getContext('2d');
    g.drawImage(S.atlasImg, 0, 0);
    S.atlasData = g.getImageData(0, 0, c.width, c.height);
  }
  const d = S.atlasData, w = d.width, sx = (tile % 32) * 16, sy = Math.floor(tile / 32) * 16;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = ((sy + y) * w + sx + x) * 4;
    if (d.data[i + 3] < 128) continue;
    r += d.data[i]; gg += d.data[i + 1]; b += d.data[i + 2]; n++;
  }
  const out = n ? [r / n / 255, gg / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
  tileColours.set(tile, out);
  return out;
}

function clearCrack() {
  if (S.mining) { S.mining = null; S.view.setCrack(0, 0, 0, -1); }
}

/// Hold MINE: hit what's alive in front of you, else break the block.
function mine() {
  const p = S.player, eye = p.eye(), dir = p.look();
  const hit = targetBlock();
  const mob = S.mobs.pick(eye, dir, 3.6);
  if (mob && (!hit || Math.hypot(mob.body.pos[0] - eye[0], mob.body.pos[2] - eye[2]) < hit.t + 0.5)) {
    clearCrack();
    if (S.attackCool <= 0) {
      S.attackCool = 0.55;
      S.mobs.damage(mob, S.items.damage(S.inv.held) + (S.perks.melee || 0), p.pos);
      S.view.burst(mob.body.pos[0], mob.body.pos[1] + 1, mob.body.pos[2], [0.8, 0.1, 0.1], 6, 2, 1.5);
    }
    return;
  }
  if (!hit) { clearCrack(); return; }
  const name = S.names[S.world.block(hit.x, hit.y, hit.z)];
  const bt = S.items.breakTime(name, S.inv.held);
  if (bt.t === Infinity) return;
  const want = S.items.wants(name).kind;
  const fast = (want === 'pickaxe' && S.perks.mine) || (want === 'shovel' && S.perks.dig) || 1;
  bt.t /= fast;
  const key = `${hit.x},${hit.y},${hit.z}`;
  if (!S.mining || S.mining.key !== key) S.mining = { key, t: 0 };
  S.mining.t += DT;
  const k = S.mining.t / bt.t;
  S.view.setCrack(hit.x, hit.y, hit.z, Math.min(9, Math.floor(k * 10)), W.destroy, 32);
  if (k < 1) return;
  clearCrack();
  const info = blockInfo(S.world.block(hit.x, hit.y, hit.z));
  S.view.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, tileColour(info.tile), 16, 3, 2.5);
  edit(hit.x, hit.y, hit.z, S.names.indexOf('air'));
  // A double plant's other half goes too.
  for (const dy of [1, -1]) if (S.names[S.world.block(hit.x, hit.y + dy, hit.z)] === name && W.blocks[name] && W.blocks[name].s === 'cross') edit(hit.x, hit.y + dy, hit.z, S.names.indexOf('air'));
  if (!bt.drops) { toast(`You need a better pickaxe to get anything from ${S.items.name(name)}.`, 2200); return; }
  for (const d of S.items.drops(name)) {
    if (d.poke) {
      if (givePoke(d.poke)) toast(`You found a ${d.poke.replace(/_/g, ' ')}! It's in your POKéMON bag.`, 3000);
    } else gain(d[0], d[1]);
  }
  const ore = ORE_EXP[name];
  if (ore) {
    const xp = ore[0] + Math.floor(Math.random() * (ore[1] - ore[0] + 1));
    if (xp) giveExp(xp * 6, S.items.name(name));
  }
}

// ---------------------------------------------------------------- fishing
let bobberC = null;
function bobberCanvas() {
  if (bobberC) return bobberC;
  bobberC = document.createElement('canvas');
  bobberC.width = bobberC.height = 8;
  const x = bobberC.getContext('2d');
  x.fillStyle = '#d83a34'; x.fillRect(1, 0, 6, 4);
  x.fillStyle = '#f8f8f0'; x.fillRect(1, 4, 6, 3);
  return bobberC;
}
function fish() {
  const f = S.fishing;
  if (f) {
    if (f.phase === 'bite') landCatch(f);
    else toast('Nothing on the line yet.', 1200);
    stopFishing();
    return;
  }
  const p = S.player;
  const hit = raycast(p.eye(), p.look(), 18, (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return b && (b.water || b.h > 0); });
  if (!hit || !blockInfo(S.world.block(hit.x, hit.y, hit.z)).water) { toast('Cast your line at water.', 1600); return; }
  const sprite = S.view.sprite3(bobberCanvas());
  sprite.scale.setScalar(0.28);
  const pos = [hit.x + 0.5, hit.y + 0.92, hit.z + 0.5];
  sprite.position.set(...pos);
  S.fishing = { phase: 'wait', t: 3 + Math.random() * 7, pos, sprite };
}
function fishStep() {
  const f = S.fishing;
  f.t -= DT;
  const p = S.player.pos;
  if (S.inv.held !== 'fishing_rod' || Math.hypot(p[0] - f.pos[0], p[2] - f.pos[2]) > 26) { stopFishing(); return; }
  const dip = f.phase === 'bite' ? -0.25 + Math.sin(f.t * 30) * 0.06 : Math.sin(performance.now() / 300) * 0.04;
  f.sprite.position.set(f.pos[0], f.pos[1] + dip, f.pos[2]);
  if (f.phase === 'wait' && f.t <= 0) {
    f.phase = 'bite';
    f.t = 1.1;
    S.view.burst(f.pos[0], f.pos[1], f.pos[2], [0.6, 0.75, 1], 14, 2, 2);
    toast('! Something bit! Press USE!', 1100);
  } else if (f.phase === 'bite' && f.t <= 0) {
    toast('It got away…', 1400);
    stopFishing();
  }
}
function stopFishing() {
  if (!S.fishing) return;
  S.view.scene.remove(S.fishing.sprite);
  S.fishing = null;
}
function landCatch(f) {
  if (Math.random() < 0.65 && canBattle()) {
    const level = levelAt(dist0(), Math.random, isNight());
    const species = fished(level, Math.random);
    const ent = S.ents.makeMon(species, level, f.pos[0], f.pos[1] - 0.9, f.pos[2], { water: true, hidden: true });
    if (ent) { toast(`A wild ${species.toUpperCase()} is on the line!`, 1600); startBattle('wild', ent); }
    return;
  }
  const r = Math.random();
  const item = r < 0.55 ? 'cod' : r < 0.8 ? 'salmon' : r < 0.86 ? 'pufferfish' : ['stick', 'string', 'bone', 'lily_pad', 'leather'][Math.floor(Math.random() * 5)];
  gain(W.icons[item] ? item : 'cod', 1);
}

// ---------------------------------------------------------------- Pokémon in the grass
const canBattle = () => S.party.some((p) => p.hp > 0) && !S.battle && S.mode === 'world' && !S.sleep && !S.surv.dead;
const HIDE_RE = /^(short_grass|tall_grass|fern|large_fern|bush|short_dry_grass|tall_dry_grass|sweet_berry_bush)$/;

/// Where your feet are: 'grass', 'snow', 'water', 'cave' or null.
function terrainHere() {
  const p = S.player;
  const x = Math.floor(p.pos[0]), y = Math.floor(p.pos[1] + 0.05), z = Math.floor(p.pos[2]);
  if (p.inWater) return 'water';
  const feet = blockInfo(S.world.block(x, y, z)), under = blockInfo(S.world.block(x, y - 1, z));
  if (feet && HIDE_RE.test(feet.name)) return 'grass';
  if ((feet && /^(snow|powder_snow)$/.test(feet.name)) || (under && /^(snow_block|powder_snow)$/.test(under.name))) return 'snow';
  if (y < 60 && !skyOpen([x + 0.5, y, z + 0.5])) return 'cave';
  return null;
}

/// Nothing solid between this spot and the sky.
function skyOpen(pos) {
  const x = Math.floor(pos[0]), z = Math.floor(pos[2]);
  for (let y = Math.floor(pos[1]) + 2; y < Math.floor(pos[1]) + 48; y++) {
    const b = blockInfo(S.world.block(x, y, z));
    if (!b) return true;
    if (b.h > 0 && !b.leaves) return false;
  }
  return true;
}

function stepEncounters(moved) {
  if (!canBattle()) return;
  S.stepDist += moved;
  if (S.stepDist < 1) return;
  S.stepDist -= 1;
  if (S.grace > 0) { S.grace--; return; }
  const terrain = terrainHere();
  const rate = { grass: 1 / 9, snow: 1 / 12, water: 1 / 12, cave: 1 / 22 }[terrain];
  if (!rate || Math.random() >= rate) return;
  const p = S.player;
  const night = isNight();
  const level = levelAt(dist0(), Math.random, night);
  const species = hiding(terrain, biomeName(p.pos[0], p.pos[2]) || 'plains', level, Math.random, night);
  const d = p.look(), l = Math.hypot(d[0], d[2]) || 1;
  const x = p.pos[0] + (d[0] / l) * 2.2, z = p.pos[2] + (d[2] / l) * 2.2;
  const g = S.ents.ground(x, p.pos[1] + 2, z);
  const ent = S.ents.makeMon(species, level, x, g ? g.y : p.pos[1], z, { water: terrain === 'water', hidden: true });
  if (!ent) return;
  const colour = { grass: [0.35, 0.7, 0.25], snow: [0.95, 0.95, 1], water: [0.45, 0.6, 1], cave: [0.45, 0.42, 0.4] }[terrain];
  S.view.burst(x, ent.pos[1] + 0.4, z, colour, 24, 3, 3);
  const where = { grass: 'out of the grass', snow: 'out of the snow', water: 'out of the water', cave: 'out of the dark' }[terrain];
  toast(`A wild ${species.toUpperCase()} jumped ${where}!`, 1600);
  startBattle('wild', ent);
}

// ---------------------------------------------------------------- the loop
function worldStep(first) {
  const c = S.controls, p = S.player;
  S.g.time = (S.g.time + 20 / 60) % DAY_TICKS;
  if (S.sleep) { sleepStep(); return; }
  if (S.surv.dead) return;
  if (S.attackCool > 0) S.attackCool -= DT;
  const [lx, ly] = c.takeLook();
  if (S.inv.open) {
    // Bag open: you stand where you are (the world doesn't wait).
    if (first && (c.pressed('inv') || c.pressed('start') || c.pressed('b'))) S.inv.hide();
    p.step(DT, [0, 0], false, false, solidAt, waterAt);
    return;
  }
  p.yaw -= lx;
  p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - ly));
  if (c.slot >= 0) { selectSlot(c.slot); c.slot = -1; }
  if (c.wheel) { selectSlot((S.inv.sel + Math.sign(c.wheel) + 9) % 9); c.wheel = 0; }
  if (first && c.pressed('inv')) { S.inv.show(); return; }
  if (first && c.pressed('start')) { S.startEdge = true; return; }
  if (first && c.pressed('a')) interact();
  if (first && c.pressed('ball')) throwBall();
  // Eating: hold USE with food in hand.
  const held = S.inv.held, pts = held ? S.items.food(held) : 0;
  if (pts && c.down('a') && S.surv.food < 20) {
    const cooked = S.perks.cook && COOKED[held];
    if (S.surv.eat(cooked ? S.items.food(cooked) || pts : pts, true, DT)) {
      S.inv.useHeld();
      feed(cooked ? `Ate ${S.items.name(cooked)} (cooked by your FIRE POKéMON)` : `Ate ${S.items.name(held)}`);
    }
    if (S.frames % 8 === 0) S.view.burst(...p.eye().map((v, i) => v + p.look()[i] * 0.6), tileColour(W.icons[held] && W.icons[held].b !== undefined ? W.icons[held].b : 0), 2, 1, 1);
  } else S.surv.eating = 0;
  if (S.fishing) fishStep();
  if (c.down('mine') || c.down('b')) mine();
  else clearCrack();
  const before = [p.pos[0], p.pos[2]];
  const sprint = (c.down('sprint') || (TOUCH && Math.hypot(...c.stick) > 0.95)) && S.surv.food > 6;
  p.step(DT, c.move(), c.down('jump'), sprint, solidAt, waterAt);
  const moved = Math.hypot(p.pos[0] - before[0], p.pos[2] - before[1]);
  const fx = Math.floor(p.pos[0]), fz = Math.floor(p.pos[2]);
  const head = blockInfo(S.world.block(fx, Math.floor(p.pos[1] + 1.62), fz));
  const feet = blockInfo(S.world.block(fx, Math.floor(p.pos[1] + 0.1), fz));
  const sunlit = S.perks.sunHeal && !isNight() && S.frames % 30 === 0 ? skyOpen([p.pos[0], p.pos[1] + 1, p.pos[2]]) : S.sunlit;
  S.sunlit = sunlit;
  S.surv.step(DT, p, { headInWater: !!(head && head.water), inLava: !!(feet && feet.lava), sprinting: sprint && moved > 0.01, moving: moved > 0.01, sunlit: sunlit && !isNight() });
  if (S.perks.frost) frostWalk();
  if (S.frames % 20 === 0) meltFrost();
  if (S.perks.sense && S.frames % 90 === 0) sense();
  stepEncounters(moved);
  if (p.pos[1] < -80) { S.surv.hurtCool = 0; S.surv.hurt(40, 'void'); }
}

function respawn(msg) {
  const [x, y, z] = S.g.spawn;
  S.player.pos = [x, y + 0.1, z];
  S.player.vel = [0, 0, 0];
  S.surv.fallFrom = null;
  if (msg) toast(msg, 3200);
}

function died(cause) {
  const why = { fall: 'You fell from a high place.', drowning: 'You drowned.', lava: 'You tried to swim in lava.', starving: 'You starved.', void: 'You fell out of the world.', creeper: 'You were blown up by a CREEPER.', arrow: 'You were shot by a SKELETON.' }[cause]
    || `You were slain by a ${String(cause || 'monster').replace(/_/g, ' ').toUpperCase()}.`;
  $('dead-why').textContent = why;
  $('dead').hidden = false;
  stopFishing();
  clearCrack();
  if (document.pointerLockElement) document.exitPointerLock?.();
}
function revive() {
  $('dead').hidden = true;
  S.surv.revive();
  S.mobs.clearAll();
  respawn('You woke up where you last rested.');
  saveAll('respawn');
}

function tickOnce(first) {
  const r = S.runner, c = S.controls;
  let mask = 0;
  if (S.mode === 'world') {
    S.startEdge = false;
    worldStep(first);
    mask = S.startEdge ? GB.START : 0;
  } else {
    if (S.sleep) sleepStep();
    // A tap on Pokémon's screen steers its ▶ to the tapped option (touchgb.js).
    if (S.touchGb.goal) S.touchGb.step(S.lastPx);
    mask = c.gbMask();
  }
  updateBall();
  const frozen = S.mode !== 'world' || !!S.sleep || S.surv.dead;
  S.ents.update(DT, frozen);
  S.mobs.update(DT, frozen);
  const px = r.tick_layers(mask);
  S.lastPx = px;
  let opaque = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]) opaque++;
  S.opaque = opaque;
  S.frames++;
  const screen = r.screen_name();
  S.screen = screen.startsWith('Shop') ? 'Shop' : r.evolving() ? 'Evolution' : screen;
  if (S.mode === 'world') {
    if (screen !== 'Overworld' || opaque > 0) {
      S.mode = 'poke';
      S.clearFor = 0;
      $('sign').hidden = true;
      if (performance.now() - (S.toastAt || 0) > 500) hideToast();
    }
  } else if (screen === 'Overworld' && opaque === 0) {
    if (++S.clearFor >= 2) backToWorld();
  } else S.clearFor = 0;
  if (screen === 'SaveMenu') S.sawSaveMenu = true;
  else if (S.sawSaveMenu) { S.sawSaveMenu = false; saveAll('save menu'); }
  return px;
}

function backToWorld() {
  const r = S.runner;
  S.mode = 'world';
  S.clearFor = 0;
  S.controls.lock();
  const outcome = r.take_battle_outcome();
  if (S.battle) endBattle(outcome);
  // Blacking out, FLY, DIG, TELEPORT and ESCAPE ROPE all move Pokémon's
  // player off its hidden spot: here they take you back to your bed.
  if (r.current_map() !== PARK.map) {
    try { r.warp_to(PARK.map, PARK.x, PARK.y); } catch { /* stays */ }
    respawn(outcome === 'Loss' ? 'You blacked out, and woke up where you last rested.' : 'You return to where you last rested.');
  }
  updateParty();
  saveAll('back');
}

let lastChunk = '';
function stream() {
  const p = S.player;
  const cx = Math.floor(p.pos[0] / 16), cz = Math.floor(p.pos[2] / 16);
  const k = cx + ',' + cz;
  S.world.want(cx, cz, RADIUS);
  if (k !== lastChunk) {
    lastChunk = k;
    for (const gone of S.world.drop(cx, cz, RADIUS + 1)) S.view.removeChunk(gone);
  }
}

function frame(now) {
  const dt = Math.min(100, now - (S.last || now));
  S.last = now;
  S.alive = performance.now();
  updateMessages(now);
  if (S.mode === 'world' || S.mode === 'poke') {
    const c = S.controls;
    S.acc += dt;
    const step = 1000 / POKE_HZ;
    let n = 0, px = null;
    while (S.acc >= step && n < 4) {
      S.acc -= step;
      c.poll();
      px = tickOnce(n === 0);
      n++;
    }
    if (n === 4) S.acc = 0;
    stream();
    c.setMode(S.mode === 'poke');
    document.body.classList.toggle('in-battle', !!S.battle);
    S.view.seeThrough(!!S.battle);
    document.body.classList.toggle('gb-on', S.mode === 'poke');
    if (px) drawLayer(px, S.screen);
    // Camera: your eyes, or the battle's view.
    if (S.battle) stageBattle();
    else {
      const p = S.player, cam = S.view.camera;
      const eye = p.eye();
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.rotation.set(p.pitch, p.yaw, 0);
      const hit = S.mode === 'world' && !S.inv.open ? targetBlock() : null;
      S.view.outline.visible = !!hit;
      if (hit) S.view.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }
    const biome = biomeName(S.player.pos[0], S.player.pos[2]);
    const sky = (biome && W.biomes[biome] && W.biomes[biome].sky) || '#78a7ff';
    S.view.setDaylight(daylight(), sky);
    if (biome && biome !== S.lastBiome && S.mode === 'world' && performance.now() - (S.signAt || 0) > 4000) {
      S.lastBiome = biome;
      S.signAt = performance.now();
      sign(biome.replace(/_/g, ' ').toUpperCase());
    }
    S.view.skyTime(S.g.time);
    if (S.perks && S.perks.hand && !S.battle) {
      const pp = S.player.pos;
      S.view.setHandLight(pp[0], pp[1] + 1.2, pp[2], 1);
    }
    S.view.stepParticles(dt / 1000);
    S.surv.render();
    if (S.itemNameUntil && now > S.itemNameUntil) { $('itemname').hidden = true; S.itemNameUntil = 0; }
    $('eatbar').hidden = !S.surv.eating;
    if (S.surv.eating) $('eatbar').style.setProperty('--k', String(Math.min(1, S.surv.eating / 1.6)));
    S.view.render();
    if (S.frames % 30 === 0) updateHud();
    if (S.frames % 90 === 0) updateParty();
    if (S.mode === 'world' && now - S.lastSave > AUTOSAVE_MS) saveAll('timer');
  } else if (S.mode === 'title') titleInput();
  else if (S.mode === 'newworld') newWorldInput();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- saving
function saveAll(reason) {
  const r = S.runner, g = S.g;
  if (!r || !g) return;
  const s = r.export_live_save();
  if (!s) return;
  store.set(SAVE_KEY, s);
  store.set(FLAGS_KEY, r.export_flags());
  const p = S.player;
  store.set(WORLD_KEY, JSON.stringify({ ...g, pos: p.pos, yaw: p.yaw, pitch: p.pitch, time: Math.floor(g.time), inv: S.inv.save(), surv: S.surv.save() }));
  store.set(EDITS_KEY, JSON.stringify(S.edits));
  S.lastSave = performance.now();
  S.lastSaveReason = reason;
}

// ---------------------------------------------------------------- starting
function status(t) { $('loading').hidden = false; $('loading').textContent = t; }

async function startWorld(g) {
  status('MINECRAFT IS GENERATING THE WORLD…');
  const world = new World();
  world.onError = (msg) => console.error('world:', msg);
  const ready = await world.init({
    wasm: S.mcWasm, data: S.mcData, seed: g.seed, world: { blocks: W.blocks, biomes: W.biomes },
    atlas: { cols: W.cols, w: S.atlasImg.width, h: S.atlasImg.height }, radius: RADIUS,
    edits: Object.fromEntries(Object.entries(S.edits).map(([k, v]) => [k, Object.entries(v)])),
  });
  S.world = world;
  S.names = ready.blocks;
  S.biomeNames = ready.biomes;
  S.info = buildInfo(ready.blocks);
  world.air = ready.blocks.indexOf('air');
  world.stone = ready.blocks.indexOf('stone');
  S.view = new View($('view'), S.atlasImg, S.monsImg, world);
  S.view.setRadius(RADIUS);
  S.view.setSky(await image(W.sun), await image(W.moon));
  world.onMesh = (m) => {
    S.view.addChunk(m);
    if (m.bells.length && S.ents) S.ents.addBells(m.bells);
  };
  return ready;
}

async function loadAround(x, z, r) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  S.world.want(cx, cz, r);
  for (let i = 0; i < 4000; i++) {
    let missing = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (!S.world.chunks.has((cx + dx) + ',' + (cz + dz))) missing++;
    status(`LOADING CHUNKS… ${(2 * r + 1) ** 2 - missing}/${(2 * r + 1) ** 2}`);
    if (!missing) return;
    await new Promise((res) => setTimeout(res, 30));
  }
}

/// Dry, open land near Minecraft's own spawn point.
async function findSpawn([sx, sz]) {
  for (let ring = 0; ring <= 6; ring++) {
    for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const cx = sx + dx, cz = sz + dz;
      status(`LOOKING FOR LAND… ${ring ? `(${ring * 16} BLOCKS OUT)` : ''}`);
      await loadAround(cx * 16 + 8, cz * 16 + 8, 0);
      const c = S.world.chunks.get(cx + ',' + cz);
      for (let i = 0; i < 256; i++) {
        const lx = (i * 7 + 3) % 16, lz = Math.floor(((i * 7 + 3) % 256) / 16);
        const x = cx * 16 + lx + 0.5, z = cz * 16 + lz + 0.5;
        const g = S.ents.surface(x, z);
        if (!g || g.water) continue;
        const top = blockInfo(S.world.block(Math.floor(x), Math.floor(g.y) - 1, Math.floor(z)));
        if (!top || /_leaves$|_log$/.test(top.name)) continue;
        if (g.y < 62 || g.y > c.hi + 2) continue;
        return [x, g.y, z];
      }
    }
  }
  const c = S.world.chunks.get(sx + ',' + sz);
  return [sx * 16 + 8.5, (c ? c.hi : 80) + 2, sz * 16 + 8.5];
}

function makeEntities() {
  S.items = new Items(W);
  S.inv = new Inventory({
    items: S.items, recipes: W.recipes, icon: iconCss, giveItem: givePoke,
    nearTable: () => nearBlock(/^crafting_table$/), nearFurnace: () => nearBlock(/^(furnace|smoker|blast_furnace)$/),
    say: (t) => toast(t, 2400), onChange: () => renderHotbar(),
  });
  S.surv = new Survival({ onDeath: died, flash: () => { const h = $('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); } });
  S.stepDist = 0; S.grace = 0; S.attackCool = 0; S.perks = perksFor([]); S.perkKey = undefined;
  S.mobs = new Mobs({
    view: S.view, world: S.world, blockInfo, solidAt, waterAt, player: S.player, survival: S.surv, isNight,
    biome: (x, z) => { const n = biomeName(x, z); return n ? { name: n, ...W.biomes[n] } : null; },
    surface: (x, z) => {
      const g = S.ents.surface(x, z);
      if (!g) return null;
      const top = blockInfo(S.world.block(Math.floor(x), Math.floor(g.y) - 1, Math.floor(z)));
      return { ...g, top: top ? top.name : null };
    },
    edit: (x, y, z, name) => edit(x, y, z, S.names.indexOf(name)),
    drop: (item, n) => gain(item, n),
    say: (t) => toast(t, 2600),
    follower: () => {
      const f = S.ents.follower, lead = S.party.find((p) => p.hp > 0);
      if (!f || !lead) return null;
      return { species: f.species, level: lead.level, pos: f.pos, colour: [1, 0.85, 0.3] };
    },
    reward: (type) => {
      const n = { creeper: 60, skeleton: 40, stray: 45, spider: 35 }[type] || 30;
      try { S.runner.add_money(n); } catch { /* no money */ }
      feed(`+¥${n}`);
      if (S.ents.follower) giveExp((MOB_EXP[type] || 60) * zoneLevel() / 7, type.toUpperCase());
    },
    calm: (type) => calms(S.perks, type),
    followerHurt,
    blast: (x, y, z, r) => {
      for (const e of [...S.ents.list]) {
        if (e.kind !== 'wild' || e.inBattle || Math.hypot(e.pos[0] - x, e.pos[2] - z) > r) continue;
        S.view.burst(e.pos[0], e.pos[1] + 0.6, e.pos[2], [0.9, 0.9, 0.9], 12, 3, 3);
        S.ents.remove(e);
        feed(`The wild ${e.species.toUpperCase()} fled from the blast!`);
      }
    },
    clearLine, skyOpen,
  });
  S.ents = new Entities({
    view: S.view, world: S.world, blockInfo, assets: W, player: S.player,
    zoneLevel, isNight, biomeName, origin: () => S.g.origin,
    say: (t) => toast(t, 3200),
    onTouch: (e) => { if (S.mode === 'world' && !S.battle && !S.sleep) startBattle(e.kind === 'trainer' ? 'trainer' : 'wild', e); },
    onSpotted: (e) => {
      const view = S.view;
      e.alert = view.sprite3(alertCanvas());
      e.alert.scale.setScalar(0.8);
      toast(`A ${e.trainer.cls.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()} wants to battle!`, 2400);
    },
    canBattle,
  });
}

/// A block matching `re` within 4 blocks of you.
function nearBlock(re) {
  const p = S.player.pos;
  const x0 = Math.floor(p[0]), y0 = Math.floor(p[1]), z0 = Math.floor(p[2]);
  for (let y = y0 - 2; y <= y0 + 3; y++) for (let z = z0 - 4; z <= z0 + 4; z++) for (let x = x0 - 4; x <= x0 + 4; x++) {
    const b = blockInfo(S.world.block(x, y, z));
    if (b && re.test(b.name)) return true;
  }
  return false;
}

/// Load the bag and body from a save (v3 saves kept 9 hotbar slots of {name, n}).
function loadInventory(g) {
  if (g.inv && Array.isArray(g.inv.slots)) S.inv.load(g.inv);
  else if (Array.isArray(g.inv)) g.inv.forEach((s, i) => { if (s && s.name) S.inv.slots[i] = { id: s.name, n: s.n }; });
  S.surv.load(g.surv);
}

let alertC = null;
function alertCanvas() {
  if (alertC) return alertC;
  alertC = document.createElement('canvas');
  alertC.width = alertC.height = 16;
  const x = alertC.getContext('2d');
  x.fillStyle = '#f8f8f0'; x.fillRect(4, 0, 8, 16);
  x.fillStyle = '#181818'; x.fillRect(6, 2, 4, 8); x.fillRect(6, 12, 4, 3);
  return alertC;
}

function bootRunner(saveJson, flags) {
  const r = new PokeredRunner(saveJson);
  if (flags) r.import_flags(flags);
  S.runner = r;
  try { r.warp_to(PARK.map, PARK.x, PARK.y); } catch { /* silent start */ }
  return r;
}

async function continueGame() {
  const saved = JSON.parse(store.get(WORLD_KEY));
  enterLoading();
  try { S.edits = JSON.parse(store.get(EDITS_KEY) || '{}'); } catch { S.edits = {}; }
  S.g = saved;
  await startWorld(saved);
  S.player = new Player(...saved.pos);
  S.player.yaw = saved.yaw || 0;
  S.player.pitch = saved.pitch || 0;
  makeEntities();
  loadInventory(saved);
  await S.mobs.loadSkins(W.skins);
  await loadAround(saved.pos[0], saved.pos[2], 1);
  bootRunner(store.get(SAVE_KEY), store.get(FLAGS_KEY));
  enterWorld();
}

async function newGame(starterKey, seedText) {
  const seed = parseSeed(seedText);
  enterLoading();
  S.edits = {};
  S.g = { v: 4, seed, seedText: seedText || seedString(seed), spawn: [0, 0, 0], origin: [0, 0], time: 1000 };
  const ready = await startWorld(S.g);
  S.player = new Player(0, 200, 0);
  makeEntities();
  S.inv.add('red_bed', 1); S.inv.add('bread', 4); S.inv.add('torch', 8);
  await S.mobs.loadSkins(W.skins);
  const spot = await findSpawn(ready.spawn);
  S.player.pos = [...spot];
  S.player.pitch = -0.25;
  S.g.spawn = [...spot];
  S.g.origin = [spot[0], spot[2]];
  await loadAround(spot[0], spot[2], 1);
  store.del('pokered.save');
  store.del('pokered.script_flags');
  const starter = STARTERS[starterKey];
  const r = new PokeredRunner(null);
  r.import_editor_save(JSON.stringify({
    player: { playerName: 'RED', rivalName: 'BLUE', mapName: PARK.map, positionX: PARK.x, positionY: PARK.y, playTimeHours: 0, playTimeMinutes: 0, money: 3000 },
    badges: [],
    party: [{ species: starter.species, level: 5, currentHp: 999, maxHp: 999, moves: starter.moves, nickname: '' }],
    items: [{ name: 'POKE_BALL', quantity: 10 }, { name: 'POTION', quantity: 5 }, { name: 'ANTIDOTE', quantity: 1 }],
    flags: { EVENT_GOT_POKEDEX: true, EVENT_GOT_STARTER: true },
  }));
  S.runner = r;
  try { r.warp_to(PARK.map, PARK.x, PARK.y); } catch { /* silent start */ }
  enterWorld();
  toast(TOUCH
    ? `SEED ${S.g.seedText}. Left thumb: walk. Right thumb: look; tap to use. BALL throws your POKéMON at a wild one to battle it. MENU opens your POKéMON menu.`
    : `SEED ${S.g.seedText}. WASD + mouse. Click: mine. Right-click / E: use. Q: throw your POKéMON's ball to battle. Space: jump. Shift: sprint. Enter: menu.`, 9000);
}

function enterLoading() {
  S.started = true;
  unlockAudio();
  $('title').hidden = false;
  $('title').querySelector('.menu').hidden = true;
  $('newworld').hidden = true;
}
function enterWorld() {
  $('title').hidden = true;
  $('newworld').hidden = true;
  $('loading').hidden = true;
  document.body.classList.add('playing');
  S.mode = 'world';
  S.acc = 0;
  S.view.resize();
  S.controls.lock();
  updateParty();
  updateHud();
  renderHotbar();
  saveAll('start');
}

// ---------------------------------------------------------------- title
let titleIndex = 0;
function titleButtons() { return [...document.querySelectorAll('#title .menu button')].filter((b) => !b.hidden); }
function renderTitle() { titleButtons().forEach((b, i) => b.classList.toggle('sel', i === titleIndex)); }
function titleInput() {
  const c = S.controls;
  c.poll();
  const bs = titleButtons();
  if (!bs.length) return;
  if (c.pressed('up') || c.pressed('fwd')) { titleIndex = (titleIndex + bs.length - 1) % bs.length; renderTitle(); }
  if (c.pressed('down') || c.pressed('back')) { titleIndex = (titleIndex + 1) % bs.length; renderTitle(); }
  if (c.pressed('start')) bs[titleIndex]?.click();
}
let armed = false;
function openNewWorld() {
  if (store.get(WORLD_KEY) && !armed) { armed = true; $('btn-new').textContent = 'TAP AGAIN: ERASE SAVE'; return; }
  S.started = true;
  unlockAudio();
  $('title').hidden = true;
  $('newworld').hidden = false;
  S.mode = 'newworld';
}
function newWorldInput() {
  const c = S.controls;
  c.poll();
  if (c.pressed('b')) { $('newworld').hidden = true; $('title').hidden = false; S.mode = 'title'; }
}

function fail(e) {
  $('title').hidden = false;
  $('loading').hidden = false;
  $('loading').textContent = `Couldn't start: ${e && e.message ? e.message : e}`;
  S.mode = 'error';
  console.error(e);
}

window.__pcTest = {
  startBattle: (kind, e) => startBattle(kind, e), saveAll, updateParty, throwBall, interact, edit,
  solidAt, blockAt: (x, y, z) => S.names[S.world.block(x, y, z)], targetBlock, mine, terrainHere,
  stepEncounters, fish, landCatch: () => S.fishing && landCatch(S.fishing), revive, givePoke, nearBlock,
  giveExp, followerHurt, frostWalk, findCursors,
  forceLead: (lead) => { S.testLead = lead; applyPerks(lead); },
};

async function main() {
  S.controls = new Controls(unlockAudio);
  S.touchGb = new TouchGB((b) => S.controls.latched.add('gb-' + b));
  // Taps on Pokémon's screen, in Game Boy pixels; elsewhere they mean "go on".
  S.controls.onGbTap = (x, y) => {
    const r = $('gb').getBoundingClientRect();
    const gx = ((x - r.left) / r.width) * 160, gy = ((y - r.top) / r.height) * 144;
    S.touchGb.tap(gx >= 0 && gx < 160 && gy >= 0 && gy < 144 ? gx : null, gy);
  };
  $('mute').addEventListener('click', () => { unlockAudio(); audio.setMuted(!audio.muted); });
  audio.setMuted(audio.muted);
  $('btn-continue').addEventListener('click', () => continueGame().catch(fail));
  $('btn-new').addEventListener('click', openNewWorld);
  for (const b of document.querySelectorAll('#starters button')) {
    b.addEventListener('click', () => newGame(b.dataset.starter, $('seed').value).catch(fail));
  }
  $('toast').addEventListener('click', hideToast);
  $('respawn').addEventListener('click', () => revive());
  addEventListener('resize', () => S.view && S.view.resize());
  const leaving = (why) => { if (S.mode === 'world' || S.mode === 'poke') saveAll(why); };
  addEventListener('visibilitychange', () => {
    if (document.hidden) { leaving('hidden'); if (audio.ctx) audio.ctx.suspend().catch(() => {}); }
    else if (audio.ctx && S.started) audio.ctx.resume().catch(() => {});
  });
  addEventListener('pagehide', () => leaving('pagehide'));
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser is too old (no DecompressionStream)');
    const [pk, mc] = await Promise.all([gunzip(b64bytes(ASSETS.pk)), gunzip(b64bytes(ASSETS.mc))]);
    await initPokered({ module_or_path: pk });
    S.mcWasm = mc;
    S.mcData = b64bytes(ASSETS.data);
    S.atlasImg = await image(ASSETS.atlas);
    S.monsImg = await image(ASSETS.mons);
    S.atlasUrl = 'data:image/png;base64,' + ASSETS.atlas;
    S.atlasRows = S.atlasImg.height / 16;
    S.itemsImg = await image(ASSETS.items);
    S.itemsUrl = 'data:image/png;base64,' + ASSETS.items;
    S.itemRows = S.itemsImg.height / 16;
  } catch (e) { fail(e); throw e; }
  delete ASSETS.pk; delete ASSETS.mc; delete ASSETS.data; delete ASSETS.mons;
  $('loading').hidden = true;
  $('btn-continue').hidden = !(store.get(WORLD_KEY) && store.get(SAVE_KEY));
  if (!store.set('pcraft.probe', '1')) $('nosave').hidden = false;
  $('title').querySelector('.menu').hidden = false;
  renderTitle();
  S.mode = 'title';
  requestAnimationFrame(frame);
}
main();

