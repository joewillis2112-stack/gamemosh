// Character maker, stage 2: rig any character mesh to the studio's blocky rig,
// so it plays with the same clips and scripts as the blocky character.
//
// The mesh comes from a generator (tools/stage2: TripoSR on CPU, Hunyuan3D on
// a GPU Space, or anything else) in the mesh contract: Y up, facing +Z, feet
// at y = 0, centred on x and z, any scale. Pure functions on plain arrays, so
// the same code runs in the studio and in Node tests.
//
//   readMeshGlb(bytes)          -> { positions, indices, colors?, uvs?, image? }
//   orientMesh(mesh, ref, mask) -> the mesh turned into the contract, by the reference drawing
//   rigFromKenney(bytes)        -> the blocky rig: joints, parts, clips
//   fitMesh(mesh, rig)          -> parts, joints and skin weights for the mesh
//   writeRiggedGlb(rig, mesh, fit) -> glb bytes: the mesh skinned to the rig's
//                                  nodes, the rig's clips retargeted to the new joints
//
// Body parts are found the way stage 1 finds them in a 2D reference
// (charmaker.findParts), on the mesh's own front silhouette. Each joint keeps
// its place relative to its part (Kenney's hip at the top centre of the leg,
// and so on), so a mesh with other proportions still bends where it should.
import { findParts } from './charmaker.js';

export const PARTS = ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'];
const FIND = { head: 'head', torso: 'torso', 'arm-left': 'armLeft', 'arm-right': 'armRight', 'leg-left': 'legLeft', 'leg-right': 'legRight' };

// --------------------------------------------------------------- glb in

export function parse(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb file');
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const binStart = 20 + jl, bin = binStart < u8.length ? u8.subarray(binStart + 8, binStart + 8 + dv.getUint32(binStart, true)) : new Uint8Array(0);
  return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READ = {
  5126: [4, (d, o) => d.getFloat32(o, true), 1],
  5125: [4, (d, o) => d.getUint32(o, true), 4294967295],
  5123: [2, (d, o) => d.getUint16(o, true), 65535],
  5121: [1, (d, o) => d.getUint8(o), 255],
  5122: [2, (d, o) => d.getInt16(o, true), 32767],
  5120: [1, (d, o) => d.getInt8(o), 127],
};

/** An accessor as a flat Float64Array (normalized integers mapped to 0..1). */
export function accessor({ json, bin }, i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = COMPONENTS[a.type];
  const [size, get, max] = READ[a.componentType];
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const stride = bv.byteStride || n * size, off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const v = get(dv, off + k * stride + c * size);
    out[k * n + c] = a.normalized ? v / max : v;
  }
  return out;
}

export const mat4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  // column-major, as glTF
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
    const [x, y, z, w] = q;
    return [
      (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
      2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
      2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
      t[0], t[1], t[2], 1];
  },
  point: (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]),
};
export const local = n => n.matrix ? n.matrix.slice() : mat4.trs(n.translation, n.rotation, n.scale);

/** Every mesh in the file, in model space (node transforms applied), as one
 *  triangle mesh: positions, indices, and colours (vertex colour times the
 *  material's base colour) or uvs plus the base-colour image. */
export function readMeshGlb(bytes) {
  const g = parse(bytes), { json } = g;
  const P = [], I = [], C = [], U = []; let image = null, hasUv = false, hasColor = false;
  const visit = (ni, parent) => {
    const node = json.nodes[ni], m = mat4.mul(parent, local(node));
    if (node.mesh !== undefined) for (const prim of json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const base = P.length / 3, pos = accessor(g, prim.attributes.POSITION), n = pos.length / 3;
      for (let k = 0; k < n; k++) P.push(...mat4.point(m, [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]));
      const idx = prim.indices !== undefined ? accessor(g, prim.indices) : Float64Array.from({ length: n }, (_, k) => k);
      for (const v of idx) I.push(base + v);
      const mat = prim.material !== undefined ? json.materials[prim.material] : null;
      const pbr = (mat && mat.pbrMetallicRoughness) || {}, f = pbr.baseColorFactor || [1, 1, 1, 1];
      const col = prim.attributes.COLOR_0 !== undefined ? accessor(g, prim.attributes.COLOR_0) : null;
      const cw = col ? json.accessors[prim.attributes.COLOR_0].type === 'VEC4' ? 4 : 3 : 0;
      if (col) hasColor = true;
      for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) C.push((col ? col[k * cw + c] : 1) * f[c]);
      if (prim.attributes.TEXCOORD_0 !== undefined) { hasUv = true; U.push(...accessor(g, prim.attributes.TEXCOORD_0)); } else for (let k = 0; k < n; k++) U.push(0, 0);
      if (!image && pbr.baseColorTexture) {
        const img = json.images[json.textures[pbr.baseColorTexture.index].source];
        if (img.bufferView !== undefined) {
          const bv = json.bufferViews[img.bufferView];
          image = { mimeType: img.mimeType, bytes: g.bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength) };
        }
      }
    }
    for (const c of node.children || []) visit(c, m);
  };
  const roots = json.scenes ? json.scenes[json.scene || 0].nodes : json.nodes.map((_, i) => i);
  for (const r of roots) visit(r, mat4.identity());
  if (!P.length) throw new Error('no triangles in the file');
  return {
    positions: Float64Array.from(P), indices: Uint32Array.from(I),
    colors: hasColor || !image ? Float64Array.from(C) : null,
    uvs: hasUv && image ? Float64Array.from(U) : null, image,
  };
}

// --------------------------------------------------------------- into the contract

/** Per-vertex sRGB colours (0..1) sampled from a texture ({ width, height,
 *  data } RGBA) at each vertex's uv, for meshes a generator textured instead
 *  of colouring (the front-view checks need colours). */
export function vertexColorsFromTexture(mesh, img) {
  const n = mesh.positions.length / 3, out = new Float64Array(n * 3);
  const wrap = (v, m) => ((Math.floor(v) % m) + m) % m;
  for (let v = 0; v < n; v++) {
    const x = wrap(mesh.uvs[v * 2] * img.width, img.width), y = wrap(mesh.uvs[v * 2 + 1] * img.height, img.height), i = (y * img.width + x) * 4;
    for (let c = 0; c < 3; c++) out[v * 3 + c] = img.data[i + c] / 255;
  }
  return out;
}

// The 24 rotations that keep a mesh unmirrored, as rows [X', Y', Z']: Y' is
// one of the six axis directions (which way is up), Z' one of the four
// perpendicular to it (which way it faces), X' = Y' x Z'.
const ROTATIONS = (() => {
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], out = [];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const up of dirs) for (const f of dirs) if (up.every((v, k) => v * f[k] === 0)) out.push([cross(up, f), up, f]);
  return out;
})();

/** A mesh from any generator, turned into the contract (Y up, facing +Z, feet
 *  at y 0, centred): of the 24 unmirrored axis rotations, the one whose front
 *  view best matches the reference drawing. The score is the silhouettes'
 *  overlap (IoU), less the mean colour difference where both are opaque when
 *  the mesh has colours (so front and back aren't confused on a symmetric
 *  body). Returns { mesh, rotation, scores } (scores best first). */
export function orientMesh(mesh, ref, refMask, { pixels = 96 } = {}) {
  let rb = { x0: ref.width, y0: ref.height, x1: 0, y1: 0 };
  for (let y = 0; y < ref.height; y++) for (let x = 0; x < ref.width; x++) if (refMask[y * ref.width + x]) {
    rb.x0 = Math.min(rb.x0, x); rb.x1 = Math.max(rb.x1, x + 1); rb.y0 = Math.min(rb.y0, y); rb.y1 = Math.max(rb.y1, y + 1);
  }
  const n = mesh.positions.length / 3, scores = [];
  const rotate = R => { const p = new Float64Array(n * 3); for (let v = 0; v < n; v++) for (let r = 0; r < 3; r++) p[v * 3 + r] = R[r][0] * mesh.positions[v * 3] + R[r][1] * mesh.positions[v * 3 + 1] + R[r][2] * mesh.positions[v * 3 + 2]; return p; };
  for (const R of ROTATIONS) {
    const p = rotate(R), b = bounds(p), H = b.max[1] - b.min[1];
    const view = frontView(p, mesh.indices, H / pixels, b, mesh.colors);
    // Reference pixel under each view pixel: same height, centres aligned.
    const k = (rb.y1 - rb.y0) / pixels, vcx = (b.min[0] + b.max[0]) / 2, rcx = (rb.x0 + rb.x1) / 2;
    let inter = 0, uni = 0, diff = 0;
    const W = Math.max(view.width, Math.ceil((rb.x1 - rb.x0) / k) + 4);
    for (let iy = 0; iy < view.height; iy++) for (let jx = -W; jx < W; jx++) {
      const mx = vcx + jx * (H / pixels); // model x of this column
      const ix = Math.floor((mx - b.min[0]) / (H / pixels)) + 1;
      const a = ix >= 0 && ix < view.width && view.data[(iy * view.width + ix) * 4 + 3] > 0;
      const rx = Math.floor(rcx + jx * k), ry = Math.floor(rb.y0 + (iy - 1 + 0.5) * k);
      const r = rx >= 0 && ry >= 0 && rx < ref.width && ry < ref.height && refMask[ry * ref.width + rx] === 1;
      if (a || r) uni++;
      if (a && r) {
        inter++;
        if (mesh.colors) { const vi = (iy * view.width + ix) * 4, ri = (ry * ref.width + rx) * 4; diff += (Math.abs(view.data[vi] - ref.data[ri]) + Math.abs(view.data[vi + 1] - ref.data[ri + 1]) + Math.abs(view.data[vi + 2] - ref.data[ri + 2])) / 765; }
      }
    }
    const iou = inter / uni, colour = mesh.colors && inter ? diff / inter : 0;
    scores.push({ rotation: R, iou, colour, score: iou - 0.5 * colour });
  }
  scores.sort((x, y) => y.score - x.score);
  const R = scores[0].rotation, p = rotate(R), b = bounds(p);
  for (let v = 0; v < n; v++) { p[v * 3] -= (b.min[0] + b.max[0]) / 2; p[v * 3 + 1] -= b.min[1]; p[v * 3 + 2] -= (b.min[2] + b.max[2]) / 2; }
  return { mesh: { ...mesh, positions: p }, rotation: R, scores };
}

// --------------------------------------------------------------- the blocky rig

/** The blocky rig from a Kenney character glb: each part's joint (world rest
 *  position, parent), its box in model space, and the file itself (its clips
 *  are carried over). */
export function rigFromKenney(bytes) {
  const g = parse(bytes), { json } = g;
  const byName = Object.fromEntries(json.nodes.map((n, i) => [n.name, i]));
  for (const p of PARTS.concat('root')) if (byName[p] === undefined) throw new Error(`the rig has no '${p}' node`);
  const parentOf = {};
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => { parentOf[c] = i; }));
  const world = i => parentOf[i] === undefined ? local(json.nodes[i]) : mat4.mul(world(parentOf[i]), local(json.nodes[i]));
  const joints = {}, parts = {};
  for (const name of PARTS) {
    const i = byName[name], w = world(i), node = json.nodes[i];
    joints[name] = { pos: mat4.point(w, [0, 0, 0]), parent: json.nodes[parentOf[i]].name, scale: node.scale || [1, 1, 1] };
    const a = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
    const c0 = mat4.point(w, a.min), c1 = mat4.point(w, a.max);
    parts[name] = { min: c0.map((v, k) => Math.min(v, c1[k])), max: c0.map((v, k) => Math.max(v, c1[k])) };
  }
  const lo = Math.min(...PARTS.map(p => parts[p].min[1])), hi = Math.max(...PARTS.map(p => parts[p].max[1]));
  return { glb: g, byName, joints, parts, height: hi - lo, floor: lo };
}

// --------------------------------------------------------------- fitting

/** The mesh's front view (looking down -Z; the character's left on the
 *  image's right), orthographic at px model units per pixel: opaque where the
 *  mesh covers, coloured (sRGB) by the nearest surface when colours are given.
 *  An RGBA image for charmaker.findParts, with toModel(ix, iy) -> [x, y]. */
export function frontView(pos, idx, px, bounds, colors = null) {
  const [x0] = bounds.min, W = Math.ceil((bounds.max[0] - x0) / px) + 2, H = Math.ceil((bounds.max[1] - bounds.min[1]) / px) + 2;
  const data = new Uint8ClampedArray(W * H * 4), zb = new Float64Array(W * H).fill(-Infinity);
  const X = v => (pos[v * 3] - x0) / px + 1, Y = v => (bounds.max[1] - pos[v * 3 + 1]) / px + 1;
  for (let t = 0; t < idx.length; t += 3) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]], xs = vs.map(X), ys = vs.map(Y), zs = vs.map(v => pos[v * 3 + 2]);
    const d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
    if (Math.abs(d) < 1e-12) continue;
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
        const gx = x + 0.5, gy = y + 0.5;
        const w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d;
        const w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const i = y * W + x, z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2];
        data[i * 4 + 3] = 255;
        if (!colors || z <= zb[i]) continue;
        zb[i] = z;
        for (let c = 0; c < 3; c++) data[i * 4 + c] = 255 * (w0 * colors[vs[0] * 3 + c] + w1 * colors[vs[1] * 3 + c] + w2 * colors[vs[2] * 3 + c]);
      }
  }
  return { width: W, height: H, data, toModel: (ix, iy) => [x0 + (ix - 1) * px, bounds.max[1] - (iy - 1) * px] };
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0)); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function bounds(pos) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
  return { min, max };
}

function neighbours(idx, n) {
  const adj = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; adj[a].add(b); adj[b].add(a); }
  return adj.map(s => Uint32Array.from(s));
}

/** Fit a contract mesh to the rig. Returns { scale, positions (in rig units),
 *  part (per-vertex part index into PARTS), parts (boxes), joints (new world
 *  rest positions), weights (per vertex, PARTS.length each), found, cuts }.
 *
 *  The cuts (neck, crotch, arms, the split between the legs) come from
 *  `reference`, the stage-1 part boxes of the drawing the mesh was made from
 *  (charmaker.findParts, possibly corrected by the creator), laid over the
 *  mesh's front view by their bounding boxes. Without one, they're found on
 *  the mesh's own front silhouette, which works only where the mesh keeps the
 *  gaps (a generator often fills the one between the legs). */
export function fitMesh(mesh, rig, { reference = null, pixels = 256, blend = 0.45, smooth = 12 } = {}) {
  const b0 = bounds(mesh.positions), scale = rig.height / (b0.max[1] - b0.min[1]);
  const pos = mesh.positions.map((v, i) => i % 3 === 1 ? (v - b0.min[1]) * scale + rig.floor : v * scale);
  const n = pos.length / 3, b = bounds(pos), H = b.max[1] - b.min[1];

  let f, xAt, yAt, px;
  if (reference) {
    // Image to model: the reference's box onto the mesh's, same scale both ways, centred.
    f = reference; const rb = f.box, k = H / (rb.y1 - rb.y0), cx = (rb.x0 + rb.x1) / 2, mx = (b.min[0] + b.max[0]) / 2;
    xAt = ix => mx + (ix - cx) * k; yAt = iy => b.max[1] - (iy - rb.y0) * k; px = k;
  } else {
    px = H / pixels;
    const sil = frontView(pos, mesh.indices, px, b);
    f = findParts(sil);
    xAt = ix => sil.toModel(ix, 0)[0]; yAt = iy => sil.toModel(0, iy)[1];
  }
  const neckY = yAt(f.head.y1), crotchY = yAt(f.legLeft.y0);
  const torsoX0 = xAt(f.torso.x0), torsoX1 = xAt(f.torso.x1); // the character's right (-X) .. left (+X)
  // An arm's lowest row, less a pixel and a half: the image is quantised, and
  // the bottom of a hand must not fall to the leg beside it.
  const armRightBottom = yAt(f.armRight.y1) - 1.5 * px, armLeftBottom = yAt(f.armLeft.y1) - 1.5 * px;
  const legSplitX = xAt(f.legLeft.x0);
  const part = new Uint8Array(n);
  const P = Object.fromEntries(PARTS.map((p, i) => [p, i]));
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1];
    if (y >= neckY) part[v] = P.head;
    else if (x < torsoX0 + 1.5 * px && y >= armRightBottom) part[v] = P['arm-right']; // (an arm's inner face lies on the cut)
    else if (x > torsoX1 - 1.5 * px && y >= armLeftBottom) part[v] = P['arm-left'];
    else if (y < crotchY) part[v] = x >= legSplitX ? P['leg-left'] : P['leg-right'];
    else part[v] = P.torso;
  }

  // Each part's box, and its joint at the same relative spot as the rig's.
  const parts = {}, joints = {};
  PARTS.forEach((name, i) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < n; v++) if (part[v] === i) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[v * 3 + k]); max[k] = Math.max(max[k], pos[v * 3 + k]); }
    if (min[0] === Infinity) throw new Error(`no vertices found for the ${name}`);
    // Along Y, a part ends at its cut line, not at whichever vertex happens to
    // be nearest it (that would depend on how dense the mesh is).
    if (/^leg-/.test(name)) max[1] = crotchY;
    if (name === 'torso') { min[1] = crotchY; max[1] = neckY; }
    if (name === 'head') min[1] = neckY;
    parts[name] = { min, max };
  });
  for (const name of PARTS) {
    const k = rig.parts[name], m = parts[name], j = rig.joints[name].pos, i = P[name];
    const rel = a => (j[a] - k.min[a]) / (k.max[a] - k.min[a]);
    const y = m.min[1] + rel(1) * (m.max[1] - m.min[1]);
    // Across (x, z), measure the part where it meets the joint: a hip sits over
    // the thigh, not halfway to the toes.
    // The slab widens until it holds vertices (a coarse mesh can have none near the joint).
    const smin = [Infinity, 0, Infinity], smax = [-Infinity, 0, -Infinity];
    for (let slab = 0.15 * (m.max[1] - m.min[1]); smin[0] === Infinity && slab < 2 * (m.max[1] - m.min[1]); slab *= 1.5)
      for (let v = 0; v < n; v++) if (part[v] === i && Math.abs(pos[v * 3 + 1] - y) <= slab) for (const a of [0, 2]) { smin[a] = Math.min(smin[a], pos[v * 3 + a]); smax[a] = Math.max(smax[a], pos[v * 3 + a]); }
    const s = { min: smin, max: smax };
    joints[name] = [s.min[0] + rel(0) * (s.max[0] - s.min[0]), y, s.min[2] + rel(2) * (s.max[2] - s.min[2])];
  }

  // Skin weights: rigid per part, then blended across each limb's seam with
  // the torso, only near that limb's joint (so a hand resting on a thigh, or an
  // arm against the chest, doesn't drag the other part along).
  const w = new Float64Array(n * PARTS.length);
  for (let v = 0; v < n; v++) w[v * PARTS.length + part[v]] = 1;
  const adj = neighbours(mesh.indices, n), T = P.torso;
  for (const limb of PARTS) {
    if (limb === 'torso') continue;
    const L = P[limb], j = joints[limb], s = parts[limb];
    const r = blend * Math.max(s.max[0] - s.min[0], s.max[2] - s.min[2]);
    const band = [];
    for (let v = 0; v < n; v++) {
      if (part[v] !== L && part[v] !== T) continue;
      const dx = pos[v * 3] - j[0], dy = pos[v * 3 + 1] - j[1], dz = pos[v * 3 + 2] - j[2];
      if (dx * dx + dy * dy + dz * dz < r * r) band.push(v);
    }
    for (let it = 0; it < smooth; it++) {
      const next = new Map();
      for (const v of band) {
        let sl = 0, cnt = 0;
        for (const u of adj[v]) if (part[u] === L || part[u] === T) { sl += w[u * PARTS.length + L]; cnt++; }
        if (cnt) next.set(v, (w[v * PARTS.length + L] + sl) / (cnt + 1));
      }
      for (const [v, l] of next) {
        const own = v * PARTS.length;
        const other = 1 - l; // the rest goes to the torso (or stays on the limb)
        w[own + L] = l; w[own + T] = other;
      }
    }
  }
  // Renormalise (a vertex near two seams can carry three weights).
  for (let v = 0; v < n; v++) {
    let s = 0; for (let k = 0; k < PARTS.length; k++) s += w[v * PARTS.length + k];
    for (let k = 0; k < PARTS.length; k++) w[v * PARTS.length + k] /= s;
  }
  // Fusions to sever: a generator often welds a hand to the thigh it rests on,
  // or a forearm to the hip, and a walk then stretches skin between them. A
  // face joining an arm to a leg, or to the torso below the upper third of the
  // arm (the armpit's seam stays), is dropped when written.
  const tris = mesh.indices.length / 3, severed = new Uint8Array(tris);
  const arms = [P['arm-left'], P['arm-right']], legs = [P['leg-left'], P['leg-right']];
  for (let t = 0; t < tris; t++) {
    const ps = [0, 1, 2].map(k => part[mesh.indices[t * 3 + k]]);
    const arm = ps.find(q => arms.includes(q));
    if (arm === undefined) continue;
    if (ps.some(q => legs.includes(q))) { severed[t] = 1; continue; }
    if (ps.includes(T)) {
      const s = parts[PARTS[arm]], y = [0, 1, 2].reduce((a, k) => a + pos[mesh.indices[t * 3 + k] * 3 + 1], 0) / 3;
      if (y < s.max[1] - (s.max[1] - s.min[1]) / 3) severed[t] = 1;
    }
  }
  // Close the holes severing leaves: each boundary loop next to a severed face,
  // fanned from its first vertex, wound against the faces around it.
  // Topology by position: a texture seam duplicates vertices, and a hole's
  // edge often runs along one.
  const canon = new Uint32Array(n), firstAt = new Map();
  for (let v = 0; v < n; v++) {
    const key = pos[v * 3].toFixed(6) + ',' + pos[v * 3 + 1].toFixed(6) + ',' + pos[v * 3 + 2].toFixed(6);
    if (!firstAt.has(key)) firstAt.set(key, v);
    canon[v] = firstAt.get(key);
  }
  const caps = [], next = new Map(), I = mesh.indices.map(v => canon[v]);
  const onCut = new Set();
  for (let t = 0; t < tris; t++) if (severed[t]) for (let k = 0; k < 3; k++) onCut.add(I[t * 3 + k]);
  const half = new Set();
  for (let t = 0; t < tris; t++) if (!severed[t]) for (let k = 0; k < 3; k++) half.add(I[t * 3 + k] + ',' + I[t * 3 + (k + 1) % 3]);
  for (let t = 0; t < tris; t++) if (!severed[t]) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k], c = I[t * 3 + (k + 1) % 3];
    if (onCut.has(a) && onCut.has(c) && !half.has(c + ',' + a)) { if (!next.has(a)) next.set(a, []); next.get(a).push(c); }
  }
  for (const start of next.keys()) {
    while (next.get(start).length) {
      const loop = [start];
      let v = next.get(start).pop();
      while (v !== start && next.has(v) && next.get(v).length && loop.length < 4096) { loop.push(v); v = next.get(v).pop(); }
      if (v === start && loop.length >= 3) for (let i = 1; i + 1 < loop.length; i++) caps.push(loop[0], loop[i + 1], loop[i]);
    }
  }
  return { scale, positions: pos, part, parts, joints, weights: w, severed, caps: Uint32Array.from(caps), found: f.found, cuts: { neckY, crotchY, torsoX0, torsoX1, legSplitX, k: px } };
}

// --------------------------------------------------------------- glb out

/** The rig's file with its part meshes replaced by the fitted mesh, skinned to
 *  the part nodes at their new rest positions. Clip translation keys on the
 *  parts are moved by the same offset as each joint (rotations are kept), so
 *  every clip plays as before about the new joints. */
export function writeRiggedGlb(rig, mesh, fit) {
  // A fresh buffer: only the rig's clips are copied over (its part meshes,
  // textures and anything else unused are left behind).
  const json = JSON.parse(JSON.stringify(rig.glb.json));
  json.accessors = []; json.bufferViews = [];
  const chunks = [], align = () => { const len = chunks.reduce((s, c) => s + c.length, 0); if (len % 4) chunks.push(new Uint8Array(4 - len % 4)); };
  const binLength = () => chunks.reduce((s, c) => s + c.length, 0);
  const view = (bytes, target) => { align(); const v = { buffer: 0, byteOffset: binLength(), byteLength: bytes.byteLength }; if (target) v.target = target; chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); json.bufferViews.push(v); return json.bufferViews.length - 1; };
  const acc = (arr, type, componentType, extra = {}, target) => { json.accessors.push({ bufferView: view(arr, target), componentType, count: arr.length / COMPONENTS[type], type, ...extra }); return json.accessors.length - 1; };

  const n = fit.positions.length / 3;
  const pos = Float32Array.from(fit.positions), b = bounds(pos);
  // The faces written: the mesh's, less the fusions fitMesh severed, plus the
  // caps closing their holes.
  let idx = mesh.indices;
  if (fit.severed) {
    const f = [];
    for (let t = 0; t < idx.length; t += 3) if (!fit.severed[t / 3]) f.push(idx[t], idx[t + 1], idx[t + 2]);
    idx = Uint32Array.from(f.concat(Array.from(fit.caps || [])));
  }
  // Smooth normals from the faces.
  const nor = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, c, d] = [idx[t], idx[t + 1], idx[t + 2]];
    const u = [0, 1, 2].map(k => pos[c * 3 + k] - pos[a * 3 + k]), v = [0, 1, 2].map(k => pos[d * 3 + k] - pos[a * 3 + k]);
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    for (const i of [a, c, d]) { nor[i * 3] += nx; nor[i * 3 + 1] += ny; nor[i * 3 + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
    if (l) { nor[i * 3] /= l; nor[i * 3 + 1] /= l; nor[i * 3 + 2] /= l; } else nor[i * 3 + 1] = 1; // in no face written (severed): any unit normal
  }
  // Up to four influences per vertex.
  const J = new Uint8Array(n * 4), W = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const ws = PARTS.map((_, k) => [k, fit.weights[v * PARTS.length + k]]).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const s = ws.reduce((t, x) => t + x[1], 0);
    ws.forEach(([k, x], i) => { if (x > 0) { J[v * 4 + i] = k; W[v * 4 + i] = x / s; } }); // unused slots: joint 0, weight 0
  }

  // New rest translations: each part node's local offset from its parent.
  const nodeOf = name => json.nodes[rig.byName[name]];
  const worldPos = name => name === 'root' ? mat4.point(local(nodeOf('root')), [0, 0, 0]) : fit.joints[name];
  const parentScale = name => { const p = rig.joints[name].parent; return p === 'root' ? (nodeOf('root').scale || [1, 1, 1]) : rig.joints[p].scale; };
  const oldRest = {}, newRest = {};
  for (const name of PARTS) {
    const node = nodeOf(name), parent = rig.joints[name].parent, ps = parentScale(name);
    oldRest[name] = (node.translation || [0, 0, 0]).slice();
    newRest[name] = [0, 1, 2].map(k => (fit.joints[name][k] - worldPos(parent)[k]) / ps[k]);
    node.translation = newRest[name];
    delete node.mesh;
  }
  // Inverse bind matrices: the inverse of each joint's world rest matrix
  // (translation and the node's own scale; the rig has no rest rotations).
  const ibm = new Float32Array(16 * PARTS.length);
  PARTS.forEach((name, i) => {
    let sc = nodeOf(name).scale || [1, 1, 1];
    if (rig.joints[name].parent !== 'root') sc = sc.map((s, k) => s * rig.joints[rig.joints[name].parent].scale[k]);
    const t = fit.joints[name];
    ibm.set([1 / sc[0], 0, 0, 0, 0, 1 / sc[1], 0, 0, 0, 0, 1 / sc[2], 0, -t[0] / sc[0], -t[1] / sc[1], -t[2] / sc[2], 1], i * 16);
  });
  // The clips, copied. Translation keys on the parts keep their offset from
  // rest: the same offset from the new rest (rotations are kept as they are).
  for (const anim of json.animations || []) {
    const moved = new Map();
    for (const ch of anim.channels) { const name = json.nodes[ch.target.node].name; if (ch.target.path === 'translation' && PARTS.includes(name)) moved.set(ch.sampler, name); }
    anim.samplers.forEach((smp, si) => { for (const key of ['input', 'output']) {
      const a = rig.glb.json.accessors[smp[key]];
      if (a.componentType !== 5126) throw new Error('the rig\'s clips must store floats');
      const vals = Float32Array.from(accessor(rig.glb, smp[key])), name = key === 'output' && moved.get(si);
      if (name) for (let i = 0; i < vals.length; i++) vals[i] = vals[i] - oldRest[name][i % 3] + newRest[name][i % 3];
      smp[key] = acc(vals, a.type, 5126, key === 'input' ? { min: a.min, max: a.max } : {});
    } });
  }

  const attributes = {
    POSITION: acc(pos, 'VEC3', 5126, { min: b.min, max: b.max }, 34962),
    NORMAL: acc(nor, 'VEC3', 5126, {}, 34962),
    JOINTS_0: acc(J, 'VEC4', 5121, {}, 34962),
    WEIGHTS_0: acc(W, 'VEC4', 5126, {}, 34962),
  };
  const material = { name: 'rigged', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.85 } };
  if (mesh.uvs && mesh.image) {
    attributes.TEXCOORD_0 = acc(Float32Array.from(mesh.uvs), 'VEC2', 5126, {}, 34962);
    json.images = [{ bufferView: view(mesh.image.bytes), mimeType: mesh.image.mimeType, name: 'rigged' }];
    json.samplers = [{ magFilter: 9729, minFilter: 9987 }];
    json.textures = [{ sampler: 0, source: 0 }];
    material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
  } else {
    delete json.images; delete json.textures; delete json.samplers;
    // Generators store sRGB colours; glTF's COLOR_0 is linear.
    const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const col = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) col.set([lin(mesh.colors[v * 3]), lin(mesh.colors[v * 3 + 1]), lin(mesh.colors[v * 3 + 2]), 1], v * 4);
    attributes.COLOR_0 = acc(col, 'VEC4', 5126, {}, 34962);
  }
  // Triangles of zero area (a decimator leaves a few) are dropped.
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, c, d] = [idx[t], idx[t + 1], idx[t + 2]];
    const u = [0, 1, 2].map(k => pos[c * 3 + k] - pos[a * 3 + k]), v = [0, 1, 2].map(k => pos[d * 3 + k] - pos[a * 3 + k]);
    if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-12) keep.push(a, c, d);
  }
  const big = n > 65535;
  const indices = acc(big ? Uint32Array.from(keep) : Uint16Array.from(keep), 'SCALAR', big ? 5125 : 5123, {}, 34963);
  json.materials = [material];
  json.meshes = [{ name: 'body', primitives: [{ attributes, indices, material: 0 }] }];
  json.skins = [{ joints: PARTS.map(p => rig.byName[p]), inverseBindMatrices: acc(ibm, 'MAT4', 5126), skeleton: rig.byName.root }];
  // The skinned mesh hangs off the scene's top node (its own transform is
  // ignored for skinning). Each joint records its part's box in joint space,
  // for measuring soles and footprints without per-part meshes.
  // The skinned body is a scene root (a parent's transform wouldn't apply to it anyway).
  json.nodes.push({ name: 'body', mesh: 0, skin: 0 });
  json.scenes[json.scene || 0].nodes.push(json.nodes.length - 1);
  for (const name of PARTS) {
    const node = nodeOf(name), j = fit.joints[name], box = fit.parts[name];
    let sc = node.scale || [1, 1, 1];
    if (rig.joints[name].parent !== 'root') sc = sc.map((s, k) => s * rig.joints[rig.joints[name].parent].scale[k]);
    node.extras = { ...(node.extras || {}), part: { min: box.min.map((v, k) => (v - j[k]) / sc[k]), max: box.max.map((v, k) => (v - j[k]) / sc[k]) } };
  }
  json.asset = { ...json.asset, generator: 'Claude Studio character maker, stage 2' };
  json.buffers = [{ byteLength: 0 }];
  align();
  const bin = concat(chunks);
  json.buffers[0].byteLength = bin.length;
  let text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - text.length % 4) % 4; text = Uint8Array.from([...text, ...new Array(pad).fill(0x20)]);
  const out = new Uint8Array(12 + 8 + text.length + 8 + bin.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, text.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20);
  dv.setUint32(20 + text.length, bin.length, true); dv.setUint32(24 + text.length, 0x004e4942, true); out.set(bin, 28 + text.length);
  return out;
}
