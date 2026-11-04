// The Vector Editor: shapes and pen paths for HUD art, icons and logos, written into an image
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
// The view is an <svg> of the document itself, so what's shown is what's written. Apply is one
// undo step in the editor; inside, Undo takes back the last change.
import * as G from '../vector/geom.js';
import { IMAGE_PROP } from './imageeditor.js';

const NEW_SIZE = 512, UNDO_DEPTH = 50, META = 'claudestudio-vector';
const TOOLS = [['select', 'Select'], ['rect', 'Rect'], ['ellipse', 'Ellipse'], ['polygon', 'Polygon'], ['star', 'Star'], ['pen', 'Pen']];
const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unesc = s => s.replace(/&(amp|lt|gt|quot);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[k]);
const b64 = s => btoa(unescape(encodeURIComponent(s))), unb64 = s => decodeURIComponent(escape(atob(s)));

/** A shape's outline: its generator's anchors, then its Live Corners. */
export function shapePath(s) {
  const L = s.live || {};
  const base = s.kind === 'rect' ? G.rectangle(L.r) : s.kind === 'ellipse' ? G.ellipse(L.r)
    : s.kind === 'polygon' ? G.polygon(L.c, L.radius, L.sides) : s.kind === 'star' ? G.star(L.c, L.radius, L.radius * L.inner, L.points) : s.path;
  if (!(s.corner > 0)) return base;
  const n = base.reduce((t, sp) => t + sp.anchors.length, 0);
  return G.cutCorners(base, Array(n).fill(s.corner), Array(n).fill(s.cornerKind || 'Round')).path;
}
/** The document as SVG text, carrying itself in <metadata> so it opens again as shapes. */
export function toSvg(doc) {
  const body = doc.shapes.map(s => `<path d="${G.toSvgD(shapePath(s))}" fill="${s.fill}" fill-rule="nonzero" stroke="${s.strokeWidth > 0 ? s.stroke : 'none'}" stroke-width="${s.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const bg = doc.background ? `<image href="${esc(doc.background)}" width="${doc.w}" height="${doc.h}" preserveAspectRatio="none"/>` : '';
  return `<svg xmlns="${NS}" width="${doc.w}" height="${doc.h}" viewBox="0 0 ${doc.w} ${doc.h}"><metadata id="${META}">${esc(JSON.stringify(doc))}</metadata>${bg}${body}</svg>`;
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
    this.doc = null; this.sel = -1; this.tool = 'select'; this.undo = []; this.drag = null; this.pen = null;
    this.style = { fill: '#3fa9f5', stroke: '#1b1b1f', strokeWidth: 0, corner: 0, cornerKind: 'Round', sides: 6, points: 5, inner: 0.5 };
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
    this.doc = doc; this.target = { inst, prop }; this.sel = -1; this.undo = []; this.pen = null;
    this.title.textContent = `${inst.ClassName} ${inst.Name}: ${prop}`;
    this.panel.hidden = false; this.setTool('select'); this.render(); this.onState({ active: true }); // render twice: the first fits the view, the second scales the handles to it
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
  snapshot() { this.undo.push(JSON.stringify({ doc: this.doc, sel: this.sel })); if (this.undo.length > UNDO_DEPTH) this.undo.shift(); }
  undoLast() {
    if (this.pen) { this.pen = null; this.render(); return true; }
    const u = this.undo.pop(); if (!u) return false;
    const s = JSON.parse(u); this.doc = s.doc; this.sel = s.sel; this.render(); return true;
  }
  get shape() { return this.doc && this.doc.shapes[this.sel]; }
  newShape(kind, live, path = null) {
    const S = this.style;
    const s = { kind, live, path, fill: S.fill, stroke: S.stroke, strokeWidth: S.strokeWidth, corner: S.corner, cornerKind: S.cornerKind };
    this.doc.shapes.push(s); this.sel = this.doc.shapes.length - 1;
    return s;
  }
  /** Set a property of the selected shape (or, with none, of the next one drawn). */
  setProp(k, v) {
    this.style[k] = v;
    const s = this.shape; if (!s) return this.render();
    this.snapshot();
    if (k === 'sides' && s.kind === 'polygon') s.live.sides = v;
    else if ((k === 'points' || k === 'inner') && s.kind === 'star') s.live[k] = v;
    else if (k in s) s[k] = v;
    this.render();
  }
  order(by) {
    const S = this.doc.shapes, j = this.sel + by; if (!this.shape || j < 0 || j >= S.length) return;
    this.snapshot(); [S[this.sel], S[j]] = [S[j], S[this.sel]]; this.sel = j; this.render();
  }
  remove() { if (!this.shape) return; this.snapshot(); this.doc.shapes.splice(this.sel, 1); this.sel = -1; this.render(); }
  setTool(t) { this.finishPen(); this.tool = t; if (t !== 'select') this.sel = -1; this.render(); }
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
  hit(p) { // the topmost shape under p (its fill, or its stroke widened to a finger's width)
    const els = [...this.art.children], pt = new DOMPoint(p[0], p[1]);
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i], s = this.doc.shapes[i], sw = el.getAttribute('stroke-width'), stroke = el.getAttribute('stroke');
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
    if (this.tool === 'select') {
      if (h.anchor !== undefined) { this.snapshot(); this.drag = { mode: 'anchor', si: +h.sp, ai: +h.anchor, handle: h.handle || null, from: p, moved: false }; return; }
      const i = this.hit(p); this.sel = i;
      if (i >= 0) { this.snapshot(); this.drag = { mode: 'move', from: p, last: p, moved: false }; }
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
      if (s.live && s.live.r) s.live.r = [s.live.r[0] + dv[0], s.live.r[1] + dv[1], s.live.r[2] + dv[0], s.live.r[3] + dv[1]];
      else if (s.live) s.live.c = [s.live.c[0] + dv[0], s.live.c[1] + dv[1]];
      else G.translate(s.path, dv);
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
    this.art.innerHTML = d.shapes.map(s => `<path d="${G.toSvgD(shapePath(s))}" fill="${s.fill}" stroke="${s.strokeWidth > 0 ? s.stroke : 'none'}" stroke-width="${s.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    let ui = '';
    const s = this.shape, dot = (x, y, attrs, r = 5) => `<rect x="${x - r * k}" y="${y - r * k}" width="${2 * r * k}" height="${2 * r * k}" ${attrs}/>`;
    if (s) {
      const b = G.bounds(shapePath(s));
      if (b) ui += `<rect class="ve-box" x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}"/>`;
      if (s.kind === 'path') s.path.forEach((sp, si) => sp.anchors.forEach((a, ai) => {
        for (const h of ['in', 'out']) if (G[h === 'in' ? 'hasIn' : 'hasOut'](a)) ui += `<line class="ve-arm" x1="${a.p[0]}" y1="${a.p[1]}" x2="${a[h][0]}" y2="${a[h][1]}"/><circle class="ve-handle" cx="${a[h][0]}" cy="${a[h][1]}" r="${5 * k}" data-sp="${si}" data-anchor="${ai}" data-handle="${h}"/>`;
        ui += dot(a.p[0], a.p[1], `class="ve-anchor" data-sp="${si}" data-anchor="${ai}"`);
      }));
    }
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
    this.info.textContent = s ? `${s.kind} ${this.sel + 1} of ${this.doc.shapes.length}` : `${this.doc.shapes.length} shape${this.doc.shapes.length === 1 ? '' : 's'}`;
  }

  build() {
    const P = this.panel;
    P.innerHTML = `<div class="ie-head"><b class="ie-title"></b><span class="grow"></span>` +
      `<button data-ve="undo" title="Undo the last change">Undo</button><button data-ve="cancel">Cancel</button><button data-ve="apply" class="primary">Apply</button></div>` +
      `<div class="ie-body"><div class="ie-view"><svg class="ve-svg" xmlns="${NS}"><g class="ve-bg"></g><g class="ve-art"></g><g class="ve-ui"></g></svg></div><div class="ie-side">` +
      `<div class="ie-row">${TOOLS.map(([k, l]) => `<button data-tool="${k}">${l}</button>`).join('')}</div>` +
      `<div class="ie-row"><label>Fill <input type="color" data-v="fill"></label><label><input type="checkbox" data-v="nofill"> None</label></div>` +
      `<div class="ie-row"><label>Stroke <input type="color" data-v="stroke"></label><label class="grow">Width <input type="range" data-v="strokeWidth" min="0" max="40" step="1"></label></div>` +
      `<label>Corners <input type="range" data-v="corner" min="0" max="120" step="1"></label>` +
      `<div class="ie-row"><select data-v="cornerKind">${G.CORNER_KINDS.map(c => `<option value="${c}">${c.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>`).join('')}</select></div>` +
      `<label>Sides <input type="range" data-v="sides" min="3" max="12" step="1"></label>` +
      `<label>Points <input type="range" data-v="points" min="2" max="12" step="1"></label>` +
      `<label>Inner <input type="range" data-v="inner" min="0.1" max="0.95" step="0.05"></label>` +
      `<div class="ie-row"><button data-ve="up" title="Bring forward">▲</button><button data-ve="down" title="Send backward">▼</button><button data-ve="delete">Delete</button><span class="grow"></span><span class="ve-info"></span></div></div></div>`;
    this.title = P.querySelector('.ie-title'); this.info = P.querySelector('.ve-info');
    this.svg = P.querySelector('.ve-svg'); this.bg = P.querySelector('.ve-bg'); this.art = P.querySelector('.ve-art'); this.ui = P.querySelector('.ve-ui');
    P.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.ve;
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      else if (a === 'apply') this.apply(); else if (a === 'cancel') this.close(); else if (a === 'undo') this.undoLast();
      else if (a === 'up') this.order(1); else if (a === 'down') this.order(-1); else if (a === 'delete') this.remove();
    });
    const onInput = e => {
      const t = e.target, k = t.dataset.v; if (!k || !this.doc) return;
      if (k === 'nofill') return this.setProp('fill', t.checked ? 'none' : P.querySelector('[data-v=fill]').value);
      if (k === 'fill') { P.querySelector('[data-v=nofill]').checked = false; return this.setProp('fill', t.value); }
      this.setProp(k, t.type === 'range' ? +t.value : t.value);
    };
    P.addEventListener('input', onInput); P.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onInput(e); });
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
