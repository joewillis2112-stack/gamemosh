// Duke Nukem 3D's own files, read in the page: a GRP archive, the Build
// engine's ART tiles (8-bit, column-major, palette index 255 = see-through)
// and PALETTE.DAT (6-bit RGB).

/// A GRP archive: name → bytes.
export function readGrp(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = String.fromCharCode(...bytes.subarray(0, 12));
  if (sig !== 'KenSilverman') throw new Error('not a GRP file');
  const n = dv.getUint32(12, true);
  const files = new Map();
  let off = 16 + n * 16;
  for (let i = 0; i < n; i++) {
    let name = '';
    for (let k = 0; k < 12; k++) { const c = bytes[16 + i * 16 + k]; if (!c) break; name += String.fromCharCode(c); }
    const size = dv.getUint32(28 + i * 16, true);
    files.set(name.toUpperCase(), bytes.subarray(off, off + size));
    off += size;
  }
  return files;
}

export class Art {
  constructor(grp) {
    const pal = grp.get('PALETTE.DAT');
    this.palette = new Uint8Array(256 * 3);
    for (let i = 0; i < 768; i++) this.palette[i] = Math.min(255, pal[i] * 4);
    // LOOKUP.DAT: palette swaps (pal 22 is the troopers' colours, and so on).
    this.lookups = new Map();
    const lk = grp.get('LOOKUP.DAT');
    if (lk) for (let i = 0, o = 1; i < lk[0]; i++, o += 257) this.lookups.set(lk[o], lk.subarray(o + 1, o + 257));
    this.tiles = new Map(); // tile → { w, h, xoff, yoff, anim, px (Uint8Array, column-major) }
    for (const [name, data] of grp) if (/^TILES\d+\.ART$/.test(name)) this.readArt(data);
    this.canvases = new Map();
  }

  readArt(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const start = dv.getInt32(8, true), end = dv.getInt32(12, true);
    const count = end - start + 1;
    let off = 16;
    const xs = [], ys = [], anm = [];
    for (let i = 0; i < count; i++) xs.push(dv.getInt16(off + i * 2, true));
    off += count * 2;
    for (let i = 0; i < count; i++) ys.push(dv.getInt16(off + i * 2, true));
    off += count * 2;
    for (let i = 0; i < count; i++) anm.push(dv.getInt32(off + i * 4, true));
    off += count * 4;
    for (let i = 0; i < count; i++) {
      const w = xs[i], h = ys[i];
      if (w <= 0 || h <= 0) continue;
      const a = anm[i];
      this.tiles.set(start + i, {
        w, h,
        // picanm: frames in bits 0-5, type 6-7, x offset 8-15, y offset 16-23 (signed), speed 24-27.
        xoff: (a << 16) >> 24, yoff: (a << 8) >> 24,
        px: b.subarray(off, off + w * h),
      });
      off += w * h;
    }
  }

  has(tile) { return this.tiles.has(tile); }
  info(tile) { return this.tiles.get(tile) || null; }

  /// The tile as a canvas (row-major, RGBA), optionally mirrored and
  /// recoloured with palette swap `pal`.
  canvas(tile, flip = false, pal = 0) {
    const key = `${tile}${flip ? 'f' : ''}${pal ? 'p' + pal : ''}`;
    if (this.canvases.has(key)) return this.canvases.get(key);
    const t = this.tiles.get(tile);
    if (!t) return null;
    const c = document.createElement('canvas');
    c.width = t.w; c.height = t.h;
    const g = c.getContext('2d');
    const img = g.createImageData(t.w, t.h);
    const p = this.palette, swap = pal && this.lookups.get(pal);
    for (let x = 0; x < t.w; x++) for (let y = 0; y < t.h; y++) {
      let v = t.px[x * t.h + y];
      if (v === 255) continue;
      if (swap) v = swap[v];
      const o = (y * t.w + (flip ? t.w - 1 - x : x)) * 4;
      img.data[o] = p[v * 3]; img.data[o + 1] = p[v * 3 + 1]; img.data[o + 2] = p[v * 3 + 2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.canvases.set(key, c);
    return c;
  }
}
