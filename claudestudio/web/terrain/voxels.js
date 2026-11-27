// Roblox's smooth terrain, as data: a grid of 4-stud cells, each with an
// occupancy (0..1, how much of it is filled) and a material. Cell (0,0,0)
// spans world [0,4) on each axis, as Terrain:CellCornerToWorld(0,0,0) is the
// origin. Stored sparsely in chunks of 16x16x16 cells (64 studs).
// The Fill* shapes set occupancy from the shape's signed distance at each
// cell's centre, so a surface meshed at occupancy 0.5 (mesher.js) passes
// where the shape's surface is: the smooth edges Roblox's fills have.
// Ours where Roblox documents nothing: a fill takes the larger occupancy and
// sets its material where the shape covers the cell's centre; Air carves.
// Engine-free (Node tests run it).
export const CELL = 4, CHUNK = 16, CHUNK_CELLS = CHUNK * CHUNK * CHUNK;

// Roblox's terrain materials (Enum.Material names), index 0 is Air.
export const TERRAIN_MATERIALS = ['Air', 'Water', 'Grass', 'Slate', 'Concrete', 'Brick', 'Sand', 'WoodPlanks', 'Rock', 'Glacier', 'Snow', 'Sandstone', 'Mud', 'Basalt', 'Ground', 'CrackedLava', 'Asphalt', 'Cobblestone', 'Ice', 'LeafyGrass', 'Salt', 'Limestone', 'Pavement'];
export const MATERIAL_INDEX = Object.fromEntries(TERRAIN_MATERIALS.map((m, i) => [m, i]));
const WATER = 1; // TERRAIN_MATERIALS' index of Water
const NONE = [];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// A ray against a triangle (Moller-Trumbore): { t, normal (the vertex normals blended) } or null.
function rayTri(o, d, tri) {
  const [A, B, C] = tri.p, e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = dot3(e1, pv);
  if (Math.abs(det) < 1e-12) return null;
  const tv = [o[0] - A[0], o[1] - A[1], o[2] - A[2]], u = dot3(tv, pv) / det;
  if (u < 0 || u > 1) return null;
  const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = dot3(d, qv) / det;
  if (v < 0 || u + v > 1) return null;
  const t = dot3(e2, qv) / det, w = 1 - u - v, n = [0, 1, 2].map(a => tri.n[0][a] * w + tri.n[1][a] * u + tri.n[2][a] * v), l = Math.hypot(...n) || 1;
  return { t, normal: n.map(x => x / l) };
}
// Default colours (Terrain:GetMaterialColor), sRGB 0-255. UNSURE: by eye from
// Roblox's default terrain, not read from the engine.
export const MATERIAL_COLORS = {
  Water: [12, 84, 92], Grass: [106, 127, 63], Slate: [63, 127, 107], Concrete: [127, 102, 63], Brick: [138, 86, 62], Sand: [143, 126, 95],
  WoodPlanks: [139, 109, 79], Rock: [102, 108, 111], Glacier: [101, 176, 234], Snow: [195, 199, 218], Sandstone: [137, 90, 71], Mud: [58, 46, 36],
  Basalt: [30, 30, 37], Ground: [102, 92, 59], CrackedLava: [232, 156, 74], Asphalt: [115, 123, 107], Cobblestone: [132, 123, 90], Ice: [129, 194, 224],
  LeafyGrass: [115, 132, 74], Salt: [198, 189, 181], Limestone: [206, 173, 148], Pavement: [148, 148, 140],
};

const key = (cx, cy, cz) => cx + ',' + cy + ',' + cz;
const fdiv = (a, b) => Math.floor(a / b);

export class Voxels {
  constructor() {
    this.chunks = new Map(); // "cx,cy,cz" -> { occ: Uint8Array, mat: Uint8Array }
    this.dirty = new Set();  // chunk keys changed since the last take()
    this.version = 0;        // bumped on every change
    this.rayMeshed = new Set(); this.rayCells = new Map(); this.rayOwned = new Map(); // rays' triangles (raycast)
    this.colors = Object.fromEntries(Object.entries(MATERIAL_COLORS).map(([k, v]) => [k, v.slice()]));
  }
  chunk(cx, cy, cz, make = false) {
    const k = key(cx, cy, cz);
    let c = this.chunks.get(k);
    if (!c && make) { c = { occ: new Uint8Array(CHUNK_CELLS), mat: new Uint8Array(CHUNK_CELLS) }; this.chunks.set(k, c); }
    return c;
  }
  /** Occupancy (0..1) and material index of cell (x, y, z). */
  get(x, y, z) {
    const c = this.chunk(fdiv(x, CHUNK), fdiv(y, CHUNK), fdiv(z, CHUNK));
    if (!c) return { occ: 0, mat: 0 };
    const i = idx(x, y, z);
    return { occ: c.occ[i] / 255, mat: c.mat[i] };
  }
  /** The terrain's box [[min], [max]] (world studs, cell-aligned), or null when it's empty. */
  bounds() {
    if (this.boundsKey === this.version) return this.boundsBox;
    let lo = null, hi = null;
    for (const [k, c] of this.chunks) { if (!c.occ.some(Boolean)) continue; const p = k.split(',').map(Number); lo = lo ? lo.map((v, d) => Math.min(v, p[d])) : p.slice(); hi = hi ? hi.map((v, d) => Math.max(v, p[d])) : p.slice(); }
    this.boundsKey = this.version;
    return (this.boundsBox = lo && [lo.map(v => v * CHUNK * CELL - CELL), hi.map(v => (v + 1) * CHUNK * CELL + CELL)]);
  }
  /** A ray against the terrain's surface as drawn: the mesher's own triangles (terrain/mesher.js), so a hit is where the
   *  surface shows and where physics collides. { t, normal (the mesh's, blended across the triangle), material } or
   *  null. Water counts unless ignoreWater (or the ray starts in it: OURS); a ray starting inside solid terrain has
   *  no hit there (as from inside a part). Chunks are meshed on demand and their triangles bucketed by 4-stud cell
   *  (kept until the chunk changes); the ray steps cell by cell through the terrain's box. */
  raycast(o, d, len, ignoreWater = false) {
    const B = this.bounds();
    if (!B) return null;
    let t0 = 0, t1 = len;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) { if (o[a] < B[0][a] || o[a] > B[1][a]) return null; continue; }
      let ta = (B[0][a] - o[a]) / d[a], tb = (B[1][a] - o[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    const water = !ignoreWater && this.waterAt(o[0], o[1], o[2]) < 0.5;
    // Cell stepping (Amanatides & Woo) from the clipped start.
    const p0 = [0, 1, 2].map(a => o[a] + d[a] * t0), c = p0.map(v => Math.floor(v / CELL)), step = d.map(v => (v > 0 ? 1 : v < 0 ? -1 : 0));
    const tNext = [0, 1, 2].map(a => step[a] ? t0 + ((c[a] + (step[a] > 0 ? 1 : 0)) * CELL - p0[a]) / d[a] : Infinity);
    const tDelta = [0, 1, 2].map(a => (step[a] ? CELL / Math.abs(d[a]) : Infinity));
    const tested = new Set();
    let best = null, t = t0;
    for (let guard = 0; guard < 100000 && t <= t1; guard++) {
      const tris = this.rayCellTris(c[0], c[1], c[2]);
      for (const tri of tris) {
        if (tested.has(tri) || (tri.water && !water)) continue;
        tested.add(tri);
        const h = rayTri(o, d, tri);
        if (h && h.t >= 1e-6 && h.t <= len && (!best || h.t < best.t)) best = { ...h, tri };
      }
      const exit = Math.min(tNext[0], tNext[1], tNext[2]);
      if (best && best.t <= exit) break; // nothing in a later cell is nearer
      const a = tNext[0] <= tNext[1] && tNext[0] <= tNext[2] ? 0 : tNext[1] <= tNext[2] ? 1 : 2;
      c[a] += step[a]; t = tNext[a]; tNext[a] += tDelta[a];
    }
    if (!best) return null;
    // A ray from inside solid terrain: no hit on its way out (the triangle faces away from it).
    if (!best.tri.water && dot3(best.normal, d) > 0) return null;
    return { t: best.t, normal: best.normal, material: best.tri.water ? 'Water' : TERRAIN_MATERIALS[best.tri.mat] };
  }
  // The triangles near a cell (every chunk whose mesh can reach it meshed first).
  rayCellTris(i, j, k) {
    const ci = fdiv(i, CHUNK), cj = fdiv(j, CHUNK), ck = fdiv(k, CHUNK);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
      const x = ci + a, y = cj + b, z = ck + e;
      // (Only chunks whose margin covers the cell.)
      if (fdiv(i - 1, CHUNK) > x || fdiv(i + 1, CHUNK) < x || fdiv(j - 1, CHUNK) > y || fdiv(j + 1, CHUNK) < y || fdiv(k - 1, CHUNK) > z || fdiv(k + 1, CHUNK) < z) continue;
      this.rayChunk(x, y, z);
    }
    return this.rayCells.get(key(i, j, k)) || NONE;
  }
  // A chunk's triangles for rays, bucketed into the cells (with a cell's margin) their boxes cover.
  rayChunk(cx, cy, cz) {
    const kk = key(cx, cy, cz);
    if (this.rayMeshed.has(kk)) return;
    this.rayMeshed.add(kk);
    let near = false;
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) for (let e = -1; e <= 1 && !near; e++) if (this.chunks.has(key(cx + a, cy + b, cz + e))) near = true;
    if (!near) return;
    const m = Voxels.meshChunk(this, cx, cy, cz), cells = []; // (terrain/mesher.js registers it: the two would import each other)
    for (const [isWater, g] of [[false, m.solid], [true, m.water]]) {
      if (!g) continue;
      const P = g.positions, N = g.normals, I = g.indices;
      for (let n = 0; n < I.length; n += 3) {
        const v = [I[n], I[n + 1], I[n + 2]], tri = { p: v.map(q => [P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]), n: v.map(q => [N[q * 3], N[q * 3 + 1], N[q * 3 + 2]]), mat: g.materials[v[0]], water: isWater };
        const lo = [0, 1, 2].map(a => Math.floor(Math.min(tri.p[0][a], tri.p[1][a], tri.p[2][a]) / CELL)), hi = [0, 1, 2].map(a => Math.floor(Math.max(tri.p[0][a], tri.p[1][a], tri.p[2][a]) / CELL));
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
          const ck = key(x, y, z);
          let list = this.rayCells.get(ck); if (!list) this.rayCells.set(ck, list = []);
          list.push(tri); cells.push([ck, tri]);
        }
      }
    }
    this.rayOwned.set(kk, cells);
  }
  // A chunk changed: its triangles (and its neighbours', which mesh across the border) are dropped.
  rayForget(kk) {
    if (!this.rayMeshed.delete(kk)) return;
    for (const [ck, tri] of this.rayOwned.get(kk) || []) { const l = this.rayCells.get(ck); if (l) { const i = l.indexOf(tri); if (i >= 0) l.splice(i, 1); if (!l.length) this.rayCells.delete(ck); } }
    this.rayOwned.delete(kk);
  }
  /** How much water a world point is in (0..1): water's occupancy at the cells' centres, blended between them (so
   *  0.5 is the surface the mesher draws). */
  waterAt(px, py, pz) {
    const u = px / CELL - 0.5, v = py / CELL - 0.5, w = pz / CELL - 0.5, i = Math.floor(u), j = Math.floor(v), k = Math.floor(w), fu = u - i, fv = v - j, fw = w - k;
    let sum = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
      const g = this.get(i + a, j + b, k + c), wt = (a ? fu : 1 - fu) * (b ? fv : 1 - fv) * (c ? fw : 1 - fw);
      if (g.mat === WATER) sum += g.occ * wt;
    }
    return sum;
  }
  occ(x, y, z) { const c = this.chunk(fdiv(x, CHUNK), fdiv(y, CHUNK), fdiv(z, CHUNK)); return c ? c.occ[idx(x, y, z)] / 255 : 0; }
  set(x, y, z, occ, mat) {
    const cx = fdiv(x, CHUNK), cy = fdiv(y, CHUNK), cz = fdiv(z, CHUNK);
    const o = Math.round(Math.min(1, Math.max(0, occ)) * 255), m = o === 0 ? 0 : mat;
    let c = this.chunk(cx, cy, cz, o > 0);
    if (!c) return;
    const i = idx(x, y, z);
    if (c.occ[i] === o && c.mat[i] === m) return;
    c.occ[i] = o; c.mat[i] = m; this.version++;
    // A cell's change shows in its own chunk and in neighbours whose meshes sample it.
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK, lz = z - cz * CHUNK;
    for (let dx = lx === 0 ? -1 : 0; dx <= (lx === CHUNK - 1 ? 1 : 0); dx++)
      for (let dy = ly === 0 ? -1 : 0; dy <= (ly === CHUNK - 1 ? 1 : 0); dy++)
        for (let dz = lz === 0 ? -1 : 0; dz <= (lz === CHUNK - 1 ? 1 : 0); dz++) { this.dirty.add(key(cx + dx, cy + dy, cz + dz)); this.rayForget(key(cx + dx, cy + dy, cz + dz)); }
  }
  /** The chunk keys changed since last asked, as [cx, cy, cz]. */
  take() { const out = [...this.dirty].map(k => k.split(',').map(Number)); this.dirty.clear(); return out; }

  /**
   * Fill a shape: `sdf(x, y, z)` is its signed distance in studs (negative
   * inside); `min`/`max` bound it (world). Material name, or 'Air' to carve.
   */
  fill(sdf, min, max, material) {
    const m = MATERIAL_INDEX[material];
    if (m === undefined) throw new Error(`Material ${material} is not a terrain material`);
    const lo = [0, 1, 2].map(a => Math.floor(min[a] / CELL) - 1), hi = [0, 1, 2].map(a => Math.floor(max[a] / CELL) + 1);
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const d = sdf((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL);
      const o = Math.min(1, Math.max(0, 0.5 - d / CELL));
      if (o <= 0) continue;
      const cur = this.get(x, y, z);
      if (m === 0) { const left = Math.min(cur.occ, 1 - o); if (left < cur.occ) this.set(x, y, z, left, cur.mat); continue; }
      // The shape's material where it covers the centre; elsewhere only more occupancy.
      const mat = d <= 0 || cur.occ === 0 ? m : cur.mat;
      const occ = Math.max(cur.occ, o);
      if (occ !== cur.occ || mat !== cur.mat) this.set(x, y, z, occ, mat);
    }
  }
  clear() { for (const k of this.chunks.keys()) this.dirty.add(k); this.chunks.clear(); this.version++; this.rayMeshed.clear(); this.rayCells.clear(); this.rayOwned.clear(); }
  /** The world box [[min], [max]] holding every water cell (and a cell's reach beyond), or null when there's none. */
  waterBounds() {
    let lo = null, hi = null;
    for (const [k, c] of this.chunks) {
      if (!c.mat.includes(WATER)) continue;
      const [cx, cy, cz] = k.split(',').map(Number);
      for (let i = 0; i < CHUNK_CELLS; i++) {
        if (c.mat[i] !== WATER || !c.occ[i]) continue;
        const x = cx * CHUNK + (i % CHUNK), y = cy * CHUNK + (Math.floor(i / CHUNK) % CHUNK), z = cz * CHUNK + Math.floor(i / (CHUNK * CHUNK));
        const p = [x, y, z]; lo = lo ? lo.map((v, d) => Math.min(v, p[d])) : p.slice(); hi = hi ? hi.map((v, d) => Math.max(v, p[d])) : p.slice();
      }
    }
    return lo && [lo.map(v => (v - 1) * CELL), hi.map(v => (v + 2) * CELL)];
  }
  /** Cells with any occupancy. */
  count() { let n = 0; for (const c of this.chunks.values()) for (const o of c.occ) if (o) n++; return n; }

  // ---- saving: per chunk, run-length (count, occ, mat) triples, base64
  save() {
    const out = [];
    for (const [k, c] of this.chunks) {
      const runs = [];
      for (let i = 0; i < CHUNK_CELLS;) {
        let j = i + 1;
        while (j < CHUNK_CELLS && j - i < 65535 && c.occ[j] === c.occ[i] && c.mat[j] === c.mat[i]) j++;
        runs.push(j - i, c.occ[i], c.mat[i]); i = j;
      }
      if (runs.length === 3 && runs[1] === 0) continue; // empty
      const bytes = new Uint8Array(runs.length / 3 * 4);
      for (let r = 0, b = 0; r < runs.length; r += 3, b += 4) { bytes[b] = runs[r] & 255; bytes[b + 1] = runs[r] >> 8; bytes[b + 2] = runs[r + 1]; bytes[b + 3] = runs[r + 2]; }
      out.push([k, b64(bytes)]);
    }
    return { cell: CELL, chunk: CHUNK, materials: TERRAIN_MATERIALS, chunks: out };
  }
  load(data) {
    this.clear();
    const names = data.materials || TERRAIN_MATERIALS;
    for (const [k, s] of data.chunks || []) {
      const bytes = unb64(s), c = { occ: new Uint8Array(CHUNK_CELLS), mat: new Uint8Array(CHUNK_CELLS) };
      for (let b = 0, i = 0; b < bytes.length; b += 4) {
        const n = bytes[b] | bytes[b + 1] << 8, m = MATERIAL_INDEX[names[bytes[b + 3]]] ?? 0;
        c.occ.fill(bytes[b + 2], i, i + n); c.mat.fill(m, i, i + n); i += n;
      }
      this.chunks.set(k, c); this.dirty.add(k);
    }
  }
}
const idx = (x, y, z) => { const l = v => ((v % CHUNK) + CHUNK) % CHUNK; return l(x) + CHUNK * (l(y) + CHUNK * l(z)); };

const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// ---- the Fill* shapes' signed distances (studs), world space
// A CFrame's rotation rows (m[3..11]) take world offsets into its own axes by transposition.
const local = (m, x, y, z) => { const dx = x - m[0], dy = y - m[1], dz = z - m[2]; return [m[3] * dx + m[6] * dy + m[9] * dz, m[4] * dx + m[7] * dy + m[10] * dz, m[5] * dx + m[8] * dy + m[11] * dz]; };
const boxSdf = (p, h) => { const q = p.map((v, i) => Math.abs(v) - h[i]), out = Math.hypot(...q.map(v => Math.max(v, 0))); return out + Math.min(Math.max(q[0], q[1], q[2]), 0); };
/** Bounds of a CFrame'd box (world): { min, max }. */
export function boxBounds(m, size) {
  const h = [size.x / 2, size.y / 2, size.z / 2], min = [m[0], m[1], m[2]], max = [m[0], m[1], m[2]];
  for (let r = 0; r < 3; r++) { const e = Math.abs(m[3 + r * 3]) * h[0] + Math.abs(m[4 + r * 3]) * h[1] + Math.abs(m[5 + r * 3]) * h[2]; min[r] -= e; max[r] += e; }
  return { min, max };
}
export const shapes = {
  block(m, size) { const h = [size.x / 2, size.y / 2, size.z / 2]; return (x, y, z) => boxSdf(local(m, x, y, z), h); },
  ball(c, r) { return (x, y, z) => Math.hypot(x - c.x, y - c.y, z - c.z) - r; },
  // A cylinder along the CFrame's Y axis (as Roblox's FillCylinder).
  cylinder(m, height, r) { return (x, y, z) => { const p = local(m, x, y, z), dr = Math.hypot(p[0], p[2]) - r, dy = Math.abs(p[1]) - height / 2; return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)); }; },
  // A wedge as a WedgePart is: full at the back (+Z) and bottom, sloping up toward the back.
  wedge(m, size) {
    const h = [size.x / 2, size.y / 2, size.z / 2], len = Math.hypot(size.y, size.z), n = [0, size.z / len, -size.y / len];
    return (x, y, z) => { const p = local(m, x, y, z); return Math.max(boxSdf(p, h), p[1] * n[1] + p[2] * n[2]); };
  },
};
