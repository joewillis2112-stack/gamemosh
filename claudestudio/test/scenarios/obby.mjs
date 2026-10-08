// A playtest bot for places/obby.luau. It steers to each platform in turn and
// jumps when the ground ahead ends or a step is too tall to walk, all through
// real physics. On death it carries on from the last checkpoint. It reports
// deaths per stage and the time to finish. The course must be beatable.
const WAYPOINTS = [
  [0, 0, 'start'], [0, 12], [0, 20], [0, 28], [0, 38, 'cp1'], [0, 48], [3, 60], [0, 72, 'cp2'],
  [0, 86], [0, 92], [0, 106, 'cp3'], [-2, 118], [2, 125], [0, 132], [0, 142, 'cp4'],
  [0, 152], [0, 159], [0, 166], [0, 173], [0, 183, 'cp5'], [0, 192], [0, 198], [0, 204], [0, 210], [0, 222, 'finish'],
];
export default async function (t) {
  await t.sim(20);
  const r = await t.eval(([W]) => {
    const S = window.studio, p = S.player, pl = S.players, V = p.holder.position.constructor;
    const eng = S.scene.getPhysicsEngine(), ray = new (p.ray.constructor)();
    const floorAt = (x, z, fromY, toY) => { eng.raycastToRef(new V(x, fromY, z), new V(x, toY, z), ray); return ray.hasHit ? ray.hitPointWorld.y : null; };
    let wp = 1, deaths = {}, wasDead = false, stage = 0, frames = 0, finished = false, lastCp = 0;
    for (; frames < 60 * 120 && !finished; frames++) {
      if (p.dead) { wasDead = true; S.sim(1); continue; }
      if (wasDead) { wasDead = false; wp = lastCp + 1; deaths[W[lastCp][2] || 'start'] = (deaths[W[lastCp][2] || 'start'] || 0) + 1; }
      const f = p.footPosition, [tx, tz] = W[wp];
      let dx = tx - f.x, dz = tz - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5 && p.grounded) {
        if (W[wp][2]) { lastCp = wp; if (W[wp][2] === 'finish') { finished = true; break; } }
        wp++; continue;
      }
      dx /= d; dz /= d;
      // Jump: the ground 1.8 studs ahead is missing or far down, or a step ahead is too tall to walk.
      let jump = false;
      if (p.grounded) {
        const ax = f.x + dx * 1.8, az = f.z + dz * 1.8;
        const below = floorAt(ax, az, f.y + 0.5, f.y - 1.5);
        const above = floorAt(f.x + dx * 1.4, f.z + dz * 1.4, f.y + 4.5, f.y + 0.9);
        jump = below === null || above !== null;
      }
      // World direction to camera-relative stick input (right-handed: right = (-fz, fx)).
      const cy = S.camera.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = -fz, rz = fx;
      S.sim(1, { move: [dx * rx + dz * rz, dx * fx + dz * fz], jump });
    }
    return { finished, seconds: +(frames / 60).toFixed(1), deaths, reached: W[Math.min(wp, W.length - 1)] };
  }, [WAYPOINTS]);
  console.log('bot', JSON.stringify(r));
  const luau = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  console.log('luau:\n  ' + luau.join('\n  '));
  // The bot finishes with no deaths in about the time a player would (15.9 s
  // measured), and the place's own scripts saw every checkpoint and the finish.
  const want = ['stage 1', 'stage 2', 'stage 3', 'stage 4', 'stage 5', 'finished Player1'];
  const missing = want.filter(w => !luau.includes(w));
  if (!r.finished || Object.keys(r.deaths).length || r.seconds > 20 || missing.length)
    throw new Error('FAIL obby: ' + JSON.stringify({ finished: r.finished, deaths: r.deaths, seconds: r.seconds, missing }));
}
