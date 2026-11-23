// Roblox's binary model format (.rbxm), read: the instance tree with its properties, from the
// format as rbx-dom documents it (header; META, SSTR, INST, PROP, PRNT, END chunks, each raw, LZ4 or
// zstd; interleaved big-endian arrays; zigzag ints; Roblox's rotated floats; CFrame's 24 special
// rotations). Types not read here (rare in models: Faces, Axes, NumberSequence, Rect, PhysicalProperties,
// Ray, Font, ...) leave that property out. A gzipped file is unzipped first.
//   node tools/rbxm.mjs <file.rbxm>     the tree as JSON
import fs from 'node:fs';
import zlib from 'node:zlib';

function lz4(src, size) {
  const out = new Uint8Array(size);
  let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++];
    let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    out.set(src.subarray(i, i + lit), o); i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    let len = token & 15;
    if (len === 15) { let b; do { b = src[i++]; len += b; } while (b === 255); }
    len += 4;
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  return out;
}

class Reader {
  constructor(buf) { this.b = buf; this.i = 0; this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  u8() { return this.b[this.i++]; }
  u32() { const x = this.v.getUint32(this.i, true); this.i += 4; return x; }
  f32() { const x = this.v.getFloat32(this.i, true); this.i += 4; return x; }
  f64() { const x = this.v.getFloat64(this.i, true); this.i += 8; return x; }
  str() { const n = this.u32(); const s = Buffer.from(this.b.subarray(this.i, this.i + n)); this.i += n; return s; }
  // n interleaved big-endian 4-byte values (all first bytes, then all second bytes...).
  inter(n) { const out = new Uint32Array(n), b = this.b, i0 = this.i; for (let k = 0; k < n; k++) out[k] = ((b[i0 + k] << 24) | (b[i0 + n + k] << 16) | (b[i0 + 2 * n + k] << 8) | b[i0 + 3 * n + k]) >>> 0; this.i += 4 * n; return out; }
  ints(n) { return Array.from(this.inter(n), u => (u >>> 1) ^ -(u & 1)); } // zigzag
  floats(n) { const f = new Float32Array(1), u = new Uint32Array(f.buffer); return Array.from(this.inter(n), x => { u[0] = (x >>> 1) | ((x & 1) << 31); return f[0]; }); }
  refs(n) { const d = this.ints(n); let acc = 0; return d.map(x => (acc += x)); }
}

// CFrame's special rotation ids (0x02..0x23): rows are two NormalIds (Right, Top, Back, Left, Bottom,
// Front) and their cross product.
const NORMALS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
function special(id) {
  const a = NORMALS[Math.floor((id - 1) / 6)], b = NORMALS[(id - 1) % 6];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return [...a, ...b, ...c];
}

function values(r, type, n, sstr) {
  switch (type) {
    case 0x01: return Array.from({ length: n }, () => r.str().toString('utf8'));
    case 0x02: return Array.from({ length: n }, () => !!r.u8());
    case 0x03: return r.ints(n);
    case 0x04: return r.floats(n);
    case 0x05: return Array.from({ length: n }, () => r.f64());
    case 0x06: { const s = r.floats(n), o = r.ints(n); return s.map((v, k) => ({ UDim: [v, o[k]] })); }
    case 0x07: { const sx = r.floats(n), sy = r.floats(n), ox = r.ints(n), oy = r.ints(n); return sx.map((v, k) => ({ UDim2: [v, ox[k], sy[k], oy[k]] })); }
    case 0x0C: { const a = r.floats(n), b = r.floats(n), c = r.floats(n); return a.map((v, k) => ({ Color3: [v, b[k], c[k]] })); }
    case 0x0E: { const x = r.floats(n), y = r.floats(n), z = r.floats(n); return x.map((v, k) => ({ Vector3: [v, y[k], z[k]] })); }
    case 0x10: {
      const rot = Array.from({ length: n }, () => { const id = r.u8(); return id === 0 ? Array.from({ length: 9 }, () => r.f32()) : special(id); });
      const x = r.floats(n), y = r.floats(n), z = r.floats(n);
      return rot.map((m, k) => ({ CFrame: [x[k], y[k], z[k], ...m] }));
    }
    case 0x12: return Array.from(r.inter(n), v => ({ Enum: v }));
    case 0x13: return r.refs(n).map(v => ({ Ref: v }));
    case 0x1A: { const a = r.b.subarray(r.i, r.i + n), b = r.b.subarray(r.i + n, r.i + 2 * n), c = r.b.subarray(r.i + 2 * n, r.i + 3 * n); r.i += 3 * n; return Array.from(a, (v, k) => ({ Color3: [v / 255, b[k] / 255, c[k] / 255] })); }
    case 0x1C: return Array.from(r.inter(n), k => ({ SharedString: sstr[k] && sstr[k].length }));
    default: return null; // a type not read here
  }
}

/** The instances: [{ ref, ClassName, props, parent (ref or -1) }], in file order. */
export function parseRbxm(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  if (buf.subarray(0, 8).toString() !== '<roblox!') throw new Error('not a binary Roblox model');
  let i = 32;
  const classes = new Map(), byRef = new Map(), sstr = [];
  while (i < buf.length) {
    const name = buf.subarray(i, i + 4).toString('latin1').replace(/\0+$/, ''), clen = buf.readUInt32LE(i + 4), ulen = buf.readUInt32LE(i + 8);
    i += 16;
    let data;
    if (clen === 0) { data = buf.subarray(i, i + ulen); i += ulen; }
    else {
      const raw = buf.subarray(i, i + clen); i += clen;
      data = raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd ? zlib.zstdDecompressSync(raw) : lz4(raw, ulen);
    }
    const r = new Reader(new Uint8Array(data.buffer ? data : data));
    if (name === 'END') break;
    if (name === 'SSTR') { r.u32(); const n = r.u32(); for (let k = 0; k < n; k++) { r.i += 16; sstr.push(r.str()); } }
    else if (name === 'INST') {
      const id = r.u32(), cls = r.str().toString(), fmt = r.u8(), n = r.u32(), refs = r.refs(n);
      classes.set(id, { cls, refs });
      for (const ref of refs) byRef.set(ref, { ref, ClassName: cls, props: {}, parent: -1 });
    } else if (name === 'PROP') {
      const id = r.u32(), prop = r.str().toString(), type = r.u8(), c = classes.get(id);
      const vals = values(r, type, c.refs.length, sstr);
      if (vals) c.refs.forEach((ref, k) => { byRef.get(ref).props[prop] = vals[k]; });
    } else if (name === 'PRNT') {
      r.u8(); const n = r.u32(), kids = r.refs(n), parents = r.refs(n);
      kids.forEach((k, j) => { byRef.get(k).parent = parents[j]; });
    }
  }
  return [...byRef.values()];
}

/** As a tree of { ClassName, Name, props, children }. */
export function rbxmTree(buf) {
  const list = parseRbxm(buf), map = new Map(list.map(x => [x.ref, { ClassName: x.ClassName, Name: x.props.Name, props: x.props, children: [] }])), roots = [];
  for (const x of list) (x.parent >= 0 && map.has(x.parent) ? map.get(x.parent).children : roots).push(map.get(x.ref));
  return roots;
}

if (process.argv[1] && process.argv[1].endsWith('rbxm.mjs') && process.argv[2]) {
  console.log(JSON.stringify(rbxmTree(fs.readFileSync(process.argv[2])), (k, v) => (k === 'props' ? Object.fromEntries(Object.entries(v).filter(([p]) => p !== 'Name')) : v), 1));
}
