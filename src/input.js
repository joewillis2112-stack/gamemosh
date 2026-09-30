// Unified input: touch (virtual joystick + drag-to-look + buttons), keyboard/mouse, gamepad.
// Gameplay reads one simple state object and never cares which device produced it.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyQ: 'dodge', ControlLeft: 'dodge', KeyE: 'interact', KeyR: 'flask',
  KeyF: 'torch', KeyG: 'throw', KeyC: 'use', Tab: 'inventory', KeyI: 'inventory', KeyM: 'map', Escape: 'menu', KeyJ: 'journal',
};

export class Input {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.keys = new Set();
    this.pressed = new Set();
    this.held = new Set();
    this.holdStart = {};
    this.released = new Set();
    this.touchMode = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.enabled = true;
    this.joy = null; // { id, ox, oy, x, y }
    this.lookTouch = null;
    this.gamepad = { active: false, prevButtons: [] };
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  press(name) {
    if (!this.held.has(name)) {
      this.pressed.add(name);
      this.holdStart[name] = performance.now();
    }
    this.held.add(name);
  }
  release(name) {
    if (this.held.has(name)) this.released.add(name);
    this.held.delete(name);
  }
  consume(name) {
    const had = this.pressed.has(name);
    this.pressed.delete(name);
    return had;
  }
  consumeRelease(name) {
    const had = this.released.has(name);
    this.released.delete(name);
    return had;
  }
  isHeld(name) {
    return this.held.has(name);
  }
  holdTime(name) {
    return this.held.has(name) ? (performance.now() - this.holdStart[name]) / 1000 : 0;
  }
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.look.x = 0;
    this.look.y = 0;
  }
  clearAll() {
    for (const n of [...this.held]) this.release(n);
    this.pressed.clear();
    this.released.clear();
    this.move.x = this.move.y = 0;
    this.joy = null;
    this.lookTouch = null;
    this._drawJoy();
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.code === 'Tab') e.preventDefault();
      if (e.target && (e.target.tagName === 'INPUT')) return;
      this.setTouchMode(false);
      this.keys.add(a);
      this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.keys.delete(a);
      this.release(a);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.clearAll(); });
  }

  _bindMouse() {
    const c = this.canvas;
    this.dragLook = false;
    c.addEventListener('mousedown', (e) => {
      if (this.touchMode || !this.enabled) return;
      if (e.button === 0) {
        if (document.pointerLockElement !== c && c.requestPointerLock) {
          try {
            const p = c.requestPointerLock();
            if (p && p.catch) p.catch(() => {});
          } catch { /* pointer lock refused: fall back to drag look */ }
        }
        this.press('attack');
      } else if (e.button === 2) {
        this.dragLook = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.release('attack');
      if (e.button === 2) this.dragLook = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      if (document.pointerLockElement === c || this.dragLook) {
        this.look.x += e.movementX * 0.0025 * this.sensitivity;
        this.look.y += e.movementY * 0.0025 * this.sensitivity * (this.invertY ? -1 : 1);
      }
    });
  }

  _bindTouch() {
    const zone = this.root.querySelector('#touch-zone');
    this.joyBase = this.root.querySelector('#joy-base');
    this.joyKnob = this.root.querySelector('#joy-knob');
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.setTouchMode(true);
      e.preventDefault();
      const w = window.innerWidth;
      if (e.clientX < w * 0.45 && !this.joy) {
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      } else if (!this.lookTouch) {
        this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this._drawJoy();
    }, { passive: false });
    zone.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy.x = e.clientX; this.joy.y = e.clientY;
        this._drawJoy();
      } else if (this.lookTouch && e.pointerId === this.lookTouch.id) {
        this.look.x += (e.clientX - this.lookTouch.x) * 0.0055 * this.sensitivity;
        this.look.y += (e.clientY - this.lookTouch.y) * 0.0055 * this.sensitivity * (this.invertY ? -1 : 1);
        this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this._drawJoy(); }
      if (this.lookTouch && e.pointerId === this.lookTouch.id) this.lookTouch = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    // On-screen buttons
    for (const btn of this.root.querySelectorAll('[data-btn]')) {
      const name = btn.dataset.btn;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerType !== 'mouse') this.setTouchMode(true);
        btn.classList.add('down');
        this.press(name);
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      });
      const up = (e) => { e.preventDefault(); btn.classList.remove('down'); this.release(name); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  _drawJoy() {
    if (!this.joyBase) return;
    if (!this.joy) {
      this.joyBase.classList.remove('active');
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      this.move.x = this.move.y = 0;
      return;
    }
    const max = 56;
    let dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    this.joyBase.classList.add('active');
    this.joyBase.style.left = `${this.joy.ox}px`;
    this.joyBase.style.top = `${this.joy.oy}px`;
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.move.x = dx / max;
    this.move.y = -dy / max;
  }

  // Called once per frame before gameplay reads state
  poll(dt) {
    // Keyboard movement
    if (!this.joy && !this.gamepad.active) {
      this.move.x = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
      this.move.y = (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0);
      const l = Math.hypot(this.move.x, this.move.y);
      if (l > 1) { this.move.x /= l; this.move.y /= l; }
    }
    this._pollGamepad(dt);
  }

  get sprinting() {
    if (this.joy) return Math.hypot(this.move.x, this.move.y) > 0.93;
    return this.held.has('sprint');
  }

  _pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) { this.gamepad.active = false; return; }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const anyInput = lx || ly || rx || ry || gp.buttons.some((b) => b.pressed);
    if (anyInput) { this.gamepad.active = true; this.setTouchMode(false); }
    if (!this.gamepad.active) return;
    this.move.x = lx; this.move.y = -ly;
    this.look.x += rx * dt * 2.6 * this.sensitivity;
    this.look.y += ry * dt * 2.0 * this.sensitivity * (this.invertY ? -1 : 1);
    // Standard mapping
    const map = { 0: 'jump', 1: 'dodge', 2: 'attack', 3: 'interact', 4: 'flask', 5: 'throw', 10: 'sprint', 9: 'menu', 8: 'map', 12: 'up_d', 13: 'down_d', 14: 'left_d', 15: 'right_d', 7: 'attack', 6: 'torch' };
    const prev = this.gamepad.prevButtons;
    gp.buttons.forEach((b, i) => {
      const name = map[i];
      if (!name) return;
      if (b.pressed && !prev[i]) this.press(name);
      if (!b.pressed && prev[i]) this.release(name);
      prev[i] = b.pressed;
    });
  }
}
