// PathfindingService's solver (mashup-research/ROBLOX_PATHFINDING_2026-11-25.md). Roblox doesn't publish its own,
// so this one is OURS throughout; the API around it (Path, PathWaypoint, statuses, Blocked) is Roblox's, in
// web/datamodel.js. Pure: parts in, waypoints out (Node tests run it: test/pathfinding.test.mjs).
// - A navigation grid of half-stud columns over the start-finish box plus a margin, evaluated lazily as the search
//   reaches it: a column's floors are the tops of the collidable parts under it (exact ray tests, up to 4 levels);
//   a floor is walkable if it slopes under 60 degrees and a vertical capsule of AgentRadius, from a step above it
//   to AgentHeight, is clear (exact shape tests). Characters and the parts of humanoid models aren't obstacles.
// - Moves: to a neighbour (8 ways, no corner cutting) within a 1-stud step; a jump up to 7 studs (AgentCanJump)
//   or a drop of up to 20, reaching across the ledge the clearance keeps the agent from.
// - A* (Costs multiply the cost of walking on a floor of that material), then the walking runs straightened by line
//   of sight over walkable floor (never across a floor costlier than the segment's ends) and spaced by WaypointSpacing. Waypoints stand on the floor; a jump's take-off is
//   Action Jump, Label "Jump".
import { rayPart } from './raycast.js';
import { partShape, capsuleHits, sphereHits } from './runtime/shapes.js';

export const AGENT = { AgentRadius: 2, AgentHeight: 5, AgentCanJump: true, AgentCanClimb: false, WaypointSpacing: 4, Costs: {} };
const CELL = 0.5, STEP = 1, JUMP = 7, DROP = 20, MARGIN = 32, MAX_SIDE = 768, LEVELS = 4, JUMP_COST = 4, MAX_EXPAND = 400000;
const MIN_UP = Math.cos(60 * Math.PI / 180), BUCKET = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The obstacles in a DataModel's Workspace: collidable parts that aren't a character's or a humanoid model's. */
export function collectObstacles(dm, isA) {
  const out = [];
  const walk = inst => {
    for (const c of inst.children) {
      if (c.isCharacter) continue;
      if (c.ClassName === 'Model' && c.children.some(k => k.ClassName === 'Humanoid')) continue; // characters move: not the map
      if (isA(c.ClassName, 'BasePart') && c.ClassName !== 'Terrain' && c.props.CFrame && c.props.CanCollide) {
        const shape = c.ClassName === 'WedgePart' ? 'Wedge' : c.props.Shape === 'Ball' ? 'Ball' : c.props.Shape === 'Cylinder' ? 'Cylinder' : 'Block'; // (meshes as their boxes)
        out.push({ inst: c, cf: c.props.CFrame, size: c.props.Size, shape, material: c.props.Material || 'Plastic' });
      }
      walk(c);
    }
  };
  walk(dm.workspace);
  return out;
}

/** The world as the agent sees it: obstacles with a broad phase, columns' floors, clearance. */
export class NavWorld {
  constructor(parts, agent = AGENT) {
    this.agent = { ...AGENT, ...agent };
    this.buckets = new Map();
    this.parts = parts.map(p => {
      const m = p.cf.m, h = [p.size.x / 2, p.size.y / 2, p.size.z / 2];
      const ext = [0, 1, 2].map(r => Math.abs(m[3 + r * 3]) * h[0] + Math.abs(m[4 + r * 3]) * h[1] + Math.abs(m[5 + r * 3]) * h[2]);
      const [x, y, z, w] = p.cf.toQuat();
      const rec = { ...p, lo: [m[0] - ext[0], m[1] - ext[1], m[2] - ext[2]], hi: [m[0] + ext[0], m[1] + ext[1], m[2] + ext[2]], S: partShape({ ClassName: p.shape === 'Wedge' ? 'WedgePart' : 'Part', props: { Size: p.size, Position: { x: m[0], y: m[1], z: m[2] }, Shape: p.shape === 'Block' || p.shape === 'Wedge' ? 'Block' : p.shape } }, { x, y, z, w }) };
      for (let bx = Math.floor(rec.lo[0] / BUCKET); bx <= Math.floor(rec.hi[0] / BUCKET); bx++)
        for (let bz = Math.floor(rec.lo[2] / BUCKET); bz <= Math.floor(rec.hi[2] / BUCKET); bz++) {
          const k = bx + ',' + bz; if (!this.buckets.has(k)) this.buckets.set(k, []); this.buckets.get(k).push(rec);
        }
      return rec;
    });
    this.top = Math.max(0, ...this.parts.map(p => p.hi[1])) + 1;
  }
  near(x0, z0, x1, z1) {
    const out = new Set();
    for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++)
      for (let bz = Math.floor(z0 / BUCKET); bz <= Math.floor(z1 / BUCKET); bz++) for (const p of this.buckets.get(bx + ',' + bz) || []) out.add(p);
    return out;
  }
  // The floors under (x, z): [{ h, up, material }] from the top down (the top of each part there).
  floors(x, z) {
    const out = [];
    for (const p of this.near(x, z, x, z)) {
      if (x < p.lo[0] || x > p.hi[0] || z < p.lo[2] || z > p.hi[2]) continue;
      const hit = rayPart([x, this.top, z], [0, -1, 0], this.top - p.lo[1] + 1, p);
      if (hit) out.push({ h: this.top - hit.t, up: hit.normal[1], material: p.material });
    }
    out.sort((a, b) => b.h - a.h);
    const kept = [];
    for (const f of out) if ((!kept.length || kept[kept.length - 1].h - f.h > 0.05) && !this.solid(x, f.h + 0.05, z)) kept.push(f); // (a top inside another part is covered: no floor)
    return kept.slice(0, LEVELS);
  }
  // Room for the agent standing on a floor at height h (sloping: the capsule starts higher, so the slope itself
  // doesn't count).
  clear(x, h, z, up = 1) {
    const r = this.agent.AgentRadius, slope = up < 1 ? Math.sqrt(Math.max(0, 1 - up * up)) / Math.max(up, 1e-3) : 0;
    const y0 = h + STEP + r + r * slope, y1 = Math.max(y0, h + this.agent.AgentHeight - r);
    for (const p of this.near(x - r, z - r, x + r, z + r)) {
      if (p.hi[1] < y0 - r || p.lo[1] > y1 + r || p.hi[0] < x - r || p.lo[0] > x + r || p.hi[2] < z - r || p.lo[2] > z + r) continue;
      if (capsuleHits(x, y0, z, x, y1, z, r, p.S)) return false;
    }
    return true;
  }
  /** Is the point inside a part? */
  solid(x, y, z) {
    for (const p of this.near(x, z, x, z)) if (y >= p.lo[1] && y <= p.hi[1] && sphereHits(x, y, z, 0.01, p.S)) return true;
    return false;
  }
}

// The grid over a region: columns evaluated as the search reaches them.
class Grid {
  constructor(nav, x0, z0, nx, nz) { Object.assign(this, { nav, x0, z0, nx, nz }); this.cols = new Map(); }
  cx(i) { return this.x0 + (i + 0.5) * CELL; }
  cz(k) { return this.z0 + (k + 0.5) * CELL; }
  col(i, k) {
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return null;
    const key = k * this.nx + i;
    let c = this.cols.get(key);
    if (!c) {
      const x = this.cx(i), z = this.cz(k);
      c = this.nav.floors(x, z).map(f => ({ ...f, ok: f.up >= MIN_UP && this.nav.clear(x, f.h, z, f.up) }));
      this.cols.set(key, c);
    }
    return c;
  }
  // The walkable level in column (i, k) within `tol` of height h (the nearest), or -1.
  level(i, k, h, tol = STEP) {
    const c = this.col(i, k); if (!c) return -1;
    let best = -1, bd = Infinity;
    c.forEach((f, l) => { const d = Math.abs(f.h - h); if (f.ok && d <= tol && d < bd) { bd = d; best = l; } });
    return best;
  }
}

const key = (g, i, k, l) => (k * g.nx + i) * LEVELS + l;

/** A path from start to finish ({ x, y, z }): { status, waypoints: [{ pos: [x, y, z], action, label }] }. */
export function computePath(nav, start, finish) {
  const A = nav.agent;
  if (nav.solid(start.x, start.y, start.z)) return { status: 'FailStartNotEmpty', waypoints: [] };
  if (nav.solid(finish.x, finish.y, finish.z)) return { status: 'FailFinishNotEmpty', waypoints: [] };
  let x0 = Math.min(start.x, finish.x) - MARGIN, x1 = Math.max(start.x, finish.x) + MARGIN, z0 = Math.min(start.z, finish.z) - MARGIN, z1 = Math.max(start.z, finish.z) + MARGIN;
  if (x1 - x0 > MAX_SIDE || z1 - z0 > MAX_SIDE) return { status: 'NoPath', waypoints: [] }; // (OURS: too far to search)
  x0 = Math.floor(x0); z0 = Math.floor(z0);
  const g = new Grid(nav, x0, z0, Math.ceil((x1 - x0) / CELL), Math.ceil((z1 - z0) / CELL));
  // A point's node: the floor under it (the highest at or below it, a little slack), or the nearest walkable one
  // within the agent's reach of it.
  const anchor = p => {
    const i = Math.floor((p.x - x0) / CELL), k = Math.floor((p.z - z0) / CELL), c = g.col(i, k) || [];
    const fl = c.find(f => f.h <= p.y + 0.5);
    if (!fl) return null;
    const R = Math.ceil((A.AgentRadius + 2) / CELL);
    let best = null, bd = Infinity;
    for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
      const l = g.level(i + di, k + dk, fl.h); if (l < 0) continue;
      const d = di * di + dk * dk; if (d < bd) { bd = d; best = { i: i + di, k: k + dk, l }; }
    }
    return best;
  };
  const s = anchor(start), f = anchor(finish);
  if (!s || !f) return { status: 'NoPath', waypoints: [] };
  const hOf = n => g.col(n.i, n.k)[n.l].h;
  const goalKey = key(g, f.i, f.k, f.l), fx = g.cx(f.i), fz = g.cz(f.k), fh = hOf(f);
  const heur = n => Math.hypot(g.cx(n.i) - fx, g.cz(n.k) - fz, (hOf(n) - fh) * 0.5);
  const costOf = material => { const c = A.Costs && A.Costs[material]; return typeof c === 'number' ? Math.max(0, c) : 1; };
  // A binary heap of [f, node].
  const heap = [], push = (fv, n) => { heap.push([fv, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const gScore = new Map(), from = new Map(), sk = key(g, s.i, s.k, s.l);
  gScore.set(sk, 0); push(heur(s), s);
  let found = false, expanded = 0;
  while (heap.length && expanded < MAX_EXPAND) {
    const [, n] = pop(), nk = key(g, n.i, n.k, n.l);
    if (nk === goalKey) { found = true; break; }
    expanded++;
    const h = hOf(n), gn = gScore.get(nk);
    for (const [di, dk] of DIRS) {
      const diag = di && dk;
      // A step to the neighbour.
      const l = g.level(n.i + di, n.k + dk, h);
      if (l >= 0 && (!diag || (g.level(n.i + di, n.k, h) >= 0 && g.level(n.i, n.k + dk, h) >= 0))) {
        const m = { i: n.i + di, k: n.k + dk, l }, mk = key(g, m.i, m.k, l), c = g.col(m.i, m.k)[l];
        const t = gn + (diag ? Math.SQRT2 : 1) * CELL * costOf(c.material) + Math.abs(c.h - h) * 0.5;
        if (t < (gScore.get(mk) ?? Infinity)) { gScore.set(mk, t); from.set(mk, { prev: nk, node: n, kind: 'walk' }); push(t + heur(m), m); }
        continue;
      }
      if (diag) continue; // jumps and drops go straight
      // A jump up or a drop down, across the ledge: the first column along this way with a walkable floor in reach.
      const reach = Math.ceil((2 * A.AgentRadius + 2) / CELL);
      for (let d = 1; d <= reach; d++) {
        const ci = n.i + di * d, ck = n.k + dk * d, c = g.col(ci, ck);
        if (!c) break;
        if (c.length && c[0].h > h + JUMP) break; // a wall too high to jump
        let pick = -1, kind = null;
        c.forEach((fl, li) => {
          if (pick >= 0 || !fl.ok) return;
          const dh = fl.h - h;
          if (dh > STEP && dh <= JUMP && A.AgentCanJump) { pick = li; kind = 'jump'; }
          else if (dh < -STEP && dh >= -DROP) { pick = li; kind = 'drop'; }
          else if (Math.abs(dh) <= STEP && d > 1) { pick = -2; } // level ground again: walking covers it
        });
        if (pick === -2) break;
        if (pick >= 0) {
          const m = { i: ci, k: ck, l: pick }, mk = key(g, ci, ck, pick), cf = c[pick];
          const t = gn + d * CELL * costOf(cf.material) + (kind === 'jump' ? JUMP_COST : 1);
          if (t < (gScore.get(mk) ?? Infinity)) { gScore.set(mk, t); from.set(mk, { prev: nk, node: n, kind }); push(t + heur(m), m); }
          break;
        }
      }
    }
  }
  if (!found) return { status: 'NoPath', waypoints: [] };
  // The nodes from start to goal, each with how it was reached.
  const chain = [{ node: f, kind: 'walk' }];
  for (let k = goalKey; from.has(k); ) { const e = from.get(k); chain[0].kind = e.kind; chain.unshift({ node: e.node, kind: 'walk' }); k = e.prev; }
  const P = n => [g.cx(n.i), hOf(n), g.cz(n.k)];
  // Straight walking between a and b (line of sight over walkable floor, each sample within a step of the last).
  // (Not across a floor costlier than its ends': the search went round it.)
  const straight = (a, b) => {
    const pa = P(a), pb = P(b), L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), n = Math.max(1, Math.ceil(L / 0.25));
    const most = Math.max(costOf(g.col(a.i, a.k)[a.l].material), costOf(g.col(b.i, b.k)[b.l].material));
    let h = pa[1];
    for (let j = 1; j <= n; j++) {
      const x = pa[0] + (pb[0] - pa[0]) * j / n, z = pa[2] + (pb[2] - pa[2]) * j / n, i = Math.floor((x - x0) / CELL), k = Math.floor((z - z0) / CELL);
      const l = g.level(i, k, h); if (l < 0) return false;
      h = g.col(i, k)[l].h;
      if (costOf(g.col(i, k)[l].material) > most) return false;
      // (the agent's width: the columns beside the line are walkable too)
      for (const [oi, ok] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.level(i + oi, k + ok, h) < 0 && Math.hypot(g.cx(i + oi) - x, g.cz(k + ok) - z) < 0.75 * CELL) return false;
    }
    return true;
  };
  // Corners: walking runs straightened; a jump or drop keeps both its ends.
  const corners = [{ node: chain[0].node, kind: 'walk' }];
  let a = 0;
  for (let j = 1; j < chain.length; j++) {
    if (chain[j].kind !== 'walk') { if (corners[corners.length - 1].node !== chain[j - 1].node) corners.push({ node: chain[j - 1].node, kind: 'walk' }); corners.push({ node: chain[j].node, kind: chain[j].kind }); a = j; continue; }
    if (j + 1 < chain.length && chain[j + 1].kind === 'walk' && straight(chain[a].node, chain[j + 1].node)) continue;
    corners.push({ node: chain[j].node, kind: 'walk' }); a = j;
  }
  // Waypoints: the start, the corners with WaypointSpacing between, the finish; a jump's take-off says so.
  const sp = Math.max(0.5, A.WaypointSpacing || 4), wps = [];
  const add = (pos, action = 'Walk', label = '') => wps.push({ pos, action, label });
  const floorAt = (x, z, h) => { const i = Math.floor((x - x0) / CELL), k = Math.floor((z - z0) / CELL), l = g.level(i, k, h, STEP + 0.5); return l >= 0 ? g.col(i, k)[l].h : h; };
  add([start.x, hOf(s), start.z]);
  for (let j = 1; j < corners.length; j++) {
    const pa = j === 1 ? wps[0].pos : P(corners[j - 1].node), pb = j === corners.length - 1 ? [finish.x, hOf(f), finish.z] : P(corners[j].node);
    if (corners[j].kind === 'jump') { wps[wps.length - 1].action = 'Jump'; wps[wps.length - 1].label = 'Jump'; add(pb); continue; }
    if (corners[j].kind === 'drop') { add(pb); continue; }
    const L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), n = Math.max(1, Math.ceil(L / sp - 1e-9));
    let h = pa[1];
    for (let q = 1; q < n; q++) { const x = pa[0] + (pb[0] - pa[0]) * q / n, z = pa[2] + (pb[2] - pa[2]) * q / n; h = floorAt(x, z, h); add([x, h, z]); }
    add(pb);
  }
  if (corners.length === 1) add([finish.x, hOf(f), finish.z]);
  return { status: 'Success', waypoints: wps };
}

/** The first waypoint (1-based) from `from` whose way there is now blocked, or -1. */
export function occlusion(nav, waypoints, from = 1) {
  for (let j = Math.max(1, from); j < waypoints.length; j++) {
    const a = waypoints[j - 1], b = waypoints[j];
    if (a.action === 'Jump' || Math.abs(b.pos[1] - a.pos[1]) > STEP) { // a jump or a drop: both ends still stand
      const fb = nav.floors(b.pos[0], b.pos[2]).find(f => Math.abs(f.h - b.pos[1]) < 0.5);
      if (!fb || !nav.clear(b.pos[0], fb.h, b.pos[2], fb.up)) return j + 1;
      continue;
    }
    const L = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]), n = Math.max(1, Math.ceil(L / 0.5));
    let h = a.pos[1];
    for (let q = 1; q <= n; q++) {
      const x = a.pos[0] + (b.pos[0] - a.pos[0]) * q / n, z = a.pos[2] + (b.pos[2] - a.pos[2]) * q / n;
      const fl = nav.floors(x, z).find(f => Math.abs(f.h - h) <= STEP + 0.25);
      if (!fl || fl.up < MIN_UP || !nav.clear(x, fl.h, z, fl.up)) return j + 1;
      h = fl.h;
    }
  }
  return -1;
}
