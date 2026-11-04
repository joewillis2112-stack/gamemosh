// Vector geometry: VectorCraft's anchor path model, shape generators and Live Corners
// (crates/geom: path.rs, shapes.rs, corners.rs; github.com/storytold/vectorcraft, MIT/Apache),
// ported to JS and checked against the Rust (tools/vector-oracle, test/vector.test.mjs).
// Engine-free. Coordinates are y-down.
//
// A path is a list of subpaths { anchors, closed }; an anchor is { p, in, out, kind } with
// absolute handle positions ([x, y]); a handle equal to p means none. kind is 'Corner' (handles
// move independently) or 'Smooth' (handles stay in line).

export const KAPPA = 0.5522847498307936;
const EPS = 1e-9, MIN_SINE = 1e-6, ARCLEN_ACCURACY = 1e-6;
export const CORNER_KINDS = ['Round', 'InvertedRound', 'Chamfer'];

// ---- 2D vectors as [x, y]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0], len = a => Math.hypot(a[0], a[1]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const absRect = ([x0, y0, x1, y1]) => [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];

// ---- anchors and subpaths
export const corner = p => ({ p: [...p], in: [...p], out: [...p], kind: 'Corner' });
export const anchor = (p, hIn, hOut, kind = 'Corner') => ({ p: [...p], in: [...hIn], out: [...hOut], kind });
export const hasIn = a => dist(a.in, a.p) > EPS, hasOut = a => dist(a.out, a.p) > EPS;
export const polyline = (points, closed) => ({ anchors: points.map(corner), closed });
export const segmentCount = sp => sp.anchors.length < 2 ? 0 : sp.closed ? sp.anchors.length : sp.anchors.length - 1;
export function segment(sp, i) {
  const n = sp.anchors.length, a = sp.anchors[i % n], b = sp.anchors[(i + 1) % n];
  return [a.p, a.out, b.in, b.p];
}
const segmentIsLine = (sp, i) => { const n = sp.anchors.length; return !hasOut(sp.anchors[i % n]) && !hasIn(sp.anchors[(i + 1) % n]); };

/** Place the end of the out (or in) handle at pos. `independent` makes the anchor a corner first;
 *  a smooth anchor keeps its other handle in line, at its length (path.rs set_handle). */
export function setHandle(a, out, pos, independent = false) {
  if (independent) a.kind = 'Corner';
  const smooth = a.kind === 'Smooth', moved = out ? 'out' : 'in', other = out ? 'in' : 'out';
  a[moved] = [...pos];
  if (smooth) {
    const l0 = dist(a[other], a.p), d = sub(a.p, pos), l = len(d);
    if (l > 1e-9) a[other] = add(a.p, mul(d, l0 / l));
  }
}
export function translate(path, [dx, dy]) {
  for (const sp of path) for (const a of sp.anchors) for (const k of ['p', 'in', 'out']) { a[k][0] += dx; a[k][1] += dy; }
}
export const clone = path => path.map(sp => ({ closed: sp.closed, anchors: sp.anchors.map(a => anchor(a.p, a.in, a.out, a.kind)) }));

// ---- cubic Béziers as [p0, p1, p2, p3]
export function evalCubic([p0, p1, p2, p3], t) {
  const mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
function derivCubic([p0, p1, p2, p3], t) {
  const mt = 1 - t, a = 3 * mt * mt, b = 6 * mt * t, c = 3 * t * t;
  return [a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]), a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1])];
}
/** The part of a cubic between t0 and t1, as a cubic (de Casteljau twice). */
export function subsegment(c, t0, t1) {
  const split = ([p0, p1, p2, p3], t) => { // the part after t
    const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const q0 = l(p0, p1), q1 = l(p1, p2), q2 = l(p2, p3), r0 = l(q0, q1), r1 = l(q1, q2), s = l(r0, r1);
    return { before: [p0, q0, r0, s], after: [s, r1, q2, p3] };
  };
  const tail = split(c, t0).after;
  if (t0 >= 1) return [c[3], c[3], c[3], c[3]];
  return split(tail, (t1 - t0) / (1 - t0)).before;
}
// Arc length by Gauss–Legendre on halves until two levels agree to `accuracy`.
const GL = [[-0.9061798459386640, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665], [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.9061798459386640, 0.2369268850561891]];
function glLen(c, a, b) { let s = 0; for (const [x, w] of GL) s += w * len(derivCubic(c, (a + b) / 2 + (b - a) / 2 * x)); return s * (b - a) / 2; }
function arclenRange(c, a, b, accuracy, whole = glLen(c, a, b), depth = 0) {
  const m = (a + b) / 2, l = glLen(c, a, m), r = glLen(c, m, b);
  if (Math.abs(l + r - whole) <= accuracy || depth > 24) return l + r;
  return arclenRange(c, a, m, accuracy / 2, l, depth + 1) + arclenRange(c, m, b, accuracy / 2, r, depth + 1);
}
export const arclen = (c, accuracy = ARCLEN_ACCURACY) => arclenRange(c, 0, 1, accuracy);
/** The t at which the arc length from the start is s (bisection to `accuracy` in length). */
export function invArclen(c, s, accuracy = ARCLEN_ACCURACY) {
  const total = arclen(c, accuracy / 4);
  if (s <= 0) return 0; if (s >= total) return 1;
  let lo = 0, hi = 1, at = 0;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2, l = at + arclenRange(c, lo, m, accuracy / 8);
    if (Math.abs(l - s) <= accuracy / 4) return m;
    if (l < s) { lo = m; at = l; } else hi = m;
  }
  return (lo + hi) / 2;
}

// ---- shapes (shapes.rs): Illustrator's anchor layouts
export const rectangle = r => { const [x0, y0, x1, y1] = absRect(r); return [polyline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true)]; };
/** Corners top-left, top-right, bottom-right, bottom-left (y down), each with its radius and kind. */
export const rectangleWithCorners = (r, radii, kinds) => cutCorners(rectangle(r), radii, kinds).path;
export const roundedRectangle = (r, radius) => rectangleWithCorners(r, [radius, radius, radius, radius], ['Round', 'Round', 'Round', 'Round']);
export function ellipse(r) {
  const [x0, y0, x1, y1] = absRect(r), c = [(x0 + x1) / 2, (y0 + y1) / 2], rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, kx = rx * KAPPA, ky = ry * KAPPA;
  const s = (p, hin) => anchor(p, add(p, hin), sub(p, hin), 'Smooth');
  return [{ anchors: [s([c[0] - rx, c[1]], [0, ky]), s([c[0], c[1] - ry], [-kx, 0]), s([c[0] + rx, c[1]], [0, -ky]), s([c[0], c[1] + ry], [kx, 0])], closed: true }];
}
/** A pie from `start` to `end` degrees, counterclockwise on screen from 3 o'clock, then through the centre. */
export function ellipsePie(r, start, end) {
  const span = (((end - start) % 360) + 360) % 360;
  if (!(Number.isFinite(start) && Number.isFinite(end)) || span < 1e-9 || 360 - span < 1e-9) return ellipse(r);
  const [x0, y0, x1, y1] = absRect(r), c = [(x0 + x1) / 2, (y0 + y1) / 2], rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const rad = d => d * Math.PI / 180;
  const at = d => [c[0] + rx * Math.cos(rad(d)), c[1] - ry * Math.sin(rad(d))];
  const tangent = d => [-rx * Math.sin(rad(d)), -ry * Math.cos(rad(d))];
  const pieces = span <= 90 ? 1 : span <= 180 ? 2 : span <= 270 ? 3 : 4, step = span / pieces;
  const k = 4 / 3 * Math.tan(rad(step) / 4);
  const anchors = [corner(c)];
  for (let i = 0; i <= pieces; i++) {
    const a = start + step * i, p = at(a), d = mul(tangent(a), k);
    anchors.push(anchor(p, i === 0 ? p : sub(p, d), i === pieces ? p : add(p, d), i === 0 || i === pieces ? 'Corner' : 'Smooth'));
  }
  return [{ anchors, closed: true }];
}
/** Regular polygon (≥ 3 sides), first vertex straight up. */
export function polygon(center, radius, sides, rotationDeg = 0) {
  const n = Math.max(sides, 3), rot = rotationDeg * Math.PI / 180, pts = [];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rot + 2 * Math.PI * i / n; pts.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]); }
  return [polyline(pts, true)];
}
/** Star with `points` tips (≥ 2), outer radius r1, inner r2, first tip up. */
export function star(center, r1, r2, points, rotationDeg = 0) {
  const n = Math.max(points, 2) * 2, rot = rotationDeg * Math.PI / 180, pts = [];
  for (let i = 0; i < n; i++) { const r = i % 2 === 0 ? r1 : r2, a = -Math.PI / 2 + rot + 2 * Math.PI * i / n; pts.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]); }
  return [polyline(pts, true)];
}
/** Inner radius of a straight-armed star (shoulders in line). */
export function straightStarInnerRadius(r1, points) { const n = Math.max(points, 3); return r1 * Math.cos(Math.PI / n * 2) / Math.cos(Math.PI / n); }
export const line = (a, b) => [polyline([a, b], false)];

// ---- Live Corners (corners.rs)
function side(curve) {
  const [p0, p1, p2, p3] = curve;
  const straight = dist(p1, p0) <= EPS && dist(p2, p3) <= EPS;
  return {
    curve, straight,
    direction() { for (const q of [p1, p2, p3]) { const d = sub(q, p0), l = len(d); if (l > EPS) { const u = mul(d, 1 / l); return Number.isFinite(u[0]) ? u : null; } } return null; },
    length() { return straight ? dist(p0, p3) : arclen(curve); },
    atLength(s, u) {
      if (straight) { const L = dist(p0, p3); return [L > EPS ? Math.min(Math.max(s / L, 0), 1) : 0, add(p0, mul(u, s)), u]; }
      const t = Math.min(Math.max(invArclen(curve, s), 0), 1), d = derivCubic(curve, t), l = len(d);
      return [t, evalCubic(curve, t), l > EPS ? mul(d, 1 / l) : u];
    },
  };
}
function cornerOf(sp, i, index) {
  const n = sp.anchors.length;
  let prev, next;
  if (sp.closed) { prev = (i + n - 1) % n; next = (i + 1) % n; } else { if (i === 0) return null; prev = i - 1; next = i + 1; }
  const a = sp.anchors[i], pa = sp.anchors[prev], na = sp.anchors[next];
  if (!a || !pa || !na || a.kind === 'Smooth') return null;
  const sideU = side([a.p, a.in, pa.out, pa.p]), sideV = side([a.p, a.out, na.in, na.p]);
  const u = sideU.direction(), v = sideV.direction(); if (!u || !v) return null;
  const lu = sideU.length(), lv = sideV.length();
  if (!(lu > EPS && lv > EPS && Number.isFinite(lu) && Number.isFinite(lv))) return null;
  const c = new Corner(index, a.p, u, v, lu, lv, sideU, sideV);
  return c.sin() > MIN_SINE ? c : null;
}
export class Corner {
  constructor(index, at, u, v, lu, lv, sideU, sideV) { Object.assign(this, { index, at, u, v, lu, lv, sideU, sideV }); }
  cos() { return dot(this.u, this.v); }
  sin() { return Math.abs(cross(this.u, this.v)); }
  angleDeg() { return Math.atan2(this.sin(), this.cos()) * 180 / Math.PI; }
  setback(r) { return r * (1 + this.cos()) / this.sin(); }
  maxRadius() { return Math.min(this.lu, this.lv) / 2 * this.sin() / (1 + this.cos()); }
  fitted(radius) { return Number.isNaN(radius) ? 0 : Math.min(Math.max(radius, 0), this.maxRadius()); }
  cut(radius, kind) {
    const s = this.setback(radius);
    const [tu, start, du] = this.sideU.atLength(s, this.u), [tv, end, dv] = this.sideV.atLength(s, this.v);
    const cos = dot(du, dv);
    let hOut, hIn;
    if (kind === 'InvertedRound') { const h = s * arcHandle(cos); hOut = add(start, mul(squareTo(du, dv), h)); hIn = add(end, mul(squareTo(dv, du), h)); }
    else if (kind === 'Chamfer') { hOut = start; hIn = end; }
    else { const h = radius * arcHandle(-cos); hOut = sub(start, mul(du, h)); hIn = sub(end, mul(dv, h)); }
    return { tu, tv, start, hOut, hIn, end };
  }
}
function squareTo(a, b) { const w = sub(b, mul(a, dot(a, b))), l = len(w); return l > EPS ? mul(w, 1 / l) : [0, 0]; }
function arcHandle(cos) {
  if (Math.abs(cos) < 1e-12) return KAPPA;
  cos = Math.min(Math.max(cos, -1), 1);
  const sh = Math.sqrt(Math.max((1 - cos) / 2, 0)), ch = Math.sqrt(Math.max((1 + cos) / 2, 0));
  return 4 / 3 * sh / (1 + ch);
}
/** The corners of `path` Live Corners can cut, in anchor order (index counts across subpaths). */
export function pathCorners(path) {
  const out = []; let first = 0;
  for (const sp of path) { for (let i = 0; i < sp.anchors.length; i++) { const c = cornerOf(sp, i, first + i); if (c) out.push(c); } first += sp.anchors.length; }
  return out;
}
/** `path` with each corner cut by radii[i] and kinds[i] at its anchor index (missing: 0, Round),
 *  each radius fitted. Returns { path, from } (from: per subpath, each anchor's source index). */
export function cutCorners(path, radii, kinds = []) {
  const corners = pathCorners(path); let ci = 0, first = 0;
  const subpaths = [], sources = [];
  for (const sp of path) {
    const n = sp.anchors.length;
    const cuts = sp.anchors.map((_, i) => {
      const index = first + i;
      if (ci >= corners.length || corners[ci].index !== index) return null;
      const c = corners[ci++], radius = c.fitted(radii[index] ?? 0);
      return radius > EPS ? c.cut(radius, kinds[index] ?? 'Round') : null;
    });
    const trimmed = sp.anchors.map((a, j) => {
      const k = (j + 1) % n, b = sp.anchors[k], from = cuts[j], to = cuts[k];
      if ((!from && !to) || (k === 0 && !sp.closed)) return null;
      if (!hasOut(a) && !hasIn(b)) return [from ? from.end : a.p, to ? to.start : b.p];
      const s0 = from ? from.tv : 0, s1 = to ? 1 - to.tu : 1;
      const c = subsegment([a.p, a.out, b.in, b.p], s0, Math.max(s1, s0));
      return [c[1], c[2]];
    });
    const anchors = [], from = []; let closing = null;
    sp.anchors.forEach((a, i) => {
      const index = first + i, tin = trimmed[(i + n - 1) % n], tout = trimmed[i];
      const hIn = tin ? tin[1] : a.in, hOut = tout ? tout[0] : a.out, c = cuts[i];
      if (c) {
        const start = anchor(c.start, hIn, c.hOut), end = anchor(c.end, c.hIn, hOut);
        if (i === 0 && sp.closed) closing = start; else { anchors.push(start); from.push(index); }
        anchors.push(end); from.push(index);
      } else { anchors.push(anchor(a.p, hIn, hOut, a.kind)); from.push(index); }
    });
    if (closing) { anchors.push(closing); from.push(first); }
    first += n;
    subpaths.push({ anchors, closed: sp.closed }); sources.push(from);
  }
  return { path: subpaths, from: sources };
}

// ---- output
const num = v => +v.toFixed(3);
/** SVG path data: lines where both handles are retracted, cubics otherwise. */
export function toSvgD(path) {
  let d = '';
  for (const sp of path) {
    if (!sp.anchors.length) continue;
    d += `M${num(sp.anchors[0].p[0])} ${num(sp.anchors[0].p[1])}`;
    const n = segmentCount(sp);
    for (let i = 0; i < n; i++) {
      if (sp.closed && i === n - 1 && segmentIsLine(sp, i)) break; // Z draws the closing line
      const [, p1, p2, p3] = segment(sp, i);
      d += segmentIsLine(sp, i) ? `L${num(p3[0])} ${num(p3[1])}` : `C${num(p1[0])} ${num(p1[1])} ${num(p2[0])} ${num(p2[1])} ${num(p3[0])} ${num(p3[1])}`;
    }
    if (sp.closed) d += 'Z';
  }
  return d;
}
/** Tight bounds [x0, y0, x1, y1] (curve extrema, not control points), or null. */
export function bounds(path) {
  let b = null;
  const grow = p => { b = b ? [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])] : [p[0], p[1], p[0], p[1]]; };
  for (const sp of path) {
    sp.anchors.forEach(a => grow(a.p));
    for (let i = 0; i < segmentCount(sp); i++) {
      const c = segment(sp, i);
      for (const axis of [0, 1]) { // roots of the derivative, a quadratic in t
        const [p0, p1, p2, p3] = c.map(p => p[axis]);
        const A = -p0 + 3 * p1 - 3 * p2 + p3, B = 2 * (p0 - 2 * p1 + p2), C = p1 - p0;
        const ts = Math.abs(A) < 1e-12 ? (Math.abs(B) < 1e-12 ? [] : [-C / B]) : (() => { const D = B * B - 4 * A * C; return D < 0 ? [] : [(-B + Math.sqrt(D)) / (2 * A), (-B - Math.sqrt(D)) / (2 * A)]; })();
        for (const t of ts) if (t > 0 && t < 1) grow(evalCubic(c, t));
      }
    }
  }
  return b;
}
