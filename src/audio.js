// All sound is synthesised at runtime with WebAudio: no audio files to ship.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.musicVol = 0.5;
    this.listener = { x: 0, z: 0 };
    this.noiseBuf = null;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * w; d[i] = w * 0.5 + b * 4; }
    this._ambience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  setMusic(v) {
    this.musicVol = v;
    if (this.droneGain) this.droneGain.gain.value = 0.05 * v;
  }

  _noise(dur, filterType, freq, q = 1, gain = 0.5, dest = this.master) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = dur > 1.9;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(c.currentTime, Math.random());
    if (dur < 99) src.stop(c.currentTime + dur);
    return { src, f, g };
  }

  _tone(type, freq, dur, gain = 0.3, freqEnd = null, dest = this.master) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
    o.connect(g); g.connect(dest);
    o.start();
    o.stop(c.currentTime + dur);
  }

  _ambience() {
    const c = this.ctx;
    // Wind: filtered noise with slow sweeps
    this.wind = this._noise(999, 'bandpass', 400, 0.6, 0.0);
    this.rainSnd = this._noise(999, 'highpass', 1500, 0.3, 0.0);
    // Low drone "music": two detuned oscillators through a slow filter
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.05 * this.musicVol;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    f.connect(this.droneGain); this.droneGain.connect(this.master);
    this.drones = [55, 82.4, 110.3].map((fr, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = (i - 1) * 6;
      const g = c.createGain();
      g.gain.value = i === 2 ? 0.25 : 0.4;
      o.connect(g); g.connect(f);
      o.start();
      return o;
    });
    this.droneFilter = f;
    this.heartGain = 0;
    this.nextHeart = 0;
  }

  // Called each frame with atmosphere state
  ambient(t, o) {
    if (!this.ctx) return;
    const c = this.ctx;
    const now = c.currentTime;
    const windLevel = 0.05 + o.wind * 0.12 + Math.sin(t * 0.3) * 0.02;
    this.wind.g.gain.setTargetAtTime(windLevel, now, 0.5);
    this.wind.f.frequency.setTargetAtTime(300 + Math.sin(t * 0.21) * 150 + o.wind * 200, now, 0.8);
    this.rainSnd.g.gain.setTargetAtTime(o.rain * 0.12, now, 1);
    // Music mood: darker and lower at night / with dread, brighter with the boss fight tension
    const mood = o.boss ? 1400 : 380 + (1 - o.night) * 250 - o.dread * 2;
    this.droneFilter.frequency.setTargetAtTime(Math.max(150, mood), now, 1.5);
    if (o.boss && this.drones) this.drones[2].frequency.setTargetAtTime(116.5, now, 0.5);
    else if (this.drones) this.drones[2].frequency.setTargetAtTime(110.3, now, 2);
    // Heartbeat when hurt or terrified
    const urgency = Math.max(o.lowHp, o.dread / 100 - 0.5);
    if (urgency > 0.1 && now > this.nextHeart) {
      this.nextHeart = now + 1.1 - urgency * 0.5;
      this._tone('sine', 60, 0.18, 0.4 * urgency);
      setTimeout(() => this.ctx && this._tone('sine', 52, 0.2, 0.3 * urgency), 180);
    }
    // Whispers at high dread
    if (o.dread > 60 && Math.random() < 0.004) this._noise(1.2, 'bandpass', 2400 + Math.random() * 1500, 8, 0.08 * (o.dread / 100));
  }

  play(name, pos) {
    if (!this.ctx) return;
    let vol = 1;
    if (pos) {
      const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
      vol = Math.max(0, 1 - d / 40);
      if (vol <= 0) return;
    }
    switch (name) {
      case 'swing': this._noise(0.18, 'bandpass', 900, 1.5, 0.35 * vol).f.frequency.exponentialRampToValueAtTime(2500, this.ctx.currentTime + 0.15); break;
      case 'swingHeavy': this._noise(0.35, 'bandpass', 500, 1.2, 0.45 * vol).f.frequency.exponentialRampToValueAtTime(1600, this.ctx.currentTime + 0.3); break;
      case 'hit': this._noise(0.12, 'lowpass', 900, 1, 0.7 * vol); this._tone('square', 140, 0.08, 0.12 * vol, 60); break;
      case 'hurt': this._noise(0.2, 'lowpass', 600, 1, 0.8); this._tone('sawtooth', 110, 0.25, 0.15, 55); break;
      case 'roll': this._noise(0.3, 'lowpass', 400, 0.8, 0.4); break;
      case 'drink': this._tone('sine', 400, 0.3, 0.1, 700); this._tone('sine', 600, 0.4, 0.06, 900); break;
      case 'chest': this._tone('triangle', 180, 0.4, 0.2, 120); this._noise(0.3, 'bandpass', 1200, 2, 0.2); break;
      case 'pickup': this._tone('triangle', 520, 0.12, 0.12, 780); break;
      case 'ember': this._tone('sine', 880, 0.5, 0.08, 1320); this._tone('sine', 660, 0.6, 0.06, 990); break;
      case 'rest': this._tone('sine', 220, 2, 0.15); this._tone('sine', 330, 2.2, 0.1); this._tone('sine', 440, 2.4, 0.06); break;
      case 'beacon': [220, 277, 330, 440].forEach((f, i) => setTimeout(() => this.ctx && this._tone('sine', f, 3, 0.12), i * 180)); this._noise(2, 'lowpass', 300, 1, 0.5); break;
      case 'death': this._tone('sawtooth', 110, 2.5, 0.25, 40); this._noise(2, 'lowpass', 200, 1, 0.4); break;
      case 'explode': this._noise(1.2, 'lowpass', 300, 0.8, 1.2 * vol); this._tone('sine', 70, 0.8, 0.5 * vol, 30); break;
      case 'thunder': setTimeout(() => this.ctx && this._noise(2.5, 'lowpass', 180, 0.7, 1.0), 400 + Math.random() * 1200); break;
      case 'howl': this._tone('sawtooth', 300, 1.6, 0.12 * vol, 500); break;
      case 'chop': this._noise(0.1, 'bandpass', 700, 3, 0.6 * vol); this._tone('square', 200, 0.05, 0.1 * vol); break;
      case 'discover': [196, 247, 294].forEach((f, i) => setTimeout(() => this.ctx && this._tone('triangle', f, 1.8, 0.09), i * 250)); break;
      case 'levelup': [262, 330, 392, 523].forEach((f, i) => setTimeout(() => this.ctx && this._tone('triangle', f, 0.8, 0.1), i * 110)); break;
      case 'ui': this._tone('triangle', 660, 0.06, 0.05); break;
      case 'step': this._noise(0.06, 'lowpass', 500, 1, 0.12 * vol); break;
      default: break;
    }
  }
}
