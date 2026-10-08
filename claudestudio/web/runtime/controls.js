// Player input on keyboard, mouse and touch, turned into one per-frame
// command: a camera-relative move (x right, y forward, length <= 1) and jump.
// Numbers and layout follow Roblox's default PlayerModule (ControlModule,
// DynamicThumbstick, TouchJump, CameraInput); see
// mashup-research/ROBLOX_DEFAULTS_2026-10-08.md §5-6.
//  - Keyboard: WASD and Up/Down move, Left/Right turn the camera 120°/s, Space jumps.
//  - Mouse: right-drag turns 0.5°/px (vertical x0.77), the wheel zooms.
//  - Touch: a thumbstick that appears where the thumb lands (landscape: left
//    40%, bottom 2/3; portrait: bottom 40%), dead zone 2 px, full speed at
//    20 px (both x2 when the screen's short side > 500 px); a jump button
//    bottom right; drag elsewhere to turn 1°/px (vertical x0.66), pinch to zoom.

const DEG = Math.PI / 180;
const css = `
.cs-stick{position:fixed;border-radius:50%;pointer-events:none;opacity:0;transition:opacity .15s;
  background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 2px rgba(255,255,255,.45)}
.cs-stick.on{opacity:1}
.cs-thumb{position:fixed;border-radius:50%;pointer-events:none;opacity:0;transition:opacity .15s;
  background:rgba(255,255,255,.85);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.cs-thumb.on{opacity:1}
.cs-dot{position:fixed;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;pointer-events:none;
  background:rgba(255,255,255,.55);opacity:0;transition:opacity .15s}
.cs-dot.on{opacity:1}
.cs-hint{position:fixed;border-radius:50%;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4);
  background:rgba(0,0,0,.2);transition:transform .5s,opacity .5s}
.cs-hint.gone{transform:scale(0);opacity:0}
.cs-jump{position:fixed;border-radius:50%;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 2px rgba(255,255,255,.45);
  display:none;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none}
.cs-jump.down{background:rgba(255,255,255,.4)}
.cs-jump svg{width:55%;height:55%}
`;

export class Controls {
  constructor(canvas, camera, { touch = 'ontouchstart' in window } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.isTouch = touch;
    camera.follow = touch; // Roblox's default on touch devices is Follow mode
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.override = null; // tests set { move: [x, y], jump, touch }
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    // Keyboard.
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Mouse: right-drag turns (as Roblox), wheel zooms one step per click.
    // Pointer events: Babylon cancels pointerdown, which suppresses legacy mouse events.
    let drag = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 2) drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 2) drag = null; });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerType !== 'mouse') return;
      // Drag right looks right (yaw is the direction to the camera, so it turns the other way).
      camera.turn(-(e.clientX - drag.x) * 0.5 * DEG, (e.clientY - drag.y) * 0.5 * 0.77 * DEG);
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); camera.zoomStep(Math.sign(e.deltaY)); }, { passive: false });

    // Touch.
    this.big = Math.min(innerWidth, innerHeight) > 500;
    const k = this.big ? 2 : 1;
    this.dead = 2 * k; this.full = 20 * k;
    this.ringSize = 74 * k; this.thumbSize = 45 * k;
    const el = cls => { const d = document.createElement('div'); d.className = cls; document.body.appendChild(d); return d; };
    this.ring = el('cs-stick'); this.thumb = el('cs-thumb');
    Object.assign(this.ring.style, { width: this.ringSize + 'px', height: this.ringSize + 'px' });
    Object.assign(this.thumb.style, { width: this.thumbSize + 'px', height: this.thumbSize + 'px' });
    this.dots = [0, 1, 2].map(() => el('cs-dot'));
    this.jumpBtn = el('cs-jump');
    this.jumpBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5 L19 13 H14.5 V19 H9.5 V13 H5 Z" fill="rgba(255,255,255,.9)"/></svg>';
    if (touch) {
      // Jump button: 70 px at (1,-95, 1,-90) on small screens, 120 px at (1,-170, 1,-210) otherwise.
      const size = this.big ? 120 : 70, x = this.big ? 170 : 95, y = this.big ? 210 : 90;
      Object.assign(this.jumpBtn.style, { display: 'flex', width: size + 'px', height: size + 'px', left: `calc(100% - ${x}px)`, top: `calc(100% - ${y}px)` });
      // A hint ring where the stick usually goes, until the first touch.
      this.hint = el('cs-hint');
      const h = this.ringSize;
      Object.assign(this.hint.style, { width: h + 'px', height: h + 'px', left: `${h * 0.6}px`, top: `calc(100% - ${h * 1.9}px)` });
    }
    this.touches = new Map(); // id -> { kind: 'stick'|'look'|'jump', ... }
    const inStickZone = (x, y) => innerWidth > innerHeight
      ? x < innerWidth * 0.4 && y > innerHeight / 3        // landscape: left 40%, bottom 2/3
      : y > innerHeight * 0.6;                               // portrait: bottom 40%
    const tstart = e => {
      if (this.hint) { this.hint.classList.add('gone'); }
      for (const t of e.changedTouches) {
        if (e.currentTarget === this.jumpBtn) { this.touches.set(t.identifier, { kind: 'jump' }); this.jumpBtn.classList.add('down'); continue; }
        const stickTaken = [...this.touches.values()].some(v => v.kind === 'stick');
        if (inStickZone(t.clientX, t.clientY) && !stickTaken) {
          this.touches.set(t.identifier, { kind: 'stick', ox: t.clientX, oy: t.clientY });
          this.placeStick(t.clientX, t.clientY, t.clientX, t.clientY);
        } else this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
      this.pinch = this.lookTouches().length === 2 ? this.pinchDist() : 0;
      e.preventDefault();
    };
    const tmove = e => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        if (s.kind === 'stick') {
          const dx = t.clientX - s.ox, dy = t.clientY - s.oy, d = Math.hypot(dx, dy);
          // Analog: 0 inside the dead zone, then linear to full speed at `full` px.
          const m = d <= this.dead ? 0 : Math.min(1, d / this.full);
          this.move = d > 0 ? { x: (dx / d) * m, y: (-dy / d) * m } : { x: 0, y: 0 };
          this.placeStick(s.ox, s.oy, t.clientX, t.clientY);
        } else if (s.kind === 'look') {
          if (this.lookTouches().length === 1) {
            // Vertical eases toward 25% as the pitch nears ±90° (Roblox's curve).
            const dy = (t.clientY - s.y), p = camera.pitch, toward = Math.sign(dy) === Math.sign(p);
            const curve = toward ? Math.max(0.25, 1 - Math.pow(2 * Math.abs(p) / Math.PI, 0.75)) : 1;
            camera.turn(-(t.clientX - s.x) * DEG, dy * 0.66 * DEG * curve);
          }
          s.x = t.clientX; s.y = t.clientY;
        }
      }
      if (this.lookTouches().length === 2) {
        // Pinch: dz 0.04 per percent of change in finger distance.
        const d = this.pinchDist();
        if (this.pinch) camera.zoomStep(-((d - this.pinch) / this.pinch) * 100 * 0.04);
        this.pinch = d;
      }
      e.preventDefault();
    };
    const tend = e => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        if (s.kind === 'stick') { this.hideStick(); this.move = { x: 0, y: 0 }; }
        if (s.kind === 'jump') this.jumpBtn.classList.remove('down');
        this.touches.delete(t.identifier);
      }
      this.pinch = 0;
      e.preventDefault();
    };
    for (const target of [canvas, this.jumpBtn]) {
      target.addEventListener('touchstart', tstart, { passive: false });
      target.addEventListener('touchmove', tmove, { passive: false });
      target.addEventListener('touchend', tend, { passive: false });
      target.addEventListener('touchcancel', tend, { passive: false });
    }
  }

  // The ring sits where the thumb landed; the thumb follows the finger, held
  // inside the ring; dots trail from the centre to the thumb.
  placeStick(ox, oy, x, y) {
    const R = this.ringSize / 2, r = this.thumbSize / 2;
    let dx = x - ox, dy = y - oy;
    const d = Math.hypot(dx, dy), max = R;
    if (d > max) { dx *= max / d; dy *= max / d; }
    Object.assign(this.ring.style, { left: ox - R + 'px', top: oy - R + 'px' });
    Object.assign(this.thumb.style, { left: ox + dx - r + 'px', top: oy + dy - r + 'px' });
    this.ring.classList.add('on'); this.thumb.classList.add('on');
    this.dots.forEach((dot, i) => {
      const f = (i + 1) / (this.dots.length + 1);
      Object.assign(dot.style, { left: ox + dx * f + 'px', top: oy + dy * f + 'px' });
      dot.classList.toggle('on', d > this.dead);
    });
  }
  hideStick() { [this.ring, this.thumb, ...this.dots].forEach(n => n.classList.remove('on')); }

  lookTouches() { return [...this.touches.entries()].filter(([, v]) => v.kind === 'look'); }
  pinchDist() {
    const [a, b] = this.lookTouches().map(([, v]) => v);
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  // Per frame: keyboard camera turning, then the camera-relative move, jump,
  // and whether the move came from touch (which turns on auto-jump).
  read(dt = 0) {
    let x = 0, y = 0, jump = false, touch = false;
    if (this.override) { [x, y] = this.override.move || [0, 0]; jump = !!this.override.jump; touch = !!this.override.touch; }
    else {
      const k = c => this.keys.has(c);
      // Left/Right arrows turn the camera 120°/s (Roblox); A/D strafe.
      const turn = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0);
      if (turn) this.camera.turn(turn * 120 * DEG * dt, 0, false);
      x = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
      y = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      if (this.move.x || this.move.y) { x = this.move.x; y = this.move.y; touch = true; }
      jump = k('Space') || [...this.touches.values()].some(v => v.kind === 'jump');
    }
    const { forward, right } = this.camera.basis();
    return { dx: right.x * x + forward.x * y, dz: right.z * x + forward.z * y, jump, touch };
  }
}
