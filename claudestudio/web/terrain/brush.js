// The Terrain Editor's brushes (Roblox Studio's Add, Subtract, Paint, Smooth,
// Flatten), as one dab of a spherical brush on terrain/voxels.js. Each dab
// returns the cells it changed with their before and after, so a whole stroke
// can be undone and redone exactly (web/editor/terrain.js).
// Ours where Studio documents nothing: strength (0..1) is the share of the way
// a dab moves each cell toward the brush's target; the edge falls off over the
// last cell of the radius, so strokes don't leave steps.
import { CELL, MATERIAL_INDEX } from './voxels.js';

export const BRUSHES = ['add', 'subtract', 'paint', 'smooth', 'flatten'];

/**
 * One dab. `at` is the brush centre (world studs), `radius` in studs.
 * opts: { strength = 1, material = 'Grass', planeY = at.y (flatten) }.
 * Returns [{ x, y, z, before: [occ, mat], after: [occ, mat] }] (occupancy 0..1).
 */
export function dab(vox, kind, at, radius, { strength = 1, material = 'Grass', planeY = at.y } = {}) {
  if (!BRUSHES.includes(kind)) throw new Error('no brush ' + kind);
  const m = MATERIAL_INDEX[material];
  if (m === undefined || m === 0) throw new Error(`${material} is not a terrain material to paint with`);
  const lo = [at.x, at.y, at.z].map(v => Math.floor((v - radius) / CELL) - 1), hi = [at.x, at.y, at.z].map(v => Math.floor((v + radius) / CELL) + 1);
  const plan = [];
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL, cz = (z + 0.5) * CELL;
    const d = Math.hypot(cx - at.x, cy - at.y, cz - at.z) - radius; // the sphere's signed distance
    const inside = Math.min(1, Math.max(0, 0.5 - d / CELL));        // the sphere's own occupancy of the cell
    if (inside <= 0) continue;
    const cur = vox.get(x, y, z), k = strength * inside;
    let occ = cur.occ, mat = cur.mat;
    if (kind === 'add') { const want = Math.max(cur.occ, inside); occ = cur.occ + (want - cur.occ) * strength; if (cur.occ === 0 || d <= 0) mat = cur.occ === 0 ? m : mat; }
    else if (kind === 'subtract') { const want = Math.min(cur.occ, 1 - inside); occ = cur.occ + (want - cur.occ) * strength; }
    else if (kind === 'paint') { if (cur.occ > 0 && d <= 0) mat = m; }
    else if (kind === 'smooth') {
      let s = 0, n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { s += vox.occ(x + a, y + b, z + c); n++; }
      occ = cur.occ + (s / n - cur.occ) * k;
      if (cur.occ === 0 && occ > 0) mat = neighbourMaterial(vox, x, y, z) || m;
    } else if (kind === 'flatten') {
      const want = Math.min(1, Math.max(0, 0.5 - (cy - planeY) / CELL)); // a floor at planeY: full below, empty above
      occ = cur.occ + (want - cur.occ) * k;
      if (cur.occ === 0 && occ > 0) mat = neighbourMaterial(vox, x, y, z) || m;
    }
    plan.push({ x, y, z, before: [cur.occ, cur.mat], occ, mat });
  }
  // Apply after reading everything (smooth reads neighbours), then report what really changed (8-bit occupancy).
  const out = [];
  for (const p of plan) {
    vox.set(p.x, p.y, p.z, p.occ, p.mat);
    const now = vox.get(p.x, p.y, p.z);
    if (now.occ !== p.before[0] || now.mat !== p.before[1]) out.push({ x: p.x, y: p.y, z: p.z, before: p.before, after: [now.occ, now.mat] });
  }
  return out;
}

// The most occupied neighbour's material (smoothing and flattening grow ground of its own kind).
function neighbourMaterial(vox, x, y, z) {
  let best = 0, mat = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const g = vox.get(x + a, y + b, z + c); if (g.occ > best && g.mat) { best = g.occ; mat = g.mat; } }
  return mat;
}

/** Put cells back to one side of a list of changes ('before' or 'after'). */
export function restore(vox, changes, side) {
  const list = side === 'before' ? [...changes].reverse() : changes;
  for (const c of list) vox.set(c.x, c.y, c.z, c[side][0], c[side][1]);
}
