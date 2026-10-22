// The editor's Paint tool (web/editor/paint.js), with real drags and touches.
// What it must do for a creator: paint shows exactly where it was dragged, on
// screen (checked by the rendered pixels at projected points, so no UV
// convention is assumed); a stroke on a bare face adds a Decal, and stroke and
// Decal are one undo step; undo and redo are exact; a second stroke reuses the
// Decal; the eraser takes paint off; an editable mesh is painted through its
// UVs into its TextureID; a click selects nothing; the paint goes to Play.
import { PNG } from 'pngjs';

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
    // The stroke's image is loaded asynchronously and the PNG made on release: let it settle.
    await t.page.waitForTimeout(300); await E(() => window.editor.frames(2));
  };
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  // The rendered colour at a world point (0..255 RGB), from a screenshot.
  const colourAt = async p => { await E(() => window.editor.frames(2)); const [x, y] = await screen(p); const png = PNG.sync.read(await t.page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })); const i = (1 * png.width + 1) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const red = c => c[0] > 120 && c[0] > c[1] * 2 && c[0] > c[2] * 2;
  const look = (pos, at) => E(([p, a]) => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(...p); ed.camera.lookAt(new V(...a)); ed.camera.apply(); ed.frames(1); }, [pos, at]);
  const st = () => E(() => { const ed = window.editor, P = ed.dm.workspace.children.find(c => c.props.Name === 'Board'), decals = P ? P.children.filter(c => c.ClassName === 'Decal') : [], M = ed.dm.workspace.children.find(c => c.props.Name === 'Ball');
    return { decals: decals.length, face: decals[0] && decals[0].props.Face, tex: decals[0] ? decals[0].props.Texture : '', mesh: M ? M.props.TextureID : '', steps: ed.commands.history.past.length, sel: ed.commands.selection.items.length, bar: !document.getElementById('paintbar').hidden }; });
  const setBar = (k, v) => E(([k, v]) => { const i = document.querySelector(`#paintbar [data-k=${k}]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]);

  // A board facing -Z (Roblox's Front), and the camera in front of it.
  await E(() => { const ed = window.editor, CF = ed.CF, V3 = ed.V3; ed.commands.run('insert', { className: 'Part', props: { Name: 'Board', Size: new V3(8, 8, 1), CFrame: new CF([0, 6, -20, 1, 0, 0, 0, 1, 0, 0, 0, 1]), Color: new ed.C3(160 / 255, 160 / 255, 160 / 255) } }); ed.commands.run('select', { items: [] }); });
  await look([0, 6, -34], [0, 6, -20]);
  await btn('#ui [data-act=paint]');
  const s0 = await st();
  check(s0.bar && s0.decals === 0, `Paint opens its bar; the board has no Decal yet`);
  await setBar('size', 48); await setBar('hardness', 1);

  // A stroke over the board's face, along its (-X) half.
  const Z = -20.51, A = [-3.2, 6, Z], B = [-0.8, 6, Z], IN = [-2, 6, Z], OUT = [2, 6, Z];
  const before = await colourAt(IN);
  await drag(await screen(A), await screen(B));
  const s1 = await st();
  check(s1.decals === 1 && s1.face === 'Front' && /^data:image\/png/.test(s1.tex) && s1.steps === s0.steps + 1, `the stroke adds a Decal on the Front face with the painted PNG (${s1.decals} decal, ${s1.face}), one undo step`);
  const c1 = await colourAt(IN), o1 = await colourAt(OUT);
  check(!red(before) && red(c1) && !red(o1), `the paint shows where it was dragged: red at the stroke (${c1}), the board's grey beside it (${o1}); was ${before}`);
  check(s1.sel === 0, `painting selects nothing (${s1.sel} selected)`);

  // Undo and redo.
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  const u = await st(), cu = await colourAt(IN);
  if (phone) await btn('#ui [data-act=redo]'); else { await t.page.keyboard.press('Control+y'); await E(() => window.editor.frames(1)); }
  const r = await st(), cr = await colourAt(IN);
  check(u.decals === 0 && !red(cu) && r.decals === 1 && r.tex === s1.tex && red(cr), `undo takes the stroke and its Decal away (${u.decals} decals, ${cu}); redo brings back the same image (${cr})`);

  // A second stroke, down the other half: same Decal, one more step.
  const C2 = [2, 6.2, Z], D2 = [2, 8.6, Z]; // above the middle only: a flipped image would show it below
  await drag(await screen(C2), await screen(D2));
  const s2 = await st(), c2 = await colourAt([2, 7.6, Z]), below = await colourAt([2, 4.4, Z]);
  check(s2.decals === 1 && s2.tex !== s1.tex && s2.steps === r.steps + 1 && red(c2) && !red(below) && red(await colourAt(IN)), `a second stroke reuses the Decal (${s2.decals}), keeps the first (${s2.steps - r.steps} step), and shows above the middle where it was dragged (${c2}), not below (${below})`);

  // The eraser over the first stroke.
  await btn('#paintbar [data-p=erase]');
  await setBar('size', 96);
  await drag(await screen([-3.6, 6, Z]), await screen([-0.4, 6, Z]));
  const ce = await colourAt(IN);
  check(!red(ce) && red(await colourAt([2, 7.6, Z])), `the eraser takes the first stroke off (${ce}) and leaves the second`);
  await btn('#paintbar [data-p=brush]');
  await t.golden('editor-paint');

  // An editable mesh: painted through its UVs into TextureID.
  await E(() => { const ed = window.editor, CF = ed.CF; const m = ed.commands.run('insertMesh', { kind: 'cube' }); ed.dm.set(m, 'Name', 'Ball'); ed.commands.run('setProperty', { items: [m], key: 'CFrame', value: new CF([20, 6, -20, 1, 0, 0, 0, 1, 0, 0, 0, 1]) }); ed.commands.run('select', { items: [] }); });
  await look([20, 6, -34], [20, 6, -20]);
  const size = await E(() => window.editor.dm.workspace.children.find(c => c.props.Name === 'Ball').props.Size.z);
  const MZ = -20 - size / 2 - 0.01, MI = [20, 6 + size * 0.25, MZ]; // above the middle: a flip would show below
  const mb = await colourAt(MI);
  await setBar('size', 160);
  await drag(await screen([19.2, MI[1], MZ]), await screen([20.8, MI[1], MZ]));
  const sm = await st(), mc = await colourAt(MI), mo = await colourAt([20, 6 - size * 0.25, MZ]);
  check(/^data:image\/png/.test(sm.mesh) && !red(mb) && red(mc) && !red(mo), `an editable mesh is painted into its TextureID, where it was dragged (${mb} -> ${mc}; the same place below the middle ${mo})`);

  await btn('#paintbar [data-done]');
  check(!(await st()).bar, `Done closes the Paint bar`);

  // Play: the paint goes with the place.
  if (!phone) {
    const want = (await st()).tex;
    await t.page.click('#ui [data-act=play]');
    await t.page.waitForFunction(() => window.studio && (window.studio.ready || window.studio.error), null, { timeout: 120000 });
    const play = await E(() => { const w = window.studio.dm.workspace, P = w.children.find(c => c.props.Name === 'Board'), d = P && P.children.find(c => c.ClassName === 'Decal'), M = w.children.find(c => c.props.Name === 'Ball'); return { tex: d ? d.props.Texture : '', mesh: M ? M.props.TextureID : '', planes: window.studio.scene.meshes.filter(m => m.metadata && m.metadata.decal).length }; });
    check(play.tex === want && /^data:image\/png/.test(play.mesh) && play.planes >= 1, `in play the painted Decal (${play.planes} drawn) and the mesh's texture are there`);
  }
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
