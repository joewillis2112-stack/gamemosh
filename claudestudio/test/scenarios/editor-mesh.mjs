// Edit Mode (web/editor/editmode.js over the modeling kernel), driven with real
// keys, clicks and touches: a Part becomes an editable mesh with Tab; a face is
// picked and extruded; the extrude's amount is adjusted afterwards; undo and
// redo; an edge bevelled; a vertex moved exactly with G X 2; the result plays
// (drawn and solid) in the player.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const kb = t.page.keyboard;
  const tap = async (x, y) => { if (phone) await t.page.touchscreen.tap(x, y); else await t.page.mouse.click(x, y); await E(() => window.editor.frames(1)); };
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(7, 11, 14); ed.camera.lookAt(new V(0, 2, -2)); ed.camera.apply();
    ed.vm.run('t', 'local p = Instance.new("Part") p.Name = "Probe" p.Anchored = true p.Size = Vector3.new(4, 4, 4) p.Position = Vector3.new(0, 2, -2) p.Color = Color3.fromRGB(70, 140, 220) p.Parent = workspace');
    for (const c of ed.dm.workspace.children) if (c.props.Name === 'Probe') ed.commands.run('select', { items: [c] }); ed.frames(1); });
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  const st = () => E(() => { const ed = window.editor, p = ed.edit.part || ed.commands.selection.primary, m = ed.edit.mesh; return { active: ed.edit.active, cls: p && p.ClassName, faces: m && m.faces.size, selFaces: m && m.selectedFaces().length, selEdges: m && m.selectedEdges().length, selVerts: m && m.selectedVerts().length, size: p && [p.props.Size.x, p.props.Size.y, p.props.Size.z], y: p && p.props.CFrame.y, steps: ed.commands.history.past.length, bar: getComputedStyle(document.getElementById('editbar')).display !== 'none' }; });

  // Enter: Tab (the toolbar's Edit Mesh on a phone) makes the Part an editable MeshPart.
  if (phone) await btn('#ui [data-act=editmesh]'); else { await kb.press('Tab'); await E(() => window.editor.frames(1)); }
  let s = await st();
  check(s.active && s.cls === 'MeshPart' && s.faces === 6 && s.bar, `Edit Mesh: the Part is now an editable MeshPart, 6 faces, the edit bar shows (${JSON.stringify(s)})`);

  // Face mode; pick the top face.
  if (phone) await btn('#editbar [data-mode=face]'); else { await kb.press('3'); await E(() => window.editor.frames(1)); }
  await tap(...await screen([0, 4, -2]));
  s = await st();
  check(s.selFaces === 1 && s.selVerts === 4, `a click on the top face selects it (faces ${s.selFaces}, verts ${s.selVerts})`);

  // Extrude: one step, 10 faces, the box 1 stud taller, its bottom still on the floor.
  const steps0 = s.steps;
  if (phone) await btn('#editbar [data-op=extrude]'); else { await kb.press('e'); await E(() => window.editor.frames(1)); }
  s = await st();
  check(s.faces === 10 && s.size[1] === 5 && Math.abs(s.y - 2.5) < 1e-6 && s.steps === steps0 + 1, `extrude: 10 faces, 1 stud taller, bottom kept on the floor, one undo step (size ${s.size}, y ${s.y})`);
  // Adjust it: offset 3 (the step is replaced, not added).
  await E(() => { const i = document.querySelector('#lastop input[data-p=offset]'); i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true })); window.editor.frames(1); });
  s = await st();
  check(s.size[1] === 7 && Math.abs(s.y - 3.5) < 1e-6 && s.steps === steps0 + 1 && s.faces === 10, `adjusting the extrude to 3 redoes it in place of the first (size ${s.size}, ${s.steps - steps0} step)`);

  // Undo and redo (the mesh in Edit Mode follows).
  if (!phone) {
    await kb.press('Control+z'); await E(() => window.editor.frames(1));
    const u = await st();
    await kb.press('Control+y'); await E(() => window.editor.frames(1));
    const r = await st();
    check(u.faces === 6 && u.size[1] === 4 && r.faces === 10 && r.size[1] === 7, `Ctrl+Z / Ctrl+Y undo and redo the extrude, in Edit Mode (${u.faces} -> ${r.faces} faces)`);
  }

  // Edge mode: bevel the top front edge.
  if (phone) await btn('#editbar [data-mode=edge]'); else { await kb.press('2'); await E(() => window.editor.frames(1)); }
  await tap(...await screen([-2, 7, -2])); // the top-left edge (the top-front one lies under the selection's Z arrow)
  s = await st();
  const edgeSel = s.selEdges;
  if (phone) await btn('#editbar [data-op=bevel]'); else { await kb.press('Control+b'); await E(() => window.editor.frames(1)); }
  const b = await st();
  check(edgeSel === 1 && b.faces === 11, `a click picks an edge; bevel turns it into a face (${edgeSel} edge, ${s.faces} -> ${b.faces} faces)`);

  // Vertex mode: move one corner exactly 2 studs along X (G X 2 Enter), or by the arrow on a phone.
  if (phone) await btn('#editbar [data-mode=vertex]'); else { await kb.press('1'); await E(() => window.editor.frames(1)); }
  const corner = [-2, 0, 0]; // bottom front left
  await tap(...await screen(corner));
  const v0 = await E(() => { const ed = window.editor, v = ed.edit.mesh.selectedVerts()[0]; if (!v) return null; const w = ed.edit.toWorld(v.co); return [w.x, w.y, w.z].map(n => +n.toFixed(3)); });
  if (!phone) {
    await kb.press('g'); await kb.press('x'); await kb.type('2'); await kb.press('Enter'); await E(() => window.editor.frames(1));
    const v1 = await E(() => { const ed = window.editor, v = ed.edit.mesh.selectedVerts()[0], w = ed.edit.toWorld(v.co); return [w.x, w.y, w.z].map(n => +n.toFixed(3)); });
    check(v0 && JSON.stringify(v0) === JSON.stringify(corner) && Math.abs(v1[0] - (corner[0] + 2)) < 1e-3 && v1[1] === corner[1] && v1[2] === corner[2], `a click picks the corner vertex; G X 2 moves it exactly 2 studs along X (${v0} -> ${v1})`);
  } else {
    check(v0 && JSON.stringify(v0) === JSON.stringify(corner), `a tap picks the corner vertex (${v0})`);
    // Drag the vertex by its X arrow with a finger.
    const [px, py] = await screen(corner), [qx, qy] = await screen([corner[0] + 3, corner[1], corner[2]]);
    const at = await E(([px, py, qx, qy]) => {
      const ed = window.editor, r = document.getElementById('c').getBoundingClientRect(), meshes = new Set(ed.edit.arrows.xGizmo._rootMesh.getChildMeshes());
      for (let k = 0.1; k < 2; k += 0.02) { const X = px + (qx - px) * k, Y = py + (qy - py) * k; const h = ed.gizmos.layer.utilityLayerScene.pick(X - r.left, Y - r.top, m => meshes.has(m)); if (h && h.hit) return [X, Y, qx - px, qy - py]; }
      return null;
    }, [px, py, qx, qy]);
    if (at) {
      const cdp = await t.page.context().newCDPSession(t.page), tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
      await tp('touchStart', [at[0], at[1]]); for (let i = 1; i <= 10; i++) await tp('touchMove', [at[0] + at[2] * i / 15, at[1] + at[3] * i / 15]); await tp('touchEnd');
      await E(() => window.editor.frames(1));
    }
    const v1 = await E(() => { const ed = window.editor, v = ed.edit.mesh.selectedVerts()[0], w = ed.edit.toWorld(v.co); return [w.x, w.y, w.z].map(n => +n.toFixed(3)); });
    check(!!at && v1[0] > corner[0] + 0.5 && v1[1] === corner[1] && v1[2] === corner[2], `dragging the X arrow with a finger moves the vertex along X only (${v0} -> ${v1})`);
  }
  const look = await E(() => window.editor.frames(3));
  await t.golden('editor-mesh-edit');

  // Leave Edit Mode; the mesh stays, drawn by the renderer.
  if (phone) await btn('#editbar [data-done]'); else { await kb.press('Tab'); await E(() => window.editor.frames(1)); }
  s = await st();
  const drawn = await E(() => { const ed = window.editor, p = ed.commands.selection.primary, e = ed.world.parts.get(p); return e && e.meshPart && e.meshPart.render[0] && e.meshPart.render[0].getTotalIndices() / 3; });
  check(!s.active && !s.bar && drawn >= 22, `Tab leaves Edit Mode; the part draws its edited mesh (${drawn} triangles)`);
  await t.golden('editor-mesh');

  // Play: an unanchored ball dropped on it lands on its top (the mesh is solid in the game).
  if (!phone) {
    await E(() => { const ed = window.editor; ed.vm.run('b', 'local b = Instance.new("Part") b.Name = "Ball" b.Shape = Enum.PartType.Ball b.Size = Vector3.new(1, 1, 1) b.Position = Vector3.new(0.5, 20, -1) b.Parent = workspace'); });
    await t.page.click('#ui [data-act=play]');
    await t.page.waitForFunction(() => window.studio && (window.studio.ready || window.studio.error), null, { timeout: 120000 });
    await E(() => window.studio.sim(180));
    const ballY = await E(() => [...window.studio.dm.workspace.children].find(c => c.props.Name === 'Ball').props.CFrame.y);
    check(Math.abs(ballY - 7.5) < 0.3, `in play, a ball dropped on the mesh rests on its top at 7 studs (ball centre y ${ballY.toFixed(2)})`);
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
