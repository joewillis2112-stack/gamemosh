// Generated R15 bodies (web/runtime/bodygen.js), every preset: each joint's two RigAttachments meet
// at rest; the soles are where hrpHeight says; left and right mirror; the arms hang clear of the
// torso; the feet point forward (-Z, Roblox's facing); every part's mesh is wound outward and fills
// its size (a box at roundness 0); parameters do what they say (longer legs raise the root by that
// much; a bigger head makes the body that much taller).
import { makeBody, partMesh, BODY_PRESETS, R15_PARTS, R15_JOINTS } from '../web/runtime/bodygen.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const near = (a, b, e = 1e-4) => Math.abs(a - b) < e;

for (const [name, preset] of Object.entries(BODY_PRESETS)) {
  const b = makeBody(preset), P = b.parts;
  check(R15_PARTS.every(n => P[n] && P[n].rest && P[n].size.every(v => v > 0)) && b.joints.length === R15_JOINTS.length, `${name}: R15's 16 parts and 15 joints`);
  let worst = 0;
  for (const j of b.joints) { const a = P[j.part0].rest.mul(j.c0), c = P[j.part1].rest.mul(j.c1); worst = Math.max(worst, Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)); }
  check(worst < 1e-4, `${name}: every joint's attachments meet at rest (worst ${worst.toExponential(1)})`);
  const sole = Math.min(...['LeftFoot', 'RightFoot'].map(f => P[f].rest.y - P[f].size[1] / 2));
  check(near(sole, -b.hrpHeight) && near(b.height, P.Head.rest.y + P.Head.size[1] / 2 - sole), `${name}: soles ${b.hrpHeight.toFixed(2)} below the root, ${b.height.toFixed(2)} studs tall`);
  const mirror = ['UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot'].every(s => { const L = P['Left' + s].rest, R = P['Right' + s].rest; return near(L.x, -R.x) && near(L.y, R.y) && near(L.z, R.z); });
  check(mirror, `${name}: left and right mirror`);
  const clear = ['Left', 'Right'].every(s => Math.abs(P[s + 'UpperArm'].rest.x) - P[s + 'UpperArm'].size[0] / 2 >= P.UpperTorso.size[0] / 2 - 1e-6);
  check(clear, `${name}: the arms hang clear of the torso`);
  const front = n => P[n].rest.z - P[n].size[2] / 2; // its front edge (Roblox faces -Z)
  check(['LeftFoot', 'RightFoot'].every(f => front(f) <= front(f.replace('Foot', 'LowerLeg')) + 1e-6 && P[f].rest.z <= P[f.replace('Foot', 'LowerLeg')].rest.z + 1e-6), `${name}: the feet reach forward (-Z) of the shins, not back`);
  // Meshes: outward winding (convex: every triangle faces away from the centre), filling the size.
  let inward = 0, size = 0;
  for (const n of R15_PARTS) {
    const sh = P[n].shape; if (!sh) continue;
    const m = partMesh(P[n].size, { ...sh, segments: b.params.segments }), X = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, c, d] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map(v => v * 3);
      const u = [X[c] - X[a], X[c + 1] - X[a + 1], X[c + 2] - X[a + 2]], v = [X[d] - X[a], X[d + 1] - X[a + 1], X[d + 2] - X[a + 2]];
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], g = [(X[a] + X[c] + X[d]) / 3, (X[a + 1] + X[c + 1] + X[d + 1]) / 3, (X[a + 2] + X[c + 2] + X[d + 2]) / 3];
      if (Math.hypot(...nn) > 1e-12 && nn[0] * g[0] + nn[1] * g[1] + nn[2] * g[2] < 0) inward++;
    }
    const ext = k => { let lo = Infinity, hi = -Infinity; for (let i = k; i < X.length; i += 3) { lo = Math.min(lo, X[i]); hi = Math.max(hi, X[i]); } return hi - lo; };
    if (!near(ext(1), P[n].size[1] + 2 * (sh.extend || 0), 1e-3) || ext(0) > P[n].size[0] + 1e-6) size++;
  }
  check(!inward, `${name}: every part's mesh is wound outward (${inward} triangles not)`);
  check(!size, `${name}: every mesh spans its part's height (and its reach past the joints), no wider than the part (${size} not)`);
}
// A box at roundness 0: its corners are the size's.
{
  const m = partMesh([2, 3, 1], { roundness: 0, taper: 0, segments: 2 }), X = m.positions;
  const ext = k => { let lo = Infinity, hi = -Infinity; for (let i = k; i < X.length; i += 3) { lo = Math.min(lo, X[i]); hi = Math.max(hi, X[i]); } return [lo, hi]; };
  check(near(ext(0)[1], 1, 1e-3) && near(ext(1)[1], 1.5, 1e-3) && near(ext(2)[0], -0.5, 1e-3), 'roundness 0 is a box of its size');
}
// Parameters: longer legs raise the root by that much; a bigger head adds its height.
{
  const a = makeBody({}), b = makeBody({ legLength: BODY_PRESETS.studio.legLength + 1 }), c = makeBody({ headHeight: BODY_PRESETS.studio.headHeight + 0.5 });
  check(near(b.hrpHeight - a.hrpHeight, 1, 1e-3) && near(b.height - a.height, 1, 1e-3), `a leg 1 stud longer raises the root and the top by 1 (${(b.hrpHeight - a.hrpHeight).toFixed(3)}, ${(b.height - a.height).toFixed(3)})`);
  check(near(c.height - a.height, 0.5, 1e-3) && near(c.hrpHeight, a.hrpHeight), 'a head 0.5 taller makes the body 0.5 taller, the legs unchanged');
}
if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
