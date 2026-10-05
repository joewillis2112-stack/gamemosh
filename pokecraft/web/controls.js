// Input. Two sets of controls share the screen:
// - walking (first person): a thumbstick on the left, drag on the right to
//   look, and buttons (jump, A use, B mine, BALL, MENU); or WASD + mouse.
// - the Game Boy pad, whenever Pokémon's own screens are up (menus, text,
//   battles): d-pad, A, B, START, SELECT; or arrows + Z/X/Enter/Shift.
// Presses are latched so a tap shorter than a frame still counts.

const $ = (id) => document.getElementById(id);
const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } };

export const GB = { A: 1, B: 2, SELECT: 4, START: 8, RIGHT: 16, LEFT: 32, UP: 64, DOWN: 128 };

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'fwd', KeyS: 'back', KeyA: 'strafeL', KeyD: 'strafeR',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'select',
  KeyZ: 'a', KeyX: 'b', KeyE: 'inv', KeyI: 'inv', KeyQ: 'ball', KeyR: 'ball', KeyF: 'a',
  Enter: 'start', Escape: 'start', Tab: 'start', Backspace: 'select', KeyM: 'start',
};

export class Controls {
  constructor(onFirstInput) {
    this.held = new Set(); // keyboard + touch buttons
    this.latched = new Set();
    this.prev = new Set();
    this.now = new Set();
    this.stick = [0, 0];
    this.lookDelta = [0, 0];
    this.wheel = 0;
    this.mouse = { left: false, right: false };
    this.onFirstInput = onFirstInput;
    this.gbMode = false;
    this.slot = -1;
    this.bindKeys();
    this.bindMouse();
    this.bindTouch();
    this.noZoom();
  }

  /// Phones must never zoom the game. iOS Safari ignores `user-scalable=no`,
  /// and cancelling pointer events doesn't stop its double-tap zoom (two quick
  /// taps on the pad zoomed in, and touch-action: none then blocked pinching
  /// back out). Cancel the touches themselves on the play areas, and if a zoom
  /// happens anyway, reset it.
  noZoom() {
    const PLAY = '#gb-pad, #fps-pad, #gb, #view';
    const guard = (e) => { if (e.target.closest && e.target.closest(PLAY)) e.preventDefault(); };
    document.addEventListener('touchstart', guard, { passive: false });
    document.addEventListener('touchend', guard, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
    // Rewriting the viewport tag makes Safari drop back to 1×.
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', () => {
      if (vv.scale <= 1.01) return;
      const meta = document.querySelector('meta[name=viewport]');
      const c = meta.content;
      meta.content = c + ',minimum-scale=1';
      requestAnimationFrame(() => { meta.content = c; });
    });
  }

  first() { if (this.onFirstInput) this.onFirstInput(); }

  bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (/^Digit[1-9]$/.test(e.code)) { this.slot = Number(e.code.slice(5)) - 1; return; }
      const b = KEYS[e.code];
      if (!b) return;
      e.preventDefault();
      this.first();
      if (!e.repeat) this.latched.add(b);
      this.held.add(b);
    });
    addEventListener('keyup', (e) => { const b = KEYS[e.code]; if (b) this.held.delete(b); });
    addEventListener('blur', () => { this.held.clear(); this.mouse.left = this.mouse.right = false; });
  }

  bindMouse() {
    const view = $('view');
    view.addEventListener('mousedown', (e) => {
      if (this.gbMode || e.pointerType === 'touch') return;
      this.first();
      if (document.pointerLockElement !== view) { view.requestPointerLock?.()?.catch?.(() => {}); return; }
      if (e.button === 0) { this.mouse.left = true; this.latched.add('mine'); }
      if (e.button === 2) { this.mouse.right = true; this.latched.add('a'); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    view.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== view) return;
      this.lookDelta[0] += e.movementX * 0.0025;
      this.lookDelta[1] += e.movementY * 0.0025;
    });
    view.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  bindTouch() {
    // --- walking controls
    const fps = $('fps-pad');
    const stickEl = $('stick'), knob = $('knob');
    const pointers = new Map(); // id -> { kind, x0, y0, x, y, btn }
    const release = (id) => {
      const p = pointers.get(id);
      if (!p) return;
      if (p.kind === 'stick') { this.stick = [0, 0]; stickEl.hidden = true; }
      if (p.kind === 'btn') { this.held.delete(p.btn); p.el.classList.remove('down'); }
      pointers.delete(id);
    };
    fps.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.first();
      fps.setPointerCapture?.(e.pointerId);
      const btn = e.target.closest('[data-act]');
      if (btn) {
        const b = btn.dataset.act;
        this.held.add(b); this.latched.add(b);
        btn.classList.add('down');
        buzz();
        pointers.set(e.pointerId, { kind: 'btn', btn: b, el: btn });
        return;
      }
      const slot = e.target.closest('[data-slot]');
      if (slot) { this.slot = Number(slot.dataset.slot); return; }
      const leftSide = e.clientX < window.innerWidth * 0.45;
      if (leftSide) {
        stickEl.hidden = false;
        stickEl.style.left = e.clientX + 'px';
        stickEl.style.top = e.clientY + 'px';
        knob.style.transform = 'translate(-50%, -50%)';
        pointers.set(e.pointerId, { kind: 'stick', x0: e.clientX, y0: e.clientY });
      } else {
        pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, t: performance.now(), x0: e.clientX, y0: e.clientY });
      }
    });
    fps.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      if (p.kind === 'stick') {
        const R = 46;
        let dx = e.clientX - p.x0, dy = e.clientY - p.y0;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.stick = [dx / R, -dy / R];
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (p.kind === 'look') {
        this.lookDelta[0] += (e.clientX - p.x) * 0.0065;
        this.lookDelta[1] += (e.clientY - p.y) * 0.0065;
        p.x = e.clientX; p.y = e.clientY;
      }
    });
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      // A quick tap on the look area is A (use / talk), like tapping in Bedrock.
      if (p && p.kind === 'look' && performance.now() - p.t < 220 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 12) this.latched.add('a');
      release(e.pointerId);
    };
    fps.addEventListener('pointerup', up);
    fps.addEventListener('pointercancel', up);
    fps.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Game Boy pad
    const pad = $('gb-pad');
    const gbPointers = new Map();
    const recompute = () => {
      for (const b of ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select']) this.held.delete('gb-' + b);
      for (const set of gbPointers.values()) for (const b of set) this.held.add('gb-' + b);
      for (const el of pad.querySelectorAll('[data-btn]')) el.classList.toggle('down', this.held.has('gb-' + el.dataset.btn));
      const dp = $('dpad');
      for (const d of ['up', 'down', 'left', 'right']) dp.classList.toggle(d, this.held.has('gb-' + d));
    };
    const buttonsAt = (x, y) => {
      const out = new Set();
      const dp = $('dpad').getBoundingClientRect();
      if (x >= dp.left && x <= dp.right && y >= dp.top && y <= dp.bottom) {
        const dx = (x - (dp.left + dp.width / 2)) / (dp.width / 2), dy = (y - (dp.top + dp.height / 2)) / (dp.height / 2);
        if (Math.hypot(dx, dy) > 0.18) {
          if (Math.abs(dx) > Math.abs(dy)) out.add(dx > 0 ? 'right' : 'left');
          else out.add(dy > 0 ? 'down' : 'up');
        }
        return out;
      }
      const el = document.elementFromPoint(x, y);
      const btn = el && el.closest('#gb-pad [data-btn]');
      if (btn) out.add(btn.dataset.btn);
      return out;
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.first();
      pad.setPointerCapture?.(e.pointerId);
      const set = buttonsAt(e.clientX, e.clientY);
      if (set.size) buzz();
      for (const b of set) this.latched.add('gb-' + b);
      gbPointers.set(e.pointerId, set);
      recompute();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!gbPointers.has(e.pointerId)) return;
      e.preventDefault();
      const before = gbPointers.get(e.pointerId);
      const set = buttonsAt(e.clientX, e.clientY);
      const isDir = (b) => ['up', 'down', 'left', 'right'].includes(b);
      const next = new Set([...[...before].filter((b) => !isDir(b)), ...[...set].filter(isDir)]);
      for (const b of next) if (!before.has(b)) { this.latched.add('gb-' + b); buzz(5); }
      gbPointers.set(e.pointerId, next);
      recompute();
    });
    const gbUp = (e) => { gbPointers.delete(e.pointerId); recompute(); };
    pad.addEventListener('pointerup', gbUp);
    pad.addEventListener('pointercancel', gbUp);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /// Call once per game frame.
  poll() {
    this.prev = this.now;
    const now = new Set([...this.held, ...this.latched]);
    this.latched.clear();
    if (this.mouse.left) now.add('mine');
    for (const pad of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!pad) continue;
      const b = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (b(0)) now.add('a'); if (b(1)) now.add('b'); if (b(9)) now.add('start'); if (b(8)) now.add('select');
      if (b(12)) now.add('up'); if (b(13)) now.add('down'); if (b(14)) now.add('left'); if (b(15)) now.add('right');
      if (b(7)) now.add('mine'); if (b(6)) now.add('ball'); if (b(3)) now.add('jump');
      if (Math.abs(pad.axes[0]) > 0.15 || Math.abs(pad.axes[1]) > 0.15) this.padStick = [pad.axes[0], -pad.axes[1]]; else this.padStick = null;
      if (Math.abs(pad.axes[2]) > 0.15 || Math.abs(pad.axes[3]) > 0.15) { this.lookDelta[0] += pad.axes[2] * 0.05; this.lookDelta[1] += pad.axes[3] * 0.05; }
    }
    this.now = now;
  }

  down(b) { return this.now.has(b); }
  pressed(b) { return this.now.has(b) && !this.prev.has(b); }

  /// Walking: [right, forward].
  move() {
    let x = this.stick[0], z = this.stick[1];
    if (this.padStick) [x, z] = this.padStick;
    if (this.down('fwd') || this.down('up')) z += 1;
    if (this.down('back') || this.down('down')) z -= 1;
    if (this.down('strafeR') || this.down('right')) x += 1;
    if (this.down('strafeL') || this.down('left')) x -= 1;
    return [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, z))];
  }

  takeLook() { const d = this.lookDelta; this.lookDelta = [0, 0]; return d; }

  /// Game Boy buttons for Pokémon's screens.
  gbMask() {
    const on = (k) => this.down(k) || this.down('gb-' + k);
    let m = 0;
    if (on('a')) m |= GB.A;
    if (on('b')) m |= GB.B;
    if (on('select')) m |= GB.SELECT;
    if (on('start')) m |= GB.START;
    if (on('right') || this.down('strafeR')) m |= GB.RIGHT;
    if (on('left') || this.down('strafeL')) m |= GB.LEFT;
    if (on('up') || this.down('fwd')) m |= GB.UP;
    if (on('down') || this.down('back')) m |= GB.DOWN;
    return m;
  }

  /// Swallow everything held now until released (a press that closed one
  /// screen must not act on the next).
  lock() {
    this.latched.clear();
    this.prev = new Set([...this.held, ...this.now]);
    this.now = new Set(this.prev);
  }

  setMode(gb) {
    if (this.gbMode === gb) return;
    this.gbMode = gb;
    $('fps-pad').hidden = gb;
    $('gb-pad').hidden = !gb;
    this.stick = [0, 0];
    $('stick').hidden = true;
    for (const b of [...this.held]) if (b.startsWith('gb-') || ['jump', 'mine', 'a', 'b', 'ball', 'start', 'sprint', 'inv'].includes(b)) this.held.delete(b);
    if (gb && document.pointerLockElement) document.exitPointerLock?.();
  }
}
