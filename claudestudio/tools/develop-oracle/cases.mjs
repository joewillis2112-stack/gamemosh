// The cases web/paint/develop.js is checked on against LightCraft's develop pipeline (run.sh):
// one 32x24 test image (hues at several saturations and values, greys, skin tones) under each
// set of settings, one control at a time, then some together. Only the per-pixel tools the
// studio ports: white balance, exposure, contrast/whites/blacks, vibrance/saturation, the
// colour mixer, B&W, colour grading, tone curves.
const W = 32, H = 24, px = [];
const hsv = (h, s, v) => { const c = v * s, hp = (h % 360) / 60, x = c * (1 - Math.abs(hp % 2 - 1)); const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6]; return [r + v - c, g + v - c, b + v - c]; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let c;
  if (y < 16) c = hsv(x * 360 / W, [1, 0.7, 0.4, 0.15][y % 4], [1, 0.75, 0.5, 0.25][y >> 2]);
  else if (y < 20) { const v = (x + (y - 16) * W) / (4 * W - 1); c = [v, v, v]; }
  else c = hsv(15 + x * 0.8, 0.3 + 0.1 * (y - 20), 0.35 + x / 50);
  px.push(...c.map(v => Math.round(Math.min(Math.max(v, 0), 1) * 255)));
}
const S = o => o; // settings are LightCraft's DevelopSettings JSON (missing fields: defaults)
const cases = [
  ['neutral', {}],
  ['exposure +1', { light: { exposure: 1 } }], ['exposure -1.5', { light: { exposure: -1.5 } }],
  ['contrast +60', { light: { contrast: 60 } }], ['contrast -50', { light: { contrast: -50 } }],
  ['whites +70', { light: { whites: 70 } }], ['whites -60', { light: { whites: -60 } }],
  ['blacks +60', { light: { blacks: 60 } }], ['blacks -80', { light: { blacks: -80 } }],
  ['temp 4500 (bluer)', { wb: { mode: 'custom', temp: 4500, tint: 0 } }], ['temp 9000 tint +30 (warmer, magenta)', { wb: { mode: 'custom', temp: 9000, tint: 30 } }], ['green tint', { wb: { mode: 'custom', temp: 6500, tint: -40 } }],
  ['vibrance +80', { color: { vibrance: 80 } }], ['vibrance -60', { color: { vibrance: -60 } }],
  ['saturation +50', { color: { saturation: 50 } }], ['saturation -100', { color: { saturation: -100 } }],
  ['mixer', { mixer: { red: { hue: 40, sat: 30, lum: -20 }, green: { hue: -60, sat: -50, lum: 40 }, blue: { hue: 20, sat: 60, lum: 10 }, orange: { lum: 30 } } }],
  ['bw', { treatment: 'bw' }], ['bw mix', { treatment: 'bw', bw_mix: { red: 60, blue: -50, green: 30, yellow: -20 } }],
  ['grading', { grading: { shadows: { hue: 220, sat: 60, lum: -10 }, highlights: { hue: 40, sat: 50, lum: 10 }, midtones: { hue: 120, sat: 20, lum: 0 }, global: { hue: 300, sat: 10, lum: 5 }, blending: 70, balance: -30 } }],
  ['curve regions', { curve: { highlights: -40, lights: 30, darks: -25, shadows: 50 } }],
  ['curve splits', { curve: { lights: 60, darks: -60, split_shadows: 15, split_mid: 60, split_highlights: 85 } }],
  ['curve master', { curve: { master: [{ x: 0, y: 0.05 }, { x: 0.3, y: 0.2 }, { x: 0.7, y: 0.85 }, { x: 1, y: 0.95 }] } }],
  ['curve channels', { curve: { red: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }], blue: [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.9 }] } }],
  ['curve refine', { curve: { master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.1 }, { x: 0.75, y: 0.9 }, { x: 1, y: 1 }], refine_saturation: 30 } }],
  ['curve folded', { curve: { shadows: 100, darks: -100, lights: 100, highlights: -100, split_shadows: 10, split_mid: 20, split_highlights: 30 } }],
  ['curve steep', { curve: { master: [{ x: 0, y: 0 }, { x: 0.3, y: 0.02 }, { x: 0.35, y: 0.9 }, { x: 0.4, y: 0.95 }, { x: 1, y: 1 }] } }],
  ['exposure -5', { light: { exposure: -5 } }],
  ['together', { light: { exposure: 0.4, contrast: 25, whites: -20, blacks: 15 }, wb: { mode: 'custom', temp: 5600, tint: 8 }, color: { vibrance: 30, saturation: -10 }, mixer: { aqua: { hue: 30, sat: 40 } }, grading: { shadows: { hue: 200, sat: 30 } }, curve: { lights: 20, master: [{ x: 0, y: 0 }, { x: 0.5, y: 0.55 }, { x: 1, y: 1 }] } }],
].map(([name, settings]) => ({ name, settings: S(settings) }));

// The spatial tools (Highlights/Shadows, Clarity, Dehaze) read blurs of the whole image whose radii
// follow its size, so they're checked on a scene big enough for the paths a texture takes (at 512 px
// the guided filters subsample by 2 and process 2's median has radius 1): a hazy street, 512x384,
// made with exact arithmetic only (no Math.sin: the same bytes on any engine), not stored (the test
// makes it again). The oracle returns every SAMPLE-th pixel.
export const SPATIAL = { w: 512, h: 384, sample: 61 };
export function spatialImage() {
  const { w, h } = SPATIAL, px = new Uint8Array(w * h * 3);
  const noise = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fy = y / h, fx = x / w;
    let c = mix([0.55, 0.68, 0.86], [0.88, 0.9, 0.92], fy * 1.6); // sky
    const sun = (x - 400) * (x - 400) + (y - 60) * (y - 60);
    if (sun < 900) c = [1, 0.98, 0.9]; else if (sun < 3600) c = mix(c, [1, 0.95, 0.8], (3600 - sun) / 2700);
    // three buildings with windows (fine, hard-edged detail), one in deep shadow
    for (const [x0, x1, top, col] of [[30, 150, 120, [0.62, 0.42, 0.3]], [170, 300, 70, [0.08, 0.07, 0.09]], [320, 470, 160, [0.75, 0.75, 0.7]]]) {
      if (x >= x0 && x < x1 && y >= top) { c = col; if ((x - x0) % 20 < 9 && (y - top) % 26 < 14 && y < 300) c = mix(col, [0.95, 0.85, 0.5], (x0 === 170 ? 0.5 : 0.25)); }
    }
    if (y >= 300) { const g = 0.25 + 0.5 * noise(x, y) * (0.3 + fy * 0.7); c = [g, g * 0.95, g * 0.85]; } // road: noisy texture
    if (y >= 330 && x > 60 && x < 200) c = mix(c, [0.02, 0.02, 0.03], 0.85); // a shadow on it
    const haze = 0.45 * (1 - fy) * (1 - fy) + 0.05 * fx; // more haze higher up
    c = mix(c, [0.8, 0.82, 0.85], haze);
    for (let k = 0; k < 3; k++) px[(y * w + x) * 3 + k] = Math.round(Math.min(Math.max(c[k], 0), 1) * 255);
  }
  return px;
}
const spatialCases = [
  ['shadows +70', { light: { shadows: 70 } }], ['highlights -80', { light: { highlights: -80 } }],
  ['highlights +50 shadows -60', { light: { highlights: 50, shadows: -60 } }],
  ['highlights -70 shadows +70 (process 2)', { process: 2, light: { highlights: -70, shadows: 70 } }],
  ['clarity +80', { effects: { clarity: 80 } }], ['clarity -60', { effects: { clarity: -60 } }],
  ['dehaze +70', { effects: { dehaze: 70 } }], ['dehaze -50', { effects: { dehaze: -50 } }], ['dehaze +100', { effects: { dehaze: 100 } }],
  ['spatial together', { process: 2, light: { exposure: 0.5, contrast: 20, highlights: -40, shadows: 30 }, wb: { mode: 'custom', temp: 5800, tint: 5 }, effects: { clarity: 40, dehaze: 30 }, color: { vibrance: 20 } }],
].map(([name, settings]) => ({ name, settings }));

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (process.argv[2] === '--spatial-pixels') console.log(JSON.stringify({ w: SPATIAL.w, h: SPATIAL.h, pixels: Buffer.from(spatialImage()).toString('hex') }));
  else console.log(JSON.stringify({ w: W, h: H, pixels: Buffer.from(px).toString('hex'), cases, spatial: { ...SPATIAL, cases: spatialCases } }));
}
