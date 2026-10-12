// Terrain chunks to triangles: SculptGL's SurfaceNets (MIT, vendored as is)
// over each chunk's occupancy, sampled at cell centres, surface at 0.5.
// - Chunks join without seams or doubled faces: a chunk samples one cell past
//   each side and keeps only the faces it owns (those around a sample-grid
//   edge whose base sample is its own), so neighbours share border vertices
//   exactly and each face is made once.
// - Normals come from the field's gradient in each vertex's cube, so they
//   agree across chunk borders. Colours blend the material colours of the
//   solid corners, weighted by occupancy.
// - Water is meshed apart from solid ground (drawn see-through, no collision).
// Engine-free (Node tests run it).
import SurfaceNets from '../vendor/sculptgl/SurfaceNets.js';
import { CELL, CHUNK, TERRAIN_MATERIALS } from './voxels.js';

const N = CHUNK + 2; // samples per axis: cells -1..CHUNK
const M = N + 2; // cells read per axis: -2..CHUNK+1
// The cube's 12 edges as corner pairs (corner c: x = c & 1, y = c >> 1 & 1, z = c >> 2 & 1).
const CUBE_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const NEIGHBOURS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const WATER = TERRAIN_MATERIALS.indexOf('Water');

/** { solid, water }: each { positions, normals, colors, indices, materials } (world studs) or null if empty. */
export function meshChunk(vox, cx, cy, cz) {
  // Read one more cell around than the mesh samples: each sample's field looks at its neighbours,
  // and a sample must get the same value in every chunk that samples it.
  const ox = cx * CHUNK - 2, oy = cy * CHUNK - 2, oz = cz * CHUNK - 2; // cell of read index 0
  const occ = new Float32Array(M * M * M), mat = new Uint8Array(M * M * M);
  let any = false;
  for (let k = 0; k < M; k++) for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const c = vox.get(ox + i, oy + j, oz + k), s = i + M * (j + M * k);
    occ[s] = c.occ; mat[s] = c.mat; if (c.occ > 0) any = true;
  }
  if (!any) return { solid: null, water: null };
  const origin = [ox + 1, oy + 1, oz + 1]; // cell of sample 0
  const solid = net(vox, occ, mat, m => m !== WATER, origin);
  const water = net(vox, occ, mat, m => m === WATER, origin);
  return { solid, water };
}

const ZERO3 = new Float32Array(N * N * N * 3);
function net(vox, occ, mat, keep, origin) {
  // The field SurfaceNets wants: signed distance, negative inside. Occupancy is
  // the share of a cell the shape fills, so a partly filled cell says exactly
  // how far its centre is from the surface: (0.5 - occupancy) * CELL. Full and
  // empty cells only say "at least half a cell"; interpolating to them would
  // pull every crossing inward, so they take their distance one step on from
  // the nearest partly filled neighbour (then a crossing next to a partial
  // cell lands where that cell says). Never exactly 0 (a vertex would land on a sample).
  const big = new Float32Array(M * M * M), part = new Uint8Array(M * M * M);
  let any = false;
  for (let s = 0; s < big.length; s++) {
    const o = keep(mat[s]) ? occ[s] : 0;
    if (o > 0) any = true;
    part[s] = o > 0 && o < 1 ? 1 : 0;
    big[s] = (0.5 - o) * CELL;
  }
  if (!any) return null;
  // The mesh's samples: the read grid less its outer layer, which only serves as neighbours.
  const field = new Float32Array(N * N * N), O = new Float32Array(N * N * N), Mt = new Uint8Array(N * N * N);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const s = (i + 1) + M * ((j + 1) + M * (k + 1)), t = i + N * (j + N * k);
    O[t] = keep(mat[s]) ? occ[s] : 0; Mt[t] = mat[s];
    if (part[s]) { field[t] = big[s]; continue; }
    const inside = big[s] < 0;
    let d = inside ? -2 * CELL : 2 * CELL, found = false;
    for (const [di, dj, dk] of NEIGHBOURS) {
      const n = (i + 1 + di) + M * ((j + 1 + dj) + M * (k + 1 + dk));
      if (!part[n] || (big[n] < 0) !== inside && Math.abs(big[n]) > CELL / 2) continue;
      const e = inside ? big[n] - CELL : big[n] + CELL;
      d = inside ? Math.max(d, e) : Math.min(d, e); found = true;
    }
    field[t] = found ? (inside ? Math.min(d, -CELL / 2) : Math.max(d, CELL / 2)) : (inside ? -CELL : CELL);
  }
  for (let s = 0; s < field.length; s++) if (field[s] === 0) field[s] = 1e-6;
  occ = O; mat = Mt; // from here on, the mesh's samples
  const r = SurfaceNets.computeSurface({ dims: [N, N, N], distanceField: field, colorField: ZERO3, materialField: ZERO3 });
  const V = r.vertices, F = r.faces;
  // Each vertex's cube, in the order SurfaceNets makes them (z, then y, then x; one per cube the surface crosses).
  const cube = [];
  for (let k = 0; k < N - 1; k++) for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) if (field[(i + (c & 1)) + N * ((j + (c >> 1 & 1)) + N * (k + (c >> 2 & 1)))] < 0) mask |= 1 << c;
    if (mask !== 0 && mask !== 0xff) cube.push([i, j, k]);
  }
  if (cube.length !== V.length / 3) throw new Error('terrain mesher: vertex order changed');
  // Keep the faces this chunk owns: around an edge along some axis whose base sample
  // (the largest of the four cubes' corners) is one of its own cells (1..N-2), not the sample past its low side.
  const keepFace = new Uint8Array(F.length / 4);
  for (let f = 0; f < F.length / 4; f++) {
    const cs = [0, 1, 2, 3].map(q => cube[F[f * 4 + q]]);
    const base = [0, 1, 2].map(a => Math.max(...cs.map(c => c[a])));
    const axis = [0, 1, 2].find(a => cs.every(c => c[a] === cs[0][a]));
    keepFace[f] = base[axis] >= 1 && base.every(b => b <= N - 2) ? 1 : 0;
  }
  const used = new Int32Array(V.length / 3).fill(-1), pos = [], nor = [], col = [], mats = [], idx = [];
  const sample = (i, j, k) => field[Math.min(N - 1, i) + N * (Math.min(N - 1, j) + N * Math.min(N - 1, k))];
  const vert = v => {
    if (used[v] >= 0) return used[v];
    // The vertex again in doubles (SurfaceNets' own is float32 at the sample index, which
    // differs per chunk): the mean of the cube's edge crossings, the same arithmetic in every chunk.
    const [i, j, k] = cube[v];
    let sx = 0, sy = 0, sz = 0, ne = 0;
    for (const [a, b] of CUBE_EDGES) {
      const ga = field[(i + (a & 1)) + N * ((j + (a >> 1 & 1)) + N * (k + (a >> 2 & 1)))], gb = field[(i + (b & 1)) + N * ((j + (b >> 1 & 1)) + N * (k + (b >> 2 & 1)))];
      if ((ga < 0) === (gb < 0)) continue;
      const tt = ga / (ga - gb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * tt; sy += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * tt; sz += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1)) * tt; ne++;
    }
    const u = sx / ne, w = sy / ne, t = sz / ne, x = i + u, y = j + w, z = k + t;
    // Gradient of the trilinear field in this cube (points outward: the field rises leaving the solid).
    const g = (a, b, c) => sample(i + a, j + b, k + c);
    const gx = lerp2(g(1, 0, 0) - g(0, 0, 0), g(1, 1, 0) - g(0, 1, 0), g(1, 0, 1) - g(0, 0, 1), g(1, 1, 1) - g(0, 1, 1), w, t);
    const gy = lerp2(g(0, 1, 0) - g(0, 0, 0), g(1, 1, 0) - g(1, 0, 0), g(0, 1, 1) - g(0, 0, 1), g(1, 1, 1) - g(1, 0, 1), u, t);
    const gz = lerp2(g(0, 0, 1) - g(0, 0, 0), g(1, 0, 1) - g(1, 0, 0), g(0, 1, 1) - g(0, 1, 0), g(1, 1, 1) - g(1, 1, 0), u, w);
    const len = Math.hypot(gx, gy, gz) || 1;
    // Colour and material: the cube's solid corners, by occupancy.
    let cr = 0, cg = 0, cb = 0, ws = 0; const tally = new Map();
    for (let c = 0; c < 8; c++) {
      const s = (i + (c & 1)) + N * ((j + (c >> 1 & 1)) + N * (k + (c >> 2 & 1)));
      const o = keep(mat[s]) ? occ[s] : 0;
      if (o <= 0) continue;
      const rgb = vox.colors[TERRAIN_MATERIALS[mat[s]]] || [128, 128, 128];
      cr += rgb[0] * o; cg += rgb[1] * o; cb += rgb[2] * o; ws += o; tally.set(mat[s], (tally.get(mat[s]) || 0) + o);
    }
    ws = ws || 1;
    used[v] = pos.length / 3;
    pos.push((origin[0] + x + 0.5) * CELL, (origin[1] + y + 0.5) * CELL, (origin[2] + z + 0.5) * CELL);
    nor.push(gx / len, gy / len, gz / len);
    col.push(cr / ws / 255, cg / ws / 255, cb / ws / 255, 1);
    mats.push([...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
    return used[v];
  };
  for (let f = 0; f < F.length / 4; f++) {
    if (!keepFace[f]) continue;
    const q = [0, 1, 2, 3].map(n => vert(F[f * 4 + n]));
    // Two triangles, wound so (b-a)x(c-a) points against the outward normal: Babylon's front faces (RESEARCH.md §4e).
    tri(idx, pos, nor, q[0], q[1], q[2]); tri(idx, pos, nor, q[0], q[2], q[3]);
  }
  if (!idx.length) return null;
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), indices: new Uint32Array(idx), materials: new Uint8Array(mats) };
}
const lerp2 = (a, b, c, d, s, t) => (a * (1 - s) + b * s) * (1 - t) + (c * (1 - s) + d * s) * t;
function tri(idx, P, Nn, a, b, c) {
  const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
  const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const out = (Nn[a * 3] + Nn[b * 3] + Nn[c * 3]) * nx + (Nn[a * 3 + 1] + Nn[b * 3 + 1] + Nn[c * 3 + 1]) * ny + (Nn[a * 3 + 2] + Nn[b * 3 + 2] + Nn[c * 3 + 2]) * nz;
  if (out < 0) idx.push(a, b, c); else idx.push(a, c, b);
}
