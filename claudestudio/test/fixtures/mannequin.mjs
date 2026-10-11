// A mannequin of known boxes for the stage-2 rigger's tests.
// Boxes [x0,y0,z0,x1,y1,z1], already rig height (2.7) with feet at 0, so the
// fit's scale is 1. Gaps between the legs and between arms and body, a narrow
// neck, feet sticking forward (a hip must sit over the thigh, not the toes).
export const BOX = {
  'leg-right': [-0.30, 0, -0.12, -0.05, 1.3, 0.12], 'leg-left': [0.05, 0, -0.12, 0.30, 1.3, 0.12],
  'foot-right': [-0.30, 0, 0.12, -0.05, 0.12, 0.32], 'foot-left': [0.05, 0, 0.12, 0.30, 0.12, 0.32],
  torso: [-0.32, 1.3, -0.15, 0.32, 2.1, 0.15], neck: [-0.08, 2.1, -0.06, 0.08, 2.16, 0.06],
  'arm-right': [-0.52, 1.25, -0.08, -0.36, 2.05, 0.08], 'arm-left': [0.36, 1.25, -0.08, 0.52, 2.05, 0.08],
  head: [-0.2, 2.16, -0.2, 0.2, 2.7, 0.2],
};
export function boxMesh(boxes) {
  const P = [], I = [], C = [], tag = [];
  for (const [name, [x0, y0, z0, x1, y1, z1]] of Object.entries(boxes)) {
    // Subdivided faces (8x8 per side) so a joint's slab always has vertices.
    const base = P.length / 3, N = 8, faces = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (const [a, b, c] of faces) for (const side of [0, 1]) {
      const start = P.length / 3;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const p = [0, 0, 0]; p[a] = side ? hi[a] : lo[a]; p[b] = lo[b] + (hi[b] - lo[b]) * i / N; p[c] = lo[c] + (hi[c] - lo[c]) * j / N;
        P.push(...p); C.push(0.5, 0.5, 0.5); tag.push(name);
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const q = start + i * (N + 1) + j, quad = [q, q + N + 1, q + N + 2, q + 1];
        // outward winding: flip on the low side
        const t = side ? [[0, 1, 2], [0, 2, 3]] : [[0, 2, 1], [0, 3, 2]];
        for (const tri of t) I.push(...tri.map(k => quad[k]));
      }
    }
    void base;
  }
  return { positions: Float64Array.from(P), indices: Uint32Array.from(I), colors: Float64Array.from(C), tag };
}
