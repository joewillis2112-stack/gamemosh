// The page's side of the world worker (worker.js): starts it from a blob URL
// so the whole game stays one file, or runs it on the page if the browser
// won't start a worker. Keeps every meshed chunk's blocks for collision.
import { createWorld } from './worker.js';

/* global __WORKER_SRC__ */
const WORKER_SRC = typeof __WORKER_SRC__ === 'string' ? __WORKER_SRC__ : '';

export class World {
  constructor() {
    this.chunks = new Map(); // "cx,cz" -> { lo, hi, vol, biome }
    this.sent = new Set(); // chunks asked for and not yet back
    this.onMesh = null;
    this.onError = null;
    this.mode = '';
    this.stats = { meshes: 0, ms: 0 };
  }

  async init({ wasm, data, seed, world, atlas, radius, edits }) {
    const msg = { t: 'init', wasm, data, seed, world: { blocks: world.blocks, biomes: world.biomes }, atlas, radius, edits };
    const ready = await new Promise((resolve, reject) => {
      const onMessage = (m) => {
        if (m.t === 'ready') resolve(m);
        else if (m.t === 'error') (this.readyDone ? this.onError && this.onError(m.msg) : reject(new Error(m.msg)));
        else this.receive(m);
      };
      let worker = null;
      try {
        if (!WORKER_SRC) throw new Error('no worker source');
        worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
        worker.onmessage = (e) => onMessage(e.data);
        worker.onerror = (e) => {
          // A worker that can't start: run the world on this thread instead.
          if (this.mode === 'worker' && !this.readyDone) { worker.terminate(); this.startLocal(msg, onMessage); }
          else if (this.onError) this.onError(e.message || 'world worker failed');
        };
        this.mode = 'worker';
        worker.postMessage({ ...msg, wasm: wasm.slice(0), data: data.slice(0) });
        this.worker = worker;
      } catch (err) {
        this.workerError = String(err && err.message || err);
        this.startLocal(msg, onMessage);
      }
    });
    this.readyDone = true;
    return ready;
  }

  startLocal(msg, onMessage) {
    this.mode = 'page';
    this.worker = null;
    const handle = createWorld((m) => onMessage(m));
    this.local = handle;
    handle(msg);
  }

  post(m) { if (this.worker) this.worker.postMessage(m); else this.local(m); }

  receive(m) {
    if (m.t === 'mesh') {
      const k = m.cx + ',' + m.cz;
      this.sent.delete(k);
      this.chunks.set(k, { lo: m.lo, hi: m.hi, vol: m.vol, biome: m.biome, bells: m.bells });
      this.stats.meshes++;
      this.stats.ms += m.ms;
      if (this.onMesh) this.onMesh(m);
    } else if (m.t === 'biomes' && this.biomeReply) {
      this.biomeReply(m.out);
    } else if (m.t === 'error' && this.onError) {
      this.onError(m.msg);
    }
  }

  /// Ask for every chunk within `r` of (cx, cz) not yet meshed, nearest first.
  want(cx, cz, r) {
    const list = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const k = (cx + dx) + ',' + (cz + dz);
      if (!this.chunks.has(k)) list.push([cx + dx, cz + dz]);
    }
    list.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
    const sig = list.slice(0, 6).join(';') + '|' + cx + ',' + cz;
    if (sig === this.lastWant) return list.length;
    this.lastWant = sig;
    this.post({ t: 'want', list, center: [cx, cz] });
    return list.length;
  }

  /// Drop chunks farther than `r` from (cx, cz); returns their keys.
  drop(cx, cz, r) {
    const gone = [];
    for (const k of this.chunks.keys()) {
      const [x, z] = k.split(',').map(Number);
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > r) { this.chunks.delete(k); gone.push(k); }
    }
    if (gone.length) this.lastWant = '';
    return gone;
  }

  /// The block id at world (x, y, z), or -1 where nothing is loaded.
  block(x, y, z) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(cx + ',' + cz);
    if (!c) return -1;
    if (y < c.lo) return this.stone;
    if (y > c.hi) return this.air;
    return c.vol[(y - c.lo) * 256 + (z - cz * 16) * 16 + (x - cx * 16)];
  }

  biomeAt(x, z) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(cx + ',' + cz);
    return c ? c.biome[(z - cz * 16) * 16 + (x - cx * 16)] : -1;
  }

  /// Change a block here and in the worker (which remeshes).
  set(x, y, z, id) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(cx + ',' + cz);
    if (c && y >= c.lo && y <= c.hi) c.vol[(y - c.lo) * 256 + (z - cz * 16) * 16 + (x - cx * 16)] = id;
    this.post({ t: 'edit', at: [x, y, z, id] });
  }

  async biomesAt(points) {
    return new Promise((resolve) => {
      this.biomeReply = (out) => { this.biomeReply = null; resolve(out); };
      this.post({ t: 'biomes', points });
    });
  }
}
