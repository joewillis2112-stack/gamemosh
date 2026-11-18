// The Vector Editor: shapes, pen paths and text for HUD art, icons and logos, written into an image
// property as SVG, so the browser draws them sharp at any size. Opens, as the Image Editor does,
// on the selected Decal, Texture, ImageLabel, ImageButton or MeshPart. Our own SVG carries its
// document (a <metadata> block), so it opens again as shapes; any other image becomes a locked
// background to draw over.
//
// The geometry is VectorCraft's (web/vector/geom.js, checked against its Rust): Illustrator's
// anchor layouts for each shape, and Live Corners (round, inverted round, chamfer) on any shape
// with corners, kept live so the radius can change later. Rectangles, ellipses, polygons and
// stars stay parametric; Pen paths are anchors with handles (click for a corner, drag for a
// smooth anchor, click the first anchor to close, Enter or another tool to finish).
// Pathfinder (VectorCraft's pathops, compiled to wasm: web/vector/pathops.js): Unite, Minus Front,
// Intersect, Exclude, and Divide, Trim, Merge (joins what shares a paint), Crop over the selected shapes (Shift-click, or the Add button on a phone, picks
// more than one); the result is one path with the paint Illustrator keeps (the front shape's; the
// back one's for Minus Front), in place of its inputs.
// Gradients (VectorCraft's model, web/vector/gradient.js): linear or radial from the fill colour
// to a second colour, at an angle, fitted to the shape's bounds on each render.
// Text: point text at a click, in a font the page has or a web-safe one (the SVG names the family
// with a generic fallback, so any device draws it). It isn't outlined, so it can't be combined.
// The view is an <svg> of the document itself, so what's shown is what's written. Apply is one
// undo step in the editor; inside, Undo takes back the last change.
import * as G from '../vector/geom.js';
import * as Grad from '../vector/gradient.js';
import { pathfinder, loadPathops, pathopsReady } from '../vector/pathops.js';
import { IMAGE_PROP } from './imageeditor.js';

const NEW_SIZE = 512, UNDO_DEPTH = 50, META = 'claudestudio-vector';
const TOOLS = [['select', 'Select'], ['rect', 'Rect'], ['ellipse', 'Ellipse'], ['polygon', 'Polygon'], ['star', 'Star'], ['pen', 'Pen'], ['text', 'Text']];
const PATHFINDER = [['unite', 'Unite'], ['minusFront', 'Minus Front'], ['intersect', 'Intersect'], ['exclude', 'Exclude']];
const PATHFINDER2 = [['divide', 'Divide'], ['trim', 'Trim'], ['merge', 'Merge'], ['crop', 'Crop']];
// Fonts: the page's own (system-ui) and the web-safe families, each with a generic fallback.
export const FONTS = { System: 'system-ui, sans-serif', Sans: 'Arial, Helvetica, sans-serif', Serif: "Georgia, 'Times New Roman', serif", Mono: "'Courier New', monospace", Verdana: 'Verdana, sans-serif', Trebuchet: "'Trebuchet MS', sans-serif", Impact: 'Impact, sans-serif' };
const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unesc = s => s.replace(/&(amp|lt|gt|quot);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[k]);
const b64 = s => btoa(unescape(encodeURIComponent(s))), unb64 = s => decodeURIComponent(escape(atob(s)));

/** A shape's outline: its generator's anchors, then its Live Corners. Text has none (null). */
export function shapePath(s) {
  if (s.kind === 'text') return null;
  const L = s.live || {};
  const base = s.kind === 'rect' ? G.rectangle(L.r) : s.kind === 'ellipse' ? G.ellipse(L.r)
    : s.kind === 'polygon' ? G.polygon(L.c, L.radius, L.sides) : s.kind === 'star' ? G.star(L.c, L.radius, L.radius * L.inner, L.points) : s.path;
  if (!(s.corner > 0)) return base;
  const n = base.reduce((t, sp) => t + sp.anchors.length, 0);
  return G.cutCorners(base, Array(n).fill(s.corner), Array(n).fill(s.cornerKind || 'Round')).path;
}
export const fontCss = s => `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.size}px ${FONTS[s.font] || FONTS.Sans}`;
let measureCtx = null;
/** Bounds [x0, y0, x1, y1]: a path's own, or a text's glyphs as the browser measures them. */
export function shapeBounds(s) {
  if (s.kind !== 'text') return G.bounds(shapePath(s));
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = fontCss(s);
  const m = measureCtx.measureText(s.text || ' ');
  const asc = m.actualBoundingBoxAscent ?? s.size * 0.8, desc = m.actualBoundingBoxDescent ?? s.size * 0.2;
  return [s.at[0] - (m.actualBoundingBoxLeft || 0), s.at[1] - asc, s.at[0] + (m.actualBoundingBoxRight ?? m.width), s.at[1] + desc];
}
/** One shape as SVG: its element, and its gradient's definition (id `gid`) if it has one. */
export function shapeSvg(s, gid) {
  const b = s.grad ? shapeBounds(s) : null;
  const def = s.grad && b ? Grad.toSvgDef(gid, s.grad, b) : '';
  const fill = s.grad && b ? `url(#${gid})` : s.fill;
  const paint = `fill="${fill}" stroke="${s.strokeWidth > 0 ? s.stroke : 'none'}" stroke-width="${s.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`;
  const el = s.kind === 'text'
    ? `<text x="${s.at[0]}" y="${s.at[1]}" font-family="${esc(FONTS[s.font] || FONTS.Sans)}" font-size="${s.size}"${s.bold ? ' font-weight="bold"' : ''}${s.italic ? ' font-style="italic"' : ''} xml:space="preserve" ${paint}>${esc(s.text)}</text>`
    : `<path d="${G.toSvgD(shapePath(s))}" fill-rule="nonzero" ${paint}/>`;
  return { el, def };
}
/** The document as SVG text, carrying itself in <metadata> so it opens again as shapes. */
export function toSvg(doc) {
  const parts = doc.shapes.map((s, i) => shapeSvg(s, 'g' + i));
  const defs = parts.map(p => p.def).join('');
  const bg = doc.background ? `<image href="${esc(doc.background)}" width="${doc.w}" height="${doc.h}" preserveAspectRatio="none"/>` : '';
  return `<svg xmlns="${NS}" width="${doc.w}" height="${doc.h}" viewBox="0 0 ${doc.w} ${doc.h}"><metadata id="${META}">${esc(JSON.stringify(doc))}</metadata>${defs ? `<defs>${defs}</defs>` : ''}${bg}${parts.map(p => p.el).join('')}</svg>`;
}
export const toDataUrl = doc => 'data:image/svg+xml;base64,' + b64(toSvg(doc));
/** The document inside one of our SVG data URLs, or null. */
export function fromDataUrl(url) {
  const m = /^data:image\/svg\+xml;base64,(.*)$/.exec(url || ''); if (!m) return null;
  const meta = new RegExp(`<metadata id="${META}">([^<]*)</metadata>`).exec(unb64(m[1]));
  try { return meta ? JSON.parse(unesc(meta[1])) : null; } catch { return null; }
}

export class VectorEditor {
  constructor({ dm, world, commands, panel, onState = () => {} }) {
    Object.assign(this, { dm, world, commands, panel, onState });
    this.doc = null; this.sel = -1; this.extra = []; this.addMode = false; this.tool = 'select'; this.undo = []; this.drag = null; this.pen = null; this.lastEdit = null; this.note = '';
    this.style = { fill: '#3fa9f5', stroke: '#1b1b1f', strokeWidth: 0, corner: 0, cornerKind: 'Round', sides: 6, points: 5, inner: 0.5, paint: 'solid', to: '#1b1b1f', angle: 0, text: 'Text', font: 'Sans', size: 48, bold: false, italic: false };
    this.build();
  }
  get active() { return !!this.doc; }

  /** Open on `inst` (or the selection). False (and says why) if it has no image property. */
  async open(inst = this.commands.selection.primary) {
    const prop = inst && IMAGE_PROP[inst.ClassName];
    if (!prop) { this.onState({ active: this.active, message: 'Select a Decal, ImageLabel, ImageButton or MeshPart to draw on its image' }); return false; }
    const url = inst.props[prop] || '';
    let doc = fromDataUrl(url);
    if (!doc) { // any other image: a background, embedded (an SVG drawn as an image loads nothing from outside)
      doc = { w: NEW_SIZE, h: NEW_SIZE, background: null, shapes: [] };
      if (url && !/^rbxasset/.test(url)) try {
        const blob = await (await fetch(this.world.resolveUrl(url))).blob(), bmp = await createImageBitmap(blob);
        doc.w = bmp.width; doc.h = bmp.height;
        doc.background = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
      } catch { doc.background = null; }
    }
    this.doc = doc; this.target = { inst, prop }; this.sel = -1; this.extra = []; this.undo = []; this.pen = null; this.note = '';
    this.title.textContent = `${inst.ClassName} ${inst.Name}: ${prop}`;
    this.panel.hidden = false; this.setTool('select'); this.render(); this.onState({ active: true }); // render twice: the first fits the view, the second scales the handles to it
    loadPathops().catch(() => {}); // the booleans' module, in the background
    return true;
  }
  close() { this.doc = null; this.target = null; this.pen = null; this.drag = null; this.panel.hidden = true; this.onState({ active: false }); }
  /** Write the SVG into the property (one undo step) and close. */
  apply() {
    if (!this.doc) return null;
    this.finishPen();
    const url = toDataUrl(this.doc), { inst, prop } = this.target;
    this.commands.history.run('Edit Vector', tx => tx.set(inst, prop, url));
    this.close();
    return url;
  }

  // ---- document changes
  snapshot() { this.lastEdit = null; this.undo.push(JSON.stringify({ doc: this.doc, sel: this.sel, extra: this.extra })); if (this.undo.length > UNDO_DEPTH) this.undo.shift(); }
  undoLast() {
    if (this.pen) { this.pen = null; this.render(); return true; }
    const u = this.undo.pop(); if (!u) return false;
    const s = JSON.parse(u); this.doc = s.doc; this.sel = s.sel; this.extra = s.extra || []; this.lastEdit = null; this.render(); return true;
  }
  get shape() { return this.doc && this.doc.shapes[this.sel]; }
  boundsOf(i) { return shapeBounds(this.doc.shapes[i]); }
  /** The selected shapes' indices, back to front. */
  get selection() { return this.sel < 0 ? [] : [...new Set([...this.extra, this.sel])].sort((a, b) => a - b); }
  select(i, add = false) {
    if (!add || i < 0) { this.sel = i; this.extra = []; return; }
    const all = this.selection;
    if (all.includes(i)) { const rest = all.filter(j => j !== i); this.sel = rest.length ? rest[rest.length - 1] : -1; this.extra = rest.slice(0, -1); }
    else { this.extra = all; this.sel = i; }
  }
  gradFor(S) { const from = S.fill === 'none' ? this.style.fill : S.fill; return { kind: S.paint, angle: S.angle, stops: [Grad.stop(0, Grad.fromHex(from)), Grad.stop(1, Grad.fromHex(S.to))] }; }
  newShape(kind, live, path = null) {
    const S = this.style;
    const s = { kind, live, path, fill: S.fill, stroke: S.stroke, strokeWidth: S.strokeWidth, corner: S.corner, cornerKind: S.cornerKind, grad: S.paint === 'solid' ? null : this.gradFor(S) };
    this.doc.shapes.push(s); this.sel = this.doc.shapes.length - 1; this.extra = [];
    return s;
  }
  newText(at) {
    const S = this.style, s = this.newShape('text', null);
    Object.assign(s, { at, text: S.text || 'Text', font: S.font, size: S.size, bold: S.bold, italic: S.italic, corner: 0 });
    return s;
  }
  /** Set a property of the selected shapes (or, with none, of the next one drawn). */
  setProp(k, v) {
    this.style[k] = v;
    const sel = this.selection.map(i => this.doc.shapes[i]); if (!sel.length) return this.render();
    // Typing into the text field is one step per text, not per letter.
    const key = k === 'text' ? 'text' + this.sel : null;
    if (!key || this.lastEdit !== key) this.snapshot();
    this.lastEdit = key;
    for (const s of sel) {
      if (k === 'sides' && s.kind === 'polygon') s.live.sides = v;
      else if ((k === 'points' || k === 'inner') && s.kind === 'star') s.live[k] = v;
      else if (k === 'paint') s.grad = v === 'solid' ? null : s.grad ? { ...s.grad, kind: v } : this.gradFor({ ...this.style, fill: s.fill });
      else if (k === 'to' || k === 'angle') { if (s.grad) { if (k === 'angle') s.grad.angle = v; else s.grad.stops[s.grad.stops.length - 1].color = Grad.fromHex(v); } }
      else if (k === 'fill') { s.fill = v; if (s.grad && v !== 'none') s.grad.stops[0].color = Grad.fromHex(v); }
      else if (['text', 'font', 'size', 'bold', 'italic'].includes(k)) { if (s.kind === 'text') s[k] = v; }
      else if (k in s) s[k] = v;
    }
    this.render();
  }
  order(by) {
    const S = this.doc.shapes, j = this.sel + by; if (!this.shape || j < 0 || j >= S.length) return;
    this.snapshot(); [S[this.sel], S[j]] = [S[j], S[this.sel]]; this.sel = j; this.extra = []; this.render();
  }
  remove() {
    const all = this.selection; if (!all.length) return;
    this.snapshot(); for (const i of all.reverse()) this.doc.shapes.splice(i, 1); this.sel = -1; this.extra = []; this.render();
  }
  /** Pathfinder `op` over the selected shapes: one path in their place (at the front one's place in the stack). */
  async combine(op) {
    const idx = this.selection;
    if (idx.length < 2) return this.say('Select two or more shapes (Shift-click, or Add) to combine them');
    if (idx.some(i => this.doc.shapes[i].kind === 'text')) return this.say("Text can't be combined: it has no outlines");
    if (!pathopsReady()) { try { await loadPathops(); } catch { return this.say('The path operations failed to load'); } }
    const shapes = idx.map(i => this.doc.shapes[i]), paint = s => JSON.stringify([s.fill, s.grad, s.stroke, s.strokeWidth]);
    const keys = shapes.map(s => shapes.findIndex(t => paint(t) === paint(s))); // Merge joins shapes of one paint
    const res = pathfinder(op, shapes.map(shapePath), keys);
    if (!res) return this.say("Those shapes couldn't be combined");
    this.snapshot();
    const out = res.map(r => { const k = shapes[r.key]; return { kind: 'path', live: null, path: r.path, fill: k.fill, stroke: k.stroke, strokeWidth: k.strokeWidth, corner: 0, cornerKind: k.cornerKind, grad: k.grad ? JSON.parse(JSON.stringify(k.grad)) : null }; });
    const at = idx[idx.length - 1] - (idx.length - 1); // where the front one sits once the others are gone
    for (const i of [...idx].reverse()) this.doc.shapes.splice(i, 1);
    this.doc.shapes.splice(at, 0, ...out);
    this.sel = out.length ? at + out.length - 1 : -1; this.extra = out.length > 1 ? out.slice(0, -1).map((_, k) => at + k) : []; this.addMode = false;
    this.say(out.length ? '' : 'Nothing was left'); this.render();
  }
  say(text) { this.note = text; if (this.doc) this.refreshSide(); }
  setTool(t) { this.finishPen(); this.tool = t; if (t !== 'select') { this.sel = -1; this.extra = []; } this.render(); }
  finishPen() {
    const p = this.pen; this.pen = null; if (!p) return;
    if (p.anchors.length >= 2) { this.snapshot(); this.newShape('path', null, [{ anchors: p.anchors, closed: p.closed }]); }
    this.render();
  }

  // ---- pointer
  toDoc(e) { const m = this.svg.getScreenCTM().inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [p.x, p.y]; }
  fit() { // the view as large as fits, at the drawing's proportions (so its edges show)
    const v = this.svg.parentElement, cs = getComputedStyle(v), cw = v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ch = v.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const k = Math.max(0, Math.min(cw / this.doc.w, ch / this.doc.h));
    this.svg.style.width = this.doc.w * k + 'px'; this.svg.style.height = this.doc.h * k + 'px';
  }
  get px() { const r = this.svg.getBoundingClientRect(); return Math.max(this.doc.w / r.width, this.doc.h / r.height); } // document units per screen pixel
  hit(p) { // the topmost shape under p (its fill, or its stroke widened to a finger's width; a text's box)
    const els = [...this.art.children], pt = new DOMPoint(p[0], p[1]);
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i], s = this.doc.shapes[i], sw = el.getAttribute('stroke-width'), stroke = el.getAttribute('stroke');
      if (s.kind === 'text') { const b = shapeBounds(s), m = 6 * this.px; if (p[0] >= b[0] - m && p[0] <= b[2] + m && p[1] >= b[1] - m && p[1] <= b[3] + m) return i; continue; }
      if (s.fill !== 'none' && el.isPointInFill(pt)) return i;
      el.setAttribute('stroke-width', Math.max(+s.strokeWidth, 12 * this.px)); el.setAttribute('stroke', '#000');
      const on = el.isPointInStroke(pt);
      el.setAttribute('stroke-width', sw); el.setAttribute('stroke', stroke);
      if (on) return i;
    }
    return -1;
  }
  down(e) {
    if (e.button !== 0 || !this.doc) return;
    this.svg.setPointerCapture && this.svg.setPointerCapture(e.pointerId);
    const p = this.toDoc(e), h = e.target.dataset;
    if (this.tool === 'pen') return this.penDown(p);
    if (this.tool === 'text') {
      e.preventDefault(); // no mousedown after it, which would take the focus off the text field
      this.snapshot(); this.newText(p); this.render();
      const t = this.panel.querySelector('[data-v=text]'); t.focus(); t.select(); // type straight away (on a phone, the keyboard comes up)
      return;
    }
    if (this.tool === 'select') {
      if (h.anchor !== undefined) { this.snapshot(); this.drag = { mode: 'anchor', si: +h.sp, ai: +h.anchor, handle: h.handle || null, from: p, moved: false }; return; }
      const i = this.hit(p), add = e.shiftKey || this.addMode;
      if (!(i >= 0 && !add && this.selection.includes(i))) this.select(i, add); // pressing on a selected shape keeps the selection, to drag it all
      if (i >= 0 && this.selection.includes(i)) { this.snapshot(); this.drag = { mode: 'move', from: p, last: p, moved: false }; }
      this.render(); return;
    }
    this.snapshot();
    const live = this.tool === 'rect' || this.tool === 'ellipse' ? { r: [p[0], p[1], p[0], p[1]] }
      : this.tool === 'polygon' ? { c: p, radius: 0, sides: this.style.sides } : { c: p, radius: 0, points: this.style.points, inner: this.style.inner };
    this.newShape(this.tool, live); this.drag = { mode: 'create', from: p, moved: false };
    this.render();
  }
  move(e) {
    if (!this.doc) return;
    const p = this.toDoc(e), d = this.drag;
    if (this.pen && this.pen.dragging) { const a = this.pen.anchors[this.pen.anchors.length - 1]; a.out = p; a.in = [2 * a.p[0] - p[0], 2 * a.p[1] - p[1]]; a.kind = 'Smooth'; return this.render(); }
    if (this.pen) { this.pen.hover = p; return this.render(); }
    if (!d) return;
    d.moved = d.moved || Math.hypot(p[0] - d.from[0], p[1] - d.from[1]) > 2 * this.px;
    const s = this.shape;
    if (d.mode === 'create') {
      const L = s.live;
      if (L.r) L.r = [d.from[0], d.from[1], p[0], p[1]]; else L.radius = Math.hypot(p[0] - L.c[0], p[1] - L.c[1]);
    } else if (d.mode === 'move') {
      const dv = [p[0] - d.last[0], p[1] - d.last[1]]; d.last = p;
      for (const i of this.selection) {
        const s = this.doc.shapes[i];
        if (s.kind === 'text') s.at = [s.at[0] + dv[0], s.at[1] + dv[1]];
        else if (s.live && s.live.r) s.live.r = [s.live.r[0] + dv[0], s.live.r[1] + dv[1], s.live.r[2] + dv[0], s.live.r[3] + dv[1]];
        else if (s.live) s.live.c = [s.live.c[0] + dv[0], s.live.c[1] + dv[1]];
        else G.translate(s.path, dv);
      }
    } else if (d.mode === 'anchor') {
      const a = s.path[d.si].anchors[d.ai];
      if (d.handle) G.setHandle(a, d.handle === 'out', p, e.altKey);
      else { const dv = [p[0] - a.p[0], p[1] - a.p[1]]; for (const k of ['p', 'in', 'out']) a[k] = [a[k][0] + dv[0], a[k][1] + dv[1]]; }
    }
    this.render();
  }
  up() {
    if (this.pen) { this.pen.dragging = false; return; }
    const d = this.drag; this.drag = null; if (!d) return;
    if (!d.moved) { this.undo.pop(); if (d.mode === 'create') { this.doc.shapes.pop(); this.sel = -1; } } // a click changed nothing
    else if (d.mode === 'create') { const L = this.shape.live; if (L.r) L.r = [Math.min(L.r[0], L.r[2]), Math.min(L.r[1], L.r[3]), Math.max(L.r[0], L.r[2]), Math.max(L.r[1], L.r[3])]; }
    this.render();
  }
  penDown(p) {
    if (!this.pen) this.pen = { anchors: [], closed: false };
    const A = this.pen.anchors;
    if (A.length >= 2 && Math.hypot(p[0] - A[0].p[0], p[1] - A[0].p[1]) < 10 * this.px) { this.pen.closed = true; return this.finishPen(); }
    A.push(G.corner(p)); this.pen.dragging = true; this.render();
  }

  // ---- view
  render() {
    if (!this.doc) return;
    const d = this.doc, k = this.px || 1;
    this.svg.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`);
    this.fit();
    this.bg.innerHTML = d.background ? `<image href="${esc(d.background)}" width="${d.w}" height="${d.h}" preserveAspectRatio="none"/>` : '';
    const parts = d.shapes.map((s, i) => shapeSvg(s, 've-g' + i));
    this.defs.innerHTML = parts.map(p => p.def).join('');
    this.art.innerHTML = parts.map(p => p.el).join('');
    let ui = '';
    const s = this.shape, dot = (x, y, attrs, r = 5) => `<rect x="${x - r * k}" y="${y - r * k}" width="${2 * r * k}" height="${2 * r * k}" ${attrs}/>`;
    for (const i of this.selection) {
      const b = shapeBounds(d.shapes[i]);
      if (b) ui += `<rect class="ve-box" x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}"/>`;
    }
    if (s && s.kind === 'path' && !this.extra.length) s.path.forEach((sp, si) => sp.anchors.forEach((a, ai) => {
      for (const h of ['in', 'out']) if (G[h === 'in' ? 'hasIn' : 'hasOut'](a)) ui += `<line class="ve-arm" x1="${a.p[0]}" y1="${a.p[1]}" x2="${a[h][0]}" y2="${a[h][1]}"/><circle class="ve-handle" cx="${a[h][0]}" cy="${a[h][1]}" r="${5 * k}" data-sp="${si}" data-anchor="${ai}" data-handle="${h}"/>`;
      ui += dot(a.p[0], a.p[1], `class="ve-anchor" data-sp="${si}" data-anchor="${ai}"`);
    }));
    if (this.pen && this.pen.anchors.length) {
      const sp = { anchors: this.pen.anchors, closed: false }, last = this.pen.anchors[this.pen.anchors.length - 1];
      ui += `<path class="ve-pen" d="${G.toSvgD([sp])}"/>`;
      if (this.pen.hover && !this.pen.dragging) ui += `<path class="ve-pen" d="M${last.p[0]} ${last.p[1]}C${last.out[0]} ${last.out[1]} ${this.pen.hover[0]} ${this.pen.hover[1]} ${this.pen.hover[0]} ${this.pen.hover[1]}"/>`;
      this.pen.anchors.forEach(a => { ui += dot(a.p[0], a.p[1], 'class="ve-anchor"', 4); });
    }
    this.ui.innerHTML = ui;
    this.ui.style.setProperty('--k', k);
    this.refreshSide();
  }
  refreshSide() {
    const P = this.panel, s = this.shape, S = this.style, v = s || S;
    P.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === this.tool));
    const set = (key, val) => { const el = P.querySelector(`[data-v=${key}]`); if (el && document.activeElement !== el) { if (el.type === 'checkbox') el.checked = val; else el.value = val; } };
    set('fill', v.fill === 'none' ? (S.fill === 'none' ? '#3fa9f5' : S.fill) : v.fill); set('nofill', v.fill === 'none');
    set('stroke', v.stroke); set('strokeWidth', v.strokeWidth); set('corner', v.corner); set('cornerKind', v.cornerKind || 'Round');
    set('sides', s && s.kind === 'polygon' ? s.live.sides : S.sides); set('points', s && s.kind === 'star' ? s.live.points : S.points); set('inner', s && s.kind === 'star' ? s.live.inner : S.inner);
    const g = s ? s.grad : (S.paint === 'solid' ? null : { kind: S.paint, angle: S.angle }), paint = g ? g.kind : 'solid';
    set('paint', paint); set('angle', g ? g.angle : S.angle);
    set('to', s && s.grad ? Grad.toHex(s.grad.stops[s.grad.stops.length - 1].color) : S.to);
    P.querySelector('.ve-grad').hidden = paint === 'solid';
    const text = s ? s.kind === 'text' : this.tool === 'text', tv = s && s.kind === 'text' ? s : S;
    P.querySelector('.ve-text').hidden = !text;
    set('text', tv.text); set('font', tv.font); set('size', tv.size);
    P.querySelector('[data-v=bold]').classList.toggle('on', !!tv.bold); P.querySelector('[data-v=italic]').classList.toggle('on', !!tv.italic);
    P.querySelector('[data-ve=add]').classList.toggle('on', this.addMode);
    const n = this.selection.length;
    P.querySelectorAll('[data-pf]').forEach(b => { b.disabled = n < 2; });
    this.info.textContent = this.note || (n > 1 ? `${n} shapes selected` : s ? `${s.kind} ${this.sel + 1} of ${this.doc.shapes.length}` : `${this.doc.shapes.length} shape${this.doc.shapes.length === 1 ? '' : 's'}`);
  }

  build() {
    const P = this.panel;
    P.innerHTML = `<div class="ie-head"><b class="ie-title"></b><span class="grow"></span>` +
      `<button data-ve="undo" title="Undo the last change">Undo</button><button data-ve="cancel">Cancel</button><button data-ve="apply" class="primary">Apply</button></div>` +
      `<div class="ie-body"><div class="ie-view"><svg class="ve-svg" xmlns="${NS}"><defs class="ve-defs"></defs><g class="ve-bg"></g><g class="ve-art"></g><g class="ve-ui"></g></svg></div><div class="ie-side">` +
      `<div class="ie-row">${TOOLS.map(([k, l]) => `<button data-tool="${k}">${l}</button>`).join('')}</div>` +
      `<div class="ie-row"><label>Fill <input type="color" data-v="fill"></label><label><input type="checkbox" data-v="nofill"> None</label>` +
      `<select data-v="paint" title="Paint"><option value="solid">Solid</option><option value="linear">Linear</option><option value="radial">Radial</option></select></div>` +
      `<div class="ie-row ve-grad"><label>To <input type="color" data-v="to"></label><label class="grow">Angle <input type="range" data-v="angle" min="-180" max="180" step="5"></label></div>` +
      `<div class="ie-row"><label>Stroke <input type="color" data-v="stroke"></label><label class="grow">Width <input type="range" data-v="strokeWidth" min="0" max="40" step="1"></label></div>` +
      `<div class="ve-text"><div class="ie-row"><input type="text" data-v="text" class="grow" placeholder="Text" aria-label="Text"></div>` +
      `<div class="ie-row"><select data-v="font" title="Font">${Object.keys(FONTS).map(f => `<option value="${f}">${f}</option>`).join('')}</select><button data-v="bold" title="Bold"><b>B</b></button><button data-v="italic" title="Italic"><i>I</i></button></div>` +
      `<label>Size <input type="range" data-v="size" min="8" max="200" step="1"></label></div>` +
      `<label>Corners <input type="range" data-v="corner" min="0" max="120" step="1"></label>` +
      `<div class="ie-row"><select data-v="cornerKind">${G.CORNER_KINDS.map(c => `<option value="${c}">${c.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>`).join('')}</select></div>` +
      `<label>Sides <input type="range" data-v="sides" min="3" max="12" step="1"></label>` +
      `<label>Points <input type="range" data-v="points" min="2" max="12" step="1"></label>` +
      `<label>Inner <input type="range" data-v="inner" min="0.1" max="0.95" step="0.05"></label>` +
      `<div class="ie-row"><b>Pathfinder</b><span class="grow"></span><button data-ve="add" title="Add to the selection (or Shift-click)">Add</button></div>` +
      `<div class="ie-row">${PATHFINDER.map(([k, l]) => `<button data-pf="${k}">${l}</button>`).join('')}</div>` +
      `<div class="ie-row">${PATHFINDER2.map(([k, l]) => `<button data-pf="${k}">${l}</button>`).join('')}</div>` +
      `<div class="ie-row"><button data-ve="up" title="Bring forward">▲</button><button data-ve="down" title="Send backward">▼</button><button data-ve="delete">Delete</button><span class="grow"></span><span class="ve-info"></span></div></div></div>`;
    this.title = P.querySelector('.ie-title'); this.info = P.querySelector('.ve-info');
    this.svg = P.querySelector('.ve-svg'); this.defs = P.querySelector('.ve-defs'); this.bg = P.querySelector('.ve-bg'); this.art = P.querySelector('.ve-art'); this.ui = P.querySelector('.ve-ui');
    P.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !this.doc) return;
      const a = b.dataset.ve;
      this.note = '';
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      else if (b.dataset.pf) this.combine(b.dataset.pf);
      else if (b.dataset.v === 'bold' || b.dataset.v === 'italic') { const s = this.shape, k = b.dataset.v; this.setProp(k, !(s && s.kind === 'text' ? s[k] : this.style[k])); }
      else if (a === 'add') { this.addMode = !this.addMode; this.render(); }
      else if (a === 'apply') this.apply(); else if (a === 'cancel') this.close(); else if (a === 'undo') this.undoLast();
      else if (a === 'up') this.order(1); else if (a === 'down') this.order(-1); else if (a === 'delete') this.remove();
    });
    const onInput = e => {
      const t = e.target, k = t.dataset.v; if (!k || !this.doc || t.tagName === 'BUTTON') return;
      if (k === 'nofill') return this.setProp('fill', t.checked ? 'none' : P.querySelector('[data-v=fill]').value);
      if (k === 'fill') { P.querySelector('[data-v=nofill]').checked = false; return this.setProp('fill', t.value); }
      this.setProp(k, t.type === 'range' ? +t.value : t.value);
    };
    P.addEventListener('input', e => { if (e.target.tagName !== 'SELECT') onInput(e); });
    P.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onInput(e); });
    const s = this.svg;
    addEventListener('resize', () => this.doc && this.render());
    s.addEventListener('pointerdown', e => this.down(e));
    s.addEventListener('pointermove', e => this.move(e));
    s.addEventListener('pointerup', () => this.up()); s.addEventListener('pointercancel', () => this.up());
  }
  /** Keys while open: Enter/Escape finish a pen path, Delete removes the selection. True if used. */
  key(e) {
    if ((e.key === 'Enter' || e.key === 'Escape') && this.pen) { this.finishPen(); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.shape && !/INPUT|SELECT/.test(document.activeElement.tagName)) { this.remove(); return true; }
    return false;
  }
}
