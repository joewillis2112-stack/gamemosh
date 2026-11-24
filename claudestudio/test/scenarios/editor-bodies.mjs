// R15 rigs in the editor (web/editor.js insertRig, runtime/rigs.js): with R15 chosen, Rig inserts a
// dummy whose Humanoid holds a HumanoidDescription with a BodyShape, drawn as that generated body,
// standing on the floor; changing the BodyShape in Properties reshapes it (longer legs: taller by
// exactly that much); undo puts it back. Desktop and phone, with real clicks.
import { describedBody, makeBody } from '../../web/runtime/bodygen.js';
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(24, 6, -12); ed.camera.lookAt(new V(24, 3, 0)); ed.camera.apply(); ed.frames(1); });
  await t.page.selectOption('#rigKind', 'R15');
  await btn('#ui [data-act=rig]');
  // The rig as the DataModel has it and as it's drawn (at rest), once its body has loaded.
  const look = () => E(() => {
    const ed = window.editor, rig = ed.commands.selection.items[0] && ed.commands.selection.items[0].ClassName === 'Model' ? ed.commands.selection.items[0] : ed.dm.workspace.children.filter(c => c.props.Name === 'Rig').pop();
    const hum = rig.children.find(c => c.ClassName === 'Humanoid'), d = hum.children.find(c => c.ClassName === 'HumanoidDescription'), sh = d && d.children.find(c => c.ClassName === 'BodyShape');
    const root = rig.children.find(c => c.props.Name === 'HumanoidRootPart'), v = ed.rigs.views.get(rig);
    const plain = p => Object.fromEntries(Object.entries(p).filter(([, x]) => typeof x === 'number' || (x && typeof x === 'object' && 'r' in x)).map(([k, x]) => [k, typeof x === 'number' ? x : { r: x.r, g: x.g, b: x.b }]));
    const out = { rig: hum.props.RigType, desc: d ? plain(d.props) : null, shape: sh ? plain(sh.props) : null, rootY: root.props.CFrame.y, drawn: !!(v && v.holder && v.rig) };
    if (!out.drawn) return out;
    for (const n of v.anim.nodes) { const r = v.anim.rest.get(n); n.position.copyFrom(r.p); n.rotationQuaternion.copyFrom(r.q); n.scaling.copyFrom(r.s); }
    for (let k = 0; k < 2; k++) { v.holder.computeWorldMatrix(true); v.holder.getChildTransformNodes(false).forEach(n => n.computeWorldMatrix(true)); v.holder.getChildMeshes(false).forEach(n => n.computeWorldMatrix(true)); }
    v.meshes.forEach(x => x.skeleton && x.skeleton.prepare(true));
    let lo = Infinity, hi = -Infinity;
    for (const x of v.meshes) if (x.getTotalVertices() > 0) { x.refreshBoundingInfo && x.refreshBoundingInfo(!!x.skeleton); const b = x.getBoundingInfo().boundingBox; lo = Math.min(lo, b.minimumWorld.y); hi = Math.max(hi, b.maximumWorld.y); }
    const V = root.props.Size.constructor, hit = ed.dm.raycast(new V(root.props.CFrame.x, lo + 0.5, root.props.CFrame.z), new V(0, -100, 0)); // (from just above the soles: below the root part)
    return { ...out, lo, hi, floor: hit && hit.length ? hit[1].y : null };
  });
  const until = async pred => { let x; for (let i = 0; i < 40; i++) { await E(() => window.editor.frames(2)); x = await look(); if (pred(x)) return x; await t.page.waitForTimeout(50); } return x; };
  const a = await until(x => x.drawn);
  check(a.rig === 'R15' && a.desc && a.shape && a.drawn, `R15 Rig: a dummy with a HumanoidDescription and a BodyShape, drawn as that body (${a.rig}, ${a.drawn ? 'drawn' : 'not drawn'})`);
  const b = a.desc ? makeBody(describedBody(a.desc, a.shape)) : null;
  if (b && a.drawn) check(Math.abs(a.hi - a.lo - b.height) < 0.03 && a.floor !== null && Math.abs(a.lo - a.floor) < 0.03 && Math.abs(a.rootY - a.floor - b.hrpHeight) < 1e-6, `standing on the floor at the body's height (${(a.hi - a.lo).toFixed(3)} studs; soles ${(a.lo - a.floor).toFixed(3)} above the floor)`);
  // Properties: longer legs.
  await E(() => { const ed = window.editor, rig = ed.commands.selection.items[0], d = rig.children.find(c => c.ClassName === 'Humanoid').children.find(c => c.ClassName === 'HumanoidDescription'); ed.commands.selection.set([d.children.find(c => c.ClassName === 'BodyShape')]); ed.frames(1); });
  // (The Properties panel's field, typed into as a person would; on a phone the panel is a sheet, so the
  // value goes in through the same field's change event.)
  const sel = '#properties input[data-k=LegLength]';
  const input = await E(s => !!document.querySelector(s), sel);
  if (input && !phone) { await t.page.fill(sel, '3.3'); await t.page.press(sel, 'Enter'); }
  else if (input) await E(s => { const i = document.querySelector(s); i.value = '3.3'; i.dispatchEvent(new Event('change', { bubbles: true })); }, sel);
  const c = await until(x => x.drawn && x.shape.LegLength === 3.3 && Math.abs(x.hi - x.lo - a.hi + a.lo) > 0.5);
  check(c.shape.LegLength === 3.3 && Math.abs((c.hi - c.lo) - (a.hi - a.lo) - (3.3 - a.shape.LegLength)) < 0.03, `${input ? 'Properties' : 'setProperty'}: BodyShape.LegLength 3.3 reshapes it, taller by exactly that much (${(a.hi - a.lo).toFixed(3)} -> ${(c.hi - c.lo).toFixed(3)} studs)`);
  await E(() => { const ed = window.editor; ed.commands.history.undo(); ed.frames(1); });
  const u = await until(x => x.drawn && x.shape.LegLength === a.shape.LegLength && Math.abs(x.hi - x.lo - a.hi + a.lo) < 0.03);
  check(u.shape.LegLength === a.shape.LegLength && Math.abs((u.hi - u.lo) - (a.hi - a.lo)) < 0.03, `undo puts it back (${(u.hi - u.lo).toFixed(3)} studs)`);
  await t.shot('editor-bodies');
  if (fail.length) throw new Error(fail.length + ' failed');
}
