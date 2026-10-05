// Turns a chunk of Minecraft blocks into triangles: only faces that can be
// seen, shaded the way Minecraft does it (darker sides and undersides,
// ambient occlusion in corners, shadow wherever the sky is blocked: under
// trees, overhangs, caves). Runs in the worldgen worker.

// Per-block render info, packed by mkassets.py's world.json into an Int32Array
// of INFO fields per block id.
export const INFO = 8;
export const SHAPE = { AIR: 0, CUBE: 1, CROSS: 2, SLAB: 3, FLAT: 4, LIQUID: 5, POST: 6, SMALL: 7 };
export const LAYER = { OPAQUE: 0, CUTOUT: 1, WATER: 2 };
export const TINT = { NONE: 0, GRASS: 1, FOLIAGE: 2, WATER: 3, FIXED: 4 };
const SHAPE_CODE = { cube: 1, cross: 2, slab: 3, flat: 4, liquid: 5, post: 6, small: 7 };
const LAYER_CODE = { opaque: 0, cutout: 1, water: 2 };

/// world.json blocks + the generator's block names -> packed info.
/// Fields: shape, top tile, side tile, bottom tile, flags (1 solid, 2 glows,
/// 4 leaves, 8 snow layer), layer, tint kind, fixed tint rgb.
export function packBlocks(names, blocks) {
  const info = new Int32Array(names.length * INFO);
  names.forEach((name, id) => {
    const b = blocks[name];
    const o = id * INFO;
    if (!b) return; // air
    info[o] = SHAPE_CODE[b.s];
    info[o + 1] = b.f[0]; info[o + 2] = b.f[1]; info[o + 3] = b.f[2];
    info[o + 4] = (b.c ? 1 : 0) | (b.e ? 2 : 0) | (/_leaves$/.test(name) ? 4 : 0) | (name === 'snow' ? 8 : 0);
    info[o + 5] = LAYER_CODE[b.l];
    const t = b.t || '';
    info[o + 6] = t === 'g' ? TINT.GRASS : t === 'f' ? TINT.FOLIAGE : t === 'w' ? TINT.WATER : t ? TINT.FIXED : TINT.NONE;
    info[o + 7] = t.startsWith('#') ? parseInt(t.slice(1), 16) : 0xffffff;
  });
  return info;
}

const hex = (h) => parseInt(h.slice(1), 16);
/// Biome colours as [grass, foliage, water] RGB ints per biome id.
export function packBiomes(names, biomes) {
  return names.map((n) => {
    const b = biomes[n] || { grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4' };
    return [hex(b.grass), hex(b.foliage), hex(b.water)];
  });
}

class Buf {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(p, uv, c, flip) {
    const n = this.n;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.uv.push(uv[i * 2], uv[i * 2 + 1]);
      this.col.push(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
    }
    if (flip) this.idx.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);
    else this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  done() {
    return {
      pos: new Float32Array(this.pos), uv: new Float32Array(this.uv),
      col: new Uint8Array(this.col), idx: new Uint32Array(this.idx),
    };
  }
}

// Faces: normal, 4 corners (counter-clockwise seen from outside, starting
// bottom-left of the texture), shade.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8, tile: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8, tile: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.65, tile: 2 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.65, tile: 2 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1, tile: 1 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, tile: 3 },
];
const AO_LIGHT = [0.45, 0.62, 0.8, 1];
const SKY_SHADOW = 0.58;

/// Mesh chunk (cx, cz). `get(x, y, z)` returns the block id at chunk-local
/// x, z in [-1, 16] and world y; `biomeAt(x, z)` the biome id for x, z in
/// [0, 15]. Returns { opaque, cutout, water } buffers, positions relative
/// to the chunk's corner.
export function meshChunk({ get, biomeAt, info, biomeColors, lo, hi, cols, atlasW, atlasH }) {
  const out = [new Buf(), new Buf(), new Buf()];
  const at = (id, f) => info[id * INFO + f];
  const isOpaqueCube = (id) => at(id, 0) === SHAPE.CUBE && at(id, 5) === LAYER.OPAQUE;
  const occludes = (id) => at(id, 0) === SHAPE.CUBE && (at(id, 5) === LAYER.OPAQUE || (at(id, 4) & 4));

  // Sky: the highest block over each column that blocks light (solid or leaves).
  const top = new Int32Array(18 * 18);
  for (let z = -1; z <= 16; z++) {
    for (let x = -1; x <= 16; x++) {
      let y = hi + 1;
      for (let yy = hi; yy >= lo; yy--) {
        const id = get(x, yy, z);
        if (occludes(id) || at(id, 0) === SHAPE.SLAB) { y = yy; break; }
        if (yy === lo) y = lo - 1;
      }
      top[(z + 1) * 18 + x + 1] = y;
    }
  }
  const skyAt = (x, y, z) => (y > top[(z + 1) * 18 + x + 1] ? 1 : SKY_SHADOW);

  const uvOf = (tile, u0, v0, u1, v1) => {
    const col = tile % cols, row = Math.floor(tile / cols);
    const e = 0.02;
    const x0 = (col * 16 + u0 * 16 + e) / atlasW, x1 = (col * 16 + u1 * 16 - e) / atlasW;
    const y0 = (row * 16 + v0 * 16 + e) / atlasH, y1 = (row * 16 + v1 * 16 - e) / atlasH;
    // bottom-left, bottom-right, top-right, top-left (v grows downward)
    return [x0, y1, x1, y1, x1, y0, x0, y0];
  };
  const tintOf = (id, x, z) => {
    const kind = at(id, 6);
    if (kind === TINT.NONE) return 0xffffff;
    if (kind === TINT.FIXED) return at(id, 7);
    const b = biomeColors[biomeAt(Math.min(15, Math.max(0, x)), Math.min(15, Math.max(0, z)))] || biomeColors[0];
    return b[kind - 1];
  };
  const colour = (rgb, k) => [((rgb >> 16) & 255) * k, ((rgb >> 8) & 255) * k, (rgb & 255) * k];

  const cubeFaces = (id, x, y, z, buf) => {
    const leaves = at(id, 4) & 4;
    const cutout = at(id, 5) !== LAYER.OPAQUE;
    for (const f of FACES) {
      const [nx, ny, nz] = f.n;
      const nb = get(x + nx, y + ny, z + nz);
      if (isOpaqueCube(nb)) continue;
      if (cutout && nb === id && !leaves) continue; // glass next to glass
      if (leaves && (at(nb, 4) & 4)) continue; // leaves next to leaves
      const tile = at(id, f.tile);
      const tint = f.tile === 1 || at(id, 6) !== TINT.GRASS ? tintOf(id, x, z) : 0xffffff;
      const sky = skyAt(x + nx, y + ny, z + nz);
      const p = [], c = [], ao = [];
      for (const corner of f.c) {
        p.push(x + corner[0], y + corner[1], z + corner[2]);
        // Ambient occlusion: the 3 blocks around this corner, in front of the face.
        let s = 0, side = 0;
        const ax = [];
        for (let a = 0; a < 3; a++) if (f.n[a] === 0) ax.push(a);
        const d = [0, 0, 0];
        const off = (a) => (corner[a] ? 1 : -1);
        const cell = (dx, dy, dz) => occludes(get(x + nx + dx, y + ny + dy, z + nz + dz));
        const v1 = [0, 0, 0], v2 = [0, 0, 0];
        v1[ax[0]] = off(ax[0]); v2[ax[1]] = off(ax[1]);
        const s1 = cell(v1[0], v1[1], v1[2]), s2 = cell(v2[0], v2[1], v2[2]);
        d[0] = v1[0] + v2[0]; d[1] = v1[1] + v2[1]; d[2] = v1[2] + v2[2];
        const cr = cell(d[0], d[1], d[2]);
        side = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
        s = AO_LIGHT[side];
        ao.push(side);
        c.push(...colour(tint, f.shade * s * sky));
      }
      buf.quad(p, uvOf(tile, 0, 0, 1, 1), c, ao[0] + ao[2] < ao[1] + ao[3]);
    }
  };

  // Any axis-aligned box, every face (used by slabs, posts, small blocks).
  const box = (id, x, y, z, x0, y0, z0, x1, y1, z1, buf) => {
    const tint = tintOf(id, x, z);
    const sky = skyAt(x, y, z);
    const span = [[x0, x1], [y0, y1], [z0, z1]];
    for (const f of FACES) {
      const [nx, ny, nz] = f.n;
      if (ny === -1 && y0 === 0 && isOpaqueCube(get(x, y - 1, z))) continue;
      const p = [];
      for (const corner of f.c) p.push(x + span[0][corner[0]], y + span[1][corner[1]], z + span[2][corner[2]]);
      // Texture the part of the face this box covers.
      let uv;
      if (ny !== 0) uv = uvOf(at(id, f.tile), x0, z0, x1, z1);
      else uv = uvOf(at(id, f.tile), nx !== 0 ? z0 : x0, 1 - y1, nx !== 0 ? z1 : x1, 1 - y0);
      const k = f.shade * sky;
      const c = colour(tint, k);
      buf.quad(p, uv, [...c, ...c, ...c, ...c], false);
    }
  };

  for (let y = lo; y <= hi; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const id = get(x, y, z);
        const shape = at(id, 0);
        if (shape === SHAPE.AIR) continue;
        const buf = out[at(id, 5)];
        switch (shape) {
          case SHAPE.CUBE: cubeFaces(id, x, y, z, buf); break;
          case SHAPE.SLAB: box(id, x, y, z, 0, 0, 0, 1, 0.5, 1, buf); break;
          case SHAPE.POST: box(id, x, y, z, 0.375, 0, 0.375, 0.625, 1, 0.625, buf); break;
          case SHAPE.SMALL: box(id, x, y, z, 0.2, 0, 0.2, 0.8, 0.7, 0.8, buf); break;
          case SHAPE.FLAT: {
            const h = at(id, 4) & 8 ? 0.125 : 0.0625;
            const tint = tintOf(id, x, z), c = colour(tint, skyAt(x, y, z));
            buf.quad([x, y + h, z + 1, x + 1, y + h, z + 1, x + 1, y + h, z, x, y + h, z], uvOf(at(id, 1), 0, 0, 1, 1), [...c, ...c, ...c, ...c], false);
            break;
          }
          case SHAPE.CROSS: {
            const upper = get(x, y - 1, z) === id;
            const tile = at(id, upper ? 2 : 1);
            const tint = tintOf(id, x, z), c = colour(tint, skyAt(x, y, z));
            const cc = [...c, ...c, ...c, ...c];
            const uv = uvOf(tile, 0, 0, 1, 1);
            buf.quad([x + 0.15, y, z + 0.15, x + 0.85, y, z + 0.85, x + 0.85, y + 1, z + 0.85, x + 0.15, y + 1, z + 0.15], uv, cc, false);
            buf.quad([x + 0.15, y, z + 0.85, x + 0.85, y, z + 0.15, x + 0.85, y + 1, z + 0.15, x + 0.15, y + 1, z + 0.85], uv, cc, false);
            break;
          }
          case SHAPE.LIQUID: {
            const above = get(x, y + 1, z);
            const h = at(above, 0) === SHAPE.LIQUID ? 1 : 0.875;
            const tint = tintOf(id, x, z);
            const tile = at(id, 1);
            if (at(above, 0) !== SHAPE.LIQUID && !isOpaqueCube(above)) {
              const c = colour(tint, skyAt(x, y, z));
              buf.quad([x, y + h, z + 1, x + 1, y + h, z + 1, x + 1, y + h, z, x, y + h, z], uvOf(tile, 0, 0, 1, 1), [...c, ...c, ...c, ...c], false);
            }
            for (const f of FACES) {
              if (f.n[1] !== 0) continue;
              const nb = get(x + f.n[0], y, z + f.n[2]);
              if (at(nb, 0) === SHAPE.LIQUID || isOpaqueCube(nb)) continue;
              const p = [];
              for (const corner of f.c) p.push(x + corner[0], y + corner[1] * h, z + corner[2]);
              const c = colour(tint, f.shade * skyAt(x, y, z));
              buf.quad(p, uvOf(tile, 0, 1 - h, 1, 1), [...c, ...c, ...c, ...c], false);
            }
            break;
          }
          default: break;
        }
      }
    }
  }
  return { opaque: out[0].done(), cutout: out[1].done(), water: out[2].done() };
}
