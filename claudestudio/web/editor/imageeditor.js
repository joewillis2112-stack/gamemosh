// The Image Editor: an image property opened flat, painted in layers.
// Opens on the selected Decal or Texture (its Texture), ImageLabel or ImageButton
// (its Image), or MeshPart (its TextureID); the image as it is becomes the
// Background layer (a new one is 512x512 and clear). Layers have opacity,
// visibility, a blend mode (web/paint/blend.js, PhotoCraft's) and an optional layer
// mask (white shows, black hides; Add Mask makes one from the selection, as
// Photoshop's Reveal Selection does); the brushes are the Paint tool's (same
// settings). On a mask, Brush and Pencil paint their colour's grey, the Eraser
// paints white. Apply writes the flattened PNG back as one undo step in the editor,
// with the layers in a private PNG chunk (web/paint/layerfile.js), so opening it again
// restores them; Cancel changes nothing. Inside the editor, Undo takes back the last
// stroke, layer, selection or size change.
// Selections (Rect, Ellipse, Lasso; All, None, Invert): a soft-edged mask that limits painting
// and Adjust, shown as marching ants. Zoom and pan: wheel zooms at the cursor, Space-drag, the
// middle button or the Hand pans; on a phone, pinch and two-finger drag; Fit and 1:1.
// Image Size resamples every layer (web/paint/resample.js, PhotoCraft's, checked against its
// Rust; masks bilinear, as PhotoCraft's Image Size); Canvas Size adds or cuts at an anchor.
// Adjust (LightCraft's develop tools, web/paint/develop.js, checked against its Rust): exposure,
// tone, white balance, colour, B&W, tone-curve regions and the colour mixer, shown live on the
// active layer while the sliders move; one undo step; baked in by the next stroke, layer change
// or Apply; Reset takes it off.
import { Stroke, image } from '../paint/brush.js';
import { BLEND_MODES } from '../paint/blend.js';
import { LayeredImage } from '../paint/layers.js';
import { resample, canvasSize, RESAMPLE } from '../paint/resample.js';
import { packLayers, unpackLayers } from '../paint/layerfile.js';
import { imageFromUrl, toPng, toBytes } from './paint.js';
import { developImage, isNeutral } from '../paint/develop.js';

const NEW_SIZE = 512, UNDO_DEPTH = 20, MAX_SIDE = 4096;
export const IMAGE_PROP = { Decal: 'Texture', Texture: 'Texture', ImageLabel: 'Image', ImageButton: 'Image', MeshPart: 'TextureID' };
const MIXER_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
// Adjust sliders: [settings path, label, min, max, step, default]. Temperature is LightCraft's
// relative scale for a rendered image (6500 K = as shot).
const ADJUST = [['light.exposure', 'Exposure', -4, 4, 0.05, 0], ['light.contrast', 'Contrast', -100, 100, 1, 0], ['light.whites', 'Whites', -100, 100, 1, 0], ['light.blacks', 'Blacks', -100, 100, 1, 0],
  ['wb.temp', 'Temp', 2000, 15000, 50, 6500], ['wb.tint', 'Tint', -100, 100, 1, 0], ['color.vibrance', 'Vibrance', -100, 100, 1, 0], ['color.saturation', 'Saturation', -100, 100, 1, 0],
  ['curve.highlights', 'Highlights', -100, 100, 1, 0], ['curve.lights', 'Lights', -100, 100, 1, 0], ['curve.darks', 'Darks', -100, 100, 1, 0], ['curve.shadows', 'Shadows', -100, 100, 1, 0]];
const ANCHORS = ['Top left', 'Top', 'Top right', 'Left', 'Centre', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];
const RESAMPLE_LABEL = { bicubic: 'Bicubic', bicubicSmoother: 'Bicubic Smoother', bicubicSharper: 'Bicubic Sharper', bilinear: 'Bilinear', nearest: 'Nearest' };
const getPath = (o, p) => p.split('.').reduce((v, k) => v && v[k], o);
const setPath = (o, p, v) => { const k = p.split('.'), last = k.pop(); let t = o; for (const x of k) t = t[x] = t[x] || {}; t[last] = v; };
const BLEND_LABEL = m => m.replace(/([a-z])([A-Z])/g, '$1 $2');
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const copyImg = i => i && { width: i.width, height: i.height, data: i.data.slice() };

export class ImageEditor {
  constructor({ dm, world, commands, settings, panel, onState = () => {} }) {
    Object.assign(this, { dm, world, commands, settings, panel, onState });
    this.doc = null; this.target = null; this.undo = []; this.stroke = null; this.adj = null; this.band = 'red';
    this.tool = 'paint'; this.sel = null; this.editMask = false; this.view = { k: 1, x: 0, y: 0 };
    this.pointers = new Map(); this.gesture = null; this.pan = null; this.marquee = null; this.space = false;
    this.build();
  }
  get active() { return !!this.doc; }
  get layer() { return this.doc && this.doc.layers[this.doc.active]; }

  /** Open on `inst` (or the selection). Returns false (and says why) if it has no image property. */
  async open(inst = this.commands.selection.primary) {
    const prop = inst && IMAGE_PROP[inst.ClassName];
    if (!prop) { this.flash('Select a Decal, ImageLabel, ImageButton or MeshPart to edit its image'); return false; }
    const url = inst.props[prop] || '';
    const saved = await unpackLayers(url); // our own PNG: its layers come back
    let doc;
    if (saved) {
      doc = new LayeredImage(saved.w, saved.h);
      doc.layers = saved.layers; doc.active = Math.min(Math.max(saved.active | 0, 0), saved.layers.length - 1);
    } else {
      let base = null;
      if (url && !/^rbxasset/.test(url)) { try { base = (await imageFromUrl(this.world.resolveUrl(url))).img; } catch { base = null; } }
      doc = new LayeredImage(base ? base.width : NEW_SIZE, base ? base.height : NEW_SIZE);
      doc.add('Background', base || image(NEW_SIZE, NEW_SIZE));
    }
    this.doc = doc; this.target = { inst, prop }; this.undo = []; this.sel = null; this.editMask = false; this.tool = 'paint';
    this.panel.hidden = false; this.title.textContent = `${inst.ClassName} ${inst.Name}: ${prop}`;
    this.resized(); this.refreshLayers(); this.refreshTools(); this.onState({ active: true });
    return true;
  }
  close() { this.bake(); this.doc = null; this.target = null; this.undo = []; this.stroke = null; this.sel = null; this.marquee = null; this.panel.hidden = true; this.onState({ active: false }); }
  /** Does the document need its layers kept (more than a plain Background)? */
  get layered() { return this.doc.layers.length > 1 || this.doc.layers.some(l => l.mask || l.opacity < 1 || l.blend !== 'Normal' || !l.visible); }
  /** Write the flattened image into the property (one undo step) and close. Layers, if there are
   *  more than a plain Background, go in the PNG too (waits for their compression). */
  async apply() {
    if (!this.doc) return null;
    this.bake();
    let png = toPng(this.doc.flatten());
    if (this.layered) png = await packLayers(png, this.doc);
    if (!this.doc) return null; // closed meanwhile
    const { inst, prop } = this.target;
    this.commands.history.run('Edit Image', tx => tx.set(inst, prop, png));
    this.close();
    return png;
  }

  // ---- drawing
  redraw(rect = [0, 0, this.doc.width, this.doc.height]) {
    const d = this.doc, [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    d.flatten(this.flat, rect);
    const sub = { width: w, height: h, data: new Float32Array(w * h * 4) };
    for (let y = 0; y < h; y++) sub.data.set(this.flat.data.subarray(((y0 + y) * d.width + x0) * 4, ((y0 + y) * d.width + x1) * 4), y * w * 4);
    const id = this.g.createImageData(w, h); id.data.set(toBytes(sub)); this.g.putImageData(id, x0, y0);
  }
  /** After the image's size changed (or on open): canvas, buffers, view. */
  resized() {
    const d = this.doc;
    this.flat = image(d.width, d.height);
    this.canvas.width = d.width; this.canvas.height = d.height;
    this.overlay.setAttribute('viewBox', `0 0 ${d.width} ${d.height}`);
    this.redraw(); this.fit(); this.drawOverlay(); this.refreshSize();
  }
  toImage(e) { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) * this.doc.width / r.width, (e.clientY - r.top) * this.doc.height / r.height]; }
  snapshot(label) { // before a change: the document as it is (images copied), for Undo
    const d = this.doc;
    this.undo.push({ label, w: d.width, h: d.height, active: d.active, editMask: this.editMask, sel: this.sel && { ...this.sel, mask: this.sel.mask.slice() },
      layers: d.layers.map(l => ({ ...l, img: copyImg(l.img), mask: copyImg(l.mask) })) });
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
  }
  undoLast() {
    const u = this.undo.pop(); if (!u) return false;
    this.adj = null; this.refreshAdjust();
    const d = this.doc, sized = u.w !== d.width || u.h !== d.height;
    d.width = u.w; d.height = u.h; d.layers = u.layers; d.active = u.active; this.editMask = u.editMask; this.sel = u.sel;
    if (sized) this.resized(); else { this.redraw(); this.drawOverlay(); }
    this.refreshLayers(); return true;
  }

  // ---- painting (into the active layer, or its mask), limited by the selection
  begin(e) {
    const l = this.layer; if (!l) return;
    this.bake();
    this.snapshot('Stroke');
    const S = this.settings, onMask = this.editMask && l.mask;
    let s = { ...S, pressureSize: e.pointerType === 'pen' };
    if (onMask) { const g = S.erase ? 1 : 0.299 * S.color[0] + 0.587 * S.color[1] + 0.114 * S.color[2]; s = { ...s, erase: false, color: [g, g, g, 1] }; }
    this.stroke = new Stroke(onMask ? l.mask : l.img, s);
    this.moveTo(e);
  }
  moveTo(e) {
    if (!this.stroke) return;
    const [x, y] = this.toImage(e);
    this.stroke.push([[x, y, e.pointerType === 'pen' ? Math.max(0.01, e.pressure) : 1]]);
    const r = this.stroke.composite(); if (r) { this.limit(this.stroke.img, this.stroke.pre, r); this.redraw(r); }
  }
  end() {
    if (!this.stroke) return;
    const st = this.stroke, r = st.finish(); this.stroke = null;
    if (r) { this.limit(st.img, st.pre, r); this.redraw(r); } else this.undo.pop(); // nothing painted: nothing to undo
  }
  /** Take a stroke back as if it never happened (a second finger came down: it's a pinch). */
  cancelStroke() {
    const st = this.stroke; if (!st) return;
    this.stroke = null; st.img.data.set(st.pre); this.undo.pop(); this.redraw();
  }
  /** Outside the selection, put `img` back as it was (`before`), in proportion to the selection's edge. */
  limit(img, before, [x0, y0, x1, y1] = [0, 0, this.doc.width, this.doc.height]) {
    if (!this.sel) return;
    const M = this.sel.mask, W = this.doc.width, D = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, m = M[i]; if (m >= 1) continue;
      for (let c = 0, o = i * 4; c < 4; c++) D[o + c] = before[o + c] + (D[o + c] - before[o + c]) * m;
    }
  }

  // ---- selections
  /** Set the selection from a shape drawn on a canvas the image's size (`draw(g)` fills it white). */
  selectShape(outline, draw) {
    const d = this.doc, c = document.createElement('canvas'); c.width = d.width; c.height = d.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; draw(g);
    const a = g.getImageData(0, 0, d.width, d.height).data, mask = new Float32Array(d.width * d.height);
    let any = false; for (let i = 0; i < mask.length; i++) { mask[i] = a[i * 4 + 3] / 255; any = any || mask[i] > 0; }
    this.snapshot('Select');
    this.sel = any ? { mask, outline } : null;
    this.drawOverlay();
  }
  selectAll() { const d = this.doc; this.snapshot('Select All'); this.sel = { mask: new Float32Array(d.width * d.height).fill(1), outline: `<rect x="0" y="0" width="${d.width}" height="${d.height}"/>` }; this.drawOverlay(); }
  deselect() { if (!this.sel) return; this.snapshot('Deselect'); this.sel = null; this.drawOverlay(); }
  invertSelection() {
    const d = this.doc; this.snapshot('Inverse');
    if (!this.sel) { this.sel = { mask: new Float32Array(d.width * d.height).fill(1), outline: `<rect x="0" y="0" width="${d.width}" height="${d.height}"/>` }; }
    else { const m = this.sel.mask.map(v => 1 - v); this.sel = { mask: m, outline: this.sel.outline + `<rect x="0" y="0" width="${d.width}" height="${d.height}"/>` }; }
    this.drawOverlay();
  }
  marqueeOutline(m) {
    const [a, b] = [m.from, m.to], x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    if (m.kind === 'rect') { const r = [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)]; return { svg: `<rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}"/>`, draw: g => g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]), size: Math.min(r[2] - r[0], r[3] - r[1]) }; }
    if (m.kind === 'ellipse') return { svg: `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`, draw: g => { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI); g.fill(); }, size: Math.min(w, h) };
    const pts = m.points; // lasso
    return { svg: `<polygon points="${pts.map(p => p.map(v => +v.toFixed(2)).join(',')).join(' ')}"/>`, draw: g => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fill('evenodd'); }, size: pts.length >= 3 ? 2 : 0 };
  }
  drawOverlay() {
    if (!this.doc) return;
    let s = this.sel ? `<g class="ie-ants">${this.sel.outline}</g><g class="ie-ants ie-ants2">${this.sel.outline}</g>` : '';
    if (this.marquee) { const o = this.marqueeOutline(this.marquee).svg; s += `<g class="ie-ants">${o}</g><g class="ie-ants ie-ants2">${o}</g>`; }
    this.overlay.innerHTML = s;
  }

  // ---- view: zoom and pan
  fit() {
    const d = this.doc, v = this.stage, cw = v.clientWidth - 24, ch = v.clientHeight - 24;
    const k = Math.max(0.01, Math.min(cw / d.width, ch / d.height));
    this.view.k = k >= 1 ? Math.floor(k) : k; // small images at whole multiples (pixel art stays sharp), large ones fitted
    this.view.x = (v.clientWidth - d.width * this.view.k) / 2; this.view.y = (v.clientHeight - d.height * this.view.k) / 2;
    this.applyView();
  }
  applyView() {
    const { k, x, y } = this.view, d = this.doc;
    for (const el of [this.canvas, this.overlay]) Object.assign(el.style, { left: x + 'px', top: y + 'px', width: d.width * k + 'px', height: d.height * k + 'px' });
    this.zoomLabel.textContent = Math.round(k * 100) + '%';
  }
  /** Zoom by `by` keeping the image point under stage point (sx, sy) where it is. */
  zoomAt(sx, sy, by) {
    const v = this.view, k = Math.min(Math.max(v.k * by, 0.05), 64), ix = (sx - v.x) / v.k, iy = (sy - v.y) / v.k;
    v.k = k; v.x = sx - ix * k; v.y = sy - iy * k; this.applyView();
  }
  setZoom(k) { const v = this.stage; this.zoomAt(v.clientWidth / 2, v.clientHeight / 2, k / this.view.k); }
  stagePoint(e) { const r = this.stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  // ---- pointers on the stage
  down(e) {
    if (!this.doc) return;
    this.stage.setPointerCapture && this.stage.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.stagePoint(e));
    if (this.pointers.size === 2) { // a second finger: pinch and two-finger pan, whatever the first one started
      this.cancelStroke(); this.marquee = null; this.pan = null; this.drawOverlay();
      const [a, b] = [...this.pointers.values()];
      this.gesture = { k: this.view.k, x: this.view.x, y: this.view.y, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
      return;
    }
    if (this.pointers.size > 2 || this.gesture) return;
    if (e.button === 1 || (e.button === 0 && (this.tool === 'hand' || this.space))) { e.preventDefault(); this.pan = { from: this.stagePoint(e), x: this.view.x, y: this.view.y }; return; }
    if (e.button !== 0) return;
    if (this.tool === 'paint') return this.begin(e);
    const p = this.toImage(e);
    this.marquee = { kind: this.tool, from: p, to: p, points: [p] };
  }
  move(e) {
    if (!this.doc) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, this.stagePoint(e));
    if (this.gesture) {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()], G = this.gesture, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = Math.min(Math.max(G.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / G.d, 0.05), 64);
      const ix = (G.mid[0] - G.x) / G.k, iy = (G.mid[1] - G.y) / G.k; // the image point that was under the fingers stays under them
      Object.assign(this.view, { k, x: mid[0] - ix * k, y: mid[1] - iy * k }); this.applyView();
      return;
    }
    if (this.pan) { const p = this.stagePoint(e); this.view.x = this.pan.x + p[0] - this.pan.from[0]; this.view.y = this.pan.y + p[1] - this.pan.from[1]; this.applyView(); return; }
    if (this.stroke) return this.moveTo(e);
    if (this.marquee) { const p = this.toImage(e); this.marquee.to = p; if (this.marquee.kind === 'lasso') this.marquee.points.push(p); this.drawOverlay(); }
  }
  up(e) {
    this.pointers.delete(e.pointerId);
    if (this.gesture) { if (!this.pointers.size) this.gesture = null; return; } // the gesture is over when every finger is up
    this.pan = null;
    if (this.stroke) return this.end();
    const m = this.marquee; this.marquee = null;
    if (m) { const o = this.marqueeOutline(m); if (o.size >= 1) this.selectShape(o.svg, o.draw); else this.deselect(); this.drawOverlay(); } // a click deselects, as in Photoshop
  }
  wheel(e) {
    if (!this.doc) return;
    e.preventDefault();
    const [sx, sy] = this.stagePoint(e);
    this.zoomAt(sx, sy, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  }

  // ---- adjust
  /** Set one develop setting (a path such as 'light.exposure') on the active layer, live; only inside the selection. */
  adjust(path, value) {
    const l = this.layer; if (!l) return;
    if (!this.adj || this.adj.layer !== l) { this.bake(); this.snapshot('Adjust'); this.adj = { layer: l, base: l.img.data.slice(), s: {} }; }
    setPath(this.adj.s, path, value);
    if (path.startsWith('wb.')) this.adj.s.wb.mode = 'custom';
    l.img.data.set(this.adj.base);
    if (!isNeutral(this.adj.s)) { developImage(l.img, this.adj.s); this.limit(l.img, this.adj.base); }
    this.redraw();
  }
  /** Keep the adjusted pixels (the sliders start again from zero). */
  bake() { if (!this.adj) return; this.adj = null; this.refreshAdjust(); }
  /** Take the adjustment off. */
  resetAdjust() {
    if (!this.adj) return;
    this.adj.layer.img.data.set(this.adj.base); this.adj = null; this.undo.pop();
    this.redraw(); this.refreshAdjust();
  }
  refreshAdjust() {
    const s = (this.adj && this.adj.s) || {};
    this.panel.querySelectorAll('[data-adj]').forEach(i => { const p = i.dataset.adj.replace('mixer.band', 'mixer.' + this.band), v = getPath(s, p); if (i.type === 'checkbox') i.checked = v === 'bw'; else i.value = v ?? (+i.dataset.def || 0); });
  }

  // ---- image size and canvas size (every layer and mask; the selection is dropped)
  imageSize(w, h, filter = 'bicubic') {
    w = Math.round(w); h = Math.round(h);
    if (!(w >= 1 && h >= 1 && w <= MAX_SIDE && h <= MAX_SIDE)) return this.flash(`Width and height go from 1 to ${MAX_SIDE}`);
    const d = this.doc; if (w === d.width && h === d.height) return;
    this.bake(); this.snapshot('Image Size');
    for (const l of d.layers) { l.img = resample(l.img, w, h, filter); if (l.mask) l.mask = resample(l.mask, w, h, 'bilinear'); }
    d.width = w; d.height = h; this.sel = null; this.resized();
  }
  canvasSize(w, h, anchor = 4) {
    w = Math.round(w); h = Math.round(h);
    if (!(w >= 1 && h >= 1 && w <= MAX_SIDE && h <= MAX_SIDE)) return this.flash(`Width and height go from 1 to ${MAX_SIDE}`);
    const d = this.doc; if (w === d.width && h === d.height) return;
    this.bake(); this.snapshot('Canvas Size');
    for (const l of d.layers) { l.img = canvasSize(l.img, w, h, anchor); if (l.mask) l.mask = canvasSize(l.mask, w, h, anchor, [1, 1, 1, 1]); } // a mask shows its new area
    d.width = w; d.height = h; this.sel = null; this.resized();
  }
  refreshSize() { const d = this.doc; this.panel.querySelector('[data-sz=w]').value = d.width; this.panel.querySelector('[data-sz=h]').value = d.height; this.sizeNote.textContent = `${d.width} × ${d.height}`; }

  // ---- layers
  layerOp(op, i = this.doc.active, value) {
    this.bake();
    const d = this.doc;
    const before = () => this.snapshot(op);
    if (op === 'add') { before(); d.add(); this.editMask = false; }
    else if (op === 'remove') { if (d.layers.length > 1) { before(); d.remove(i); this.editMask = false; } }
    else if (op === 'up' || op === 'down') { const j = i + (op === 'up' ? 1 : -1); if (j >= 0 && j < d.layers.length) { before(); d.move(i, j - i); } }
    else if (op === 'select') { d.active = i; this.editMask = false; }
    else if (op === 'mask') { // add a mask (from the selection, if any) and paint on it; or delete it
      before();
      if (d.layers[i].mask) { d.layers[i].mask = null; this.editMask = false; } else { d.addMask(i, this.sel && this.sel.mask); this.editMask = true; }
    } else if (op === 'editMask') { d.active = i; this.editMask = !!d.layers[i].mask && value; }
    else { before(); d.set(i, op, value); }
    this.redraw(); this.refreshLayers();
  }
  refreshLayers() {
    const d = this.doc;
    // Top of the stack first, as in Photoshop's Layers panel; a mask chip targets the mask.
    this.list.innerHTML = d.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) =>
      `<div class="layer${i === d.active ? ' on' : ''}" data-i="${i}"><input type="checkbox" data-op="visible" ${l.visible ? 'checked' : ''} title="Show"><span class="grow${i === d.active && !this.editMask ? ' tgt' : ''}">${escapeHtml(l.name)}</span>` +
      (l.mask ? `<button class="mask-chip${i === d.active && this.editMask ? ' on' : ''}" data-op="editMask" title="Paint on the mask">Mask</button>` : '') + `</div>`).join('');
    const l = d.layers[d.active];
    this.blendSel.value = l.blend; this.opacityIn.value = l.opacity;
    this.panel.querySelector('[data-ie=mask]').textContent = l.mask ? 'Delete Mask' : 'Add Mask';
    this.target2.textContent = this.editMask && l.mask ? `Painting on ${l.name}'s mask` : `Painting on ${l.name}`;
  }
  setTool(t) { this.tool = t; this.refreshTools(); }
  refreshTools() {
    const S = this.settings, P = this.panel;
    P.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', this.tool === 'paint' && ((b.dataset.p === 'erase' && S.erase) || (b.dataset.p === 'pencil' && S.aliased) || (b.dataset.p === 'brush' && !S.erase && !S.aliased))));
    P.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === this.tool));
    this.stage.style.cursor = this.tool === 'hand' || this.space ? 'grab' : this.tool === 'paint' ? 'default' : 'crosshair';
  }

  build() {
    const P = this.panel, S = this.settings;
    P.innerHTML = `<div class="ie-head"><b class="ie-title"></b><span class="grow"></span>` +
      `<button data-ie="undo" title="Undo the last change">Undo</button><button data-ie="cancel">Cancel</button><button data-ie="apply" class="primary">Apply</button></div>` +
      `<div class="ie-body"><div class="ie-view ie-stage"><canvas class="ie-canvas"></canvas><svg class="ie-overlay" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg></div><div class="ie-side">` +
      `<div class="ie-row"><button data-p="brush">Brush</button><button data-p="pencil">Pencil</button><button data-p="erase">Eraser</button><input type="color" data-k="color" value="${hex(S.color)}" title="Colour"></div>` +
      `<label>Size <input type="range" data-k="size" min="1" max="128" step="1" value="${S.size}"></label>` +
      `<label>Opacity <input type="range" data-k="opacity" min="0.05" max="1" step="0.05" value="${S.opacity}"></label>` +
      `<div class="ie-row"><b>Select</b><button data-t="rect" title="Rectangular selection">Rect</button><button data-t="ellipse" title="Elliptical selection">Ellipse</button><button data-t="lasso" title="Lasso: draw round it">Lasso</button></div>` +
      `<div class="ie-row"><button data-ie="all" title="Select all">All</button><button data-ie="none" title="Deselect">None</button><button data-ie="invert" title="Select the inverse">Invert</button></div>` +
      `<div class="ie-row"><b>View</b><button data-t="hand" title="Pan (or Space-drag, middle button, two fingers)">Hand</button><button data-ie="zoomout" title="Zoom out">−</button><span class="ie-zoom"></span><button data-ie="zoomin" title="Zoom in">+</button><button data-ie="fit" title="Fit the image">Fit</button><button data-ie="actual" title="Actual pixels">1:1</button></div>` +
      `<div class="ie-row"><b>Layers</b><span class="grow"></span><button data-ie="add" title="New layer">+</button><button data-ie="remove" title="Delete layer">−</button><button data-ie="up" title="Move up">▲</button><button data-ie="down" title="Move down">▼</button></div>` +
      `<div class="ie-row"><select data-ie="blend">${BLEND_MODES.map(m => `<option value="${m}">${BLEND_LABEL(m)}</option>`).join('')}</select>` +
      `<input type="range" data-ie="opacity" min="0" max="1" step="0.05" title="Layer opacity"></div><div class="ie-layers"></div>` +
      `<div class="ie-row"><button data-ie="mask" title="A layer mask (from the selection, if there is one)">Add Mask</button><span class="ie-note ie-target"></span></div>` +
      `<details class="ie-size"><summary><b>Image</b> <span class="ie-note ie-sizenote"></span></summary>` +
      `<div class="ie-row"><label>W <input type="number" data-sz="w" min="1" max="${MAX_SIDE}"></label><label>H <input type="number" data-sz="h" min="1" max="${MAX_SIDE}"></label></div>` +
      `<div class="ie-row"><select data-sz="filter" title="Resample">${RESAMPLE.map(r => `<option value="${r}">${RESAMPLE_LABEL[r]}</option>`).join('')}</select><button data-ie="resize" title="Resample every layer to this size">Image Size</button></div>` +
      `<div class="ie-row"><select data-sz="anchor" title="Anchor">${ANCHORS.map((a, i) => `<option value="${i}"${i === 4 ? ' selected' : ''}>${a}</option>`).join('')}</select><button data-ie="canvas" title="Add or cut canvas at the anchor">Canvas Size</button></div></details>` +
      `<details class="ie-adjust"><summary><b>Adjust</b> <span class="ie-note">the active layer</span></summary>` +
      ADJUST.map(([p, l, a, b, st, d]) => `<label>${l} <input type="range" data-adj="${p}" data-def="${d}" min="${a}" max="${b}" step="${st}" value="${d}"></label>`).join('') +
      `<label><input type="checkbox" data-adj="treatment"> Black &amp; white</label>` +
      `<div class="ie-row"><b>Mixer</b><select data-ie="band">${MIXER_BANDS.map(b => `<option value="${b}">${b[0].toUpperCase() + b.slice(1)}</option>`).join('')}</select></div>` +
      ['hue', 'sat', 'lum'].map(k => `<label>${{ hue: 'Hue', sat: 'Sat', lum: 'Lum' }[k]} <input type="range" data-adj="mixer.band.${k}" data-def="0" min="-100" max="100" step="1" value="0"></label>`).join('') +
      `<div class="ie-row"><button data-ie="reset" title="Take the adjustment off">Reset</button></div></details></div></div>`;
    this.title = P.querySelector('.ie-title');
    this.stage = P.querySelector('.ie-stage'); this.overlay = P.querySelector('.ie-overlay');
    this.canvas = P.querySelector('.ie-canvas'); this.g = this.canvas.getContext('2d');
    this.list = P.querySelector('.ie-layers'); this.blendSel = P.querySelector('[data-ie=blend]'); this.opacityIn = P.querySelector('[data-ie=opacity]');
    this.zoomLabel = P.querySelector('.ie-zoom'); this.target2 = P.querySelector('.ie-target'); this.sizeNote = P.querySelector('.ie-sizenote');
    P.addEventListener('click', e => {
      if (!this.doc) return;
      const b = e.target.closest('button'), row = e.target.closest('.layer');
      if (row && b && b.dataset.op === 'editMask') return this.layerOp('editMask', +row.dataset.i, !(this.editMask && this.doc.active === +row.dataset.i));
      if (row && !e.target.dataset.op) return this.layerOp('select', +row.dataset.i);
      if (!b) return;
      const a = b.dataset.ie, p = b.dataset.p, v = this.stage;
      if (a === 'apply') this.apply(); else if (a === 'cancel') this.close(); else if (a === 'undo') this.undoLast(); else if (a === 'reset') this.resetAdjust();
      else if (a === 'add' || a === 'remove' || a === 'up' || a === 'down' || a === 'mask') this.layerOp(a);
      else if (a === 'all') this.selectAll(); else if (a === 'none') this.deselect(); else if (a === 'invert') this.invertSelection();
      else if (a === 'zoomin' || a === 'zoomout') this.zoomAt(v.clientWidth / 2, v.clientHeight / 2, a === 'zoomin' ? 2 : 0.5);
      else if (a === 'fit') this.fit(); else if (a === 'actual') this.setZoom(1);
      else if (a === 'resize' || a === 'canvas') {
        const q = k => P.querySelector(`[data-sz=${k}]`).value, w = +q('w'), h = +q('h');
        if (a === 'resize') this.imageSize(w, h, q('filter')); else this.canvasSize(w, h, +q('anchor'));
        this.refreshLayers();
      }
      else if (b.dataset.t) this.setTool(b.dataset.t);
      else if (p) { S.erase = p === 'erase'; S.aliased = p === 'pencil'; this.setTool('paint'); }
    });
    P.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k === 'color') S.color = [...unhex(t.value), 1];
      else if (t.dataset.k) S[t.dataset.k] = +t.value;
      else if (t.dataset.ie === 'opacity') this.layerOp('opacity', this.doc.active, +t.value);
      else if (t.dataset.adj && t.type === 'range') this.adjust(t.dataset.adj.replace('mixer.band', 'mixer.' + this.band), +t.value);
    });
    P.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.ie === 'blend') this.layerOp('blend', this.doc.active, t.value);
      else if (t.dataset.ie === 'band') { this.band = t.value; this.refreshAdjust(); }
      else if (t.dataset.adj === 'treatment') this.adjust('treatment', t.checked ? 'bw' : 'color');
      else if (t.dataset.op === 'visible') this.layerOp('visible', +t.closest('.layer').dataset.i, t.checked);
    });
    const s = this.stage;
    s.addEventListener('pointerdown', e => this.down(e));
    s.addEventListener('pointermove', e => this.move(e));
    s.addEventListener('pointerup', e => this.up(e)); s.addEventListener('pointercancel', e => this.up(e));
    s.addEventListener('wheel', e => this.wheel(e), { passive: false });
    addEventListener('resize', () => this.doc && this.fit());
    addEventListener('keyup', e => { if (e.key === ' ' && this.space) { this.space = false; if (this.doc) this.refreshTools(); } });
  }
  /** Keys while open: Space (held) pans, Escape or Ctrl+D deselects, Ctrl+A selects all, Ctrl+Shift+I inverts. True if used. */
  key(e) {
    const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === ' ') { // held: pan. A focused button would take the Space as a click when it's let go.
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
      if (!this.space) { this.space = true; this.refreshTools(); }
      return true;
    }
    if (e.key === 'Escape' || (c && k === 'd')) { this.deselect(); return true; }
    if (c && k === 'a') { this.selectAll(); return true; }
    if (c && e.shiftKey && k === 'i') { this.invertSelection(); return true; }
    return false;
  }
  flash(text) { this.onState({ active: this.active, message: text }); }
}
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
