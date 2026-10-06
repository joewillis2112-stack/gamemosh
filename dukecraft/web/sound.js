// Duke's sounds are Creative Voice files (.VOC): 8-bit unsigned PCM in
// blocks. Decoded once into Web Audio buffers and played by distance.

/// VOC bytes → { rate, samples (Float32Array) }, or null.
export function decodeVoc(b) {
  if (!b || b.length < 26) return null;
  const sig = String.fromCharCode(...b.subarray(0, 19));
  if (sig !== 'Creative Voice File') return null;
  let o = b[20] | (b[21] << 8);
  let rate = 11025;
  const parts = [];
  while (o < b.length) {
    const type = b[o];
    if (type === 0) break;
    const len = b[o + 1] | (b[o + 2] << 8) | (b[o + 3] << 16);
    const body = o + 4;
    if (type === 1) {
      rate = Math.round(1000000 / (256 - b[body]));
      if (b[body + 1] === 0) parts.push(b.subarray(body + 2, body + len));
    } else if (type === 9) {
      // New-style block: rate (u32), bits, channels, codec (u16), 4 reserved.
      rate = b[body] | (b[body + 1] << 8) | (b[body + 2] << 16) | (b[body + 3] << 24);
      const bits = b[body + 4], codec = b[body + 6] | (b[body + 7] << 8);
      if (bits === 8 && codec === 0) parts.push(b.subarray(body + 12, body + len));
    } else if (type === 2) {
      parts.push(b.subarray(body, body + len));
    }
    o = body + len;
  }
  const n = parts.reduce((s, p) => s + p.length, 0);
  if (!n) return null;
  const samples = new Float32Array(n);
  let k = 0;
  for (const p of parts) for (let i = 0; i < p.length; i++) samples[k++] = (p[i] - 128) / 128;
  return { rate, samples };
}

export class Sounds {
  constructor(grp, table) {
    this.grp = grp;
    this.table = table; // id → file name
    this.buffers = new Map();
    this.ctx = null;
    this.gain = null;
    this.muted = false;
  }

  attach(ctx, destination) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.7;
    this.gain.connect(destination || ctx.destination);
  }

  buffer(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    let buf = null;
    const file = this.table[id];
    const voc = file && decodeVoc(this.grp.get(file.toUpperCase()));
    if (voc && this.ctx) {
      buf = this.ctx.createBuffer(1, voc.samples.length, voc.rate);
      buf.copyToChannel(voc.samples, 0);
    }
    this.buffers.set(id, buf);
    return buf;
  }

  /// Play sound `id`; `dist` in blocks fades it (0 = at your ear).
  play(id, dist = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const vol = Math.max(0, 1 - dist / 40);
    if (vol <= 0.02) return;
    const buf = this.buffer(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.gain);
    src.start();
  }
}
