// Minecraft's world generator (mcgen.wasm, MinecraftOSS) behind one interface.
// It runs in a Web Worker so a new chunk never stalls the game; if the page
// can't start a worker it runs here instead, one chunk per frame at most.

// Everything the generator needs, written so it can also run inside the
// worker (it is sent there as source text, so it must not use anything
// from outside its own body).
function makeGen(wasm, data, seedLo, seedHi) {
  const mod = new WebAssembly.Module(wasm);
  const ex = new WebAssembly.Instance(mod, {}).exports;
  const text = (k) => {
    const p = ex.mc_text(k);
    return new TextDecoder().decode(new Uint8Array(ex.memory.buffer, p, ex.mc_text_len()));
  };
  const p = ex.mc_alloc(data.byteLength);
  new Uint8Array(ex.memory.buffer, p, data.byteLength).set(new Uint8Array(data));
  const t0 = Date.now();
  const err = ex.mc_init(p, data.byteLength, seedLo >>> 0, seedHi | 0);
  ex.mc_free(p, data.byteLength);
  if (err) throw new Error(text(2));
  const packed = ex.mc_spawn();
  return {
    initMs: Date.now() - t0,
    blocks: JSON.parse(text(0).replace(/'/g, '"')),
    biomes: JSON.parse(text(1).replace(/'/g, '"')),
    spawn: [(packed << 16) >> 16, packed >> 16],
    chunk(cx, cz, keepX, keepZ) {
      const q = ex.mc_chunk(cx, cz);
      const out = new Uint8Array(256 * 12);
      out.set(new Uint8Array(ex.memory.buffer, q, out.length));
      // Generated chunks far from the player are dropped; they come back the
      // same from the seed if needed again.
      ex.mc_trim(keepX, keepZ, 4);
      return out.buffer;
    },
    biomeAt(x, y, z) { return ex.mc_biome_at(x, y, z); },
  };
}

const WORKER_SRC = `const makeGen = ${makeGen.toString()};
let gen = null;
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      gen = makeGen(m.wasm, m.data, m.seedLo, m.seedHi);
      postMessage({ t: 'ready', initMs: gen.initMs, blocks: gen.blocks, biomes: gen.biomes, spawn: gen.spawn });
    } else if (m.t === 'chunk') {
      const t0 = Date.now();
      const buf = gen.chunk(m.cx, m.cz, m.kx, m.kz);
      postMessage({ t: 'chunk', cx: m.cx, cz: m.cz, buf, ms: Date.now() - t0 }, [buf]);
    } else if (m.t === 'biomes') {
      postMessage({ t: 'biomes', id: m.id, out: m.points.map(([x, z]) => gen.biomeAt(x, 64, z)) });
    }
  } catch (err) {
    postMessage({ t: 'error', msg: String(err && err.message || err) });
  }
};`;

/// One generated chunk: 256 columns, index z * 16 + x.
export class Chunk {
  constructor(buf) {
    const d = new DataView(buf);
    this.ground = new Uint16Array(256);
    this.gy = new Int16Array(256);
    this.deco = new Uint16Array(256);
    this.canopy = new Uint16Array(256);
    this.lift = new Uint8Array(256);
    this.biome = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const o = i * 12;
      this.ground[i] = d.getUint16(o, true);
      this.gy[i] = d.getInt16(o + 2, true);
      this.deco[i] = d.getUint16(o + 4, true);
      this.canopy[i] = d.getUint16(o + 6, true);
      this.lift[i] = d.getUint8(o + 8);
      this.biome[i] = d.getUint8(o + 9);
    }
  }
}

export class WorldGen {
  constructor() {
    this.chunks = new Map(); // "cx,cz" -> Chunk, most recently used last
    this.wanted = new Map(); // "cx,cz" -> [cx, cz]
    this.inFlight = null;
    this.worker = null;
    this.local = null;
    this.center = [0, 0];
    this.stats = { made: 0, ms: 0, mode: '' };
    this.onChunk = null;
  }

  /// Start the generator for `seed` ([lo, hi] 32-bit halves). Resolves with
  /// the block and biome name tables and the spawn chunk.
  async init(wasm, data, seed) {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const ready = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker timeout')), 60000);
        worker.onmessage = (e) => {
          if (e.data.t === 'ready') { clearTimeout(timer); resolve(e.data); }
          if (e.data.t === 'error') { clearTimeout(timer); reject(new Error(e.data.msg)); }
        };
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'worker failed')); };
        worker.postMessage({ t: 'init', wasm: wasm.slice(0), data: data.slice(0), seedLo: seed[0], seedHi: seed[1] });
      });
      worker.onmessage = (e) => this.fromWorker(e.data);
      this.worker = worker;
      this.stats.mode = 'worker';
      this.stats.initMs = ready.initMs;
      return ready;
    } catch (err) {
      this.workerError = String(err && err.message || err);
    }
    this.local = makeGen(wasm, data, seed[0], seed[1]);
    this.stats.mode = 'page';
    this.stats.initMs = this.local.initMs;
    return this.local;
  }

  key(cx, cz) { return cx + ',' + cz; }

  get(cx, cz) {
    const k = this.key(cx, cz);
    const c = this.chunks.get(k);
    if (c) return c;
    if (!this.wanted.has(k)) this.wanted.set(k, [cx, cz]);
    return null;
  }

  has(cx, cz) { return this.chunks.has(this.key(cx, cz)); }

  /// Ask for every chunk within `r` of (cx, cz); the nearest come first.
  want(cx, cz, r) {
    this.center = [cx, cz];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) this.get(cx + dx, cz + dz);
  }

  store(cx, cz, buf, ms) {
    const k = this.key(cx, cz);
    this.chunks.set(k, new Chunk(buf));
    this.wanted.delete(k);
    this.stats.made++;
    this.stats.ms += ms;
    // Keep the page's copy small: columns of ~2500 chunks (about 30 MB).
    if (this.chunks.size > 2500) {
      const [cx0, cz0] = this.center;
      for (const [key] of this.chunks) {
        const [x, z] = key.split(',').map(Number);
        if (Math.max(Math.abs(x - cx0), Math.abs(z - cz0)) > 6) this.chunks.delete(key);
        if (this.chunks.size <= 2000) break;
      }
    }
    if (this.onChunk) this.onChunk(cx, cz);
  }

  next() {
    const [cx0, cz0] = this.center;
    let best = null, bestD = Infinity;
    for (const [k, [x, z]] of this.wanted) {
      const d = Math.max(Math.abs(x - cx0), Math.abs(z - cz0)) * 100 + Math.abs(x - cx0) + Math.abs(z - cz0);
      // Requests left behind by a long walk are dropped.
      if (Math.max(Math.abs(x - cx0), Math.abs(z - cz0)) > 3) { this.wanted.delete(k); continue; }
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
    return best;
  }

  fromWorker(m) {
    if (m.t === 'chunk') {
      this.inFlight = null;
      this.store(m.cx, m.cz, m.buf, m.ms);
      this.pump();
    } else if (m.t === 'biomes' && this.biomeReply) {
      this.biomeReply(m.out);
    } else if (m.t === 'error') {
      this.error = m.msg;
    }
  }

  /// Keep the generator busy. With a worker one request is in flight at a
  /// time (so priorities stay fresh); on the page, one chunk per call.
  pump() {
    if (this.inFlight) return;
    const n = this.next();
    if (!n) return;
    const [cx, cz] = n;
    if (this.worker) {
      this.inFlight = n;
      this.worker.postMessage({ t: 'chunk', cx, cz, kx: this.center[0], kz: this.center[1] });
    } else {
      const t0 = performance.now();
      const buf = this.local.chunk(cx, cz, this.center[0], this.center[1]);
      this.store(cx, cz, buf, performance.now() - t0);
    }
  }

  /// Biome ids at block points, from the climate noise alone (no chunks).
  async biomesAt(points) {
    if (!this.worker) return points.map(([x, z]) => this.local.biomeAt(x, 64, z));
    return new Promise((resolve) => {
      this.biomeReply = (out) => { this.biomeReply = null; resolve(out); };
      this.worker.postMessage({ t: 'biomes', id: 1, points });
    });
  }

  /// Resolve once chunk (cx, cz) exists.
  async load(cx, cz) {
    this.center = [cx, cz];
    while (!this.get(cx, cz)) {
      this.pump();
      if (this.error) throw new Error(this.error);
      await new Promise((r) => setTimeout(r, this.worker ? 10 : 0));
    }
    return this.get(cx, cz);
  }
}
