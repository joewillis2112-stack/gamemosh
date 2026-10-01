// Builds many small shapes into one vertex-coloured geometry (one draw call).
// Phones choke on draw calls far sooner than on triangles, so everything static is merged.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Matrix3();

function toProto(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class MeshKit {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  // Append geometry transformed by matrix. tint multiplies the baked colour.
  add(proto, matrix, tint = 1, colorOverride = null) {
    const p = proto.attributes.position.array;
    const nn = proto.attributes.normal.array;
    const cc = proto.attributes.color.array;
    _n.getNormalMatrix(matrix);
    const e = matrix.elements;
    const ne = _n.elements;
    let or = 1, og = 1, ob = 1;
    if (colorOverride) { const c = new THREE.Color(colorOverride); or = c.r; og = c.g; ob = c.b; }
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      this.pos.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
      const a = nn[i], b = nn[i + 1], c = nn[i + 2];
      let nx = ne[0] * a + ne[3] * b + ne[6] * c;
      let ny = ne[1] * a + ne[4] * b + ne[7] * c;
      let nz = ne[2] * a + ne[5] * b + ne[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.nor.push(nx / l, ny / l, nz / l);
      if (colorOverride) this.col.push(or * tint, og * tint, ob * tint);
      else this.col.push(cc[i] * tint, cc[i + 1] * tint, cc[i + 2] * tint);
    }
  }

  addAt(proto, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, tint = 1, rx = 0, rz = 0, color = null) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _v.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_v, _q, _s);
    this.add(proto, _m, tint, color);
  }

  get empty() {
    return this.pos.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- prototypes ----------
function merge(parts) {
  // parts: [geometry(with color), matrix]
  const kit = new MeshKit();
  for (const [g, m] of parts) kit.add(g, m);
  return kit.build();
}
const M = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(s, s, s));
};

export const PAL = {
  bark: 0x2f2620,
  paleBark: 0x9c968a,
  needles: 0x1c2a1f,
  needlesDark: 0x172119,
  snow: 0xd8dce2,
  rock: 0x625f5a,
  redRock: 0x5a3430,
  shrub: 0x2c3322,
  heath: 0x3f3139,
  reed: 0x4f5233,
  stone: 0x6b6761,
  darkStone: 0x47443f,
  moss: 0x4f5643,
  wood: 0x4b3627,
  darkWood: 0x2c221b,
  roof: 0x36292a,
  cloth: 0x584838,
  redCloth: 0x5b2320,
  iron: 0x3b3b40,
  bone: 0xc4bca6,
  gold: 0x9a7a3a,
};

export const unit = {
  box: () => toProto(new THREE.BoxGeometry(1, 1, 1), 0xffffff),
  cyl: (seg = 8) => toProto(new THREE.CylinderGeometry(0.5, 0.5, 1, seg), 0xffffff),
  cone: (seg = 8) => toProto(new THREE.ConeGeometry(0.5, 1, seg), 0xffffff),
  sphere: () => toProto(new THREE.IcosahedronGeometry(0.5, 1), 0xffffff),
};

export function makeProtos(seed = 1) {
  const rng = new RNG(seed);
  const P = {};
  P.box = unit.box();
  P.cyl6 = unit.cyl(6);
  P.cyl8 = unit.cyl(8);
  P.cyl12 = unit.cyl(12);
  P.cone4 = unit.cone(4);
  P.cone6 = unit.cone(6);
  P.cone8 = unit.cone(8);
  P.sphere = unit.sphere();

  const deadTree = (barkHex) => {
    const parts = [];
    const h = rng.range(4, 6.5);
    parts.push([toProto(new THREE.CylinderGeometry(0.12, 0.3, h, 5), barkHex), M(0, h / 2, 0)]);
    const nb = rng.int(3, 5);
    for (let i = 0; i < nb; i++) {
      const bh = rng.range(1.2, 2.4);
      const y = h * rng.range(0.45, 0.9);
      const a = rng.range(0, Math.PI * 2);
      const tilt = rng.range(0.6, 1.1);
      const g = toProto(new THREE.CylinderGeometry(0.03, 0.09, bh, 4), barkHex);
      g.translate(0, bh / 2, 0);
      parts.push([g, M(0, y, 0, 0, a, tilt)]);
    }
    return merge(parts);
  };
  P.dead = [deadTree(PAL.bark), deadTree(PAL.bark), deadTree(0x3a2f27)];
  P.paleDead = [deadTree(PAL.paleBark), deadTree(0x8a8279)];

  const pine = (needleHex, snowy) => {
    const parts = [];
    const h = rng.range(6, 9);
    parts.push([toProto(new THREE.CylinderGeometry(0.12, 0.22, h * 0.4, 5), PAL.bark), M(0, h * 0.2, 0)]);
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const r = (1 - t) * rng.range(1.7, 2.2) + 0.3;
      const ch = h * 0.34;
      const g = toProto(new THREE.ConeGeometry(r, ch, 7), snowy && i === layers - 1 ? PAL.snow : needleHex);
      parts.push([g, M(0, h * 0.3 + t * h * 0.62 + ch / 2, 0, 0, rng.range(0, 3))]);
    }
    return merge(parts);
  };
  P.pine = [pine(PAL.needles), pine(PAL.needlesDark), pine(0x223023)];
  P.snowPine = [pine(0x2a3a33, true), pine(0x24332c, true)];

  const rock = (hex) => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = rng.range(0.75, 1.2);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return toProto(g, hex);
  };
  P.rock = [rock(PAL.rock), rock(0x57544f), rock(0x6d6963)];
  P.redRock = [rock(PAL.redRock), rock(0x4b302d)];

  const shrub = (hex) => {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = toProto(new THREE.DodecahedronGeometry(rng.range(0.4, 0.7), 0), hex);
      parts.push([g, M(rng.range(-0.4, 0.4), 0.3, rng.range(-0.4, 0.4))]);
    }
    return merge(parts);
  };
  P.shrub = [shrub(PAL.shrub), shrub(PAL.heath), shrub(0x363326)];

  const reeds = () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const h = rng.range(0.9, 1.7);
      const g = toProto(new THREE.ConeGeometry(0.05, h, 3), PAL.reed);
      parts.push([g, M(rng.range(-0.5, 0.5), h / 2, rng.range(-0.5, 0.5), rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2))]);
    }
    return merge(parts);
  };
  P.reeds = [reeds(), reeds()];

  const bones = () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const g = toProto(new THREE.CylinderGeometry(0.04, 0.05, rng.range(0.4, 0.8), 4), PAL.bone);
      parts.push([g, M(rng.range(-0.4, 0.4), 0.05, rng.range(-0.4, 0.4), Math.PI / 2, rng.range(0, 3), 0)]);
    }
    parts.push([toProto(new THREE.IcosahedronGeometry(0.14, 0), PAL.bone), M(0.2, 0.12, 0.1)]);
    return merge(parts);
  };
  P.bones = [bones()];

  const grave = () => merge([[toProto(new THREE.BoxGeometry(0.7, 1.0, 0.18), PAL.stone), M(0, 0.45, 0)]]);
  P.grave = [grave()];
  return P;
}
