// Renders the whole world into a small ink-on-parchment map image, a few rows per frame.
import { WORLD } from '../config.js';
import { clamp } from '../core/util.js';

export const MAP_N = 256;

export function* renderMapRows(gen, out /* Uint8ClampedArray MAP_N*MAP_N*4 */) {
  const N = MAP_N;
  const span = WORLD.HALF * 2;
  const cell = span / N;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -WORLD.HALF + (i + 0.5) * cell, z = -WORLD.HALF + (j + 0.5) * cell;
      H[j * N + i] = gen.height(x, z);
    }
    if (j % 8 === 7) yield (j / N) * 0.5;
  }
  const paper = [206, 191, 156];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const h = H[idx];
      const x = -WORLD.HALF + (i + 0.5) * cell, z = -WORLD.HALF + (j + 0.5) * cell;
      const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
      const hu = H[Math.max(0, j - 1) * N + i], hd = H[Math.min(N - 1, j + 1) * N + i];
      const shade = clamp(1 + ((hl - hr) + (hu - hd)) * 0.02, 0.6, 1.25);
      let r, g, b;
      if (h < WORLD.WATER) {
        const deep = clamp(-h / 20, 0, 1);
        r = 120 - deep * 50; g = 128 - deep * 45; b = 122 - deep * 30;
        // hatching near shore
        if ((i + j) % 4 === 0 && deep < 0.4) { r -= 18; g -= 18; b -= 14; }
      } else {
        const c = gen.colorAt(x, z, h, 0);
        const k = 0.35;
        r = paper[0] * (1 - k) + c[0] * 255 * k * 1.6;
        g = paper[1] * (1 - k) + c[1] * 255 * k * 1.6;
        b = paper[2] * (1 - k) + c[2] * 255 * k * 1.6;
        r *= shade; g *= shade; b *= shade;
        // contour lines every 12 m
        const band = Math.floor(h / 12);
        if (band !== Math.floor(hr / 12) || band !== Math.floor(hd / 12)) { r *= 0.72; g *= 0.68; b *= 0.62; }
        if (gen.roadFactor(x, z) > 0.35) { r = 110; g = 78; b = 52; }
      }
      out[idx * 4] = clamp(r, 0, 255);
      out[idx * 4 + 1] = clamp(g, 0, 255);
      out[idx * 4 + 2] = clamp(b, 0, 255);
      out[idx * 4 + 3] = 255;
    }
    if (j % 8 === 7) yield 0.5 + (j / N) * 0.5;
  }
  yield 1;
}
