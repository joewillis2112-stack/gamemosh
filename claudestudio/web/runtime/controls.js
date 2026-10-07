// Player input on keyboard, mouse and touch, turned into one per-frame
// command: a camera-relative move (x right, y forward, length <= 1) and jump.
// Touch layout follows Roblox's: a thumbstick that appears where the left
// thumb lands, a jump button bottom right, drag anywhere else to look.

const css = `
.cs-stick{position:fixed;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;
  background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 2px rgba(255,255,255,.35);pointer-events:none;display:none}
.cs-knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
  background:rgba(255,255,255,.82);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.cs-jump{position:fixed;right:max(28px,env(safe-area-inset-right));bottom:max(36px,env(safe-area-inset-bottom));
  width:88px;height:88px;border-radius:50%;background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 2px rgba(255,255,255,.35);
  display:none;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none}
.cs-jump.down{background:rgba(255,255,255,.35)}
.cs-jump svg{width:44px;height:44px}
`;

export class Controls {
  constructor(canvas, camera, { touch = 'ontouchstart' in window } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.jump = false;
    this.override = null; // tests set { move: [x, y], jump }
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    // Keyboard.
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Mouse: right or left drag turns (Roblox uses right; left is kinder on
    // trackpads), wheel zooms. Pointer events, because Babylon cancels
    // pointerdown and that suppresses the legacy mouse events.
    let drag = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse') drag = null; });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerType !== 'mouse') return;
      camera.turn((e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.006); // drag right looks right
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); camera.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

    // Touch.
    this.stick = document.createElement('div'); this.stick.className = 'cs-stick';
    this.knob = document.createElement('div'); this.knob.className = 'cs-knob'; this.stick.appendChild(this.knob);
    this.jumpBtn = document.createElement('div'); this.jumpBtn.className = 'cs-jump';
    this.jumpBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5 L19 13 H14.5 V19 H9.5 V13 H5 Z" fill="rgba(255,255,255,.9)"/></svg>';
    document.body.append(this.stick, this.jumpBtn);
    if (touch) this.jumpBtn.style.display = 'flex';
    this.touches = new Map(); // id -> { kind: 'stick'|'look'|'jump', x, y, ox, oy }
    const R = 50; // thumbstick travel, px
    const tstart = e => {
      for (const t of e.changedTouches) {
        if (e.currentTarget === this.jumpBtn) { this.touches.set(t.identifier, { kind: 'jump' }); this.jumpBtn.classList.add('down'); continue; }
        const stickTaken = [...this.touches.values()].some(v => v.kind === 'stick');
        const left = t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.35;
        if (left && !stickTaken) {
          this.touches.set(t.identifier, { kind: 'stick', ox: t.clientX, oy: t.clientY });
          Object.assign(this.stick.style, { left: t.clientX + 'px', top: t.clientY + 'px', display: 'block' });
          this.knob.style.transform = '';
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
          let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.knob.style.transform = `translate(${dx}px,${dy}px)`;
          // A small dead zone, then a linear ramp.
          const m = Math.min(1, Math.max(0, (d - 6) / (R * 0.85 - 6))); // full speed a little before the rim
          this.move = d > 0 ? { x: (dx / Math.min(d, R)) * m, y: (-dy / Math.min(d, R)) * m } : { x: 0, y: 0 };
        } else if (s.kind === 'look') {
          if (this.lookTouches().length === 1) camera.turn((t.clientX - s.x) * 0.008, (t.clientY - s.y) * 0.008);
          s.x = t.clientX; s.y = t.clientY;
        }
      }
      if (this.lookTouches().length === 2) { const d = this.pinchDist(); if (this.pinch) camera.zoomBy(this.pinch / d); this.pinch = d; }
      e.preventDefault();
    };
    const tend = e => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        if (s.kind === 'stick') { this.stick.style.display = 'none'; this.move = { x: 0, y: 0 }; }
        if (s.kind === 'jump') this.jumpBtn.classList.remove('down');
        this.touches.delete(t.identifier);
      }
      this.pinch = 0;
      e.preventDefault();
    };
    for (const el of [canvas, this.jumpBtn]) {
      el.addEventListener('touchstart', tstart, { passive: false });
      el.addEventListener('touchmove', tmove, { passive: false });
      el.addEventListener('touchend', tend, { passive: false });
      el.addEventListener('touchcancel', tend, { passive: false });
    }
  }

  lookTouches() { return [...this.touches.entries()].filter(([, v]) => v.kind === 'look'); }
  pinchDist() {
    const [a, b] = this.lookTouches().map(([, v]) => v);
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  // The world-space move direction and jump for this frame.
  read() {
    let x = 0, y = 0, jump = false;
    if (this.override) { [x, y] = this.override.move || [0, 0]; jump = !!this.override.jump; }
    else {
      const k = c => this.keys.has(c);
      x = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      y = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      if (this.move.x || this.move.y) { x = this.move.x; y = this.move.y; }
      jump = k('Space') || [...this.touches.values()].some(v => v.kind === 'jump');
    }
    const { forward, right } = this.camera.basis();
    return { dx: right.x * x + forward.x * y, dz: right.z * x + forward.z * y, jump };
  }
}
