// Character maker, stage 1: a 2D front-view reference becomes a blocky
// character's skin. The rig and its animations are the studio's own blocky
// character (assets/characters), so the result moves exactly like it; only the
// skin texture is new.
//
// Pure functions on RGBA images ({ width, height, data: Uint8ClampedArray or
// Uint8Array }), so the same code runs in the studio and in Node tests.
//
//   findParts(img)            -> where the head, torso, arms and legs are in the reference
//   partGrids(img, parts, o)  -> each body part's six faces as low-res pixel grids
//   paintSkin(tris, grids, o) -> the skin texture, painted through the model's own UVs
//
// Image regions are { x0, y0, x1, y1 } in pixels, x1/y1 exclusive. "Left" and
// "right" are the character's own: in a front view its left arm is on the
// image's right.

// --------------------------------------------------------------- the body in the image

/** Opaque mask: alpha, or (for an image without transparency) everything not
 *  connected to the border through background-coloured pixels. */
export function silhouette(img, { alphaCut = 128, tolerance = 40 } = {}) {
  const { width: W, height: H, data: D } = img, m = new Uint8Array(W * H);
  let hasAlpha = false;
  for (let i = 0; i < W * H; i++) if (D[i * 4 + 3] < 250) { hasAlpha = true; break; }
  if (hasAlpha) { for (let i = 0; i < W * H; i++) m[i] = D[i * 4 + 3] >= alphaCut ? 1 : 0; return m; }
  // No alpha: flood the background in from the border (pixels close to the corner colour).
  const bg = [0, 1, 2].map(k => (D[k] + D[(W - 1) * 4 + k] + D[(H - 1) * W * 4 + k] + D[(W * H - 1) * 4 + k]) / 4);
  const near = i => Math.abs(D[i * 4] - bg[0]) + Math.abs(D[i * 4 + 1] - bg[1]) + Math.abs(D[i * 4 + 2] - bg[2]) <= tolerance;
  m.fill(1);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (!m[i] || !near(i)) continue;
    m[i] = 0;
    const x = i % W;
    if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W); if (i < W * (H - 1)) stack.push(i + W);
  }
  return m;
}

// Opaque runs [start, end) in row y between columns a and b.
function runs(m, W, y, a, b) {
  const out = []; let s = -1;
  for (let x = a; x < b; x++) {
    if (m[y * W + x]) { if (s < 0) s = x; } else if (s >= 0) { out.push([s, x]); s = -1; }
  }
  if (s >= 0) out.push([s, b]);
  return out;
}
const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };

/** Where each body part is, for a character standing facing the viewer, arms
 *  down. Returns { box, head, torso, armLeft, armRight, legLeft, legRight,
 *  found: {legs, arms, neck} } (found says which cuts were seen rather than
 *  assumed). A creator can correct any box afterwards. */
export function findParts(img, mask = silhouette(img)) {
  const { width: W, height: H } = img;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; if (y >= y1) y1 = y + 1; }
  if (x1 <= x0) throw new Error('no character found in the image');
  const h = y1 - y0, w = x1 - x0;
  const found = { legs: false, arms: false, neck: false };

  // Legs: rising from the feet, the rows where the silhouette is split near
  // the middle. The crotch is where the split ends.
  const mid0 = x0 + Math.round(w * 0.3), mid1 = x1 - Math.round(w * 0.3);
  const split = y => { const r = runs(mask, W, y, mid0, mid1); return r.length >= 2 || (r.length === 1 && (r[0][0] > mid0 || r[0][1] < mid1) && runs(mask, W, y, x0, x1).length >= 2); };
  let crotch = y1, miss = 0;
  for (let y = y1 - 1; y > y0 + h * 0.4; y--) {
    if (split(y)) { crotch = y; miss = 0; } else if (++miss > Math.max(2, h * 0.02)) break;
  }
  // The gap between the legs, over the split rows: its centre divides them.
  let gapCols = [];
  for (let y = crotch; y < y1; y++) {
    const r = runs(mask, W, y, mid0, mid1);
    for (let k = 0; k + 1 < r.length; k++) gapCols.push((r[k][1] + r[k + 1][0]) / 2);
  }
  if (y1 - crotch >= h * 0.06) found.legs = true;
  else crotch = y1 - Math.round(h * 0.22);
  const legSplit = gapCols.length ? median(gapCols) : (x0 + x1) / 2;

  // Neck: the deepest narrowing below the head's widest row (width relative to
  // the widest row above it). Under 15% narrower, there's no visible neck and
  // the rig's proportion is assumed.
  const rowWidth = y => runs(mask, W, y, x0, x1).reduce((s, q) => s + q[1] - q[0], 0);
  let neck = -1, deepest = 0, widest = 0;
  for (let y = y0; y < Math.min(crotch - Math.round(h * 0.1), y0 + Math.round(h * 0.75)); y++) {
    const n = rowWidth(y);
    if (y >= y0 + h * 0.2 && widest > 0 && 1 - n / widest > deepest + 0.005) { deepest = 1 - n / widest; neck = y; }
    widest = Math.max(widest, n);
  }
  if (neck > 0 && deepest >= 0.15) found.neck = true;
  else neck = y0 + Math.round(h * 0.3);

  // Arms: between the neck and the crotch, rows with a run separated from the
  // body on each side. The inner edge of each arm is the median gap there.
  const leftGaps = [], rightGaps = [];
  for (let y = neck; y < crotch; y++) {
    const r = runs(mask, W, y, x0, x1);
    if (r.length >= 3) { rightGaps.push(r[0][1]); leftGaps.push(r[r.length - 1][0]); } // image left = the character's right arm
  }
  let armRightInner, armLeftInner;
  if (leftGaps.length >= h * 0.03) { found.arms = true; armRightInner = median(rightGaps); armLeftInner = median(leftGaps); }
  else {
    // Arms against the body: the rig's own proportion (each arm a quarter of the shoulder width).
    let lo = x1, hi = x0;
    for (let y = neck; y < crotch; y++) { const r = runs(mask, W, y, x0, x1); if (r.length) { lo = Math.min(lo, r[0][0]); hi = Math.max(hi, r[r.length - 1][1]); } }
    armRightInner = lo + (hi - lo) * 0.25; armLeftInner = hi - (hi - lo) * 0.25;
  }

  // The body's width below the neck: the torso is what's between the arms.
  const torso = { x0: Math.round(armRightInner), y0: neck, x1: Math.round(armLeftInner), y1: crotch };
  // Arms run from the shoulder (neck) down to their lowest opaque pixel.
  const armBottom = (xa, xb) => { let yb = neck; for (let y = neck; y < y1; y++) if (runs(mask, W, y, xa, xb).length) yb = y + 1; return yb; };
  const armOuter = (xa, xb) => { let lo = xb, hi = xa; for (let y = neck; y < crotch; y++) { const r = runs(mask, W, y, xa, xb); if (r.length) { lo = Math.min(lo, r[0][0]); hi = Math.max(hi, r[r.length - 1][1]); } } return [lo, hi]; };
  const [rl] = armOuter(x0, torso.x0), [, lh] = armOuter(torso.x1, x1);
  const armRight = { x0: Math.min(rl, torso.x0 - 1), y0: neck, x1: torso.x0, y1: armBottom(x0, torso.x0) };
  const armLeft = { x0: torso.x1, y0: neck, x1: Math.max(lh, torso.x1 + 1), y1: armBottom(torso.x1, x1) };
  // Legs stand under the torso (the hands hang beside them at the same height).
  const split2 = Math.round(Math.min(Math.max(legSplit, torso.x0 + 1), torso.x1 - 1));
  const legRight = { x0: torso.x0, y0: crotch, x1: split2, y1 };
  const legLeft = { x0: split2, y0: crotch, x1: torso.x1, y1 };
  // Head: everything above the neck (hair and ears included), at its own width.
  let hx0 = x1, hx1 = x0;
  for (let y = y0; y < neck; y++) { const r = runs(mask, W, y, x0, x1); if (r.length) { hx0 = Math.min(hx0, r[0][0]); hx1 = Math.max(hx1, r[r.length - 1][1]); } }
  const head = { x0: hx0, y0, x1: hx1, y1: neck };
  return { box: { x0, y0, x1, y1 }, head, torso, armLeft, armRight, legLeft, legRight, found };
}

// --------------------------------------------------------------- colours

/** A palette of at most k colours for the opaque pixels (median cut: split
 *  the box with the widest channel range at its median, until k boxes). */
export function palette(img, mask, k = 24) {
  const px = [];
  for (let i = 0; i < img.width * img.height; i++) if (mask[i]) px.push([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]]);
  if (!px.length) return [[128, 128, 128]];
  const range = b => [0, 1, 2].map(c => { let lo = 255, hi = 0; for (const p of b) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); } return hi - lo; });
  let boxes = [px];
  while (boxes.length < k) {
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; const r = range(b), c = r.indexOf(Math.max(...r)); if (r[c] > best) { best = r[c]; bi = i; ch = c; } });
    if (bi < 0 || best < 8) break;
    // Cut at the median, moved to the nearest change of value: flat-colour art
    // has long runs of one colour, and a cut inside a run blends two colours.
    const b = boxes[bi].sort((p, q) => p[ch] - q[ch]), mid = b.length >> 1;
    let m = mid;
    for (let d = 0; d < b.length; d++) {
      if (mid - d > 0 && b[mid - d - 1][ch] !== b[mid - d][ch]) { m = mid - d; break; }
      if (mid + d < b.length && mid + d > 0 && b[mid + d - 1][ch] !== b[mid + d][ch]) { m = mid + d; break; }
    }
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes.map(b => [0, 1, 2].map(c => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
}
const nearestIndex = (pal, r, g, b) => { let bi = 0, bd = Infinity; pal.forEach((p, i) => { const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };

// --------------------------------------------------------------- body part faces

// A face: { w, h, c: Int16Array w*h of palette indices, -1 = empty }.
const grid = (w, h) => ({ w, h, c: new Int16Array(w * h).fill(-1) });

// The front of a part: its image region resampled to w x h cells, crisp (one
// palette colour per cell, never a blend). Each cell votes among its opaque
// pixels' colours, with a colour's votes raised by how far it stands from the
// part's commonest colour: small, contrasting features (eyes, buttons) survive
// at low resolution, as a pixel artist would keep them. A colour needs at
// least minShare of the cell to compete; a cell under a third opaque stays empty.
function sampleRegion(img, mask, idx, pal, r, w, h, { contrast = 3, minShare = 0.15 } = {}) {
  const g = grid(w, h), W = img.width;
  const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
  const all = new Map();
  for (let y = Math.max(0, r.y0); y < Math.min(img.height, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) { const i = y * W + x; if (mask[i]) all.set(idx[i], (all.get(idx[i]) || 0) + 1); }
  let main = -1, mc = 0; for (const [k, v] of all) if (v > mc) { mc = v; main = k; }
  const dist = (a, b) => Math.hypot(pal[a][0] - pal[b][0], pal[a][1] - pal[b][1], pal[a][2] - pal[b][2]) / 441.7;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    const xa = r.x0 + Math.floor(cx * rw / w), xb = Math.max(xa + 1, r.x0 + Math.floor((cx + 1) * rw / w));
    const ya = r.y0 + Math.floor(cy * rh / h), yb = Math.max(ya + 1, r.y0 + Math.floor((cy + 1) * rh / h));
    const count = new Map(); let opaque = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      n++;
      const i = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= img.height || !mask[i]) continue;
      opaque++; count.set(idx[i], (count.get(idx[i]) || 0) + 1);
    }
    if (opaque * 3 < n) continue;
    let best = -1, bs = -1;
    for (const [k, v] of count) {
      if (v < opaque * minShare) continue;
      const score = v * (1 + contrast * (main >= 0 ? dist(k, main) : 0));
      if (score > bs) { bs = score; best = k; }
    }
    g.c[cy * w + cx] = best;
  }
  // Features: small blobs of one colour that stand out from what surrounds
  // them (eyes, pupils, teeth, buttons) are stamped into the cell under their
  // centre, strongest first, one per cell, so they survive any resolution.
  const cellArea = (rw / w) * (rh / h);
  for (const f of features(img, mask, idx, pal, r, cellArea)) {
    const cx = Math.min(w - 1, Math.floor((f.x - r.x0) * w / rw)), cy = Math.min(h - 1, Math.floor((f.y - r.y0) * h / rh)), k = cy * w + cx;
    if (g.stamped && g.stamped.has(k)) continue;
    (g.stamped || (g.stamped = new Set())).add(k);
    g.c[k] = f.colour;
  }
  return g;
}

// Small one-colour blobs inside region r, with their contrast against the
// colour around them; the ones a pixel artist would keep, strongest first.
function features(img, mask, idx, pal, r, cellArea, { minContrast = 0.25 } = {}) {
  const W = img.width, x0 = Math.max(0, r.x0), y0 = Math.max(0, r.y0), x1 = Math.min(W, r.x1), y1 = Math.min(img.height, r.y1);
  const rw = x1 - x0, rh = y1 - y0, label = new Int32Array(rw * rh).fill(-1), out = [];
  const dist = (a, b) => Math.hypot(pal[a][0] - pal[b][0], pal[a][1] - pal[b][1], pal[a][2] - pal[b][2]) / 441.7;
  let n = 0;
  for (let sy = 0; sy < rh; sy++) for (let sx = 0; sx < rw; sx++) {
    const si = (y0 + sy) * W + x0 + sx;
    if (label[sy * rw + sx] >= 0 || !mask[si]) continue;
    const col = idx[si], stack = [sy * rw + sx], around = new Map();
    let area = 0, mx = 0, my = 0, edge = false;
    label[sy * rw + sx] = n;
    while (stack.length) {
      const q = stack.pop(), qx = q % rw, qy = (q / rw) | 0;
      area++; mx += qx; my += qy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) { edge = true; continue; }
        const ni = (y0 + ny) * W + x0 + nx, nl = ny * rw + nx;
        if (!mask[ni]) { edge = true; continue; }
        if (idx[ni] === col) { if (label[nl] < 0) { label[nl] = n; stack.push(nl); } }
        else around.set(idx[ni], (around.get(idx[ni]) || 0) + 1);
      }
    }
    n++;
    // Enclosed (not touching the silhouette's edge), between a tenth of a cell and two cells.
    if (edge || area < Math.max(3, cellArea * 0.1) || area > cellArea * 2 || !around.size) continue;
    let sur = -1, sc = 0; for (const [k, v] of around) if (v > sc) { sc = v; sur = k; }
    const contrast = dist(col, sur);
    if (contrast >= minContrast) out.push({ x: x0 + mx / area, y: y0 + my / area, colour: col, score: contrast * Math.sqrt(area) });
  }
  return out.sort((a, b) => b.score - a.score);
}
// Empty cells take the nearest filled cell's colour (breadth first).
function fillEmpty(g, fallback) {
  const q = [];
  for (let i = 0; i < g.c.length; i++) if (g.c[i] >= 0) q.push(i);
  if (!q.length) { g.c.fill(fallback); return g; }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * g.w + nx;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || g.c[j] >= 0) continue;
      g.c[j] = g.c[i]; q.push(j);
    }
  }
  return g;
}
const mode = vals => { const m = new Map(); let best = vals[0], bc = 0; for (const v of vals) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } } return best; };

/** The six faces of each body part as palette-index grids.
 *  cells: { head: {w,h,d}, torso, armLeft, armRight, legLeft, legRight } in cells
 *  (the part's size in model units times the chosen density).
 *  Faces are named by the outward axis: px (+X, the character's left), nx,
 *  py (top), ny, pz (front), nz (back); each is laid out as seen from outside,
 *  upright (top and bottom: front edge toward the image's bottom for py, top for ny). */
export function partGrids(img, parts, cells, { mask = silhouette(img), colours = 24, sampling } = {}) {
  const pal = palette(img, mask, colours);
  const idx = new Int16Array(img.width * img.height);
  for (let i = 0; i < idx.length; i++) if (mask[i]) idx[i] = nearestIndex(pal, img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
  const out = {};
  for (const name of Object.keys(cells)) {
    const { w, h, d } = cells[name], q = parts[name];
    // A box edited by hand may come inverted or empty: order its edges, at least a pixel.
    const r = { x0: Math.min(q.x0, q.x1), x1: Math.max(q.x0 + 1, q.x1, Math.min(q.x0, q.x1) + 1), y0: Math.min(q.y0, q.y1), y1: Math.max(q.y0 + 1, q.y1, Math.min(q.y0, q.y1) + 1) };
    const front = sampleRegion(img, mask, idx, pal, r, w, h, sampling);
    const filled = front.c.filter(v => v >= 0);
    fillEmpty(front, filled.length ? mode(filled) : 0);
    const at = (x, y) => front.c[y * w + x];
    const limb = /^(arm|leg)/.test(name);
    // Back: a limb is the same all round, so its back is its front mirrored.
    // The head and torso hide their features behind: each row takes the colour
    // at the front's edge on that side (hair, ears, the shirt's own colour).
    const back = grid(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      back.c[y * w + x] = limb ? at(w - 1 - x, y) : (x < w / 2 ? at(w - 1, y) : at(0, y));
    // Sides carry the front's edge column back through the depth. Seen from
    // +X (the character's left) the front is on the image's left.
    const px = grid(d, h), nx = grid(d, h);
    for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) { px.c[y * d + z] = at(w - 1, y); nx.c[y * d + z] = at(0, y); }
    // Top and bottom: the front's top and bottom rows carried back. A head's
    // top is one colour, the commonest along its top two rows (hair or hat).
    const py = grid(w, d), ny = grid(w, d);
    const crown = mode(Array.from({ length: Math.min(2, h) * w }, (_, i) => at(i % w, (i / w) | 0)));
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      py.c[z * w + x] = name === 'head' ? crown : at(x, 0);
      ny.c[z * w + x] = at(x, h - 1);
    }
    out[name] = { pz: front, nz: back, px, nx, py, ny };
  }
  return { palette: pal, faces: out };
}

// --------------------------------------------------------------- painting the skin

/** Paint the skin through the model's own UVs.
 *  parts: { name: { tris: Float32Array [x,y,z, u,v] x3 per triangle (part-local),
 *  min: [x,y,z], max: [x,y,z] } } using findParts' names; size: the texture's size.
 *  Every texel a triangle covers takes the colour of the face cell under its 3D
 *  point; then painted texels bleed 4 px outward so filtering never reaches
 *  unpainted texture. Returns RGBA (size x size). */
export function paintSkin(parts, grids, { size = 1024, base } = {}) {
  const out = new Uint8ClampedArray(size * size * 4);
  if (base) out.set(base);
  const painted = new Uint8Array(size * size), pal = grids.palette;
  for (const [name, part] of Object.entries(parts)) {
    const faces = grids.faces[name]; if (!faces) continue;
    const { tris, min, max } = part, ext = [0, 1, 2].map(k => max[k] - min[k]);
    for (let t = 0; t < tris.length; t += 15) {
      const P = [0, 1, 2].map(k => [tris[t + k * 5], tris[t + k * 5 + 1], tris[t + k * 5 + 2]]);
      const U = [0, 1, 2].map(k => [tris[t + k * 5 + 3], tris[t + k * 5 + 4]]);
      // Which face: the triangle's own normal (positions, not the shared vertex normals).
      const e1 = [0, 1, 2].map(k => P[1][k] - P[0][k]), e2 = [0, 1, 2].map(k => P[2][k] - P[0][k]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const ax = [0, 1, 2].reduce((a, k) => Math.abs(n[k]) > Math.abs(n[a]) ? k : a, 0);
      const face = (n[ax] > 0 ? 'p' : 'n') + 'xyz'[ax], g = faces[face];
      // A point's cell on that face, as seen from outside (see partGrids).
      const s = (p, k) => (p[k] - min[k]) / (ext[k] || 1); // 0..1 along axis k
      const cellOf = p => {
        let a, b; // a: across (left to right), b: down (top to bottom)
        switch (face) {
          case 'pz': a = s(p, 0); b = 1 - s(p, 1); break;
          case 'nz': a = 1 - s(p, 0); b = 1 - s(p, 1); break;
          case 'px': a = 1 - s(p, 2); b = 1 - s(p, 1); break;
          case 'nx': a = s(p, 2); b = 1 - s(p, 1); break;
          case 'py': a = s(p, 0); b = s(p, 2); break;
          case 'ny': a = s(p, 0); b = 1 - s(p, 2); break;
        }
        const cx = Math.min(g.w - 1, Math.max(0, Math.floor(a * g.w))), cy = Math.min(g.h - 1, Math.max(0, Math.floor(b * g.h)));
        return g.c[cy * g.w + cx];
      };
      // UVs repeat: bring the triangle into [0,1) as a whole, then to texels (glTF v runs down).
      const fu = Math.floor(Math.min(U[0][0], U[1][0], U[2][0])), fv = Math.floor(Math.min(U[0][1], U[1][1], U[2][1]));
      const T = U.map(([u, v]) => [(u - fu) * size, (v - fv) * size]);
      const area = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[2][0] - T[0][0]) * (T[1][1] - T[0][1]);
      if (Math.abs(area) < 1e-9) continue;
      const xa = Math.max(0, Math.floor(Math.min(T[0][0], T[1][0], T[2][0]))), xb = Math.min(size - 1, Math.ceil(Math.max(T[0][0], T[1][0], T[2][0])));
      const ya = Math.max(0, Math.floor(Math.min(T[0][1], T[1][1], T[2][1]))), yb = Math.min(size - 1, Math.ceil(Math.max(T[0][1], T[1][1], T[2][1])));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        const w1 = ((T[2][0] - T[0][0]) * (qy - T[0][1]) - (qx - T[0][0]) * (T[2][1] - T[0][1])) / -area;
        const w2 = ((qx - T[0][0]) * (T[1][1] - T[0][1]) - (T[1][0] - T[0][0]) * (qy - T[0][1])) / -area;
        const w0 = 1 - w1 - w2, eps = -1e-6;
        if (w0 < eps || w1 < eps || w2 < eps) continue;
        const p = [0, 1, 2].map(k => w0 * P[0][k] + w1 * P[1][k] + w2 * P[2][k]);
        const c = pal[Math.max(0, cellOf(p))], o = (y * size + x) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; painted[y * size + x] = 1;
      }
    }
  }
  // Bleed: unpainted texels next to painted ones copy them, 4 rounds.
  for (let round = 0; round < 4; round++) {
    const add = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (painted[y * size + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || painted[ny * size + nx] !== 1) continue;
        add.push(y * size + x, ny * size + nx); break;
      }
    }
    for (let k = 0; k < add.length; k += 2) { out.copyWithin(add[k] * 4, add[k + 1] * 4, add[k + 1] * 4 + 4); painted[add[k]] = 2; }
    for (let i = 0; i < painted.length; i++) if (painted[i] === 2) painted[i] = 1;
  }
  return out;
}

// --------------------------------------------------------------- the rig

// The blocky character's mesh names, as findParts names them.
export const PART_NAMES = { head: 'head', torso: 'torso', 'arm-left': 'armLeft', 'arm-right': 'armRight', 'leg-left': 'legLeft', 'leg-right': 'legRight' };

/** A character model's parts (parseGlb output) and each part's size in cells,
 *  for headPx cells across the head (8 Minecraft-like, 16 default, 32 fine). */
export function rigFromGlb(glb, headPx = 16) {
  const { meshes } = glb, parts = {}, cells = {};
  const size = n => { const m = meshes[n]; return [0, 1, 2].map(k => (m.max[k] - m.min[k]) * m.scale[k]); };
  const perUnit = headPx / size('head')[0];
  for (const [mesh, name] of Object.entries(PART_NAMES)) {
    if (!meshes[mesh]) throw new Error(`the model has no '${mesh}' mesh`);
    const m = meshes[mesh], [w, h, d] = size(mesh);
    parts[name] = { tris: m.tris, min: m.min, max: m.max };
    cells[name] = { w: Math.max(1, Math.round(w * perUnit)), h: Math.max(1, Math.round(h * perUnit)), d: Math.max(1, Math.round(d * perUnit)) };
  }
  return { parts, cells };
}

/** Reference image + its part boxes + rig -> { skin (RGBA size x size), grids }.
 *  base: the model's own texture, kept where no part is painted. */
export function makeSkin(img, found, rig, { size = 1024, base, sampling } = {}) {
  const grids = partGrids(img, found, rig.cells, { sampling });
  return { skin: paintSkin(rig.parts, grids, { size, base }), grids };
}
