// The world worker: runs Minecraft's world generator (mcgen.wasm) and turns
// what it makes into meshes, off the page's thread. Bundled on its own and
// started from a blob URL (see gen.js); gen.js can also run it in the page.
import { meshChunk, packBlocks, packBiomes } from './mesher.js';

export function createWorld(post) {
  let ex = null, info = null, biomeColors = null, names = null, atlas = null;
  let air = 0, stone = 1;
  let viewRadius = 4;
  const vols = new Map(); // "cx,cz" -> { lo, hi, data: Uint16Array, biome: Uint8Array }
  const edits = new Map(); // "cx,cz" -> Map("x,y,z" -> id)
  let queue = [];
  let center = [0, 0];
  let scheduled = false;
  const key = (cx, cz) => cx + ',' + cz;

  function init(m) {
    ex = new WebAssembly.Instance(new WebAssembly.Module(m.wasm), {}).exports;
    const text = (k) => new TextDecoder().decode(new Uint8Array(ex.memory.buffer, ex.mc_text(k), ex.mc_text_len()));
    const p = ex.mc_alloc(m.data.byteLength);
    new Uint8Array(ex.memory.buffer, p, m.data.byteLength).set(new Uint8Array(m.data));
    const t0 = Date.now();
    const err = ex.mc_init(p, m.data.byteLength, m.seed[0] >>> 0, m.seed[1] | 0);
    ex.mc_free(p, m.data.byteLength);
    if (err) throw new Error(text(2));
    names = JSON.parse(text(0).replace(/'/g, '"'));
    const biomeNames = JSON.parse(text(1).replace(/'/g, '"'));
    info = packBlocks(names, m.world.blocks);
    biomeColors = packBiomes(biomeNames, m.world.biomes);
    atlas = m.atlas;
    viewRadius = m.radius || 4;
    air = names.indexOf('air');
    stone = names.indexOf('stone');
    for (const [k, list] of Object.entries(m.edits || {})) edits.set(k, new Map(list));
    const packed = ex.mc_spawn();
    post({ t: 'ready', initMs: Date.now() - t0, blocks: names, biomes: biomeNames, spawn: [(packed << 16) >> 16, packed >> 16] });
  }

  function volume(cx, cz) {
    const k = key(cx, cz);
    let v = vols.get(k);
    if (v) return v;
    const q = ex.mc_volume(cx, cz);
    const head = new DataView(ex.memory.buffer, q, 8);
    const lo = head.getInt32(0, true), hi = head.getInt32(4, true);
    const n = (hi - lo + 1) * 256;
    const data = new Uint16Array(n);
    data.set(new Uint16Array(ex.memory.buffer.slice(q + 8, q + 8 + n * 2)));
    const c = ex.mc_chunk(cx, cz);
    const cols = new Uint8Array(ex.memory.buffer, c, 256 * 12);
    const biome = new Uint8Array(256);
    for (let i = 0; i < 256; i++) biome[i] = cols[i * 12 + 9];
    v = { lo, hi, data, biome };
    vols.set(k, v);
    const e = edits.get(k);
    if (e) for (const [pos, id] of e) { const [x, y, z] = pos.split(',').map(Number); setBlock(v, x, y, z, id); }
    return v;
  }

  function setBlock(v, x, y, z, id) {
    if (y > v.hi) grow(v, v.lo, y);
    if (y < v.lo) grow(v, y, v.hi);
    v.data[(y - v.lo) * 256 + z * 16 + x] = id;
  }

  // Widen a volume (a block placed above it, or dug below it): air above,
  // stone below, as the generator's own rule says.
  function grow(v, lo, hi) {
    const data = new Uint16Array((hi - lo + 1) * 256);
    data.fill(air);
    for (let y = lo; y < v.lo; y++) data.fill(stone, (y - lo) * 256, (y - lo + 1) * 256);
    data.set(v.data, (v.lo - lo) * 256);
    v.data = data; v.lo = lo; v.hi = hi;
  }

  function mesh(cx, cz) {
    const around = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.push(volume(cx + dx, cz + dz));
    const me = around[4];
    let lo = me.lo, hi = me.hi;
    for (const v of around) hi = Math.max(hi, Math.min(v.hi, me.hi + 1));
    const get = (x, y, z) => {
      const dx = x < 0 ? -1 : x > 15 ? 1 : 0, dz = z < 0 ? -1 : z > 15 ? 1 : 0;
      const v = around[(dz + 1) * 3 + dx + 1];
      if (y < v.lo) return stone;
      if (y > v.hi) return air;
      return v.data[(y - v.lo) * 256 + (z - dz * 16) * 16 + (x - dx * 16)];
    };
    const t0 = Date.now();
    const m = meshChunk({ get, biomeAt: (x, z) => me.biome[z * 16 + x], info, biomeColors, lo, hi: me.hi, cols: atlas.cols, atlasW: atlas.w, atlasH: atlas.h });
    const bells = [];
    const bell = names.indexOf('bell');
    for (let i = 0; i < me.data.length; i++) {
      if (me.data[i] === bell) bells.push([cx * 16 + (i & 15), me.lo + (i >> 8), cz * 16 + ((i >> 4) & 15)]);
    }
    const vol = me.data.slice();
    const transfer = [vol.buffer];
    for (const layer of ['opaque', 'cutout', 'water']) for (const a of Object.values(m[layer])) transfer.push(a.buffer);
    post({ t: 'mesh', cx, cz, lo: me.lo, hi: me.hi, vol, biome: me.biome.slice(), mesh: m, bells, ms: Date.now() - t0 }, transfer);
  }

  function forget() {
    const [x0, z0] = center;
    for (const k of vols.keys()) {
      const [x, z] = k.split(',').map(Number);
      if (Math.max(Math.abs(x - x0), Math.abs(z - z0)) > viewRadius + 3) vols.delete(k);
    }
    ex.mc_trim(x0, z0, viewRadius + 3);
  }

  function work() {
    scheduled = false;
    const next = queue.shift();
    if (!next) return;
    try {
      mesh(next[0], next[1]);
    } catch (err) {
      post({ t: 'error', msg: String(err && err.message || err) });
    }
    if (queue.length) schedule();
    else forget();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(work, 0);
  }

  return (m) => {
    try {
      if (m.t === 'init') init(m);
      else if (m.t === 'want') {
        // Replaces the queue: the page sends it nearest first.
        queue = m.list;
        center = m.center;
        schedule();
      } else if (m.t === 'edit') {
        const [x, y, z, id] = m.at;
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
        const lx = x - cx * 16, lz = z - cz * 16;
        const k = key(cx, cz);
        if (!edits.has(k)) edits.set(k, new Map());
        edits.get(k).set(`${lx},${y},${lz}`, id);
        setBlock(volume(cx, cz), lx, y, lz, id);
        // Remesh now, and the neighbours that share the edited face.
        const again = [[cx, cz]];
        if (lx === 0) again.push([cx - 1, cz]);
        if (lx === 15) again.push([cx + 1, cz]);
        if (lz === 0) again.push([cx, cz - 1]);
        if (lz === 15) again.push([cx, cz + 1]);
        for (const [ax, az] of again) mesh(ax, az);
      } else if (m.t === 'biomes') {
        post({ t: 'biomes', out: m.points.map(([x, z]) => ex.mc_biome_at(x, 64, z)) });
      }
    } catch (err) {
      post({ t: 'error', msg: String(err && err.message || err) });
    }
  };
}

// In a worker: wire it to messages.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const handle = createWorld((msg, transfer) => postMessage(msg, transfer || []));
  onmessage = (e) => handle(e.data);
}
