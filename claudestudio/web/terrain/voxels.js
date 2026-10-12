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
  occ(x, y, z) { const c = this.chunk(fdiv(x, CHUNK), fdiv(y, CHUNK), fdiv(z, CHUNK)); return c ? c.occ[idx(x, y, z)] / 255 : 0; }
  set(x, y, z, occ, mat) {
    const cx = fdiv(x, CHUNK), cy = fdiv(y, CHUNK), cz = fdiv(z, CHUNK);
    const o = Math.round(Math.min(1, Math.max(0, occ)) * 255), m = o === 0 ? 0 : mat;
    let c = this.chunk(cx, cy, cz, o > 0);
    if (!c) return;
    const i = idx(x, y, z);
    if (c.occ[i] === o && c.mat[i] === m) return;
    c.occ[i] = o; c.mat[i] = m;
    // A cell's change shows in its own chunk and in neighbours whose meshes sample it.
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK, lz = z - cz * CHUNK;
    for (let dx = lx === 0 ? -1 : 0; dx <= (lx === CHUNK - 1 ? 1 : 0); dx++)
      for (let dy = ly === 0 ? -1 : 0; dy <= (ly === CHUNK - 1 ? 1 : 0); dy++)
        for (let dz = lz === 0 ? -1 : 0; dz <= (lz === CHUNK - 1 ? 1 : 0); dz++) this.dirty.add(key(cx + dx, cy + dy, cz + dz));
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
  clear() { for (const k of this.chunks.keys()) this.dirty.add(k); this.chunks.clear(); }
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
