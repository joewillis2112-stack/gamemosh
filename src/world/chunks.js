// Streams terrain chunks (mesh + heightfield collider + merged vegetation) around the player.
import * as THREE from 'three';
import { R } from '../physics.js';
import { WORLD } from '../config.js';
import { RNG, hashInts } from '../core/rng.js';
import { MeshKit } from './meshkit.js';
import { dist2 } from '../core/util.js';

const VEG = {
  // [protoKey, weight, collider: 'tree'|'rock'|null, scale range]
  forest: [['pine', 30, 'tree', [0.8, 1.3]], ['dead', 8, 'tree', [0.8, 1.2]], ['rock', 3, 'rock', [0.5, 1.4]], ['shrub', 12, null, [0.7, 1.3]], ['bones', 1, null, [1, 1]], [null, 18]],
  moor: [['dead', 3, 'tree', [0.8, 1.2]], ['pine', 1.5, 'tree', [0.8, 1.1]], ['rock', 5, 'rock', [0.4, 1.6]], ['shrub', 14, null, [0.6, 1.2]], ['bones', 0.6, null, [1, 1]], [null, 50]],
  mire: [['dead', 6, 'tree', [0.7, 1.1]], ['reeds', 26, null, [0.8, 1.4]], ['shrub', 4, null, [0.6, 1]], [null, 30]],
  crags: [['rock', 16, 'rock', [0.6, 2.4]], ['pine', 2, 'tree', [0.7, 1]], ['shrub', 3, null, [0.5, 0.9]], [null, 40]],
  frost: [['snowPine', 7, 'tree', [0.7, 1.2]], ['rock', 8, 'rock', [0.6, 2]], [null, 50]],
  blight: [['paleDead', 10, 'tree', [0.8, 1.3]], ['redRock', 6, 'rock', [0.5, 1.6]], ['bones', 3, null, [1, 1.2]], ['shrub', 2, null, [0.5, 0.8]], [null, 40]],
};

export class ChunkManager {
  constructor(scene, physics, gen, protos) {
    this.scene = scene;
    this.physics = physics;
    this.gen = gen;
    this.protos = protos;
    this.chunks = new Map();
    this.queue = [];
    this.viewChunks = 4;
    this.vegDensity = 0.8;
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.vegMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.harvested = new Set(); // "cx,cz,i" of chopped trees this session
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  update(px, pz, budgetMs = 6) {
    const C = WORLD.CHUNK;
    const pcx = Math.floor(px / C), pcz = Math.floor(pz / C);
    const r = this.viewChunks;
    const want = new Set();
    const maxIdx = Math.ceil(WORLD.HALF / C) + 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > (r + 0.5) * (r + 0.5)) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (Math.abs(cx + 0.5) > maxIdx || Math.abs(cz + 0.5) > maxIdx) continue;
        const k = this.key(cx, cz);
        want.add(k);
        if (!this.chunks.has(k)) this.chunks.set(k, { cx, cz, state: 'queued', d: dx * dx + dz * dz });
      }
    }
    // Unload far chunks
    for (const [k, ch] of this.chunks) {
      if (!want.has(k)) {
        const dx = ch.cx - pcx, dz = ch.cz - pcz;
        if (dx * dx + dz * dz > (r + 1.5) * (r + 1.5)) this._unload(k, ch);
      }
    }
    // Build nearest pending chunks within the time budget
    const t0 = performance.now();
    const pending = [];
    for (const ch of this.chunks.values()) {
      if (ch.state === 'queued') {
        const dx = ch.cx - pcx, dz = ch.cz - pcz;
        ch.d = dx * dx + dz * dz;
        pending.push(ch);
      }
    }
    pending.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const ch of pending) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      this._build(ch);
      built++;
    }
    return pending.length - built;
  }

  // Everything within dist has a collider (used before spawning the player)
  readyAround(px, pz) {
    const C = WORLD.CHUNK;
    const ch = this.chunks.get(this.key(Math.floor(px / C), Math.floor(pz / C)));
    return ch && ch.state === 'ready';
  }

  _build(ch) {
    const { gen } = this;
    const C = WORLD.CHUNK, N = WORLD.RES, step = C / N;
    const ox = ch.cx * C, oz = ch.cz * C;
    const V = N + 1;
    // Heights with a 1-vertex border for seamless normals
    const B = V + 2;
    const H = new Float32Array(B * B);
    for (let j = 0; j < B; j++) {
      for (let i = 0; i < B; i++) {
        H[j * B + i] = gen.height(ox + (i - 1) * step, oz + (j - 1) * step);
      }
    }
    const pos = new Float32Array(V * V * 3);
    const nor = new Float32Array(V * V * 3);
    const col = new Float32Array(V * V * 3);
    const hf = new Float32Array(V * V);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const h = H[(j + 1) * B + (i + 1)];
        const idx = j * V + i;
        const x = ox + i * step, z = oz + j * step;
        pos[idx * 3] = i * step; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = j * step;
        const hl = H[(j + 1) * B + i], hr = H[(j + 1) * B + i + 2];
        const hd = H[j * B + i + 1], hu = H[(j + 2) * B + i + 1];
        let nx = hl - hr, ny = 2 * step, nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        nor[idx * 3] = nx; nor[idx * 3 + 1] = ny; nor[idx * 3 + 2] = nz;
        const slope = Math.sqrt(nx * nx + nz * nz) / Math.max(ny, 0.05);
        const c = gen.colorAt(x, z, h, slope);
        col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
        // Rapier heightfield: row index = z, column index = x, column-major
        hf[j + i * V] = h;
      }
    }
    const index = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
        // alternate diagonal to reduce streaks
        if ((i + j) & 1) index.push(a, c, b, b, c, d);
        else index.push(a, c, d, a, d, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(ox, 0, oz);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    ch.mesh = mesh;

    const desc = R.ColliderDesc.heightfield(N, N, hf, { x: C, y: 1, z: C }).setTranslation(ox + C / 2, 0, oz + C / 2).setFriction(0.8);
    ch.collider = this.physics.fixed(desc, { kind: 'ground' });

    this._buildVegetation(ch, H, B, step);
    ch.state = 'ready';
  }

  _buildVegetation(ch, H, B, step) {
    const { gen } = this;
    const C = WORLD.CHUNK;
    const ox = ch.cx * C, oz = ch.cz * C;
    const rng = new RNG(hashInts(gen.seed, ch.cx, ch.cz, 31));
    const kit = new MeshKit();
    ch.vegColliders = [];
    const nearLocs = gen.locationsNear(ox + C / 2, oz + C / 2, C + 80);
    const attempts = Math.floor(70 * this.vegDensity);
    for (let a = 0; a < attempts; a++) {
      const lx = rng.next() * C, lz = rng.next() * C;
      const roll = rng.next(), sroll = rng.next(), vroll = rng.next(), rot = rng.next() * Math.PI * 2;
      const x = ox + lx, z = oz + lz;
      const i = Math.round(lx / step) + 1, j = Math.round(lz / step) + 1;
      const h = H[j * B + i];
      if (h < 0.3) continue;
      const hl = H[j * B + i - 1], hr = H[j * B + i + 1], hd = H[(j - 1) * B + i], hu = H[(j + 1) * B + i];
      const slope = Math.max(Math.abs(hr - hl), Math.abs(hu - hd)) / (2 * step);
      if (slope > 1.1) continue;
      let blocked = false;
      for (const l of nearLocs) {
        if (dist2(x, z, l.x, l.z) < l.flatten * 0.8) { blocked = true; break; }
      }
      if (blocked) continue;
      if (gen.roadFactor(x, z) > 0.2) continue;
      const biome = gen.biomeAt(x, z, h);
      const table = VEG[biome];
      let total = 0;
      for (const e of table) total += e[1];
      let r = roll * total, entry = table[table.length - 1];
      for (const e of table) { r -= e[1]; if (r <= 0) { entry = e; break; } }
      if (!entry[0]) continue;
      const [key, , colKind, sr] = entry;
      if (colKind !== 'rock' && slope > 0.7) continue;
      if (this.harvested.has(`${ch.cx},${ch.cz},${a}`)) continue;
      const variants = this.protos[key];
      const proto = variants[Math.floor(vroll * variants.length)];
      const s = sr[0] + (sr[1] - sr[0]) * sroll;
      const tint = 0.85 + sroll * 0.3;
      kit.addAt(proto, lx, h - 0.15, lz, rot, s, s, s, tint);
      if (colKind === 'tree') {
        const cd = R.ColliderDesc.cylinder(2, 0.28 * s).setTranslation(x, h + 2, z);
        ch.vegColliders.push(this.physics.fixed(cd, { kind: 'tree', chunk: ch, idx: a, x, z, h }));
      } else if (colKind === 'rock' && s > 0.7) {
        const cd = R.ColliderDesc.ball(0.8 * s).setTranslation(x, h - 0.1, z);
        ch.vegColliders.push(this.physics.fixed(cd, { kind: 'rock', x, z, h }));
      }
    }
    if (!kit.empty) {
      const m = new THREE.Mesh(kit.build(), this.vegMat);
      m.position.set(ox, 0, oz);
      m.castShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.scene.add(m);
      ch.veg = m;
    }
  }

  // Remove a chopped tree: rebuild that chunk's vegetation
  fellTree(info) {
    const ch = info.chunk;
    this.harvested.add(`${ch.cx},${ch.cz},${info.idx}`);
    if (ch.state !== 'ready') return;
    for (const c of ch.vegColliders) this.physics.removeCollider(c);
    if (ch.veg) { this.scene.remove(ch.veg); ch.veg.geometry.dispose(); ch.veg = null; }
    const C = WORLD.CHUNK, N = WORLD.RES, step = C / N, B = N + 3;
    const H = new Float32Array(B * B);
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) H[j * B + i] = this.gen.height(ch.cx * C + (i - 1) * step, ch.cz * C + (j - 1) * step);
    this._buildVegetation(ch, H, B, step);
  }

  _unload(k, ch) {
    if (ch.mesh) { this.scene.remove(ch.mesh); ch.mesh.geometry.dispose(); }
    if (ch.veg) { this.scene.remove(ch.veg); ch.veg.geometry.dispose(); }
    if (ch.collider) this.physics.removeCollider(ch.collider);
    if (ch.vegColliders) for (const c of ch.vegColliders) this.physics.removeCollider(c);
    ch.state = 'gone';
    this.chunks.delete(k);
  }

  clear() {
    for (const [k, ch] of [...this.chunks]) this._unload(k, ch);
  }
}
