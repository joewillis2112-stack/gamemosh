// A layered image (the Image Editor's document): layers bottom to top, each an
// RGBA image (brush.js's straight floats) with a name, opacity, visibility and
// blend mode (blend.js, PhotoCraft's), and optionally a layer mask (a grey image
// the size of the layer: white shows, black hides; its red channel is read).
// Flattening composites them in order over a transparent backdrop, the way
// PhotoCraft (and Photoshop) do, each pixel's alpha scaled by its mask. Engine-free.
import { image } from './brush.js';
import { composite, BLEND_MODES } from './blend.js';

export class LayeredImage {
  constructor(width, height) { this.width = width; this.height = height; this.layers = []; this.active = -1; }
  /** A new layer above the active one (or at the top); it becomes active. */
  add(name = `Layer ${this.layers.length + 1}`, img = image(this.width, this.height)) {
    if (img.width !== this.width || img.height !== this.height) throw new Error(`layer is ${img.width}x${img.height}, the image ${this.width}x${this.height}`);
    const layer = { name, img, opacity: 1, visible: true, blend: 'Normal', mask: null };
    const at = this.active < 0 ? this.layers.length : this.active + 1;
    this.layers.splice(at, 0, layer); this.active = at;
    return layer;
  }
  remove(i = this.active) {
    if (this.layers.length <= 1 || i < 0 || i >= this.layers.length) return false; // an image keeps at least one layer
    this.layers.splice(i, 1); this.active = Math.min(this.active, this.layers.length - 1);
    return true;
  }
  /** Move a layer up (+1) or down (-1) the stack; the active layer follows it. */
  move(i, by) {
    const j = i + by; if (j < 0 || j >= this.layers.length) return false;
    const [l] = this.layers.splice(i, 1); this.layers.splice(j, 0, l);
    if (this.active === i) this.active = j; else if (this.active === j) this.active = i;
    return true;
  }
  set(i, key, value) {
    const l = this.layers[i]; if (!l) return;
    if (key === 'opacity') l.opacity = Math.min(Math.max(+value, 0), 1);
    else if (key === 'blend') { if (BLEND_MODES.includes(value)) l.blend = value; }
    else if (key === 'visible') l.visible = !!value;
    else if (key === 'name') l.name = String(value);
  }
  /** Give layer i a mask: `from` (a Float32Array of 0..1 per pixel, e.g. a selection) or all white. */
  addMask(i, from = null) {
    const l = this.layers[i]; if (!l) return null;
    l.mask = image(this.width, this.height, [1, 1, 1, 1]);
    if (from) for (let p = 0; p < from.length; p++) { const o = p * 4; l.mask.data[o] = l.mask.data[o + 1] = l.mask.data[o + 2] = from[p]; }
    return l.mask;
  }
  /** All visible layers composited, bottom to top, into one image; with `rect` ([x0, y0, x1, y1)), only there. */
  flatten(out = image(this.width, this.height), rect = [0, 0, this.width, this.height]) {
    const D = out.data, W = this.width, [x0, y0, x1, y1] = rect, bd = [0, 0, 0, 0], sc = [0, 0, 0, 0];
    for (let y = y0; y < y1; y++) D.fill(0, (y * W + x0) * 4, (y * W + x1) * 4);
    for (const l of this.layers) {
      if (!l.visible || l.opacity <= 0) continue;
      const S = l.img.data, M = l.mask && l.mask.data;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const o = (y * W + x) * 4, a = M ? S[o + 3] * M[o] : S[o + 3];
        if (a <= 0) continue;
        bd[0] = D[o]; bd[1] = D[o + 1]; bd[2] = D[o + 2]; bd[3] = D[o + 3];
        sc[0] = S[o]; sc[1] = S[o + 1]; sc[2] = S[o + 2]; sc[3] = a;
        const c = composite(l.blend, bd, sc, l.opacity);
        D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = c[3];
      }
    }
    return out;
  }
}
