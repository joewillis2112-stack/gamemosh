// A humanoid's MoveTo and Move as a frame's input for whatever drives its character (runtime/players.js for
// the player's, runtime/npcs.js for NPCs). mashup-research/ROBLOX_HUMANOID_MOVETO_2026-11-24.md:
// - MoveTo walks to WalkToPoint (with WalkToPart: the point in the part's space, following it), arriving
//   within about 1 stud (measured flat), or giving up after 8 s; MoveToFinished(reached) either way. Setting
//   WalkToPoint or WalkToPart by hand ends it (OURS: with MoveToFinished(false), so waiting scripts go on).
// - Move walks in a direction (world, or the camera's when relativeToCamera) until called again.
import { endWalk } from '../datamodel.js';

export const MOVETO_TIMEOUT = 8, ARRIVE = 1;

/** The input [dx, dz] (world, length <= 1) the humanoid's walk asks for at time t (s), standing at `foot`
 *  ({ x, y, z }), and for a MoveTo the goal's height third (a swimmer heads for it); null when it isn't walking. camForward: the camera's flat look direction { x, z } (unit),
 *  for Move relative to it. */
export function walkStep(hum, foot, t, camForward = null) {
  const w = hum.walk;
  if (!w) return null;
  if (w.kind === 'dir') {
    let { x, z } = w.dir;
    if (w.rel && camForward) { const f = camForward, r = [-f.z, f.x]; [x, z] = [r[0] * x - f.x * z, r[1] * x - f.z * z]; } // the camera's right (Look x Up) and look (-Z is forward), flat
    const l = Math.hypot(x, z);
    return l > 1e-6 ? [x / Math.max(1, l), z / Math.max(1, l)] : null;
  }
  if (hum.props.WalkToPoint !== w.point || hum.props.WalkToPart !== w.part) { endWalk(hum, false); return null; }
  if (w.since === null) w.since = t;
  let g = w.point;
  if (w.part) {
    if (w.part.destroyed) { endWalk(hum, false); return null; }
    const c = w.part.props.CFrame, m = c.m;
    g = { x: c.x + m[3] * g.x + m[4] * g.y + m[5] * g.z, y: c.y + m[6] * g.x + m[7] * g.y + m[8] * g.z, z: c.z + m[9] * g.x + m[10] * g.y + m[11] * g.z }; // PointToWorldSpace
  }
  const dx = g.x - foot.x, dz = g.z - foot.z, d = Math.hypot(dx, dz);
  if (d < ARRIVE) { endWalk(hum, true); return null; }
  if (t - w.since > MOVETO_TIMEOUT) { endWalk(hum, false); return null; }
  return [dx / d, dz / d, g.y];
}
