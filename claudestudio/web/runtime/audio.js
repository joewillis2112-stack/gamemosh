// Sound: Web Audio, unlocked by the first touch/click/key (browsers start the
// context suspended). One-shots and seamless loops; `log` records what played
// (for tests, which can't hear).
const NAMES = ['footstep_1', 'footstep_2', 'footstep_3', 'footstep_4', 'jump', 'land', 'fall_wind', 'death', 'spawn', 'checkpoint'];

export class Audio {
  constructor(base = '../assets/sounds/') {
    this.base = base;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buffers = {};
    this.log = [];
    const unlock = () => { if (this.ctx.state !== 'running') this.ctx.resume(); };
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) addEventListener(ev, unlock, { capture: true });
  }

  async load(names = NAMES) {
    await Promise.all(names.map(async n => {
      try {
        const data = await (await fetch(this.base + n + '.mp3')).arrayBuffer();
        this.buffers[n] = await this.ctx.decodeAudioData(data);
      } catch (e) { console.warn('sound', n, e.message); }
    }));
  }

  // A one-shot. volume 0-1, rate = playback speed.
  play(name, { volume = 1, rate = 1 } = {}) {
    this.log.push(name);
    const b = this.buffers[name];
    if (!b || volume <= 0) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = b; src.playbackRate.value = rate; g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  // A loop with a settable volume. MP3 pads the ends with silence and the
  // ends needn't meet, so the loop runs over the audible region with its last
  // 50 ms crossfaded into its first: the wrap is continuous, no gap, no click.
  loop(name) {
    const b = this.seamless(name);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    let src = null;
    if (b) {
      src = this.ctx.createBufferSource();
      src.buffer = b; src.loop = true;
      src.loopStart = b.loopStart; src.loopEnd = b.duration;
      src.connect(g);
      src.start(0, b.loopStart);
    }
    const self = this;
    return {
      volume: 0,
      setVolume(v) { this.volume = v; g.gain.setTargetAtTime(v, self.ctx.currentTime, 0.03); },
      stop() { if (src) { try { src.stop(); } catch (e) { /* already stopped */ } } g.disconnect(); },
    };
  }
}

Audio.prototype.seamless = function (name) {
  const b = this.buffers[name];
  if (!b) return null;
  const [a0, z0] = audibleRegion(b).map(t => Math.round(t * b.sampleRate));
  const N = Math.min(Math.round(0.05 * b.sampleRate), Math.floor((z0 - a0) / 4));
  const len = z0 - a0;
  const out = this.ctx.createBuffer(b.numberOfChannels, len, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const src = b.getChannelData(ch).subarray(a0, z0), dst = out.getChannelData(ch);
    dst.set(src);
    // Equal-power crossfade: the tail fades out as the head fades in, so the
    // last sample leads straight into sample N, where the loop restarts.
    for (let i = 0; i < N; i++) {
      const w = (i + 1) / N, k = len - N + i;
      dst[k] = src[k] * Math.cos(w * Math.PI / 2) + src[i] * Math.sin(w * Math.PI / 2);
    }
  }
  out.loopStart = N / b.sampleRate;
  return out;
};

// Seconds [start, end] between leading and trailing near-silence (encoder padding).
function audibleRegion(buffer) {
  const d = buffer.getChannelData(0), eps = 1e-4;
  let a = 0, z = d.length - 1;
  while (a < z && Math.abs(d[a]) < eps) a++;
  while (z > a && Math.abs(d[z]) < eps) z--;
  return [a / buffer.sampleRate, (z + 1) / buffer.sampleRate];
}
