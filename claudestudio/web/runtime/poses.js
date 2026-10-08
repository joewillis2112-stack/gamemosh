// Held poses for states the character pack has no clips for. Each is a turn
// per limb relative to the rest pose, in degrees about the limb's own axes
// (x: swing forward/back, z: out to the side). Shared by the game and the
// turntable so the pose that ships is the pose that passed the gate.
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.js';

// Signs (measured on the Kenney rig, limbs hang from shoulder/hip pivots):
// +x swings a limb backward, so arms overhead is about -170; +z moves it
// toward the character's left, so "out" is +z for left limbs, -z for right.
// The z turn is applied first (spread), then x (raise).
export const POSES = {
  // Leaving the ground: arms thrown up overhead, a touch apart; one leg forward, one back.
  jump: { 'arm-left': { x: -168, z: 10 }, 'arm-right': { x: -168, z: -10 }, 'leg-left': { x: -24 }, 'leg-right': { x: 12 } },
  // Coming down: arms up and out for balance, legs spread a little, all
  // swaying gently (sx/sz: sway amplitude in degrees about x/z, hz, ph: phase
  // in turns) so a long fall looks alive, as Roblox's looping fall does.
  fall: {
    'arm-left': { x: -145, z: 38, sx: 6, sz: 5, hz: 1.6, ph: 0 }, 'arm-right': { x: -145, z: -38, sx: 6, sz: -5, hz: 1.6, ph: 0.5 },
    'leg-left': { x: -10, z: 10, sx: 9, hz: 1.6, ph: 0.25 }, 'leg-right': { x: 14, z: -10, sx: 9, hz: 1.6, ph: 0.75 },
  },
};
/** Seconds after which a pose's sway repeats exactly (0 if it doesn't sway). */
export function posePeriod(name) {
  const hz = Object.values(POSES[name] || {}).map(a => a.hz).filter(Boolean);
  return hz.length ? 1 / Math.min(...hz) : 0;
}

const D = Math.PI / 180;
/** { nodeName: Quaternion } — absolute local rotations for `name` at time `t` (s), given rest rotations. */
export function poseRotations(name, restOf, t = 0) {
  const out = {};
  for (const [node, a] of Object.entries(POSES[name] || {})) {
    const rest = restOf(node);
    if (!rest) continue;
    const w = a.hz ? Math.sin(2 * Math.PI * (a.hz * t + (a.ph || 0))) : 0;
    const x = (a.x || 0) + (a.sx || 0) * w, z = (a.z || 0) + (a.sz || 0) * w;
    const delta = Quaternion.RotationAxis(new Vector3(1, 0, 0), x * D).multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), z * D));
    out[node] = rest.multiply(delta);
  }
  return out;
}
