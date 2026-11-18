// Layers kept inside the PNG the Image Editor writes, the way the Vector Editor keeps its document
// in SVG <metadata>: the flattened image is an ordinary PNG (anything can show it), and a private
// ancillary chunk, `csLy`, carries the layers (names, opacity, visibility, blend, masks) and their
// 8-bit pixels, zlib-compressed. PNG readers skip ancillary chunks they don't know, so the image
// shows everywhere; the Image Editor reads the chunk back and opens the layers again.
//
// Chunk data: u32 (big-endian) length of a JSON header, the header ({ v: 1, w, h, active,
// layers: [{ name, opacity, visible, blend, mask: bool }] }), then zlib of each layer's RGBA bytes
// followed, where it has one, by its mask's grey bytes (one a pixel).
const TYPE = 'csLy';
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const b64ToBytes = s => { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
function bytesToB64(b) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
const u8 = v => Math.trunc(Math.min(Math.max(v, 0), 1) * 255 + 0.5);

/** The chunks of a PNG: [{ type, data, start, end }] (start/end: the whole chunk's byte range). */
export function pngChunks(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength), out = [];
  for (let p = 8; p + 12 <= png.length;) {
    const len = dv.getUint32(p), type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    out.push({ type, data: png.subarray(p + 8, p + 8 + len), start: p, end: p + 12 + len });
    p += 12 + len; if (type === 'IEND') break;
  }
  return out;
}

/** `pngUrl` (a PNG data URL of the flattened image) with `doc`'s layers in a csLy chunk. */
export async function packLayers(pngUrl, doc) {
  const { width: W, height: H } = doc, n = W * H;
  const header = new TextEncoder().encode(JSON.stringify({ v: 1, w: W, h: H, active: doc.active,
    layers: doc.layers.map(l => ({ name: l.name, opacity: l.opacity, visible: l.visible, blend: l.blend, mask: !!l.mask })) }));
  const raw = new Uint8Array(doc.layers.reduce((t, l) => t + n * 4 + (l.mask ? n : 0), 0));
  let o = 0;
  for (const l of doc.layers) {
    for (let i = 0; i < n * 4; i++) raw[o++] = u8(l.img.data[i]);
    if (l.mask) for (let i = 0; i < n; i++) raw[o++] = u8(l.mask.data[i * 4]);
  }
  const z = await pipe(raw, new CompressionStream('deflate'));
  const data = new Uint8Array(4 + header.length + z.length);
  new DataView(data.buffer).setUint32(0, header.length); data.set(header, 4); data.set(z, 4 + header.length);
  const png = b64ToBytes(pngUrl.slice(pngUrl.indexOf(',') + 1)), iend = pngChunks(png).find(c => c.type === 'IEND');
  const chunk = new Uint8Array(12 + data.length), cv = new DataView(chunk.buffer);
  cv.setUint32(0, data.length); chunk.set(new TextEncoder().encode(TYPE), 4); chunk.set(data, 8);
  cv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend.start)); out.set(chunk, iend.start); out.set(png.subarray(iend.start), iend.start + chunk.length);
  return 'data:image/png;base64,' + bytesToB64(out);
}

/** The layers inside one of our PNG data URLs ({ w, h, active, layers: [{ name, opacity, visible,
 *  blend, img, mask }] }, images as brush.js's float RGBA), or null if it has none. */
export async function unpackLayers(url) {
  const m = /^data:image\/png;base64,(.*)$/.exec(url || ''); if (!m) return null;
  let chunk;
  try { chunk = pngChunks(b64ToBytes(m[1])).find(c => c.type === TYPE); } catch { return null; }
  if (!chunk || crc32(new Uint8Array([...new TextEncoder().encode(TYPE), ...chunk.data])) !== new DataView(chunk.data.buffer, chunk.data.byteOffset + chunk.data.length).getUint32(0)) return null;
  try {
    const d = chunk.data, hl = new DataView(d.buffer, d.byteOffset).getUint32(0);
    const meta = JSON.parse(new TextDecoder().decode(d.subarray(4, 4 + hl)));
    const raw = await pipe(d.subarray(4 + hl), new DecompressionStream('deflate')), n = meta.w * meta.h;
    let o = 0;
    const layers = meta.layers.map(l => {
      const img = { width: meta.w, height: meta.h, data: new Float32Array(n * 4) };
      for (let i = 0; i < n * 4; i++) img.data[i] = raw[o++] / 255;
      let mask = null;
      if (l.mask) { mask = { width: meta.w, height: meta.h, data: new Float32Array(n * 4) }; for (let i = 0; i < n; i++) { const v = raw[o++] / 255; mask.data.set([v, v, v, 1], i * 4); } }
      return { name: String(l.name), opacity: +l.opacity, visible: !!l.visible, blend: l.blend, img, mask };
    });
    if (o !== raw.length) return null;
    return { w: meta.w, h: meta.h, active: meta.active, layers };
  } catch { return null; }
}
