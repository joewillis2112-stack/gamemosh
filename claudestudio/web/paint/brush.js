// The studio's brush engine: PhotoCraft's (github.com/storytold/photocraft,
// crates/paint, MIT/Apache) ported to JavaScript and checked against it pixel
// for pixel (test/paint.test.mjs, oracle tools/paint-oracle).
//
// A stroke is data: input points become dabs (spacing, pressure, seeded
// jitter), dabs build up a per-pixel coverage toward each dab's opacity
// ceiling (Flow builds up within a stroke, Opacity caps it, as in Photoshop),
// and the stroke composites once over the image as it was when the stroke began.
//
// Kept from PhotoCraft: computed round tips (hardness, roundness, angle), the
// small-tip 4x4 sampling, spacing, the Pencil (aliased tips step pixel by pixel),
// pressure for size and opacity, Shape Dynamics (size, angle, roundness),
// Transfer (opacity, flow), the eraser, Normal blending.
// Left out (not needed for painting textures yet): sampled tips, texture, dual
// brush, scattering, colour dynamics, smoothing, airbrush build-up, wet edges,
// noise, brush pose and projection, blend modes other than Normal.
//
// Numbers follow the Rust code's f32 arithmetic (Math.fround) where it uses f32,
// so the two agree to float rounding.
const f = Math.fround;
const RAD = f(f(Math.PI) / 180);
const SMALL_TIP_RADIUS = 3;
const SUBPIXEL = [-0.375, -0.125, 0.125, 0.375];
const MAX_BRUSH_SIZE = 5000;
const STREAM = { SIZE: 1n, ANGLE: 2n, ROUNDNESS: 3n, FLIP_X: 4n, FLIP_Y: 5n, OPACITY: 9n, FLOW: 10n };

// ------------------------------------------------------------- settings

export const CONTROL = ['off', 'fade', 'penPressure', 'penTilt', 'stylusWheel', 'rotation', 'initialDirection', 'direction'];
// PhotoCraft stores every setting as f32: round them here, or 0.1 spacing drifts from its.
const dynamic = (d = {}) => { const o = { jitter: 0, control: 'off', fadeSteps: 25, minimum: 0, ...d }; o.jitter = f(o.jitter); o.minimum = f(o.minimum); return o; };
const F32 = ['size', 'hardness', 'spacing', 'opacity', 'flow', 'angle', 'roundness'];

/** A complete brush with PhotoCraft's defaults; `o` overrides any field (camelCase, as its JSON). */
export function brush(o = {}) {
  const sd = o.shapeDynamics || {}, tr = o.transfer || {};
  const b = {
    size: 20, hardness: 1, spacing: 0.1, opacity: 1, flow: 1, pressureSize: true, pressureOpacity: false,
    color: [0, 0, 0, 1], erase: false, angle: 0, roundness: 1, flipX: false, flipY: false, aliased: false, seed: 0,
    ...o,
    shapeDynamics: { enabled: false, flipXJitter: false, flipYJitter: false, ...sd, size: dynamic(sd.size), angle: dynamic(sd.angle), roundness: dynamic(sd.roundness) },
    transfer: { enabled: false, ...tr, opacity: dynamic(tr.opacity), flow: dynamic(tr.flow) },
  };
  for (const k of F32) b[k] = f(b[k]);
  b.color = b.color.map(f);
  return b;
}

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const point = p => Array.isArray(p) ? { x: p[0], y: p[1], pressure: f(p[2] ?? 1), tiltX: 0, tiltY: 0, rotation: 0, wheel: 1 }
  : { pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, wheel: 1, ...p, pressure: f(p.pressure ?? 1) };

// ------------------------------------------------------------- seeded randomness (PhotoCraft's rng.rs)

const M64 = (1n << 64n) - 1n;
function mix64(z) {
  z = (z + 0x9E3779B97F4A7C15n) & M64;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M64;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M64;
  return z ^ (z >> 31n);
}
export function rand01(seed, index, stream) {
  const h = mix64(BigInt.asUintN(64, BigInt(seed)) ^ mix64(((BigInt(index) * 0xD1B54A32D192ED03n) & M64) ^ ((stream * 0x8CB92BA72F3D8DD7n) & M64)));
  return Number(h >> 40n) / 16777216;
}
const randSigned = (seed, i, s) => f(rand01(seed, i, s) * 2 - 1);

// ------------------------------------------------------------- dynamics: points to dabs

function controlValue(c, fadeSteps, s) {
  const p = s.point;
  switch (c) {
    case 'fade': return f(1 - Math.min(f(s.step / Math.max(fadeSteps, 1)), 1));
    case 'penPressure': return clamp(p.pressure, 0, 1);
    case 'penTilt': return f(1 - clamp(f(f(Math.hypot(p.tiltX, p.tiltY)) / 90), 0, 1));
    case 'stylusWheel': return clamp(p.wheel, 0, 1);
    case 'rotation': return f((((p.rotation % 360) + 360) % 360) / 360);
    default: return 1;
  }
}
function controlAngle(c, fadeSteps, s) {
  const p = s.point;
  switch (c) {
    case 'fade': return f(360 * Math.min(f(s.step / Math.max(fadeSteps, 1)), 1));
    case 'penPressure': return f(360 * clamp(p.pressure, 0, 1));
    case 'penTilt': return p.tiltX === 0 && p.tiltY === 0 ? 0 : f(Math.atan2(-p.tiltY, p.tiltX) * 180 / Math.PI);
    case 'stylusWheel': return f(360 * clamp(p.wheel, 0, 1));
    case 'rotation': return p.rotation;
    case 'initialDirection': return f(s.initialDirection / RAD);
    case 'direction': return f(s.direction / RAD);
    default: return 0;
  }
}
// A 0..1 multiplier: control lerps from `minimum` to 1, jitter reduces randomly, never below `minimum`.
function scalar(d, s, r) {
  if (!(d.jitter > 0 || d.control !== 'off')) return 1;
  const min = clamp(d.minimum, 0, 1), cv = controlValue(d.control, d.fadeSteps, s);
  return Math.max(f(f(min + f(f(1 - min) * cv)) * f(1 - f(clamp(d.jitter, 0, 1) * r))), min);
}
function baseDiameter(b, s) {
  const sd = b.shapeDynamics;
  let k = 1;
  if (sd.enabled && sd.size.control !== 'off') {
    const min = clamp(sd.size.minimum, 0, 1);
    k = f(min + f(f(1 - min) * controlValue(sd.size.control, sd.size.fadeSteps, s)));
  } else if (b.pressureSize) k = clamp(s.point.pressure, 0, 1);
  return f(b.size * k);
}
const stepLen = (b, p) => Math.max(f(Math.max(baseDiameter(b, { point: p, step: 0 }), 1) * Math.max(b.spacing, 0.01)), 0.5);

const lerpPt = (a, b, t) => {
  const tf = f(t), l = (u, v) => f(u + f(f(v - u) * tf));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pressure: l(a.pressure, b.pressure), tiltX: l(a.tiltX, b.tiltX), tiltY: l(a.tiltY, b.tiltY), rotation: l(a.rotation, b.rotation), wheel: l(a.wheel, b.wheel) };
};

/** Pencil grid: the centre of the pixel holding the point (odd diameters) or the nearest corner (even). */
export function gridCenter(x, y, diameter) {
  const n = Number.isFinite(diameter) ? Math.max(Math.round(diameter), 1) : 1;
  const snap = v => n % 2 === 1 ? Math.floor(v) + 0.5 : roundHalfAway(v);
  return [f(snap(x)), f(snap(y))];
}
const roundHalfAway = v => Math.sign(v) * Math.round(Math.abs(v)); // Rust's f64::round

/** Turns input points into dabs as they arrive (PhotoCraft's DabGenerator, path walker and builder). */
export class DabGenerator {
  constructor(b) {
    this.b = { ...b, size: Number.isFinite(b.size) ? clamp(b.size, 0.5, MAX_BRUSH_SIZE) : 0.5 };
    this.last = null; this.pendingFirst = null; this.nextAt = 0;
    this.initialDir = null; this.dir = 0; this.step = 0; this.index = 0;
    // A small aliased tip whose dabs are at most a pixel apart steps pixel by pixel.
    this.grid = this.b.aliased && f(this.b.size * Math.max(this.b.spacing, 0.01)) <= 1 ? gridCenter(0, 0, this.b.size)[0] : null;
  }
  emit(p, out) {
    this.build({ point: p, direction: this.dir, initialDirection: this.initialDir ?? this.dir, step: this.step++ }, out);
  }
  push(pts, out = []) {
    for (const raw of pts) {
      const p = point(raw), a = this.last;
      if (!a) { this.last = p; this.pendingFirst = p; this.nextAt = stepLen(this.b, p); continue; }
      const dx = p.x - a.x, dy = p.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1e-9) { this.dir = f(Math.atan2(-dy, dx)); if (this.initialDir === null) this.initialDir = this.dir; }
      if (this.pendingFirst) { const q = this.pendingFirst; this.pendingFirst = null; this.emit(q, out); }
      if (len > 1e-9 && !(this.grid !== null && this.gridSteps(a, p, this.grid, out))) {
        while (this.nextAt <= len + 1e-9) {
          const q = lerpPt(a, p, Math.min(this.nextAt / len, 1));
          this.emit(q, out);
          this.nextAt += Math.max(stepLen(this.b, q), 0.25);
        }
        this.nextAt -= len;
      }
      this.last = p;
    }
    return out;
  }
  // One step per pixel along the segment's major axis, at each pixel's dab centre.
  gridSteps(a, p, offset, out) {
    const cell = v => offset > 0 ? Math.floor(v) : roundHalfAway(v);
    const x0 = cell(a.x), y0 = cell(a.y), dx = cell(p.x) - x0, dy = cell(p.y) - y0, n = Math.max(Math.abs(dx), Math.abs(dy));
    if (!Number.isFinite(n) || n > 1e7) return false;
    for (let i = 1; i <= n; i++) {
      const q = lerpPt(a, p, i / n);
      q.x = x0 + roundHalfAway(dx * i / n) + offset; q.y = y0 + roundHalfAway(dy * i / n) + offset;
      this.emit(q, out);
    }
    return true;
  }
  finish(out = []) {
    if (this.pendingFirst) { const q = this.pendingFirst; this.pendingFirst = null; this.emit(q, out); }
    return out;
  }
  build(s, out) {
    const b = this.b, sd = b.shapeDynamics, tr = b.transfer, seed = b.seed, i = this.index++;
    const r = st => rand01(seed, i, st);
    let diameter = baseDiameter(b, s), angle = f(b.angle), roundness = clamp(b.roundness, 0.01, 1), fx = b.flipX, fy = b.flipY;
    if (sd.enabled) {
      if (sd.size.jitter > 0) diameter = f(diameter * Math.max(f(1 - f(clamp(sd.size.jitter, 0, 1) * r(STREAM.SIZE))), clamp(sd.size.minimum, 0, 1)));
      angle = f(angle + f(controlAngle(sd.angle.control, sd.angle.fadeSteps, s) + f(f(randSigned(seed, i, STREAM.ANGLE) * clamp(sd.angle.jitter, 0, 1)) * 180)));
      roundness = clamp(f(roundness * scalar(sd.roundness, s, r(STREAM.ROUNDNESS))), 0.01, 1);
      if (sd.flipXJitter && r(STREAM.FLIP_X) < 0.5) fx = !fx;
      if (sd.flipYJitter && r(STREAM.FLIP_Y) < 0.5) fy = !fy;
    }
    let opacity = 1, flow = f(b.flow);
    if (tr.enabled) { opacity = scalar(tr.opacity, s, r(STREAM.OPACITY)); flow = f(flow * scalar(tr.flow, s, r(STREAM.FLOW))); }
    if (b.pressureOpacity && !(tr.enabled && tr.opacity.control !== 'off')) opacity = f(opacity * clamp(s.point.pressure, 0, 1));
    out.push({ x: s.point.x, y: s.point.y, radius: Math.max(f(diameter / 2), 0.5), alpha: clamp(flow, 0, 1), opacity: clamp(opacity, 0, 1),
      angle: f(angle * RAD), roundness, flipX: fx, flipY: fy, index: i });
  }
}

/** All dabs of a whole stroke. */
export function dabs(b, points) { const g = new DabGenerator(b); const out = g.push(points); return g.finish(out); }

// ------------------------------------------------------------- tips: dabs to coverage

/** A round tip's opacity at `d` from the centre: 1 in the hard core, then (1 - t²)⁴ to 0 at the radius. */
export function tipFalloff(d, radius, hardness) {
  const inner = f(radius * clamp(hardness, 0, 1));
  if (d <= inner || f(radius - inner) < 1e-3) return 1;
  const t = clamp(f(f(d - inner) / f(radius - inner)), 0, 1), s = f(1 - f(t * t)), s2 = f(s * s);
  return f(s2 * s2);
}
export function dabCoverage(d, radius, hardness) {
  if (d >= f(radius + 0.5)) return 0;
  return f(Math.min(clamp(f(f(radius + 0.5) - d), 0, 1), 1) * tipFalloff(d, radius, hardness));
}
/** The pixel rectangle [x0, y0, x1, y1) a dab can touch. */
export function dabRect(d) {
  const rr = Math.ceil(d.radius) + 1, cx = Math.floor(d.x), cy = Math.floor(d.y);
  return [cx - rr, cy - rr, cx + rr + 1, cy + rr + 1];
}
/** One dab's coverage (tip shape x flow) over its rectangle, row by row. */
export function rasterize(b, d, rect = dabRect(d)) {
  const [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0, out = new Float32Array(w * h);
  const aliased = b.aliased, hardness = b.hardness;
  const [cx, cy] = aliased ? gridCenter(d.x, d.y, f(2 * d.radius)) : [f(d.x), f(d.y)];
  const sn = f(Math.sin(d.angle)), cs = f(Math.cos(d.angle)), fx = d.flipX ? -1 : 1, fy = d.flipY ? -1 : 1;
  const r = d.radius, ro = Math.min(Math.max(d.roundness, f(0.5 / r)), 1), rm = Math.max(f(r * ro), 0.5);
  const reach2 = f(f(rm + 0.5) * f(rm + 0.5)), small = !aliased && rm < SMALL_TIP_RADIUS, smallReach2 = f(f(rm + 0.75) * f(rm + 0.75));
  const tip = (dx, dy) => { const ux = dx, uy = -dy; return [f(f(f(ux * cs) + f(uy * sn)) * fx), f(f(f(-ux * sn) + f(uy * cs)) * fy)]; };
  for (let yy = 0; yy < h; yy++) {
    const dy = f(f(y0 + yy + 0.5) - cy);
    for (let xx = 0; xx < w; xx++) {
      const dx = f(f(x0 + xx + 0.5) - cx), [u, v] = tip(dx, dy);
      const d2 = f(f(f(u * ro) * f(u * ro)) + f(v * v));
      let val;
      if (small) {
        if (d2 >= smallReach2) continue;
        let sum = 0;
        for (const sy of SUBPIXEL) for (const sx of SUBPIXEL) {
          const [su, sv] = tip(f(dx + sx), f(dy + sy)), sd = f(Math.sqrt(f(f(f(su * ro) * f(su * ro)) + f(sv * sv))));
          const inside = clamp(f(f(f(rm - sd) * 4) + 0.5), 0, 1);
          if (inside > 0) sum = f(sum + f(inside * tipFalloff(Math.min(sd, rm), rm, hardness)));
        }
        val = f(sum / 16);
      } else {
        if (d2 >= reach2) continue;
        const dd = f(Math.sqrt(d2));
        val = aliased ? (dd <= rm ? 1 : 0) : dabCoverage(dd, rm, hardness);
      }
      if (val > 0) out[yy * w + xx] = f(val * d.alpha);
    }
  }
  return out;
}

// ------------------------------------------------------------- strokes onto an image

/** An RGBA image of straight (not premultiplied) floats, 0..1. */
export function image(width, height, fill = null) {
  const data = new Float32Array(width * height * 4);
  if (fill) for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}

/**
 * One stroke in progress over `img`. The image as it was at the start is kept,
 * coverage builds up as points arrive, and `composite()` redraws the touched
 * area from the kept image, so a stroke never builds up on itself.
 */
export class Stroke {
  constructor(img, settings) {
    this.img = img; this.b = brush(settings); this.gen = new DabGenerator(this.b);
    this.pre = img.data.slice(); this.cov = new Float32Array(img.width * img.height);
    this.dirty = null; this.dabCount = 0;
  }
  push(points) { this.accumulate(this.gen.push(points)); return this; }
  finish() { this.accumulate(this.gen.finish()); return this.composite(); }
  accumulate(ds) {
    const { width: W, height: H } = this.img;
    for (const d of ds) {
      this.dabCount++;
      const rect = dabRect(d), vals = rasterize(this.b, d, rect), w = rect[2] - rect[0], ceil = d.opacity;
      const x0 = Math.max(rect[0], 0), y0 = Math.max(rect[1], 0), x1 = Math.min(rect[2], W), y1 = Math.min(rect[3], H);
      if (x1 <= x0 || y1 <= y0) continue;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const v = vals[(y - rect[1]) * w + (x - rect[0])];
        if (v <= 0) continue;
        const i = y * W + x, c = this.cov[i], nv = ceil > c ? f(c + f(v * f(ceil - c))) : c;
        if (nv > c) this.cov[i] = nv;
      }
      this.dirty = this.dirty ? [Math.min(this.dirty[0], x0), Math.min(this.dirty[1], y0), Math.max(this.dirty[2], x1), Math.max(this.dirty[3], y1)] : [x0, y0, x1, y1];
    }
  }
  /** Redraw the stroke's area from the image as it was, plus the stroke. Returns that rectangle (or null). */
  composite() {
    const r = this.dirty; if (!r) return null;
    const { width: W } = this.img, D = this.img.data, P = this.pre, b = this.b, op = clamp(b.opacity, 0, 1);
    const src = b.color.map(f);
    for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) {
      const i = y * W + x, o = i * 4, c = this.cov[i];
      for (let k = 0; k < 4; k++) D[o + k] = P[o + k];
      if (c <= 0) continue;
      const k = Math.min(f(c * op), 1);
      if (k <= 0) continue;
      if (b.erase) { D[o + 3] = f(D[o + 3] * f(1 - k)); continue; }
      const da = D[o + 3], sa = f(src[3] * k), oa = f(sa + f(da * f(1 - sa)));
      if (oa > 0) for (let ch = 0; ch < 3; ch++) D[o + ch] = f(f(f(src[ch] * sa) + f(f(D[o + ch] * da) * f(1 - sa))) / oa);
      D[o + 3] = oa;
    }
    return r;
  }
}

/** Paint a whole stroke onto `img` in one go. Returns the changed rectangle. */
export function paintStroke(img, settings, points) {
  if (!points.length) return null;
  return new Stroke(img, settings).push(points).finish();
}
