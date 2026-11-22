// Fidelity tiers: how much the renderer spends, from a low-end phone to a strong
// desktop. One table; every system reads its numbers from here, so a tier is
// tuned in one place and a new one is one more column.
//
// The rule (user, 2026-11-12/15): a tier changes how well things are drawn and
// which optional extras run, never what the creator made. Every part, light and
// particle a place has is there on every tier, and so is every post effect the
// creator placed (SunRays runs on every tier, with fewer taps on cheap ones). Lower
// tiers get smaller shadow maps, fewer lights per surface, no ambient occlusion
// (an engine effect, not a placed one), and the particle extras (emitted light,
// collisions, soft edges) turned down or off. Roblox's
// graphics level does cut authored content (ParticleEmitter Rate scales with it;
// mashup-research/ROBLOX_PARTICLES_2026-11-13.md), which is what we don't copy.
//
// The look of a game (realistic, stylised, pixel) is the creator's, set in the
// place (Lighting, effects); tiers only scale its cost.
//
// `high` and `phone` keep the numbers each system used before tiers existed, except
// SunRays, which phones now draw too (8 taps; it used to be skipped there).
// sunShadowBias: [bias, normalBias]; bigger shadow texels need more to keep the
// ground free of acne stripes.
export const TIERS = {
  low: {
    sunShadowSize: 512, sunCascades: 2, sunShadowFilter: 'low', sunShadowBias: [0.01, 0.08], sunShadowDistance: 150, msaa: 1,
    ssao: 0, sunRayTaps: 6, skySize: 64,
    maxLights: 4, localShadowLights: 0, localShadowSize: 512,
    particleLights: 0, particleCollisionRays: 0, softParticles: false,
  },
  phone: {
    sunShadowSize: 1024, sunCascades: 2, sunShadowFilter: 'low', sunShadowBias: [0.004, 0.02], sunShadowDistance: 400, msaa: 1,
    ssao: 0.5, sunRayTaps: 8, skySize: 128,
    maxLights: 6, localShadowLights: 2, localShadowSize: 512,
    particleLights: 2, particleCollisionRays: 400, softParticles: false,
  },
  high: {
    sunShadowSize: 2048, sunCascades: 4, sunShadowFilter: 'high', sunShadowBias: [0.004, 0.02], sunShadowDistance: 400, msaa: 4,
    ssao: 1, sunRayTaps: 12, skySize: 256,
    maxLights: 10, localShadowLights: 4, localShadowSize: 1024,
    particleLights: 6, particleCollisionRays: 3000, softParticles: true,
  },
  ultra: {
    sunShadowSize: 4096, sunCascades: 4, sunShadowFilter: 'high', sunShadowBias: [0.004, 0.02], sunShadowDistance: 400, msaa: 4,
    ssao: 1, sunRayTaps: 16, skySize: 512,
    maxLights: 14, localShadowLights: 8, localShadowSize: 2048,
    particleLights: 12, particleCollisionRays: 12000, softParticles: true,
  },
};
export const TIER_NAMES = Object.keys(TIERS);

/** The tier's settings by name; unknown names get `high`. */
export function tier(name) { return TIERS[name] || TIERS.high; }

// ---- Choosing the tier: Roblox's graphics quality (UserGameSettings.SavedQualityLevel).
// Automatic, or a level from 1 to 10 the player picks (the in-game menu, or a script). Our four
// tiers stand for Roblox's ten levels (OURS: the split): 1-3 low, 4-5 phone, 6-8 high, 9-10 ultra.
export const LEVEL_TIER = [null, 'low', 'low', 'low', 'phone', 'phone', 'high', 'high', 'high', 'ultra', 'ultra'];
/** The level a tier is shown as (the menu's bars when Automatic picked it). */
export const TIER_LEVEL = { low: 2, phone: 5, high: 7, ultra: 10 };

/** A first guess from the device (OURS): a software renderer or a tiny-memory device gets low;
 *  a touch device with a small screen, phone; anything else, high. Ultra only by choice. */
export function guessTier(d = {}) {
  const renderer = String(d.renderer || ''), mem = d.memory || 8, touch = !!d.touch, small = Math.min(d.width || 1920, d.height || 1080) < 900;
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer) || mem <= 2) return 'low';
  if (touch && small) return 'phone';
  return 'high';
}

/** The device facts guessTier reads, from the page (the WebGL renderer's own name if it tells). */
export function deviceFacts(engine) {
  let renderer = '';
  try { const gl = engine._gl, ext = gl.getExtension('WEBGL_debug_renderer_info'); renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* not told */ }
  return { renderer, memory: navigator.deviceMemory, touch: matchMedia('(pointer: coarse)').matches, width: screen.width, height: screen.height };
}

// Automatic: from the guess, a tier down when frames stay slow, up (never past high) when they
// stay fast, as Roblox's automatic quality adapts (OURS: the thresholds). Slow: the mean frame
// over 3 s above 1/30 s. Fast: the mean over 10 s under 1/55 s. After a change, 5 s of frames
// are ignored (a new tier compiles shaders and rebuilds maps).
const ORDER = ['low', 'phone', 'high', 'ultra'];
export class QualityManager {
  /** apply(tierName): switch every system; store: localStorage-like (or null); fixed: a tier that
   *  overrides everything (the page's ?quality=, for tests and comparisons); guess: Automatic's start. */
  constructor({ apply, store = null, fixed = null, guess = 'high', key = 'claudestudio.SavedQualityLevel' } = {}) {
    Object.assign(this, { apply, store, fixed, guess, key });
    this.level = 0; // 0: Automatic, else 1..10
    try { const v = store && +store.getItem(key); if (v >= 1 && v <= 10) this.level = v; } catch { /* no storage */ }
    this.auto = guess;
    this.tier = fixed || (this.level ? LEVEL_TIER[this.level] : guess);
    this.resetWindow(0);
  }
  resetWindow(t) { this.samples = []; this.since = t; this.quiet = t + 5000; }

  /** The player's choice: 0 (Automatic) or 1..10. Saved unless the tier is fixed. */
  setLevel(level) {
    level = Math.max(0, Math.min(10, Math.round(level) || 0));
    this.level = level;
    try { if (this.store && !this.fixed) this.store.setItem(this.key, String(level)); } catch { /* no storage */ }
    this.choose(level ? LEVEL_TIER[level] : this.auto);
  }
  choose(t, now = 0) {
    if (this.fixed) return;
    if (t !== this.tier) { this.tier = t; this.apply(t); }
    this.resetWindow(now);
  }

  /** One frame's time (ms) at time `now` (ms). Automatic only, and never with a fixed tier. */
  frame(ms, now) {
    if (this.fixed || this.level || !(ms > 0) || ms > 250) return; // a background tab's gap isn't a slow frame
    if (now < this.quiet) return;
    this.samples.push([now, ms]);
    while (this.samples.length && this.samples[0][0] < now - 10000) this.samples.shift();
    const mean = span => { const s = this.samples.filter(x => x[0] >= now - span); return s.length ? s.reduce((a, x) => a + x[1], 0) / s.length : 0; };
    const have = now - (this.samples[0] ? this.samples[0][0] : now), i = ORDER.indexOf(this.tier);
    if (have >= 2900 && mean(3000) > 1000 / 30 && i > 0) { this.auto = ORDER[i - 1]; this.choose(this.auto, now); }
    else if (have >= 9900 && mean(10000) < 1000 / 55 && i < ORDER.indexOf('high')) { this.auto = ORDER[i + 1]; this.choose(this.auto, now); }
  }
}
