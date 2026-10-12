// The editor page (web/editor.html), driven with real mouse, keyboard and touch
// input, against the DataModel and what's drawn:
// - clicking selects the part under the pointer (its Model first; Alt the part;
//   Locked parts not at all); clicking empty space clears;
// - the toolbar and shortcuts run commands, and Undo/Redo restore exactly;
// - Properties edits are commands;
// - the Move arrow drags a part along its axis in whole studs, and the mesh drawn follows;
// - a Scale handle moves one face in whole studs while the opposite face stays put;
// - the camera: right-drag looks, the wheel moves in, F frames the selection;
//   on a phone, a tap selects, one finger orbits, two fingers pinch.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const phone = await t.eval(() => matchMedia('(max-width:760px)').matches);
  const E = (fn, arg) => t.eval(fn, arg);
  await E(() => window.editor.frames(2));
  // A world point's page position (CSS px), after a render so the camera's matrices are current.
  const screen = p => E(p => {
    const ed = window.editor; ed.frames(1);
    const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale();
    const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height));
    return [r.left + q.x / s, r.top + q.y / s];
  }, p);
  const named = n => `(function(){ for (const c of window.editor.dm.workspace.children) if (c.props.Name === ${JSON.stringify(n)}) return c; })()`;
  const sel = () => E(() => window.editor.commands.selection.items.map(i => i.props.Name));
  const click = async (x, y, mods = []) => {
    if (phone) { await t.page.touchscreen.tap(x, y); return E(() => window.editor.frames(1)); }
    for (const m of mods) await t.page.keyboard.down(m);
    await t.page.mouse.click(x, y);
    for (const m of mods) await t.page.keyboard.up(m);
    await E(() => window.editor.frames(1)); // the panels refresh with the frame
  };
  const button = async name => { if (phone) await t.page.tap(`#ui [data-act=${name}],#ui [data-tool=${name}]`); else await t.page.click(`#ui [data-act=${name}],#ui [data-tool=${name}]`); await E(() => window.editor.frames(1)); };

  // Frame a known view: the camera at (0, 14, 28) looking at (0, 2, -2).
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(0, 14, 28); ed.camera.lookAt(new V(0, 2, -2)); ed.camera.apply(); });
  // A test block: red, 4x4x4, at (0, 2, -2), on the floor.
  await E(() => { const ed = window.editor; ed.vm.run('t', 'local p = Instance.new("Part") p.Name = "Probe" p.Anchored = true p.Size = Vector3.new(4, 4, 4) p.Position = Vector3.new(0, 2, -2) p.Color = Color3.new(1, 0, 0) p.Parent = workspace'); ed.frames(1); });

  check(await E(() => document.querySelector('#explorer').textContent.includes('Probe') && document.querySelector('#properties').textContent.includes('Nothing selected')), 'the Explorer lists the place; Properties starts empty');

  // Selection by clicking.
  let [x, y] = await screen([0, 2, -2]);
  await click(x, y);
  check(JSON.stringify(await sel()) === '["Probe"]', `clicking a part selects it (${await sel()})`);
  check(await E(() => document.querySelector('#explorer .row.sel')?.textContent.includes('Probe') && document.querySelector('#properties .head')?.textContent.startsWith('Part (1)')), 'the Explorer highlights it; Properties shows it');
  const [sx, sy] = await screen([0, 60, -200]);
  await click(sx, sy);
  check((await sel()).length === 0, 'clicking the sky clears the selection');
  if (!phone) {
    await E(() => { const ed = window.editor, p = eval(`${'(function(){ for (const c of window.editor.dm.workspace.children) if (c.props.Name === "Probe") return c; })()'}`); ed.vm.run('g', 'local m = Instance.new("Model") m.Name = "Crate" m.Parent = workspace workspace.Probe.Parent = m'); ed.frames(1); });
    await click(x, y);
    const a = await sel();
    await click(x, y, ['Alt']);
    const b = await sel();
    check(a[0] === 'Crate' && b[0] === 'Probe', `a part in a Model selects the Model; with Alt, the part (${a}, ${b})`);
    await E(() => { window.editor.vm.run('u', 'workspace.Crate.Probe.Parent = workspace workspace.Crate:Destroy()'); window.editor.frames(1); });
  }
  await E(n => { window.editor.vm.run('l', 'workspace.Probe.Locked = true'); }, null);
  await click(x, y);
  const lockedSel = await sel();
  await E(() => window.editor.vm.run('l', 'workspace.Probe.Locked = false'));
  check(!lockedSel.includes('Probe'), `a Locked part can't be clicked (${lockedSel})`);

  // Toolbar: insert a part, undo, redo.
  await click(x, y);
  const n0 = await E(() => window.editor.dm.workspace.children.length);
  await button('part');
  const ins = await E(() => { const s = window.editor.commands.selection.primary; return s && { name: s.props.Name, parent: s.parent === window.editor.dm.workspace, y: s.props.CFrame.y }; });
  check(ins && ins.name === 'Part' && ins.parent && await E(() => window.editor.dm.workspace.children.length) === n0 + 1, `Part inserts a part and selects it (${JSON.stringify(ins)})`);
  await button('undo');
  check(await E(() => window.editor.dm.workspace.children.length) === n0 && (await sel()).length === 0, 'Undo removes it');
  await button('redo');
  check(await E(() => window.editor.dm.workspace.children.length) === n0 + 1, 'Redo brings it back');
  await button('undo');

  // Properties: edit Transparency on the probe through the panel.
  await click(x, y);
  await E(() => { const i = document.querySelector('#properties input[data-k=Transparency]'); i.value = '0.5'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  const tr = await E(() => window.editor.dm.workspace.Probe ?? null) ?? await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') return c.props.Transparency; });
  check(tr === 0.5, `editing Transparency in Properties sets it (${tr})`);
  await button('undo');
  check(await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') return c.props.Transparency; }) === 0, 'and Undo puts it back');

  // Move: drag the X arrow. Find it by picking the gizmo layer along the axis's screen line.
  await button('move');
  const arrow = async (axis) => {
    const [px, py] = await screen([0, 2, -2]), d = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
    const [qx, qy] = await screen([d[0] * 3, 2 + d[1] * 3, -2 + d[2] * 3]);
    return E(([px, py, qx, qy, axis]) => {
      const ed = window.editor, c = document.getElementById('c'), r = c.getBoundingClientRect(), s = ed.camera.scale(), g = ed.gizmos.move[axis + 'Gizmo'];
      const meshes = new Set(g._rootMesh.getChildMeshes());
      for (let k = 0.15; k < 2; k += 0.02) {
        const X = px + (qx - px) * k, Y = py + (qy - py) * k;
        const h = ed.gizmos.layer.utilityLayerScene.pick(X - r.left, Y - r.top, m => meshes.has(m));
        if (h && h.hit) return [X, Y, qx - px, qy - py];
      }
      return null;
    }, [px, py, qx, qy, axis]);
  };
  const before = await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') return [c.props.CFrame.x, c.props.CFrame.y, c.props.CFrame.z]; });
  const a = await arrow('x');
  check(!!a, 'the Move arrows are on screen at the selection');
  if (a) {
    // Drag 3 studs' worth along the arrow's screen direction.
    const steps = 12, [ax, ay, dx, dy] = a;
    const drag = async (from, to) => {
      if (phone) {
        const cdp = await t.page.context().newCDPSession(t.page);
        const tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
        await tp('touchStart', from); for (let i = 1; i <= steps; i++) await tp('touchMove', [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]); await tp('touchEnd');
      } else {
        await t.page.mouse.move(...from); await t.page.mouse.down();
        for (let i = 1; i <= steps; i++) await t.page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
        await t.page.mouse.up();
      }
      await E(() => window.editor.frames(1));
    };
    await drag([ax, ay], [ax + dx, ay + dy]);
    const after = await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') { const m = window.editor.world.parts.get(c).mesh; return { cf: [c.props.CFrame.x, c.props.CFrame.y, c.props.CFrame.z], mesh: [m.position.x, m.position.y, m.position.z] }; } });
    const moved = after.cf[0] - before[0];
    check(moved >= 2 && moved <= 4 && Number.isInteger(Math.round(moved * 1000) / 1000) && after.cf[1] === before[1] && after.cf[2] === before[2], `dragging the X arrow moves it along X only, in whole studs (${moved})`);
    check(after.mesh.every((v, i) => Math.abs(v - after.cf[i]) < 1e-4), 'the drawn part follows its CFrame');
    check(await E(() => window.editor.commands.history.past.at(-1)?.label) === 'Move', 'the drag is one undoable step');
    await button('undo');
    check(JSON.stringify(await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') return [c.props.CFrame.x, c.props.CFrame.y, c.props.CFrame.z]; })) === JSON.stringify(before), 'Undo puts it back exactly');

    // Scale: drag the +X face handle by about 2 studs; the -X face stays.
    await button('scale');
    const [hx, hy] = await screen([2.6, 2, -2]), [kx, ky] = await screen([4.6, 2, -2]);
    await drag([hx, hy], [kx, ky]);
    const sz = await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') return { size: c.props.Size.x, minX: c.props.CFrame.x - c.props.Size.x / 2 }; });
    check(sz.size >= 5 && sz.size <= 7 && Number.isInteger(sz.size) && Math.abs(sz.minX - (-2)) < 1e-6, `dragging the +X handle grows it in whole studs and keeps the -X face still (size ${sz.size}, -X face at ${sz.minX})`);
    await button('undo');
    check(await E(() => { for (const c of window.editor.dm.workspace.children) if (c.props.Name === 'Probe') return c.props.Size.x === 4 && c.props.CFrame.x === 0; }), 'Undo restores size and position together');
    await button('select');
  }

  // Keyboard (desktop): Ctrl+D duplicates, Ctrl+R turns 90°, Delete deletes, Ctrl+Z undoes each.
  if (!phone) {
    await click(x, y);
    await t.page.keyboard.press('Control+d');
    const dup = await sel();
    await t.page.keyboard.press('Control+r');
    const turned = await E(() => Math.round(window.editor.commands.selection.primary.props.Orientation.y));
    await t.page.keyboard.press('Delete');
    const left = await E(() => [...window.editor.dm.workspace.children].filter(c => c.props.Name === 'Probe').length);
    for (let i = 0; i < 3; i++) await t.page.keyboard.press('Control+z');
    const back = await E(() => [...window.editor.dm.workspace.children].filter(c => c.props.Name === 'Probe').length);
    check(dup[0] === 'Probe' && turned === 90 && left === 1 && back === 1, `Ctrl+D, Ctrl+R, Delete and Ctrl+Z (copy ${dup}; turned ${turned}°; after delete ${left}; after 3 undos ${back})`);
  }

  // Camera.
  const camState = () => E(() => { const c = window.editor.camera; return { pos: c.pos.asArray(), yaw: c.yaw, pitch: c.pitch }; });
  if (!phone) {
    const c0 = await camState();
    const [mx, my] = await screen([0, 2, -2]);
    await t.page.mouse.move(mx, my); await t.page.mouse.down({ button: 'right' }); await t.page.mouse.move(mx + 100, my, { steps: 5 }); await t.page.mouse.up({ button: 'right' });
    const c1 = await camState();
    check(c1.yaw < c0.yaw - 0.3 && JSON.stringify(c1.pos) === JSON.stringify(c0.pos), `right-drag turns the view in place (yaw ${c0.yaw.toFixed(2)} -> ${c1.yaw.toFixed(2)})`);
    await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(0, 14, 28); ed.camera.lookAt(new V(0, 2, -2)); ed.camera.apply(); });
    const [wx, wy] = await screen([0, 2, -2]);
    const d0 = await E(() => { const p = window.editor.camera.pos; return Math.hypot(p.x, p.y - 2, p.z + 2); });
    await t.page.mouse.move(wx, wy); await t.page.mouse.wheel(0, -100); await E(() => window.editor.frames(1));
    const d1 = await E(() => { const p = window.editor.camera.pos; return Math.hypot(p.x, p.y - 2, p.z + 2); });
    check(d1 < d0 - 0.5, `the wheel moves toward the cursor (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
  } else {
    const c0 = await camState();
    const piv = [0, 2, -2], r0 = Math.hypot(c0.pos[0] - piv[0], c0.pos[1] - piv[1], c0.pos[2] - piv[2]);
    const [px, py] = await screen(piv);
    const cdp = await t.page.context().newCDPSession(t.page);
    const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
    await tp('touchStart', [[px, py]]); for (let i = 1; i <= 8; i++) await tp('touchMove', [[px + i * 10, py]]); await tp('touchEnd', []);
    const c1 = await camState(), r1 = Math.hypot(c1.pos[0] - piv[0], c1.pos[1] - piv[1], c1.pos[2] - piv[2]);
    const moved = Math.hypot(c1.pos[0] - c0.pos[0], c1.pos[1] - c0.pos[1], c1.pos[2] - c0.pos[2]);
    check(Math.abs(c1.yaw - c0.yaw) > 0.2 && Math.abs(r1 - r0) < 0.5 && moved > 3, `one finger orbits around the point it started on: the camera moves round it at the same distance (yaw ${c0.yaw.toFixed(2)} -> ${c1.yaw.toFixed(2)}; moved ${moved.toFixed(1)}; distance ${r0.toFixed(1)} -> ${r1.toFixed(1)})`);
    await tp('touchStart', [[px - 40, py], [px + 40, py]]); for (let i = 1; i <= 8; i++) await tp('touchMove', [[px - 40 - i * 10, py], [px + 40 + i * 10, py]]); await tp('touchEnd', []);
    const c2 = await camState(), r2 = Math.hypot(c2.pos[0] - piv[0], c2.pos[1] - piv[1], c2.pos[2] - piv[2]);
    check(r2 < r1 - 1, `a two-finger spread moves in (${r1.toFixed(1)} -> ${r2.toFixed(1)})`);
    await button('panels');
    check(await E(() => getComputedStyle(document.getElementById('explorer')).display !== 'none'), 'Panels opens the Explorer and Properties on a phone');
    await button('panels');
  }
  // F frames the selection: the probe ends up in the middle of the view.
  await E(() => { const ed = window.editor; for (const c of ed.dm.workspace.children) if (c.props.Name === 'Probe') ed.commands.run('select', { items: [c] }); ed.camera.focus(); ed.frames(1); });
  const [fx, fy] = await screen([0, 2, -2]);
  const mid = await E(() => { const r = document.getElementById('c').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  check(Math.hypot(fx - mid[0], fy - mid[1]) < 2, `F (Focus) centres the selection (${(fx - mid[0]).toFixed(1)}, ${(fy - mid[1]).toFixed(1)} px off)`);

  // The look, with the Move tool on a selection.
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(9, 10, 14); ed.camera.lookAt(new V(0, 2, -2)); ed.camera.apply(); ed.setTool('move'); ed.frames(3); });
  await t.golden('editor-move');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
