// Studio's Solid Modeling tools (the Model tab's Union, Negate, Intersect, Separate) as editor
// commands on the selection, each one undo step (web/modeling/csg.js does the geometry):
//   union:     the selected parts joined into a UnionOperation (negated parts among them cut);
//   intersect: what they all occupy, as an IntersectOperation;
//   negate:    each selected part becomes a NegateOperation, and a negation becomes its part again;
//   separate:  each selected operation gives back the parts it was made from.
// The result goes where the first selected part was (its parent), the sources leave (parented to
// nil, so Undo puts them back as they were), and the result is selected, as in Studio.
import { operate, negate, separate, canOperate, OPERATIONS } from '../modeling/csg.js';

const parts = items => items.filter(canOperate);

export const SOLID_COMMANDS = {
  union(opts = {}) { return combine(this, 'union', 'Union', opts); },
  intersect(opts = {}) { return combine(this, 'intersect', 'Intersect', opts); },
  negate({ items = this.selection.items } = {}) {
    const list = parts(items); if (!list.length) return refuse(this, 'Select a part (or a negated part) to negate');
    const out = this.history.run('Negate', tx => list.map(p => {
      const made = p.ClassName === 'NegateOperation' ? separate(this.dm, p) : [negate(this.dm, p)];
      for (const m of made) tx.parent(m, p.parent);
      tx.parent(p, null);
      return made;
    }).flat());
    this.selection.set(out);
    return out;
  },
  separate({ items = this.selection.items } = {}) {
    const list = items.filter(i => OPERATIONS.includes(i.ClassName));
    if (!list.length) return refuse(this, 'Select a union, negation or intersection to separate');
    const out = this.history.run('Separate', tx => list.map(op => { const made = separate(this.dm, op); for (const m of made) tx.parent(m, op.parent); tx.parent(op, null); return made; }).flat());
    this.selection.set(out);
    return out;
  },
};
function combine(cmds, op, label, { items = cmds.selection.items } = {}) {
  const list = parts(items);
  if (list.length < 2) return refuse(cmds, `Select two or more parts to ${label.toLowerCase()}`);
  const first = list.find(p => p.ClassName !== 'NegateOperation') || list[0];
  if (op === 'intersect' && list.some(p => p.ClassName === 'NegateOperation')) return refuse(cmds, 'Negated parts cut a union; they can\'t be intersected');
  let result;
  try { result = operate(cmds.dm, op, first, list.filter(p => p !== first)); } catch (e) { return refuse(cmds, e.message); }
  cmds.history.run(label, tx => { tx.parent(result, first.parent); for (const p of list) tx.parent(p, null); });
  cmds.selection.set([result]);
  return result;
}
function refuse(cmds, message) { if (cmds.onMessage) cmds.onMessage(message); return null; }
