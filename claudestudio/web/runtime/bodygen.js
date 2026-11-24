// Adjustable bodies on the R15 skeleton (PLAN.md, Adjustable bodies). The skeleton is Roblox's R15:
// its part names, joints and RigAttachment names are what scripts and animations address, so they
// are fixed. The body on it is generated from parameters, in studs:
//   proportions: legLength (hip to sole), torsoLength (both torso parts), lowerTorsoShare, shoulderWidth,
//   hipWidth, torsoDepth, armLength (shoulder to wrist), forearmShare, handLength, footLength,
//   armThickness, legThickness, headHeight, headWidth, headDepth, neckGap;
//   shape: roundness (0 boxes ... 1 fully rounded), headRoundness, taper (limbs and torso narrow
//   towards their lower end: 0 none ... 0.4 strong), chest (upper torso wider at the top), segments.
// Each part is a rounded box (an inner box grown by a radius, so roundness 0 is a box and 1 a capsule
// or ellipsoid-like form), tapered. RigAttachments sit at the parts' ends from the same numbers, so
// every body plays the same animations. Pure geometry: no Babylon (tools and the runtime share it).
import { CF } from '../cframe.js';
import { glbBytes } from './glb.js';

/** R15's joints: name, Part0, Part1, the RigAttachment both carry. */
export const R15_JOINTS = [
  ['Root', 'HumanoidRootPart', 'LowerTorso', 'RootRigAttachment'], ['Waist', 'LowerTorso', 'UpperTorso', 'WaistRigAttachment'], ['Neck', 'UpperTorso', 'Head', 'NeckRigAttachment'],
  ['LeftShoulder', 'UpperTorso', 'LeftUpperArm', 'LeftShoulderRigAttachment'], ['LeftElbow', 'LeftUpperArm', 'LeftLowerArm', 'LeftElbowRigAttachment'], ['LeftWrist', 'LeftLowerArm', 'LeftHand', 'LeftWristRigAttachment'],
  ['RightShoulder', 'UpperTorso', 'RightUpperArm', 'RightShoulderRigAttachment'], ['RightElbow', 'RightUpperArm', 'RightLowerArm', 'RightElbowRigAttachment'], ['RightWrist', 'RightLowerArm', 'RightHand', 'RightWristRigAttachment'],
  ['LeftHip', 'LowerTorso', 'LeftUpperLeg', 'LeftHipRigAttachment'], ['LeftKnee', 'LeftUpperLeg', 'LeftLowerLeg', 'LeftKneeRigAttachment'], ['LeftAnkle', 'LeftLowerLeg', 'LeftFoot', 'LeftAnkleRigAttachment'],
  ['RightHip', 'LowerTorso', 'RightUpperLeg', 'RightHipRigAttachment'], ['RightKnee', 'RightUpperLeg', 'RightLowerLeg', 'RightKneeRigAttachment'], ['RightAnkle', 'RightLowerLeg', 'RightFoot', 'RightAnkleRigAttachment'],
];
export const R15_PARTS = ['HumanoidRootPart', 'LowerTorso', 'UpperTorso', 'Head', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'RightUpperLeg', 'RightLowerLeg', 'RightFoot'];

/** Presets. "studio" is our own default; "blocky" is close to Roblox's classic proportions (a
 *  reference, not a target); the others show the range. */
export const BODY_PRESETS = {
  studio: { legLength: 2.3, torsoLength: 2.0, lowerTorsoShare: 0.32, shoulderWidth: 1.9, hipWidth: 1.15, torsoDepth: 0.95, armLength: 2.0, forearmShare: 0.48, handLength: 0.42, footLength: 1.0, armThickness: 0.55, legThickness: 0.62, headHeight: 1.25, headWidth: 1.2, headDepth: 1.15, neckGap: 0.08, roundness: 0.55, headRoundness: 0.85, taper: 0.12, chest: 0.12, segments: 6 },
  blocky: { legLength: 2.0, torsoLength: 2.0, lowerTorsoShare: 0.2, shoulderWidth: 2.0, hipWidth: 1.0, torsoDepth: 1.0, armLength: 2.0, forearmShare: 0.5, handLength: 0.3, footLength: 1.0, armThickness: 1.0, legThickness: 1.0, headHeight: 1.2, headWidth: 1.2, headDepth: 1.2, neckGap: 0, roundness: 0.08, headRoundness: 0.6, taper: 0, chest: 0, segments: 4 },
  chibi: { legLength: 1.2, torsoLength: 1.3, lowerTorsoShare: 0.35, shoulderWidth: 1.5, hipWidth: 1.0, torsoDepth: 0.95, armLength: 1.3, forearmShare: 0.5, handLength: 0.35, footLength: 0.8, armThickness: 0.55, legThickness: 0.6, headHeight: 2.0, headWidth: 2.1, headDepth: 1.9, neckGap: 0.05, roundness: 0.8, headRoundness: 0.95, taper: 0.05, chest: 0, segments: 6 },
  tall: { legLength: 3.3, torsoLength: 2.5, lowerTorsoShare: 0.3, shoulderWidth: 1.8, hipWidth: 1.1, torsoDepth: 0.8, armLength: 2.7, forearmShare: 0.47, handLength: 0.5, footLength: 1.1, armThickness: 0.45, legThickness: 0.55, headHeight: 1.0, headWidth: 0.85, headDepth: 0.95, neckGap: 0.12, roundness: 0.7, headRoundness: 0.9, taper: 0.2, chest: 0.2, segments: 6 },
};

/** The BodyShape class's properties (Claude Studio's own, web/datamodel.js): each shape parameter but
 *  segments (the tier's), capitalised: [property, parameter]. Their defaults are the studio preset's. */
export const SHAPE_PROPS = Object.keys(BODY_PRESETS.studio).filter(k => k !== 'segments').map(k => [k[0].toUpperCase() + k.slice(1), k]);
const BODY_COLORS = ['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'];
/** A body's parameters from a HumanoidDescription's properties and its BodyShape's (plain prop objects,
 *  either may be null): the shape over `base`, the description's four scales and six colours (Color3s
 *  with r, g, b). ProportionScale and BodyTypeScale blend towards Roblox's own bodies' proportions,
 *  which ours don't have: they are kept on the description and change nothing here. */
export function describedBody(desc, shape, base = BODY_PRESETS.studio) {
  const p = { ...base };
  if (shape) for (const [prop, k] of SHAPE_PROPS) if (typeof shape[prop] === 'number') p[k] = shape[prop];
  if (desc) {
    Object.assign(p, { heightScale: desc.HeightScale, widthScale: desc.WidthScale, depthScale: desc.DepthScale, headScale: desc.HeadScale });
    p.colors = Object.fromEntries(BODY_COLORS.map(g => { const c = desc[g + 'Color']; return [g, [c.r, c.g, c.b]]; }));
  }
  return p;
}

/** Mesh detail by fidelity tier (runtime/quality.js): segments per part's rounding; more on higher tiers. */
export const TIER_SEGMENTS = { low: 3, phone: 4, high: 6, ultra: 8 };

const T = (x, y, z) => new CF([x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** The body: parts { name: { size, rest (in the HumanoidRootPart's frame), attachments { name: CF },
 *  shape { roundness, taper, flare } } }, joints [{ name, part0, part1, c0, c1 }], hrpHeight (the root's
 *  centre above the soles), height (soles to the head's top). Roblox's axes: +Y up, facing -Z. */
export function makeBody(params = {}) {
  const p = { ...BODY_PRESETS.studio, heightScale: 1, widthScale: 1, depthScale: 1, headScale: 1, ...params };
  const lower = p.torsoLength * p.lowerTorsoShare, upper = p.torsoLength - lower;
  const upperLeg = p.legLength * 0.5, lowerLeg = p.legLength * 0.5 - p.legThickness * 0.25, footH = p.legThickness * 0.5; // the foot's height comes off the leg
  const upperArm = (p.armLength) * (1 - p.forearmShare), lowerArm = p.armLength * p.forearmShare;
  const parts = {
    HumanoidRootPart: { size: [2, 2, 1], shape: null },
    LowerTorso: { size: [p.hipWidth + p.legThickness * 0.2, lower, p.torsoDepth * 0.95], shape: { roundness: p.roundness, taper: 0, flare: 0 } },
    UpperTorso: { size: [p.shoulderWidth, upper, p.torsoDepth], shape: { roundness: p.roundness, taper: p.chest, flare: 0 } },
    Head: { size: [p.headWidth, p.headHeight, p.headDepth], shape: { roundness: p.headRoundness, taper: 0, flare: 0 } },
  };
  for (const s of ['Left', 'Right']) {
    parts[s + 'UpperArm'] = { size: [p.armThickness, upperArm, p.armThickness], shape: { roundness: p.roundness, taper: p.taper, flare: 0 } };
    parts[s + 'LowerArm'] = { size: [p.armThickness * (1 - p.taper * 0.5), lowerArm, p.armThickness * (1 - p.taper * 0.5)], shape: { roundness: p.roundness, taper: p.taper, flare: 0 } };
    parts[s + 'Hand'] = { size: [p.armThickness * 0.85, p.handLength, p.armThickness * 0.85], shape: { roundness: Math.max(p.roundness, 0.3), taper: 0, flare: 0 } };
    parts[s + 'UpperLeg'] = { size: [p.legThickness, upperLeg, p.legThickness], shape: { roundness: p.roundness, taper: p.taper, flare: 0 } };
    parts[s + 'LowerLeg'] = { size: [p.legThickness * (1 - p.taper * 0.5), lowerLeg, p.legThickness * (1 - p.taper * 0.5)], shape: { roundness: p.roundness, taper: p.taper, flare: 0 } };
    parts[s + 'Foot'] = { size: [p.legThickness * 0.95, footH, p.footLength], shape: { roundness: Math.max(p.roundness, 0.25), taper: 0, flare: 0 } };
  }
  // RigAttachments, in each part's own frame (joints sit at the ends; limbs hang from their tops).
  const A = (part, name, x, y, z) => { (parts[part].attachments = parts[part].attachments || {})[name] = T(x, y, z); };
  const LT = parts.LowerTorso.size, UT = parts.UpperTorso.size, H = parts.Head.size;
  A('HumanoidRootPart', 'RootRigAttachment', 0, 0, 0); A('LowerTorso', 'RootRigAttachment', 0, 0, 0);
  A('LowerTorso', 'WaistRigAttachment', 0, LT[1] / 2, 0); A('UpperTorso', 'WaistRigAttachment', 0, -UT[1] / 2, 0);
  A('UpperTorso', 'NeckRigAttachment', 0, UT[1] / 2 + p.neckGap / 2, 0); A('Head', 'NeckRigAttachment', 0, -H[1] / 2 - p.neckGap / 2, 0);
  for (const [s, k] of [['Left', -1], ['Right', 1]]) {
    const UA = parts[s + 'UpperArm'].size, LA = parts[s + 'LowerArm'].size, HA = parts[s + 'Hand'].size, UL = parts[s + 'UpperLeg'].size, LL = parts[s + 'LowerLeg'].size, F = parts[s + 'Foot'].size;
    // The shoulder: the arm's top beside the chest, its pivot a little in from its outer side.
    const sy = UT[1] / 2 - UA[0] * 0.5;
    A('UpperTorso', s + 'ShoulderRigAttachment', k * (UT[0] / 2), sy, 0); A(s + 'UpperArm', s + 'ShoulderRigAttachment', -k * UA[0] * 0.5, UA[1] / 2 - UA[0] * 0.5, 0);
    A(s + 'UpperArm', s + 'ElbowRigAttachment', 0, -UA[1] / 2, 0); A(s + 'LowerArm', s + 'ElbowRigAttachment', 0, LA[1] / 2, 0);
    A(s + 'LowerArm', s + 'WristRigAttachment', 0, -LA[1] / 2, 0); A(s + 'Hand', s + 'WristRigAttachment', 0, HA[1] / 2, 0);
    A(s + 'Hand', s + 'GripAttachment', 0, -HA[1] * 0.25, 0);
    A('LowerTorso', s + 'HipRigAttachment', k * p.hipWidth / 2 * 0.95 - k * UL[0] / 2 * 0.9, -LT[1] / 2, 0); A(s + 'UpperLeg', s + 'HipRigAttachment', 0, UL[1] / 2, 0);
    A(s + 'UpperLeg', s + 'KneeRigAttachment', 0, -UL[1] / 2, 0); A(s + 'LowerLeg', s + 'KneeRigAttachment', 0, LL[1] / 2, 0);
    A(s + 'LowerLeg', s + 'AnkleRigAttachment', 0, -LL[1] / 2, 0); A(s + 'Foot', s + 'AnkleRigAttachment', 0, F[1] / 2, F[2] / 2 - LL[2] / 2); // heel under the shin, toes forward (-Z)
  }
  A('Head', 'FaceFrontAttachment', 0, 0, -H[2] / 2); A('Head', 'HatAttachment', 0, H[1] / 2, 0);
  // Roblox's body scales (HumanoidDescription HeightScale, WidthScale, DepthScale, HeadScale): every
  // part but the head stretched along its own axes, the head scaled whole; each part's attachments with
  // it. At rest every part's frame is the root's, unturned, so the joints still meet.
  const sc = n => n === 'Head' ? [p.headScale, p.headScale, p.headScale] : [p.widthScale, p.heightScale, p.depthScale];
  for (const n of R15_PARTS) {
    const k = sc(n), part = parts[n];
    part.size = part.size.map((v, i) => v * k[i]);
    for (const [a, c] of Object.entries(part.attachments || {})) part.attachments[a] = T(c.x * k[0], c.y * k[1], c.z * k[2]);
  }
  // Rest pose from the root: Part1 = Part0 * C0 * C1:Inverse().
  const rest = { HumanoidRootPart: new CF() };
  const joints = R15_JOINTS.map(([name, a, b, att]) => {
    const c0 = parts[a].attachments[att], c1 = parts[b].attachments[att];
    rest[b] = rest[a].mul(c0).mul(c1.inverse());
    return { name, part0: a, part1: b, c0, c1 };
  });
  for (const n of R15_PARTS) parts[n].rest = rest[n];
  // Limbs and the torso reach past their joints by part of their thickness (rounder: further), so the
  // rounded ends overlap instead of meeting in a notch.
  for (const n of R15_PARTS) {
    const sh = parts[n].shape; if (!sh || n === 'Head' || /Hand|Foot/.test(n)) continue;
    sh.extend = Math.min(parts[n].size[0], parts[n].size[2]) * 0.5 * sh.roundness;
  }
  // The soles: the feet's lowest point; the head's top.
  const sole = Math.min(...['LeftFoot', 'RightFoot'].map(f => rest[f].y - parts[f].size[1] / 2));
  const top = rest.Head.y + parts.Head.size[1] / 2; // (the scaled head)
  return { params: p, parts, joints, hrpHeight: -sole, height: top - sole };
}

/** A part's mesh: a tapered rounded box of `size` (the part's own frame, centred), as positions,
 *  normals, UVs (per face) and triangles (outward, counter-clockwise from outside: glTF's winding). */
export function partMesh(size, { roundness = 0.5, taper = 0, segments = 6, extend = 0 } = {}) {
  // `extend`: studs the mesh reaches past each end along Y (into the next part at a joint, so a limb
  // reads as one form rather than stacked blocks); the part's size is unchanged.
  const [w, h0, d] = size, h = h0 + 2 * extend, half = [w / 2, h / 2, d / 2];
  const r = Math.max(1e-4, roundness * Math.min(...half)), inner = half.map(v => Math.max(0, v - r));
  const N = Math.max(2, Math.round(segments) * 2); // grid per face
  const positions = [], normals = [], uvs = [], indices = [];
  // The six faces of a cube, each an N x N grid on [-1, 1]^2: (axis, sign, u axis, v axis).
  const FACES = [[0, 1, 2, 1], [0, -1, 1, 2], [1, 1, 0, 2], [1, -1, 2, 0], [2, 1, 1, 0], [2, -1, 0, 1]];
  for (const [ax, sg, ua, va] of FACES) {
    const base = positions.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      // A point on the cube's face, spread so the rounding gets its share of the grid.
      const c = [0, 0, 0];
      c[ax] = sg; c[ua] = -1 + 2 * i / N; c[va] = -1 + 2 * j / N;
      const pt = c.map((v, k) => v * half[k]);
      // Rounded box: the nearest point of the inner box, then out by r along the way to this point.
      const q = pt.map((v, k) => Math.max(-inner[k], Math.min(inner[k], v)));
      let n = pt.map((v, k) => v - q[k]);
      const L = Math.hypot(...n);
      n = L > 1e-9 ? n.map(v => v / L) : (() => { const m = [0, 0, 0]; m[ax] = sg; return m; })();
      let p = q.map((v, k) => v + n[k] * r);
      // Taper: narrower towards the bottom (y -h/2), by `taper` of the width at the very bottom.
      const k = 1 - taper * (0.5 - p[1] / h);
      p = [p[0] * k, p[1], p[2] * k];
      positions.push(...p); normals.push(...n); uvs.push(i / N, j / N);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, e = c + 1;
      indices.push(a, b, e, a, e, c);
    }
  }
  // Winding: each triangle counter-clockwise seen from outside (its normal along the vertex normals).
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map(v => v * 3), P = positions, Nn = normals;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * Nn[a] + n[1] * Nn[a + 1] + n[2] * Nn[a + 2] < 0) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  }
  return { positions, normals, uvs, indices };
}

const flat = c => c.m.map(x => +x.toFixed(6));
/** Which of Roblox's six body colours (BodyColors, HumanoidDescription: Head, Torso, LeftArm, RightArm,
 *  LeftLeg, RightLeg) an R15 part wears. */
export const colorGroup = n => n === 'Head' ? 'Head' : /Torso$/.test(n) ? 'Torso' : n.replace(/(Upper|Lower)?(Arm|Hand)$/, 'Arm').replace(/(Upper|Lower)?(Leg|Foot)$/, 'Leg');
// Roblox's Color3s are sRGB; glTF's vertex colours are linear.
export const toLinear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
// A part's mesh with its colour on every vertex (params.colors: { Head: [r, g, b], Torso, ... }, sRGB 0-1),
// or as it was when the body has no colours (one material colour for all).
const tinted = (b, n, m) => {
  const c = b.params.colors && b.params.colors[colorGroup(n)];
  if (c) { const [r, g, bl] = c.map(toLinear); m.colors = []; for (let i = 0; i < m.positions.length; i += 3) m.colors.push(r, g, bl, 1); }
  return m;
};
/** The body's nodes for a .glb: a node per part (named as the part, parented as the joints), the root
 *  turned to face +Z as glTF characters do, each part's joint in its extras (runtime/r15clips.js reads
 *  them: the part's size, its joint, C0 and C1). */
export function bodyNodes(b) {
  const index = new Map(R15_PARTS.map((n, i) => [n, i]));
  return R15_PARTS.map(n => {
    const j = R15_JOINTS.find(j => j[2] === n), local = j ? b.parts[j[1]].rest.inverse().mul(b.parts[n].rest) : b.parts[n].rest;
    const [x, y, z, w] = local.toQuat(), jt = j && b.joints.find(x => x.part1 === n);
    return {
      name: n, translation: j ? [local.x, local.y, local.z] : [0, b.hrpHeight, 0], rotation: j ? [x, y, z, w] : [0, 1, 0, 0],
      children: R15_JOINTS.filter(k => k[1] === n).map(k => index.get(k[2])),
      extras: { r15: { part: n, size: b.parts[n].size, ...(jt ? { joint: jt.name, c0: flat(jt.c0), c1: flat(jt.c1) } : {}) } },
      mesh: b.parts[n].shape ? tinted(b, n, partMesh(b.parts[n].size, { ...b.parts[n].shape, segments: b.params.segments })) : null,
    };
  });
}
/** A body as .glb bytes (what Character.load takes as a Blob), from parameters over the studio preset.
 *  skinned: one smooth skinned mesh (high tiers) instead of a rigid mesh per part (bodySkin). */
export function bodyGlb(params = {}, { skinned = false, ...opts } = {}) {
  const b = makeBody(params), nodes = bodyNodes(b);
  if (params.colors) opts = { ...opts, color: [1, 1, 1, 1] }; // the vertices carry the colours (glTF multiplies them by the base colour)
  if (!skinned) return glbBytes(nodes, [R15_PARTS.indexOf('HumanoidRootPart')], opts);
  const { mesh, inverseBindMatrices } = bodySkin(b, nodes);
  for (const n of nodes) { n.extras.part = boxOf(b.parts[n.name].size); n.mesh = null; } // the joints keep their boxes (feet's soles are measured on them)
  nodes.push({ name: 'Body', translation: [0, 0, 0], rotation: [0, 0, 0, 1], mesh, skin: 0 });
  return glbBytes(nodes, [R15_PARTS.indexOf('HumanoidRootPart'), nodes.length - 1], { ...opts, skins: [{ joints: R15_PARTS.map((_, i) => i), inverseBindMatrices }] });
}
const boxOf = size => ({ min: size.map(v => -v / 2), max: size.map(v => v / 2) });

// The skinned body: every part's mesh at its rest place in the file's space (the root node turned to
// face +Z, at hrpHeight), one mesh; each vertex on its own part's bone, blended towards a neighbour's
// near the joint they share (half and half at the joint, nothing beyond about half the limb's
// thickness), at most four bones. The inverse bind matrices are the joints' rest frames inverted.
export function bodySkin(b, nodes) {
  const root = new CF([0, b.hrpHeight, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]); // translation, and a half turn about Y
  const world = Object.fromEntries(R15_PARTS.map(n => [n, root.mul(b.parts[n].rest)]));
  const index = new Map(R15_PARTS.map((n, i) => [n, i]));
  // Each part's neighbours: [other part, the joint's point (world), blend radius].
  const near = Object.fromEntries(R15_PARTS.map(n => [n, []]));
  for (const j of b.joints) {
    if (j.part0 === 'HumanoidRootPart') continue;
    const P = world[j.part0].mul(j.c0), at = [P.x, P.y, P.z];
    const th = Math.min(...[j.part0, j.part1].flatMap(n => [b.parts[n].size[0], b.parts[n].size[2]]));
    const r = Math.max(0.15, Math.min(0.6, th * 0.5));
    near[j.part0].push([j.part1, at, r]); near[j.part1].push([j.part0, at, r]);
  }
  const positions = [], normals = [], uvs = [], indices = [], joints = [], weights = [], colors = [];
  for (const n of R15_PARTS) {
    const part = b.parts[n];
    if (!part.shape) continue;
    const m = tinted(b, n, partMesh(part.size, { ...part.shape, segments: b.params.segments })), W = world[n], R = W.m.slice(3), base = positions.length / 3;
    if (m.colors) colors.push(...m.colors);
    for (let i = 0; i < m.positions.length; i += 3) {
      const v = W.mul(new CF([m.positions[i], m.positions[i + 1], m.positions[i + 2], 1, 0, 0, 0, 1, 0, 0, 0, 1]));
      positions.push(v.x, v.y, v.z);
      const [x, y, z] = [m.normals[i], m.normals[i + 1], m.normals[i + 2]];
      normals.push(R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z);
      const infl = [[index.get(n), 1]];
      for (const [o, at, r] of near[n]) {
        const d = Math.hypot(v.x - at[0], v.y - at[1], v.z - at[2]);
        if (d < r) { const u = d / r; infl.push([index.get(o), 1 - u * u * (3 - 2 * u)]); }
      }
      infl.sort((a, c) => c[1] - a[1]);
      const top = infl.slice(0, 4), sum = top.reduce((a, c) => a + c[1], 0);
      for (let k = 0; k < 4; k++) { joints.push(top[k] ? top[k][0] : 0); weights.push(top[k] ? top[k][1] / sum : 0); }
    }
    for (let i = 0; i < m.uvs.length; i++) uvs.push(m.uvs[i]);
    for (const k of m.indices) indices.push(base + k);
  }
  // Inverse bind matrices, column-major: [R t; 0 1] inverted for each joint.
  const inverseBindMatrices = new Float32Array(16 * R15_PARTS.length);
  R15_PARTS.forEach((n, i) => {
    const v = world[n].inverse(), r = v.m;
    inverseBindMatrices.set([r[3], r[6], r[9], 0, r[4], r[7], r[10], 0, r[5], r[8], r[11], 0, v.x, v.y, v.z, 1], i * 16);
  });
  return { mesh: { positions, normals, uvs, indices, joints, weights, ...(colors.length ? { colors } : {}) }, inverseBindMatrices };
}
