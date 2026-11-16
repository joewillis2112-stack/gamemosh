// The Image Editor: an image property opened flat, painted in layers.
// Opens on the selected Decal or Texture (its Texture), ImageLabel or ImageButton
// (its Image), or MeshPart (its TextureID); the image as it is becomes the
// Background layer (a new one is 512x512 and clear). Layers have opacity,
// visibility and a blend mode (web/paint/blend.js, PhotoCraft's); the brushes
// are the Paint tool's (same settings). Apply writes the flattened PNG back as
// one undo step in the editor; Cancel changes nothing. Inside the editor, Undo
// takes back the last stroke or layer change. Layers aren't kept after Apply
// (the property holds one image).
// Adjust (LightCraft's develop tools, web/paint/develop.js, checked against its Rust): exposure,
// tone, Highlights/Shadows, white balance, colour, Clarity, Dehaze, tone-curve regions and point
// curves, B&W, the colour mixer and the colour grading wheels, shown live on the active layer while
// the controls move; one undo step; baked in by the next stroke, layer change or Apply; Reset takes it off.
import { Stroke, image } from '../paint/brush.js';
import { BLEND_MODES } from '../paint/blend.js';
import { LayeredImage } from '../paint/layers.js';
import { imageFromUrl, toPng, toBytes } from './paint.js';
import { developImage, isNeutral, curveFunction } from '../paint/develop.js';

const NEW_SIZE = 512, UNDO_DEPTH = 20;
export const IMAGE_PROP = { Decal: 'Texture', Texture: 'Texture', ImageLabel: 'Image', ImageButton: 'Image', MeshPart: 'TextureID' };
const MIXER_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
// Adjust sliders by group: [settings path, label, min, max, step, default]. Temperature is
// LightCraft's relative scale for a rendered image (6500 K = as shot).
const S100 = [-100, 100, 1, 0];
const ADJUST = {
  light: [['light.exposure', 'Exposure', -4, 4, 0.05, 0], ['light.contrast', 'Contrast', ...S100], ['light.highlights', 'Highlights', ...S100], ['light.shadows', 'Shadows', ...S100], ['light.whites', 'Whites', ...S100], ['light.blacks', 'Blacks', ...S100]],
  colour: [['wb.temp', 'Temp', 2000, 15000, 50, 6500], ['wb.tint', 'Tint', ...S100], ['color.vibrance', 'Vibrance', ...S100], ['color.saturation', 'Saturation', ...S100]],
  presence: [['effects.clarity', 'Clarity', ...S100], ['effects.dehaze', 'Dehaze', ...S100]],
  curve: [['curve.highlights', 'Highlights', ...S100], ['curve.lights', 'Lights', ...S100], ['curve.darks', 'Darks', ...S100], ['curve.shadows', 'Shadows', ...S100]],
  grading: [['grading.wheel.lum', 'Lum', ...S100], ['grading.blending', 'Blending', 0, 100, 1, 50], ['grading.balance', 'Balance', ...S100]],
};
const WHEELS = ['shadows', 'midtones', 'highlights', 'global'], CURVES = ['master', 'red', 'green', 'blue'];
const CURVE_INSET = 8; // canvas px round the curve's square, so its end points show whole
const IDENTITY = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
const hsv = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0); }; return [f(5), f(3), f(1)]; };
const getPath = (o, p) => p.split('.').reduce((v, k) => v && v[k], o);
const setPath = (o, p, v) => { const k = p.split('.'), last = k.pop(); let t = o; for (const x of k) t = t[x] = t[x] || {}; t[last] = v; };
const BLEND_LABEL = m => m.replace(/([a-z])([A-Z])/g, '$1 $2');
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export class ImageEditor {
  constructor({ dm, world, commands, settings, panel, onState = () => {} }) {
    Object.assign(this, { dm, world, commands, settings, panel, onState });
    this.doc = null; this.target = null; this.undo = []; this.stroke = null; this.adj = null; this.band = 'red';
    this.build();
  }
  get active() { return !!this.doc; }

  /** Open on `inst` (or the selection). Returns false (and says why) if it has no image property. */
  async open(inst = this.commands.selection.primary) {
    const prop = inst && IMAGE_PROP[inst.ClassName];
    if (!prop) { this.flash('Select a Decal, ImageLabel, ImageButton or MeshPart to edit its image'); return false; }
    const url = inst.props[prop] || '';
    let base = null;
    if (url && !/^rbxasset/.test(url)) { try { base = (await imageFromUrl(this.world.resolveUrl(url))).img; } catch { base = null; } }
    const doc = new LayeredImage(base ? base.width : NEW_SIZE, base ? base.height : NEW_SIZE);
    doc.add('Background', base || image(NEW_SIZE, NEW_SIZE));
    this.doc = doc; this.target = { inst, prop }; this.undo = [];
    this.flat = image(doc.width, doc.height);
    this.canvas.width = doc.width; this.canvas.height = doc.height;
    this.panel.hidden = false; this.title.textContent = `${inst.ClassName} ${inst.Name}: ${prop}`;
    this.redraw(); this.refreshLayers(); this.onState({ active: true });
    return true;
  }
  close() { this.bake(); this.doc = null; this.target = null; this.undo = []; this.stroke = null; this.panel.hidden = true; this.onState({ active: false }); }
  /** Write the flattened image into the property (one undo step) and close. */
  apply() {
    if (!this.doc) return null;
    this.bake();
    const png = toPng(this.doc.flatten()), { inst, prop } = this.target;
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
  toImage(e) { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) * this.doc.width / r.width, (e.clientY - r.top) * this.doc.height / r.height]; }
  snapshot(label) { // before a change: the layers as they are (images copied), for Undo
    this.undo.push({ label, active: this.doc.active, layers: this.doc.layers.map(l => ({ ...l, img: { ...l.img, data: l.img.data.slice() } })) });
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
  }
  undoLast() {
    const u = this.undo.pop(); if (!u) return false;
    this.adj = null; this.refreshAdjust();
    this.doc.layers = u.layers; this.doc.active = u.active;
    this.redraw(); this.refreshLayers(); return true;
  }
  begin(e) {
    const l = this.doc.layers[this.doc.active]; if (!l) return;
    this.bake();
    this.snapshot('Stroke');
    this.stroke = new Stroke(l.img, { ...this.settings, pressureSize: e.pointerType === 'pen' });
    this.moveTo(e);
  }
  moveTo(e) {
    if (!this.stroke) return;
    const [x, y] = this.toImage(e);
    this.stroke.push([[x, y, e.pointerType === 'pen' ? Math.max(0.01, e.pressure) : 1]]);
    const r = this.stroke.composite(); if (r) this.redraw(r);
  }
  end() {
    if (!this.stroke) return;
    const r = this.stroke.finish(); this.stroke = null;
    if (r) this.redraw(r); else this.undo.pop(); // nothing painted: nothing to undo
  }

  // ---- adjust
  /** Set one develop setting (a path such as 'light.exposure') on the active layer, live. */
  // `path` may be an object of path → value, set together (a wheel's hue and amount).
  adjust(path, value) {
    const l = this.doc.layers[this.doc.active]; if (!l) return;
    // New adjustments render with LightCraft's current process (2), as its new edits do.
    if (!this.adj || this.adj.layer !== l) { this.bake(); this.snapshot('Adjust'); this.adj = { layer: l, base: l.img.data.slice(), s: { process: 2 }, cache: {} }; }
    for (const [p, v] of Object.entries(typeof path === 'string' ? { [path]: value } : path)) {
      setPath(this.adj.s, p, v);
      if (p.startsWith('wb.')) this.adj.s.wb.mode = 'custom';
    }
    l.img.data.set(this.adj.base);
    // The planes (Highlights/Shadows, Clarity, Dehaze) are kept while the layer's pixels don't change.
    if (!isNeutral(this.adj.s)) developImage(l.img, this.adj.s, this.adj.cache);
    this.redraw(); this.drawCurve(); this.drawWheel();
  }
  /** The develop settings the active adjustment has (a copy), or null. */
  get adjustment() { return this.adj ? JSON.parse(JSON.stringify(this.adj.s)) : null; }
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
    this.panel.querySelectorAll('[data-adj]').forEach(i => { const v = getPath(s, this.adjPath(i.dataset.adj)); if (i.type === 'checkbox') i.checked = v === 'bw'; else i.value = v ?? (+i.dataset.def || 0); });
    this.drawCurve(); this.drawWheel();
  }
  adjPath(p) { return p.replace('mixer.band', 'mixer.' + this.band).replace('grading.wheel', 'grading.' + this.wheel); }

  // ---- the point curve (Lightroom's Tone Curve, point mode): tap or drag on the curve's square to
  // add a point and move it; drag a point off the square (up or down) or double-click it to remove it.
  // The end points move up and down only. Per channel: Master, Red, Green, Blue.
  curvePoints() { const p = this.adj && getPath(this.adj.s, 'curve.' + this.curveCh); return p && p.length ? p.map(q => ({ ...q })) : IDENTITY.map(q => ({ ...q })); }
  drawCurve() {
    const c = this.curveCanvas; if (!c) return;
    const g = c.getContext('2d'), M = CURVE_INSET, W = c.width - 2 * M, H = c.height - 2 * M, pts = this.curvePoints(), fn = curveFunction(pts);
    const X = x => M + x * W, Y = y => M + (1 - y) * H;
    g.fillStyle = '#26282d'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#1b1c1f'; g.fillRect(M, M, W, H);
    g.strokeStyle = '#33363c'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(X(i / 4), Y(0)); g.lineTo(X(i / 4), Y(1)); g.moveTo(X(0), Y(i / 4)); g.lineTo(X(1), Y(i / 4)); g.stroke(); }
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke();
    g.strokeStyle = { master: '#e8e8e8', red: '#ff5a5a', green: '#5ad65a', blue: '#5a8cff' }[this.curveCh]; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= W; i++) { const y = Math.min(Math.max(fn(i / W), 0), 1); i ? g.lineTo(X(i / W), Y(y)) : g.moveTo(X(0), Y(y)); }
    g.stroke();
    g.fillStyle = '#fff';
    for (const p of pts) { g.beginPath(); g.arc(X(p.x), Y(p.y), 5, 0, 2 * Math.PI); g.fill(); }
  }
  curveAt(e) { // in curve units (0..1 inside the inset square); size: the square's CSS width
    const c = this.curveCanvas, r = c.getBoundingClientRect(), k = c.width / r.width, M = CURVE_INSET, W = c.width - 2 * M;
    return { x: ((e.clientX - r.left) * k - M) / W, y: 1 - ((e.clientY - r.top) * k - M) / W, size: r.width * W / c.width };
  }
  curveDown(e) {
    if (!this.doc) return;
    const q = this.curveAt(e), pts = this.curvePoints(), grab = Math.max(16, q.size * 0.07) / q.size; // in curve units
    let i = pts.findIndex(p => Math.hypot(p.x - q.x, p.y - q.y) <= grab);
    if (i < 0) { // a new point, where the pointer is (between its neighbours)
      if (q.x <= 0.01 || q.x >= 0.99) return;
      pts.push({ x: q.x, y: Math.min(Math.max(q.y, 0), 1) }); pts.sort((a, b) => a.x - b.x); i = pts.findIndex(p => p.x === q.x);
    }
    this.curveDrag = { i, pts };
    this.curveCanvas.setPointerCapture && this.curveCanvas.setPointerCapture(e.pointerId);
    this.curveMove(e);
  }
  curveMove(e) {
    const d = this.curveDrag; if (!d) return;
    const q = this.curveAt(e), { pts, i } = d, end = i === 0 || i === pts.length - 1;
    const x = end ? pts[i].x : Math.min(Math.max(q.x, pts[i - 1].x + 0.01), pts[i + 1].x - 0.01);
    d.off = !end && (q.y > 1.15 || q.y < -0.15); // dragged off the square: removed on release
    pts[i] = { x, y: Math.min(Math.max(q.y, 0), 1) };
    this.adjust('curve.' + this.curveCh, d.off ? pts.filter((_, k) => k !== i) : pts.map(p => ({ ...p })));
  }
  curveUp() { this.curveDrag = null; }
  curveRemoveAt(e) { // double-click
    const q = this.curveAt(e), pts = this.curvePoints(), grab = Math.max(16, q.size * 0.07) / q.size;
    const i = pts.findIndex(p => Math.hypot(p.x - q.x, p.y - q.y) <= grab);
    if (i > 0 && i < pts.length - 1) this.adjust('curve.' + this.curveCh, pts.filter((_, k) => k !== i));
  }

  // ---- the colour grading wheels (Lightroom's Color Grading): pick Shadows, Midtones, Highlights or
  // Global; the angle on the wheel is the hue (red to the right, hues counter-clockwise as on a
  // colour wheel) and the distance from the centre the amount. Double-click puts it back to the centre.
  drawWheel() {
    const c = this.wheelCanvas; if (!c) return;
    const g = c.getContext('2d'), N = c.width, R = N / 2;
    if (!this.wheelImg) {
      const id = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - R, dy = R - (y + 0.5), r = Math.hypot(dx, dy) / (R - 2), o = (y * N + x) * 4;
        if (r > 1) continue;
        const col = hsv((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, r * 0.75, 0.82);
        id.data.set([...col.map(v => v * 255), 255], o);
      }
      this.wheelImg = id;
    }
    g.putImageData(this.wheelImg, 0, 0);
    const w = (this.adj && getPath(this.adj.s, 'grading.' + this.wheel)) || {}, a = (w.hue || 0) * Math.PI / 180, r = (w.sat || 0) / 100 * (R - 2);
    g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(R + r * Math.cos(a), R - r * Math.sin(a), 6, 0, 2 * Math.PI); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(R + r * Math.cos(a), R - r * Math.sin(a), 7.5, 0, 2 * Math.PI); g.stroke();
  }
  wheelMove(e) {
    if (!this.doc || !this.wheelDrag) return;
    const rc = this.wheelCanvas.getBoundingClientRect(), R = rc.width / 2, dx = e.clientX - rc.left - R, dy = R - (e.clientY - rc.top);
    const hue = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360), sat = Math.round(Math.min(Math.hypot(dx, dy) / (R * (1 - 2 / (this.wheelCanvas.width / 2))), 1) * 100);
    this.adjust({ [`grading.${this.wheel}.hue`]: hue, [`grading.${this.wheel}.sat`]: sat });
  }

  // ---- layers
  layerOp(op, i = this.doc.active, value) {
    this.bake();
    const d = this.doc;
    const before = () => this.snapshot(op);
    if (op === 'add') { before(); d.add(); }
    else if (op === 'remove') { if (d.layers.length > 1) { before(); d.remove(i); } }
    else if (op === 'up' || op === 'down') { const j = i + (op === 'up' ? 1 : -1); if (j >= 0 && j < d.layers.length) { before(); d.move(i, j - i); } }
    else if (op === 'select') d.active = i;
    else { before(); d.set(i, op, value); }
    this.redraw(); this.refreshLayers();
  }
  refreshLayers() {
    const d = this.doc;
    // Top of the stack first, as in Photoshop's Layers panel.
    this.list.innerHTML = d.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) =>
      `<div class="layer${i === d.active ? ' on' : ''}" data-i="${i}"><input type="checkbox" data-op="visible" ${l.visible ? 'checked' : ''} title="Show"><span>${escapeHtml(l.name)}</span></div>`).join('');
    const l = d.layers[d.active];
    this.blendSel.value = l.blend; this.opacityIn.value = l.opacity;
  }

  build() {
    const P = this.panel, S = this.settings;
    const cap = s => s[0].toUpperCase() + s.slice(1);
    const sliders = list => list.map(([p, l, a, b, st, d]) => `<label>${l} <input type="range" data-adj="${p}" data-def="${d}" min="${a}" max="${b}" step="${st}" value="${d}"></label>`).join('');
    this.curveCh = 'master'; this.wheel = 'shadows';
    P.innerHTML = `<div class="ie-head"><b class="ie-title"></b><span class="grow"></span>` +
      `<button data-ie="undo" title="Undo the last stroke or layer change">Undo</button><button data-ie="cancel">Cancel</button><button data-ie="apply" class="primary">Apply</button></div>` +
      `<div class="ie-body"><div class="ie-view"><canvas class="ie-canvas"></canvas></div><div class="ie-side">` +
      `<div class="ie-row"><button data-p="brush">Brush</button><button data-p="pencil">Pencil</button><button data-p="erase">Eraser</button><input type="color" data-k="color" value="${hex(S.color)}" title="Colour"></div>` +
      `<label>Size <input type="range" data-k="size" min="1" max="128" step="1" value="${S.size}"></label>` +
      `<label>Opacity <input type="range" data-k="opacity" min="0.05" max="1" step="0.05" value="${S.opacity}"></label>` +
      `<div class="ie-row"><b>Layers</b><span class="grow"></span><button data-ie="add" title="New layer">+</button><button data-ie="remove" title="Delete layer">−</button><button data-ie="up" title="Move up">▲</button><button data-ie="down" title="Move down">▼</button></div>` +
      `<div class="ie-row"><select data-ie="blend">${BLEND_MODES.map(m => `<option value="${m}">${BLEND_LABEL(m)}</option>`).join('')}</select>` +
      `<input type="range" data-ie="opacity" min="0" max="1" step="0.05" title="Layer opacity"></div><div class="ie-layers"></div>` +
      `<details class="ie-adjust"><summary><b>Adjust</b> <span class="ie-note">the active layer</span></summary>` +
      sliders(ADJUST.light) + sliders(ADJUST.colour) + `<div class="ie-sub">Presence</div>` + sliders(ADJUST.presence) +
      `<div class="ie-sub">Tone curve</div>` + sliders(ADJUST.curve) +
      `<div class="ie-row"><select data-ie="curve" title="Point curve channel">${CURVES.map(c => `<option value="${c}">${cap(c)}</option>`).join('')}</select><span class="ie-note">drag to add or move points; off the square removes</span></div>` +
      `<canvas class="ie-curve" width="240" height="240"></canvas>` +
      `<label><input type="checkbox" data-adj="treatment"> Black &amp; white</label>` +
      `<div class="ie-row"><b>Mixer</b><select data-ie="band">${MIXER_BANDS.map(b => `<option value="${b}">${cap(b)}</option>`).join('')}</select></div>` +
      ['hue', 'sat', 'lum'].map(k => `<label>${{ hue: 'Hue', sat: 'Sat', lum: 'Lum' }[k]} <input type="range" data-adj="mixer.band.${k}" data-def="0" min="-100" max="100" step="1" value="0"></label>`).join('') +
      `<div class="ie-row"><b>Color grading</b><select data-ie="wheel">${WHEELS.map(w => `<option value="${w}">${cap(w)}</option>`).join('')}</select></div>` +
      `<canvas class="ie-wheel" width="180" height="180" title="Hue round the wheel, amount out from the centre"></canvas>` + sliders(ADJUST.grading) +
      `<div class="ie-row"><button data-ie="reset" title="Take the adjustment off">Reset</button></div></details></div></div>`;
    this.title = P.querySelector('.ie-title');
    this.canvas = P.querySelector('.ie-canvas'); this.g = this.canvas.getContext('2d');
    this.list = P.querySelector('.ie-layers'); this.blendSel = P.querySelector('[data-ie=blend]'); this.opacityIn = P.querySelector('[data-ie=opacity]');
    const tools = () => P.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', (b.dataset.p === 'erase' && S.erase) || (b.dataset.p === 'pencil' && S.aliased) || (b.dataset.p === 'brush' && !S.erase && !S.aliased)));
    tools();
    P.addEventListener('click', e => {
      const b = e.target.closest('button'), row = e.target.closest('.layer');
      if (row && !e.target.dataset.op) return this.layerOp('select', +row.dataset.i);
      if (!b) return;
      const a = b.dataset.ie, p = b.dataset.p;
      if (a === 'apply') this.apply(); else if (a === 'cancel') this.close(); else if (a === 'undo') this.undoLast(); else if (a === 'reset') this.resetAdjust();
      else if (a === 'add' || a === 'remove' || a === 'up' || a === 'down') this.layerOp(a);
      else if (p) { S.erase = p === 'erase'; S.aliased = p === 'pencil'; tools(); }
    });
    P.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k === 'color') S.color = [...unhex(t.value), 1];
      else if (t.dataset.k) S[t.dataset.k] = +t.value;
      else if (t.dataset.ie === 'opacity') this.layerOp('opacity', this.doc.active, +t.value);
      else if (t.dataset.adj && t.type === 'range') this.adjust(this.adjPath(t.dataset.adj), +t.value);
    });
    P.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.ie === 'blend') this.layerOp('blend', this.doc.active, t.value);
      else if (t.dataset.ie === 'band') { this.band = t.value; this.refreshAdjust(); }
      else if (t.dataset.ie === 'curve') { this.curveCh = t.value; this.drawCurve(); }
      else if (t.dataset.ie === 'wheel') { this.wheel = t.value; this.refreshAdjust(); }
      else if (t.dataset.adj === 'treatment') this.adjust('treatment', t.checked ? 'bw' : 'color');
      else if (t.dataset.op === 'visible') this.layerOp('visible', +t.closest('.layer').dataset.i, t.checked);
    });
    const cv = this.curveCanvas = P.querySelector('.ie-curve'), wh = this.wheelCanvas = P.querySelector('.ie-wheel');
    cv.addEventListener('pointerdown', e => { if (e.button === 0) this.curveDown(e); });
    cv.addEventListener('pointermove', e => this.curveMove(e));
    cv.addEventListener('pointerup', () => this.curveUp()); cv.addEventListener('pointercancel', () => this.curveUp());
    cv.addEventListener('dblclick', e => this.curveRemoveAt(e));
    wh.addEventListener('pointerdown', e => { if (e.button !== 0 || !this.doc) return; this.wheelDrag = true; wh.setPointerCapture && wh.setPointerCapture(e.pointerId); this.wheelMove(e); });
    wh.addEventListener('pointermove', e => this.wheelMove(e));
    const wup = () => { this.wheelDrag = false; }; wh.addEventListener('pointerup', wup); wh.addEventListener('pointercancel', wup);
    wh.addEventListener('dblclick', () => this.doc && this.adjust({ [`grading.${this.wheel}.hue`]: 0, [`grading.${this.wheel}.sat`]: 0 }));
    this.drawCurve(); this.drawWheel();
    const c = this.canvas;
    c.addEventListener('pointerdown', e => { if (e.button !== 0 || !this.doc) return; c.setPointerCapture && c.setPointerCapture(e.pointerId); this.begin(e); });
    c.addEventListener('pointermove', e => this.moveTo(e));
    c.addEventListener('pointerup', () => this.end()); c.addEventListener('pointercancel', () => this.end());
  }
  flash(text) { this.onState({ active: this.active, message: text }); }
}
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
