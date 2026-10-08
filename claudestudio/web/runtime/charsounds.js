// The character's sounds, following Roblox's default RbxCharacterSounds
// (mashup-research/ROBLOX_DEFAULTS_2026-10-08.md §1): volume 0.65, heard from
// the camera with Roblox's 5/d roll-off (5-150 studs). Jump on takeoff (it
// stops the looped sounds); landing only when falling faster than 75 studs/s,
// louder up to 100; the falling wind fades in at 0.9/s while faster than 75;
// the death sound on Died. One deliberate difference: Roblox loops one
// footstep clip at a fixed rate; here each footstep plays when a sole
// actually meets the ground in the animation, so steps match the feet.
const VOLUME = 0.65;

export class CharacterSounds {
  constructor(audio, character, camera) {
    this.audio = audio; this.char = character; this.camera = camera;
    this.wind = audio.loop('fall_wind');
    this.lastStep = -1;
    const c = character;
    c.on.step = () => {
      let i; do { i = 1 + Math.floor(Math.random() * 4); } while (i === this.lastStep);
      this.lastStep = i;
      audio.play('footstep_' + i, { volume: this.gain() * 0.9, rate: 0.95 + Math.random() * 0.1 });
    };
    c.on.jump = () => { this.wind.setVolume(0); audio.play('jump', { volume: this.gain() }); };
    c.on.land = fallSpeed => {
      this.wind.setVolume(0);
      if (fallSpeed > 75) audio.play('land', { volume: this.gain() * Math.min(1, Math.max(0, (fallSpeed - 50) / 50)) });
    };
  }
  died() { this.wind.setVolume(0); this.audio.play('death', { volume: this.gain() }); }

  // Roblox's roll-off: full within 5 studs, then 5/d, silent past 150.
  gain() {
    const d = this.camera.dist;
    return VOLUME * (d <= 5 ? 1 : d >= 150 ? 0 : 5 / d);
  }

  update(dt) {
    const c = this.char, v = c.velocity, speed = Math.hypot(v.x, c.vy, v.z);
    if (!c.grounded && !c.dead && speed > 75) {
      this.windLevel = Math.min(1, (this.windLevel || 0) + 0.9 * dt);
    } else this.windLevel = 0;
    const want = this.windLevel * this.gain();
    if (Math.abs(want - this.wind.volume) > 0.01) this.wind.setVolume(want);
  }
}
