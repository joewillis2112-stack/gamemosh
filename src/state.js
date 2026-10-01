// Save data + settings. Stored in this browser only (localStorage), wrapped so the game
// still runs where storage is blocked.
import { SAVE_KEY, SETTINGS_KEY } from './config.js';

const SETS = ['opened', 'notes', 'discovered', 'seen', 'beacons', 'bosses', 'crafted', 'hints'];
export const FOG_N = 128; // fog-of-war grid cells per side

export function newState(seed) {
  return {
    version: 1,
    seed,
    created: Date.now(),
    player: {
      x: 0, y: 0, z: 0, facing: 0,
      hp: 100, stamina: 100, dread: 0, embers: 0, level: 1,
      stats: { vigor: 1, endurance: 1, might: 1, resolve: 1 },
      flasks: 3, flaskMax: 3, flaskLvl: 0,
      torchFuel: 150, torchOn: false,
    },
    inv: { rusted_sword: 1, tattered_cloak: 1, torch: 1, dried_meat: 2, firebomb: 1 },
    weaponLvl: {},
    equip: { weapon: 'rusted_sword', armor: 'tattered_cloak', charm: null },
    opened: new Set(),
    notes: new Set(),
    noteTexts: {},
    discovered: new Set(),
    seen: new Set(),
    beacons: new Set(),
    bosses: new Set(),
    crafted: new Set(),
    hints: new Set(),
    harvested: [],
    shrine: null,
    time: 0.3,
    fog: new Uint8Array(FOG_N * FOG_N),
    remnant: null,
    day: 0,
    bought: {},
    stats: { kills: 0, deaths: 0, playTime: 0, bossKills: 0 },
    ended: false,
  };
}

function fogToString(f) {
  let s = '';
  for (let i = 0; i < f.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) if (f[i + k]) b |= 1 << k;
    s += String.fromCharCode(b);
  }
  return btoa(s);
}
function fogFromString(str) {
  const f = new Uint8Array(FOG_N * FOG_N);
  try {
    const s = atob(str);
    for (let i = 0; i < s.length; i++) {
      const b = s.charCodeAt(i);
      for (let k = 0; k < 8; k++) f[i * 8 + k] = (b >> k) & 1;
    }
  } catch { /* corrupt fog: start blank */ }
  return f;
}

export function serialize(state) {
  const o = { ...state };
  for (const k of SETS) o[k] = [...state[k]];
  o.fog = fogToString(state.fog);
  return JSON.stringify(o);
}

export function deserialize(json) {
  const o = JSON.parse(json);
  const base = newState(o.seed);
  const s = { ...base, ...o, player: { ...base.player, ...o.player, stats: { ...base.player.stats, ...(o.player?.stats || {}) } } };
  for (const k of SETS) s[k] = new Set(o[k] || []);
  s.fog = o.fog ? fogFromString(o.fog) : base.fog;
  s.stats = { ...base.stats, ...(o.stats || {}) };
  return s;
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function peekSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return { seed: o.seed, level: o.player?.level || 1, beacons: (o.beacons || []).length, playTime: o.stats?.playTime || 0 };
  } catch {
    return null;
  }
}

export const DEFAULT_SETTINGS = {
  quality: null, // null = auto
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  music: 0.5,
  vibration: true,
  showFps: false,
  lefty: false,
  shake: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}
