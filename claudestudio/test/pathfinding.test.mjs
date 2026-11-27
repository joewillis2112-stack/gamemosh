// The pathfinding solver (web/pathfinding.js) on places built in a DataModel: open ground, a wall to go round, a gap
// too narrow for the agent, a step, a ledge to jump (and none without jumping), a drop, a closed room, start and
// finish inside parts, material costs, occlusion after a wall appears, and a large field of pillars in time; over the
// Terrain as drawn: its ground, a wall of it, a ramp to a plateau, a tunnel, a pool swum (or not, by Costs.Water),
// start inside rock, a part on it, occlusion when it changes, and a long way over it in time.
import { DataModel, V3, CF, isA } from '../web/datamodel.js';
import { NavWorld, collectObstacles, terrainOf, computePath, occlusion } from '../web/pathfinding.js';
import { shapes, boxBounds } from '../web/terrain/voxels.js';

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
const solve = (dm, a, b, agent = {}) => { const nav = new NavWorld(collectObstacles(dm, isA), agent, terrainOf(dm)); return { nav, ...computePath(nav, { x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }) }; };
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

// TrussParts (AgentCanClimb): a tower 20 high with a platform at its top behind it. Without climbing: no way up. With
// it: up the truss, its waypoints on its face labelled Climb, every WaypointSpacing, then the top and off onto the
// platform. Costs.Climb math.huge: no way. A ramp beside it, against a climb cost of 20: the ramp. A tilted truss isn't
// climbed. Occlusion doesn't count the waypoints on the face as unsupported.
{
  const tower = () => { const dm = place(); const t = dm.create('TrussPart'); dm.set(t, 'Size', new V3(2, 20, 2)); dm.set(t, 'Anchored', true); dm.set(t, 'CFrame', new CF([0, 10, -10, 1, 0, 0, 0, 1, 0, 0, 0, 1])); dm.setParent(t, dm.workspace); part(dm, 'Top', [8, 1, 8], [0, 19.5, -15]); return { dm, t }; };
  const { dm, t } = tower();
  const no = solve(dm, [0, 3, 0], [0, 23, -16]), up = solve(dm, [0, 3, 0], [0, 23, -16], { AgentCanClimb: true }), w = up.waypoints;
  const cl = w.filter(p => p.label === 'Climb'), last = cl[cl.length - 1];
  const onFace = cl.slice(0, -1).every(p => Math.abs(p.pos[2] + 9) < 1e-6 && Math.abs(p.pos[0]) < 1e-6), rising = cl.every((p, i) => !i || p.pos[1] > cl[i - 1].pos[1]);
  const gaps = cl.map((p, i) => p.pos[1] - (i ? cl[i - 1].pos[1] : w[w.indexOf(cl[0]) - 1].pos[1]));
  check(no.status === 'NoPath' && up.status === 'Success', `a platform 20 up, a truss to it: without AgentCanClimb ${no.status}; with it ${up.status}`);
  check(cl.length === 5 && onFace && rising && gaps.every(d => d <= 4 + 1e-6) && Math.abs(last.pos[1] - 20) < 1e-6 && Math.abs(last.pos[2] + 10) < 0.3 && w.every(p => p.action === 'Walk'), `climbing: ${cl.length} waypoints labelled Climb up its face (z -9) every ${gaps.map(d => d.toFixed(1)).join(', ')} studs, the last on its top at ${last && last.pos[1].toFixed(1)}; all Walk`);
  check(Math.abs(w[w.length - 1].pos[1] - 20) < 1e-6 && w[w.length - 1].pos[2] === -16, `then off onto the platform (${w[w.length - 1].pos.map(v => v.toFixed(1))})`);
  const huge = solve(dm, [0, 3, 0], [0, 23, -16], { AgentCanClimb: true, Costs: { Climb: Infinity } });
  check(huge.status === 'NoPath', `Costs.Climb math.huge: ${huge.status}`);
  check(occlusion(new NavWorld(collectObstacles(dm, isA), { AgentCanClimb: true }), w, 1) === -1, 'occlusion: the climb is clear (the waypoints on the face aren\'t asked to stand)');
  const r = tower().dm; const ramp = r.create('WedgePart'); r.set(ramp, 'Size', new V3(8, 20, 28)); r.set(ramp, 'Anchored', true); r.set(ramp, 'CFrame', new CF([0, 10, -33, 1, 0, 0, 0, 1, 0, 0, 0, 1])); r.setParent(ramp, r.workspace); // (rising to the platform's far edge)
  const viaRamp = solve(r, [0, 3, 0], [0, 23, -16], { AgentCanClimb: true, Costs: { Climb: 20 } }), viaTruss = solve(r, [0, 3, 0], [0, 23, -16], { AgentCanClimb: true });
  check(viaRamp.status === 'Success' && !viaRamp.waypoints.some(p => p.label === 'Climb') && viaTruss.waypoints.some(p => p.label === 'Climb'), `with a long way round by a ramp: at Costs.Climb 20 the ramp (${viaRamp.status}, ${length(viaRamp.waypoints).toFixed(0)} studs), at 1 the truss`);
  const tilt = place(); const tt = tilt.create('TrussPart'); tilt.set(tt, 'Size', new V3(2, 20, 2)); tilt.set(tt, 'Anchored', true); const c = Math.cos(0.3), sn = Math.sin(0.3); tilt.set(tt, 'CFrame', new CF([0, 10, -10, 1, 0, 0, 0, c, -sn, 0, sn, c])); tilt.setParent(tt, tilt.workspace); part(tilt, 'Top', [8, 1, 8], [0, 19.5, -15]);
  check(solve(tilt, [0, 3, 0], [0, 23, -16], { AgentCanClimb: true }).status === 'NoPath', 'a tilted truss isn\'t climbed');
}

// The Terrain. A place of terrain ground (Grass, its top at y 0) and what's filled on it.
const tplace = (mat = 'Grass') => { const dm = new DataModel(), V = dm.workspace.children.find(c => c.ClassName === 'Terrain').voxels; fill(V, [0, -8, 0], [256, 16, 256], mat); return { dm, V }; };
function fill(V, c, size, mat, kind = 'block') {
  const m = [...c, 1, 0, 0, 0, 1, 0, 0, 0, 1], sz = { x: size[0], y: size[1], z: size[2] }, b = boxBounds(m, sz);
  V.fill(shapes[kind](m, sz), b.min, b.max, mat);
}
const ground = (V, x, z, from = 60) => { const h = V.raycast([x, from, z], [0, -1, 0], 200); return h ? from - h.t : null; };
// The least distance from the path's way to a box (x0..x1, z0..z1), its corners round.
const clearOf = (w, b) => Math.min(...w.slice(1).flatMap((p, i) => { const a = w[i].pos, out = []; for (let t = 0; t <= 1; t += 0.02) { const x = a[0] + (p.pos[0] - a[0]) * t, z = a[2] + (p.pos[2] - a[2]) * t; out.push(Math.hypot(Math.max(b[0] - x, 0, x - b[1]), Math.max(b[2] - z, 0, z - b[3]))); } return out; }));
const onGround = (V, w) => w.every(p => Math.abs(p.pos[1] - ground(V, p.pos[0], p.pos[2], p.pos[1] + 3)) < 0.1); // (0.1: a waypoint exactly on a triangle's edge may meet a sliver the ray misses)
{
  const { dm, V } = tplace();
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [40, 3, 0]);
  check(status === 'Success' && w.length === 11 && w.every(p => Math.abs(p.pos[2]) < 1e-6) && onGround(V, w), `terrain ground: a straight path on its drawn surface (${status}, ${w.length} waypoints, y ${w.map(p => p.pos[1].toFixed(2)).slice(0, 3)}...)`);
  const s2 = solve(dm, [30, -4, 30], [40, 3, 0]).status;
  check(s2 === 'FailStartNotEmpty', `a start inside the ground: ${s2}`);
}
{
  const { dm, V } = tplace(); fill(V, [20, 6, 0], [4, 12, 40], 'Rock');
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [40, 3, 0]);
  check(status === 'Success' && clearOf(w, [18, 22, -18, 18]) > 1.9 && length(w) > 42 && onGround(V, w), `a wall of terrain (drawn 10 high, z -18..18: its 4-stud cells): round it, ${clearOf(w, [18, 22, -18, 18]).toFixed(2)} from it (${status}, ${length(w).toFixed(1)} studs)`);
}
{
  const { dm, V } = tplace(); fill(V, [0, 5, 40], [64, 10, 24], 'Rock'); fill(V, [0, 5, 16], [12, 10, 24], 'Rock', 'wedge');
  const { status, waypoints: w } = solve(dm, [0, 3, -10], [0, 13, 44]);
  const on = solve(dm, [0.6, 8, 15.51], [1.4, 13, 43.4]).waypoints, e0 = on[0], e1 = on[on.length - 1];
  check(Math.abs(e0.pos[1] - ground(V, 0.6, 15.51)) < 0.02 && Math.abs(e1.pos[1] - ground(V, 1.4, 43.4)) < 0.02, `from partway up the ramp: the first and last waypoints stand on the ground under the start and the finish exactly (${e0.pos[1].toFixed(3)} on ${ground(V, 0.6, 15.51).toFixed(3)}, ${e1.pos[1].toFixed(3)} on ${ground(V, 1.4, 43.4).toFixed(3)})`);
  const up = w.filter(p => p.pos[2] > 6 && p.pos[2] < 26);
  check(status === 'Success' && w.every(p => p.action === 'Walk') && up.length >= 3 && up.every(p => Math.abs(p.pos[0]) < 6 && p.pos[1] > 0.5 && p.pos[1] < 9.5) && Math.abs(w[w.length - 1].pos[1] - 10) < 0.3 && onGround(V, w), `a plateau 10 high (past a jump) and a ramp of terrain: up the ramp, walking (${status}, heights ${up.map(p => p.pos[1].toFixed(1))})`);
}
{
  const { dm, V } = tplace(); fill(V, [20, 8, 0], [8, 16, 256], 'Rock'); fill(V, [20, 4, 0], [12, 8, 8], 'Air');
  const a = solve(dm, [0, 3, 0], [40, 3, 0]), b = solve(dm, [0, 3, 0], [40, 3, 0], { AgentHeight: 10 }), c = solve(dm, [0, 3, 0], [40, 3, 0], { AgentRadius: 4.5 });
  check(a.status === 'Success' && a.waypoints.every(p => Math.abs(p.pos[2]) < 2.5) && Math.abs(length(a.waypoints) - 40) < 1 && onGround(V, a.waypoints), `a tunnel 8 wide and 8 high through a wall of terrain: through it (${a.status}, ${length(a.waypoints).toFixed(1)} studs)`);
  check(b.status === 'NoPath' && c.status === 'NoPath', `too tall for it (AgentHeight 10): ${b.status}; too wide (AgentRadius 4.5): ${c.status}`);
}
{
  const { dm, V } = tplace('Rock'); fill(V, [0, -6, -20], [40, 12, 40], 'Water');
  const a = solve(dm, [0, 3, -50], [0, 3, 10]);
  const inPool = a.waypoints.filter(p => p.pos[2] > -38 && p.pos[2] < -2);
  check(a.status === 'Success' && Math.abs(length(a.waypoints) - 60) < 1 && inPool.length >= 6 && inPool.every(p => Math.abs(p.pos[1]) < 0.05), `a pool: swum straight across, its waypoints on the water's surface (${a.status}, ${length(a.waypoints).toFixed(1)} studs, y ${inPool.map(p => p.pos[1].toFixed(2)).slice(0, 3)}...)`);
  const jumps = a.waypoints.map((p, i) => [p, i]).filter(([p]) => p.action === 'Jump'), jz = jumps.length === 1 ? jumps[0][0].pos[2] : null, next = jumps.length === 1 ? a.waypoints[jumps[0][1] + 1] : null;
  check(jumps.length === 1 && jz > -2 && jz < 4 && next && next.pos[2] > jz && next.pos[2] < jz + 2, `out of the water onto the far bank (the pool's edge at z 0, its bevel swum), one Jump: at z ${jz && jz.toFixed(2)}, landing at ${next && next.pos[2].toFixed(2)} (none going in)`);
  const b = solve(dm, [0, 3, -50], [0, 3, 10], { Costs: { Water: Infinity } }), c = solve(dm, [0, 3, -50], [0, 3, 10], { Costs: { Water: 20 } });
  check(b.status === 'Success' && !crosses(b.waypoints, [-20, 20, -40, 0], -0.5) && c.status === 'Success' && !crosses(c.waypoints, [-20, 20, -40, 0], -0.5) && length(c.waypoints) > 80, `Costs.Water math.huge, or 20: round the pool instead (${length(b.waypoints).toFixed(1)}, ${length(c.waypoints).toFixed(1)} studs)`);
  const d = solve(dm, [0, -10, -20], [0, 3, 10]);
  check(d.status === 'Success' && d.waypoints[0].pos[1] > -0.05, `from the pool's floor, 10 under: the path starts at the surface, not on the floor (y ${d.waypoints[0].pos[1].toFixed(2)})`);
}
{
  const { dm, V } = tplace(); part(dm, 'Wall', [2, 10, 20], [20, 5, 0]);
  const { status, waypoints: w } = solve(dm, [0, 3, 0], [40, 3, 0]);
  check(status === 'Success' && clearOf(w, [19, 21, -10, 10]) > 1.9 && onGround(V, w), `a part standing on terrain: round it, ${clearOf(w, [19, 21, -10, 10]).toFixed(2)} from it (${length(w).toFixed(1)} studs)`);
  const nav0 = new NavWorld(collectObstacles(dm, isA), {}, terrainOf(dm)), before = occlusion(nav0, w, 1);
  fill(V, [32, 6, 0], [4, 12, 60], 'Rock');
  const after = occlusion(new NavWorld(collectObstacles(dm, isA), {}, terrainOf(dm)), w, 1), at = after > 0 ? w[after - 1].pos[0] : null;
  check(before === -1 && after > 1 && at >= 26 && at <= 34, `occlusion: clear (${before}), then a terrain wall filled at x 32 blocks waypoint ${after} (x ${at && at.toFixed(1)})`);
}
{
  const { dm, V } = tplace();
  for (let x = -96; x <= 96; x += 24) for (let z = -96; z <= 96; z += 24) if ((x + z) % 48 === 0) fill(V, [x, 0, z], [8, 8, 8], 'Rock', 'ball');
  const t0 = performance.now(), { status, waypoints: w } = solve(dm, [-100, 3, -100], [100, 3, 100]), ms = performance.now() - t0;
  check(status === 'Success' && ms < 6000 && onGround(V, w), `200 studs over terrain round boulders: ${status} in ${ms.toFixed(0)} ms (${w.length} waypoints)`);
}
if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
