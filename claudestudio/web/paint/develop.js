// Develop adjustments (Lightroom's Basic, Tone Curve, Color Mixer, B&W and Color Grading panels):
// LightCraft's develop pipeline (github.com/storytold/lightcraft, MIT/Apache; crates/pipeline
// finish.rs, tone.rs, colorops.rs, local.rs; crates/color) for a rendered (non-raw) image, its
// per-pixel path only, ported to JS and checked against the Rust render (tools/develop-oracle,
// test/develop.test.mjs). Engine-free.
//
// Settings are LightCraft's DevelopSettings JSON (missing fields take its defaults):
//   light { exposure (EV), contrast, whites, blacks } (−100..100)
//   wb { mode: 'asShot' | 'custom', temp (K, 6500 = as shot), tint }
//   color { vibrance, saturation }, mixer { red|orange|yellow|green|aqua|blue|purple|magenta: { hue, sat, lum } }
//   treatment 'color' | 'bw', bw_mix { band: −100..100 }
//   grading { shadows|midtones|highlights|global: { hue, sat, lum }, blending, balance }
//   curve { highlights, lights, darks, shadows, split_*, master|red|green|blue: [{ x, y }], refine_saturation }
// Left out (spatial, or of no use on a texture): highlights/shadows, clarity, texture, dehaze,
// sharpening, noise reduction, lens and geometry, vignette, grain, Point Color, calibration, masks.

const f = Math.fround;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const PI = Math.PI, TAU = 2 * Math.PI;
const wrap = a => (((a + PI) % TAU) + TAU) % TAU - PI;

// ---- colour (crates/color): 3x3 matrices (row-major, f64), spaces, Bradford, CCT
const mmul = (a, b) => a.map((r, i) => [0, 1, 2].map(j => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const mapply = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const diag = (a, b, c) => [[a, 0, 0], [0, b, 0], [0, 0, c]];
function minv(m) {
  const d = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]), i = 1 / d;
  return [[(m[1][1] * m[2][2] - m[1][2] * m[2][1]) * i, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * i, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * i],
    [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) * i, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * i, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * i],
    [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) * i, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * i, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * i]];
}
const toF32 = m => m.map(r => r.map(f));
const xyz = ([x, y]) => [x / y, 1, (1 - x - y) / y];
const D65 = [0.3127, 0.3290];
const SRGB = { r: [0.64, 0.33], g: [0.30, 0.60], b: [0.15, 0.06], white: D65 };
const REC2020 = { r: [0.708, 0.292], g: [0.170, 0.797], b: [0.131, 0.046], white: D65 };
function toXyz(sp) {
  const p = [xyz(sp.r), xyz(sp.g), xyz(sp.b)], m = [[p[0][0], p[1][0], p[2][0]], [p[0][1], p[1][1], p[2][1]], [p[0][2], p[1][2], p[2][2]]];
  const s = mapply(minv(m), xyz(sp.white));
  return mmul(m, diag(...s));
}
const fromXyz = sp => minv(toXyz(sp));
const BRADFORD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
function bradford(src, dst) {
  if (src[0] === dst[0] && src[1] === dst[1]) return diag(1, 1, 1);
  const s = mapply(BRADFORD, xyz(src)), d = mapply(BRADFORD, xyz(dst));
  return mmul(mmul(minv(BRADFORD), diag(d[0] / s[0], d[1] / s[1], d[2] / s[2])), BRADFORD);
}
const toSpace = (a, b) => mmul(mmul(fromXyz(b), bradford(a.white, b.white)), toXyz(a));
// Kim et al. (2002) Planckian locus, tint perpendicular to it in CIE 1960 uv (cct.rs).
const MIN_K = 1667, MAX_K = 25000, TINT_SCALE = 3000;
function kimXy(t) {
  t = clamp(t, MIN_K, MAX_K); const t2 = t * t, t3 = t2 * t;
  const x = t <= 4000 ? -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.179910 : -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.240390;
  const x2 = x * x, x3 = x2 * x;
  const y = t <= 2222 ? -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683 : t <= 4000 ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867 : 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}
const xyToUv = ([x, y]) => { const d = -2 * x + 12 * y + 3; return [4 * x / d, 6 * y / d]; };
const uvToXy = (u, v) => { const d = 2 * u - 8 * v + 4; return [3 * u / d, 2 * v / d]; };
function locusUv(t) {
  t = Math.max(t, 1000);
  if (t >= MIN_K && t <= MAX_K) return xyToUv(kimXy(t));
  const [a, b] = t < MIN_K ? [MIN_K, MIN_K + 50] : [MAX_K - 500, MAX_K];
  const [ua, va] = xyToUv(kimXy(a)), [ub, vb] = xyToUv(kimXy(b)), s = (1e6 / t - 1e6 / a) / (1e6 / b - 1e6 / a);
  return [ua + (ub - ua) * s, va + (vb - va) * s];
}
function locusNormal(t) {
  const m = 1e6 / t, [u0, v0] = locusUv(1e6 / (m + 1)), [u1, v1] = locusUv(1e6 / Math.max(m - 1, 1));
  const du = u1 - u0, dv = v1 - v0, l = Math.max(Math.hypot(du, dv), 1e-12), nx = -dv / l, ny = du / l;
  return ny < 0 ? [-nx, -ny] : [nx, ny];
}
export function tempTintToXy(t, tint) { const [u, v] = locusUv(t), [nu, nv] = locusNormal(t), duv = tint / TINT_SCALE; return uvToXy(u + nu * duv, v + nv * duv); }
const wbMatrix = (sp, src) => mmul(mmul(fromXyz(sp), bradford(src, sp.white)), toXyz(sp));

// sRGB transfer, and the matrices between sRGB and the working space (linear Rec.2020).
export const srgbToLinear = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
export const linearToSrgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const SRGB_TO_2020 = toSpace(SRGB, REC2020), TO_OUT = toF32(toSpace(REC2020, SRGB));
const LUMA_2020 = [0.2627, 0.6780, 0.0593].map(f), OUT_LUMA = [0.2126, 0.7152, 0.0722].map(f);
const lum2020 = c => c[0] * LUMA_2020[0] + c[1] * LUMA_2020[1] + c[2] * LUMA_2020[2];
const SRGB_LUT_N = 4096, SRGB_LUT = Float32Array.from({ length: SRGB_LUT_N + 1 }, (_, i) => linearToSrgb(i / SRGB_LUT_N));
function encodeSrgb(v) { const x = clamp(v, 0, 1) * SRGB_LUT_N, i = Math.min(Math.floor(x), SRGB_LUT_N - 1), t = x - i; return SRGB_LUT[i] + (SRGB_LUT[i + 1] - SRGB_LUT[i]) * t; }

// OkLab on linear Rec.2020 (perceptual.rs).
const XYZ_TO_LMS = [[0.8189330101, 0.3618667424, -0.1288597137], [0.0329845436, 0.9293118715, 0.0361456387], [0.0482003018, 0.2643662691, 0.6338517070]];
const LMS_TO_LAB = [[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]];
const TO_LMS64 = mmul(XYZ_TO_LMS, toXyz(REC2020));
const OK = { toLms: toF32(TO_LMS64), fromLms: toF32(minv(TO_LMS64)), toLab: toF32(LMS_TO_LAB), fromLab: toF32(minv(LMS_TO_LAB)) };
export const oklabFrom2020 = rgb => mapply(OK.toLab, mapply(OK.toLms, rgb).map(Math.cbrt));
export const oklabTo2020 = lab => mapply(OK.fromLms, mapply(OK.fromLab, lab).map(v => v * v * v));
const labToLch = l => [l[0], Math.hypot(l[1], l[2]), Math.atan2(l[2], l[1])];
const lchToLab = l => [l[0], l[1] * Math.cos(l[2]), l[1] * Math.sin(l[2])];
function hsvToRgb(h, s, v) {
  const c = v * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = v - c;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(Math.floor(hp), 5)];
  return [r + m, g + m, b + m];
}
const okHueOfSrgbHue = deg => { const lab = oklabFrom2020(mapply(SRGB_TO_2020, hsvToRgb(deg, 1, 1).map(srgbToLinear)).map(f)); return Math.atan2(lab[2], lab[1]); };

// ---- tone map for rendered sources (tone.rs ToneMap::display): identity at neutral settings
const GREY = 0.18, LUT_MIN_EV = -14, LUT_MAX_EV = 10, LUT_N = 4096;
function displayTone(contrast, whites, blacks) {
  const c = contrast / 100, w = whites / 100, b = blacks / 100, m = Math.pow(GREY, 1 / 2.2), lut = new Float32Array(LUT_N);
  for (let i = 0; i < LUT_N; i++) {
    const ev = LUT_MIN_EV + (LUT_MAX_EV - LUT_MIN_EV) * i / (LUT_N - 1), y = GREY * Math.pow(2, ev);
    let p = Math.pow(y, 1 / 2.2);
    if (p <= 1) {
      p += c * 0.35 * (p - m) * (1 - Math.pow(2 * p - 1, 2));
      p += w * 0.12 * smooth(0.45, 1, p) * (1 - p * 0.5);
      p += b * 0.07 * (1 - smooth(0, 0.45, p)) * Math.min(p * 2, 1);
    } else p += w * 0.12 * 0.5;
    let o = Math.pow(Math.max(p, 0), 2.2);
    if (o > 0.95) { const d = Math.min(o - 0.95, 0.1); o = 0.95 + d - d * d / 0.2; }
    lut[i] = clamp(o, 0, 1);
  }
  return y => {
    if (y <= 0) return 0;
    const ev = Math.log2(y / GREY), x = clamp((ev - LUT_MIN_EV) / (LUT_MAX_EV - LUT_MIN_EV), 0, 1) * (LUT_N - 1), i = Math.min(Math.floor(x), LUT_N - 2), t = x - i;
    const v = lut[i] + (lut[i + 1] - lut[i]) * t;
    return ev < LUT_MIN_EV ? v * (y / (GREY * Math.pow(2, LUT_MIN_EV))) : v;
  };
}

// ---- tone curves (finish.rs curve_luts; spline.rs MonotoneCurve, Lut1)
const lut1 = (n, fn) => Float32Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
function lutEval(v, x) { const n = v.length, t0 = clamp(x, 0, 1) * (n - 1), i = Math.min(Math.floor(t0), n - 2), t = t0 - i; return v[i] + (v[i + 1] - v[i]) * t; }
const compose = (outer, inner) => inner.map(x => lutEval(outer, x));
function monotone(points) {
  let p = points.map(q => [q.x, q.y]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0]);
  p = p.filter((q, i) => i === 0 || Math.abs(q[0] - p[i - 1][0]) >= 1e-9);
  if (p.length < 2) p = [[0, 0], [1, 1]];
  const n = p.length, xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  const d = xs.slice(0, -1).map((_, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])), ms = new Array(n).fill(0);
  ms[0] = d[0]; ms[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) ms[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { ms[i] = 0; ms[i + 1] = 0; continue; }
    const a = ms[i] / d[i], b = ms[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); ms[i] = t * a * d[i]; ms[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (xs[i + 1] < x) i++;
    if (xs[i + 1] === x) return ys[i + 1];
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * ms[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * ms[i + 1];
  };
}
const curveIsIdentity = pts => !pts || !pts.length || pts.every(p => Math.abs(p.x - p.y) < 1e-9);
function curveLuts(c) {
  const parametric = c.highlights || c.lights || c.darks || c.shadows, master = !curveIsIdentity(c.master), chans = [c.red, c.green, c.blue].map(p => !curveIsIdentity(p));
  if (!parametric && !master && !chans.some(Boolean)) return null;
  const N = 1024, s1 = c.split_shadows / 100, s2 = c.split_mid / 100, s3 = c.split_highlights / 100;
  const regions = [[0, s1, c.shadows], [s1, s2, c.darks], [s2, s3, c.lights], [s3, 1, c.highlights]];
  let base = lut1(N, x => {
    let d = 0;
    for (const [a, b, amt] of regions) {
      if (!amt) continue;
      const ctr = (a + b) / 2, half = (b - a) * 0.75 + 0.05, t = clamp((x - ctr) / half, -1, 1);
      d += amt / 100 * 0.22 * (0.5 + 0.5 * Math.cos(t * PI));
    }
    return clamp(x + d * 4 * x * (1 - x), 0, 1);
  });
  for (let i = 1; i < N; i++) base[i] = Math.max(base[i], base[i - 1]);
  if (master) { const m = monotone(c.master); base = compose(lut1(N, m), base); }
  return [c.red, c.green, c.blue].map((p, i) => chans[i] ? compose(lut1(N, monotone(p)), base) : base);
}
function refineSaturation(before, after, refine) {
  const luma = e => 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2], chroma = e => Math.max(...e) - Math.min(...e);
  const y0 = luma(before), y1 = luma(after), s0 = chroma(before) / Math.max(y0, 1e-4), s1 = chroma(after) / Math.max(y1, 1e-4);
  if (s1 <= 1e-6 || s0 <= 1e-6) return after;
  const k = clamp(Math.pow(s0 / s1, 1 - refine), 0, 4);
  return after.map(v => y1 + (v - y1) * k);
}

// ---- settings
const BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
const MIXER_HUES = [0, 30, 60, 120, 180, 225, 270, 315];
let bandHues = null;
const hsl0 = { hue: 0, sat: 0, lum: 0 }, wheel0 = { hue: 0, sat: 0, lum: 0 };
/** LightCraft's defaults, with `s` over them (one level deep, as serde's #[serde(default)]). */
export function settings(s = {}) {
  const o = (k, d) => ({ ...d, ...(s[k] || {}) });
  return {
    light: o('light', { exposure: 0, contrast: 0, whites: 0, blacks: 0 }),
    wb: o('wb', { mode: 'asShot', temp: 6500, tint: 0 }),
    color: o('color', { vibrance: 0, saturation: 0 }),
    mixer: Object.fromEntries(BANDS.map(b => [b, { ...hsl0, ...((s.mixer || {})[b] || {}) }])),
    treatment: s.treatment || 'color',
    bw_mix: Object.fromEntries(BANDS.map(b => [b, (s.bw_mix || {})[b] || 0])),
    grading: { blending: 50, balance: 0, ...(s.grading || {}), ...Object.fromEntries(['shadows', 'midtones', 'highlights', 'global'].map(k => [k, { ...wheel0, ...((s.grading || {})[k] || {}) }])) },
    curve: o('curve', { highlights: 0, lights: 0, darks: 0, shadows: 0, split_shadows: 25, split_mid: 50, split_highlights: 75, master: [], red: [], green: [], blue: [], refine_saturation: 100 }),
  };
}
/** True when `s` changes nothing. */
export function isNeutral(s) {
  s = settings(s);
  const L = s.light, g = s.grading, c = s.curve;
  return !L.exposure && !L.contrast && !L.whites && !L.blacks && s.wb.mode === 'asShot' && !s.color.vibrance && !s.color.saturation && s.treatment !== 'bw'
    && BANDS.every(b => !s.mixer[b].hue && !s.mixer[b].sat && !s.mixer[b].lum) && ['shadows', 'midtones', 'highlights', 'global'].every(k => !g[k].sat && !g[k].lum)
    && !c.highlights && !c.lights && !c.darks && !c.shadows && [c.master, c.red, c.green, c.blue].every(curveIsIdentity);
}

/** The per-pixel function for settings `s`: sRGB-encoded [r, g, b] (0..1) → sRGB-encoded [r, g, b]. */
export function developer(s0) {
  const s = settings(s0), L = s.light;
  // white balance (local.rs wb_matrix_for, a rendered source: relative to an as-shot 6500 K / 0)
  let wb = null;
  if (s.wb.mode !== 'asShot' && !(Math.abs(s.wb.temp - 6500) < 1e-6 && Math.abs(s.wb.tint) < 1e-6)) {
    const m = mmul(wbMatrix(REC2020, tempTintToXy(s.wb.temp, s.wb.tint)), minv(wbMatrix(REC2020, tempTintToXy(6500, 0))));
    const g = mapply(m, [1, 1, 1]), y = g[0] * 0.2627 + g[1] * 0.6780 + g[2] * 0.0593;
    wb = toF32(mmul(m, diag(1 / y, 1 / y, 1 / y)));
  }
  const gain = Math.pow(2, L.exposure), tone = displayTone(L.contrast, L.whites, L.blacks), curves = curveLuts(s.curve), refine = clamp(s.curve.refine_saturation / 100, 0, 1);
  // colour (colorops.rs ColorOps)
  bandHues = bandHues || MIXER_HUES.map(okHueOfSrgbHue);
  const bands = BANDS.map(b => s.mixer[b]), mixer = bands.some(b => b.hue || b.sat || b.lum);
  const mh = bands.map(b => b.hue / 100 * 0.5), ms = bands.map(b => b.sat / 100), ml = bands.map(b => b.lum / 100 * 0.18);
  const vib = s.color.vibrance / 100, sat = s.color.saturation / 100, bw = s.treatment === 'bw' ? BANDS.map(b => s.bw_mix[b] / 100) : null;
  const G = s.grading, grading = ['shadows', 'midtones', 'highlights', 'global'].some(k => G[k].sat || G[k].lum)
    ? { wheels: ['shadows', 'midtones', 'highlights', 'global'].map(k => { const h = okHueOfSrgbHue(G[k].hue), r = G[k].sat / 100 * 0.09; return { a: r * Math.cos(h), b: r * Math.sin(h), lum: G[k].lum / 100 * 0.12 }; }), blending: G.blending / 100, balance: G.balance / 100 } : null;
  const skin = okHueOfSrgbHue(25), colourIdentity = !vib && !sat && !mixer && !bw && !grading;
  const bandWeights = h => {
    const w = new Array(8).fill(0);
    for (let i = 0; i < 8; i++) {
      const a = bandHues[i], b = bandHues[(i + 1) % 8], span = ((wrap(b - a) % TAU) + TAU) % TAU, d = ((wrap(h - a) % TAU) + TAU) % TAU;
      if (d <= span) { const t = d / span, s = 0.5 - 0.5 * Math.cos(t * PI); w[i] += 1 - s; w[(i + 1) % 8] += s; break; }
    }
    return w;
  };
  const grade = lab => {
    if (grading) {
      const m = 0.5 - grading.balance * 0.25, width = 0.15 + grading.blending * 0.5;
      const ws = 1 - smooth(m - width, m + width * 0.25, lab[0]), wh = smooth(m - width * 0.25, m + width, lab[0]), wm = Math.max(1 - ws - wh, 0);
      grading.wheels.forEach((k, i) => { const wt = [ws, wm, wh, 1][i]; lab[1] += k.a * wt; lab[2] += k.b * wt; lab[0] += k.lum * wt; });
    }
    return oklabTo2020(lab);
  };
  const vibScale = (c, h) => { const low = 1 - clamp(c / 0.22, 0, 1), sk = vib > 0 ? 1 - 0.6 * Math.exp(-Math.pow(wrap(h - skin) / 0.35, 2)) : 1; return Math.max(1 + vib * low * low * sk * 1.2, 0); };
  const colour = rgb => {
    if (colourIdentity) return rgb;
    const lab = oklabFrom2020(rgb);
    if (!mixer && !bw) { // chroma-only: scale a, b
      const c0 = Math.hypot(lab[1], lab[2]); let c = c0;
      if (vib) c *= vibScale(c, Math.atan2(lab[2], lab[1]));
      if (sat) c *= Math.max(1 + sat, 0);
      if (c0 > 0) { lab[1] *= c / c0; lab[2] *= c / c0; }
      return grade(lab);
    }
    let [l, c, h] = labToLch(lab);
    if (mixer) {
      const w = bandWeights(h); let dh = 0, ds = 0, dl = 0;
      for (let i = 0; i < 8; i++) { dh += w[i] * mh[i]; ds += w[i] * ms[i]; dl += w[i] * ml[i]; }
      const cw = Math.min(c / 0.12, 1);
      h += dh * cw; c *= Math.max(1 + ds, 0); l += dl * cw * Math.sqrt(Math.max(l, 0.05));
    }
    if (vib) c *= vibScale(c, h);
    if (sat) c *= Math.max(1 + sat, 0);
    if (bw) { const w = bandWeights(h); let mix = 0; for (let i = 0; i < 8; i++) mix += w[i] * bw[i]; l = Math.max(l + mix * Math.min(c / 0.2, 1) * 0.25, 0); c = 0; }
    return grade(lchToLab([l, c, h]));
  };
  return function develop(e) {
    let c = mapply(SRGB_TO_2020, e.map(srgbToLinear)).map(f);
    if (wb) c = mapply(wb, c);
    c = c.map(v => Math.max(v, 0) * gain);
    const yl = lum2020(c), o = tone(yl);
    let d = yl > 1e-9 ? c.map(v => v * o / yl) : [0, 0, 0];
    const mx = Math.max(...d);
    if (mx > 1) { const t = clamp((mx - 1) / Math.max(mx - o, 1e-6), 0, 1); d = d.map(v => v + (o - v) * t); }
    d = colour(d);
    let r = mapply(TO_OUT, d);
    { // gamut map: desaturate towards luminance into 0..1
      const yy = clamp(OUT_LUMA[0] * r[0] + OUT_LUMA[1] * r[1] + OUT_LUMA[2] * r[2], 0, 1); let t = 1;
      for (const v of r) { if (v < 0) t = Math.min(t, yy / Math.max(yy - v, 1e-9)); else if (v > 1) t = Math.min(t, (1 - yy) / Math.max(v - yy, 1e-9)); }
      if (t < 1) r = r.map(v => yy + (v - yy) * t);
    }
    let out = r.map(encodeSrgb);
    if (curves) { const e0 = out; out = out.map((v, k) => lutEval(curves[k], v)); if (refine < 1) out = refineSaturation(e0, out, refine); }
    return out;
  };
}

/** Develop a straight-alpha float RGBA image (web/paint/brush.js's) in place (alpha kept). */
export function developImage(img, s) {
  const dev = developer(s), D = img.data;
  for (let i = 0; i < D.length; i += 4) { if (D[i + 3] <= 0) continue; const o = dev([D[i], D[i + 1], D[i + 2]]); D[i] = clamp(o[0], 0, 1); D[i + 1] = clamp(o[1], 0, 1); D[i + 2] = clamp(o[2], 0, 1); }
  return img;
}
