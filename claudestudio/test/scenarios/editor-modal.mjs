// Blender-style modal transforms in the editor (web/editor/modal.js), with real
// keys and mouse: G/R/S, X/Y/Z constraints, Shift+axis planes, typed amounts,
// Enter/click to confirm, Esc/right-click to cancel, one undo step each.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const kb = t.page.keyboard, mouse = t.page.mouse;
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(0, 14, 28); ed.camera.lookAt(new V(0, 2, -2)); ed.camera.apply();
    ed.vm.run('t', 'local p = Instance.new("Part") p.Name = "Probe" p.Anchored = true p.Size = Vector3.new(4, 4, 4) p.Position = Vector3.new(0, 2, -2) p.Parent = workspace');
    for (const c of ed.dm.workspace.children) if (c.props.Name === 'Probe') ed.commands.run('select', { items: [c] }); ed.frames(1); });
  const state = () => E(() => { const p = window.editor.commands.selection.primary; return { pos: [p.props.CFrame.x, p.props.CFrame.y, p.props.CFrame.z], ori: [p.props.Orientation.x, p.props.Orientation.y, p.props.Orientation.z].map(v => Math.round(v * 1000) / 1000), size: [p.props.Size.x, p.props.Size.y, p.props.Size.z], steps: window.editor.commands.history.past.length, label: window.editor.commands.history.past.at(-1)?.label, hint: document.getElementById('hint').textContent, active: window.editor.modal.active }; });
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  const [cx, cy] = await screen([0, 2, -2]);
  await mouse.move(cx, cy);
  const s0 = await state();

  // G X 5 Enter: exactly 5 studs along X.
  await kb.press('g'); await kb.press('x'); await kb.type('5');
  const mid = await state();
  await kb.press('Enter');
  let s = await state();
  check(mid.active && /Grab along X: 5/.test(mid.hint) && s.pos[0] === 5 && s.pos[1] === 2 && s.pos[2] === -2 && s.steps === s0.steps + 1 && s.label === 'Move' && !s.active, `G, X, 5, Enter moves exactly 5 studs along X as one step (hint "${mid.hint}"; at ${s.pos})`);
  await kb.press('Control+z');
  check(JSON.stringify((await state()).pos) === JSON.stringify(s0.pos), 'and undoes');

  // G with the mouse, constrained to X: follows the mouse along X in whole studs.
  const [tx, ty] = await screen([3, 2, -2]);
  await kb.press('g'); await kb.press('x'); await mouse.move(tx, ty, { steps: 4 });
  s = await state();
  check(Math.abs(s.pos[0] - 3) <= 1 && Number.isInteger(s.pos[0]) && s.pos[1] === 2 && s.pos[2] === -2, `G, X, mouse: follows the mouse along X, snapped (${s.pos})`);
  await kb.press('Escape');
  s = await state();
  check(JSON.stringify(s.pos) === JSON.stringify(s0.pos) && s.steps === s0.steps && !s.active, 'Esc cancels: back exactly, nothing recorded');

  // Shift+Z: grab in the plane without Z; z never changes.
  await mouse.move(cx, cy);
  await kb.press('g'); await kb.press('Shift+z'); await mouse.move(cx + 80, cy + 60, { steps: 4 });
  s = await state();
  const moved = Math.hypot(s.pos[0] - s0.pos[0], s.pos[1] - s0.pos[1]);
  await mouse.click(cx + 80, cy + 60);
  const after = await state();
  check(s.pos[2] === -2 && moved >= 1 && s.pos.every(Number.isInteger) && after.steps === s0.steps + 1 && !after.active, `Shift+Z keeps Z, still snapped to whole studs; a click confirms (${s.pos})`);
  check(await E(() => window.editor.commands.selection.items.length) === 1, 'the confirming click doesn\'t change the selection');
  await kb.press('Control+z');

  // R Z 90: a quarter turn about Z.
  await kb.press('r'); await kb.press('z'); await kb.type('90'); await kb.press('Enter');
  s = await state();
  check(Math.abs(Math.abs(s.ori[2]) - 90) < 1e-3 && s.label === 'Rotate', `R, Z, 90 turns a quarter about Z (Orientation ${s.ori})`);
  await kb.press('Control+z');

  // S 2: twice the size, centre kept. S X 2: only X.
  await kb.press('s'); await kb.type('2'); await kb.press('Enter');
  s = await state();
  check(JSON.stringify(s.size) === '[8,8,8]' && JSON.stringify(s.pos) === JSON.stringify(s0.pos) && s.label === 'Resize', `S, 2 doubles the size about its centre (${s.size})`);
  await kb.press('Control+z');
  await kb.press('s'); await kb.press('x'); await kb.type('2'); await kb.press('Enter');
  s = await state();
  check(JSON.stringify(s.size) === '[8,4,4]', `S, X, 2 doubles only X (${s.size})`);
  await kb.press('Control+z');
  check(JSON.stringify((await state()).size) === '[4,4,4]', 'undo restores the size');

  // Right-click cancels; Delete during a transform doesn't delete.
  await mouse.move(cx, cy);
  await kb.press('g'); await mouse.move(cx + 50, cy, { steps: 3 }); await kb.press('Delete');
  const during = await E(() => window.editor.commands.selection.primary?.parent === window.editor.dm.workspace);
  await mouse.click(cx + 50, cy, { button: 'right' });
  s = await state();
  check(during && JSON.stringify(s.pos) === JSON.stringify(s0.pos) && !s.active, 'Delete is ignored mid-transform; a right click cancels it');

  // With the right button held, S flies the camera instead of scaling.
  const p0 = await E(() => window.editor.camera.pos.asArray());
  await mouse.move(cx, cy); await mouse.down({ button: 'right' }); await kb.down('s'); await E(() => window.editor.frames(20)); await kb.up('s'); await mouse.up({ button: 'right' });
  s = await state();
  const p1 = await E(() => window.editor.camera.pos.asArray());
  check(!s.active && JSON.stringify(s.size) === '[4,4,4]' && Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) > 2, `holding the right button, S flies back instead of scaling (moved ${Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).toFixed(1)})`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
