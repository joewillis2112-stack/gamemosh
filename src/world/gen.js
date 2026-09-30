// Pure, deterministic world generation: height, biomes, colours, locations, roads.
// No three.js or physics in here so it can be unit tested in Node.
import { Noise2D } from '../core/noise.js';
import { RNG, hashInts, seedFromString } from '../core/rng.js';
import { clamp, lerp, smoothstep, dist2, rgb, mixRgb, segDist } from '../core/util.js';
import { WORLD } from '../config.js';
import { locationName, bossName } from './names.js';

export const BIOMES = {
  moor: { name: 'Ashen Moor', color: rgb(0x5a5639) },
  forest: { name: 'Blackwood', color: rgb(0x2e3826) },
  mire: { name: 'The Mire', color: rgb(0x3a3b27) },
  crags: { name: 'Barrow Crags', color: rgb(0x5b5955) },
  frost: { name: 'Frostspine', color: rgb(0xc4c8cf) },
  blight: { name: 'The Blight', color: rgb(0x4a2724) },
};

const C = {
  heather: rgb(0x4d3f47),
  moorDry: rgb(0x6b6443),
  moss: rgb(0x2b3a24),
  rock: rgb(0x5f5c57),
  darkRock: rgb(0x3c3a38),
  snow: rgb(0xd5d8de),
  shore: rgb(0x524c3b),
  under: rgb(0x2a2821),
  road: rgb(0x4a3d2f),
  ash: rgb(0x3d3836),
  blood: rgb(0x5a2622),
  mud: rgb(0x33301f),
};

export const LOCATION_TYPES = {
  // major: big, one beacon + boss each
  keep: { kind: 'major', flatten: 64, reveal: 90 },
  cathedral: { kind: 'major', flatten: 50, reveal: 80 },
  necropolis: { kind: 'major', flatten: 56, reveal: 80 },
  hamlet: { kind: 'major', flatten: 62, reveal: 85 },
  // minor: scattered
  shrine: { kind: 'minor', flatten: 13, reveal: 40, weight: 13 },
  watchtower: { kind: 'minor', flatten: 12, reveal: 50, weight: 8 },
  stones: { kind: 'minor', flatten: 15, reveal: 40, weight: 8 },
  camp: { kind: 'minor', flatten: 15, reveal: 35, weight: 12 },
  gallows: { kind: 'minor', flatten: 11, reveal: 35, weight: 6 },
  wreck: { kind: 'minor', flatten: 10, reveal: 30, weight: 8 },
  cairn: { kind: 'minor', flatten: 8, reveal: 25, weight: 7 },
  crypt: { kind: 'minor', flatten: 13, reveal: 35, weight: 7 },
};

const MAJOR_ORDER = ['keep', 'cathedral', 'necropolis', 'hamlet', 'keep', 'necropolis'];
const BOSS_KINDS = ['warden', 'knight', 'witch', 'beast'];

export class WorldGen {
  constructor(seedString) {
    this.seedString = String(seedString);
    this.seed = seedFromString(this.seedString);
    const s = this.seed;
    this.nBase = new Noise2D(hashInts(s, 1));
    this.nHill = new Noise2D(hashInts(s, 2));
    this.nMtn = new Noise2D(hashInts(s, 3));
    this.nRidge = new Noise2D(hashInts(s, 4));
    this.nMoist = new Noise2D(hashInts(s, 5));
    this.nBlight = new Noise2D(hashInts(s, 6));
    this.nDetail = new Noise2D(hashInts(s, 7));
    this.nWarp = new Noise2D(hashInts(s, 8));

    this.locations = [];
    this.roads = [];
    this.grid = new Map(); // spatial hash of locations for fast flatten lookups
    this.roadGrid = new Map();
    this.GRID = 128;
    this._placeLocations();
    this._buildRoads();
  }

  // ---------- height ----------
  rawHeight(x, z) {
    const wx = x + this.nWarp.get(x * 0.002, z * 0.002) * 60;
    const wz = z + this.nWarp.get(x * 0.002 + 50, z * 0.002 + 50) * 60;
    const cont = this.nBase.fbm(wx * 0.0014, wz * 0.0014, 4);
    let h = 16 + cont * 24;
    h += this.nHill.fbm(wx * 0.006, wz * 0.006, 4) * 7;
    const mMask = smoothstep(0.0, 0.5, this.nMtn.fbm(x * 0.0011 + 17, z * 0.0011 - 9, 3));
    if (mMask > 0) {
      const r = this.nRidge.ridged(wx * 0.0042, wz * 0.0042, 5);
      h += mMask * Math.pow(r, 1.35) * 118;
    }
    h += this.nDetail.get(x * 0.07, z * 0.07) * 0.5;
    // Sea at the world's edge
    const e = Math.max(Math.abs(x), Math.abs(z)) / WORLD.HALF;
    const edge = smoothstep(0.8, 0.97, e);
    h = lerp(h, -28, edge);
    return h;
  }

  height(x, z) {
    let h = this.rawHeight(x, z);
    const cell = this.grid.get(this._key(x, z));
    if (cell) {
      for (const loc of cell) {
        const d = dist2(x, z, loc.x, loc.z);
        const R = loc.flatten;
        if (d < R) {
          const t = smoothstep(R, R * 0.55, d);
          h = lerp(h, loc.y, t);
        }
      }
    }
    return h;
  }

  slopeAt(x, z, e = 2) {
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return Math.sqrt(hx * hx + hz * hz) / (2 * e);
  }

  moisture(x, z) {
    return this.nMoist.fbm(x * 0.0021 + 300, z * 0.0021 - 120, 3);
  }
  blight(x, z) {
    return this.nBlight.fbm(x * 0.0016 - 500, z * 0.0016 + 80, 3);
  }

  biomeAt(x, z, h = this.height(x, z)) {
    const m = this.moisture(x, z);
    const b = this.blight(x, z);
    if (h > 72) return 'frost';
    if (h > 46) return 'crags';
    if (b > 0.42) return 'blight';
    if (h < 3.5 && m > -0.25) return 'mire';
    if (m > 0.12) return 'forest';
    return 'moor';
  }

  // Blended ground colour. slope is rise/run.
  colorAt(x, z, h, slope) {
    const m = this.moisture(x, z);
    const b = this.blight(x, z);
    const n = this.nDetail.get(x * 0.11, z * 0.11);
    const n2 = this.nDetail.get(x * 0.02 + 40, z * 0.02);
    let c = mixRgb(C.moorDry, C.heather, smoothstep(-0.3, 0.4, n2));
    c = mixRgb(c, C.moss, smoothstep(0.05, 0.3, m));
    c = mixRgb(c, C.mud, smoothstep(4, 1.5, h) * smoothstep(-0.3, 0, m));
    c = mixRgb(c, C.shore, smoothstep(1.6, 0.4, h));
    c = mixRgb(c, C.under, smoothstep(0, -2, h));
    c = mixRgb(c, mixRgb(C.ash, C.blood, smoothstep(0.5, 0.7, b)), smoothstep(0.35, 0.5, b));
    c = mixRgb(c, C.rock, smoothstep(40, 55, h));
    c = mixRgb(c, C.darkRock, smoothstep(0.55, 0.95, slope));
    c = mixRgb(c, C.snow, smoothstep(68, 80, h + n * 5) * (1 - smoothstep(0.8, 1.2, slope)));
    // Old roads
    const road = this.roadFactor(x, z);
    if (road > 0) c = mixRgb(c, C.road, road * 0.85);
    const k = 1 + n * 0.07;
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  roadFactor(x, z) {
    const cell = this.roadGrid.get(this._key(x, z));
    if (!cell) return 0;
    let best = 99;
    for (const r of cell) {
      const d = segDist(x, z, r.ax, r.az, r.bx, r.bz);
      if (d < best) best = d;
    }
    const wobble = this.nDetail.get(x * 0.15, z * 0.15) * 0.8;
    return smoothstep(2.6 + wobble, 1.2, best);
  }

  // ---------- locations ----------
  _key(x, z) {
    return `${Math.floor(x / this.GRID)},${Math.floor(z / this.GRID)}`;
  }

  _addToGrid(loc) {
    const R = loc.flatten;
    const x0 = Math.floor((loc.x - R) / this.GRID), x1 = Math.floor((loc.x + R) / this.GRID);
    const z0 = Math.floor((loc.z - R) / this.GRID), z1 = Math.floor((loc.z + R) / this.GRID);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const k = `${gx},${gz}`;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(loc);
      }
    }
  }

  _rawSlope(x, z, r) {
    let mn = Infinity, mx = -Infinity;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const h = this.rawHeight(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    return mx - mn;
  }

  _tooClose(x, z, minMajor, minMinor) {
    for (const l of this.locations) {
      const d = dist2(x, z, l.x, l.z);
      if (d < (l.kind === 'major' ? minMajor : minMinor)) return true;
    }
    return false;
  }

  _makeLocation(rng, type, x, z) {
    const def = LOCATION_TYPES[type];
    const y = Math.max(this.rawHeight(x, z), 1.5);
    const loc = {
      id: this.locations.length,
      type,
      kind: def.kind,
      x, z, y,
      flatten: def.flatten,
      reveal: def.reveal,
      rot: Math.round(rng.range(0, 4)) * (Math.PI / 2) + rng.range(-0.25, 0.25),
      seed: hashInts(this.seed, 1000 + this.locations.length),
      name: '',
    };
    const nameRng = new RNG(hashInts(loc.seed, 77));
    loc.name = locationName(nameRng, type);
    if (loc.kind === 'major') {
      loc.bossKind = BOSS_KINDS[(this.locations.filter((l) => l.kind === 'major').length + (this.seed % 4)) % 4];
      this.usedBossFirst = this.usedBossFirst || new Set();
      for (let i = 0; i < 20; i++) {
        loc.bossName = bossName(nameRng, loc.bossKind);
        if (!this.usedBossFirst.has(loc.bossName.split(',')[0])) break;
      }
      this.usedBossFirst.add(loc.bossName.split(',')[0]);
    }
    this.locations.push(loc);
    this._addToGrid(loc);
    return loc;
  }

  _placeLocations() {
    const rng = new RNG(hashInts(this.seed, 99));
    // Starting shrine near the centre on flat, dry ground
    let start = null;
    for (let i = 0; i < 400 && !start; i++) {
      const r = 20 + i * 1.5;
      const a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.rawHeight(x, z);
      if (h > 3 && h < 40 && this._rawSlope(x, z, 10) < 4) start = [x, z];
    }
    if (!start) start = [0, 0];
    this.spawn = this._makeLocation(rng, 'shrine', start[0], start[1]);
    this.spawn.isSpawn = true;
    this.spawn.name = 'Shrine of First Embers';

    // Major locations, spread far apart and away from spawn
    const lim = WORLD.HALF * 0.74;
    for (let m = 0; m < WORLD.MAJOR_COUNT; m++) {
      const type = MAJOR_ORDER[m % MAJOR_ORDER.length];
      let placed = false;
      for (let tries = 0; tries < 3000 && !placed; tries++) {
        const spread = tries < 1500 ? 430 : 300;
        const x = rng.range(-lim, lim), z = rng.range(-lim, lim);
        if (dist2(x, z, this.spawn.x, this.spawn.z) < 230) continue;
        if (this._tooClose(x, z, spread, 90)) continue;
        const h = this.rawHeight(x, z);
        if (h < 4 || h > 55) continue;
        if (this._rawSlope(x, z, 30) > 16) continue;
        this._makeLocation(rng, type, x, z);
        placed = true;
      }
    }

    // Minor locations
    const types = Object.entries(LOCATION_TYPES).filter(([, d]) => d.kind === 'minor').map(([t, d]) => [t, d.weight]);
    const minorLim = WORLD.HALF * 0.82;
    let count = 0;
    for (let tries = 0; tries < 12000 && count < WORLD.MINOR_COUNT; tries++) {
      const x = rng.range(-minorLim, minorLim), z = rng.range(-minorLim, minorLim);
      if (this._tooClose(x, z, 150, 85)) continue;
      const h = this.rawHeight(x, z);
      if (h < 2.5 || h > 78) continue;
      if (this._rawSlope(x, z, 10) > 7) continue;
      const type = rng.weighted(types);
      this._makeLocation(rng, type, x, z);
      count++;
    }
  }

  _buildRoads() {
    // Minimum spanning tree over majors + spawn, then connect some shrines to nearest node
    const nodes = this.locations.filter((l) => l.kind === 'major' || l.isSpawn);
    const inTree = [nodes[0]];
    const rest = nodes.slice(1);
    const segs = [];
    while (rest.length) {
      let best = null;
      for (const a of inTree) for (const b of rest) {
        const d = dist2(a.x, a.z, b.x, b.z);
        if (!best || d < best.d) best = { a, b, d };
      }
      segs.push([best.a, best.b]);
      inTree.push(best.b);
      rest.splice(rest.indexOf(best.b), 1);
    }
    for (const l of this.locations) {
      if (l.kind !== 'minor' || l.isSpawn) continue;
      if (!['shrine', 'camp', 'wreck', 'gallows', 'watchtower'].includes(l.type)) continue;
      let best = null;
      for (const n of nodes) {
        const d = dist2(l.x, l.z, n.x, n.z);
        if (!best || d < best.d) best = { n, d };
      }
      if (best && best.d < 380) segs.push([l, best.n]);
    }
    // Subdivide each road into wobbly pieces that avoid water/mountains a little
    const rng = new RNG(hashInts(this.seed, 555));
    for (const [a, b] of segs) {
      const n = Math.max(2, Math.floor(dist2(a.x, a.z, b.x, b.z) / 40));
      let px = a.x, pz = a.z;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        let x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
        if (i < n) {
          const nx = -(b.z - a.z), nz = b.x - a.x;
          const len = Math.hypot(nx, nz) || 1;
          const off = Math.sin(t * Math.PI) * rng.range(-18, 18);
          x += (nx / len) * off; z += (nz / len) * off;
        }
        const seg = { ax: px, az: pz, bx: x, bz: z };
        this.roads.push(seg);
        this._addRoadToGrid(seg);
        px = x; pz = z;
      }
    }
  }

  _addRoadToGrid(seg) {
    const pad = 4;
    const x0 = Math.floor((Math.min(seg.ax, seg.bx) - pad) / this.GRID);
    const x1 = Math.floor((Math.max(seg.ax, seg.bx) + pad) / this.GRID);
    const z0 = Math.floor((Math.min(seg.az, seg.bz) - pad) / this.GRID);
    const z1 = Math.floor((Math.max(seg.az, seg.bz) + pad) / this.GRID);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = `${gx},${gz}`;
      if (!this.roadGrid.has(k)) this.roadGrid.set(k, []);
      this.roadGrid.get(k).push(seg);
    }
  }

  locationsNear(x, z, r) {
    return this.locations.filter((l) => dist2(x, z, l.x, l.z) < r);
  }

  // Difficulty grows with distance from the starting shrine
  dangerAt(x, z) {
    const d = dist2(x, z, this.spawn.x, this.spawn.z);
    return 1 + Math.floor(clamp(d / 170, 0, 6));
  }
}
