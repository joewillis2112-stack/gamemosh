// Part shapes for overlap tests (Touched, the dead body's clearance), matching
// what's drawn and collided: boxes, balls, cylinders (axis along the part's X,
// as in Roblox) and wedges (a box cut by the slope from the bottom-front edge
// to the top-back edge). Shapes are cached per part and refreshed when the
// part moves; the tests are scalar math with no allocation per call.

// A part's shape in world space. `q` is the mesh's rotation quaternion.
export function partShape(inst, q, out = {}) {
  const P = inst.props, s = P.Size;
  out.kind = inst.ClassName === 'WedgePart' || P.Shape === 'Wedge' ? 'wedge' : P.Shape === 'Ball' ? 'ball' : P.Shape === 'Cylinder' ? 'cyl' : 'box';
  out.cx = P.Position.x; out.cy = P.Position.y; out.cz = P.Position.z;
  out.hx = s.x / 2; out.hy = s.y / 2; out.hz = s.z / 2;
  if (out.kind === 'ball') out.hx = out.hy = out.hz = Math.min(s.x, s.y, s.z) / 2;
  // Local axes in world space: the columns of the rotation matrix.
  const x = q ? q.x : 0, y = q ? q.y : 0, z = q ? q.z : 0, w = q ? q.w : 1;
  out.ax = 1 - 2 * (y * y + z * z); out.ay = 2 * (x * y + w * z); out.az = 2 * (x * z - w * y);
  out.bx = 2 * (x * y - w * z); out.by = 1 - 2 * (x * x + z * z); out.bz = 2 * (y * z + w * x);
  out.kx = 2 * (x * z + w * y); out.ky = 2 * (y * z - w * x); out.kz = 1 - 2 * (x * x + y * y);
  out.radius = Math.hypot(out.hx, out.hy, out.hz); // broad phase
  if (out.kind === 'wedge') {
    // Slope plane through (0, -hy, -hz) with outward normal (0, hz, -hy)/len (up and to the front).
    const len = Math.hypot(out.hy, out.hz) || 1;
    out.ny = out.hz / len; out.nz = -out.hy / len;
  }
  return out;
}

// Does the sphere (px, py, pz, r) overlap the shape?
export function sphereHits(px, py, pz, r, S) {
  const dx = px - S.cx, dy = py - S.cy, dz = pz - S.cz;
  if (dx * dx + dy * dy + dz * dz > (S.radius + r) * (S.radius + r)) return false;
  // Into the part's local frame.
  const lx = dx * S.ax + dy * S.ay + dz * S.az, ly = dx * S.bx + dy * S.by + dz * S.bz, lz = dx * S.kx + dy * S.ky + dz * S.kz;
  if (S.kind === 'ball') return lx * lx + ly * ly + lz * lz <= (S.hx + r) * (S.hx + r);
  if (S.kind === 'cyl') {
    const rad = Math.min(S.hy, S.hz), radial = Math.max(0, Math.hypot(ly, lz) - rad), axial = Math.max(0, Math.abs(lx) - S.hx);
    return radial * radial + axial * axial <= r * r;
  }
  const ex = Math.max(0, Math.abs(lx) - S.hx), ey = Math.max(0, Math.abs(ly) - S.hy), ez = Math.max(0, Math.abs(lz) - S.hz);
  if (ex * ex + ey * ey + ez * ez > r * r) return false;
  if (S.kind === 'wedge') return S.ny * (ly + S.hy) + S.nz * (lz + S.hz) <= r; // not beyond the slope
  return true;
}

// Does the capsule from (ax, ay, az) to (bx, by, bz) with radius r overlap the
// shape? Spheres along the segment, no more than r/2 apart.
export function capsuleHits(ax, ay, az, bx, by, bz, r, S) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(1, Math.ceil(len / (r * 0.5)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (sphereHits(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, r, S)) return true;
  }
  return false;
}
