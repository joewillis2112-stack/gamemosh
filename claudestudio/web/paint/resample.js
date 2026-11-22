// Image Size and Canvas Size: PhotoCraft's resampler (crates/algo/src/resample.rs, Photoshop's
// filters as PhotoCraft measured them; github.com/storytold/photocraft, MIT/Apache) ported to JS
// for a canvas-sized layer of an 8-bit document, and checked against the Rust
// (tools/resample-oracle, test/resample.test.mjs). Engine-free.
//
// An image is brush.js's: { width, height, data: Float32Array RGBA, straight alpha, 0..1 }. As in
// PhotoCraft's Image Size (resize_surface_in_canvas): the edge repeats outwards (an opaque layer
// stays opaque to its border), the work is in premultiplied f32, and between passes and at the end
// the image is stored in its own format (8 bits a channel here), which clips and rounds it.
// Kept: Nearest, Bilinear, Bicubic, Bicubic Smoother, Bicubic Sharper, Lanczos, Preserve Details
// (Lanczos and PhotoCraft's Unsharp Mask enlarging, Bicubic Sharper reducing). One-channel masks
// (selections, layer masks) go through the same passes without alpha. Not ported: Bicubic Automatic.
const f = Math.fround;
export const RESAMPLE = ['bicubic', 'bicubicSmoother', 'bicubicSharper', 'bilinear', 'nearest', 'lanczos', 'preserveDetails'];
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
function lanczosWeight(x) {
  x = Math.abs(x);
  if (x < 1e-9) return 1;
  if (x >= 3) return 0;
  const px = Math.PI * x;
  return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px);
}
function plan(filter, sx, sy) {
  const both = k => [{ sx, sy, kx: k, ky: k }];
  if (filter === 'nearest') return both({ kind: 'nearest' });
  if (filter === 'bilinear') return both({ kind: 'bilinear' });
  if (filter === 'lanczos' || (filter === 'preserveDetails' && (sx > 1 || sy > 1))) return both({ kind: 'lanczos' });
  if (filter === 'preserveDetails') return plan('bicubicSharper', sx, sy);
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
  if (kernel.kind === 'lanczos') {
    const stretch = scale < 1 ? 1 / scale : 1;
    let u = (o + 0.5) / scale - 0.5;
    if (edge) u = Math.min(Math.max(u, edge[0]), Math.max(edge[1], edge[0]));
    const lo = Math.ceil(u - 3 * stretch), hi = Math.floor(u + 3 * stretch), w = [];
    for (let i = lo; i <= hi; i++) w.push(lanczosWeight((i - u) / stretch));
    let sum = 0; for (const v of w) sum += v;
    const k = Math.abs(sum) > 1e-12 ? 1 / sum : 1;
    return [lo, w.map(v => v * k)];
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
/** [x0, y0, x1, y1) of the pixels that differ from the default once stored at 8 bits; null if none. */
function contentBounds(D, W, H, n, def) {
  const d8 = def.map(q8); let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * n; let differs = false;
    for (let c = 0; c < n && !differs; c++) differs = q8(D[o + c]) !== d8[c];
    if (differs) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
/** Stored as 8 bits a channel (PhotoCraft's write_sample/read_sample for U8). */
const q8 = v => Math.trunc(f(f(Math.min(Math.max(v, 0), 1) * 255) + 0.5)); // in f32, as the Rust
const store8 = v => f(q8(v) / 255);

/** One pass over `n`-channel data (canvas [0, 0, cw, ch), straight alpha in the last channel if
 *  `alpha`, `def` the surface's default pixel), into data of the scaled canvas's size. */
function pass(D, cw, ch, n, alpha, def, { sx, sy, kx, ky }) {
  const nw = Math.ceil(cw * sx), nh = Math.ceil(ch * sy), out = new Float32Array(nw * nh * n);
  const d8 = def.map(store8); for (let i = 0; i < out.length; i += n) out.set(d8, i); // outside what's computed: the default
  const src = contentBounds(D, cw, ch, n, def); if (!src) return { w: nw, h: nh, data: out };
  const W = cw, cc = alpha ? n - 1 : n;
  const dst = [Math.floor(src[0] * sx), Math.floor(src[1] * sy), Math.ceil(src[2] * sx), Math.ceil(src[3] * sy)];
  // The edge (content ∪ canvas) is the canvas: every tap is clamped into it.
  const hx = taps(dst[0], dst[2], sx, kx, [0, cw - 1]), vy = taps(dst[1], dst[3], sy, ky, [0, ch - 1]);
  const dw = dst[2] - dst[0], acc = new Float32Array(dw * n);
  const pre = new Float32Array(W * n);
  const hcache = new Map(); // source row -> its horizontal pass (premultiplied)
  const horiz = y => {
    if (hcache.has(y)) return hcache.get(y);
    for (let x = 0; x < W; x++) { const o = (y * W + x) * n, a = alpha ? D[o + n - 1] : 1; for (let c = 0; c < n; c++) pre[x * n + c] = c < cc && alpha ? f(D[o + c] * a) : D[o + c]; }
    const r = new Float32Array(dw * n);
    hx.forEach((t, i) => {
      for (let c = 0; c < n; c++) { let s = 0; for (let k = 0; k < t.w.length; k++) { const x = t.start + k; if (x >= 0 && x < W) s = f(s + f(pre[x * n + c] * t.w[k])); } r[i * n + c] = s; }
    });
    hcache.set(y, r); if (hcache.size > 64) hcache.delete(hcache.keys().next().value);
    return r;
  };
  for (let j = 0; j < vy.length; j++) {
    const t = vy[j], oy = dst[1] + j; acc.fill(0);
    for (let k = 0; k < t.w.length; k++) {
      const y = t.start + k; if (y < 0 || y >= ch) continue;
      const r = horiz(y), w = t.w[k];
      for (let i = 0; i < acc.length; i++) acc[i] = f(acc[i] + f(r[i] * w));
    }
    if (oy < 0 || oy >= nh) continue;
    for (let i = 0; i < dw; i++) {
      const ox = dst[0] + i; if (ox < 0 || ox >= nw) continue;
      const o = (oy * nw + ox) * n;
      if (!alpha) { for (let c = 0; c < n; c++) out[o + c] = store8(acc[i * n + c]); continue; }
      const a = Math.min(Math.max(acc[i * n + n - 1], 0), 1);
      for (let c = 0; c < cc; c++) out[o + c] = store8(a > 1e-7 ? f(acc[i * n + c] / a) : 0);
      out[o + n - 1] = store8(a);
    }
  }
  return { w: nw, h: nh, data: out };
}

/** Normalized Gaussian of standard deviation sigma, radius ⌈3σ⌉, in f32 (blur.rs gaussian_kernel). */
export function gaussianKernel(sigma) {
  sigma = f(sigma);
  if (sigma < 0.05) return [1];
  const r = Math.ceil(f(sigma * 3)), two = f(f(2 * sigma) * sigma), k = [];
  for (let i = -r; i <= r; i++) k.push(f(Math.exp(f(f(-(i * i)) / two))));
  let s = 0; for (const v of k) s = f(s + v);
  return k.map(v => f(v / s));
}
/** Unsharp Mask on straight RGBA data, transparent beyond the canvas (sharpen.rs unsharp over blur.rs conv_sep). */
function unsharp(D, W, H, amount, radius) {
  const k = gaussianKernel(radius), r = k.length >> 1, ka = f(amount / 100), n = 4;
  const ww = W + 2 * r, th = H + 2 * r, p = new Float32Array(ww * th * n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * n, q = ((y + r) * ww + x + r) * n, a = D[o + 3];
    for (let c = 0; c < 3; c++) p[q + c] = f(D[o + c] * a);
    p[q + 3] = a;
  }
  const tmp = new Float32Array(W * th * n);
  for (let ty = 0; ty < th; ty++) for (let x = 0; x < W; x++) for (let c = 0; c < n; c++) {
    let acc = 0; for (let i = 0; i < k.length; i++) acc = f(acc + f(p[(ty * ww + x + i) * n + c] * k[i]));
    tmp[(ty * W + x) * n + c] = acc;
  }
  const out = D.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * n; if (D[o + 3] <= 0) continue;
    const b = [0, 0, 0, 0];
    for (let i = 0; i < k.length; i++) for (let c = 0; c < n; c++) b[c] = f(b[c] + f(tmp[((y + i) * W + x) * n + c] * k[i]));
    const ba = b[3];
    for (let c = 0; c < 3; c++) { const bl = ba > 1e-7 ? f(b[c] / ba) : 0, d = f(D[o + c] - bl); out[o + c] = store8(f(D[o + c] + f(ka * d))); }
  }
  return out;
}

/** n-channel data (straight alpha last if `alpha`; `def` the default pixel) resampled from W x H to w x h. */
export function resampleData(D, W, H, n, alpha, def, w, h, filter = 'bicubic') {
  const sx = w / Math.max(W, 1), sy = h / Math.max(H, 1);
  if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) return D.slice();
  let cur = { w: W, h: H, data: D };
  for (const p of plan(filter, sx, sy)) cur = pass(cur.data, cur.w, cur.h, n, alpha, def, p);
  if (filter === 'preserveDetails' && (sx > 1 || sy > 1) && n === 4 && alpha) cur.data = unsharp(cur.data, cur.w, cur.h, 30, f(0.6 * Math.max(sx, sy)));
  if (cur.w === w && cur.h === h) return cur.data;
  const out = new Float32Array(w * h * n); // the canvas: anything scaled past it is cut off
  for (let y = 0; y < Math.min(h, cur.h); y++) out.set(cur.data.subarray(y * cur.w * n, (y * cur.w + Math.min(w, cur.w)) * n), y * w * n);
  return out;
}
/** `img` (brush.js RGBA) resampled to w x h with `filter` (Image Size). */
export const resample = (img, w, h, filter = 'bicubic') => ({ width: w, height: h, data: resampleData(img.data, img.width, img.height, 4, true, [0, 0, 0, 0], w, h, filter) });
/** A one-channel mask (a selection: default 0; a layer mask: default 1) resampled, bilinear as PhotoCraft's Image Size does. */
export const resampleMask = (m, W, H, w, h, def = 0, filter = 'bilinear') => resampleData(m, W, H, 1, false, [def], w, h, filter);

/** Where the old image goes on a new canvas: anchor 0..8 (rows top to bottom, left to right; 4 is the centre). */
export function canvasOffset(ow, oh, w, h, anchor = 4) {
  const ax = anchor % 3, ay = Math.floor(anchor / 3);
  return [Math.trunc((w - ow) * ax / 2), Math.trunc((h - oh) * ay / 2)];
}
/** A one-channel mask on a w x h canvas (Canvas Size): moved by the anchor, the new area `fill`. */
export function canvasSizeMask(m, W, H, w, h, anchor = 4, fill = 0) {
  const [dx, dy] = canvasOffset(W, H, w, h, anchor), out = new Float32Array(w * h).fill(fill);
  for (let y = 0; y < H; y++) { const ty = y + dy; if (ty < 0 || ty >= h) continue; for (let x = 0; x < W; x++) { const tx = x + dx; if (tx >= 0 && tx < w) out[ty * w + tx] = m[y * W + x]; } }
  return out;
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
