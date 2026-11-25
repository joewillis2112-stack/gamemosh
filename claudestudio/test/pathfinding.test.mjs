// The pathfinding solver (web/pathfinding.js) on places built in a DataModel: open ground, a wall to go round, a gap
// too narrow for the agent, a step, a ledge to jump (and none without jumping), a drop, a closed room, start and
// finish inside parts, material costs, occlusion after a wall appears, and a large field of pillars in time.
import { DataModel, V3, CF, isA } from '../web/datamodel.js';
import { NavWorld, collectObstacles, computePath, occlusion } from '../web/pathfinding.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const place = () => { const dm = new DataModel(); part(dm, 'Base', [400, 4, 400], [0, -2, 0]); return dm; };
function part(dm, name, size, pos, props = {}) {
  const p = dm.create('Part');
  dm.set(p, 'Name', name); dm.set(p, 'Size', new V3(...size)); dm.set(p, 'Anchored', true);
  dm.set(p, 'CFrame', new CF([...pos, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  for (const [k, v] of Object.entries(props)) dm.set(p, k, v);
  dm.setParent(p, dm.workspace);
  return p;
}
const solve = (dm, a, b, agent = {}) => { const nav = new NavWorld(collectObstacles(dm, isA), agent); return { nav, ...computePath(nav, { x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }) }; };
const length = w => w.slice(1).reduce((s, p, i) => s + Math.hypot(p.pos[0] - w[i].pos[0], p.pos[2] - w[i].pos[2]), 0);
// Does the segment pass through the box (x0..x1, z0..z1) grown by r?
const crosses = (w, b, r = 0) => w.slice(1).some((p, i) => { const a = w[i].pos; for (let t = 0; t <= 1; t += 0.02) { const x = a[0] + (p.pos[0] - a[0]) * t, z = a[2] + (p.pos[2] - a[2]) * t; if (x > b[0] - r && x < b[1] + r && z > b[2] - r && z < b[3] + r) return true; } return false; });

// Open ground: straight, from the start to the finish, on the floor, spaced by WaypointSpacing.
{
  const { status, waypoints: w } = solve(place(), [0, 3, 0], [20, 3, 0]);
  const gaps = w.slice(1).map((p, i) => Math.hypot(p.pos[0] - w[i].pos[0], p.pos[2] - w[i].pos[2]));
  check(status === 'Success' && w[0].pos[0] === 0 && w[w.length - 1].pos[0] === 20 && w.every(p => Math.abs(p.pos[2]) < 1e-6 && Math.abs(p.pos[1]) < 1e-6), `open ground: a straight path on the floor (${status}, ${w.length} waypoints)`);
  check(gaps.every(d => d <= 4 + 1e-6) && w.length === 6 && w.every(p => p.action === 'Walk'), `waypoints every WaypointSpacing (4): ${gaps.map(d => d.toFixed(1))}`);
  const { waypoints: w2 } = solve(place(), [0, 3, 0], [20, 3, 0], { WaypointSpacing: 10 });
  check(w2.length === 3, `WaypointSpacing 10: ${w2.length} waypoints`);
}
// A wall across the way: round it, keeping the agent's radius from it.
{
  const dm = place(); part(dm, 'Wall', [2, 10, 20], [10, 5, 0]);
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [20, 3, 0]);
  check(status === 'Success' && !crosses(w, [9, 11, -10, 10], 1.5) && length(w) > 22, `a wall: the path goes round it, clear of it (${status}, ${length(w).toFixed(1)} studs)`);
}
// A gap of 3 studs: too narrow for AgentRadius 2 (round the wall's end), wide enough for AgentRadius 1 (through).
{
  const dm = place(); part(dm, 'WallA', [2, 10, 20], [10, 5, -11.5]); part(dm, 'WallB', [2, 10, 20], [10, 5, 11.5]);
  const wide = solve(dm, [0, 3, 0], [20, 3, 0]), thin = solve(dm, [0, 3, 0], [20, 3, 0], { AgentRadius: 1 });
  check(wide.status === 'Success' && length(wide.waypoints) > 40 && thin.status === 'Success' && length(thin.waypoints) < 21, `a 3-stud gap: AgentRadius 2 goes round (${length(wide.waypoints).toFixed(1)} studs), AgentRadius 1 through (${length(thin.waypoints).toFixed(1)})`);
}
// A step 0.8 high: walked, no jump; the waypoints on it stand on it.
{
  const dm = place(); part(dm, 'Step', [6, 0.8, 30], [10, 0.4, 0]);
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [20, 3, 0]);
  check(status === 'Success' && w.every(p => p.action === 'Walk') && w.some(p => Math.abs(p.pos[1] - 0.8) < 1e-3) && length(w) < 21, `a 0.8-stud step: walked over (${w.map(p => p.pos[1].toFixed(1)).join(' ')})`);
}
// A ledge 4 high: a jump (its take-off waypoint Action Jump, Label "Jump"); without jumping, no path.
{
  const dm = place(); part(dm, 'Ledge', [20, 4, 40], [20, 2, 0]);
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [24, 7, 0]);
  const j = w.findIndex(p => p.action === 'Jump');
  check(status === 'Success' && j >= 0 && w[j].label === 'Jump' && w[j].pos[1] < 0.5 && w[j + 1].pos[1] > 3.5 && w[w.length - 1].pos[1] === 4, `a 4-stud ledge: a Jump waypoint (Label ${w[j] && w[j].label}) takes off from the ground to its top`);
  const no = solve(dm, [0, 3, 0], [24, 7, 0], { AgentCanJump: false });
  check(no.status === 'NoPath' && no.waypoints.length === 0, `AgentCanJump false: NoPath (${no.status})`);
  // And back down: a drop, walked off.
  const down = solve(dm, [24, 7, 0], [0, 3, 0]);
  check(down.status === 'Success' && down.waypoints.every(p => p.action === 'Walk') && down.waypoints[down.waypoints.length - 1].pos[1] === 0, `down the ledge: walked off (${down.waypoints.map(p => p.pos[1].toFixed(0)).join(' ')})`);
  // Too high to jump (8 studs): no path.
  const dm2 = place(); part(dm2, 'Cliff', [20, 8, 40], [20, 4, 0]);
  check(solve(dm2, [0, 3, 0], [24, 11, 0]).status === 'NoPath', 'an 8-stud cliff: NoPath');
}
// A closed room: no way in.
{
  const dm = place();
  for (const [s, p] of [[[20, 10, 2], [30, 5, -10]], [[20, 10, 2], [30, 5, 10]], [[2, 10, 20], [20, 5, 0]], [[2, 10, 20], [40, 5, 0]]]) part(dm, 'Room', s, p);
  check(solve(dm, [0, 3, 0], [30, 3, 0]).status === 'NoPath', 'a closed room: NoPath');
}
// Inside parts.
{
  const dm = place(); part(dm, 'Block', [6, 6, 6], [0, 3, 0]); part(dm, 'Block2', [6, 6, 6], [30, 3, 0]);
  check(solve(dm, [0, 3, 0], [15, 3, 0]).status === 'FailStartNotEmpty', 'start inside a part: FailStartNotEmpty');
  check(solve(dm, [15, 3, 0], [30, 3, 0]).status === 'FailFinishNotEmpty', 'finish inside a part: FailFinishNotEmpty');
}
// Costs: a strip of grass across the straight way; Grass 50 makes the path go round it.
{
  const dm = place(); part(dm, 'Grass', [6, 0.2, 30], [10, 0.1, 0], { Material: 'Grass' });
  const plain = solve(dm, [0, 3, 0], [20, 3, 0]), costly = solve(dm, [0, 3, 0], [20, 3, 0], { Costs: { Grass: 50 } });
  // (Rounding the strip's end may clip its last stud.)
  check(!crosses(costly.waypoints, [7, 13, -14, 14]) && crosses(plain.waypoints, [7, 13, -14, 14]), `Costs { Grass = 50 }: the path goes round the grass (${length(costly.waypoints).toFixed(1)} studs; without costs ${length(plain.waypoints).toFixed(1)}, across it)`);
}
// Occlusion: a wall dropped on the path later on.
{
  const dm = place();
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [40, 3, 0]);
  const nav0 = new NavWorld(collectObstacles(dm, isA));
  const before = occlusion(nav0, w, 1);
  part(dm, 'Drop', [2, 10, 10], [30, 5, 0]);
  const after = occlusion(new NavWorld(collectObstacles(dm, isA)), w, 1), behind = occlusion(new NavWorld(collectObstacles(dm, isA)), w, w.length - 1);
  const blockedAt = after > 0 ? w[after - 1].pos[0] : null;
  check(status === 'Success' && before === -1 && after > 1 && blockedAt >= 28 && blockedAt <= 34 && behind === -1, `occlusion: -1 while clear; a wall at x 30 blocks waypoint ${after} (x ${blockedAt}); past it, clear (${behind})`);
}
// A field of pillars, 300 studs across: a path through it in good time.
{
  const dm = place();
  for (let x = -140; x <= 140; x += 10) for (let z = -140; z <= 140; z += 10) if ((x / 10 + z / 10) % 3 === 0) part(dm, 'P', [3, 8, 3], [x + 5, 4, z + 5]);
  const t0 = performance.now(), { status, waypoints: w } = solve(dm, [-140, 3, -140], [140, 3, 140]), ms = performance.now() - t0;
  check(status === 'Success' && ms < 4000 && w.length > 10, `300 studs through ${dm.workspace.children.length - 1} pillars: ${status} in ${ms.toFixed(0)} ms (${w.length} waypoints)`);
}
if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
