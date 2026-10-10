// Character maker, stage 1 (web/runtime/charmaker.js): body parts found in
// the CC0 references and in a synthetic test card; every texel the model uses
// painted; each colour lands on the right part, face and side.
import { loadPNG, rigOf, makeSkin } from '../tools/charmaker.mjs';
import { silhouette, findParts, partGrids, paintSkin } from '../web/runtime/charmaker.js';
import { testCard, CARD_COLOURS } from './fixtures/testcard.mjs';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const MODEL = 'assets/characters/character-a.glb';

// 1. The references: neck and crotch rows judged by eye on the parts overlay
// (build/charmaker/*-parts.png), as ranges.
const JUDGED = {
  'male-adventurer': { neck: [157, 165], crotch: [214, 224] },
  'female-person': { neck: [158, 166], crotch: [214, 224] },
  robot: { neck: [149, 158], crotch: [214, 224] },
  zombie: { neck: [157, 165], crotch: [214, 224] },
  soldier: { neck: [58, 66], crotch: [90, 98] },
};
for (const [name, j] of Object.entries(JUDGED)) {
  const img = loadPNG(`test/fixtures/characters/${name}.png`), p = findParts(img);
  const inR = (v, [a, b]) => v >= a && v <= b;
  check(inR(p.head.y1, j.neck) && inR(p.torso.y1, j.crotch) && p.found.neck && p.found.legs,
    `${name}: neck at ${p.head.y1} (judged ${j.neck.join('-')}), crotch at ${p.torso.y1} (judged ${j.crotch.join('-')})`);
}

// 2. A test card: a figure drawn with known boxes and one colour per part, and
// marks that tell left from right and up from down.
const card = testCard(), C = CARD_COLOURS;
const p = findParts(card);
const near = (r, e, tol = 2) => ['x0', 'y0', 'x1', 'y1'].every(k => Math.abs(r[k] - e[k]) <= tol);
check(p.found.neck && p.found.arms && p.found.legs, `test card: neck, arms and legs seen (${JSON.stringify(p.found)})`);
check(near(p.head, { x0: 40, y0: 10, x1: 120, y1: 90 }) && near(p.torso, { x0: 48, y0: 90, x1: 112, y1: 172 }, 3), `test card: head ${JSON.stringify(p.head)}, torso ${JSON.stringify(p.torso)}`);
check(near(p.armRight, { x0: 30, y0: 90, x1: 48, y1: 180 }) && near(p.armLeft, { x0: 112, y0: 90, x1: 130, y1: 180 }), `test card: the character's right arm is on the image's left (${JSON.stringify(p.armRight)}), its left arm on the right (${JSON.stringify(p.armLeft)})`);

// 3. Paint it through character-a's UVs and read the skin back at 3D points.
const rig = rigOf(MODEL, 16);
const grids = partGrids(card, p, rig.cells);
const skin = paintSkin(rig.parts, grids, { size: 1024 });
// Coverage: every texel inside a triangle of the model is painted.
let covered = 0, missing = 0;
const texelsOf = (tris, t, size, f) => {
  const U = [0, 1, 2].map(k => [tris[t + k * 5 + 3], tris[t + k * 5 + 4]]);
  const fu = Math.floor(Math.min(...U.map(u => u[0]))), fv = Math.floor(Math.min(...U.map(u => u[1])));
  const T = U.map(([u, v]) => [(u - fu) * size, (v - fv) * size]);
  const area = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[2][0] - T[0][0]) * (T[1][1] - T[0][1]);
  if (Math.abs(area) < 1e-9) return;
  for (let y = Math.floor(Math.min(...T.map(q => q[1]))); y <= Math.ceil(Math.max(...T.map(q => q[1]))); y++)
    for (let x = Math.floor(Math.min(...T.map(q => q[0]))); x <= Math.ceil(Math.max(...T.map(q => q[0]))); x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const w1 = ((T[2][0] - T[0][0]) * (qy - T[0][1]) - (qx - T[0][0]) * (T[2][1] - T[0][1])) / -area;
      const w2 = ((qx - T[0][0]) * (T[1][1] - T[0][1]) - (T[1][0] - T[0][0]) * (qy - T[0][1])) / -area;
      if (1 - w1 - w2 >= 0 && w1 >= 0 && w2 >= 0) f(x, y, [1 - w1 - w2, w1, w2]);
    }
};
for (const part of Object.values(rig.parts)) for (let t = 0; t < part.tris.length; t += 15)
  texelsOf(part.tris, t, 1024, (x, y) => { if (x >= 0 && y >= 0 && x < 1024 && y < 1024) { if (skin[(y * 1024 + x) * 4 + 3] === 255) covered++; else missing++; } });
check(missing === 0 && covered > 1000, `every texel the model's triangles cover is painted (${covered} painted, ${missing} missing)`);
// Bleed: painted texels reach 2 px past every covered texel, so filtering at a
// UV seam never reads unpainted texture.
const inside = new Uint8Array(1024 * 1024);
for (const part of Object.values(rig.parts)) for (let t = 0; t < part.tris.length; t += 15)
  texelsOf(part.tris, t, 1024, (x, y) => { if (x >= 0 && y >= 0 && x < 1024 && y < 1024) inside[y * 1024 + x] = 1; });
let bare = 0;
for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
  if (!inside[y * 1024 + x]) continue;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < 1024 && Y < 1024 && skin[(Y * 1024 + X) * 4 + 3] !== 255) bare++; }
}
check(bare === 0, `painted 2 px past every covered texel (${bare} bare texels near the model's faces)`);
// A hand-edited box may be inverted: still a skin, not a crash.
let inverted = 'ok';
try { partGrids(card, { ...p, armLeft: { x0: 130, y0: 180, x1: 112, y1: 90 } }, rig.cells); } catch (e) { inverted = e.message; }
check(inverted === 'ok', `an inverted part box is ordered, not a crash (${inverted})`);

// The colour on part `name` at a point given in 0..1 of its box (part-local),
// found through the triangle whose face contains it.
function skinAt(name, rel) {
  const { tris, min, max } = rig.parts[name], pt = [0, 1, 2].map(k => min[k] + rel[k] * (max[k] - min[k]));
  for (let t = 0; t < tris.length; t += 15) {
    const P = [0, 1, 2].map(k => [tris[t + k * 5], tris[t + k * 5 + 1], tris[t + k * 5 + 2]]);
    // Barycentric of pt in the triangle's plane (drop the axis it faces).
    const e1 = [0, 1, 2].map(k => P[1][k] - P[0][k]), e2 = [0, 1, 2].map(k => P[2][k] - P[0][k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ax = [0, 1, 2].reduce((a, k) => Math.abs(n[k]) > Math.abs(n[a]) ? k : a, 0);
    if (Math.abs(pt[ax] - P[0][ax]) > 1e-4 * (max[ax] - min[ax] + 1)) continue;
    const [i, j] = [0, 1, 2].filter(k => k !== ax);
    const d = (P[1][i] - P[0][i]) * (P[2][j] - P[0][j]) - (P[2][i] - P[0][i]) * (P[1][j] - P[0][j]);
    const b1 = ((pt[i] - P[0][i]) * (P[2][j] - P[0][j]) - (P[2][i] - P[0][i]) * (pt[j] - P[0][j])) / d;
    const b2 = ((P[1][i] - P[0][i]) * (pt[j] - P[0][j]) - (pt[i] - P[0][i]) * (P[1][j] - P[0][j])) / d;
    const b0 = 1 - b1 - b2;
    if (b0 < -1e-6 || b1 < -1e-6 || b2 < -1e-6) continue;
    const uv = [0, 1].map(c => b0 * tris[t + 3 + c] + b1 * tris[t + 8 + c] + b2 * tris[t + 13 + c]);
    const fu = Math.floor(Math.min(tris[t + 3], tris[t + 8], tris[t + 13])), fv = Math.floor(Math.min(tris[t + 4], tris[t + 9], tris[t + 14]));
    const x = Math.min(1023, Math.floor((uv[0] - fu) * 1024)), y = Math.min(1023, Math.floor((uv[1] - fv) * 1024)), o = (y * 1024 + x) * 4;
    return [skin[o], skin[o + 1], skin[o + 2]];
  }
  return null;
}
const close = (a, b) => a && a.every((v, k) => Math.abs(v - b[k]) <= 12);
// Front faces (+Z, the character faces +Z): every part shows its colour.
for (const name of ['torso', 'armLeft', 'armRight', 'legLeft', 'legRight'])
  check(close(skinAt(name, [0.5, 0.5, 1]), C[name]), `${name}: front shows its colour (${skinAt(name, [0.5, 0.5, 1])})`);
// The mark: image upper-left of the face = the character's right (-X) and up (+Y) on the head's front.
check(close(skinAt('head', [0.15, 0.85, 1]), C.mark) && close(skinAt('head', [0.85, 0.85, 1]), C.head) && close(skinAt('head', [0.15, 0.15, 1]), C.head),
  `head front: the mark is at the character's upper right (${skinAt('head', [0.15, 0.85, 1])}), not upper left or lower right`);
// Back of the head hides the face: the mark doesn't show through.
check([0.15, 0.85].every(x => close(skinAt('head', [x, 0.85, 0]), C.head)), `head back: no face features (${skinAt('head', [0.85, 0.85, 0])}, ${skinAt('head', [0.15, 0.85, 0])})`);
// The left arm (+X) is red on every side, the right arm blue.
check(['px', 'nx', 'nz'].every(f => close(skinAt('armLeft', f === 'px' ? [1, 0.5, 0.5] : f === 'nx' ? [0, 0.5, 0.5] : [0.5, 0.5, 0]), C.armLeft)), 'left arm: its colour on its outer, inner and back faces');
check(close(skinAt('armRight', [0, 0.5, 0.5]), C.armRight), 'right arm: its colour on its outer face');

// 4. Determinism: the same reference gives the same skin, byte for byte.
const male = loadPNG('test/fixtures/characters/male-adventurer.png');
const a = makeSkin(male, findParts(male), { headPx: 16, modelFile: MODEL }).skin, b = makeSkin(male, findParts(male), { headPx: 16, modelFile: MODEL }).skin;
check(a.length === b.length && a.every((v, i) => v === b[i]), 'the same reference makes the same skin');

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
