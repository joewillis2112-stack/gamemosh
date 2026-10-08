// Generated meshes, checked in code (the asset gate's "normals face out"):
// every face's normal points away from the solid's centre, and the winding
// matches Babylon's own CreateBox. A wedge wound the other way rendered
// inside-out and passed my eye in small shots.
export default async function (t) {
  const r = await t.eval(() => {
    const S = window.studio, out = {};
    const check = mesh => {
      const pos = mesh.getVerticesData('position'), nrm = mesh.getVerticesData('normal'), idx = mesh.getIndices();
      let cx = 0, cy = 0, cz = 0; const n = pos.length / 3;
      for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; }
      cx /= n; cy /= n; cz /= n;
      let inwardNormals = 0, windingInto = 0, tris = idx.length / 3;
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
        const P = k => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
        const A = P(a), B = P(b), C = P(c);
        const fc = [(A[0] + B[0] + C[0]) / 3 - cx, (A[1] + B[1] + C[1]) / 3 - cy, (A[2] + B[2] + C[2]) / 3 - cz];
        const N = [nrm[a * 3], nrm[a * 3 + 1], nrm[a * 3 + 2]];
        if (N[0] * fc[0] + N[1] * fc[1] + N[2] * fc[2] < 0) inwardNormals++;
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (Math.hypot(...w) < 1e-9) { tris--; continue; } // zero-area (a sphere's poles): no facing to check
        if (w[0] * fc[0] + w[1] * fc[1] + w[2] * fc[2] < 0) windingInto++;
      }
      return { tris, inwardNormals, windingInto };
    };
    for (const [inst, e] of S.world.parts) if (['Block', 'Wedge', 'PartWedge', 'Ball', 'Cylinder'].includes(inst.Name)) out[inst.Name] = check(e.mesh);
    return out;
  });
  // Babylon's box: every triangle wound "into" the solid, no normal pointing in.
  let ok = true;
  for (const [name, c] of Object.entries(r)) {
    const good = c.inwardNormals === 0 && c.windingInto === c.tris;
    if (!good) ok = false;
    console.log(name.padEnd(10), JSON.stringify(c), good ? 'ok' : 'WRONG');
  }
  if (!ok) throw new Error('generated mesh fails the normals check');
}
