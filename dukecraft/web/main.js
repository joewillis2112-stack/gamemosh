// Dukecraft: Duke Nukem 3D in an endless Minecraft world.
//
// Minecraft is the world: MinecraftOSS's generator (mcgen.wasm) makes the
// land in a worker, three.js draws it, and you live by Minecraft's rules
// (mining, crafting, hunger, night monsters). Duke Nukem 3D's aliens land in
// it at night, each run by Duke's own 1996 CON script (duke.js), drawn from
// Duke's own art. Duke's pistol, ammo and medkits are items in your
// Minecraft inventory; its blasts break blocks; its enemies hurt your hearts.
import { World } from '../../pokecraft/web/gen.js';
import { View } from '../../pokecraft/web/view.js';
import { Player, raycast } from '../../pokecraft/web/player.js';
import { Controls } from '../../pokecraft/web/controls.js';
import { Items } from '../../pokecraft/web/items.js';
import { Inventory } from '../../pokecraft/web/inventory.js';
import { Survival } from '../../pokecraft/web/survival.js';
import { Mobs } from '../../pokecraft/web/mobs.js';
import { readGrp } from './art.js';
import { Duke } from './duke.js';

const ASSETS = window.DC_ASSETS;
const W = ASSETS.world;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
const HZ = 60;
const DT = 1 / HZ;
const WORLD_KEY = 'dukecraft.world', EDITS_KEY = 'dukecraft.edits', MUTE_KEY = 'dukecraft.muted';
const AUTOSAVE_MS = 30000;
const DAY_TICKS = 24000;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const RADIUS = TOUCH ? 3 : 4;
const REACH = 5;
const ALIEN_CAP = 6;

// Duke's things as Minecraft items: [id, Duke tile for the icon, name].
const DUKE_ITEMS = {
  duke_pistol: { tile: 'FIRSTGUNSPRITE', name: "Duke's Pistol", stack: 1 },
  duke_pistol_ammo: { tile: 'AMMO', name: 'Pistol Rounds', stack: 200 },
  duke_medkit: { tile: 'FIRSTAID', name: 'Portable Medkit', stack: 1 },
};
const DUKE_RECIPES = [
  { out: 'duke_pistol_ammo', n: 12, g: 2, in: [[['iron_ingot'], 1], [['gunpowder'], 1]] },
  { out: 'duke_pistol', n: 1, g: 3, in: [[['iron_ingot'], 3], [['gunpowder'], 2], [['redstone'], 1]] },
  { out: 'duke_medkit', n: 1, g: 2, in: [[['paper'], 1], [['apple'], 2], [['string'], 1]] },
];

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
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};
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
  mode: 'loading', // loading | title | newworld | world
  started: false,
  frames: 0, acc: 0, last: 0,
  edits: {}, lastSave: 0, toastUntil: 0, signUntil: 0,
  gun: { cool: 0, kick: 0, reload: 0 },
};
window.__dc = S;

// ---------------------------------------------------------------- audio
const audio = {
  ctx: null, muted: store.get(MUTE_KEY) === '1',
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    if (S.duke) S.duke.sounds.attach(this.ctx);
    if (S.duke) S.duke.sounds.muted = this.muted;
  },
  setMuted(m) {
    this.muted = m;
    store.set(MUTE_KEY, m ? '1' : '0');
    if (S.duke) S.duke.sounds.muted = m;
    $('mute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
  },
};
function unlockAudio() {
  if (!S.started) return;
  audio.start();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
}
const sfx = (name, dist = 0) => { const id = S.duke && S.duke.sym(name); if (id != null) S.duke.sounds.play(id, dist); };

// ---------------------------------------------------------------- blocks
function blockInfo(id) { return id < 0 ? null : S.info[id]; }
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
      glass: /glass|ice$/.test(name),
    };
  });
}
const solidAt = (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return b ? b.h : 1; };
const waterAt = (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return !!(b && b.water); };
const opaqueAt = (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return b ? b.h >= 1 && !b.leaves && !b.glass : true; };
const CLIMB_RE = /^(ladder|vine|scaffolding|twisting_vines|twisting_vines_plant|weeping_vines|weeping_vines_plant|cave_vines|cave_vines_plant)$/;
const climbAt = (x, y, z) => { const b = blockInfo(S.world.block(x, y, z)); return !!b && CLIMB_RE.test(b.name); };

// ---------------------------------------------------------------- clock
const isNight = () => S.g.time >= 13000 && S.g.time < 23000;
function daylight() {
  const t = S.g.time;
  if (t < 12000) return 1;
  if (t < 13500) return 1 - ((t - 12000) / 1500) * 0.82;
  if (t < 22500) return 0.18;
  return 0.18 + ((t - 22500) / 1500) * 0.82;
}
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
function sign(text) { $('sign').textContent = text; $('sign').hidden = false; S.signUntil = performance.now() + 2600; }
function updateMessages(now) {
  if (S.toastUntil && now > S.toastUntil) hideToast();
  if (S.signUntil && now > S.signUntil) { $('sign').hidden = true; S.signUntil = 0; }
}
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

// ---------------------------------------------------------------- HUD
function updateHud() {
  const g = S.g;
  const hours = Math.floor(g.time / 1000 + 6) % 24, mins = Math.floor((g.time % 1000) * 0.06);
  $('clock').textContent = `${isNight() ? 'NIGHT' : 'DAY'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  $('zone').textContent = `KILLS ${S.g.kills || 0}`;
}

const dukeIcons = new Map();
function dukeIcon(id) {
  if (dukeIcons.has(id)) return dukeIcons.get(id);
  const d = DUKE_ITEMS[id];
  const cv = d && S.duke.art.canvas(S.duke.sym(d.tile));
  const url = cv ? cv.toDataURL() : '';
  dukeIcons.set(id, url);
  return url;
}
function iconCss(id) {
  if (DUKE_ITEMS[id]) return `background-image:url(${dukeIcon(id)});background-size:contain;background-repeat:no-repeat;background-position:center`;
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
  const more = document.createElement('div');
  more.className = 'slot more';
  more.dataset.act = 'inv';
  more.textContent = '•••';
  el.appendChild(more);
  const held = S.inv.held;
  if (held !== S.lastHeld) {
    S.lastHeld = held;
    if (held) {
      $('itemname').textContent = S.items.name(held);
      $('itemname').hidden = false;
      S.itemNameUntil = performance.now() + 1800;
    }
    drawGun();
  }
  $('ammo').hidden = held !== 'duke_pistol';
  $('ammo').textContent = String(S.inv.count('duke_pistol_ammo'));
}
function selectSlot(i) { S.inv.sel = i; renderHotbar(); }

// Duke's pistol in your hand: FIRSTGUN, its two firing frames, and the reload.
function drawGun() {
  const el = $('gun');
  if (S.inv.held !== 'duke_pistol') { el.hidden = true; return; }
  const g = S.gun, base = S.duke.sym('FIRSTGUN');
  const tile = g.reload > 0 ? S.duke.sym('FIRSTGUNRELOAD') : base + (g.kick > 0.08 ? 1 : g.kick > 0 ? 2 : 0);
  if (el.dataset.tile !== String(tile)) {
    const cv = S.duke.art.canvas(tile);
    if (cv) { el.width = cv.width; el.height = cv.height; el.getContext('2d').clearRect(0, 0, cv.width, cv.height); el.getContext('2d').drawImage(cv, 0, 0); }
    el.dataset.tile = String(tile);
  }
  el.hidden = false;
}

// ---------------------------------------------------------------- the player's actions
function targetBlock() {
  const p = S.player;
  return raycast(p.eye(), p.look(), REACH, (x, y, z) => {
    const b = blockInfo(S.world.block(x, y, z));
    return b && !b.air && !b.water;
  });
}

/// Duke's pistol: hitscan, PISTOL_WEAPON_STRENGTH (6) + 0..5, 12 to a clip.
function fire() {
  const g = S.gun;
  if (g.cool > 0 || g.reload > 0) return;
  if (!S.inv.count('duke_pistol_ammo')) { toast('No pistol rounds. Craft them: 1 iron ingot + 1 gunpowder.', 2000); g.cool = 0.5; return; }
  S.inv.remove('duke_pistol_ammo', 1);
  g.shots = (g.shots || 0) + 1;
  g.cool = 0.22; g.kick = 0.16;
  sfx('PISTOL_FIRE');
  const p = S.player, eye = p.eye(), dir = p.look();
  const spread = 0.012;
  const d = dir.map((v) => v + (Math.random() - 0.5) * spread);
  const block = raycast(eye, d, 64, (x, y, z) => opaqueAt(x, y, z));
  const maxT = block ? block.t : 64;
  const hit = S.duke.pick(eye, d, maxT);
  const mob = S.mobs.pick(eye, d, Math.min(maxT, 40));
  const dmg = (S.duke.sym('PISTOL_WEAPON_STRENGTH') || 6) + Math.floor(Math.random() * 6);
  const mobT = mob ? Math.hypot(mob.body.pos[0] - eye[0], mob.body.pos[2] - eye[2]) : Infinity;
  if (hit && hit.t <= mobT) {
    S.duke.damage(hit.id, dmg, S.duke.sym('SHOTSPARK1'));
    const at = eye.map((v, i) => v + d[i] * hit.t);
    S.view.burst(at[0], at[1], at[2], [0.75, 0.05, 0.05], 8, 2, 1.5);
  } else if (mob && mobT < maxT) {
    // Duke's bullets hurt Minecraft's monsters too: 6 Duke HP ≈ 1 heart.
    S.mobs.damage(mob, Math.max(2, Math.round(dmg / 3)), p.pos);
    S.view.burst(mob.body.pos[0], mob.body.pos[1] + 1, mob.body.pos[2], [0.8, 0.1, 0.1], 6, 2, 1.5);
  } else if (block) {
    const at = eye.map((v, i) => v + d[i] * block.t);
    S.view.burst(at[0], at[1], at[2], [1, 0.9, 0.5], 5, 2, 1);
    if (Math.random() < 0.3) sfx('PISTOL_RICOCHET', block.t);
    // Bullets shatter glass, as in Duke.
    const name = S.names[S.world.block(block.x, block.y, block.z)];
    if (/glass/.test(name)) { edit(block.x, block.y, block.z, S.names.indexOf('air')); sfx('GLASS_BREAKING', block.t); }
  }
  if (g.shots % 12 === 0 && S.inv.count('duke_pistol_ammo')) { g.reload = 1.0; sfx('EJECT_CLIP'); }
  renderHotbar();
}

function tapAction() {
  const held = S.inv.held;
  if (held === 'duke_pistol') return { label: 'FIRE', run: fire };
  const hit = targetBlock();
  const name = hit ? S.names[S.world.block(hit.x, hit.y, hit.z)] : null;
  if (name && /_bed$/.test(name)) return { label: 'SLEEP', run: () => sleep(hit) };
  if (name === 'crafting_table') return { label: 'CRAFT', run: () => S.inv.show('craft') };
  if (name && /^(furnace|smoker|blast_furnace)$/.test(name)) return { label: 'SMELT', run: () => S.inv.show('furnace') };
  if (hit && held && S.items.isBlock(held)) return { label: `PLACE ${S.items.name(held).toUpperCase()}`, run: () => place(hit, held) };
  return null;
}
function holdLabel() {
  const held = S.inv.held;
  if (held === 'duke_pistol') return 'FIRE';
  if (held === 'duke_medkit' && S.surv.hp < 20) return 'USE MEDKIT';
  if (held && S.items.food(held) && S.surv.food < 20) return 'EAT';
  const p = S.player;
  if (S.mobs.pick(p.eye(), p.look(), 3.6) || S.duke.pick(p.eye(), p.look(), 3.6)) return 'ATTACK';
  return targetBlock() ? 'MINE' : null;
}
function interact() { const a = tapAction(); if (a) a.run(); }
function updateCtx() {
  const el = $('ctx');
  if (S.mode !== 'world' || S.inv.open || S.sleep) { el.hidden = true; return; }
  const tap = tapAction(), hold = holdLabel();
  const [t, h] = TOUCH ? ['TAP', 'HOLD'] : ['RIGHT-CLICK', 'CLICK'];
  const parts = [];
  if (tap) parts.push(`${t}: ${tap.label}`);
  if (hold && !(tap && tap.label === hold)) parts.push(`${h}: ${hold}`);
  el.textContent = parts.join(' · ');
  el.hidden = !parts.length;
}

function sleep(hit) {
  if (!isNight()) { toast('You can only sleep at night.'); return; }
  const near = (x, z) => Math.hypot(x - S.player.pos[0], z - S.player.pos[2]) < 8;
  if (S.mobs.list.some((m) => m.k.hostile && near(m.body.pos[0], m.body.pos[2])) || [...S.duke.actors.values()].some((a) => near(a.pos[0], a.pos[2]))) {
    toast('You may not rest now; there are monsters nearby.');
    return;
  }
  S.sleep = { t: 0, bed: [hit.x + 0.5, hit.y + 1, hit.z + 0.5] };
}
function sleepStep() {
  const s = S.sleep;
  s.t++;
  $('fade').style.opacity = String(s.t < 60 ? s.t / 60 : Math.max(0, 1 - (s.t - 60) / 60));
  if (s.t === 60) { S.surv.heal(20); S.g.time = 0; S.g.spawn = s.bed; S.mobs.clearAll(); S.duke.clearAll(); }
  if (s.t >= 120) { S.sleep = null; $('fade').style.opacity = '0'; toast('You slept until morning. You will wake up here.', 3000); saveAll('sleep'); }
}

function place(hit, held) {
  const x = hit.x + hit.face[0], y = hit.y + hit.face[1], z = hit.z + hit.face[2];
  const here = blockInfo(S.world.block(x, y, z));
  if (!here || !(here.air || here.water || here.shape === 'cross' || here.shape === 'flat')) return;
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
function clearCrack() { if (S.mining) { S.mining = null; S.view.setCrack(0, 0, 0, -1); } }

/// A Duke blast (or anything) breaks a block, with Minecraft's drops.
function breakBlock(x, y, z) {
  const name = S.names[S.world.block(x, y, z)];
  if (!name || name === 'air' || /water|lava|bedrock/.test(name)) return;
  if (S.items.hardness(name) > 3) return;
  const info = blockInfo(S.world.block(x, y, z));
  edit(x, y, z, S.names.indexOf('air'));
  if (Math.random() < 0.3) S.view.burst(x + 0.5, y + 0.5, z + 0.5, tileColour(info.tile), 6, 4, 3);
}

/// Hold: hit what's alive in front of you (Minecraft mobs or Duke's aliens), else mine.
function mine() {
  const p = S.player, eye = p.eye(), dir = p.look();
  const hit = targetBlock();
  const mob = S.mobs.pick(eye, dir, 3.6);
  const alien = S.duke.pick(eye, dir, 3.6);
  const blockT = hit ? hit.t + 0.5 : Infinity;
  if (alien && alien.t < blockT) {
    clearCrack();
    if (S.attackCool <= 0) {
      S.attackCool = 0.55;
      // A Minecraft blow on a Duke alien: Duke's KNEE damage scales with your weapon.
      S.duke.damage(alien.id, S.items.damage(S.inv.held) * 5, S.duke.sym('KNEE'));
      const at = eye.map((v, i) => v + dir[i] * alien.t);
      S.view.burst(at[0], at[1], at[2], [0.7, 0.05, 0.05], 6, 2, 1.5);
    }
    return;
  }
  if (mob && (!hit || Math.hypot(mob.body.pos[0] - eye[0], mob.body.pos[2] - eye[2]) < blockT)) {
    clearCrack();
    if (S.attackCool <= 0) {
      S.attackCool = 0.55;
      S.mobs.damage(mob, S.items.damage(S.inv.held), p.pos);
      S.view.burst(mob.body.pos[0], mob.body.pos[1] + 1, mob.body.pos[2], [0.8, 0.1, 0.1], 6, 2, 1.5);
    }
    return;
  }
  if (!hit) { clearCrack(); return; }
  const name = S.names[S.world.block(hit.x, hit.y, hit.z)];
  const bt = S.items.breakTime(name, S.inv.held);
  if (bt.t === Infinity) return;
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
  for (const dy of [1, -1]) if (S.names[S.world.block(hit.x, hit.y + dy, hit.z)] === name && W.blocks[name] && W.blocks[name].s === 'cross') edit(hit.x, hit.y + dy, hit.z, S.names.indexOf('air'));
  if (!bt.drops) { toast(`You need a better pickaxe to get anything from ${S.items.name(name)}.`, 2200); return; }
  for (const d of S.items.drops(name)) if (!d.poke) gain(d[0], d[1]);
}

// ---------------------------------------------------------------- Duke's aliens land at night
function surface(x, z) {
  const c = S.world.chunks.get(Math.floor(x / 16) + ',' + Math.floor(z / 16));
  if (!c) return null;
  for (let y = c.hi + 1; y > c.lo; y--) {
    const b = blockInfo(S.world.block(Math.floor(x), y - 1, Math.floor(z)));
    if (!b || b.air || b.shape === 'cross' || b.shape === 'flat') continue;
    if (b.water) return { y, water: true };
    if (b.h > 0) return { y: y - 1 + b.h, water: false };
  }
  return null;
}
const ALIENS = [['LIZTROOP', 55], ['PIGCOP', 25], ['LIZMAN', 12], ['OCTABRAIN', 8]];
function spawnAliens() {
  if (!isNight() || S.duke.count() >= ALIEN_CAP) return;
  const p = S.player.pos;
  for (let tries = 0; tries < 4; tries++) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 16;
    const x = Math.floor(p[0] + Math.cos(a) * r) + 0.5, z = Math.floor(p[2] + Math.sin(a) * r) + 0.5;
    const g = surface(x, z);
    if (!g || g.water) continue;
    let pick = Math.random() * 100, type = ALIENS[0][0];
    for (const [t, w] of ALIENS) { pick -= w; if (pick < 0) { type = t; break; } }
    const y = type === 'OCTABRAIN' ? g.y + 3 : g.y;
    S.duke.spawn(type, [x, y, z], Math.floor(Math.random() * 2048));
    return;
  }
}
function despawnFar() {
  const p = S.player.pos;
  for (const [id, a] of S.duke.actors) if (Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) > 80) S.duke.remove(id);
}

// ---------------------------------------------------------------- the world tick
function worldStep(first) {
  const c = S.controls, p = S.player;
  S.g.time = (S.g.time + 20 / 60) % DAY_TICKS;
  if (S.sleep) { sleepStep(); return; }
  if (S.surv.dead) return;
  if (S.attackCool > 0) S.attackCool -= DT;
  const g = S.gun;
  g.cool = Math.max(0, g.cool - DT); g.kick = Math.max(0, g.kick - DT); g.reload = Math.max(0, g.reload - DT);
  const [lx, ly] = c.takeLook();
  if (S.inv.open) {
    if (first && (c.pressed('inv') || c.pressed('start') || c.pressed('b'))) S.inv.hide();
    p.step(DT, [0, 0], false, false, solidAt, waterAt);
    return;
  }
  p.yaw -= lx;
  p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - ly));
  if (c.slot >= 0) { selectSlot(c.slot); c.slot = -1; }
  if (c.wheel) { selectSlot((S.inv.sel + Math.sign(c.wheel) + 9) % 9); c.wheel = 0; }
  if (first && (c.pressed('inv') || c.pressed('start'))) { S.inv.show(); return; }
  if (first && c.pressed('a')) interact();
  const held = S.inv.held;
  // Holding with the pistol keeps firing; with a medkit it heals; with food it eats.
  const holding = c.down('mine') || c.down('b');
  if (held === 'duke_pistol' && (holding || c.down('a'))) { clearCrack(); fire(); }
  else if (held === 'duke_medkit' && (holding || c.down('a')) && S.surv.hp < 20) {
    S.surv.heal(20); S.inv.useHeld(); feed('Used a Portable Medkit');
  } else {
    const pts = held ? S.items.food(held) : 0;
    const eating = pts && S.surv.food < 20 && (c.down('a') || (TOUCH && c.down('mine')));
    if (eating) {
      if (S.surv.eat(pts, true, DT)) { S.inv.useHeld(); feed(`Ate ${S.items.name(held)}`); }
    } else S.surv.eating = 0;
    if (!eating && holding) mine();
    else clearCrack();
  }
  const before = [p.pos[0], p.pos[2]];
  const sneak = c.down('sneak');
  const sprint = !sneak && (c.down('sprint') || (TOUCH && Math.hypot(...c.stick) > 0.95)) && S.surv.food > 6;
  p.step(DT, c.move(), c.down('jump'), sprint, solidAt, waterAt, { sneak, climb: climbAt });
  S.sprinting = sprint && Math.hypot(p.vel[0], p.vel[2]) > 5;
  const moved = Math.hypot(p.pos[0] - before[0], p.pos[2] - before[1]);
  const fx = Math.floor(p.pos[0]), fz = Math.floor(p.pos[2]);
  const head = blockInfo(S.world.block(fx, Math.floor(p.pos[1] + 1.62), fz));
  const feet = blockInfo(S.world.block(fx, Math.floor(p.pos[1] + 0.1), fz));
  S.surv.step(DT, p, { headInWater: !!(head && head.water), inLava: !!(feet && feet.lava), sprinting: sprint && moved > 0.01, moving: moved > 0.01, sunlit: false });
  if (S.frames % 120 === 0) { spawnAliens(); despawnFar(); }
  if (p.pos[1] < -80) { S.surv.hurtCool = 0; S.surv.hurt(40, 'void'); }
}

function respawn(msg) {
  const [x, y, z] = S.g.spawn;
  S.player.pos = [x, y + 0.1, z];
  S.player.vel = [0, 0, 0];
  S.surv.fallFrom = null;
  if (msg) toast(msg, 3200);
}
const KILLERS = { LIZTROOP: 'an ASSAULT TROOPER', PIGCOP: 'a PIG COP', LIZMAN: 'an ASSAULT ENFORCER', OCTABRAIN: 'an OCTABRAIN', COMMANDER: 'an ASSAULT COMMANDER', DRONE: 'a SENTRY DRONE' };
function died(cause) {
  const why = { fall: 'You fell from a high place.', drowning: 'You drowned.', lava: 'You tried to swim in lava.', starving: 'You starved.', void: 'You fell out of the world.', creeper: 'You were blown up by a CREEPER.', arrow: 'You were shot by a SKELETON.', explosion: 'You were blown up.' }[cause]
    || (KILLERS[cause] ? `You were killed by ${KILLERS[cause]}.` : `You were slain by a ${String(cause || 'monster').replace(/_/g, ' ').toUpperCase()}.`);
  $('dead-why').textContent = why;
  $('dead').hidden = false;
  clearCrack();
  if (document.pointerLockElement) document.exitPointerLock?.();
}
function revive() {
  $('dead').hidden = true;
  S.surv.revive();
  S.mobs.clearAll();
  S.duke.clearAll();
  respawn('You woke up where you last rested.');
  saveAll('respawn');
}

function tickOnce(first) {
  if (S.mode === 'world') worldStep(first);
  const frozen = S.mode !== 'world' || !!S.sleep || S.surv.dead;
  S.mobs.update(DT, frozen);
  S.duke.update(DT, frozen);
  S.frames++;
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
  updateMessages(now);
  if (S.mode === 'world') {
    const c = S.controls;
    S.acc += dt;
    const step = 1000 / HZ;
    let n = 0;
    while (S.acc >= step && n < 4) { S.acc -= step; c.poll(); tickOnce(n === 0); n++; }
    if (n === 4) S.acc = 0;
    stream();
    const p = S.player, cam = S.view.camera;
    const eye = p.eye();
    cam.position.set(eye[0], eye[1], eye[2]);
    cam.rotation.set(p.pitch, p.yaw, 0);
    const hit = !S.inv.open ? targetBlock() : null;
    S.view.outline.visible = !!hit && S.inv.held !== 'duke_pistol';
    if (hit) S.view.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const biome = biomeName(p.pos[0], p.pos[2]);
    const sky = (biome && W.biomes[biome] && W.biomes[biome].sky) || '#78a7ff';
    S.view.setDaylight(daylight(), sky);
    if (biome && biome !== S.lastBiome && performance.now() - (S.signAt || 0) > 4000) {
      S.lastBiome = biome; S.signAt = performance.now();
      sign(biome.replace(/_/g, ' ').toUpperCase());
    }
    S.view.skyTime(S.g.time);
    const fov = 72 * (S.sprinting ? 1.12 : 1);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * 0.15; cam.updateProjectionMatrix(); }
    S.duke.render(eye);
    S.view.stepParticles(dt / 1000);
    S.surv.render();
    drawGun();
    if (S.itemNameUntil && now > S.itemNameUntil) { $('itemname').hidden = true; S.itemNameUntil = 0; }
    $('eatbar').hidden = !S.surv.eating;
    if (S.surv.eating) $('eatbar').style.setProperty('--k', String(Math.min(1, S.surv.eating / 1.6)));
    S.view.render();
    if (S.frames % 30 === 0) updateHud();
    if (now - (S.ctxAt || 0) > 120) { S.ctxAt = now; updateCtx(); }
    if (now - S.lastSave > AUTOSAVE_MS) saveAll('timer');
  } else if (S.mode === 'title') titleInput();
  else if (S.mode === 'newworld') newWorldInput();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- saving
function saveAll(reason) {
  const g = S.g;
  if (!g || !S.player) return;
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
  S.view = new View($('view'), S.atlasImg, S.blankImg, world);
  S.view.setRadius(RADIUS);
  S.view.setSky(await image(W.sun), await image(W.moon));
  world.onMesh = (m) => S.view.addChunk(m);
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
        const g = surface(x, z);
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

function nearBlock(re) {
  const p = S.player.pos;
  const x0 = Math.floor(p[0]), y0 = Math.floor(p[1]), z0 = Math.floor(p[2]);
  for (let y = y0 - 2; y <= y0 + 3; y++) for (let z = z0 - 4; z <= z0 + 4; z++) for (let x = x0 - 4; x <= x0 + 4; x++) {
    const b = blockInfo(S.world.block(x, y, z));
    if (b && re.test(b.name)) return true;
  }
  return false;
}

async function makeEntities() {
  S.items = new Items(W);
  const baseName = S.items.name.bind(S.items), baseStack = S.items.maxStack.bind(S.items);
  S.items.name = (id) => (DUKE_ITEMS[id] ? DUKE_ITEMS[id].name : baseName(id));
  S.items.maxStack = (id) => (DUKE_ITEMS[id] ? DUKE_ITEMS[id].stack : baseStack(id));
  S.inv = new Inventory({
    items: S.items, recipes: [...DUKE_RECIPES, ...W.recipes], icon: iconCss, giveItem: () => false,
    nearTable: () => nearBlock(/^crafting_table$/), nearFurnace: () => nearBlock(/^(furnace|smoker|blast_furnace)$/),
    say: (t) => toast(t, 2400), onChange: () => renderHotbar(),
  });
  S.surv = new Survival({ onDeath: died, flash: hurtFlash });
  S.attackCool = 0;
  S.mobs = new Mobs({
    view: S.view, world: S.world, blockInfo, solidAt, waterAt, player: S.player, survival: S.surv, isNight,
    biome: (x, z) => { const n = biomeName(x, z); return n ? { name: n, ...W.biomes[n] } : null; },
    surface: (x, z) => {
      const g = surface(x, z);
      if (!g) return null;
      const top = blockInfo(S.world.block(Math.floor(x), Math.floor(g.y) - 1, Math.floor(z)));
      return { ...g, top: top ? top.name : null };
    },
    edit: (x, y, z, name) => edit(x, y, z, S.names.indexOf(name)),
    drop: (item, n) => gain(item, n),
    say: (t) => toast(t, 2600),
    follower: () => null,
    reward: () => {},
    calm: () => false,
    followerHurt: () => {},
    blast: () => {},
    clearLine: () => true,
    skyOpen: () => true,
  });
  const duke = new Duke({
    scene: S.view.scene, solidAt, opaqueAt, waterAt, player: S.player,
    hurtPlayer: (hearts, cause) => { if (!S.surv.dead) { S.surv.hurtCool = 0; S.surv.hurt(Math.max(1, Math.round(hearts)), cause); } },
    healPlayer: (hearts) => S.surv.heal(Math.round(hearts)),
    health: () => S.surv.hp,
    say: (t) => toast(t, 2200),
    breakBlock, burst: (...a) => S.view.burst(...a),
    flash: (r, g, b) => tint(r, g, b),
    onKill: () => { S.g.kills = (S.g.kills || 0) + 1; updateHud(); },
    mobsNear: (x, y, z, r) => S.mobs.list.filter((m) => Math.hypot(m.body.pos[0] - x, m.body.pos[1] - y, m.body.pos[2] - z) < r).map((m) => ({ damage: (n) => S.mobs.damage(m, n, [x, y, z]) })),
    // Duke's pickups (ammo boxes, medkits) go into the Minecraft inventory.
    ammo: (weapon, n) => { if (weapon === 1 || weapon === 0) { gain('duke_pistol_ammo', n); renderHotbar(); } },
    inventory: (item, n) => { if (n > 0) gain('duke_medkit', 1); },
  });
  await duke.init(S.conWasm, S.grp);
  S.duke = duke;
  if (audio.ctx) { duke.sounds.attach(audio.ctx); duke.sounds.muted = audio.muted; }
}

function hurtFlash() { const h = $('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
function tint(r, g, b) {
  const el = $('tint');
  el.style.background = `rgba(${Math.min(255, r * 4)},${Math.min(255, g * 4)},${Math.min(255, b * 4)},0.35)`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

function loadInventory(g) { if (g.inv && Array.isArray(g.inv.slots)) S.inv.load(g.inv); S.surv.load(g.surv); }

async function continueGame() {
  const saved = JSON.parse(store.get(WORLD_KEY));
  enterLoading();
  try { S.edits = JSON.parse(store.get(EDITS_KEY) || '{}'); } catch { S.edits = {}; }
  S.g = saved;
  await startWorld(saved);
  S.player = new Player(...saved.pos);
  S.player.yaw = saved.yaw || 0;
  S.player.pitch = saved.pitch || 0;
  await makeEntities();
  loadInventory(saved);
  await S.mobs.loadSkins(W.skins);
  await loadAround(saved.pos[0], saved.pos[2], 1);
  enterWorld();
}

async function newGame(seedText) {
  const seed = parseSeed(seedText);
  enterLoading();
  S.edits = {};
  S.g = { v: 1, seed, seedText: seedText || seedString(seed), spawn: [0, 0, 0], origin: [0, 0], time: 1000, kills: 0 };
  const ready = await startWorld(S.g);
  S.player = new Player(0, 200, 0);
  await makeEntities();
  S.inv.add('duke_pistol', 1); S.inv.add('duke_pistol_ammo', 48); S.inv.add('red_bed', 1); S.inv.add('bread', 4); S.inv.add('torch', 8);
  await S.mobs.loadSkins(W.skins);
  const spot = await findSpawn(ready.spawn);
  S.player.pos = [...spot];
  S.player.pitch = -0.15;
  S.g.spawn = [...spot];
  S.g.origin = [spot[0], spot[2]];
  await loadAround(spot[0], spot[2], 1);
  enterWorld();
  toast(TOUCH
    ? `SEED ${S.g.seedText}. Left thumb: walk. Right thumb: look; with the pistol, tap or hold to fire. Aliens land at night.`
    : `SEED ${S.g.seedText}. WASD + mouse. With the pistol: click to fire. Otherwise click: mine, right-click: use. 1–9: hotbar. Aliens land at night.`, 9000);
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

window.__dcTest = { saveAll, interact, edit, fire, mine, targetBlock, revive, surface, spawnAliens, breakBlock, blockAt: (x, y, z) => S.names[S.world.block(x, y, z)] };

async function main() {
  S.controls = new Controls(unlockAudio);
  $('mute').addEventListener('click', () => { unlockAudio(); audio.setMuted(!audio.muted); });
  audio.setMuted(audio.muted);
  $('btn-continue').addEventListener('click', () => continueGame().catch(fail));
  $('btn-new').addEventListener('click', openNewWorld);
  $('btn-start').addEventListener('click', () => newGame($('seed').value).catch(fail));
  $('toast').addEventListener('click', hideToast);
  $('respawn').addEventListener('click', () => revive());
  addEventListener('resize', () => S.view && S.view.resize());
  const leaving = (why) => { if (S.mode === 'world') saveAll(why); };
  addEventListener('visibilitychange', () => {
    if (document.hidden) { leaving('hidden'); if (audio.ctx) audio.ctx.suspend().catch(() => {}); }
    else if (audio.ctx && S.started) audio.ctx.resume().catch(() => {});
  });
  addEventListener('pagehide', () => leaving('pagehide'));
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser is too old (no DecompressionStream)');
    const [mc, con, grp] = await Promise.all([gunzip(b64bytes(ASSETS.mc)), gunzip(b64bytes(ASSETS.con)), gunzip(b64bytes(ASSETS.duke))]);
    S.mcWasm = mc;
    S.conWasm = con;
    S.grp = readGrp(grp);
    S.mcData = b64bytes(ASSETS.data);
    S.atlasImg = await image(ASSETS.atlas);
    S.atlasUrl = 'data:image/png;base64,' + ASSETS.atlas;
    S.atlasRows = S.atlasImg.height / 16;
    S.itemsImg = await image(ASSETS.items);
    S.itemsUrl = 'data:image/png;base64,' + ASSETS.items;
    S.itemRows = S.itemsImg.height / 16;
    const blank = document.createElement('canvas');
    blank.width = blank.height = 16;
    S.blankImg = blank;
  } catch (e) { fail(e); throw e; }
  delete ASSETS.mc; delete ASSETS.con; delete ASSETS.duke; delete ASSETS.data;
  $('loading').hidden = true;
  $('btn-continue').hidden = !store.get(WORLD_KEY);
  if (!store.set('dukecraft.probe', '1')) $('nosave').hidden = false;
  $('title').querySelector('.menu').hidden = false;
  renderTitle();
  S.mode = 'title';
  requestAnimationFrame(frame);
}
main();
