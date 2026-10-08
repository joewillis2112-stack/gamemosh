// TweenService's math: easing curves and value interpolation.
// Roblox documents the styles only as graphs. These are the standard (Penner)
// curves, except Back and Elastic, which use the forms a DevForum author fitted
// to Roblox's own TweenService:GetValue to ~1e-7 (see
// mashup-research/ROBLOX_PLATFORMS_TWEENS_2026-10-08.md §7). Unverified against
// the engine itself; GetValue(0.5, Bounce, In) = 0.234375 matches a printed one.
import { V3, C3, CF } from './datamodel.js';

const IN = {
  Linear: t => t,
  Sine: t => 1 - Math.cos(t * Math.PI / 2),
  Quad: t => t * t,
  Cubic: t => t * t * t,
  Quart: t => t * t * t * t,
  Quint: t => t * t * t * t * t,
  Exponential: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  Circular: t => 1 - Math.sqrt(1 - t * t),
  Back: t => 2.70158 * t * t * t - 1.70158 * t * t,
  Bounce: t => 1 - bounceOut(1 - t),
  Elastic: t => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin(6.5 * Math.PI * t - 7 * Math.PI),
};
function bounceOut(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

// Eased alpha. In runs the curve forward, Out in reverse, InOut forward then reverse.
export function ease(alpha, style = 'Quad', dir = 'Out') {
  const t = Math.min(1, Math.max(0, alpha)), f = IN[style] || IN.Linear;
  if (style === 'Linear') return t;
  if (dir === 'In') return f(t);
  if (dir === 'Out') return 1 - f(1 - t);
  return t < 0.5 ? f(2 * t) / 2 : 1 - f(2 - 2 * t) / 2;
}

// Interpolate a property value. Numbers, Vector3, Color3 (per channel, as
// Color3:Lerp) and CFrame (position linear, rotation slerp, as CFrame:Lerp).
// Booleans and enums can't be blended: they switch at the end.
export function lerpValue(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (a instanceof V3) return new V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  if (a instanceof C3) return new C3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  if (a instanceof CF) return a.lerp(b, t);
  return t >= 1 ? b : a;
}
export const TWEENABLE = new Set(['number', 'bool', 'Vector3', 'Color3', 'CFrame']);
