// Golden screenshots: compare a render with a saved PNG. Renders here are
// deterministic, so the test is tight: a pixel differs if any channel moves
// by more than 2/255, and more than 0.2% differing pixels is a mismatch.
// Checked: a 6% dimmer sun fails it (RESEARCH.md §4e).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const LIMIT = 0.002;

/** Returns { saved } or { frac, mean, ok }; writes <diffBase>.diff.png on a mismatch. */
export function checkGolden(file, pngBuffer, { update = false, diffBase = null } = {}) {
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
    sum += d; if (d > 2) n++;
  }
  const px = a.width * a.height, frac = n / px;
  if (frac > LIMIT && diffBase) {
    const diff = new PNG({ width: a.width, height: a.height });
    pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.0 }); // only draws the diff image
    fs.writeFileSync(diffBase + '.diff.png', PNG.sync.write(diff));
  }
  return { frac, mean: sum / px, ok: frac <= LIMIT };
}
