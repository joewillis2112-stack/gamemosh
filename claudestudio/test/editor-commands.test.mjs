// The editor's commands and undo history (web/editor/commands.js, history.js),
// engine-free: each command's effect on the DataModel, then undo back to the
// exact starting state and redo forward to the exact end state.
import { DataModel, V3, C3 } from '../web/datamodel.js';
import { CF } from '../web/cframe.js';
import { Commands } from '../web/editor/commands.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const near = (a, b, e = 1e-4) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= e);

const dm = new DataModel();
// A floor to insert onto, and a camera at (0, 10, 20) looking at the origin.
const floor = dm.create('Part'); floor.props.Name = 'Floor'; dm.set(floor, 'Size', new V3(100, 2, 100)); dm.set(floor, 'CFrame', new CF([0, -1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])); floor.props.Anchored = true; dm.setParent(floor, dm.workspace);
const d = [0, -10, -20], l = Math.hypot(...d);
const C = new Commands(dm, { view: () => ({ origin: new V3(0, 10, 20), dir: new V3(d[0] / l, d[1] / l, d[2] / l) }) });

// A snapshot of everything under Workspace (names, parents, CFrames, sizes, colours), to compare states exactly.
const snap = () => JSON.stringify((function walk(i) { return { c: i.ClassName, n: i.props.Name, cf: i.props.CFrame && i.props.CFrame.m, s: i.props.Size && [i.props.Size.x, i.props.Size.y, i.props.Size.z], col: i.props.Color && [i.props.Color.r, i.props.Color.g, i.props.Color.b], k: i.children.map(walk) }; })(dm.workspace));
const s0 = snap();

const a = C.run('insert', { className: 'Part' });
check(a.parent === dm.workspace && a.props.Anchored && near([a.props.Size.x, a.props.Size.y, a.props.Size.z], [4, 1, 2]), 'insert: a 4x1x2 anchored Part in Workspace');
check(near([a.props.CFrame.x, a.props.CFrame.y, a.props.CFrame.z], [0, 0.5, 0]), `insert: where the camera looks, its bottom on the floor it hits (${a.props.CFrame.x}, ${a.props.CFrame.y}, ${a.props.CFrame.z})`);
check(C.selection.items.length === 1 && C.selection.primary === a, 'insert selects the new part');
const s1 = snap();

C.run('move', { by: new V3(3, 0, -2) });
check(near([a.props.Position.x, a.props.Position.y, a.props.Position.z], [3, 0.5, -2]), 'move: CFrame and Position follow');
C.run('rotate', { axis: 'y', degrees: 90 });
check(near([a.props.Orientation.x, a.props.Orientation.y, a.props.Orientation.z], [0, 90, 0], 1e-3), `rotate 90° about Y: Orientation (${a.props.Orientation.y})`);
C.run('setProperty', { key: 'Color', value: new C3(1, 0, 0) });
C.run('setProperty', { key: 'Transparency', value: 0.5 });
const b = C.run('duplicate')[0];
check(b && b !== a && b.parent === dm.workspace && Math.abs(b.props.CFrame.y - (a.props.CFrame.y + 1)) < 1e-6 && b.props.Color.r === 1, 'duplicate: a copy one part-height up, same colour, selected');
const m = C.run('group', { items: [a, b] });
check(m.ClassName === 'Model' && a.parent === m && b.parent === m && m.parent === dm.workspace, 'group: both into a new Model');
C.run('move', { items: [m], by: new V3(0, 5, 0) });
check(Math.abs(a.props.CFrame.y - 5.5) < 1e-6 && Math.abs(b.props.CFrame.y - 6.5) < 1e-6, 'moving a Model moves its parts');
C.run('delete', { items: [m] });
check(m.parent === null && !m.destroyed && a.parent === m, 'delete: parented to nil, kept whole for undo');
const sEnd = snap();

// Undo everything: back to the exact starting state; redo everything: the exact end state.
let n = 0; while (C.run('undo')) n++;
check(snap() === s0, `undo all ${n} steps: exactly the starting state`);
check(C.selection.items.length === 0, 'undone-away instances drop out of the selection');
let r = 0; while (C.run('redo')) r++;
check(r === n && snap() === sEnd, `redo all ${r}: exactly the end state`);
for (let i = 0; i < n - 1; i++) C.run('undo');
check(snap() === s1, 'undo to just after insert: that state exactly');

// A new action clears redo; a no-op records nothing; a failing command leaves nothing behind.
C.run('setProperty', { items: [a], key: 'Name', value: 'Renamed' });
check(!C.history.canRedo(), 'a new action clears redo');
const before = C.history.past.length;
C.run('setProperty', { items: [a], key: 'Name', value: 'Renamed' });
check(C.history.past.length === before, 'setting a property to its current value records nothing');
let threw = false;
try { C.history.run('bad', tx => { tx.set(a, 'Name', 'Half'); throw new Error('boom'); }); } catch (e) { threw = true; }
check(threw && a.props.Name === 'Renamed' && C.history.past.length === before, 'a command that throws is rolled back and not recorded');

// One step that changes the same property twice undoes to the value before the step (ops replay in reverse).
const nameBefore = a.props.Name;
C.history.run('Twice', tx => { tx.set(a, 'Name', 'First'); tx.set(a, 'Name', 'Second'); });
C.run('undo');
check(a.props.Name === nameBefore, `a step that sets a property twice undoes to before the step (${a.props.Name})`);
C.run('redo');
check(a.props.Name === 'Second', 'and redoes to its last value');
C.run('undo');

// Clamps: what was stored is what's recorded.
C.run('setProperty', { items: [dm.workspace.props.CurrentCamera], key: 'FieldOfView', value: 500 });
check(dm.workspace.props.CurrentCamera.props.FieldOfView === 120, 'clamped values are stored clamped');
C.run('undo');
check(dm.workspace.props.CurrentCamera.props.FieldOfView === 70, 'and undo restores the value before the clamp');

// Services and the camera can't be deleted or duplicated.
check(C.run('delete', { items: [dm.workspace, dm.service('Lighting'), dm.workspace.props.CurrentCamera] }) === 0 && dm.workspace.parent === dm.game, 'services and the CurrentCamera are not deletable');

// A gizmo drag recorded after the fact.
const cf0 = a.props.CFrame, cf1 = cf0.withPosition(cf0.x + 7, cf0.y, cf0.z);
dm.set(a, 'CFrame', cf1);
C.run('commitDrag', { label: 'Move', changes: [{ inst: a, key: 'CFrame', before: cf0, after: cf1 }] });
C.run('undo');
check(a.props.CFrame.equals(cf0), 'a committed drag undoes to where it started');
C.run('redo');
check(a.props.CFrame.equals(cf1), 'and redoes to where it ended');
check(C.list().length >= 12, `commands are listed (${C.list().join(', ')})`);

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
