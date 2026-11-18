// Selections: PhotoCraft's (crates/algo/src/selection.rs, selection/marquee.rs, selection_blur.rs and
// the engine's select.rect / select.lasso; github.com/storytold/photocraft, MIT/Apache) ported to JS
// and checked against the Rust (tools/selection-oracle, test/selection.test.mjs). Engine-free.
//
// A selection is a Float32Array of coverage, one per pixel of the W x H canvas, held on the 8-bit
// grid PhotoCraft's GRAY8 selections are stored on (k / 255). Shapes: the Rectangular Marquee (whole
// pixels), the Elliptical Marquee (anti-aliased by 4x4 sub-samples), the Lasso (anti-aliased by exact
// horizontal coverage on 4 sub-rows). Combining with the current selection: Replace, Add, Subtract,
// Intersect, as PhotoCraft's marquee (`combine_surfaces`) and lasso (`combine`) do them; Feather
// (a Gaussian with σ = radius, truncated at ⌈3σ⌉, zero beyond the canvas); moving by whole pixels.
const f = Math.fround;
export const MODES = ['replace', 'add', 'subtract', 'intersect'];
/** The byte a GRAY8 surface stores for v, and the value it reads back. */
export const encode8 = v => Math.trunc(f(f(Math.min(Math.max(Number.isNaN(v) ? 0 : v, 0), 1) * 255) + 0.5));
export const decode8 = b => f(b / 255);
const q = v => decode8(encode8(v));

/** The Rectangular Marquee: whole pixels of r = [x0, y0, x1, y1) inside the canvas. */
export function rectMask(r, W, H) {
  const m = new Float32Array(W * H), x0 = Math.max(r[0], 0), y0 = Math.max(r[1], 0), x1 = Math.min(r[2], W), y1 = Math.min(r[3], H);
  for (let y = y0; y < y1; y++) m.fill(1, y * W + x0, y * W + Math.max(x0, x1));
  return m;
}
/** The Elliptical Marquee: the ellipse inscribed in r (whole-pixel rect), cut to the canvas. Edge
 *  pixels hold their share of 4x4 sub-samples inside (anti-aliased) or are in when their centre is. */
export function ellipseMask(r, W, H, aa = true) {
  const m = new Float32Array(W * H);
  const cx = f((r[0] + r[2]) / 2), cy = f((r[1] + r[3]) / 2), rx = f(Math.max(r[2] - r[0], 0) / 2), ry = f(Math.max(r[3] - r[1], 0) / 2);
  const inside = (x, y) => { const dx = f(f(x - cx) / rx), dy = f(f(y - cy) / ry); return f(f(dx * dx) + f(dy * dy)) <= 1; };
  const x0 = Math.max(r[0], 0), y0 = Math.max(r[1], 0), x1 = Math.min(r[2], W), y1 = Math.min(r[3], H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let n;
    const full = aa ? inside(x, y) && inside(x + 1, y) && inside(x, y + 1) && inside(x + 1, y + 1) : inside(f(x + 0.5), f(y + 0.5));
    if (full) n = 16;
    else if (!aa) n = 0;
    else { n = 0; for (let i = 0; i < 16; i++) if (inside(f(x + f(f((i % 4) + 0.5) / 4)), f(y + f(f(Math.floor(i / 4) + 0.5) / 4)))) n++; }
    if (n) m[y * W + x] = decode8(encode8(f(n / 16)));
  }
  return m;
}
/** The Lasso's polygon (even-odd), anti-aliased: exact horizontal coverage on 4 sub-rows a pixel
 *  (selection.rs polygon, in f32 as the Rust). Raw coverage, before it's stored. */
export function polygonMask(points, W, H, aa = true) {
  const m = new Float32Array(W * H);
  if (points.length < 3) return m;
  const P = points.map(([x, y]) => [f(x), f(y)]), sub = aa ? 4 : 1;
  for (let py = 0; py < H; py++) for (let s = 0; s < sub; s++) {
    const y = f(f(py) + f(f(s + 0.5) / sub)), xs = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(f(a[0] + f(f(f(y - a[1]) / f(b[1] - a[1])) * f(b[0] - a[0]))));
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(xs[k], 0), x1 = Math.min(xs[k + 1], W);
      if (x1 <= x0) continue;
      const c0 = Math.floor(x0), c1 = Math.min(Math.ceil(x1), W);
      for (let cx = c0; cx < c1; cx++) {
        const cov = aa ? f(Math.min(cx + 1, x1) - Math.max(cx, x0)) : ((cx + 0.5 >= x0 && cx + 0.5 < x1) ? 1 : 0);
        const o = py * W + cx; m[o] = f(m[o] + f(Math.max(cov, 0) / sub));
      }
    }
  }
  for (let i = 0; i < m.length; i++) m[i] = Math.min(m[i], 1);
  return m;
}
/** A marquee shape combined with the current selection (the engine's select.rect: `combine_surfaces`
 *  on the stored bytes): Add max, Subtract a·(1 − b), Intersect min. With nothing selected, Subtract
 *  and Intersect select nothing. Null when nothing is selected. */
export function combineMarquee(old, shape, mode) {
  const n = shape.length, out = new Float32Array(n);
  const fn = mode === 'add' ? (a, b) => Math.max(a, b) : mode === 'subtract' ? (a, b) => f(a * f(1 - b)) : mode === 'intersect' ? (a, b) => Math.min(a, b) : null;
  if (!fn || !old) { if (old || mode === 'replace' || mode === 'add') for (let i = 0; i < n; i++) out[i] = q(shape[i]); }
  else for (let i = 0; i < n; i++) out[i] = decode8(encode8(fn(q(old[i]), q(shape[i]))));
  return out.some(v => v > 0) ? out : null;
}
/** A new mask combined with the current selection (selection.rs `combine`: the lasso's, and a
 *  feathered marquee's): Replace, Add max(p, q), Subtract max(p − q, 0), Intersect min(p, q). */
export function combine(old, m, mode) {
  const n = m.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = old ? old[i] : 0, v = q(m[i]);
    out[i] = decode8(encode8(mode === 'add' ? Math.max(p, v) : mode === 'subtract' ? Math.max(f(p - v), 0) : mode === 'intersect' ? Math.min(p, v) : m[i]));
  }
  return out.some(v => v > 0) ? out : null;
}

/** Feather (Select › Modify › Feather): Gaussian of σ = radius, truncated at ⌈3σ⌉ and normalized,
 *  zero beyond the canvas, over the selection's bounds grown by the kernel (selection_blur.rs). Raw
 *  coverage, before it's stored. PhotoCraft convolves kernels up to 12 px directly (ported exactly);
 *  wider ones it sums as a fitted cosine series (within 0.3/255 a pass), which this convolves
 *  directly with the same taps instead. */
export function feather(m, W, H, radius) {
  const sigma = Number.isFinite(radius) ? Math.max(f(radius), 0) : radius > 0 ? 1e5 : 0;
  if (sigma < f(0.1) || m.length !== W * H || !m.length) return m.slice();
  const r = Math.ceil(f(sigma * 3));
  let bx0 = W, bx1 = -1, by0 = H, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x] !== 0) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  if (bx1 < 0) return m.slice();
  bx1++; by1++;
  const wx0 = Math.max(bx0 - r, 0), wx1 = Math.min(bx1 + r, W), wy0 = Math.max(by0 - r, 0), wy1 = Math.min(by1 + r, H), gw = wx1 - wx0, gh = wy1 - wy0;
  const s = sigma, g = j => Math.exp(-(j * j) / (2 * s * s));
  let total = 0; for (let j = 1; j <= r; j++) total += g(j); total = 1 + 2 * total;
  const kernel = n => { // taps over -jr..=jr for a line of n samples, as f32
    const jr = Math.min(r, Math.max(n - 1, 0));
    if (jr === 0) return [f(1 / total)];
    const taps = []; for (let j = 0; j <= jr; j++) taps.push(g(j) / total);
    const k = []; for (let i = 0; i <= 2 * jr; i++) k.push(f(taps[Math.abs(i - jr)]));
    return k;
  };
  const kh = kernel(gw), kv = kernel(gh), rh = kh.length >> 1, rv = kv.length >> 1, bh = by1 - by0;
  const tmp = new Float32Array(bh * gw);
  for (let y = 0; y < bh; y++) {
    const src = m.subarray((by0 + y) * W + wx0, (by0 + y) * W + wx0 + gw), dst = tmp.subarray(y * gw, (y + 1) * gw);
    for (let i = 0; i < kh.length; i++) {
      const d0 = i >= rh ? 0 : rh - i, s0 = i >= rh ? i - rh : 0; if (d0 >= gw || s0 >= gw) continue;
      const len = Math.min(gw - d0, gw - s0);
      for (let k = 0; k < len; k++) dst[d0 + k] = f(dst[d0 + k] + f(kh[i] * src[s0 + k]));
    }
  }
  const out = new Float32Array(W * H), off = by0 - wy0;
  for (let yy = 0; yy < gh; yy++) {
    const acc = new Float32Array(gw);
    for (let i = 0; i < kv.length; i++) {
      const ry = yy + i - rv - off; if (yy + i < rv || ry < 0 || ry >= bh) continue;
      const row = tmp.subarray(ry * gw, (ry + 1) * gw);
      for (let x = 0; x < gw; x++) acc[x] = f(acc[x] + f(kv[i] * row[x]));
    }
    for (let x = 0; x < gw; x++) { const v = acc[x]; out[(wy0 + yy) * W + wx0 + x] = Math.abs(v) < f(1e-7) ? 0 : v; }
  }
  return out;
}
/** The selection moved by whole pixels; what leaves the canvas is gone. */
export function translate(m, W, H, dx, dy) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { const ty = y + dy; if (ty < 0 || ty >= H) continue; for (let x = 0; x < W; x++) { const tx = x + dx; if (tx >= 0 && tx < W) out[ty * W + tx] = m[y * W + x]; } }
  return out;
}
/** Is anything selected? */
export const any = m => !!m && m.some(v => v > 0);
/** The outline of a selection at half coverage, as an SVG path of pixel edges (marching ants). */
export function outline(m, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] >= 0.5;
  let d = '';
  for (let y = 0; y <= H; y++) { let run = -1; for (let x = 0; x <= W; x++) { const e = x < W && at(x, y) !== at(x, y - 1); if (e && run < 0) run = x; if (!e && run >= 0) { d += `M${run} ${y}H${x}`; run = -1; } } }
  for (let x = 0; x <= W; x++) { let run = -1; for (let y = 0; y <= H; y++) { const e = y < H && at(x, y) !== at(x - 1, y); if (e && run < 0) run = y; if (!e && run >= 0) { d += `M${x} ${run}V${y}`; run = -1; } } }
  return d;
}
