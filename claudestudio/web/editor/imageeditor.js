// The Image Editor: an image property opened flat, painted in layers.
// Opens on the selected Decal or Texture (its Texture), ImageLabel or ImageButton
// (its Image), or MeshPart (its TextureID); the image as it is becomes the
// Background layer (a new one is 512x512 and clear). Layers have opacity,
// visibility and a blend mode (web/paint/blend.js, PhotoCraft's); the brushes
// are the Paint tool's (same settings). Apply writes the flattened PNG back as
// one undo step in the editor; Cancel changes nothing. Inside the editor, Undo
// takes back the last stroke or layer change. Layers aren't kept after Apply
// (the property holds one image).
import { Stroke, image } from '../paint/brush.js';
import { BLEND_MODES } from '../paint/blend.js';
import { LayeredImage } from '../paint/layers.js';
import { imageFromUrl, toPng, toBytes } from './paint.js';

const NEW_SIZE = 512, UNDO_DEPTH = 20;
export const IMAGE_PROP = { Decal: 'Texture', Texture: 'Texture', ImageLabel: 'Image', ImageButton: 'Image', MeshPart: 'TextureID' };
const BLEND_LABEL = m => m.replace(/([a-z])([A-Z])/g, '$1 $2');
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export class ImageEditor {
  constructor({ dm, world, commands, settings, panel, onState = () => {} }) {
    Object.assign(this, { dm, world, commands, settings, panel, onState });
    this.doc = null; this.target = null; this.undo = []; this.stroke = null;
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
  close() { this.doc = null; this.target = null; this.undo = []; this.stroke = null; this.panel.hidden = true; this.onState({ active: false }); }
  /** Write the flattened image into the property (one undo step) and close. */
  apply() {
    if (!this.doc) return null;
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
    this.doc.layers = u.layers; this.doc.active = u.active;
    this.redraw(); this.refreshLayers(); return true;
  }
  begin(e) {
    const l = this.doc.layers[this.doc.active]; if (!l) return;
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

  // ---- layers
  layerOp(op, i = this.doc.active, value) {
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
    P.innerHTML = `<div class="ie-head"><b class="ie-title"></b><span class="grow"></span>` +
      `<button data-ie="undo" title="Undo the last stroke or layer change">Undo</button><button data-ie="cancel">Cancel</button><button data-ie="apply" class="primary">Apply</button></div>` +
      `<div class="ie-body"><div class="ie-view"><canvas class="ie-canvas"></canvas></div><div class="ie-side">` +
      `<div class="ie-row"><button data-p="brush">Brush</button><button data-p="pencil">Pencil</button><button data-p="erase">Eraser</button><input type="color" data-k="color" value="${hex(S.color)}" title="Colour"></div>` +
      `<label>Size <input type="range" data-k="size" min="1" max="128" step="1" value="${S.size}"></label>` +
      `<label>Opacity <input type="range" data-k="opacity" min="0.05" max="1" step="0.05" value="${S.opacity}"></label>` +
      `<div class="ie-row"><b>Layers</b><span class="grow"></span><button data-ie="add" title="New layer">+</button><button data-ie="remove" title="Delete layer">−</button><button data-ie="up" title="Move up">▲</button><button data-ie="down" title="Move down">▼</button></div>` +
      `<div class="ie-row"><select data-ie="blend">${BLEND_MODES.map(m => `<option value="${m}">${BLEND_LABEL(m)}</option>`).join('')}</select>` +
      `<input type="range" data-ie="opacity" min="0" max="1" step="0.05" title="Layer opacity"></div><div class="ie-layers"></div></div></div>`;
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
      if (a === 'apply') this.apply(); else if (a === 'cancel') this.close(); else if (a === 'undo') this.undoLast();
      else if (a === 'add' || a === 'remove' || a === 'up' || a === 'down') this.layerOp(a);
      else if (p) { S.erase = p === 'erase'; S.aliased = p === 'pencil'; tools(); }
    });
    P.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k === 'color') S.color = [...unhex(t.value), 1];
      else if (t.dataset.k) S[t.dataset.k] = +t.value;
      else if (t.dataset.ie === 'opacity') this.layerOp('opacity', this.doc.active, +t.value);
    });
    P.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.ie === 'blend') this.layerOp('blend', this.doc.active, t.value);
      else if (t.dataset.op === 'visible') this.layerOp('visible', +t.closest('.layer').dataset.i, t.checked);
    });
    const c = this.canvas;
    c.addEventListener('pointerdown', e => { if (e.button !== 0 || !this.doc) return; c.setPointerCapture && c.setPointerCapture(e.pointerId); this.begin(e); });
    c.addEventListener('pointermove', e => this.moveTo(e));
    c.addEventListener('pointerup', () => this.end()); c.addEventListener('pointercancel', () => this.end());
  }
  flash(text) { this.onState({ active: this.active, message: text }); }
}
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
