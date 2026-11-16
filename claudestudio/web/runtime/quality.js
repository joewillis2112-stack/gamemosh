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
