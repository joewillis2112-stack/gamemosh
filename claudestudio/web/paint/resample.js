// Image Size and Canvas Size: PhotoCraft's resampler (crates/algo/src/resample.rs, Photoshop's
// filters as PhotoCraft measured them; github.com/storytold/photocraft, MIT/Apache) ported to JS
// for a canvas-sized layer of an 8-bit document, and checked against the Rust
// (tools/resample-oracle, test/resample.test.mjs). Engine-free.
//
// An image is brush.js's: { width, height, data: Float32Array RGBA, straight alpha, 0..1 }. As in
// PhotoCraft's Image Size (resize_surface_in_canvas): the edge repeats outwards (an opaque layer
// stays opaque to its border), the work is in premultiplied f32, and between passes and at the end
// the image is stored in its own format (8 bits a channel here), which clips and rounds it.
// Kept: Nearest, Bilinear, Bicubic, Bicubic Smoother, Bicubic Sharper. Not ported: Lanczos,
// Preserve Details, Bicubic Automatic.
const f = Math.fround;
export const RESAMPLE = ['bicubic', 'bicubicSmoother', 'bicubicSharper', 'bilinear', 'nearest'];
const PHASES = 128;

function keys(method, s) {
  s = Math.min(Math.max(s, 0.25), 1);
  const [a, stretch] = method === 'bicubicSmoother' ? [-0.625 - 0.5 * (1 - s), 1.15] : method === 'bicubicSharper' ? [-1 - 1.6 * (1 - s), 1.05] : [-0.75, 1];
  return { kind: 'keys', a, stretch: stretch / s };
}
function keysWeight(x, a) {
  x = Math.abs(x);
  return x < 1 ? (a + 2) * x * x * x - (a + 3) * x * x + 1 : x < 2 ? a * (x * x * x - 5 * x * x + 8 * x - 4) : 0;
}
function plan(filter, sx, sy) {
  const both = k => [{ sx, sy, kx: k, ky: k }];
  if (filter === 'nearest') return both({ kind: 'nearest' });
  if (filter === 'bilinear') return both({ kind: 'bilinear' });
  const k = keys(filter, sy !== 1 ? sy : sx);
  if (sx === 1 || sy === 1) return both(k);
  return sy < sx ? [{ sx: 1, sy, kx: k, ky: k }, { sx, sy: 1, kx: k, ky: k }] : [{ sx, sy: 1, kx: k, ky: k }, { sx: 1, sy, kx: k, ky: k }];
}
// Rust's `round` (half away from zero) and `as i32` (towards zero, saturating).
const roundHalfAway = v => Math.sign(v) * Math.round(Math.abs(v));
function position(o, scale, edge) {
  let u = (o + 0.5) / scale - 0.5;
  if (edge) u = Math.min(Math.max(u, edge[0]), Math.max(edge[1], edge[0]));
  const j = Math.floor(u);
  return j + roundHalfAway((u - j) * PHASES) / PHASES;
}
function cover(o, scale) {
  const a = Math.floor(o / scale + 1e-9);
  return [a, Math.max(Math.floor((o + 1) / scale + 1e-9), a + 1)];
}
function weights(o, scale, kernel, edge) {
  if (kernel.kind === 'nearest') { const u = (o + 0.5) / scale - 0.5; return [Math.floor(u + 0.5), [1]]; }
  if (kernel.kind === 'bilinear') {
    if (scale < 0.5) { const [a, b] = cover(o, scale); return [a, Array(b - a).fill(1 / (b - a))]; }
    const u = position(o, scale, edge), j = Math.floor(u);
    return [j, [1 - (u - j), u - j]];
  }
  const { a, stretch } = kernel;
  if (scale < 0.25) { // averaged down to four times the target first, then filtered
    const inner = 4 * scale;
    const innerEdge = edge && [Math.ceil(edge[0] * inner - 1e-9), Math.ceil((edge[1] + 1) * inner - 1e-9) - 1];
    const [k0, kw] = weights(o, 0.25, kernel, innerEdge);
    const clamp = k => innerEdge ? Math.min(Math.max(k, innerEdge[0]), Math.max(innerEdge[1], innerEdge[0])) : k;
    const boxes = kw.map((_, i) => cover(clamp(k0 + i), inner));
    const lo = boxes.length ? Math.min(...boxes.map(b => b[0])) : 0, hi = boxes.length ? Math.max(...boxes.map(b => b[1])) : lo;
    const w = new Array(Math.max(hi - lo, 0)).fill(0);
    boxes.forEach(([ba, bb], i) => { for (let s = ba - lo; s < bb - lo; s++) if (s >= 0 && s < w.length) w[s] += kw[i] / (bb - ba); });
    return [lo, w];
  }
  const u = position(o, scale, edge), lo = Math.floor(u - 2 * stretch), hi = Math.ceil(u + 2 * stretch);
  const w = []; for (let i = lo; i <= hi; i++) w.push(keysWeight((u - i) / stretch, a));
  let sum = 0; for (const v of w) sum += v;
  return [lo, w.map(v => v / sum)];
}
/** Per output sample: the first source index and f32 weights, the ones beyond the edge folded onto it. */
function taps(dst0, dst1, scale, kernel, edge) {
  const clamp = i => edge ? Math.min(Math.max(i, edge[0]), edge[1]) : i;
  if (scale === 1) kernel = { kind: 'nearest' };
  const out = [];
  for (let o = dst0; o < dst1; o++) {
    const [lo, w] = weights(o, scale, kernel, edge), hi = lo + w.length - 1, start = clamp(lo);
    const folded = new Array(Math.max(clamp(hi) - start + 1, 1)).fill(0);
    for (let i = lo; i <= hi; i++) { const s = clamp(i) - start; if (s >= 0 && s < folded.length) folded[s] = f(folded[s] + f(w[i - lo])); }
    out.push({ start, w: folded });
  }
  return out;
}
/** [x0, y0, x1, y1) of the pixels that aren't (0, 0, 0, 0) once stored at 8 bits; null if none. */
function contentBounds(img) {
  const { width: W, height: H, data: D } = img; let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (q8(D[o]) || q8(D[o + 1]) || q8(D[o + 2]) || q8(D[o + 3])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
/** Stored as 8 bits a channel (PhotoCraft's write_sample/read_sample for U8). */
const q8 = v => Math.trunc(f(f(Math.min(Math.max(v, 0), 1) * 255) + 0.5)); // in f32, as the Rust
const store8 = v => f(q8(v) / 255);

/** One pass over `img` (canvas [0, 0, cw, ch)), into an image of the scaled canvas's size. */
function pass(img, cw, ch, { sx, sy, kx, ky }) {
  const nw = Math.ceil(cw * sx), nh = Math.ceil(ch * sy), out = { width: nw, height: nh, data: new Float32Array(nw * nh * 4) };
  const src = contentBounds(img); if (!src) return out;
  const W = img.width, D = img.data;
  const dst = [Math.floor(src[0] * sx), Math.floor(src[1] * sy), Math.ceil(src[2] * sx), Math.ceil(src[3] * sy)];
  // The edge (content ∪ canvas) is the canvas: every tap is clamped into it.
  const hx = taps(dst[0], dst[2], sx, kx, [0, cw - 1]), vy = taps(dst[1], dst[3], sy, ky, [0, ch - 1]);
  const dw = dst[2] - dst[0], acc = new Float32Array(dw * 4);
  const pre = new Float32Array(W * 4);
  const hcache = new Map(); // source row -> its horizontal pass (premultiplied)
  const horiz = y => {
    if (hcache.has(y)) return hcache.get(y);
    for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, a = D[o + 3]; pre[x * 4] = f(D[o] * a); pre[x * 4 + 1] = f(D[o + 1] * a); pre[x * 4 + 2] = f(D[o + 2] * a); pre[x * 4 + 3] = a; }
    const r = new Float32Array(dw * 4);
    hx.forEach((t, i) => {
      for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < t.w.length; k++) { const x = t.start + k; if (x >= 0 && x < W) s = f(s + f(pre[x * 4 + c] * t.w[k])); } r[i * 4 + c] = s; }
    });
    hcache.set(y, r); if (hcache.size > 64) hcache.delete(hcache.keys().next().value);
    return r;
  };
  for (let j = 0; j < vy.length; j++) {
    const t = vy[j], oy = dst[1] + j; acc.fill(0);
    for (let k = 0; k < t.w.length; k++) {
      const y = t.start + k; if (y < 0 || y >= img.height) continue;
      const r = horiz(y), w = t.w[k];
      for (let i = 0; i < acc.length; i++) acc[i] = f(acc[i] + f(r[i] * w));
    }
    if (oy < 0 || oy >= nh) continue;
    for (let i = 0; i < dw; i++) {
      const ox = dst[0] + i; if (ox < 0 || ox >= nw) continue;
      const a = Math.min(Math.max(acc[i * 4 + 3], 0), 1), o = (oy * nw + ox) * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = store8(a > 1e-7 ? f(acc[i * 4 + c] / a) : 0);
      out.data[o + 3] = store8(a);
    }
  }
  return out;
}

/** `img` resampled to w x h with `filter` (Image Size). */
export function resample(img, w, h, filter = 'bicubic') {
  const sx = w / Math.max(img.width, 1), sy = h / Math.max(img.height, 1);
  if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) return { width: img.width, height: img.height, data: img.data.slice() };
  let cur = img, cw = img.width, ch = img.height;
  for (const p of plan(filter, sx, sy)) { cur = pass(cur, cw, ch, p); cw = cur.width; ch = cur.height; }
  if (cur.width === w && cur.height === h) return cur;
  const out = { width: w, height: h, data: new Float32Array(w * h * 4) }; // the canvas: anything scaled past it is cut off
  for (let y = 0; y < Math.min(h, cur.height); y++) out.data.set(cur.data.subarray(y * cur.width * 4, (y * cur.width + Math.min(w, cur.width)) * 4), y * w * 4);
  return out;
}

/** Where the old image goes on a new canvas: anchor 0..8 (rows top to bottom, left to right; 4 is the centre). */
export function canvasOffset(ow, oh, w, h, anchor = 4) {
  const ax = anchor % 3, ay = Math.floor(anchor / 3);
  return [Math.trunc((w - ow) * ax / 2), Math.trunc((h - oh) * ay / 2)];
}
/** `img` on a w x h canvas (Canvas Size): moved by the anchor, new area clear (or `fill`), the rest cut off. */
export function canvasSize(img, w, h, anchor = 4, fill = null) {
  const [dx, dy] = canvasOffset(img.width, img.height, w, h, anchor), out = { width: w, height: h, data: new Float32Array(w * h * 4) };
  if (fill) for (let i = 0; i < out.data.length; i += 4) out.data.set(fill, i);
  for (let y = 0; y < img.height; y++) {
    const ty = y + dy; if (ty < 0 || ty >= h) continue;
    const x0 = Math.max(0, -dx), x1 = Math.min(img.width, w - dx); if (x1 <= x0) continue;
    out.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1) * 4), (ty * w + x0 + dx) * 4);
  }
  return out;
}
