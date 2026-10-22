// UVs for a mesh that has none (the modelling kernel's primitives carry no UVs):
// Blender's Cube Projection, per triangle. Each triangle goes along its normal's
// dominant axis (+X, -X, +Y, -Y, +Z, -Z) into one cell of a 3x2 atlas, laid out
// by its position across the mesh's bounds (one scale for every axis, so nothing
// is stretched). Triangles of the same side at different depths share texels
// (a torus's inside and outside): fine for painting a primitive; a real unwrap
// (xatlas, INCORPORATE.md) is the way past that.
// Takes the renderer's flat arrays: one vertex per triangle corner.
const GUTTER = 0.02; // of a cell, kept clear on each edge so filtering doesn't bleed between cells

export function cubeProjectUVs(positions, normals) {
  const n = positions.length / 3, uvs = new Float32Array(n * 2);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = positions[i * 3 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  // For each side: the two axes across it, and its cell in the atlas.
  const SIDE = [[2, 1, 0, 0], [2, 1, 1, 0], [0, 2, 2, 0], [0, 2, 0, 1], [0, 1, 1, 1], [0, 1, 2, 1]]; // +X -X +Y -Y +Z -Z: [u axis, v axis, cell col, cell row]
  for (let t = 0; t < n; t += 3) {
    let nx = 0, ny = 0, nz = 0; // the triangle's normal (the corners' average)
    for (let c = 0; c < 3; c++) { nx += normals[(t + c) * 3]; ny += normals[(t + c) * 3 + 1]; nz += normals[(t + c) * 3 + 2]; }
    const a = [Math.abs(nx), Math.abs(ny), Math.abs(nz)], axis = a.indexOf(Math.max(...a)), side = axis * 2 + ([nx, ny, nz][axis] < 0 ? 1 : 0);
    const [ua, va, col, row] = SIDE[side];
    for (let c = 0; c < 3; c++) {
      const i = t + c, p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      const s = (p[ua] - lo[ua]) / span, r = (p[va] - lo[va]) / span;
      uvs[i * 2] = (col + GUTTER + s * (1 - 2 * GUTTER)) / 3;
      uvs[i * 2 + 1] = (row + GUTTER + r * (1 - 2 * GUTTER)) / 2;
    }
  }
  return uvs;
}
