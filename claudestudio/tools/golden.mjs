// Golden screenshots: compare a render with a saved PNG. Renders here are
// deterministic, so the test is tight: a pixel differs if any channel moves
// by more than 2/255, and more than 0.2% differing pixels is a mismatch.
// Checked: a 6% dimmer sun fails it (RESEARCH.md §4e).
// With { text: true }, differences next to (within 1 px of) any edge in the golden (a
// neighbour differing by more than 12/255) don't count: glyph and text-stroke
// antialiasing differs between containers (0.2-0.7% of pixels on GUI goldens),
// and the limit drops to 0.01%: masked, the drift is under 0.003%, while a frame
// moved 2 px or text 2 px smaller is 0.02% (checked, RESEARCH.md).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const LIMIT = 0.002, TEXT_LIMIT = 0.0001;
const EDGE_R = 1, EDGE_D = 12;

function nearEdge(D, W, H, x, y) {
  const o = (y * W + x) * 4;
  for (let dy = -EDGE_R; dy <= EDGE_R; dy++) for (let dx = -EDGE_R; dx <= EDGE_R; dx++) {
    const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const p = (Y * W + X) * 4;
    if (Math.abs(D[p] - D[o]) > EDGE_D || Math.abs(D[p + 1] - D[o + 1]) > EDGE_D || Math.abs(D[p + 2] - D[o + 2]) > EDGE_D) return true;
  }
  return false;
}

/** Returns { saved } or { frac, mean, ok }; writes <diffBase>.diff.png on a mismatch. */
export function checkGolden(file, pngBuffer, { update = false, diffBase = null, text = false } = {}) {
  if (update || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, pngBuffer);
    return { saved: true };
  }
  const a = PNG.sync.read(fs.readFileSync(file)), b = PNG.sync.read(pngBuffer);
  if (a.width !== b.width || a.height !== b.height) return { frac: 1, mean: 255, ok: false };
  let n = 0, sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    sum += d; if (d > 2 && !(text && nearEdge(a.data, a.width, a.height, (i >> 2) % a.width, (i >> 2) / a.width | 0))) n++;
  }
  const px = a.width * a.height, frac = n / px, limit = text ? TEXT_LIMIT : LIMIT;
  if (frac > limit && diffBase) {
    const diff = new PNG({ width: a.width, height: a.height });
    pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.0 }); // only draws the diff image
    fs.writeFileSync(diffBase + '.diff.png', PNG.sync.write(diff));
  }
  return { frac, mean: sum / px, ok: frac <= limit };
}
