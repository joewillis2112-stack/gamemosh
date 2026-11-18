// Gradient fills: VectorCraft's gradient model (crates/color/src/gradient.rs; github.com/storytold/
// vectorcraft, MIT/Apache) ported to JS and checked against the Rust (tools/vector-oracle,
// test/vector.test.mjs): stops with Illustrator's midpoints, sampling (f32, as the Rust), midpoints
// expanded into plain stops for renderers without them (SVG), the default placement on an object's
// bounds at an angle, and the gradient parameter at a point. Engine-free. Coordinates are y-down.
//
// A stop is { offset, color: [r, g, b] (0..1), opacity, midpoint }; a gradient paint is
// { kind: 'linear' | 'radial', stops, angle, geom? }: placed on its object's bounds at each render,
// as a fresh gradient is in VectorCraft (GradientPaint with no geom), until the annotator's handles
// place it (geom: { start, end, aspect }). Stops are added, moved and removed as gradient.rs does.
const f = Math.fround;

export const stop = (offset, color, opacity = 1, midpoint = 0.5) => ({ offset, color, opacity, midpoint });

/** Colour ([r, g, b]) and opacity at t (Gradient::sample, midpoints honoured). */
export function sample(stops, t) {
  t = f(t);
  if (!stops.length) return [[0, 0, 0], 1];
  const s0 = stops[0];
  if (t <= f(s0.offset)) return [s0.color.map(f), f(s0.opacity)];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1], ao = f(a.offset), bo = f(b.offset);
    if (t <= bo) {
      const span = Math.max(f(bo - ao), f(1e-6)), u = f(f(t - ao) / span);
      const m = Math.min(Math.max(f(a.midpoint), f(0.01)), f(0.99));
      const v = u < m ? f(f(f(0.5) * u) / m) : f(f(0.5) + f(f(f(0.5) * f(u - m)) / f(f(1) - m)));
      const ca = a.color.map(f), cb = b.color.map(f);
      return [ca.map((x, k) => f(x + f(f(cb[k] - x) * v))), f(f(a.opacity) + f(f(f(b.opacity) - f(a.opacity)) * v))];
    }
  }
  const l = stops[stops.length - 1];
  return [l.color.map(f), f(l.opacity)];
}

/** The stops with each off-centre midpoint made a stop of its own (Gradient::expanded_stops): [t, [r, g, b], opacity]. */
export function expanded(stops) {
  const out = [];
  stops.forEach((s, i) => {
    out.push([f(s.offset), s.color.map(f), f(s.opacity)]);
    const n = stops[i + 1];
    if (n && Math.abs(f(s.midpoint) - f(0.5)) > f(1e-3)) {
      const t = f(f(s.offset) + f(f(f(n.offset) - f(s.offset)) * f(s.midpoint))), [c, o] = sample(stops, t);
      out.push([t, c, o]);
    }
  });
  return out;
}

/** Default placement on bounds [x0, y0, x1, y1] (GradientGeom::fit): a linear gradient spans the
 *  box through its centre at `angle` degrees (counter-clockwise on screen); a radial one is centred,
 *  its radius half the larger side, its vector at `angle`. */
export function fit(kind, [x0, y0, x1, y1], angle) {
  const c = [(x0 + x1) / 2, (y0 + y1) / 2], w = x1 - x0, h = y1 - y0, a = angle * (Math.PI / 180), d = [Math.cos(a), -Math.sin(a)];
  if (kind === 'radial') { const r = Math.max(w, h) / 2; return { start: c, end: [c[0] + d[0] * r, c[1] + d[1] * r], aspect: 1 }; }
  const half = (w * Math.abs(d[0]) + h * Math.abs(d[1])) / 2;
  return { start: [c[0] - d[0] * half, c[1] - d[1] * half], end: [c[0] + d[0] * half, c[1] + d[1] * half], aspect: 1 };
}

/** The gradient parameter at point p (GradientGeom::param_at, no focal point): 0 at the start, 1 at the end. */
export function paramAt(kind, g, p) {
  const u = [g.end[0] - g.start[0], g.end[1] - g.start[1]], u2 = u[0] * u[0] + u[1] * u[1];
  if (u2 < 1e-18) return 0;
  if (kind !== 'radial') return ((p[0] - g.start[0]) * u[0] + (p[1] - g.start[1]) * u[1]) / u2;
  if (!(u2 * Math.abs(g.aspect) > 1e-18)) return 0;
  // The inverse of the unit frame [u.x, u.y, -u.y·aspect, u.x·aspect, start] (kurbo's Affine::inverse).
  const [a, b, c, d, e, ff] = [u[0], u[1], -u[1] * g.aspect, u[0] * g.aspect, g.start[0], g.start[1]];
  const inv = 1 / (a * d - b * c), m = [inv * d, -inv * b, -inv * c, inv * a, inv * (c * ff - d * e), inv * (b * e - a * ff)];
  return Math.hypot(m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]);
}

// ---- stop editing (gradient.rs: the Gradient panel and annotator share these)
export const MIN_STOPS = 2;
const placeStop = (stops, st) => { let i = stops.findIndex(o => f(o.offset) > f(st.offset)); if (i < 0) i = stops.length; stops.splice(i, 0, st); return i; };
const copyStop = st => ({ ...st, color: [...st.color] });
/** A stop at `offset`, coloured by sampling the gradient there (insert_stop): [stops, its index]. */
export function insertStop(stops, offset) {
  offset = Math.min(Math.max(f(offset), 0), 1);
  const [color, opacity] = sample(stops, offset), out = stops.map(copyStop);
  return [out, placeStop(out, { offset, color, opacity, midpoint: 0.5 })];
}
/** Stop i taken out (remove_stop); null if that would leave fewer than two. */
export function removeStop(stops, i) {
  if (stops.length <= MIN_STOPS || i < 0 || i >= stops.length) return null;
  const out = stops.map(copyStop); out.splice(i, 1); return out;
}
/** Stop i moved to `offset`, the list kept in order (move_stop): [stops, its new index]. */
export function moveStop(stops, i, offset) {
  const out = stops.map(copyStop); if (i < 0 || i >= out.length) return [out, i];
  const [st] = out.splice(i, 1); st.offset = Math.min(Math.max(f(offset), 0), 1);
  return [out, placeStop(out, st)];
}
/** Where paint `g` sits on bounds b: its own placement (moved by the annotator), else fitted at its angle (GradientPaint::resolve). */
export const resolve = (g, b) => g.geom || fit(g.kind, b, g.angle || 0);

const hex2 = v => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, '0');
export const toHex = c => '#' + c.map(hex2).join('');
export const fromHex = h => [1, 3, 5].map(i => f(parseInt(h.slice(i, i + 2), 16) / 255));

/** An SVG <linearGradient>/<radialGradient> element for paint `g` on bounds `b`, with id `id`. */
export function toSvgDef(id, g, b) {
  const geo = resolve(g, b), n = v => +v.toFixed(4);
  const stops = expanded(g.stops).map(([t, c, o]) => `<stop offset="${n(t)}" stop-color="${toHex(c)}"${o < 1 ? ` stop-opacity="${n(o)}"` : ''}/>`).join('');
  if (g.kind === 'radial') {
    const r = Math.hypot(geo.end[0] - geo.start[0], geo.end[1] - geo.start[1]);
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(geo.start[0])}" cy="${n(geo.start[1])}" r="${n(r)}">${stops}</radialGradient>`;
  }
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(geo.start[0])}" y1="${n(geo.start[1])}" x2="${n(geo.end[0])}" y2="${n(geo.end[1])}">${stops}</linearGradient>`;
}
