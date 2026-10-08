// CFrame on the engine side: 12 numbers like Roblox's (x, y, z, then the
// rotation's rows R00..R22; columns are RightVector, UpVector, -LookVector).
// Scripts get the full CFrame API from the binding (luau/cframe.h); the engine
// needs only conversions: Orientation (degrees, Y then X then Z), quaternions
// for the renderer, and composition for moving models.
const DEG = Math.PI / 180;
const f32 = Math.fround;

export class CF {
  constructor(m = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]) { this.m = m.map(f32); }
  get x() { return this.m[0]; } get y() { return this.m[1]; } get z() { return this.m[2]; }
  equals(o) { return o instanceof CF && this.m.every((v, i) => v === o.m[i]); }
  withPosition(x, y, z) {
    const m = this.m.slice(); m[0] = x; m[1] = y; m[2] = z;
    const cf = new CF(m);
    if (this.raw) { cf.raw = this.raw.slice(); cf.raw[0] = x; cf.raw[1] = y; cf.raw[2] = z; }
    return cf;
  }

  // Rotation from Orientation degrees: Ry(y) * Rx(x) * Rz(z), as Roblox's fromOrientation.
  static fromOrientation(px, py, pz, xd, yd, zd) {
    const [cx, sx] = [Math.cos(xd * DEG), Math.sin(xd * DEG)], [cy, sy] = [Math.cos(yd * DEG), Math.sin(yd * DEG)], [cz, sz] = [Math.cos(zd * DEG), Math.sin(zd * DEG)];
    const raw = [px, py, pz,
      cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
      cx * sz, cx * cz, -sx,
      -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx];
    const cf = new CF(raw);
    cf.raw = raw; // so toOrientation gives back the angles set, not float noise around them
    return cf;
  }
  // Orientation in degrees (Roblox's ToOrientation, which inverts fromOrientation).
  toOrientation() {
    const r = this.raw || this.m, R = (i, j) => r[3 + i * 3 + j];
    const x = Math.asin(Math.max(-1, Math.min(1, -R(1, 2))));
    let y, z;
    if (Math.abs(R(1, 2)) < 0.9999999) { y = Math.atan2(R(0, 2), R(2, 2)); z = Math.atan2(R(1, 0), R(1, 1)); }
    else { y = Math.atan2(-R(2, 0), R(0, 0)); z = 0; }
    return [x / DEG, y / DEG, z / DEG];
  }
  // Quaternion [x, y, z, w] (standard: v' = q v q*), for Babylon.
  toQuat() {
    const r = this.m, R = (i, j) => r[3 + i * 3 + j], t = R(0, 0) + R(1, 1) + R(2, 2);
    let s;
    if (t > 0) { s = Math.sqrt(t + 1) * 2; return [(R(2, 1) - R(1, 2)) / s, (R(0, 2) - R(2, 0)) / s, (R(1, 0) - R(0, 1)) / s, s / 4]; }
    if (R(0, 0) > R(1, 1) && R(0, 0) > R(2, 2)) { s = Math.sqrt(1 + R(0, 0) - R(1, 1) - R(2, 2)) * 2; return [s / 4, (R(0, 1) + R(1, 0)) / s, (R(0, 2) + R(2, 0)) / s, (R(2, 1) - R(1, 2)) / s]; }
    if (R(1, 1) > R(2, 2)) { s = Math.sqrt(1 + R(1, 1) - R(0, 0) - R(2, 2)) * 2; return [(R(0, 1) + R(1, 0)) / s, s / 4, (R(1, 2) + R(2, 1)) / s, (R(0, 2) - R(2, 0)) / s]; }
    s = Math.sqrt(1 + R(2, 2) - R(0, 0) - R(1, 1)) * 2; return [(R(0, 2) + R(2, 0)) / s, (R(1, 2) + R(2, 1)) / s, s / 4, (R(1, 0) - R(0, 1)) / s];
  }
  static fromQuat(px, py, pz, x, y, z, w) {
    const n = Math.hypot(x, y, z, w) || 1; x /= n; y /= n; z /= n; w /= n;
    return new CF([px, py, pz,
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]);
  }
  // Position linear, rotation slerp the short way round (as CFrame:Lerp).
  lerp(b, t) {
    const qa = this.toQuat(), qb = b.toQuat();
    let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
    if (d < 0) { d = -d; for (let i = 0; i < 4; i++) qb[i] = -qb[i]; }
    let wa = 1 - t, wb = t;
    if (d <= 0.9995) { const th = Math.acos(d), s = Math.sin(th); wa = Math.sin((1 - t) * th) / s; wb = Math.sin(t * th) / s; }
    const q = qa.map((v, i) => v * wa + qb[i] * wb), p = [0, 1, 2].map(i => this.m[i] + (b.m[i] - this.m[i]) * t);
    return CF.fromQuat(...p, ...q);
  }
  mul(b) {
    const a = this.m, B = b.m, o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[3 + r * 3 + c] = a[3 + r * 3] * B[3 + c] + a[4 + r * 3] * B[6 + c] + a[5 + r * 3] * B[9 + c];
      o[r] = a[r] + a[3 + r * 3] * B[0] + a[4 + r * 3] * B[1] + a[5 + r * 3] * B[2];
    }
    return new CF(o);
  }
  inverse() {
    const a = this.m, o = new Array(12);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[3 + r * 3 + c] = a[3 + c * 3 + r];
    for (let r = 0; r < 3; r++) o[r] = -(o[3 + r * 3] * a[0] + o[4 + r * 3] * a[1] + o[5 + r * 3] * a[2]);
    return new CF(o);
  }
}
