// Character maker from the command line: node tools/charmaker.mjs ref.png [...] [--out dir]
// [--head 8] [--model assets/characters/character-a.glb]
// Writes <name>-parts.png (the reference with the found body parts outlined),
// <name>-net.png (every part's six faces, unfolded) and <name>-skin.png (the
// texture for the model).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { silhouette, findParts, rigFromGlb, makeSkin as makeSkinCore } from '../web/runtime/charmaker.js';
import { readGlb } from './glb.mjs';

const main = import.meta.url === pathToFileURL(process.argv[1]).href;
const args = main ? process.argv.slice(2) : [];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const out = opt('out', 'build/charmaker'), headPx = +opt('head', 16), modelFile = opt('model', 'assets/characters/character-a.glb');
if (main) fs.mkdirSync(out, { recursive: true });
const COLORS = { head: [255, 60, 60], torso: [60, 200, 60], armLeft: [60, 120, 255], armRight: [255, 160, 0], legLeft: [200, 60, 255], legRight: [0, 200, 200] };
export function loadPNG(f) { const p = PNG.sync.read(fs.readFileSync(f)); return { width: p.width, height: p.height, data: p.data }; }
function run() { for (const f of args) {
  const img = loadPNG(f), parts = findParts(img, silhouette(img));
  const S = Math.max(1, Math.round(512 / img.height)), W = img.width * S, H = img.height * S;
  const o = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((y / S | 0) * img.width + (x / S | 0)) * 4, j = (y * W + x) * 4, a = img.data[i + 3] / 255;
    for (let k = 0; k < 3; k++) o.data[j + k] = img.data[i + k] * a + 200 * (1 - a);
    o.data[j + 3] = 255;
  }
  for (const [name, c] of Object.entries(COLORS)) {
    const r = parts[name];
    for (let x = r.x0 * S; x < r.x1 * S; x++) for (const y of [r.y0 * S, r.y1 * S - 1]) if (y >= 0 && y < H && x < W) o.data.set(c, (y * W + x) * 4);
    for (let y = r.y0 * S; y < r.y1 * S; y++) for (const x of [r.x0 * S, r.x1 * S - 1]) if (x >= 0 && x < W && y < H) o.data.set(c, (y * W + x) * 4);
  }
  const name = path.basename(f, '.png');
  const { skin, grids } = makeSkin(img, parts, { headPx, modelFile });
  const S2 = 1024; const sp = new PNG({ width: S2, height: S2 }); sp.data = Buffer.from(skin);
  fs.writeFileSync(path.join(out, name + '-skin.png'), PNG.sync.write(sp));
  fs.writeFileSync(path.join(out, name + '-net.png'), PNG.sync.write(netImage(grids, 12)));
  fs.writeFileSync(path.join(out, name + '-parts.png'), PNG.sync.write(o));
  console.log(name, JSON.stringify(parts.found), JSON.stringify(Object.fromEntries(Object.keys(COLORS).map(k => [k, [parts[k].x0, parts[k].y0, parts[k].x1, parts[k].y1]]))));
}
}

// Node conveniences over web/runtime/charmaker.js.
export const rigOf = (modelFile, headPx) => {
  const glb = readGlb(modelFile);
  return { ...rigFromGlb(glb, headPx), texture: glb.image && path.join(path.dirname(modelFile), glb.image) };
};
export function makeSkin(img, found, { headPx = 16, modelFile = 'assets/characters/character-a.glb' } = {}) {
  const rig = rigOf(modelFile, headPx);
  const base = rig.texture && fs.existsSync(rig.texture) ? loadPNG(rig.texture).data : undefined;
  return { ...makeSkinCore(img, found, rig, { base }), cells: rig.cells };
}
// Every part's faces unfolded (a cross per part: top above front, sides either side, back at the right, bottom below).
export function netImage(grids, s = 12) {
  const names = Object.keys(grids.faces), pal = grids.palette;
  const lay = names.map(n => { const f = grids.faces[n]; const w = f.pz.w, h = f.pz.h, d = f.px.w; return { n, f, w, h, d, W: (2 * d + 2 * w + 1) * s, H: (2 * d + h + 1) * s }; });
  const W = lay.reduce((a, l) => a + l.W, 0), H = Math.max(...lay.map(l => l.H));
  const o = new PNG({ width: W, height: H }); o.data.fill(40);
  let ox = 0;
  for (const l of lay) {
    const put = (g, gx, gy) => { for (let y = 0; y < g.h * s; y++) for (let x = 0; x < g.w * s; x++) { const c = pal[Math.max(0, g.c[((y / s) | 0) * g.w + ((x / s) | 0)])], j = ((gy + y) * W + ox + gx + x) * 4; o.data[j] = c[0]; o.data[j + 1] = c[1]; o.data[j + 2] = c[2]; o.data[j + 3] = 255; } };
    const { f, w, h, d } = l;
    put(f.nx, 0, d * s); put(f.pz, d * s, d * s); put(f.px, (d + w) * s, d * s); put(f.nz, (2 * d + w) * s, d * s);
    put(f.py, d * s, 0); put(f.ny, d * s, (d + h) * s);
    ox += l.W;
  }
  return o;
}

if (main) run();
