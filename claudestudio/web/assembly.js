// Assemblies (Roblox; creator-docs physics/assemblies.md and the JointInstance, WeldConstraint and
// Motor6D pages, read 2026-11-23): parts joined by rigid joints (Weld, Snap, Motor, Motor6D,
// WeldConstraint) move as one body.
//  - A joint is active when it's enabled, in the Workspace, and joins two different parts that are
//    both in the Workspace. A joint that would close a cycle, or join two assemblies that each have an
//    anchored part, is inactive (Active false); it can come back when the graph changes.
//  - The root part: an anchored one; else non-Massless first, then RootPriority, then size (largest
//    face area), with multipliers for Seats, then HumanoidRootPart, then Torso (OURS: the multipliers'
//    values: 20, 10, 5). It stays put when a joint's C0, C1 or Transform changes; the parts down the
//    tree from it follow.
//  - JointInstance: Part1 = Part0 * C0 * T * C1:Inverse(), T a Motor's angle about Z and a Motor6D's
//    Transform (UNSURE: the order of the two when both are set). WeldConstraint: the offset the parts
//    had when it became active, re-taken when Position or Orientation is set on one of its parts.
//  - Setting a part's CFrame moves its whole assembly (every part keeps its offset). Setting Position
//    or Orientation moves that part alone and re-takes its WeldConstraints' offsets (WeldConstraint's
//    page); its JointInstances then place it again from the root (UNSURE: Roblox's behaviour for a
//    Weld's part there isn't documented).
// The graph is rebuilt lazily: marked stale by any change that matters, rebuilt on the next read of a
// placement (the Luau binding flushes) or frame (World.step).
import { CF } from './cframe.js';

const RIGID = new Set(['Weld', 'Snap', 'Motor', 'Motor6D', 'WeldConstraint', 'ManualWeld', 'Glue']);
export const isJoint = cls => RIGID.has(cls);
const ROOT_BOOST = { Seat: 20, VehicleSeat: 20 };

export class Assemblies {
  constructor(dm, isA) {
    this.dm = dm; this.isA = isA;
    this.stale = true;
    this.of = new Map(); // part -> assembly { root, parts, anchored, edges: Map(part -> [parent, joint]) }
    this.list = [];
    this.offsets = new WeakMap(); // WeldConstraint -> its offset (Part0's frame to Part1's)
    this.moved = null; // set while this writes placements (so its own writes don't re-stale it)
    dm.watch((inst, key) => this.changed(inst, key));
  }

  changed(inst, key) {
    if (this.moved) return;
    const cls = inst.ClassName;
    if (isJoint(cls)) {
      if (cls === 'WeldConstraint' && (key === 'Part0' || key === 'Part1' || key === 'Enabled' || key === 'Parent')) this.offsets.delete(inst); // re-taken when it becomes active
      this.stale = true;
    } else if (this.isA(cls, 'BasePart')) {
      if (key === 'Parent' || key === 'Anchored' || key === 'Massless' || key === 'RootPriority' || key === 'Size' || key === 'Name') this.stale = true;
    } else if (key === 'Parent' && (inst.children.length)) this.stale = true; // a model holding parts or joints moved in or out
  }

  inWorkspace(inst) { for (let p = inst; p; p = p.parent) if (p === this.dm.workspace) return true; return false; }

  /** Rebuild the graph if stale and place every assembly's parts from its root. */
  flush() {
    if (!this.stale) return;
    this.stale = false;
    const dm = this.dm, parts = [], joints = [];
    const walk = inst => { for (const c of inst.children) { if (this.isA(c.ClassName, 'BasePart') && c.ClassName !== 'Terrain' && c.props.CFrame) parts.push(c); else if (isJoint(c.ClassName)) joints.push(c); walk(c); } };
    walk(dm.workspace);
    // Joints can also live outside the Workspace (JointsService, a part's own folder elsewhere): only
    // the Workspace's count (JointInstance.Active).
    const parent = new Map(parts.map(p => [p, p])), anchored = new Map(parts.map(p => [p, !!p.props.Anchored]));
    const find = p => { while (parent.get(p) !== p) { parent.set(p, parent.get(parent.get(p))); p = parent.get(p); } return p; };
    const inParts = new Set(parts), used = [];
    const here = new Set(joints);
    for (const j of this.activeJoints || []) if (!here.has(j)) j.props.Active = false; // left the Workspace
    for (const j of joints) {
      const P = j.props, a = P.Part0, b = P.Part1;
      let active = P.Enabled !== false && a && b && a !== b && inParts.has(a) && inParts.has(b);
      if (active) {
        const ra = find(a), rb = find(b);
        if (ra === rb || (anchored.get(ra) && anchored.get(rb))) active = false; // a cycle, or two anchored assemblies
        else { parent.set(rb, ra); anchored.set(ra, anchored.get(ra) || anchored.get(rb)); used.push(j); }
      }
      if (P.Active !== !!active) P.Active = !!active; // read-only to scripts: no Changed (OURS)
      if (j.ClassName === 'Motor6D') P.ChildName = b ? b.props.Name : '';
    }
    // Groups, roots, trees.
    const groups = new Map();
    for (const p of parts) { const r = find(p); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
    const adj = new Map();
    for (const j of used) for (const [x, y] of [[j.props.Part0, j.props.Part1], [j.props.Part1, j.props.Part0]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push([y, j]); }
    for (const p of this.of.keys()) if (!inParts.has(p)) p.props.AssemblyRootPart = null; // left the Workspace (AssemblyRootPart: nil there)
    this.activeJoints = used;
    this.of = new Map(); this.list = [];
    for (const members of groups.values()) {
      const root = rootOf(members);
      const a = { root, parts: members, anchored: members.some(p => p.props.Anchored), edges: new Map() };
      const seen = new Set([root]), queue = [root];
      while (queue.length) {
        const x = queue.shift();
        for (const [y, j] of adj.get(x) || []) if (!seen.has(y)) { seen.add(y); a.edges.set(y, [x, j]); queue.push(y); }
      }
      // A WeldConstraint's offset: taken when it becomes active, from where its parts are now.
      for (const [, [, j]] of a.edges) if (j.ClassName === 'WeldConstraint' && !this.offsets.has(j)) this.offsets.set(j, j.props.Part0.props.CFrame.inverse().mul(j.props.Part1.props.CFrame));
      for (const p of members) { this.of.set(p, a); if (p.props.AssemblyRootPart !== root) p.props.AssemblyRootPart = root; }
      this.list.push(a);
      this.place(a);
    }
    this.onRebuild && this.onRebuild(); // the World: bodies for the new assemblies
  }

  /** A joint's frame from `from` to the other part (Part1 = Part0 * rel; Part0 = Part1 * rel:Inverse()). */
  rel(j) {
    if (j.ClassName === 'WeldConstraint') return this.offsets.get(j) || new CF();
    const P = j.props;
    let m = P.C0 || new CF();
    if (P.CurrentAngle) m = m.mul(CF.fromOrientation(0, 0, 0, 0, 0, P.CurrentAngle * 180 / Math.PI));
    if (j.ClassName === 'Motor6D' && P.Transform) m = m.mul(P.Transform);
    return m.mul((P.C1 || new CF()).inverse());
  }

  /** Place an assembly's parts from its root (the root stays). */
  place(a) {
    const order = [...a.edges.keys()]; // BFS order: each part's parent placed before it
    this.moved = true;
    try {
      for (const p of order) {
        const [from, j] = a.edges.get(p), r = this.rel(j);
        const cf = j.props.Part0 === from ? from.props.CFrame.mul(r) : from.props.CFrame.mul(r.inverse());
        this.write(p, cf);
      }
    } finally { this.moved = null; }
  }

  // A placement written by the assembly (as physics writes: no Changed events, watchers told).
  write(p, cf) {
    const P = p.props;
    if (P.CFrame && P.CFrame.equals(cf)) return;
    P.CFrame = cf;
    if ('Position' in P) P.Position = new P.Position.constructor(cf.x, cf.y, cf.z);
    if ('Orientation' in P) { const [ox, oy, oz] = cf.toOrientation(); P.Orientation = new P.Orientation.constructor(Math.fround(ox), Math.fround(oy), Math.fround(oz)); }
    this.dm.notify(p, 'CFrame');
  }

  assemblyOf(part) { this.flush(); return this.of.get(part) || null; }

  /** Before a script sets `part`'s CFrame to `cf`: the rest of its assembly moves with it. */
  moveWith(part, cf) {
    const a = this.assemblyOf(part);
    if (!a || a.parts.length < 2) return;
    const delta = cf.mul(part.props.CFrame.inverse());
    this.moved = true;
    try { for (const p of a.parts) if (p !== part) this.write(p, delta.mul(p.props.CFrame)); } finally { this.moved = null; }
  }

  /** After a script set `part`'s Position or Orientation: its WeldConstraints take their offsets anew,
   *  then the assembly is placed from its root again. */
  reweld(part) {
    const a = this.assemblyOf(part);
    if (!a) return;
    for (const [, [, j]] of a.edges) if (j.ClassName === 'WeldConstraint' && (j.props.Part0 === part || j.props.Part1 === part)) this.offsets.set(j, j.props.Part0.props.CFrame.inverse().mul(j.props.Part1.props.CFrame));
    this.place(a); // from the root: a moved root takes its tree along; a moved child is placed by its JointInstances
  }
}

// The root part (assemblies.md): anchored first; then not Massless; then RootPriority; then size.
function rootOf(members) {
  const score = p => {
    const S = p.props.Size || { x: 1, y: 1, z: 1 }, face = Math.max(S.x * S.y, S.y * S.z, S.x * S.z);
    const k = ROOT_BOOST[p.ClassName] || (p.props.Name === 'HumanoidRootPart' ? 10 : p.props.Name === 'Torso' ? 5 : 1);
    return [p.props.Anchored ? 1 : 0, p.props.Massless ? 0 : 1, p.props.RootPriority || 0, face * k];
  };
  let best = members[0], bs = score(best);
  for (const p of members.slice(1)) {
    const s = score(p);
    for (let i = 0; i < s.length; i++) { if (s[i] > bs[i]) { best = p; bs = s; break; } if (s[i] < bs[i]) break; }
  }
  return best;
}
