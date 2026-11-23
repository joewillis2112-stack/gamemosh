// The UI: ScreenGuis in the local player's PlayerGui, drawn as DOM over the
// 3D canvas (sharp text at any size, any font). Roblox's layout rules
// (create.roblox.com/docs/ui; mashup-research/ROBLOX_GUI_2026-10-09.md):
// - Size and Position are UDim2s resolved against the parent's size; an object
//   sits at Position minus AnchorPoint x its size, rotated about its centre;
// - a ScreenGui fills the screen below Roblox's 58 px top bar, unless
//   IgnoreGuiInset; AbsolutePosition's origin is that bar's bottom-left;
// - children draw above their parent, siblings in ZIndex order (Sibling mode);
// - UIPadding insets the children, UIListLayout stacks them, UICorner rounds,
//   UIStroke outlines (the glyphs, on text), UIAspectRatioConstraint and
//   UITextSizeConstraint constrain.
// Where Roblox leaves a choice open (hover tint amounts), the value is ours.
import { V2, EnumItem, isA } from '../datamodel.js';

import { PlayerList } from './playerlist.js';
import { ENUM_FONTS, fontFromEnum, cssFont } from '../fonts.js';

export const GUI_INSET = 58;
// Every family in assets/fonts (families.json: its files, weights and licences).
import FAMILIES from '../../assets/fonts/families.json' with { type: 'json' };
const FONTS = Object.values(FAMILIES).flatMap(f => f.files.map(x => [f.family, x.file, x.weight, x.style]));
// What draws a font: a text object's FontFace (Roblox's family, weight and style) -> a bundled CSS family
// (web/fonts.js: Roblox's own families where open, labelled stand-ins elsewhere; unknown ones in Arimo).
// FONT_MAP: the same for each Enum.Font (RichText's face=, the fonts the CoreGui uses).
const FONT_MAP = Object.fromEntries(Object.keys(ENUM_FONTS).map(n => [n, cssFont(fontFromEnum(n))]));
const css = (c, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const child = (inst, cls) => inst.children.find(c => c.ClassName === cls);
const en = v => v && v.name || v; // an enum property's item name (stored as a name or an EnumItem)
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// ScrollingFrame input (OURS where Roblox doesn't say): a touch moves SLOP px before it scrolls (and
// stops being a tap); a fling slows by FLING_DECAY per second; an overscroll springs back at SPRING.
const SLOP = 8, FLING_DECAY = 3, SPRING = 12;
// Roblox's scroll bar images are dark grey, tinted by ScrollBarImageColor3; the flat stand-in drawn in
// their place is this grey (OURS) times the colour.
const BAR_GREY = 0.22;

export class Gui {
  constructor(dm, players, base = '../assets/fonts/') {
    this.dm = dm; this.players = players;
    this.root = document.createElement('div');
    Object.assign(this.root.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: '5' });
    document.body.appendChild(this.root);
    const st = document.createElement('style');
    st.textContent = FONTS.map(([f, file, w, style]) => `@font-face{font-family:'${f}';src:url('${base}${file}') format('woff2');font-weight:${w};font-style:${style || 'normal'};font-display:block}`).join('\n') +
      '\n.cs-gui{position:absolute;box-sizing:border-box;pointer-events:none;display:flex;white-space:pre;line-height:1;transform-origin:50% 50%}' +
      '\n.cs-pl-row:hover{background:rgba(255,255,255,0.1)}' + // the player list's row hover (BackgroundOnHover)
      '\n.cs-tb::placeholder{color:var(--ph);opacity:1}'; // a focused TextBox's PlaceholderText
    document.head.appendChild(st);
    this.els = new Map(); // instance -> { el, text, cache }
    // A font finishing loading changes text metrics: re-fit TextScaled and re-lay out.
    document.fonts.addEventListener('loadingdone', () => { this.fitCache = new Map(); this.dirty = true; });
    this.dirty = true;
    dm.watch(() => { this.dirty = true; });
    dm.watch((inst, key) => { if (key === 'Focus') this.syncFocus(); }); // a TextBox gained or lost focus
    this.onFocus = null; // set by the game: drop held keys when a TextBox takes the keyboard
    dm.hooks.layoutNow = () => this.update(); // a script reading AbsoluteContentSize gets this frame's layout
    this.small = false; // a touch device: the player list shows one stat column
    this.playerList = new PlayerList(dm, players, this.root, () => { this.dirty = true; });
    // TextScaled measures in a box built like the ones drawn (flex, a span inside).
    this.measure = document.createElement('div');
    this.measure.className = 'cs-gui';
    Object.assign(this.measure.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', alignItems: 'center', justifyContent: 'center', textAlign: 'center' });
    this.measureSpan = document.createElement('span');
    this.measure.appendChild(this.measureSpan);
    document.body.appendChild(this.measure);
    // ScrollingFrame input, seen by the root before the elements under it (buttons stop their events).
    this.drags = new Map(); // pointer id -> a touch drag that may scroll
    this.scrolled = new Set(); // pointer ids whose drag scrolled: the button it started on doesn't click
    const R = this.root;
    R.addEventListener('pointerdown', ev => this.dragStart(ev), { capture: true });
    R.addEventListener('pointermove', ev => this.dragMove(ev), { capture: true });
    R.addEventListener('pointerup', ev => this.dragEnd(ev), { capture: true });
    R.addEventListener('pointercancel', ev => this.dragEnd(ev), { capture: true });
    R.addEventListener('wheel', ev => this.onWheel(ev), { capture: true, passive: false });
  }
  // The fonts the screen uses now (the CoreGui's, and every Font in the player's GUI), loaded: the
  // other families wait until something shows them (the browser fetches a face on first use, and
  // text re-fits when it arrives), so a page doesn't download all of them.
  fontsReady() {
    const used = new Set(['Arimo', 'Source Sans 3', 'Montserrat', 'Nunito']);
    const pg = this.players.player && child(this.players.player, 'PlayerGui');
    const walk = i => { const f = i.props && i.props.FontFace; if (f) used.add(cssFont(f)[0]); i.children.forEach(walk); };
    if (pg) walk(pg);
    return Promise.all([...used].map(f => document.fonts.load(`16px '${f}'`))).then(() => document.fonts.ready).then(() => { this.fitCache = new Map(); this.dirty = true; });
  }

  // Per frame (after RenderStepped): lay out and draw when anything changed or the screen resized.
  update(dt = 0) {
    this.stepScroll(dt); // released touch drags: flings and elastic spring-back
    const W = innerWidth, H = innerHeight;
    if (!this.dirty && W === this.W && H === this.H) return;
    this.dirty = false; this.W = W; this.H = H;
    const pg = this.players.player && child(this.players.player, 'PlayerGui');
    const seen = new Set();
    if (pg) {
      const guis = pg.children.filter(g => g.ClassName === 'ScreenGui').sort((a, b) => a.props.DisplayOrder - b.props.DisplayOrder);
      guis.forEach((g, i) => {
        const top = g.props.IgnoreGuiInset ? 0 : GUI_INSET;
        const e = this.element(g, this.root, seen);
        // A UIScale in a ScreenGui: its children are laid out on a screen 1/Scale the size, then everything is
        // drawn Scale times bigger from the top left, so they still reach the screen's edges (OURS: our
        // reading; Roblox doesn't document UIScale under a LayerCollector).
        const k = scaleOf(g);
        Object.assign(e.el.style, { left: '0px', top: top + 'px', width: W / k + 'px', height: (H - top) / k + 'px', zIndex: String(i + 1), display: g.props.Enabled ? 'block' : 'none', transformOrigin: '0 0', transform: k !== 1 ? `scale(${k})` : '' });
        this.setAbs(g, 0, top - GUI_INSET, W, H - top);
        if (g.props.Enabled) this.layoutChildren(g, e.el, W / k, (H - top) / k, 0, top - GUI_INSET, seen, k);
      });
    }
    // A focused TextBox that left the screen (destroyed, hidden, its ScreenGui off) lets go of the keyboard.
    const fb = this.dm.focusedTextBox;
    if (fb && (!seen.has(fb) || !this.shown(fb))) this.dm.releaseTextBox(fb, false);
    for (const [inst, e] of this.els) if (!seen.has(inst)) { e.el.remove(); this.els.delete(inst); }
    if (this.dm.focusedTextBox) this.syncFocus(); // focused before it was first drawn (CaptureFocus on a new box)
    this.playerList.update(W, H, this.small, this.dm.coreGui.PlayerList);
  }

  // Visible, as are its GUI ancestors and its ScreenGui.
  shown(inst) { for (let i = inst; i && isA(i.ClassName, 'GuiBase2d'); i = i.parent) if (i.props.Visible === false || i.props.Enabled === false) return false; return true; }

  element(inst, parentEl, seen) {
    seen.add(inst);
    let e = this.els.get(inst);
    if (!e) {
      const el = document.createElement('div');
      el.className = 'cs-gui';
      el._inst = inst;
      e = { el, cache: {} };
      if (isA(inst.ClassName, 'GuiButton')) this.wireButton(inst, e);
      if (inst.ClassName === 'TextBox') this.wireTextBox(inst, e);
      if (inst.ClassName === 'ScrollingFrame') this.makeScroll(inst, e);
      this.els.set(inst, e);
    }
    if (e.el.parentNode !== parentEl) parentEl.appendChild(e.el);
    return e;
  }

  setAbs(inst, x, y, w, h) { this.setV2(inst, 'AbsolutePosition', x, y); this.setV2(inst, 'AbsoluteSize', w, h); }
  // An engine-written Vector2 property; Changed fires only when it really changes.
  setV2(inst, k, x, y) {
    const v = new V2(x, y), o = inst.props[k];
    if (!o || o.x !== v.x || o.y !== v.y) { inst.props[k] = v; this.dm.fire(inst, 'Changed', [k]); }
  }

  // A GuiObject's size after its constraints: UIAspectRatioConstraint, then UISizeConstraint (MinSize to
  // MaxSize pixels, over any size a layout gives; OURS: the order, and a MinSize above MaxSize gives MaxSize).
  constrain(c, cw, ch) {
    const ar = child(c, 'UIAspectRatioConstraint');
    if (ar) { // keep width/height = AspectRatio; FitWithinMaxSize shrinks the larger side to fit
      const r = ar.props.AspectRatio || 1;
      if (en(ar.props.AspectType) === 'FitWithinMaxSize') { if (cw / ch > r) cw = ch * r; else ch = cw / r; }
      else if (en(ar.props.DominantAxis) === 'Width') ch = cw / r; else cw = ch * r;
    }
    const sc = child(c, 'UISizeConstraint');
    if (sc) { const lo = sc.props.MinSize, hi = sc.props.MaxSize; cw = Math.min(Math.max(cw, lo.x), hi.x); ch = Math.min(Math.max(ch, lo.y), hi.y); }
    return [cw, ch];
  }

  // Where a container's GuiObject children go in its w x h content box: their rects (relative to the
  // box), the layout that placed them and its content size, and how far they reach from the box's
  // origin, its padding included (what a ScrollingFrame's AutomaticCanvasSize grows to).
  measureKids(parent, w, h) {
    // UIPadding shrinks the content box.
    const pad = child(parent, 'UIPadding');
    let l = 0, rt = 0, t = 0, b = 0;
    if (pad) {
      const p = pad.props;
      l = p.PaddingLeft.s * w + p.PaddingLeft.o; rt = p.PaddingRight.s * w + p.PaddingRight.o;
      t = p.PaddingTop.s * h + p.PaddingTop.o; b = p.PaddingBottom.s * h + p.PaddingBottom.o;
    }
    const ox = l, oy = t, cw = Math.max(0, w - l - rt), ch = Math.max(0, h - t - b);
    const kids = parent.children.filter(c => isA(c.ClassName, 'GuiObject'));
    const rects = new Map();
    for (const c of kids) {
      const P = c.props, S = P.Size;
      const [sw, sh] = this.constrain(c, cw * S.xs + S.xo, ch * S.ys + S.yo);
      const Pp = P.Position, A = P.AnchorPoint;
      rects.set(c, { x: ox + cw * Pp.xs + Pp.xo - A.x * sw, y: oy + ch * Pp.ys + Pp.yo - A.y * sh, w: sw, h: sh });
    }
    const shown = kids.filter(c => c.props.Visible);
    const layout = parent.children.find(c => c.ClassName === 'UIListLayout' || c.ClassName === 'UIGridLayout');
    const content = !layout ? null : layout.ClassName === 'UIGridLayout' ? this.gridLayout(layout.props, shown, rects, ox, oy, cw, ch) : this.listLayout(layout.props, shown, rects, ox, oy, cw, ch);
    let ex = 0, ey = 0;
    if (content) { ex = l + content.x + rt; ey = t + content.y + b; }
    else for (const c of shown) { const q = rects.get(c); ex = Math.max(ex, q.x + q.w + rt); ey = Math.max(ey, q.y + q.h + b); }
    return { kids, rects, layout, content, extent: { x: ex, y: ey } };
  }

  // Children of a container whose content box is w x h, with its origin at absolute (ax, ay); k: screen
  // pixels per unit of the box (the UIScales above it multiplied).
  layoutChildren(parent, parentEl, w, h, ax, ay, seen, k = 1) { this.placeKids(this.measureKids(parent, w, h), parentEl, ax, ay, seen, k); }
  placeKids(m, parentEl, ax, ay, seen, k = 1) {
    if (m.layout) this.setV2(m.layout, 'AbsoluteContentSize', m.content.x * k, m.content.y * k);
    if (m.content && m.content.cells) { this.setV2(m.layout, 'AbsoluteCellCount', ...m.content.cells); this.setV2(m.layout, 'AbsoluteCellSize', m.content.cell[0] * k, m.content.cell[1] * k); }
    for (const c of m.kids) {
      const r = m.rects.get(c), e = this.element(c, parentEl, seen);
      // A UIScale scales the object, and all inside it, about its AnchorPoint (OURS: the point; the docs
      // say only that it multiplies AbsoluteSize). Inside, layout stays in the object's own units.
      const s = e.uiScale = scaleOf(c), A = c.props.AnchorPoint;
      const x = r.x + A.x * r.w * (1 - s), y = r.y + A.y * r.h * (1 - s);
      this.draw(c, e, r);
      this.setAbs(c, ax + x * k, ay + y * k, r.w * s * k, r.h * s * k);
      if (!c.props.Visible) continue;
      if (c.ClassName === 'ScrollingFrame') this.scrollLayout(c, e, r, ax + x * k, ay + y * k, seen, k * s);
      else this.layoutChildren(c, e.el, r.w, r.h, ax + x * k, ay + y * k, seen, k * s);
    }
  }

  // UIListLayout: siblings in a row or column, Padding apart, aligned in the content box.
  // Returns its AbsoluteContentSize: the row's or column's length, padding included, by its thickest item.
  listLayout(L, items, rects, ox, oy, w, h) {
    const byName = (a, b) => a.props.Name < b.props.Name ? -1 : a.props.Name > b.props.Name ? 1 : 0;
    items.sort(en(L.SortOrder) === 'LayoutOrder' ? (a, b) => a.props.LayoutOrder - b.props.LayoutOrder : byName); // stable: ties keep insertion order
    const vertical = en(L.FillDirection) === 'Vertical', gap = L.Padding.s * (vertical ? h : w) + L.Padding.o;
    const total = items.reduce((s, c) => s + (vertical ? rects.get(c).h : rects.get(c).w), 0) + gap * Math.max(0, items.length - 1);
    const across = items.reduce((s, c) => Math.max(s, vertical ? rects.get(c).w : rects.get(c).h), 0);
    const HA = { Left: 0, Center: 0.5, Right: 1 }[en(L.HorizontalAlignment)], VA = { Top: 0, Center: 0.5, Bottom: 1 }[en(L.VerticalAlignment)];
    let at = (vertical ? h - total : w - total) * (vertical ? VA : HA);
    for (const c of items) {
      const r = rects.get(c);
      if (vertical) { r.y = oy + at; r.x = ox + (w - r.w) * HA; at += r.h + gap; }
      else { r.x = ox + at; r.y = oy + (h - r.h) * VA; at += r.w + gap; }
    }
    return vertical ? { x: across, y: total } : { x: total, y: across };
  }

  // UIGridLayout: cells of CellSize (against the content box), CellPadding apart, in lines along
  // FillDirection: as many per line as fit (at least one), at most FillDirectionMaxCells when that is
  // above 0. Lines start at StartCorner's side; the block of used cells is aligned in the box. Each
  // child takes the cell's size, through its own constraints. Returns its AbsoluteContentSize (the
  // block, padding between cells included), with AbsoluteCellCount (columns, rows) and AbsoluteCellSize.
  // OURS where Roblox doesn't say: a part-filled last line starts at the start corner's side, and the
  // block is aligned by the cells in use (two items in a four-wide row centre as a pair).
  gridLayout(G, items, rects, ox, oy, w, h) {
    const byName = (a, b) => a.props.Name < b.props.Name ? -1 : a.props.Name > b.props.Name ? 1 : 0;
    items.sort(en(G.SortOrder) === 'LayoutOrder' ? (a, b) => a.props.LayoutOrder - b.props.LayoutOrder : byName);
    const C = G.CellSize, Pd = G.CellPadding;
    const cw = C.xs * w + C.xo, ch = C.ys * h + C.yo, px = Pd.xs * w + Pd.xo, py = Pd.ys * h + Pd.yo;
    const horizontal = en(G.FillDirection) === 'Horizontal';
    const room = horizontal ? w : h, step = horizontal ? cw + px : ch + py, pad = horizontal ? px : py;
    let per = step > 0 ? Math.max(1, Math.floor((room + pad) / step + 1e-6)) : Math.max(1, items.length);
    if (G.FillDirectionMaxCells > 0) per = Math.min(per, Math.floor(G.FillDirectionMaxCells));
    const n = items.length, lines = Math.ceil(n / per), used = Math.min(per, n);
    const cols = horizontal ? used : lines, rows = horizontal ? lines : used;
    const bw = cols ? cols * cw + (cols - 1) * px : 0, bh = rows ? rows * ch + (rows - 1) * py : 0;
    const x0 = ox + (w - bw) * { Left: 0, Center: 0.5, Right: 1 }[en(G.HorizontalAlignment)], y0 = oy + (h - bh) * { Top: 0, Center: 0.5, Bottom: 1 }[en(G.VerticalAlignment)];
    const corner = en(G.StartCorner), fromRight = corner === 'TopRight' || corner === 'BottomRight', fromBottom = corner === 'BottomLeft' || corner === 'BottomRight';
    items.forEach((c, i) => {
      const line = Math.floor(i / per), k = i % per;
      let col = horizontal ? k : line, row = horizontal ? line : k;
      if (fromRight) col = cols - 1 - col;
      if (fromBottom) row = rows - 1 - row;
      const [sw, sh] = this.constrain(c, cw, ch);
      Object.assign(rects.get(c), { x: x0 + col * (cw + px), y: y0 + row * (ch + py), w: sw, h: sh });
    });
    return { x: bw, y: bh, cells: [cols, rows], cell: [cw, ch] };
  }

  // ---- ScrollingFrame
  // The frame is the window; its children sit on a canvas div moved by -CanvasPosition. The canvas is
  // CanvasSize against the frame's size less any inset gutter (VerticalScrollBarInset takes width,
  // HorizontalScrollBarInset height: ScrollBar while that bar shows, Always always), grown to the
  // children's reach on AutomaticCanvasSize's axes, and never smaller than the window (so the default
  // CanvasSize's X of 0 still gives children of scale width 1 the window's width, and no sideways
  // scrolling; OURS: AbsoluteCanvasSize reports this floored size). The window (AbsoluteWindowSize) is the frame less
  // the gutters of the bars on show; a bar shows when scrolling is on, its axis is allowed and the
  // canvas is longer than the window. Bars and insets depend on each other, so this settles in a few
  // passes. CanvasPosition is kept within 0..canvas-window (OURS: clamped when laid out).
  scrollLayout(sf, e, r, absX, absY, seen, k = 1) {
    const P = sf.props, W = r.w, H = r.h;
    const T = P.ScrollingEnabled ? Math.max(0, Math.round(P.ScrollBarThickness)) : 0; // no bars, so no gutters, when scrolling is off
    const dir = en(P.ScrollingDirection), canX = dir !== 'Y', canY = dir !== 'X';
    const auto = en(P.AutomaticCanvasSize), autoX = auto === 'X' || auto === 'XY', autoY = auto === 'Y' || auto === 'XY';
    const vIn = en(P.VerticalScrollBarInset), hIn = en(P.HorizontalScrollBarInset);
    let vbar = false, hbar = false, m, cw = 0, ch = 0, winW = W, winH = H, insetX = 0;
    for (let pass = 0; pass < 4; pass++) {
      winW = Math.max(0, W - (vbar ? T : 0)); winH = Math.max(0, H - (hbar ? T : 0));
      insetX = vIn === 'Always' || (vIn === 'ScrollBar' && vbar) ? T : 0;
      const insetY = hIn === 'Always' || (hIn === 'ScrollBar' && hbar) ? T : 0;
      const bw = Math.max(0, W - insetX), bh = Math.max(0, H - insetY), CS = P.CanvasSize;
      cw = Math.max(winW, bw * CS.xs + CS.xo); ch = Math.max(winH, bh * CS.ys + CS.yo); // never smaller than the window
      m = this.measureKids(sf, cw, ch);
      if (autoX || autoY) {
        const cw2 = autoX ? Math.max(cw, m.extent.x) : cw, ch2 = autoY ? Math.max(ch, m.extent.y) : ch;
        if (cw2 !== cw || ch2 !== ch) { cw = cw2; ch = ch2; m = this.measureKids(sf, cw, ch); } // scale-sized children follow the grown canvas
      }
      const v2 = T > 0 && canY && ch > winH + 1e-3, h2 = T > 0 && canX && cw > winW + 1e-3;
      if (v2 === vbar && h2 === hbar) break;
      vbar = v2; hbar = h2;
    }
    winW = Math.max(0, W - (vbar ? T : 0)); winH = Math.max(0, H - (hbar ? T : 0));
    const rangeX = Math.max(0, cw - winW), rangeY = Math.max(0, ch - winH);
    const cp = P.CanvasPosition, cx = clamp(cp.x, 0, rangeX), cy = clamp(cp.y, 0, rangeY);
    if (cx !== cp.x || cy !== cp.y) this.setV2(sf, 'CanvasPosition', cx, cy);
    this.setV2(sf, 'AbsoluteCanvasSize', cw * k, ch * k);
    this.setV2(sf, 'AbsoluteWindowSize', winW * k, winH * k);
    const left = en(P.VerticalScrollBarPosition) === 'Left', originX = left ? insetX : 0;
    e.scroll = { canX, canY, rangeX, rangeY, winW, winH, cw, ch, k }; // k: screen px per canvas px (UIScale)
    const over = e.over || { x: 0, y: 0 }; // elastic overscroll while a touch pulls past an end (drawn, not in CanvasPosition)
    Object.assign(e.canvas.style, { left: Math.round(originX - cx - over.x) + 'px', top: Math.round(-cy - over.y) + 'px', width: cw + 'px', height: ch + 'px' });
    this.placeKids(m, e.canvas, absX + (originX - cx) * k, absY - cy * k, seen, k);
    // The bars: only the thumb is drawn (Roblox's bars are their three images), over the canvas.
    const bar = (b, on, x, y, w, h, track, win, canvas, pos, range) => {
      b.el.style.display = on ? 'block' : 'none';
      b.range = range; b.free = 0;
      if (!on) return;
      Object.assign(b.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      const len = Math.min(track, Math.max(T, track * win / canvas)), at = range > 0 ? (track - len) * pos / range : 0;
      Object.assign(b.thumb.style, b.axis === 'y' ? { left: '0px', top: at + 'px', width: w + 'px', height: len + 'px' } : { left: at + 'px', top: '0px', width: len + 'px', height: h + 'px' });
      const img = P.MidImage && !/^rbxasset/.test(P.MidImage) ? P.MidImage : '';
      const col = P.ScrollBarImageColor3, k = img ? 1 : BAR_GREY;
      Object.assign(b.thumb.style, { backgroundColor: img ? 'transparent' : css({ r: col.r * k, g: col.g * k, b: col.b * k }), backgroundImage: img ? `url("${img}")` : '', backgroundSize: '100% 100%', borderRadius: img ? '0' : T / 2 + 'px', opacity: String(1 - P.ScrollBarImageTransparency) });
      b.free = track - len;
    };
    bar(e.vbar, vbar, left ? 0 : W - T, 0, T, winH, winH, winH, ch, cy, rangeY);
    bar(e.hbar, hbar, left && vbar ? T : 0, H - T, winW, T, winW, winW, cw, cx, rangeX);
  }

  makeScroll(inst, e) {
    e.canvas = document.createElement('div');
    Object.assign(e.canvas.style, { position: 'absolute', pointerEvents: 'none' });
    e.el.appendChild(e.canvas);
    const mk = axis => {
      const el = document.createElement('div'), thumb = document.createElement('div');
      Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', zIndex: '2147483647', display: 'none' });
      thumb.className = 'cs-thumb';
      Object.assign(thumb.style, { position: 'absolute', pointerEvents: 'auto', touchAction: 'none' });
      el.appendChild(thumb); e.el.appendChild(el);
      const b = { el, thumb, axis, range: 0, free: 0 };
      // Dragging the thumb (mouse or touch) moves the canvas by the same share of its range.
      thumb.addEventListener('pointerdown', ev => {
        if (!inst.props.ScrollingEnabled) return;
        ev.preventDefault(); ev.stopPropagation(); thumb.setPointerCapture(ev.pointerId);
        b.drag = { id: ev.pointerId, at: axis === 'y' ? ev.clientY : ev.clientX, start: inst.props.CanvasPosition };
      });
      thumb.addEventListener('pointermove', ev => {
        const d = b.drag; if (!d || d.id !== ev.pointerId) return;
        const moved = ((axis === 'y' ? ev.clientY : ev.clientX) - d.at) / (e.scroll ? e.scroll.k : 1), k = b.free > 0 ? b.range / b.free : 0;
        const p = inst.props.CanvasPosition, v = clamp((axis === 'y' ? d.start.y : d.start.x) + moved * k, 0, b.range);
        this.dm.set(inst, 'CanvasPosition', axis === 'y' ? new V2(p.x, v) : new V2(v, p.y));
      });
      const end = ev => { if (b.drag && b.drag.id === ev.pointerId) b.drag = null; };
      thumb.addEventListener('pointerup', end); thumb.addEventListener('pointercancel', end);
      return b;
    };
    e.vbar = mk('y'); e.hbar = mk('x');
  }

  // The ScrollingFrames under a DOM node, innermost first.
  framesAt(node) {
    const out = [];
    for (let n = node; n && n !== this.root; n = n.parentNode) if (n._inst && n._inst.ClassName === 'ScrollingFrame') out.push(n._inst);
    return out;
  }
  // Moves a frame's canvas by (dx, dy) within its range, on the axes it scrolls. True if it moved.
  scrollBy(f, dx, dy) {
    const s = this.els.get(f)?.scroll, p = f.props.CanvasPosition;
    if (!s) return false;
    const nx = s.canX ? clamp(p.x + dx, 0, s.rangeX) : p.x, ny = s.canY ? clamp(p.y + dy, 0, s.rangeY) : p.y;
    if (Math.fround(nx) === p.x && Math.fround(ny) === p.y) return false;
    this.dm.set(f, 'CanvasPosition', new V2(nx, ny));
    return true;
  }
  // The mouse wheel scrolls the innermost frame under the pointer that can still move that way, and
  // stops there (an outer frame gets it once the inner one is at its end). OURS: a wheel step moves the
  // browser's delta in pixels; Shift, or a frame that only scrolls sideways, turns it sideways.
  onWheel(ev) {
    const frames = this.framesAt(ev.target);
    if (!frames.length) return;
    ev.preventDefault();
    const k = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? 400 : 1;
    let dx = ev.deltaX * k, dy = ev.deltaY * k;
    if (ev.shiftKey && !dx) { dx = dy; dy = 0; }
    for (const f of frames) {
      const s = this.els.get(f)?.scroll;
      if (!s || !f.props.ScrollingEnabled) continue;
      const sideways = !dx && !(s.canY && s.rangeY > 0);
      if (this.scrollBy(f, (sideways ? dy : dx) / s.k, (sideways ? 0 : dy) / s.k)) { ev.stopPropagation(); return; }
    }
  }
  // Touch drags (pointer events, seen by the root before any button): once a finger has moved SLOP px,
  // the innermost frame that scrolls along the drag takes it (else the innermost that scrolls at all),
  // and a button it started on won't click. Past an end the canvas stretches (ElasticBehavior) and
  // springs back on release; a release while moving flings on (OURS: the rubber band's give, the
  // fling's decay and the spring are ours).
  dragStart(ev) {
    if (ev.pointerType === 'mouse' || (ev.target.closest && ev.target.closest('.cs-thumb'))) return;
    this.scrolled.delete(ev.pointerId);
    const frames = this.framesAt(ev.target);
    if (!frames.length) return;
    for (const f of frames) { const e = this.els.get(f); if (e) e.fling = null; } // a touch catches a fling
    this.drags.set(ev.pointerId, { x0: ev.clientX, y0: ev.clientY, frames, frame: null, samples: [] });
  }
  dragMove(ev) {
    const d = this.drags.get(ev.pointerId);
    if (!d) return;
    if (!d.frame) {
      const dx = ev.clientX - d.x0, dy = ev.clientY - d.y0;
      if (Math.hypot(dx, dy) < SLOP) return;
      const can = (f, axis) => { const s = this.els.get(f)?.scroll; return !!s && f.props.ScrollingEnabled && (axis === 'x' ? s.canX && s.rangeX > 0 : s.canY && s.rangeY > 0); };
      const along = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      d.frame = d.frames.find(f => can(f, along)) || d.frames.find(f => can(f, 'x') || can(f, 'y')) || null;
      if (!d.frame) { this.drags.delete(ev.pointerId); return; }
      this.scrolled.add(ev.pointerId);
      d.x0 = ev.clientX; d.y0 = ev.clientY; d.start = d.frame.props.CanvasPosition; // from here: no jump by the slop
    }
    ev.preventDefault();
    const f = d.frame, e = this.els.get(f), s = e && e.scroll;
    if (!s) return;
    const want = { x: s.canX ? d.start.x - (ev.clientX - d.x0) / s.k : d.start.x, y: s.canY ? d.start.y - (ev.clientY - d.y0) / s.k : d.start.y };
    const at = { x: clamp(want.x, 0, s.rangeX), y: clamp(want.y, 0, s.rangeY) };
    const eb = en(f.props.ElasticBehavior), give = axis => eb === 'Always' || (eb === 'WhenScrollable' && (axis === 'x' ? s.rangeX : s.rangeY) > 0) ? 0.5 : 0;
    e.over = { x: (want.x - at.x) * give('x'), y: (want.y - at.y) * give('y') };
    d.samples.push([ev.clientX, ev.clientY, ev.timeStamp]);
    while (d.samples.length > 2 && ev.timeStamp - d.samples[0][2] > 100) d.samples.shift();
    if (!this.scrollBy(f, at.x - f.props.CanvasPosition.x, at.y - f.props.CanvasPosition.y)) this.dirty = true; // the stretch alone still redraws
  }
  dragEnd(ev) {
    const d = this.drags.get(ev.pointerId);
    if (!d) return;
    this.drags.delete(ev.pointerId);
    const e = d.frame && this.els.get(d.frame);
    if (!e) return;
    const a = d.samples[0], b = d.samples[d.samples.length - 1], dt = a && b ? (b[2] - a[2]) / 1000 : 0;
    if (dt > 0.01 && ev.timeStamp - b[2] < 60) e.fling = { vx: -(b[0] - a[0]) / dt, vy: -(b[1] - a[1]) / dt };
  }
  stepScroll(dt) {
    if (!(dt > 0)) return;
    for (const [inst, e] of this.els) {
      if (!e.fling && !(e.over && (e.over.x || e.over.y))) continue;
      if ([...this.drags.values()].some(d => d.frame === inst)) continue; // still held
      if (e.fling) {
        const fl = e.fling, k = Math.exp(-FLING_DECAY * dt);
        const moved = this.scrollBy(inst, fl.vx * dt, fl.vy * dt);
        fl.vx *= k; fl.vy *= k;
        if (!moved || Math.hypot(fl.vx, fl.vy) < 20) e.fling = null; // stops at an end, or when slow
      }
      if (e.over && (e.over.x || e.over.y)) {
        const k = Math.exp(-SPRING * dt), x = e.over.x * k, y = e.over.y * k;
        e.over = { x: Math.abs(x) < 0.5 ? 0 : x, y: Math.abs(y) < 0.5 ? 0 : y };
        this.dirty = true;
      }
    }
  }

  draw(inst, e, r) {
    const P = inst.props, s = e.el.style, set = (k, v) => { if (e.cache[k] !== v) { e.cache[k] = v; s[k] = v; } };
    set('display', P.Visible ? 'flex' : 'none');
    set('left', r.x + 'px'); set('top', r.y + 'px'); set('width', Math.max(0, r.w) + 'px'); set('height', Math.max(0, r.h) + 'px');
    set('zIndex', String(P.ZIndex));
    // Rotation turns the object about its (scaled) centre; a UIScale scales it about its AnchorPoint.
    const sc = e.uiScale ?? 1;
    if (sc === 1) { set('transformOrigin', '50% 50%'); set('transform', P.Rotation ? `rotate(${P.Rotation}deg)` : ''); }
    else {
      const ax = P.AnchorPoint.x * r.w, ay = P.AnchorPoint.y * r.h, cx = ax + (r.w / 2 - ax) * sc, cy = ay + (r.h / 2 - ay) * sc;
      set('transformOrigin', '0 0');
      set('transform', (P.Rotation ? `translate(${cx}px, ${cy}px) rotate(${P.Rotation}deg) translate(${-cx}px, ${-cy}px) ` : '') + `translate(${ax}px, ${ay}px) scale(${sc}) translate(${-ax}px, ${-ay}px)`);
    }
    set('overflow', P.ClipsDescendants ? 'hidden' : 'visible');
    const bgA = 1 - P.BackgroundTransparency;
    const hover = e.hover && P.AutoButtonColor ? (e.down ? 0.7 : 0.85) : 1; // ours: Roblox's tint amounts are undocumented
    const bg = P.BackgroundColor3, bgc = { r: bg.r * hover, g: bg.g * hover, b: bg.b * hover };
    // A UIGradient blends into the background, the text and the image (not the children): the background
    // becomes the gradient itself.
    const grad = gradientOf(inst);
    e.grad = grad;
    set('backgroundColor', bgA > 0 && !grad ? css(bgc, bgA) : 'transparent');
    let bgImage = grad && bgA > 0 ? gradientCss(grad, r.w, r.h, bgc, bgA) : '';
    // Border (outside the box, faded with the background), UICorner, UIStroke.
    const corner = child(inst, 'UICorner'), stroke = child(inst, 'UIStroke');
    const rad = corner ? Math.min(corner.props.CornerRadius.s * Math.min(r.w, r.h) + corner.props.CornerRadius.o, Math.min(r.w, r.h) / 2) : 0;
    set('borderRadius', rad + 'px');
    const isText = 'Text' in P;
    const shadows = [];
    if (P.BorderSizePixel > 0 && bgA > 0 && !corner) shadows.push(`0 0 0 ${P.BorderSizePixel}px ${css(P.BorderColor3, bgA)}`);
    const sp = stroke && stroke.props.Enabled ? stroke.props : null;
    if (sp && (sp.ApplyStrokeMode === 'Border' || !isText)) shadows.push(`0 0 0 ${sp.Thickness}px ${css(sp.Color, 1 - sp.Transparency)}`);
    set('boxShadow', shadows.join(','));
    if ('Image' in P) bgImage = this.drawImage(P, e, set, r, bgImage);
    set('backgroundImage', bgImage);
    if (isText) this.drawText(inst, P, e, r, set, sp && sp.ApplyStrokeMode === 'Contextual' ? sp : null);
    if (isA(inst.ClassName, 'GuiButton')) set('pointerEvents', P.Active && P.Visible ? 'auto' : 'none');
    if (inst.ClassName === 'TextBox') set('pointerEvents', P.Visible ? 'auto' : 'none');
    // A ScrollingFrame takes the wheel and touch drags over it (so they don't reach the 3D view).
    if (inst.ClassName === 'ScrollingFrame') { set('pointerEvents', P.Visible && (P.ScrollingEnabled || P.Active) ? 'auto' : 'none'); set('touchAction', 'none'); }
  }

  // Returns the element's background image: the image, or (under a UIGradient) the background's
  // gradient, with the image in a layer of its own that the gradient tints and fades.
  drawImage(P, e, set, r, bgImage) {
    // Images by URL (a path in the game, https or data:). Roblox asset ids can't be fetched here.
    const url = P.Image && !/^rbxasset/.test(P.Image) ? P.Image : '';
    const size = { Stretch: '100% 100%', Fit: 'contain', Crop: 'cover', Tile: 'auto', Slice: '100% 100%' }[P.ScaleType] || '100% 100%', repeat = P.ScaleType === 'Tile' ? 'repeat' : 'no-repeat';
    if (!e.grad) {
      if (e.img) { e.img.remove(); e.img = null; }
      set('backgroundSize', size); set('backgroundRepeat', repeat); set('backgroundPosition', 'center');
      set('opacity', String(1 - P.ImageTransparency));
      return url ? `url("${url}")` : '';
    }
    set('backgroundSize', '100% 100%'); set('backgroundRepeat', 'no-repeat'); set('opacity', '1');
    if (!e.img) { e.img = document.createElement('div'); Object.assign(e.img.style, { position: 'absolute', inset: '0', pointerEvents: 'none', borderRadius: 'inherit' }); e.el.insertBefore(e.img, e.el.firstChild); }
    const tint = gradientCss(e.grad, r.w, r.h, { r: 1, g: 1, b: 1 }, 1, true), alpha = gradientCss(e.grad, r.w, r.h, { r: 0, g: 0, b: 0 }, 1);
    const img = url ? `url("${url}")` : 'none';
    Object.assign(e.img.style, {
      // The gradient's colours multiply the image; its transparency and the image's own alpha mask it.
      backgroundImage: url ? `${tint}, ${img}` : 'none', backgroundSize: `100% 100%, ${size}`, backgroundRepeat: `no-repeat, ${repeat}`, backgroundPosition: 'center', backgroundBlendMode: 'multiply, normal',
      maskImage: url ? `${img}, ${alpha}` : 'none', maskSize: `${size}, 100% 100%`, maskRepeat: `${repeat}, no-repeat`, maskPosition: 'center', maskComposite: 'intersect',
      opacity: String(1 - P.ImageTransparency),
    });
    return bgImage;
  }

  drawText(inst, P, e, r, set, stroke) {
    const [family, weight, style] = P.FontFace ? cssFont(P.FontFace) : FONT_MAP[P.Font] || FONT_MAP.Legacy;
    // Line height goes inside the font shorthand (which would otherwise reset it).
    const font = `${style || 'normal'} ${weight} SIZEpx/${P.LineHeight} '${family}', Arimo, sans-serif`;
    // A TextBox with no text shows its PlaceholderText, in PlaceholderColor3.
    const box = inst.ClassName === 'TextBox', placeholder = box && P.Text === '';
    const text = placeholder ? P.PlaceholderText : P.Text;
    // UIPadding insets the object's own text too (as it insets its children).
    const pd = child(inst, 'UIPadding'), Q = pd && pd.props;
    const pad = Q ? [Q.PaddingTop.s * r.h + Q.PaddingTop.o, Q.PaddingRight.s * r.w + Q.PaddingRight.o, Q.PaddingBottom.s * r.h + Q.PaddingBottom.o, Q.PaddingLeft.s * r.w + Q.PaddingLeft.o] : [0, 0, 0, 0];
    set('padding', pad.map(v => v + 'px').join(' '));
    e.pad = pad;
    let size = P.TextSize;
    const lim = child(inst, 'UITextSizeConstraint');
    const min = lim ? lim.props.MinTextSize : 1, max = lim ? lim.props.MaxTextSize : 100;
    const wrap = P.TextWrapped || P.TextScaled;
    if (P.TextScaled) size = this.fitText(text, font, Math.max(0, r.w - pad[1] - pad[3]), Math.max(0, r.h - pad[0] - pad[2]), min, max);
    else if (lim) size = Math.min(max, Math.max(min, size));
    set('font', font.replace('SIZE', size));
    set('color', css(placeholder ? P.PlaceholderColor3 : P.TextColor3, 1 - P.TextTransparency));
    set('whiteSpace', wrap ? 'pre-wrap' : 'pre');
    set('overflowWrap', wrap ? 'anywhere' : 'normal');
    set('justifyContent', { Left: 'flex-start', Center: 'center', Right: 'flex-end' }[P.TextXAlignment]);
    set('textAlign', { Left: 'left', Center: 'center', Right: 'right' }[P.TextXAlignment]);
    set('alignItems', { Top: 'flex-start', Center: 'center', Bottom: 'flex-end' }[P.TextYAlignment]);
    // Contextual UIStroke outlines the glyphs (drawn under the fill); the older TextStroke is a thin outline.
    if (stroke) { set('webkitTextStroke', `${stroke.Thickness * 2}px ${css(stroke.Color, 1 - stroke.Transparency)}`); set('paintOrder', 'stroke fill'); }
    else set('webkitTextStroke', '');
    const ts = 1 - P.TextStrokeTransparency;
    set('textShadow', ts > 0 && !stroke ? [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => `${x}px ${y}px 0 ${css(P.TextStrokeColor3, ts)}`).join(',') : '');
    // The text is one span, the element's first child (its GUI children and a TextBox's field follow it).
    if (!e.span) { e.span = document.createElement('span'); e.el.insertBefore(e.span, e.el.firstChild); }
    const rich = P.RichText && !placeholder;
    if (e.cache.text !== text || e.cache.rich !== rich) {
      e.cache.text = text; e.cache.rich = rich;
      if (rich) e.span.innerHTML = richText(text); else e.span.textContent = text;
    }
    // Under a UIGradient the text is filled with the gradient laid over the whole box (the span shows its
    // own part of it, clipped to the glyphs).
    const g = e.grad && !box ? e.grad : null, ss = e.span.style;
    if (g) {
      const gc = gradientCss(g, r.w, r.h, placeholder ? P.PlaceholderColor3 : P.TextColor3, 1 - P.TextTransparency);
      Object.assign(ss, { backgroundImage: gc, backgroundSize: `${r.w}px ${r.h}px`, backgroundRepeat: 'no-repeat', backgroundPosition: `${-e.span.offsetLeft}px ${-e.span.offsetTop}px`, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' });
    } else if (e.spanGrad) Object.assign(ss, { backgroundImage: '', backgroundSize: '', backgroundRepeat: '', backgroundPosition: '', webkitBackgroundClip: '', backgroundClip: '', color: '' });
    e.spanGrad = !!g;
    e.font = font.replace('SIZE', size);
    if (box) this.drawField(inst, P, e, e.font);
  }

  // ---- TextBox
  // While focused, a real text field (input, or textarea when MultiLine) lies over the box in its font,
  // colour and alignment, and the box's own text hides; the field has the keyboard (on a phone, focusing
  // it inside the tap brings the on-screen keyboard up). Its keys stop at the field, so the game's
  // movement keys don't move the character while the player types (Roblox sinks them). Every edit sets
  // Text. Enter submits a single-line box; Escape lets go (OURS), and doesn't open the game menu.
  drawField(tb, P, e, font) {
    const focused = this.dm.focusedTextBox === tb;
    e.span.style.visibility = focused ? 'hidden' : '';
    if (!focused) { if (e.field) e.field.el.style.display = 'none'; return; }
    const f = this.field(tb, e), el = f.el;
    if (el.value !== P.Text) el.value = P.Text; // a script changed Text while the player types
    el.readOnly = !P.TextEditable;
    el.placeholder = P.PlaceholderText;
    const pd = e.pad || [0, 0, 0, 0], ya = en(P.TextYAlignment), lineH = parseFloat(font.split(' ')[2]) * P.LineHeight;
    Object.assign(el.style, {
      display: 'block', font, color: css(P.TextColor3, 1 - P.TextTransparency), textAlign: { Left: 'left', Center: 'center', Right: 'right' }[en(P.TextXAlignment)],
      whiteSpace: P.TextWrapped || !f.multi ? 'pre-wrap' : 'pre',
      // One line sits where TextYAlignment puts it; a MultiLine field starts at the top (OURS).
      // Inside the box's UIPadding, like its text.
      left: pd[3] + 'px', width: `calc(100% - ${pd[1] + pd[3]}px)`,
      top: f.multi || ya === 'Top' ? pd[0] + 'px' : ya === 'Bottom' ? `calc(100% - ${lineH + pd[2]}px)` : `calc(${(pd[0] - pd[2]) / 2}px + 50% - ${lineH / 2}px)`,
      height: f.multi ? `calc(100% - ${pd[0] + pd[2]}px)` : lineH + 'px',
    });
    el.style.setProperty('--ph', css(P.PlaceholderColor3, 1 - P.TextTransparency));
  }
  field(tb, e) {
    const multi = !!tb.props.MultiLine;
    if (e.field && e.field.multi === multi) return e.field;
    if (e.field) e.field.el.remove();
    const el = document.createElement(multi ? 'textarea' : 'input');
    if (!multi) { el.type = 'text'; el.enterKeyHint = 'done'; }
    el.className = 'cs-tb';
    el.autocomplete = 'off'; el.spellcheck = false;
    Object.assign(el.style, { position: 'absolute', boxSizing: 'border-box', margin: '0', padding: '0', border: '0', outline: 'none', background: 'transparent', resize: 'none', pointerEvents: 'auto', overflow: 'hidden', lineHeight: 'inherit' });
    el.addEventListener('input', () => { if (this.dm.focusedTextBox === tb) this.dm.set(tb, 'Text', el.value); });
    el.addEventListener('keydown', ev => {
      ev.stopPropagation(); // the game's keys stay out while typing
      if (ev.key === 'Enter' && !multi && !ev.isComposing) { ev.preventDefault(); this.dm.releaseTextBox(tb, true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); this.dm.releaseTextBox(tb, false); }
    });
    el.addEventListener('keyup', ev => ev.stopPropagation());
    el.addEventListener('blur', () => this.dm.releaseTextBox(tb, false)); // nothing if it already let go
    e.el.appendChild(el);
    return e.field = { el, multi };
  }
  wireTextBox(tb, e) {
    e.el.addEventListener('pointerdown', ev => ev.stopPropagation());
    // A click or tap (not a drag that scrolled a frame) focuses it, inside the event, as phones need.
    e.el.addEventListener('click', ev => { ev.stopPropagation(); if (!this.scrolled.has(ev.pointerId) && tb.props.Visible) this.focusBox(tb); });
  }
  focusBox(tb) {
    this.dm.focusTextBox(tb); // Focused; ClearTextOnFocus
    this.syncFocus();
  }
  // The DOM follows the DataModel's focus: the focused box's field has the keyboard, the others hide.
  syncFocus() {
    const tb = this.dm.focusedTextBox, e = tb && this.els.get(tb);
    if (!e) { if (document.activeElement && document.activeElement.classList.contains('cs-tb')) document.activeElement.blur(); return; }
    this.drawField(tb, tb.props, e, e.font);
    if (document.activeElement !== e.field.el) {
      if (document.activeElement && document.activeElement.classList.contains('cs-tb')) document.activeElement.blur();
      e.field.el.focus({ preventScroll: true });
      const n = e.field.el.value.length; e.field.el.setSelectionRange(n, n); // the caret at the end
      if (this.onFocus) this.onFocus(); // the game drops held keys
    }
  }
  // TextScaled: the largest size (min..max) at which the wrapped text fits the box.
  fitText(text, font, w, h, min, max) {
    const key = `${text}|${font}|${w}|${h}|${min}|${max}`;
    this.fitCache = this.fitCache || new Map();
    if (this.fitCache.has(key)) return this.fitCache.get(key);
    const m = this.measure;
    Object.assign(m.style, { width: w + 'px', height: h + 'px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    this.measureSpan.textContent = text;
    let lo = min, hi = max;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      m.style.font = font.replace('SIZE', mid);
      // The text's line boxes must fit (glyph ink may overhang them, as it does in Roblox).
      const b = this.measureSpan.getBoundingClientRect();
      if (b.height <= h + 0.5 && b.width <= w + 0.5 && m.scrollWidth <= w + 0.5) lo = mid; else hi = mid - 1;
    }
    this.fitCache.set(key, lo);
    return lo;
  }

  // Buttons: Roblox's events. Activated and MouseButton1Click need the press and
  // release inside the button. The DOM element takes the pointer, so the input
  // never reaches the 3D view (Roblox sinks a button's input the same way).
  wireButton(inst, e) {
    const el = e.el, fire = (ev, args = []) => { this.dm.fire(inst, ev, args); this.dirty = true; };
    el.addEventListener('pointerenter', () => { e.hover = true; fire('MouseEnter'); });
    el.addEventListener('pointerleave', () => { e.hover = false; e.down = false; fire('MouseLeave'); });
    el.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); e.down = true; e.hover = true; fire('MouseButton1Down'); });
    el.addEventListener('pointerup', ev => {
      ev.stopPropagation();
      const was = e.down; e.down = false;
      // A touch stays captured by the button it started on, so check the release
      // point: Roblox fires a click only when the release is inside the button.
      const b = el.getBoundingClientRect(), inside = ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom;
      if (inside) fire('MouseButton1Up');
      // A press that became a ScrollingFrame's drag isn't a click.
      if (was && inside && inst.props.Active && !this.scrolled.has(ev.pointerId)) { fire('MouseButton1Click'); fire('Activated'); }
      if (ev.pointerType !== 'mouse') e.hover = false;
    });
    for (const t of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(t, ev => ev.stopPropagation(), { passive: true });
  }
}

// UIGradient (classes/UIGradient.yaml). The gradient lives in the object's own box, in shares of its
// size: t = ((u - 0.5 - Offset.X) cos R + (v - 0.5 - Offset.Y) sin R) * max(|cos R|, |sin R|) + 0.5, for
// (u, v) in 0..1 and R the clockwise Rotation, so at any rotation the line through the centre meets the
// box's edges at t = 0 and 1 ('the beginning and end control points snap to the edges'; OURS: our
// reading of it, and working in shares of the size, so 45 degrees runs corner to corner on any box).
// Its colour multiplies the object's (OURS: 'blended' read as multiplied, so white shows the gradient's
// own colours) and its transparency multiplies the opacity; envelopes are ignored (the docs). Drawn as a
// CSS linear-gradient with stops at every keypoint and between them (CSS mixes premultiplied).
const GRADIENT_ON = new Set(['Frame', 'TextLabel', 'TextButton', 'ImageLabel', 'ImageButton']); // not ScrollingFrame or TextBox (the docs)
// UIScale: its Scale (none: 1; below 0: 0, OURS).
function scaleOf(inst) { const u = inst.children.find(c => c.ClassName === 'UIScale'); return u ? Math.max(0, u.props.Scale) : 1; }
function gradientOf(inst) { if (!GRADIENT_ON.has(inst.ClassName)) return null; const g = inst.children.find(c => c.ClassName === 'UIGradient'); return g && g.props.Enabled ? g.props : null; }
function seqAt(k, t, val) {
  if (t <= k[0][0]) return val(k[0]);
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i], f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 1, x = val(a), y = val(b); return x.map((v, j) => v + (y[j] - v) * f); }
  return val(k[k.length - 1]);
}
function gradientCss(G, W, H, base, alpha, opaque = false) {
  if (!(W > 0 && H > 0)) return '';
  const th = G.Rotation * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), m = Math.max(Math.abs(c), Math.abs(s));
  const gx = c * m / W, gy = s * m / H, gl = Math.hypot(gx, gy), dx = gx / gl, dy = gy / gl; // t's gradient in pixels, and its direction
  const deg = Math.atan2(dx, -dy) * 180 / Math.PI, L = Math.abs(W * dx) + Math.abs(H * dy); // CSS's angle, and its gradient line's length
  const off = (G.Offset.x * c + G.Offset.y * s) * m;
  const at = t => ((t - 0.5 + off) / (gl * L) + 0.5) * 100;
  const times = [...new Set([...G.Color.k.map(k => k[0]), ...G.Transparency.k.map(k => k[0])])].sort((a, b) => a - b), ts = [];
  times.forEach((t, i) => { ts.push(t); if (i + 1 < times.length) for (let j = 1; j < 4; j++) ts.push(t + (times[i + 1] - t) * j / 4); });
  const stops = ts.map(t => {
    const [r, g, b] = seqAt(G.Color.k, t, k => [k[1].r, k[1].g, k[1].b]), [tr] = seqAt(G.Transparency.k, t, k => [k[1]]);
    return `${css({ r: r * base.r, g: g * base.g, b: b * base.b }, opaque ? 1 : alpha * (1 - tr))} ${at(t).toFixed(4)}%`;
  });
  return `linear-gradient(${deg.toFixed(4)}deg, ${stops.join(', ')})`;
}

// RichText: Roblox's tags (b, i, u, s, br, font color/size/face, stroke is not drawn),
// everything else escaped.
function richText(src) {
  const esc = t => t.replace(/&(?!(lt|gt|amp|quot|apos);)/g, '&amp;').replace(/"/g, '&quot;');
  let out = '';
  const re = /<(\/?)(b|i|u|s|br|font|uppercase|smallcaps)\b([^>]*)>|([^<]+)|(<)/gi;
  for (const m of src.matchAll(re)) {
    if (m[4] !== undefined) { out += esc(m[4]).replace(/</g, '&lt;').replace(/>/g, '&gt;'); continue; }
    if (m[5]) { out += '&lt;'; continue; }
    const close = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (tag === 'br') { out += '<br>'; continue; }
    if (close) { out += { b: '</b>', i: '</i>', u: '</u>', s: '</s>', font: '</span>', uppercase: '</span>', smallcaps: '</span>' }[tag]; continue; }
    if (tag === 'font') {
      const st = [];
      const color = /color\s*=\s*["']([^"']+)["']/i.exec(attrs), size = /size\s*=\s*["'](\d+)["']/i.exec(attrs), face = /face\s*=\s*["'](\w+)["']/i.exec(attrs);
      if (color) { const c = color[1].trim(); const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c); st.push('color:' + (rgb ? `rgb(${rgb[1]},${rgb[2]},${rgb[3]})` : /^#[0-9a-f]{3,6}$/i.test(c) ? c : 'inherit')); }
      if (size) st.push(`font-size:${+size[1]}px`);
      if (face && FONT_MAP[face[1]]) st.push(`font-family:'${FONT_MAP[face[1]][0]}'`);
      out += `<span style="${st.join(';')}">`;
      continue;
    }
    out += { b: '<b>', i: '<i>', u: '<u>', s: '<s>', uppercase: '<span style="text-transform:uppercase">', smallcaps: '<span style="font-variant:small-caps">' }[tag];
  }
  return out;
}
export { richText };
