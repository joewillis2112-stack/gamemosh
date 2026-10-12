// The editor's undo history (after ArtCraft's HistoryManager: one stack of
// recorded actions, redo cleared by any new action). Every change the editor
// makes to the DataModel goes through a Transaction, which records each
// property change and reparent with its old and new value, so undo and redo
// are the same operations replayed backwards or forwards. Deleting parents an
// instance to nil (as Roblox Studio does), so undo can put it back as it was.
// Selection isn't part of the history. Engine-free: Node tests run it as is.

export class Transaction {
  constructor(dm) { this.dm = dm; this.ops = []; }
  // A property change. Records what the DataModel actually stored (it may clamp).
  set(inst, key, value) {
    if (key === 'Parent') return this.parent(inst, value);
    const before = inst.props[key];
    this.dm.set(inst, key, value);
    const after = inst.props[key];
    if (before !== after) this.ops.push({ op: 'set', inst, key, before, after });
  }
  parent(inst, p) {
    const before = inst.parent;
    if (before === p) return;
    this.dm.setParent(inst, p);
    this.ops.push({ op: 'parent', inst, before, after: p });
  }
  // A new instance with properties, then parented (so its first appearance is complete).
  create(cls, parent, props = {}) {
    const inst = this.dm.create(cls);
    if (!inst) throw new Error(`Unable to create an Instance of type "${cls}"`);
    for (const [k, v] of Object.entries(props)) this.dm.set(inst, k, v);
    this.parent(inst, parent);
    return inst;
  }
  // A change the caller already made (a gizmo drag): record it as from -> to.
  recordSet(inst, key, before, after) { if (before !== after) this.ops.push({ op: 'set', inst, key, before, after }); }
}

export class History {
  constructor(dm, { capacity = 200, onChange = null } = {}) {
    this.dm = dm; this.capacity = capacity; this.onChange = onChange;
    this.past = []; this.future = [];
  }
  // Run fn(tx) as one undoable step. Nothing recorded if it changed nothing.
  // If fn throws, what it did so far is undone and the error passes on.
  run(label, fn) {
    const tx = new Transaction(this.dm);
    let result;
    try { result = fn(tx); }
    catch (e) { replay(this.dm, tx.ops, 'before'); throw e; }
    this.push(label, tx.ops);
    return result;
  }
  push(label, ops) {
    if (!ops.length) return false;
    this.past.push({ label, ops });
    if (this.past.length > this.capacity) this.past.shift();
    this.future.length = 0;
    this.changed();
    return true;
  }
  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
  undo() {
    const step = this.past.pop(); if (!step) return null;
    replay(this.dm, step.ops, 'before');
    this.future.push(step); this.changed();
    return step.label;
  }
  redo() {
    const step = this.future.pop(); if (!step) return null;
    replay(this.dm, step.ops, 'after');
    this.past.push(step); this.changed();
    return step.label;
  }
  changed() { this.onChange && this.onChange({ canUndo: this.canUndo(), canRedo: this.canRedo(), undo: this.past.at(-1)?.label, redo: this.future.at(-1)?.label }); }
}

// Apply a step's ops: forwards to 'after', or backwards to 'before'.
function replay(dm, ops, side) {
  const list = side === 'before' ? [...ops].reverse() : ops;
  for (const o of list) {
    if (o.op === 'set') dm.set(o.inst, o.key, o[side]);
    else dm.setParent(o.inst, o[side]);
  }
}
