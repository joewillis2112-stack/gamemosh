// Every editor action is a named command (the Craft apps' rule: one registry
// behind the menus, the keyboard and scripting), run as one undoable step.
// Engine-free: commands change the DataModel; the renderer follows its changes.
// Studio's behaviours kept here:
// - Insert puts a new part in front of the camera, against the face it hits;
//   a new Part is 4x1x2 grey Plastic and anchored (UNSURE: whether Studio anchors inserted parts).
// - Delete parents to nil (undo brings it back); Duplicate copies next to the
//   original, raised by its height; Group makes a Model at the common parent.
// - Move snaps to the grid increment, Rotate to the rotate increment (Studio: 1 stud, 15°).
import { CF } from '../cframe.js';
import { V3, isA } from '../datamodel.js';
import { History } from './history.js';

export const SNAP = { move: 1, rotate: 15 }; // Studio's defaults (studs, degrees)

export class Selection {
  constructor() { this.items = []; this.listeners = []; }
  get primary() { return this.items[this.items.length - 1] || null; }
  set(list) { this.items = [...new Set(list.filter(Boolean))]; this.emit(); }
  toggle(inst) { this.set(this.items.includes(inst) ? this.items.filter(i => i !== inst) : [...this.items, inst]); }
  clear() { this.set([]); }
  has(inst) { return this.items.includes(inst); }
  // Drop anything no longer in the game (deleted, or undone away).
  prune(dm) { const keep = this.items.filter(i => inGame(dm, i)); if (keep.length !== this.items.length) this.set(keep); }
  onChange(fn) { this.listeners.push(fn); }
  emit() { for (const f of this.listeners) f(this.items); }
}
export function inGame(dm, inst) { for (let a = inst; a; a = a.parent) if (a === dm.game) return true; return false; }

export class Commands {
  constructor(dm, { selection = new Selection(), history = new History(dm), view = null } = {}) {
    this.dm = dm; this.selection = selection; this.history = history;
    this.view = view; // () => { origin: V3-like, dir: unit } of the camera, for Insert
    this.registry = new Map();
    for (const [name, fn] of Object.entries(BUILTIN)) this.register(name, fn);
  }
  register(name, fn) { this.registry.set(name, fn); }
  list() { return [...this.registry.keys()]; }
  // Run a command by name. Returns its result; undo/redo are commands too.
  run(name, args = {}) {
    const fn = this.registry.get(name);
    if (!fn) throw new Error(`no command "${name}"`);
    const out = fn.call(this, args);
    this.selection.prune(this.dm);
    return out;
  }
}

const parts = items => items.filter(i => isA(i.ClassName, 'BasePart'));
const snap = (v, step) => step > 0 ? Math.round(v / step) * step : v;

const BUILTIN = {
  undo() { return this.history.undo(); },
  redo() { return this.history.redo(); },
  select({ items = [], add = false }) { add ? items.forEach(i => this.selection.toggle(i)) : this.selection.set(items); return this.selection.items; },

  // Insert an instance. A part goes where the camera looks: on the first surface
  // within 64 studs, else 16 studs ahead; its bottom on the surface; snapped to the grid.
  insert({ className = 'Part', parent = null, props = {} }) {
    const where = parent || this.dm.workspace;
    return this.history.run('Insert ' + className, tx => {
      const extra = {};
      if (isA(className, 'BasePart')) {
        Object.assign(extra, { Anchored: true });
        const size = props.Size || new V3(4, 1, 2);
        let p = new V3(0, size.y / 2, 0);
        const v = this.view && this.view();
        if (v) {
          const hit = this.dm.raycast(v.origin, new V3(v.dir.x * 64, v.dir.y * 64, v.dir.z * 64));
          if (hit.length) {
            // Against the face it hits: out along the normal by the new part's half-extent that way;
            // snapped to the grid across the face, not along the normal (so it sits flush).
            const at = hit[1], n = hit[2], out = Math.abs(n.x) * size.x / 2 + Math.abs(n.y) * size.y / 2 + Math.abs(n.z) * size.z / 2;
            const q = [at.x + n.x * out, at.y + n.y * out, at.z + n.z * out], nn = [n.x, n.y, n.z];
            p = new V3(...q.map((c, k) => Math.abs(nn[k]) > 0.999 ? c : snap(c, SNAP.move)));
          } else p = new V3(...[v.origin.x + v.dir.x * 16, v.origin.y + v.dir.y * 16, v.origin.z + v.dir.z * 16].map(c => snap(c, SNAP.move)));
        }
        extra.CFrame = new CF([p.x, p.y, p.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
      }
      const inst = tx.create(className, where, { ...extra, ...props });
      this.selection.set([inst]);
      return inst;
    });
  },

  delete({ items = this.selection.items } = {}) {
    const list = top(items).filter(i => !isService(i));
    if (!list.length) return 0;
    this.history.run('Delete', tx => list.forEach(i => tx.parent(i, null)));
    this.selection.clear();
    return list.length;
  },

  duplicate({ items = this.selection.items } = {}) {
    const list = top(items).filter(i => !isService(i) && i.props.Archivable);
    if (!list.length) return [];
    const copies = this.history.run('Duplicate', tx => list.map(i => {
      const c = this.dm.clone(i);
      if (isA(c.ClassName, 'BasePart')) { const cf = c.props.CFrame; c.props.CFrame = cf.withPosition(cf.x, cf.y + c.props.Size.y, cf.z); c.props.Position = new V3(cf.x, cf.y + c.props.Size.y, cf.z); }
      tx.parent(c, i.parent);
      return c;
    }));
    this.selection.set(copies);
    return copies;
  },

  // Group into a Model (Studio: Ctrl+G), under the first item's parent.
  group({ items = this.selection.items, name = 'Model' } = {}) {
    const list = top(items).filter(i => !isService(i));
    if (!list.length) return null;
    const model = this.history.run('Group', tx => {
      const m = tx.create('Model', list[0].parent, { Name: name });
      list.forEach(i => tx.parent(i, m));
      return m;
    });
    this.selection.set([model]);
    return model;
  },
  ungroup({ items = this.selection.items } = {}) {
    const models = items.filter(i => i.ClassName === 'Model');
    if (!models.length) return [];
    const freed = this.history.run('Ungroup', tx => models.flatMap(m => { const kids = [...m.children]; kids.forEach(k => tx.parent(k, m.parent)); tx.parent(m, null); return kids; }));
    this.selection.set(freed);
    return freed;
  },

  setProperty({ items = this.selection.items, key, value }) {
    const list = items.filter(i => key in i.props);
    return this.history.run('Set ' + key, tx => list.forEach(i => tx.set(i, key, value)));
  },

  // Move by a world offset (snapped), rotate about the selection's centre by
  // degrees around a world axis, or a finished gizmo drag: { before, after } maps.
  move({ items = this.selection.items, by }) {
    const list = parts(allParts(items));
    return this.history.run('Move', tx => list.forEach(p => { const cf = p.props.CFrame; tx.set(p, 'CFrame', cf.withPosition(cf.x + by.x, cf.y + by.y, cf.z + by.z)); }));
  },
  rotate({ items = this.selection.items, axis = 'y', degrees = SNAP.rotate }) {
    const list = parts(allParts(items));
    if (!list.length) return;
    const c = centre(list), a = degrees * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const R = axis === 'x' ? [1, 0, 0, 0, cs, -sn, 0, sn, cs] : axis === 'y' ? [cs, 0, sn, 0, 1, 0, -sn, 0, cs] : [cs, -sn, 0, sn, cs, 0, 0, 0, 1];
    const about = new CF([c.x, c.y, c.z, ...R]).mul(new CF([-c.x, -c.y, -c.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
    return this.history.run('Rotate', tx => list.forEach(p => tx.set(p, 'CFrame', about.mul(p.props.CFrame))));
  },
  // The end of a drag (gizmo or modal): the DataModel is already at `after`; record it.
  commitDrag({ label = 'Drag', changes }) {
    const ops = [];
    const tx = { ops, recordSet(inst, key, before, after) { if (before !== after && !(before?.equals && before.equals(after))) ops.push({ op: 'set', inst, key, before, after }); } };
    for (const c of changes) tx.recordSet(c.inst, c.key, c.before, c.after);
    return this.history.push(label, ops);
  },
};

// The items without any that are inside another listed item.
function top(items) { const set = new Set(items); return items.filter(i => { for (let a = i.parent; a; a = a.parent) if (set.has(a)) return false; return true; }); }
function isService(i) { return !i.parent || i.parent === i.dm.game || i === i.dm.workspace.props.CurrentCamera; }
// The parts an item stands for: itself, or a Model's descendant parts.
export function allParts(items) {
  const out = [];
  const walk = i => { if (isA(i.ClassName, 'BasePart') && i.ClassName !== 'Terrain') out.push(i); for (const c of i.children) walk(c); }; // Terrain isn't a box to move
  top(items).forEach(walk);
  return out;
}
export function centre(list) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of list) {
    const cf = p.props.CFrame.m, h = [p.props.Size.x / 2, p.props.Size.y / 2, p.props.Size.z / 2];
    for (let k = 0; k < 3; k++) {
      const e = Math.abs(cf[3 + k * 3]) * h[0] + Math.abs(cf[4 + k * 3]) * h[1] + Math.abs(cf[5 + k * 3]) * h[2];
      lo[k] = Math.min(lo[k], cf[k] - e); hi[k] = Math.max(hi[k], cf[k] + e);
    }
  }
  return new V3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
}
