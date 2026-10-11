// Character maker, stage 2 (web/runtime/rigmesh.js): a generated mesh rigged
// to the blocky rig. Checks:
// 1. A mannequin of known boxes (other proportions than the rig): every joint
//    lands where the rule puts it, every vertex on the right part, left on +X.
// 2. The written file skins correctly: at rest every vertex stays put; turn a
//    joint and its part's vertices move rigidly about that joint; clip
//    translation keys follow the moved joints.
// 3. The fixture (TripoSR's mesh of the CC0 male adventurer): the cuts are
//    found and agree with the judged ones, and its front view matches the
//    reference in silhouette and in each part's colour.
// 4. Same input, same bytes; the file passes Khronos's validator.
// 5. Any generator's axes: the fixture turned six ways (TripoSR's own Z up
//    facing +X among them) comes back to the contract by the reference alone.
// 6. A textured mesh (Hunyuan3D-style output): colours read from the texture,
//    the texture carried into a valid file.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadPNG } from '../tools/charmaker.mjs';
import { findParts, silhouette } from '../web/runtime/charmaker.js';
import { BOX, boxMesh } from './fixtures/mannequin.mjs';
import { PNG } from 'pngjs';
import { PARTS, readMeshGlb, rigFromKenney, fitMesh, writeRiggedGlb, frontView, orientMesh, vertexColorsFromTexture, parse, accessor, mat4, local } from '../web/runtime/rigmesh.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const rig = rigFromKenney(fs.readFileSync('assets/characters/character-a.glb'));
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);
const f3 = v => v.map(x => x.toFixed(3)).join(',');

// ------------------------------------------------------------------ 1. mannequin
const man = boxMesh(BOX), mfit = fitMesh(man, rig);
const px = 2.7 / 256; // one pixel of the front view
check(Math.abs(mfit.scale - 1) < 1e-9, `the mannequin is already rig height (scale ${mfit.scale})`);
check(mfit.found.legs && mfit.found.arms && mfit.found.neck, `legs, arms and neck all found (${JSON.stringify(mfit.found)})`);
// Where the rule (same place relative to its part as the rig's joint) puts each joint:
const rel = (name, a) => (rig.joints[name].pos[a] - rig.parts[name].min[a]) / (rig.parts[name].max[a] - rig.parts[name].min[a]);
const at = (lo, hi, r) => lo + r * (hi - lo);
const EXPECT = {
  // hips: the leg part spans the foot too (y 0..1.3); across, the thigh (not the foot)
  'leg-left': [at(0.05, 0.30, rel('leg-left', 0)), at(0, 1.3, rel('leg-left', 1)), at(-0.12, 0.12, rel('leg-left', 2))],
  'leg-right': [at(-0.30, -0.05, rel('leg-right', 0)), at(0, 1.3, rel('leg-right', 1)), at(-0.12, 0.12, rel('leg-right', 2))],
  // the torso part runs from the crotch to the neck cut (the neck box is torso)
  torso: [0, at(1.3, 2.16, rel('torso', 1)), 0],
  'arm-left': [at(0.36, 0.52, rel('arm-left', 0)), at(1.25, 2.05, rel('arm-left', 1)), at(-0.08, 0.08, rel('arm-left', 2))],
  'arm-right': [at(-0.52, -0.36, rel('arm-right', 0)), at(1.25, 2.05, rel('arm-right', 1)), at(-0.08, 0.08, rel('arm-right', 2))],
  head: [0, 2.16, 0],
};
for (const name of PARTS) check(near(mfit.joints[name], EXPECT[name], 2 * px), `mannequin ${name} joint at ${f3(mfit.joints[name])} (rule: ${f3(EXPECT[name])}, within 2 px)`);
const owner = { 'foot-left': 'leg-left', 'foot-right': 'leg-right', neck: 'torso' };
const wrong = man.tag.map((t, v) => [t, PARTS[mfit.part[v]]]).filter(([t, p], v) => {
  const y = man.positions[v * 3 + 1];
  if (t === 'neck' && Math.abs(y - 2.16) < 2 * px) return false; // the cuts themselves: either side is right
  if (/^leg-/.test(t) && Math.abs(y - 1.3) < 2 * px) return false;
  return (owner[t] || t) !== p;
});
check(wrong.length === 0, `every mannequin vertex on its own part, left on +X (${wrong.length} wrong${wrong.length ? ': ' + JSON.stringify(wrong.slice(0, 3)) : ''})`);

// ------------------------------------------------------------------ 2. the written file skins correctly
const out = writeRiggedGlb(rig, man, mfit), g = parse(out), J = g.json;
const prim = J.meshes[0].primitives[0], skin = J.skins[0];
const POS = accessor(g, prim.attributes.POSITION), JNT = accessor(g, prim.attributes.JOINTS_0), WGT = accessor(g, prim.attributes.WEIGHTS_0), IBM = accessor(g, skin.inverseBindMatrices);
const parentOf = {}; J.nodes.forEach((n, i) => (n.children || []).forEach(c => { parentOf[c] = i; }));
const world = (i, over = {}) => { const m = over[i] ? mat4.mul(local(J.nodes[i]), over[i]) : local(J.nodes[i]); return parentOf[i] === undefined ? m : mat4.mul(world(parentOf[i], over), m); };
const skinned = (over = {}) => {
  const M = skin.joints.map((j, k) => mat4.mul(world(j, over), Array.from(IBM.slice(k * 16, k * 16 + 16))));
  const n = POS.length / 3, o = new Float64Array(n * 3);
  for (let v = 0; v < n; v++) for (let i = 0; i < 4; i++) {
    const w = WGT[v * 4 + i]; if (!w) continue;
    const p = mat4.point(M[JNT[v * 4 + i]], [POS[v * 3], POS[v * 3 + 1], POS[v * 3 + 2]]);
    for (let k = 0; k < 3; k++) o[v * 3 + k] += w * p[k];
  }
  return o;
};
const rest = skinned();
const restErr = Math.max(...rest.map((v, i) => Math.abs(v - POS[i])));
check(restErr < 1e-5, `at rest every vertex stays where it was modelled (max ${restErr.toExponential(1)})`);
// Turn the left arm 60 degrees about X (as the walk does) and the head 15 about Y.
const qx = a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)], qy = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const ai = rig.byName['arm-left'], hi = rig.byName.head;
const posed = skinned({ [ai]: mat4.trs(undefined, qx(Math.PI / 3)), [hi]: mat4.trs(undefined, qy(Math.PI / 12)) });
const jw = name => mat4.point(world(rig.byName[name]), [0, 0, 0]);
let worst = 0, moved = 0;
for (const name of ['arm-left', 'head']) {
  const j = jw(name), k = PARTS.indexOf(name);
  for (let v = 0; v < POS.length / 3; v++) {
    if (!(JNT[v * 4] === k && WGT[v * 4] > 0.999)) continue;
    const d0 = Math.hypot(POS[v * 3] - j[0], POS[v * 3 + 1] - j[1], POS[v * 3 + 2] - j[2]);
    const d1 = Math.hypot(posed[v * 3] - j[0], posed[v * 3 + 1] - j[1], posed[v * 3 + 2] - j[2]);
    worst = Math.max(worst, Math.abs(d1 - d0));
    moved = Math.max(moved, Math.hypot(posed[v * 3] - POS[v * 3], posed[v * 3 + 1] - POS[v * 3 + 1], posed[v * 3 + 2] - POS[v * 3 + 2]));
  }
}
check(worst < 1e-5 && moved > 0.3, `a turned joint carries its part rigidly about the joint (distance to joint kept within ${worst.toExponential(1)}; moved up to ${moved.toFixed(2)})`);
// The hand swings forward (+Z) when the arm turns -60 about X... sign as the rig: compare with the blocky arm's own mesh.
const blockyHand = mat4.point(mat4.mul(world(ai, { [ai]: mat4.trs(undefined, qx(Math.PI / 3)) }), mat4.identity()), [0.2, -1, 0]);
const ourHand = (() => { let best = null; for (let v = 0; v < POS.length / 3; v++) if (man.tag[v] === 'arm-left' && (!best || POS[v * 3 + 1] < POS[best * 3 + 1])) best = v; return [posed[best * 3], posed[best * 3 + 1], posed[best * 3 + 2]]; })();
check(Math.sign(ourHand[2] - jw('arm-left')[2]) === Math.sign(blockyHand[2] - jw('arm-left')[2]), `the hand swings the same way as the blocky arm's (z ${ourHand[2].toFixed(2)} vs blocky ${blockyHand[2].toFixed(2)})`);
// Translation keys on the parts: offset from the new rest as they were from the old.
let keyErr = 0, keys = 0;
const oldJ = rig.glb.json;
for (const [ai2, anim] of J.animations.entries()) for (const [ci, ch] of anim.channels.entries()) {
  const name = J.nodes[ch.target.node].name;
  if (ch.target.path !== 'translation' || !PARTS.includes(name)) continue;
  const a = accessor(g, anim.samplers[ch.sampler].output), oldCh = oldJ.animations[ai2].channels[ci];
  const b = accessor(rig.glb, oldJ.animations[ai2].samplers[oldCh.sampler].output);
  const o = oldJ.nodes[rig.byName[name]].translation || [0, 0, 0], nw = J.nodes[rig.byName[name]].translation;
  for (let i = 0; i < a.length; i++) { keyErr = Math.max(keyErr, Math.abs(a[i] - (b[i] - o[i % 3] + nw[i % 3]))); keys++; }
}
check(keys > 0 && keyErr < 1e-6, `${keys / 3} part translation keys follow the moved joints (max error ${keyErr.toExponential(1)})`);
// Joints carry their part box (for soles and footprints in the studio).
const legBox = J.nodes[rig.byName['leg-left']].extras.part;
check(Math.abs(legBox.min[1] - (0 - mfit.joints['leg-left'][1])) < 1e-6, `the left leg's box reaches the sole (${legBox.min[1].toFixed(3)} below the hip)`);

// ------------------------------------------------------------------ 3. the fixture
const ref = loadPNG('test/fixtures/characters/male-adventurer.png'), refMask = silhouette(ref), rp = findParts(ref, refMask);
const mesh = readMeshGlb(fs.readFileSync('test/fixtures/stage2/male-adventurer-tripo.glb'));
// On its own silhouette TripoSR's mesh has no gap between the legs (it filled
// the drawing's), so the crotch would be guessed; the reference's boxes fix that.
const alone = fitMesh(mesh, rig), fit = fitMesh(mesh, rig, { reference: rp });
check(!alone.found.legs, `fixture alone: the legs merge in the mesh's silhouette (found ${JSON.stringify(alone.found)}), so stage 2 takes stage 1's boxes`);
check(fit.found.legs && fit.found.arms && fit.found.neck, `fixture with the reference's boxes: legs, arms and neck found (${JSON.stringify(fit.found)})`);
// The cuts land where stage 1's judged rows for this drawing (test/charmaker.test.mjs:
// neck 157-165, crotch 214-224) fall on the mesh.
const rowY = r => fit.positions.reduce((m, v, i) => i % 3 === 1 ? Math.max(m, v) : m, -Infinity) - (r - rp.box.y0) * fit.cuts.k;
const inY = (y, [a, b]) => y <= rowY(a) + 1e-9 && y >= rowY(b) - 1e-9;
check(inY(fit.cuts.neckY, [157, 165]), `fixture: neck cut at ${fit.cuts.neckY.toFixed(3)} (stage 1's judged rows: ${rowY(165).toFixed(3)}-${rowY(157).toFixed(3)})`);
check(inY(fit.cuts.crotchY, [214, 224]), `fixture: crotch cut at ${fit.cuts.crotchY.toFixed(3)} (stage 1's judged rows: ${rowY(224).toFixed(3)}-${rowY(214).toFixed(3)})`);
const xMean = name => { let s = 0, c = 0; fit.part.forEach((p, v) => { if (PARTS[p] === name) { s += fit.positions[v * 3]; c++; } }); return s / c; };
check(xMean('arm-left') > 0 && xMean('leg-left') > 0 && xMean('arm-right') < 0 && xMean('leg-right') < 0, 'fixture: its left arm and leg are on +X, its right on -X');
// Front view against the reference, both scaled to the same height.
const fb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < fit.positions.length; i += 3) for (let k = 0; k < 3; k++) { fb.min[k] = Math.min(fb.min[k], fit.positions[i + k]); fb.max[k] = Math.max(fb.max[k], fit.positions[i + k]); }
const refH = rp.box.y1 - rp.box.y0;
const view = frontView(fit.positions, mesh.indices, (fb.max[1] - fb.min[1]) / refH, fb, mesh.colors);
const vp = findParts(view);
// IoU, the two boxes aligned at their centres.
let inter = 0, uni = 0;
const ox = Math.round((rp.box.x0 + rp.box.x1) / 2 - (vp.box.x0 + vp.box.x1) / 2), oy = rp.box.y0 - vp.box.y0;
for (let y = 0; y < ref.height; y++) for (let x = 0; x < ref.width; x++) {
  const a = refMask[y * ref.width + x] === 1, vx = x - ox, vy = y - oy;
  const b = vx >= 0 && vy >= 0 && vx < view.width && vy < view.height && view.data[(vy * view.width + vx) * 4 + 3] > 0;
  if (a && b) inter++; if (a || b) uni++;
}
check(inter / uni > 0.85, `fixture: front silhouette matches the reference (IoU ${(inter / uni).toFixed(3)}, needs > 0.85)`);
// Each part's mean colour in the front view against the same part in the
// reference (the reference's boxes, moved onto the view). A generator can
// shift exposure as a whole (TripoSR's colours are lighter), so one gain per
// channel is fitted over all parts first and reported; then every part must
// be within 25 of the reference: colours on the right parts, none swapped.
const mean = (img, mask, r, dx = 0, dy = 0) => { const s = [0, 0, 0]; let c = 0; for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { const vx = x - dx, vy = y - dy; if (vx < 0 || vy < 0 || vx >= img.width || vy >= img.height) continue; const i = vy * img.width + vx; if (!(mask ? mask[i] : img.data[i * 4 + 3])) continue; for (let k = 0; k < 3; k++) s[k] += img.data[i * 4 + k]; c++; } return s.map(v => v / c); };
const KEYS = ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight'];
const refC = KEYS.map(k => mean(ref, refMask, rp[k])), viewC = KEYS.map(k => mean(view, null, rp[k], ox, oy));
const gain = [0, 1, 2].map(c => KEYS.reduce((s, _, i) => s + refC[i][c] * viewC[i][c], 0) / KEYS.reduce((s, _, i) => s + viewC[i][c] ** 2, 0));
check(gain.every(gn => gn > 0.7 && gn < 1.3), `fixture: overall colour gain ${gain.map(x => x.toFixed(2)).join(', ')} (within 0.7-1.3)`);
KEYS.forEach((k, i) => {
  const a = refC[i], b = viewC[i].map((v, c) => v * gain[c]), d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // the nearest other part's colour must be further away than this one's (nothing swapped)
  const other = Math.min(...KEYS.map((_, j) => j === i || Math.hypot(...refC[j].map((v, c) => v - refC[i][c])) < 10 ? Infinity : Math.hypot(...refC[j].map((v, c) => v - b[c]))));
  check(d < 25 && d < other, `fixture: ${k} colour ${b.map(Math.round)} vs reference ${a.map(Math.round)} (distance ${d.toFixed(1)}, needs < 25 and < ${other.toFixed(1)} to any other part)`);
});

// ------------------------------------------------------------------ 4. deterministic
const o1 = writeRiggedGlb(rig, mesh, fit), o2 = writeRiggedGlb(rig, mesh, fitMesh(mesh, rig, { reference: rp }));
check(o1.length === o2.length && o1.every((v, i) => v === o2[i]), `the same mesh makes the same file (${(o1.length / 1024).toFixed(0)} KB)`);

// Khronos's glTF validator: no errors, warnings, infos or hints.
{
  const r = await createRequire(import.meta.url)('gltf-validator').validateBytes(o1, { maxIssues: 0 });
  const I = r.issues;
  check(I.numErrors + I.numWarnings + I.numInfos + I.numHints === 0, `the file passes Khronos's glTF validator (${I.numErrors} errors, ${I.numWarnings} warnings, ${I.numInfos} infos, ${I.numHints} hints${I.messages.length ? ': ' + I.messages.slice(0, 3).map(m => m.code).join(', ') : ''})`);
}

// Colours: generators store sRGB; the file's COLOR_0 must be linear (glTF).
{
  const g1 = parse(o1), col = accessor(g1, g1.json.meshes[0].primitives[0].attributes.COLOR_0);
  const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  let err = 0; for (let v = 0; v < mesh.colors.length / 3; v++) for (let c = 0; c < 3; c++) err = Math.max(err, Math.abs(col[v * 4 + c] - lin(mesh.colors[v * 3 + c])));
  check(err < 1e-6, `vertex colours written linear, as glTF wants (max error ${err.toExponential(1)})`);
}

// ------------------------------------------------------------------ 5. orientation
{
  const turns = {
    'Z up, facing +X (TripoSR)': [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    'facing -Z': [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    'upside down': [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
    'lying on its side': [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
    'X up, facing -Y': [[0, 0, 1], [0, -1, 0], [1, 0, 0]],
    'as made': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  };
  for (const [what, Q] of Object.entries(turns)) {
    const n = mesh.positions.length / 3, p = new Float64Array(n * 3);
    for (let v = 0; v < n; v++) for (let r = 0; r < 3; r++) p[v * 3 + r] = 3 + Q[r][0] * mesh.positions[v * 3] + Q[r][1] * mesh.positions[v * 3 + 1] + Q[r][2] * mesh.positions[v * 3 + 2];
    const o = orientMesh({ ...mesh, positions: p }, ref, refMask);
    const c = [0, 2].map(k => { let lo = Infinity, hi = -Infinity; for (let i = k; i < mesh.positions.length; i += 3) { lo = Math.min(lo, mesh.positions[i]); hi = Math.max(hi, mesh.positions[i]); } return (lo + hi) / 2; });
    const err = Math.max(...o.mesh.positions.map((v, i) => Math.abs(v - (mesh.positions[i] - (i % 3 === 0 ? c[0] : i % 3 === 2 ? c[1] : 0))))); // the contract centres it
    check(err < 1e-6, `oriented from ${what}: back to the contract (max error ${err.toExponential(1)}; score ${o.scores[0].score.toFixed(3)}, runner-up ${o.scores[1].score.toFixed(3)})`);
  }
}

// ------------------------------------------------------------------ 6. textured
{
  // The mannequin with uvs into a 6-cell strip, one colour per box group.
  const CELLS = { leg: [200, 60, 60], foot: [200, 60, 60], torso: [60, 160, 80], neck: [230, 190, 160], arm: [60, 90, 200], head: [230, 190, 160] };
  const keys = Object.keys(CELLS), W = keys.length * 4, png = new PNG({ width: W, height: 4 });
  keys.forEach((k, i) => { for (let y = 0; y < 4; y++) for (let x = i * 4; x < i * 4 + 4; x++) png.data.set([...CELLS[k], 255], (y * W + x) * 4); });
  const group = t => keys.find(k => t.startsWith(k));
  const uvs = new Float64Array(man.tag.length * 2);
  man.tag.forEach((t, v) => { uvs[v * 2] = (keys.indexOf(group(t)) * 4 + 2) / W; uvs[v * 2 + 1] = 0.5; });
  const tex = { ...man, colors: null, uvs, image: { mimeType: 'image/png', bytes: PNG.sync.write(png) } };
  const cols = vertexColorsFromTexture(tex, { width: W, height: 4, data: png.data });
  const bad = man.tag.filter((t, v) => CELLS[group(t)].some((c, k) => Math.abs(cols[v * 3 + k] * 255 - c) > 0.5)).length;
  check(bad === 0, `textured: every vertex's colour read from its texel (${bad} wrong)`);
  const out = writeRiggedGlb(rig, tex, fitMesh(tex, rig)), g = parse(out), pr = g.json.meshes[0].primitives[0];
  check(pr.attributes.TEXCOORD_0 !== undefined && !pr.attributes.COLOR_0 && g.json.images.length === 1 && g.json.materials[0].pbrMetallicRoughness.baseColorTexture, 'textured: the file carries uvs and the texture, not vertex colours');
  const back = readMeshGlb(out);
  check(back.image && back.image.bytes.length === tex.image.bytes.length && back.image.bytes.every((b, i) => b === tex.image.bytes[i]), 'textured: the texture comes back out byte for byte');
  const r = await createRequire(import.meta.url)('gltf-validator').validateBytes(out, { maxIssues: 0 });
  check(r.issues.numErrors + r.issues.numWarnings === 0, `textured: passes Khronos's glTF validator (${r.issues.numErrors} errors, ${r.issues.numWarnings} warnings${r.issues.messages.length ? ': ' + r.issues.messages.slice(0, 3).map(m => m.code).join(', ') : ''})`);
}

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
