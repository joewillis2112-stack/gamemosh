// WorldRoot:Raycast's geometry, engine-free (Node tests run it as is).
// Roblox semantics (create.roblox.com/docs/reference/engine/classes/WorldRoot#Raycast):
// - the ray runs from origin along direction, as far as direction's length;
// - it hits the nearest BasePart whose surface it enters: a part the origin is
//   inside isn't hit (the ray leaves it, it doesn't enter it);
// - CanQuery false parts are never hit; with RespectCanCollide, CanCollide false
//   parts aren't either;
// - FilterDescendantsInstances: Exclude skips those instances and their
//   descendants, Include hits only them;
// - the result: Instance, Position, Normal (the surface's outward unit normal),
//   Material, Distance.
// Shapes are exact: Block and the boxes of other classes as boxes, Ball as a
// sphere (the smallest size axis is its diameter), Cylinder along X, Wedge as
// its five planes. MeshParts go to a hook (the renderer's triangles).

// Rotation columns of a CFrame (m = [x, y, z, R00..R22], rows): right, up, back.
const col = (m, k) => [m[3 + k], m[6 + k], m[9 + k]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// A world point/direction into the part's local frame.
function toLocal(cf, p) { const d = sub(p, [cf.m[0], cf.m[1], cf.m[2]]); return [dot(d, col(cf.m, 0)), dot(d, col(cf.m, 1)), dot(d, col(cf.m, 2))]; }
function dirToLocal(cf, v) { return [dot(v, col(cf.m, 0)), dot(v, col(cf.m, 1)), dot(v, col(cf.m, 2))]; }
function dirToWorld(cf, v) { const r = col(cf.m, 0), u = col(cf.m, 1), b = col(cf.m, 2); return [0, 1, 2].map(k => r[k] * v[0] + u[k] * v[1] + b[k] * v[2]); }

// Entry into a convex solid given as planes { n (outward, local), d } with n.x <= d inside.
// Returns { t, n } for the entry point, or null (missed, or the origin is inside).
function convexEntry(o, v, planes, tMax) {
  let tEnter = -Infinity, tExit = Infinity, nEnter = null;
  for (const { n, d } of planes) {
    const denom = dot(n, v), dist = d - dot(n, o); // dist >= 0: inside this plane
    if (Math.abs(denom) < 1e-12) { if (dist < 0) return null; continue; }
    const t = dist / denom;
    if (denom < 0) { if (t > tEnter) { tEnter = t; nEnter = n; } } // entering through this plane
    else if (t < tExit) tExit = t;
    if (tEnter > tExit) return null;
  }
  if (tEnter < 0 || tEnter > tMax || !nEnter) return null; // inside at the origin, or too far
  return { t: tEnter, n: nEnter };
}
const box = h => [
  { n: [1, 0, 0], d: h[0] }, { n: [-1, 0, 0], d: h[0] },
  { n: [0, 1, 0], d: h[1] }, { n: [0, -1, 0], d: h[1] },
  { n: [0, 0, 1], d: h[2] }, { n: [0, 0, -1], d: h[2] },
];
// Roblox's wedge: the slope rises from the front-bottom edge (-Z, low) to the back-top edge (+Z, high).
function wedge(h) {
  const n = [0, h[2], -h[1]], l = Math.hypot(n[1], n[2]);
  return [
    { n: [1, 0, 0], d: h[0] }, { n: [-1, 0, 0], d: h[0] },
    { n: [0, -1, 0], d: h[1] }, { n: [0, 0, 1], d: h[2] },
    { n: [0, n[1] / l, n[2] / l], d: 0 }, // through the centre, facing up and forward
  ];
}
function sphereEntry(o, v, r, tMax) {
  const a = dot(v, v), b = 2 * dot(o, v), c = dot(o, o) - r * r;
  if (c < 0) return null; // inside
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > tMax) return null;
  const p = [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t], l = Math.hypot(...p);
  return { t, n: [p[0] / l, p[1] / l, p[2] / l] };
}
// Cylinder along local X: radius r (the smaller of Y and Z half sizes), half length hx.
function cylinderEntry(o, v, hx, r, tMax) {
  if (Math.abs(o[0]) <= hx && o[1] * o[1] + o[2] * o[2] <= r * r) return null; // inside
  let best = null;
  // Side.
  const a = v[1] * v[1] + v[2] * v[2], b = 2 * (o[1] * v[1] + o[2] * v[2]), c = o[1] * o[1] + o[2] * o[2] - r * r;
  if (a > 1e-12) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a), x = o[0] + v[0] * t;
      if (t >= 0 && t <= tMax && Math.abs(x) <= hx) { const y = o[1] + v[1] * t, z = o[2] + v[2] * t, l = Math.hypot(y, z); best = { t, n: [0, y / l, z / l] }; }
    }
  }
  // Caps.
  for (const s of [1, -1]) {
    if (Math.abs(v[0]) < 1e-12) continue;
    const t = (s * hx - o[0]) / v[0];
    if (t < 0 || t > tMax || (best && t >= best.t) || o[0] * s <= hx) continue; // entering a cap means starting beyond it
    const y = o[1] + v[1] * t, z = o[2] + v[2] * t;
    if (y * y + z * z <= r * r) best = { t, n: [s, 0, 0] };
  }
  return best;
}

/** The nearest hit of a part, or null. part: { cf, size, shape } (shape: Block, Ball, Cylinder, Wedge). */
export function rayPart(origin, dir, len, part) {
  const o = toLocal(part.cf, origin), v = dirToLocal(part.cf, dir), h = [part.size.x / 2, part.size.y / 2, part.size.z / 2];
  let hit;
  switch (part.shape) {
    case 'Ball': hit = sphereEntry(o, v, Math.min(h[0], h[1], h[2]), len); break;
    case 'Cylinder': hit = cylinderEntry(o, v, h[0], Math.min(h[1], h[2]), len); break;
    case 'Wedge': hit = convexEntry(o, v, wedge(h), len); break;
    default: hit = convexEntry(o, v, box(h), len);
  }
  if (!hit) return null;
  const n = dirToWorld(part.cf, hit.n), l = Math.hypot(...n);
  return { t: hit.t, normal: [n[0] / l, n[1] / l, n[2] / l] };
}

/** Cast against candidates [{ inst, cf, size, shape, mesh? }]. dir is a unit vector, len its
 *  length; meshHit(c, origin, dir, len) handles mesh shapes. Returns the nearest
 *  { inst, t, normal } or null. */
export function castRay(origin, dir, len, candidates, meshHit) {
  let best = null;
  for (const c of candidates) {
    // Bounding sphere first.
    const r = Math.hypot(c.size.x, c.size.y, c.size.z) / 2, oc = sub([c.cf.m[0], c.cf.m[1], c.cf.m[2]], origin), along = dot(oc, dir);
    if (along < -r || along > len + r) continue;
    if (dot(oc, oc) - along * along > r * r) continue;
    const hit = c.mesh ? (meshHit ? meshHit(c, origin, dir, len) : rayPart(origin, dir, len, { ...c, shape: 'Block' })) : rayPart(origin, dir, len, c);
    if (hit && (!best || hit.t < best.t)) best = { inst: c.inst, t: hit.t, normal: hit.normal };
  }
  return best;
}
