// The in-game menu's graphics settings, as Roblox's own (CoreScripts Settings/Pages/GameSettings.lua):
// "Graphics Mode", a selector of Automatic and Manual, and "Graphics Quality", a slider of 10 steps,
// dimmed and fixed while Automatic (it rests at 5, Roblox's start), live while Manual; a change sets
// UserGameSettings.SavedQualityLevel (runtime/graphics.js follows it). F10 and Shift+F10 step the
// level in Manual, as Roblox's GraphicsQualityChangeRequest does. Opened with Esc or the menu
// button (top left, in the top bar's place); while open, the game's keys and touches stay out.
// Ours: the look (Roblox's SettingsHub art isn't open), a single page, sizes for fingers.
const FAMILY = "'Nunito', Arimo, sans-serif";

export class Menu {
  constructor(root, graphics) {
    this.graphics = graphics;
    this.open = false;
    this.slider = graphics.manager.level || 5; // the slider's own value; Automatic leaves it where it was (5 at first)

    const button = this.button = document.createElement('button');
    button.setAttribute('aria-label', 'Menu');
    button.textContent = '☰';
    Object.assign(button.style, { pointerEvents: 'auto', position: 'absolute', top: '4px', left: '4px', width: '48px', height: '48px', zIndex: '1100', border: 'none', borderRadius: '10px', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '26px', lineHeight: '48px', padding: '0', cursor: 'pointer', fontFamily: FAMILY, WebkitTapHighlightColor: 'transparent' });
    button.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });

    const shade = this.el = document.createElement('div');
    Object.assign(shade.style, { pointerEvents: 'auto', position: 'absolute', inset: '0', zIndex: '1090', display: 'none', background: 'rgba(0,0,0,0.5)', fontFamily: FAMILY, color: '#fff', alignItems: 'center', justifyContent: 'center' });
    const panel = document.createElement('div');
    Object.assign(panel.style, { width: 'min(560px, calc(100% - 24px))', background: 'rgba(25,27,29,0.96)', borderRadius: '12px', padding: '16px 18px', boxSizing: 'border-box' });
    panel.innerHTML = `<div style="font-size:22px;font-weight:700;margin-bottom:12px">Settings</div>`;
    shade.appendChild(panel);

    // Graphics Mode: < Automatic > / < Manual >
    const row = (label) => { const r = document.createElement('div'); Object.assign(r.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', minHeight: '52px', borderTop: '1px solid rgba(255,255,255,0.12)', flexWrap: 'wrap' }); const l = document.createElement('div'); l.textContent = label; l.style.fontSize = '17px'; r.appendChild(l); panel.appendChild(r); return [r, l]; };
    const arrow = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; Object.assign(b.style, { width: '44px', height: '44px', border: 'none', borderRadius: '8px', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: '20px', cursor: 'pointer', padding: '0', WebkitTapHighlightColor: 'transparent' }); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
    const [modeRow] = row('Graphics Mode');
    const mode = document.createElement('div'); Object.assign(mode.style, { display: 'flex', alignItems: 'center', gap: '8px' });
    this.modeText = document.createElement('div'); Object.assign(this.modeText.style, { minWidth: '96px', textAlign: 'center', fontSize: '17px' });
    const flip = () => this.setMode(this.graphics.manager.level ? 'Automatic' : 'Manual');
    mode.append(this.modeLeft = arrow('‹', flip), this.modeText, this.modeRight = arrow('›', flip));
    modeRow.appendChild(mode);

    // Graphics Quality: - [10 bars] +
    const [qRow, qLabel] = row('Graphics Quality');
    this.qLabel = qLabel;
    const q = this.quality = document.createElement('div'); Object.assign(q.style, { display: 'flex', alignItems: 'center', gap: '6px' });
    this.bars = [];
    const bars = document.createElement('div'); Object.assign(bars.style, { display: 'flex', gap: '3px' });
    for (let i = 1; i <= 10; i++) {
      const b = document.createElement('div'); b.dataset.level = i;
      Object.assign(b.style, { width: '16px', height: '30px', borderRadius: '3px', cursor: 'pointer' });
      b.addEventListener('click', e => { e.stopPropagation(); this.setSlider(i); });
      bars.appendChild(b); this.bars.push(b);
    }
    q.append(this.minus = arrow('−', () => this.setSlider(this.slider - 1)), bars, this.plus = arrow('+', () => this.setSlider(this.slider + 1)));
    qRow.appendChild(q);

    const resume = this.resume = document.createElement('button'); resume.textContent = 'Resume';
    Object.assign(resume.style, { marginTop: '14px', width: '100%', height: '48px', border: 'none', borderRadius: '10px', background: '#fff', color: '#111', fontSize: '18px', fontWeight: '700', cursor: 'pointer', fontFamily: FAMILY });
    resume.addEventListener('click', e => { e.stopPropagation(); this.toggle(false); });
    panel.appendChild(resume);

    // Input on the menu stays on the menu; outside the panel, a tap closes it.
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel']) shade.addEventListener(t, ev => ev.stopPropagation(), { passive: true });
    shade.addEventListener('click', e => { if (e.target === shade) this.toggle(false); });
    root.append(shade, button);
    // Esc opens and closes it; F10 / Shift+F10 step the level (Manual). While open, the game's keys stay out.
    // Keys typed into a TextBox's field are the TextBox's (its Escape lets go of it; runtime/gui.js).
    const typing = e => e.target && e.target.classList && e.target.classList.contains('cs-tb');
    addEventListener('keydown', e => {
      if (typing(e)) return;
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); this.toggle(); }
      else if (e.code === 'F10') { e.preventDefault(); if (this.graphics.manager.level) this.setSlider(this.slider + (e.shiftKey ? -1 : 1)); }
      else if (this.open) { e.stopImmediatePropagation(); }
    }, { capture: true });
    addEventListener('keyup', e => { if (this.open && !typing(e)) e.stopImmediatePropagation(); }, { capture: true });
    graphics.onChange = () => this.draw();
    this.draw();
  }

  toggle(open = !this.open) {
    this.open = open;
    this.el.style.display = open ? 'flex' : 'none';
    if (open && this.onOpen) this.onOpen(); // the game drops held keys
    this.draw();
  }
  setMode(m) {
    if (m === 'Automatic') this.graphics.setLevel(0);
    else this.graphics.setLevel(this.slider);
    this.draw();
  }
  setSlider(v) {
    if (!this.graphics.manager.level) return; // fixed while Automatic
    this.slider = Math.max(1, Math.min(10, v));
    this.graphics.setLevel(this.slider);
    this.draw();
  }
  draw() {
    const m = this.graphics.manager, manual = !!m.level;
    if (manual) this.slider = m.level;
    this.modeText.textContent = manual ? 'Manual' : 'Automatic';
    const shown = manual ? m.level : this.slider;
    this.bars.forEach((b, i) => { b.style.background = i < shown ? '#fff' : 'rgba(255,255,255,0.22)'; });
    this.quality.style.opacity = this.qLabel.style.opacity = manual ? '1' : '0.4';
    for (const b of [this.minus, this.plus]) b.disabled = !manual;
  }
}
