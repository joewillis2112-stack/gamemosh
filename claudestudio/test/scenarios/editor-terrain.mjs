// The editor's Terrain tools (web/editor/terrain.js), with real drags and
// touches: Add paints a ridge of Grass along a drag on the baseplate (one undo
// step; undo and redo exact); Subtract cuts into it; Paint turns part of it to
// Snow without changing its shape; a click doesn't select; Play takes the
// terrain to the player, where it is solid (a ball dropped on the round ridge glances off).
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  const cdp = phone ? await t.page.context().newCDPSession(t.page) : null;
  const drag = async (a, b, steps = 16) => {
    if (phone) {
      const tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
      await tp('touchStart', a); for (let i = 1; i <= steps; i++) await tp('touchMove', [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]); await tp('touchEnd');
    } else {
      await t.page.mouse.move(...a); await t.page.mouse.down(); for (let i = 1; i <= steps; i++) await t.page.mouse.move(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps); await t.page.mouse.up();
    }
    await E(() => window.editor.frames(1));
  };
  await E(() => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(40, 34, 30); ed.camera.lookAt(new V(40, 0, 0)); ed.camera.apply(); ed.frames(1); });
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  const st = () => E(() => { const ed = window.editor, T = ed.dm.workspace.children.find(c => c.ClassName === 'Terrain'), v = T.voxels; let snow = 0, grass = 0; for (const c of v.chunks.values()) for (let i = 0; i < c.occ.length; i++) if (c.occ[i]) { if (c.mat[i] === 10) snow++; if (c.mat[i] === 2) grass++; } ed.world.terrain.update(); return { cells: v.count(), snow, grass, tris: ed.world.terrain.stats().solid, save: JSON.stringify(v.save()).length, steps: ed.commands.history.past.length, sel: ed.commands.selection.items.length, bar: !document.getElementById('terrainbar').hidden }; });

  await btn('#ui [data-act=terrain]');
  let s0 = await st();
  check(s0.bar && s0.cells === 0, `Terrain opens its bar; no terrain yet (${s0.cells} cells)`);

  // Add (the default tool, Grass, size 8): a ridge along a drag at full strength.
  await E(() => { const i = document.querySelector('#terrainbar [data-t=strength]'); i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await drag(await screen([30, 0, 0]), await screen([50, 0, 0]));
  const a = await st();
  check(a.cells > 50 && a.grass === a.cells && a.tris > 100 && a.steps === s0.steps + 1, `Add paints a Grass ridge along the drag (${a.cells} cells, ${a.tris} triangles), one undo step`);

  // Undo and redo.
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  const u = await st();
  if (phone) await btn('#ui [data-act=redo]'); else { await t.page.keyboard.press('Control+y'); await E(() => window.editor.frames(1)); }
  const r = await st();
  check(u.cells === 0 && u.tris === 0 && r.cells === a.cells && r.save === a.save, `undo removes the stroke, redo brings it back exactly (${u.cells} -> ${r.cells} cells)`);

  // Subtract across the middle.
  await btn('#terrainbar [data-brush=subtract]');
  await drag(await screen([40, 4, -10]), await screen([40, 4, 10]), 10);
  const sub = await st();
  check(sub.cells < a.cells && sub.cells > 10, `Subtract cuts across the ridge (${a.cells} -> ${sub.cells} cells)`);

  // Paint Snow over one end: the shape stays, some cells turn to Snow.
  await btn('#terrainbar [data-brush=paint]');
  await E(() => { const sel = document.querySelector('#terrainbar [data-t=material]'); sel.value = 'Snow'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await drag(await screen([30, 2, 0]), await screen([34, 2, 0]), 6);
  const p = await st();
  check(p.snow > 5 && p.cells === sub.cells, `Paint turns ${p.snow} cells to Snow; the shape is unchanged (${p.cells} cells)`);
  check(p.sel === 0, `clicks and drags with the Terrain tool select nothing (${p.sel} selected)`);
  await E(() => window.editor.frames(2));
  await t.golden('editor-terrain');

  // Play: the terrain goes with the place and is solid.
  if (!phone) {
    await btn('#terrainbar [data-done]');
    await E(() => { const ed = window.editor; ed.vm.run('b', 'local b = Instance.new("Part") b.Name = "Ball" b.Shape = Enum.PartType.Ball b.Size = Vector3.new(2, 2, 2) b.Position = Vector3.new(48, 30, 0) b.Parent = workspace'); });
    await t.page.click('#ui [data-act=play]');
    await t.page.waitForFunction(() => window.studio && (window.studio.ready || window.studio.error), null, { timeout: 120000 });
    await E(() => window.studio.sim(60));
    const play = await E(() => { const w = window.studio.dm.workspace, T = w.children.find(c => c.ClassName === 'Terrain'), b = w.children.find(c => c.props.Name === 'Ball'); return { cells: T.voxels.count(), x: b.props.CFrame.x, z: b.props.CFrame.z }; });
    // Over flat baseplate a dropped ball falls straight down; the round ridge knocks it aside.
    check(play.cells === p.cells && Math.hypot(play.x - 48, play.z) > 2, `in play the terrain is all there (${play.cells} cells) and solid: a ball dropped on the ridge glances off it (x 48 -> ${play.x.toFixed(1)}, z 0 -> ${play.z.toFixed(1)})`);
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
