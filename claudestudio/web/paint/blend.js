// Blend modes for layers: PhotoCraft's (crates/color/src/blend.rs, MIT/Apache),
// ported to JavaScript and checked against it value for value
// (test/paint.test.mjs, oracle tools/paint-oracle). Straight RGBA, 0..1.
// Kept: the common separable modes and Hue, Saturation, Color, Luminosity.
// Left out: Dissolve, Darker/Lighter Color, Vivid/Linear/Pin Light, Hard Mix,
// Exclusion, Subtract, Divide, and Paint.NET's modes.
const f = Math.fround;

export const BLEND_MODES = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'ColorDodge', 'ColorBurn',
  'LinearDodge', 'LinearBurn', 'SoftLight', 'HardLight', 'Difference', 'Hue', 'Saturation', 'Color', 'Luminosity'];

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const colorBurn = (cb, cs) => cb >= 1 ? 1 : cs <= 0 ? 0 : f(1 - Math.min(f(f(1 - cb) / cs), 1));
const colorDodge = (cb, cs) => cb <= 0 ? 0 : cs >= 1 ? 1 : Math.min(f(cb / f(1 - cs)), 1);
const hardLight = (cb, cs) => { if (cs <= 0.5) return f(f(cb * 2) * cs); const s = f(f(2 * cs) - 1); return f(f(cb + s) - f(cb * s)); };
const softLight = (cb, cs) => cs <= 0.5
  ? f(f(f(f(2 * cb) * cs)) + f(f(cb * cb) * f(1 - f(2 * cs))))
  : f(f(f(2 * cb) * f(1 - cs)) + f(f(Math.sqrt(Math.max(cb, 0))) * f(f(2 * cs) - 1)));

function channel(mode, cb, cs) {
  switch (mode) {
    case 'Darken': return Math.min(cb, cs);
    case 'Multiply': return f(cb * cs);
    case 'ColorBurn': return colorBurn(cb, cs);
    case 'LinearBurn': return Math.max(f(f(cb + cs) - 1), 0);
    case 'Lighten': return Math.max(cb, cs);
    case 'Screen': return f(f(cb + cs) - f(cb * cs));
    case 'ColorDodge': return colorDodge(cb, cs);
    case 'LinearDodge': return Math.min(f(cb + cs), 1);
    case 'Overlay': return hardLight(cs, cb);
    case 'SoftLight': return softLight(cb, cs);
    case 'HardLight': return hardLight(cb, cs);
    case 'Difference': return Math.abs(f(cb - cs));
    default: return cs; // Normal
  }
}
// ---- non-separable (W3C Compositing Level 1, with PhotoCraft's out-of-range handling)
const lum = c => f(f(f(0.3 * c[0]) + f(f(0.59) * c[1])) + f(f(0.11) * c[2]));
function clipColor(c) {
  const l = lum(c), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]), out = c.slice();
  if (n < 0) { const d = f(l - n); for (let i = 0; i < 3; i++) out[i] = l > 0 && d > 0 ? f(l + f(f(f(out[i] - l) * l) / d)) : l; }
  if (x > 1) { const d = f(x - l); for (let i = 0; i < 3; i++) out[i] = l < 1 && d > 0 ? f(l + f(f(f(out[i] - l) * f(1 - l)) / d)) : l; }
  return out;
}
const setLum = (c, l) => { const d = f(l - lum(c)); return clipColor([f(c[0] + d), f(c[1] + d), f(c[2] + d)]); };
const sat = c => f(Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]));
function setSat(c, s) {
  const [imin, imid, imax] = [0, 1, 2].sort((a, b) => c[a] - c[b]), out = [0, 0, 0];
  if (c[imax] > c[imin]) { out[imid] = f(f(f(c[imid] - c[imin]) * s) / f(c[imax] - c[imin])); out[imax] = s; }
  out[imin] = 0;
  return out;
}
export function blendRGB(mode, cb, cs) {
  switch (mode) {
    case 'Hue': return setLum(setSat(cs, sat(cb)), lum(cb));
    case 'Saturation': return setLum(setSat(cb, sat(cs)), lum(cb));
    case 'Color': return setLum(cs, lum(cb));
    case 'Luminosity': return setLum(cb, lum(cs));
    default: return [channel(mode, cb[0], cs[0]), channel(mode, cb[1], cs[1]), channel(mode, cb[2], cs[2])];
  }
}
/** `source` over `backdrop` with `mode` at `opacity` (straight RGBA): the W3C formula, as PhotoCraft composites. */
export function composite(mode, backdrop, source, opacity) {
  const ab = f(backdrop[3]), as = f(f(source[3]) * f(opacity));
  if (as <= 0) return backdrop.slice();
  const cb = backdrop.slice(0, 3).map(f), cs = source.slice(0, 3).map(f), b = blendRGB(mode, cb, cs);
  const ao = f(as + f(ab * f(1 - as)));
  if (ao <= 0) return [0, 0, 0, 0];
  const out = [0, 0, 0, ao];
  for (let i = 0; i < 3; i++) out[i] = f(f(f(f(f(f(1 - as) * ab) * cb[i]) + f(f(f(1 - ab) * as) * cs[i])) + f(f(as * ab) * b[i])) / ao);
  return out;
}
