// Game Corner Arcade: Pokémon Red (open-pokered) hosts; the Celadon Game Corner's
// slot machines run PICO-8 carts (pico-r) instead. Arcade score pays out coins.
import initPokered, { PokeredRunner } from 'pokered-runner';

const ASSETS = window.GC_ASSETS;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
const GB = { A: 1, B: 2, SELECT: 4, START: 8, RIGHT: 16, LEFT: 32, UP: 64, DOWN: 128 };
const PICO = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, O: 16, X: 32 };
const POKE_HZ = 59.7275;
const SAVE_KEY = 'gca.save';
const FLAGS_KEY = 'gca.flags';
const MUTE_KEY = 'gca.muted';
const AUTOSAVE_MS = 30000;
const PENDING_KEY = 'gca.pending'; // an unfinished cabinet run, paid out on CONTINUE

const CARTS = [
  {
    id: 'celeste',
    title: 'CELESTE CLASSIC',
    by: 'Maddy Thorson & Noel Berry',
    rule: '50 coins per screen climbed. Summit: +500.',
    controls: 'A jump · B dash',
    metric(g) {
      const x = g('room.x'), y = g('room.y');
      if (!(x >= 0 && y >= 0)) return 0;
      const level = (x % 8) + y * 8;
      return level >= 31 ? 0 : level;
    },
    payout: (m) => m * 50 + (m >= 30 ? 500 : 0),
    unit: (m) => `${m} screen${m === 1 ? '' : 's'}`,
  },
  {
    id: 'bubblegum',
    title: 'BUBBLEGUM SPIN',
    by: 'Bee_Randon',
    rule: '1 coin per 200 points.',
    controls: 'A fire · B hold for stats',
    // The cart fires on ❎ and shows stats on 🅾; put fire on the big A button.
    swapAB: true,
    // The cart prints score.."0", so on-screen points are score * 10.
    metric(g) { const s = g('score'); return s > 0 ? Math.floor(s) * 10 : 0; },
    payout: (m) => Math.floor(m / 200),
    unit: (m) => `${m} pts`,
  },
  {
    id: 'ghostwave',
    title: 'GHOST WAVE',
    by: 'monorail',
    rule: '1 coin per 20 points.',
    controls: 'A guns · B rockets',
    // Score is kept as a 16.16 fixed-point fraction (printed with tostr(s, 2)).
    metric(g) { const s = g('score'); return s > 0 ? Math.round(s * 65536) : 0; },
    payout: (m) => Math.floor(m / 20),
    unit: (m) => `${m} pts`,
  },
];

// ---------------------------------------------------------------- helpers
function b64bytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } };

// ---------------------------------------------------------------- input
// Logical buttons, merged from touch pad, keyboard and gamepad every frame.
const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
const input = {
  touch: new Set(),
  keys: new Set(),
  padHeld: new Set(),
  // Presses that started since the last poll; a tap shorter than one frame
  // still counts for that frame.
  latched: new Set(),
  held: new Set(),
  prev: new Set(),
  locked: new Set(),
  poll() {
    this.prev = this.held;
    const raw = new Set([...this.touch, ...this.keys]);
    for (const pad of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!pad) continue;
      const b = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (b(12) || pad.axes[1] < -0.5) raw.add('up');
      if (b(13) || pad.axes[1] > 0.5) raw.add('down');
      if (b(14) || pad.axes[0] < -0.5) raw.add('left');
      if (b(15) || pad.axes[0] > 0.5) raw.add('right');
      if (b(0)) raw.add('a');
      if (b(1)) raw.add('b');
      if (b(9)) raw.add('start');
      if (b(8)) raw.add('select');
    }
    for (const x of this.locked) if (!raw.has(x)) this.locked.delete(x);
    const held = new Set([...raw, ...this.latched]);
    this.latched.clear();
    for (const x of this.locked) held.delete(x);
    this.held = held;
  },
  down(b) { return this.held.has(b); },
  pressed(b) { return this.held.has(b) && !this.prev.has(b); },
  // Swallow whatever is held now until every button is released, so a press
  // that closed one screen doesn't also act on the next.
  lock() {
    // Only buttons still physically down are swallowed; a fresh tap after
    // this point must count.
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
  picoMask(swapAB = false) {
    let m = 0;
    if (this.down('left')) m |= PICO.LEFT;
    if (this.down('right')) m |= PICO.RIGHT;
    if (this.down('up')) m |= PICO.UP;
    if (this.down('down')) m |= PICO.DOWN;
    if (this.down('a')) m |= swapAB ? PICO.X : PICO.O;
    if (this.down('b')) m |= swapAB ? PICO.O : PICO.X;
    return m;
  },
};

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyZ: 'a', KeyK: 'a', Space: 'a', KeyX: 'b', KeyJ: 'b', Escape: 'b',
  Enter: 'start', ShiftLeft: 'select', ShiftRight: 'select', Backspace: 'select',
};
addEventListener('keydown', (e) => {
  const b = KEYS[e.code];
  if (!b) return;
  e.preventDefault();
  if (!e.repeat) input.latched.add(b);
  input.keys.add(b);
  unlockAudio();
});
addEventListener('keyup', (e) => { const b = KEYS[e.code]; if (b) input.keys.delete(b); });
addEventListener('blur', () => { input.keys.clear(); input.touch.clear(); });

// Touch pad: every [data-btn] element. The d-pad is one surface split into
// zones so a thumb can roll between directions without lifting.
function setupTouch() {
  const pointers = new Map(); // pointerId -> Set of buttons
  const recompute = () => {
    input.touch.clear();
    for (const set of pointers.values()) for (const b of set) input.touch.add(b);
    for (const el of document.querySelectorAll('[data-btn]')) {
      el.classList.toggle('down', input.touch.has(el.dataset.btn));
    }
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
        const ang = Math.atan2(dy, dx) * 180 / Math.PI; // 8-way with diagonals
        if (ang > -157.5 && ang < -22.5) out.add('up');
        if (ang > 22.5 && ang < 157.5) out.add('down');
        if (ang > 112.5 || ang < -112.5) out.add('left');
        if (ang > -67.5 && ang < 67.5) out.add('right');
      }
      return out;
    }
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest('[data-btn]');
    if (btn) out.add(btn.dataset.btn);
    return out;
  };
  const pad = $('pad');
  const onDown = (e) => {
    e.preventDefault();
    unlockAudio();
    pad.setPointerCapture?.(e.pointerId);
    const set = buttonsAt(e.clientX, e.clientY);
    if (set.size) buzz();
    for (const b of set) input.latched.add(b);
    pointers.set(e.pointerId, set);
    recompute();
  };
  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    const before = pointers.get(e.pointerId);
    const set = buttonsAt(e.clientX, e.clientY);
    // Only the d-pad slides; a face button stays held until lifted.
    const isDir = (b) => ['up', 'down', 'left', 'right'].includes(b);
    const keep = [...before].filter((b) => !isDir(b));
    const next = new Set([...keep, ...[...set].filter(isDir)]);
    if ([...next].some((b) => !before.has(b))) buzz(5);
    pointers.set(e.pointerId, next);
    recompute();
  };
  const onUp = (e) => { pointers.delete(e.pointerId); recompute(); };
  pad.addEventListener('pointerdown', onDown);
  pad.addEventListener('pointermove', onMove);
  pad.addEventListener('pointerup', onUp);
  pad.addEventListener('pointercancel', onUp);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- pico-r
const pico = {
  ex: null,
  async init() {
    const { instance } = await WebAssembly.instantiate(b64bytes(ASSETS.pico), {});
    this.ex = instance.exports;
    this.ex.web_init_panic_hook();
  },
  load(cartB64) {
    const bytes = b64bytes(cartB64);
    const p = this.ex.web_alloc(bytes.length);
    new Uint8Array(this.ex.memory.buffer, p, bytes.length).set(bytes);
    const err = this.ex.web_init(p, bytes.length);
    this.ex.web_free(p, bytes.length);
    return err === 0;
  },
  fps() { return this.ex.web_get_fps() || 30; },
  step(mask) { this.ex.web_set_buttons(0, mask); this.ex.web_update(); },
  global(name) {
    const b = new TextEncoder().encode(name);
    const p = this.ex.web_alloc(b.length);
    new Uint8Array(this.ex.memory.buffer, p, b.length).set(b);
    const v = this.ex.web_get_global(p, b.length);
    this.ex.web_free(p, b.length);
    return v;
  },
  hasError() { return this.ex.web_has_error() !== 0; },
  blit(image) {
    // ARGB words in little-endian memory: bytes are B, G, R, A.
    const px = new Uint8Array(this.ex.memory.buffer, this.ex.web_get_pixel_buffer(), 128 * 128 * 4);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = px[i + 2]; d[i + 1] = px[i + 1]; d[i + 2] = px[i]; d[i + 3] = 255;
    }
  },
  audio(count) {
    const p = this.ex.web_generate_audio(count);
    return p ? new Float32Array(this.ex.memory.buffer, p, count) : null;
  },
};

// ---------------------------------------------------------------- audio
// One page-owned output pulls from whichever game is on screen.
const audio = {
  ctx: null,
  node: null,
  gain: null,
  muted: store.get(MUTE_KEY) === '1',
  picoPhase: 0,
  picoLast: 0,
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
  peak: 0, // loudest sample since the test hook last reset it
  fill(buf) {
    this.fill_(buf);
    const L = buf.getChannelData(0);
    for (let i = 0; i < L.length; i += 16) this.peak = Math.max(this.peak, Math.abs(L[i]));
  },
  fill_(buf) {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    // Silent when muted, or when the main loop has stopped (hidden tab, stall):
    // the chips would otherwise hold their last note.
    if (this.muted || !game.runner || performance.now() - game.alive > 250) { L.fill(0); R.fill(0); return; }
    if (game.mode === 'poke') {
      const s = game.runner.render_audio(n, this.ctx.sampleRate);
      for (let i = 0; i < n; i++) { L[i] = s[2 * i]; R[i] = s[2 * i + 1]; }
    } else if (game.mode === 'arcade' && pico.ex) {
      const ratio = 22050 / this.ctx.sampleRate;
      const need = Math.ceil(n * ratio + this.picoPhase) + 1;
      const src = pico.audio(need);
      if (!src) { L.fill(0); R.fill(0); return; }
      let pos = this.picoPhase;
      for (let i = 0; i < n; i++) {
        const k = Math.floor(pos), f = pos - k;
        const a = k === 0 ? this.picoLast : src[k - 1], b = src[k];
        const v = a + (b - a) * f;
        L[i] = v; R[i] = v;
        pos += ratio;
      }
      const used = Math.floor(pos);
      this.picoLast = src[Math.min(used, need) - 1] || 0;
      this.picoPhase = pos - used;
    } else {
      L.fill(0); R.fill(0);
    }
  },
  setMuted(m) {
    this.muted = m;
    store.set(MUTE_KEY, m ? '1' : '0');
    if (this.gain) this.gain.gain.value = m ? 0 : 0.8;
    $('mute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
  },
};
function unlockAudio() {
  if (!game.started) return;
  audio.start();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
}

// ---------------------------------------------------------------- screen
const canvas = $('screen');
const ctx2d = canvas.getContext('2d', { alpha: false });
const pokeImage = ctx2d.createImageData(160, 144);
const picoImage = ctx2d.createImageData(128, 128);
function setScreen(kind) {
  const [w, h] = kind === 'pico' ? [128, 128] : [160, 144];
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.classList.toggle('square', kind === 'pico');
}

// ---------------------------------------------------------------- game
const game = {
  runner: null,
  mode: 'loading', // loading | title | poke | picker | arcade | confirm | payout
  started: false,
  acc: 0,
  last: 0,
  lastSave: 0,
  cart: null,
  best: 0,
  pickIndex: 0,
  frames: 0,
  slotsOpened: 0,
  carry: 0, // button bits from taps that landed between ticks
  alive: 0, // last time the main loop ran; audio goes quiet when it stops
  lastPending: 0,
};
window.__gca = game; // test hooks
window.__gcaAudio = audio;
window.__gcaOpen = () => openPicker();
window.__gcaPicoErr = () => pico.hasError();

function hudCoins() {
  const r = game.runner;
  const show = r && (r.has_item('COIN_CASE') || r.current_map() === 'GameCorner');
  $('coins').hidden = !show;
  if (show) $('coins').textContent = `COINS ${String(r.coins()).padStart(4, '0')}`;
}

function autosave(reason) {
  const r = game.runner;
  if (!r) return;
  const s = r.export_live_save();
  if (!s) return;
  if (store.set(SAVE_KEY, s)) store.set(FLAGS_KEY, r.export_flags());
  game.lastSave = performance.now();
  game.lastSaveReason = reason;
}

// A cabinet run in progress is written down so closing the page mid-run
// doesn't lose the coins it earned; CONTINUE pays it out.
function savePending(now = performance.now()) {
  if (!game.cart) return;
  game.lastPending = now;
  store.set(PENDING_KEY, JSON.stringify({ cart: game.cart.id, best: game.best }));
}
function recoverPending() {
  const raw = store.get(PENDING_KEY);
  store.del(PENDING_KEY);
  if (!raw) return false;
  let rec;
  try { rec = JSON.parse(raw); } catch { return false; }
  const cart = CARTS.find((c) => c.id === rec.cart);
  if (!cart) return false;
  const won = cart.payout(rec.best || 0);
  if (won <= 0) return false;
  const total = game.runner.add_coins(won);
  showPayout(won, `Your last ${cart.title} run was unfinished: ${cart.unit(rec.best)}. COIN CASE: ${total}.`);
  return true;
}

// Re-enter the current spot so the map's music starts after a boot.
function restartMapMusic(r) {
  const [x, y] = r.player_position().split(',').map(Number);
  try { r.warp_to(r.current_map(), x, y); } catch { /* keep going silent */ }
}

function boot(kind) {
  let r;
  if (kind === 'continue') {
    r = new PokeredRunner(store.get(SAVE_KEY));
    const flags = store.get(FLAGS_KEY);
    if (flags) r.import_flags(flags);
  } else {
    // The game also auto-loads its own in-game save; a new run must not.
    store.del('pokered.save');
    store.del('pokered.script_flags');
    r = new PokeredRunner(null);
    const quick = kind === 'quick';
    const snapshot = {
      player: {
        playerName: 'RED', rivalName: 'BLUE',
        mapName: quick ? 'GameCorner' : 'RedsHouse2F',
        positionX: quick ? 17 : 3, positionY: quick ? 15 : 6,
        playTimeHours: 0, playTimeMinutes: 0, money: quick ? 5000 : 3000,
      },
      badges: [],
      party: quick ? [{ species: 'Pikachu', level: 20, currentHp: 999, maxHp: 999,
        moves: ['ThunderShock', 'QuickAttack', 'ThunderWave', 'Growl'], nickname: '' }] : [],
      items: quick ? [{ name: 'COIN_CASE', quantity: 1 }, { name: 'POTION', quantity: 5 },
        { name: 'POKE_BALL', quantity: 10 }] : [],
      flags: quick ? { EVENT_GOT_POKEDEX: true } : {},
    };
    r.import_editor_save(JSON.stringify(snapshot));
  }
  game.runner = r;
  restartMapMusic(r);
  autosave('boot');
}

let armed = null;
function startGame(kind) {
  // Both fresh starts replace the save. No window.confirm (sandboxed pages
  // can block it): a second tap on the same button confirms.
  if (kind !== 'continue' && store.get(SAVE_KEY) && armed !== kind) {
    armed = kind;
    $('btn-new').textContent = 'NEW ADVENTURE';
    $('btn-quick').textContent = 'GO TO THE GAME CORNER';
    $(kind === 'new' ? 'btn-new' : 'btn-quick').textContent = 'TAP AGAIN: ERASE SAVE';
    return;
  }
  game.started = true;
  unlockAudio();
  boot(kind);
  if (kind !== 'continue') store.del(PENDING_KEY);
  $('title').hidden = true;
  setScreen('poke');
  game.mode = 'poke';
  game.acc = 0;
  game.carry = 0;
  input.lock();
  hudCoins();
  if (kind === 'continue') recoverPending();
}

// ---- cabinet picker
function openPicker() {
  game.mode = 'picker';
  game.slotsOpened++;
  const r = game.runner;
  let gift = '';
  if (!r.has_item('COIN_CASE')) {
    r.give_item('COIN_CASE', 1);
    gift = 'The attendant hands you a COIN CASE!';
  }
  $('gift').textContent = gift;
  $('gift').hidden = !gift;
  $('picker-coins').textContent = `COINS ${String(r.coins()).padStart(4, '0')}`;
  const list = $('cabinets');
  list.innerHTML = '';
  CARTS.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${c.title}</b><span>${c.by}</span><em>${c.rule}</em><i>${c.controls} · START cash out</i>`;
    li.addEventListener('click', () => { game.pickIndex = i; renderPick(); playCart(i); });
    list.appendChild(li);
  });
  const leave = document.createElement('li');
  leave.className = 'leave';
  leave.innerHTML = '<b>LEAVE</b>';
  leave.addEventListener('click', closePicker);
  list.appendChild(leave);
  game.pickIndex = Math.min(game.pickIndex, CARTS.length);
  renderPick();
  $('picker').hidden = false;
  input.lock();
  hudCoins();
}
function renderPick() {
  [...$('cabinets').children].forEach((li, i) => li.classList.toggle('sel', i === game.pickIndex));
}
function pickerInput() {
  const n = CARTS.length + 1;
  if (input.pressed('up')) { game.pickIndex = (game.pickIndex + n - 1) % n; renderPick(); }
  if (input.pressed('down')) { game.pickIndex = (game.pickIndex + 1) % n; renderPick(); }
  if (input.pressed('a') || input.pressed('start')) {
    if (game.pickIndex === CARTS.length) closePicker(); else playCart(game.pickIndex);
  }
  if (input.pressed('b')) closePicker();
}
function closePicker() {
  $('picker').hidden = true;
  game.mode = 'poke';
  game.acc = 0;
  game.carry = 0;
  input.lock();
  autosave('picker');
}

// ---- arcade
function playCart(i) {
  const cart = CARTS[i];
  if (!pico.load(ASSETS.carts[cart.id])) {
    $('gift').textContent = `${cart.title} is out of order.`;
    $('gift').hidden = false;
    return;
  }
  game.cart = cart;
  game.best = 0;
  game.acc = 0;
  game.carry = 0;
  audio.picoPhase = 0; audio.picoLast = 0;
  $('picker').hidden = true;
  $('arcade-hud').hidden = false;
  $('arcade-title').textContent = cart.title;
  $('arcade-controls').textContent = cart.controls;
  updateArcadeHud();
  setScreen('pico');
  game.mode = 'arcade';
  input.lock();
}
function updateArcadeHud() {
  const c = game.cart;
  $('arcade-score').textContent = `${c.unit(game.best)} = ${c.payout(game.best)} COINS`;
}
function arcadeTick(mask) {
  pico.step(mask);
  if (pico.hasError()) return;
  const m = game.cart.metric((n) => pico.global(n));
  if (m > game.best) {
    game.best = m;
    updateArcadeHud();
    const now = performance.now();
    if (now - game.lastPending > 5000) savePending(now);
  }
}
function askCashOut() {
  game.mode = 'confirm';
  $('confirm-text').textContent = `Cash out ${game.cart.payout(game.best)} coins and leave ${game.cart.title}?`;
  $('confirm').hidden = false;
  input.lock();
}
function confirmInput() {
  if (input.pressed('a') || input.pressed('start')) cashOut();
  else if (input.pressed('b')) resumeArcade();
}
function resumeArcade() {
  $('confirm').hidden = true;
  game.mode = 'arcade';
  game.acc = 0;
  game.carry = 0;
  input.lock();
}
function cashOut() {
  const won = game.cart.payout(game.best);
  const total = game.runner.add_coins(won);
  store.del(PENDING_KEY);
  $('confirm').hidden = true;
  $('arcade-hud').hidden = true;
  showPayout(won, `${game.cart.title}: ${game.cart.unit(game.best)}. COIN CASE: ${total}.`);
  autosave('payout');
}
function showPayout(won, detail) {
  hudCoins();
  $('payout-amount').textContent = won > 0 ? `+${won} COINS` : 'NO COINS';
  $('payout-detail').textContent = detail;
  $('payout').hidden = false;
  game.mode = 'payout';
  game.lastWin = won;
  if (won > 0) buzz(40);
  input.lock();
}
function payoutInput() {
  if (input.pressed('a') || input.pressed('b') || input.pressed('start')) closePayout();
}
function closePayout() {
  $('payout').hidden = true;
  setScreen('poke');
  ctx2d.putImageData(pokeImage, 0, 0);
  game.mode = 'poke';
  game.acc = 0;
  game.carry = 0;
  input.lock();
  hudCoins();
}

// ---------------------------------------------------------------- main loop
function pokeTick(mask) {
  const r = game.runner;
  const px = r.tick(mask);
  game.frames++;
  if (r.screen_name() === 'Slots') {
    // Keep the last overworld frame on screen; the slot machine never shows.
    r.leave_slots();
    openPicker();
    return false;
  }
  pokeImage.data.set(px);
  return true;
}

function frame(now) {
  const dt = Math.min(100, now - (game.last || now));
  game.last = now;
  game.alive = performance.now();
  input.poll();
  switch (game.mode) {
    case 'poke': {
      game.acc += dt;
      const step = 1000 / POKE_HZ;
      // A tap shorter than a frame is carried until a tick actually runs.
      game.carry |= input.gbMask();
      let n = 0, drew = false;
      while (game.acc >= step && n < 4 && game.mode === 'poke') {
        game.acc -= step; n++;
        drew = true;
        const mask = game.carry | input.gbMask();
        game.carry = 0;
        if (!pokeTick(mask)) break;
      }
      if (n === 4) game.acc = 0;
      if (drew) ctx2d.putImageData(pokeImage, 0, 0);
      if (game.frames % 30 === 0) hudCoins();
      if (game.mode === 'poke' && now - game.lastSave > AUTOSAVE_MS && game.runner.screen_name() === 'Overworld') autosave('timer');
      break;
    }
    case 'arcade': {
      if (input.pressed('start') || input.pressed('select')) { askCashOut(); break; }
      game.acc += dt;
      const step = 1000 / pico.fps();
      game.carry |= input.picoMask(game.cart.swapAB);
      let n = 0;
      while (game.acc >= step && n < 3) {
        game.acc -= step; n++;
        const mask = game.carry | input.picoMask(game.cart.swapAB);
        game.carry = 0;
        arcadeTick(mask);
      }
      if (n === 3) game.acc = 0;
      if (n) { pico.blit(picoImage); ctx2d.putImageData(picoImage, 0, 0); }
      break;
    }
    case 'picker': pickerInput(); break;
    case 'confirm': confirmInput(); break;
    case 'payout': payoutInput(); break;
    case 'title': titleInput(); break;
    default: break;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- title
let titleIndex = 0;
function titleButtons() { return [...document.querySelectorAll('#title .menu button')].filter((b) => !b.hidden); }
function renderTitle() { titleButtons().forEach((b, i) => b.classList.toggle('sel', i === titleIndex)); }
function titleInput() {
  const bs = titleButtons();
  if (input.pressed('up')) { titleIndex = (titleIndex + bs.length - 1) % bs.length; renderTitle(); }
  if (input.pressed('down')) { titleIndex = (titleIndex + 1) % bs.length; renderTitle(); }
  if (input.pressed('a') || input.pressed('start')) bs[titleIndex]?.click();
}

// ---------------------------------------------------------------- boot
async function main() {
  setupTouch();
  $('mute').addEventListener('click', () => { unlockAudio(); audio.setMuted(!audio.muted); });
  audio.setMuted(audio.muted);
  $('cashout').addEventListener('click', () => { if (game.mode === 'arcade') askCashOut(); });
  $('confirm-yes').addEventListener('click', () => { if (game.mode === 'confirm') cashOut(); });
  $('confirm-no').addEventListener('click', () => { if (game.mode === 'confirm') resumeArcade(); });
  $('payout-ok').addEventListener('click', () => { if (game.mode === 'payout') closePayout(); });
  $('btn-continue').addEventListener('click', () => startGame('continue'));
  $('btn-new').addEventListener('click', () => startGame('new'));
  $('btn-quick').addEventListener('click', () => startGame('quick'));
  const leaving = (why) => {
    if (game.mode === 'poke') autosave(why);
    if (game.mode === 'arcade' || game.mode === 'confirm') savePending();
  };
  addEventListener('visibilitychange', () => {
    if (document.hidden) {
      leaving('hidden');
      if (audio.ctx) audio.ctx.suspend().catch(() => {});
    } else if (audio.ctx && game.started) {
      audio.ctx.resume().catch(() => {});
    }
  });
  addEventListener('pagehide', () => leaving('pagehide'));

  try {
    await initPokered({ module_or_path: b64bytes(ASSETS.pk) });
    await pico.init();
  } catch (e) {
    $('loading').textContent = `Couldn't start: ${e && e.message ? e.message : e}`;
    throw e;
  }
  delete ASSETS.pk; // free the base64 copy
  delete ASSETS.pico;
  $('loading').hidden = true;
  $('btn-continue').hidden = !store.get(SAVE_KEY);
  if (!store.set('gca.probe', '1')) $('nosave').hidden = false;
  $('title').querySelector('.menu').hidden = false;
  titleIndex = 0;
  renderTitle();
  game.mode = 'title';
  requestAnimationFrame(frame);
}
main();
