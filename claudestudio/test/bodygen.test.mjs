// Generated R15 bodies (web/runtime/bodygen.js), every preset: each joint's two RigAttachments meet
// at rest; the soles are where hrpHeight says; left and right mirror; the arms hang clear of the
// torso; the feet point forward (-Z, Roblox's facing); every part's mesh is wound outward and fills
// its size (a box at roundness 0); parameters do what they say (longer legs raise the root by that
// much; a bigger head makes the body that much taller).
import { makeBody, partMesh, bodyNodes, bodySkin, BODY_PRESETS, R15_PARTS, R15_JOINTS, describedBody, colorGroup, toLinear, SHAPE_PROPS, FACE_COLOR } from '../web/runtime/bodygen.js';

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
// The skinned body (high tiers): weights sum to 1 on valid bones; a vertex well along a limb is all its
// own bone's; one at the knee is shared by the thigh and the shin.
{
  const b = makeBody({}), { mesh } = bodySkin(b, bodyNodes(b)), J = mesh.joints, W = mesh.weights, X = mesh.positions;
  let sums = 0, badIdx = 0;
  for (let i = 0; i < W.length; i += 4) { if (Math.abs(W[i] + W[i + 1] + W[i + 2] + W[i + 3] - 1) > 1e-5) sums++; for (let k = 0; k < 4; k++) if (J[i + k] < 0 || J[i + k] >= R15_PARTS.length) badIdx++; }
  check(!sums && !badIdx && J.length === X.length / 3 * 4, `skin: every vertex's weights sum to 1 on valid bones (${sums} off, ${badIdx} bad)`);
  // Where the left knee is at rest (in the file's space: the root turned and raised).
  const root = new (b.parts.HumanoidRootPart.rest.constructor)([0, b.hrpHeight, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]);
  const knee = root.mul(b.parts.LeftUpperLeg.rest).mul(b.joints.find(j => j.name === 'LeftKnee').c0), thigh = R15_PARTS.indexOf('LeftUpperLeg'), shin = R15_PARTS.indexOf('LeftLowerLeg');
  const share = (i, bone) => { let w = 0; for (let k = 0; k < 4; k++) if (J[i * 4 + k] === bone) w += W[i * 4 + k]; return w; };
  let atKnee = null, best = Infinity, farThigh = null;
  for (let i = 0; i < X.length / 3; i++) {
    const d = Math.hypot(X[i * 3] - knee.x, X[i * 3 + 1] - knee.y, X[i * 3 + 2] - knee.z);
    if (share(i, thigh) + share(i, shin) > 0.99 && d < best) { best = d; atKnee = i; }
    if (farThigh === null && share(i, thigh) > 0 && Math.abs(X[i * 3 + 1] - (knee.y + b.parts.LeftUpperLeg.size[1] / 2)) < 0.08) farThigh = i; // the thigh's middle (not the hip, which blends with the torso)
  }
  const kt = share(atKnee, thigh), ks = share(atKnee, shin);
  // (The joint is inside the limb: the nearest surface vertex is some way off it, so not quite half and half.)
  check(best < 0.3 && kt >= 0.25 && ks >= 0.25, `skin: a vertex at the knee is shared by thigh and shin (${kt.toFixed(2)} / ${ks.toFixed(2)}, ${best.toFixed(2)} studs from it)`);
  check(farThigh !== null && share(farThigh, thigh) === 1, 'skin: a vertex well up the thigh is all the thigh\'s');
}

// Roblox's body scales (HumanoidDescription): every part but the head stretched along its axes, the head
// scaled whole, the joints still meeting; the neck's height scales with HeightScale, the head above it
// with HeadScale.
{
  const base = makeBody({}), sc = { heightScale: 1.2, widthScale: 0.8, depthScale: 1.1, headScale: 1.3 }, b = makeBody(sc);
  let worst = 0, wrong = [];
  for (const j of b.joints) { const a = b.parts[j.part0].rest.mul(j.c0), c = b.parts[j.part1].rest.mul(j.c1); worst = Math.max(worst, Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)); }
  for (const n of R15_PARTS) { const k = n === 'Head' ? [1.3, 1.3, 1.3] : [0.8, 1.2, 1.1]; if (!b.parts[n].size.every((v, i) => near(v, base.parts[n].size[i] * k[i]))) wrong.push(n); }
  check(worst < 1e-4 && !wrong.length, `scales: each part stretched (the head whole), the joints meeting (worst ${worst.toExponential(1)}${wrong.length ? '; wrong: ' + wrong : ''})`);
  const neck = x => { const u = x.parts.UpperTorso.rest.mul(x.joints.find(j => j.name === 'Neck').c0); return u.y + x.hrpHeight; };
  const want = 1.2 * neck(base) + 1.3 * (base.height - neck(base));
  check(near(neck(b), 1.2 * neck(base)) && near(b.height, want), `scales: the neck ${neck(b).toFixed(3)} studs up (1.2x), the body ${b.height.toFixed(3)} tall (${want.toFixed(3)})`);
  check(near(b.parts.LeftUpperArm.rest.x, 0.8 * base.parts.LeftUpperArm.rest.x) && near(b.parts.LeftFoot.rest.z, 1.1 * base.parts.LeftFoot.rest.z), 'scales: the arms move in with WidthScale, the feet forward with DepthScale');
}
// A HumanoidDescription's and a BodyShape's properties as body parameters.
{
  const C = (r, g, b) => ({ r, g, b });
  const desc = { HeightScale: 1.1, WidthScale: 0.9, DepthScale: 1, HeadScale: 1.2, HeadColor: C(1, 0.5, 0), TorsoColor: C(0, 1, 0), LeftArmColor: C(0, 0, 1), RightArmColor: C(0.5, 0, 1), LeftLegColor: C(1, 1, 0), RightLegColor: C(0, 1, 1) };
  const shape = Object.fromEntries(SHAPE_PROPS.map(([prop, k]) => [prop, BODY_PRESETS.tall[k]]));
  const p = describedBody(desc, shape, BODY_PRESETS.chibi);
  check(SHAPE_PROPS.every(([, k]) => p[k] === BODY_PRESETS.tall[k]) && p.heightScale === 1.1 && p.headScale === 1.2 && p.widthScale === 0.9 && JSON.stringify(p.colors.RightArm) === '[0.5,0,1]', 'described: the shape from BodyShape (over the base), the scales and colours from the description');
  const q = describedBody(desc, null, BODY_PRESETS.chibi);
  check(SHAPE_PROPS.every(([, k]) => q[k] === BODY_PRESETS.chibi[k]), 'described: without a BodyShape the base shape stays');
  // Colours: every vertex of a part wears its group's colour, linear (glTF's), on rigid parts and the skinned mesh.
  const b = makeBody(p), nodes = bodyNodes(b);
  const bad = nodes.filter(n => n.mesh).filter(n => { const want = p.colors[colorGroup(n.name)].map(toLinear), c = n.mesh.colors, own = n.extras.colorRanges ? n.extras.colorRanges[0][2] * 4 : c.length; if (!c || c.length !== n.mesh.positions.length / 3 * 4) return true; for (let i = 0; i < own; i += 4) if (!near(c[i], want[0]) || !near(c[i + 1], want[1]) || !near(c[i + 2], want[2]) || c[i + 3] !== 1) return true; return false; });
  check(nodes.filter(n => n.mesh).length === 15 && !bad.length, `colours: each part's vertices wear its group's colour, linear${bad.length ? ' (wrong: ' + bad.map(n => n.name) + ')' : ''}`);
  check(colorGroup('LeftHand') === 'LeftArm' && colorGroup('RightFoot') === 'RightLeg' && colorGroup('LowerTorso') === 'Torso' && colorGroup('RightLowerArm') === 'RightArm', 'colours: hands with the arms, feet with the legs, both torsos one');
  const { mesh } = bodySkin(b, nodes);
  check(mesh.colors && mesh.colors.length === mesh.positions.length / 3 * 4, 'colours: the skinned mesh carries one per vertex');
  // The face: on the head's front, its own dark colour, kept out of the head's colour range.
  const head = nodes.find(n => n.name === 'Head'), hv = head.extras.colorRanges[0][2], fc = FACE_COLOR.map(toLinear), H = b.parts.Head.size;
  let faceOk = head.mesh.positions.length / 3 > hv, front = true;
  for (let i = hv; i < head.mesh.positions.length / 3; i++) { if (!near(head.mesh.colors[i * 4], fc[0])) faceOk = false; if (head.mesh.positions[i * 3 + 2] > -H[2] * 0.25) front = false; }
  check(faceOk && front, `the face: ${head.mesh.positions.length / 3 - hv} vertices on the head's front (-Z), its own colour, outside the head's colour range`);
  const nf = bodyNodes(makeBody({ ...p, face: 0 })).find(n => n.name === 'Head');
  check(!nf.extras.colorRanges && nf.mesh.positions.length / 3 === hv, 'Face 0: no face');
}
if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
