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
      hardness: hardness(name, b),
    };
  });
}
function hardness(name, b) {
  if (!b) return Infinity;
  if (/^(bedrock|barrier|end_portal_frame|water|lava|bubble_column)$/.test(name)) return Infinity;
  if (b.s === 'cross' || b.s === 'flat' || /_leaves$|^snow$|^vine$/.test(name)) return 0.15;
  if (/(dirt|grass_block|sand|gravel|clay|mud|podzol|mycelium|farmland|snow_block|soul_sand|powder_snow|dirt_path)/.test(name)) return 0.55;
  if (/(_log|_wood|_planks|_stem|_hyphae|bookshelf|chest|crafting_table|barrel|pumpkin|melon|_fence|_door|_stairs|_slab|composter|bed$|ladder|_sign)/.test(name)) return 1.2;
  if (/obsidian|crying_obsidian|ancient_debris/.test(name)) return 6;
  if (/(_ore|stone|deepslate|cobble|brick|andesite|diorite|granite|tuff|calcite|basalt|terracotta|concrete|prismarine|sandstone|quartz|iron|gold|diamond|emerald|copper)/.test(name)) return 1.8;
  return 0.8;
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
}

function updateHud() {
  const g = S.g;
  const hours = Math.floor(g.time / 1000 + 6) % 24, mins = Math.floor((g.time % 1000) * 0.06);
  $('clock').textContent = `${isNight() ? 'NIGHT' : 'DAY'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  $('zone').textContent = `WILD LV~${zoneLevel()}`;
}

function renderHotbar() {
  const el = $('hotbar');
  el.innerHTML = '';
  S.g.inv.forEach((slot, i) => {
    const d = document.createElement('div');
    d.className = 'slot' + (i === S.g.sel ? ' sel' : '');
    d.dataset.slot = i;
    if (slot) {
      const info = W.blocks[slot.name];
      const tile = info ? info.f[info.s === 'cube' || info.s === 'slab' ? 1 : 0] : 0;
      const cols = W.cols;
      d.style.backgroundImage = `url(${S.atlasUrl})`;
      d.style.backgroundPosition = `${((tile % cols) / (cols - 1)) * 100}% ${(Math.floor(tile / cols) / (S.atlasRows - 1)) * 100}%`;
      d.style.backgroundSize = `${cols * 100}% ${(S.atlasRows) * 100}%`;
      d.innerHTML = `<span>${slot.n}</span>`;
      d.title = slot.name;
    }
    el.appendChild(d);
  });
}
function addToInventory(name, n = 1) {
  const inv = S.g.inv;
  const slot = inv.find((s) => s && s.name === name && s.n < 64);
  if (slot) slot.n += n;
  else {
    const empty = inv.findIndex((s) => !s);
    if (empty < 0) return false;
    inv[empty] = { name, n };
  }
  renderHotbar();
  return true;
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
  layerImg.data.set(px);
  lg.putImageData(layerImg, 0, 0);
  gb.clearRect(0, 0, 160, 144);
  if (screen === 'Battle' && S.opaque < 160 * 144) {
    for (const [y0, y1] of [[0, 40], [40, 96], [96, 144]]) {
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
  if (d > 6 || !seen(ex, ent.pos[1], ez)) {
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
  if (b.kind === 'wild') {
    if (outcome === 'Win' || outcome === 'Captured') S.ents.remove(b.ent);
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
  const hit = targetBlock();
  if (!hit) return;
  const name = S.names[S.world.block(hit.x, hit.y, hit.z)];
  if (/_bed$/.test(name)) return sleep(hit);
  if (name === 'bell') { toast('DING! The village NURSE and CLERK are right here.'); return; }
  place(hit);
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
    S.g.spawn = [e.pos[0], e.pos[1], e.pos[2] + 1];
    toast('NURSE: Your POKéMON are fighting fit! We hope to see you again. (You will wake up here.)', 3600);
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
  if (S.ents.list.some((e) => e.kind === 'wild' && e.aggressive && Math.hypot(e.pos[0] - S.player.pos[0], e.pos[2] - S.player.pos[2]) < 8)) {
    toast('You may not rest now; there are POKéMON nearby.');
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
    S.g.time = 0;
    S.g.spawn = s.bed;
  }
  if (s.t >= 120) {
    S.sleep = null;
    $('fade').style.opacity = '0';
    toast('You slept until morning. Your POKéMON are healed, and you will wake up here.', 3400);
    saveAll('sleep');
  }
}

function place(hit) {
  const slot = S.g.inv[S.g.sel];
  if (!slot) return;
  const x = hit.x + hit.face[0], y = hit.y + hit.face[1], z = hit.z + hit.face[2];
  const here = blockInfo(S.world.block(x, y, z));
  if (!here || !(here.air || here.water || here.shape === 'cross' || here.shape === 'flat')) return;
  // Not inside yourself.
  const p = S.player.pos;
  if (x + 1 > p[0] - 0.3 && x < p[0] + 0.3 && z + 1 > p[2] - 0.3 && z < p[2] + 0.3 && y + 1 > p[1] && y < p[1] + 1.8) return;
  const id = S.names.indexOf(slot.name);
  if (id < 0) return;
  edit(x, y, z, id);
  if (--slot.n <= 0) S.g.inv[S.g.sel] = null;
  renderHotbar();
}

function edit(x, y, z, id) {
  S.world.set(x, y, z, id);
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  const k = cx + ',' + cz;
  (S.edits[k] = S.edits[k] || {})[`${x - cx * 16},${y},${z - cz * 16}`] = id;
}

function mine() {
  const hit = targetBlock();
  if (!hit) { S.mining = null; $('crack').hidden = true; return; }
  const id = S.world.block(hit.x, hit.y, hit.z);
  const b = blockInfo(id);
  if (!b || b.hardness === Infinity) return;
  const key = `${hit.x},${hit.y},${hit.z}`;
  if (!S.mining || S.mining.key !== key) S.mining = { key, t: 0 };
  S.mining.t += DT;
  const k = S.mining.t / b.hardness;
  $('crack').hidden = false;
  $('crack').style.setProperty('--k', String(Math.min(1, k)));
  if (k >= 1) {
    S.mining = null;
    $('crack').hidden = true;
    edit(hit.x, hit.y, hit.z, S.names.indexOf('air'));
    const keep = b.shape === 'cube' || b.shape === 'slab' || /_bed$|bell|lantern/.test(b.name);
    const drop = b.name === 'grass_block' || b.name === 'podzol' || b.name === 'mycelium' || b.name === 'dirt_path' ? 'dirt' : b.name === 'stone' ? 'cobblestone' : b.name;
    if (keep) addToInventory(drop);
    // Double plants come down whole; the block above a removed one may float, as in Minecraft.
  }
}

// ---------------------------------------------------------------- the loop
function worldStep(first) {
  const c = S.controls, p = S.player;
  S.g.time = (S.g.time + 20 / 60) % DAY_TICKS;
  if (S.sleep) { sleepStep(); return; }
  const [lx, ly] = c.takeLook();
  p.yaw -= lx;
  p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - ly));
  if (c.slot >= 0) { S.g.sel = c.slot; c.slot = -1; renderHotbar(); }
  if (c.wheel) { S.g.sel = (S.g.sel + Math.sign(c.wheel) + 9) % 9; c.wheel = 0; renderHotbar(); }
  if (first && c.pressed('start')) { S.startEdge = true; return; }
  if (first && c.pressed('a')) interact();
  if (first && c.pressed('ball')) throwBall();
  if (c.down('mine') || c.down('b')) mine();
  else if (S.mining) { S.mining = null; $('crack').hidden = true; }
  p.step(DT, c.move(), c.down('jump'), c.down('sprint') || (TOUCH && Math.hypot(...c.stick) > 0.95), solidAt, waterAt);
  if (p.pos[1] < -80) respawn('You fell out of the world.');
  const lava = blockInfo(S.world.block(Math.floor(p.pos[0]), Math.floor(p.pos[1] + 0.1), Math.floor(p.pos[2])));
  if (lava && lava.lava) respawn('Too hot! You climbed out of the lava back at your bed.');
}

function respawn(msg) {
  const [x, y, z] = S.g.spawn;
  S.player.pos = [x, y + 0.1, z];
  S.player.vel = [0, 0, 0];
  if (msg) toast(msg, 3200);
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
    mask = c.gbMask();
  }
  updateBall();
  S.ents.update(DT, S.mode !== 'world' || !!S.sleep);
  const px = r.tick_layers(mask);
  let opaque = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]) opaque++;
  S.opaque = opaque;
  S.frames++;
  const screen = r.screen_name();
  S.screen = screen.startsWith('Shop') ? 'Shop' : screen;
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
      const hit = S.mode === 'world' ? targetBlock() : null;
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
  store.set(WORLD_KEY, JSON.stringify({ ...g, pos: p.pos, yaw: p.yaw, pitch: p.pitch, time: Math.floor(g.time) }));
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
  });
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
  await loadAround(saved.pos[0], saved.pos[2], 1);
  bootRunner(store.get(SAVE_KEY), store.get(FLAGS_KEY));
  enterWorld();
}

async function newGame(starterKey, seedText) {
  const seed = parseSeed(seedText);
  enterLoading();
  S.edits = {};
  S.g = { v: 3, seed, seedText: seedText || seedString(seed), spawn: [0, 0, 0], origin: [0, 0], time: 1000, inv: Array(9).fill(null), sel: 0 };
  S.g.inv[0] = { name: 'red_bed', n: 1 };
  const ready = await startWorld(S.g);
  S.player = new Player(0, 200, 0);
  makeEntities();
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
  solidAt, blockAt: (x, y, z) => S.names[S.world.block(x, y, z)], targetBlock,
};

async function main() {
  S.controls = new Controls(unlockAudio);
  $('mute').addEventListener('click', () => { unlockAudio(); audio.setMuted(!audio.muted); });
  audio.setMuted(audio.muted);
  $('btn-continue').addEventListener('click', () => continueGame().catch(fail));
  $('btn-new').addEventListener('click', openNewWorld);
  for (const b of document.querySelectorAll('#starters button')) {
    b.addEventListener('click', () => newGame(b.dataset.starter, $('seed').value).catch(fail));
  }
  $('toast').addEventListener('click', hideToast);
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

