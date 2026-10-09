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

export const GUI_INSET = 58;
const FONTS = [
  ['Arimo', 'Arimo.woff2', '400 700'], ['Source Sans 3', 'SourceSans3.woff2', '200 900'], ['Montserrat', 'Montserrat.woff2', '100 900'],
  ['Press Start 2P', 'PressStart2P.woff2', '400'], ['Fredoka', 'Fredoka.woff2', '300 700'], ['Roboto', 'Roboto.woff2', '100 900'],
  ['Nunito', 'Nunito.woff2', '200 1000'], ['Oswald', 'Oswald.woff2', '200 700'], ['Bangers', 'Bangers.woff2', '400'],
];
// Enum.Font -> [family, weight, style]. Roblox maps Legacy/Arial to Arimo and Gotham to Montserrat;
// Builder Sans isn't open, so Nunito stands in. Anything else falls back to Arimo.
const FONT_MAP = {
  Legacy: ['Arimo', 400], Arial: ['Arimo', 400], ArialBold: ['Arimo', 700], Arimo: ['Arimo', 400], ArimoBold: ['Arimo', 700],
  SourceSans: ['Source Sans 3', 400], SourceSansBold: ['Source Sans 3', 700], SourceSansLight: ['Source Sans 3', 300],
  SourceSansItalic: ['Source Sans 3', 400, 'italic'], SourceSansSemibold: ['Source Sans 3', 600],
  Gotham: ['Montserrat', 400], GothamMedium: ['Montserrat', 500], GothamBold: ['Montserrat', 700], GothamBlack: ['Montserrat', 900],
  Arcade: ['Press Start 2P', 400], FredokaOne: ['Fredoka', 600], Roboto: ['Roboto', 400], RobotoCondensed: ['Roboto', 400],
  Nunito: ['Nunito', 400], Oswald: ['Oswald', 400], Bangers: ['Bangers', 400],
  BuilderSans: ['Nunito', 400], BuilderSansMedium: ['Nunito', 500], BuilderSansBold: ['Nunito', 700], BuilderSansExtraBold: ['Nunito', 800],
};
const css = (c, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const child = (inst, cls) => inst.children.find(c => c.ClassName === cls);

export class Gui {
  constructor(dm, players, base = '../assets/fonts/') {
    this.dm = dm; this.players = players;
    this.root = document.createElement('div');
    Object.assign(this.root.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: '5' });
    document.body.appendChild(this.root);
    const st = document.createElement('style');
    st.textContent = FONTS.map(([f, file, w]) => `@font-face{font-family:'${f}';src:url('${base}${file}') format('woff2');font-weight:${w};font-display:block}`).join('\n') +
      '\n.cs-gui{position:absolute;box-sizing:border-box;pointer-events:none;display:flex;white-space:pre;line-height:1;transform-origin:50% 50%}' +
      '\n.cs-pl-row:hover{background:rgba(255,255,255,0.1)}'; // the player list's row hover (BackgroundOnHover)
    document.head.appendChild(st);
    this.els = new Map(); // instance -> { el, text, cache }
    // A font finishing loading changes text metrics: re-fit TextScaled and re-lay out.
    document.fonts.addEventListener('loadingdone', () => { this.fitCache = new Map(); this.dirty = true; });
    this.dirty = true;
    dm.watch(() => { this.dirty = true; });
    this.small = false; // a touch device: the player list shows one stat column
    this.playerList = new PlayerList(dm, players, this.root, () => { this.dirty = true; });
    // TextScaled measures in a box built like the ones drawn (flex, a span inside).
    this.measure = document.createElement('div');
    this.measure.className = 'cs-gui';
    Object.assign(this.measure.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', alignItems: 'center', justifyContent: 'center', textAlign: 'center' });
    this.measureSpan = document.createElement('span');
    this.measure.appendChild(this.measureSpan);
    document.body.appendChild(this.measure);
  }
  fontsReady() { return Promise.all(FONTS.map(([f]) => document.fonts.load(`16px '${f}'`))).then(() => document.fonts.ready).then(() => { this.fitCache = new Map(); this.dirty = true; }); }

  // Per frame (after RenderStepped): lay out and draw when anything changed or the screen resized.
  update() {
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
        Object.assign(e.el.style, { left: '0px', top: top + 'px', width: W + 'px', height: H - top + 'px', zIndex: String(i + 1), display: g.props.Enabled ? 'block' : 'none' });
        this.setAbs(g, 0, top - GUI_INSET, W, H - top);
        if (g.props.Enabled) this.layoutChildren(g, e.el, W, H - top, 0, top - GUI_INSET, seen);
      });
    }
    for (const [inst, e] of this.els) if (!seen.has(inst)) { e.el.remove(); this.els.delete(inst); }
    this.playerList.update(W, H, this.small, this.dm.coreGui.PlayerList);
  }

  element(inst, parentEl, seen) {
    seen.add(inst);
    let e = this.els.get(inst);
    if (!e) {
      const el = document.createElement('div');
      el.className = 'cs-gui';
      e = { el, cache: {} };
      if (isA(inst.ClassName, 'GuiButton')) this.wireButton(inst, e);
      this.els.set(inst, e);
    }
    if (e.el.parentNode !== parentEl) parentEl.appendChild(e.el);
    return e;
  }

  setAbs(inst, x, y, w, h) {
    const P = inst.props;
    const pos = new V2(x, y), size = new V2(w, h);
    for (const [k, v] of [['AbsolutePosition', pos], ['AbsoluteSize', size]]) {
      const o = P[k];
      if (!o || o.x !== v.x || o.y !== v.y) { P[k] = v; this.dm.fire(inst, 'Changed', [k]); }
    }
  }

  // Children of a container whose content box is w x h at absolute (ax, ay).
  layoutChildren(parent, parentEl, w, h, ax, ay, seen) {
    // UIPadding shrinks the content box.
    const pad = child(parent, 'UIPadding');
    let ox = 0, oy = 0;
    if (pad) {
      const p = pad.props, l = p.PaddingLeft.s * w + p.PaddingLeft.o, r = p.PaddingRight.s * w + p.PaddingRight.o;
      const t = p.PaddingTop.s * h + p.PaddingTop.o, b = p.PaddingBottom.s * h + p.PaddingBottom.o;
      ox = l; oy = t; w = Math.max(0, w - l - r); h = Math.max(0, h - t - b);
    }
    const kids = parent.children.filter(c => isA(c.ClassName, 'GuiObject'));
    const list = child(parent, 'UIListLayout');
    const rects = new Map();
    for (const c of kids) {
      const P = c.props, S = P.Size;
      let cw = w * S.xs + S.xo, ch = h * S.ys + S.yo;
      const ar = child(c, 'UIAspectRatioConstraint');
      if (ar) { // keep width/height = AspectRatio; FitWithinMaxSize shrinks the larger side to fit
        const r = ar.props.AspectRatio || 1;
        if (ar.props.AspectType === 'FitWithinMaxSize') { if (cw / ch > r) cw = ch * r; else ch = cw / r; }
        else if (ar.props.DominantAxis === 'Width') ch = cw / r; else cw = ch * r;
      }
      const Pp = P.Position, A = P.AnchorPoint;
      rects.set(c, { x: ox + w * Pp.xs + Pp.xo - A.x * cw, y: oy + h * Pp.ys + Pp.yo - A.y * ch, w: cw, h: ch });
    }
    if (list) this.listLayout(list.props, kids.filter(c => c.props.Visible), rects, ox, oy, w, h);
    kids.forEach(c => {
      const r = rects.get(c), e = this.element(c, parentEl, seen);
      this.draw(c, e, r);
      this.setAbs(c, ax + r.x, ay + r.y, r.w, r.h);
      if (c.props.Visible) this.layoutChildren(c, e.el, r.w, r.h, ax + r.x, ay + r.y, seen);
    });
  }

  // UIListLayout: siblings in a row or column, Padding apart, aligned in the content box.
  listLayout(L, items, rects, ox, oy, w, h) {
    const byName = (a, b) => a.props.Name < b.props.Name ? -1 : a.props.Name > b.props.Name ? 1 : 0;
    items.sort(L.SortOrder === 'LayoutOrder' ? (a, b) => a.props.LayoutOrder - b.props.LayoutOrder : byName); // stable: ties keep insertion order
    const vertical = L.FillDirection === 'Vertical', gap = L.Padding.s * (vertical ? h : w) + L.Padding.o;
    const total = items.reduce((s, c) => s + (vertical ? rects.get(c).h : rects.get(c).w), 0) + gap * Math.max(0, items.length - 1);
    const main = vertical ? { Top: 0, Center: 0.5, Bottom: 1 }[L.VerticalAlignment] : { Left: 0, Center: 0.5, Right: 1 }[L.HorizontalAlignment];
    let at = (vertical ? h - total : w - total) * main;
    for (const c of items) {
      const r = rects.get(c);
      if (vertical) { r.y = oy + at; r.x = ox + (w - r.w) * { Left: 0, Center: 0.5, Right: 1 }[L.HorizontalAlignment]; at += r.h + gap; }
      else { r.x = ox + at; r.y = oy + (h - r.h) * { Top: 0, Center: 0.5, Bottom: 1 }[L.VerticalAlignment]; at += r.w + gap; }
    }
  }

  draw(inst, e, r) {
    const P = inst.props, s = e.el.style, set = (k, v) => { if (e.cache[k] !== v) { e.cache[k] = v; s[k] = v; } };
    set('display', P.Visible ? 'flex' : 'none');
    set('left', r.x + 'px'); set('top', r.y + 'px'); set('width', Math.max(0, r.w) + 'px'); set('height', Math.max(0, r.h) + 'px');
    set('zIndex', String(P.ZIndex));
    set('transform', P.Rotation ? `rotate(${P.Rotation}deg)` : '');
    set('overflow', P.ClipsDescendants ? 'hidden' : 'visible');
    const bgA = 1 - P.BackgroundTransparency;
    const hover = e.hover && P.AutoButtonColor ? (e.down ? 0.7 : 0.85) : 1; // ours: Roblox's tint amounts are undocumented
    const bg = P.BackgroundColor3;
    set('backgroundColor', bgA > 0 ? css({ r: bg.r * hover, g: bg.g * hover, b: bg.b * hover }, bgA) : 'transparent');
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
    if ('Image' in P) this.drawImage(P, e, set);
    if (isText) this.drawText(inst, P, e, r, set, sp && sp.ApplyStrokeMode === 'Contextual' ? sp : null);
    if (isA(inst.ClassName, 'GuiButton')) set('pointerEvents', P.Active && P.Visible ? 'auto' : 'none');
  }

  drawImage(P, e, set) {
    // Images by URL (a path in the game, https or data:). Roblox asset ids can't be fetched here.
    const url = P.Image && !/^rbxasset/.test(P.Image) ? P.Image : '';
    set('backgroundImage', url ? `url("${url}")` : '');
    set('backgroundSize', { Stretch: '100% 100%', Fit: 'contain', Crop: 'cover', Tile: 'auto', Slice: '100% 100%' }[P.ScaleType] || '100% 100%');
    set('backgroundRepeat', P.ScaleType === 'Tile' ? 'repeat' : 'no-repeat');
    set('backgroundPosition', 'center');
    set('opacity', String(1 - P.ImageTransparency));
  }

  drawText(inst, P, e, r, set, stroke) {
    const [family, weight, style] = FONT_MAP[P.Font] || FONT_MAP.Legacy;
    // Line height goes inside the font shorthand (which would otherwise reset it).
    const font = `${style || 'normal'} ${weight} SIZEpx/${P.LineHeight} '${family}', Arimo, sans-serif`;
    let size = P.TextSize;
    const lim = child(inst, 'UITextSizeConstraint');
    const min = lim ? lim.props.MinTextSize : 1, max = lim ? lim.props.MaxTextSize : 100;
    const wrap = P.TextWrapped || P.TextScaled;
    if (P.TextScaled) size = this.fitText(P.Text, font, r.w, r.h, min, max);
    else if (lim) size = Math.min(max, Math.max(min, size));
    set('font', font.replace('SIZE', size));
    set('color', css(P.TextColor3, 1 - P.TextTransparency));
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
    const content = P.RichText ? richText(P.Text) : null;
    if (e.cache.text !== P.Text || e.cache.rich !== P.RichText) {
      e.cache.text = P.Text; e.cache.rich = P.RichText;
      if (content !== null) e.el.innerHTML = '<span>' + content + '</span>'; else { e.el.textContent = ''; const sp = document.createElement('span'); sp.textContent = P.Text; e.el.appendChild(sp); }
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
      if (was && inside && inst.props.Active) { fire('MouseButton1Click'); fire('Activated'); }
      if (ev.pointerType !== 'mouse') e.hover = false;
    });
    for (const t of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(t, ev => ev.stopPropagation(), { passive: true });
  }
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
