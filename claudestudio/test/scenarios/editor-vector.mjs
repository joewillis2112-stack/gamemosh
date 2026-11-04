// The editor's Vector Editor (web/editor/vectoreditor.js), with real drags and taps: on a Part
// it says what it needs; on a Decal it opens a blank 512x512 drawing; a Rect drag draws a
// rectangle where it was dragged, filled; Corners cuts it round (VectorCraft's Live Corners,
// checked against its Rust in test/vector.test.mjs; here, that the panel uses them); a Star
// has its points; the Pen draws a closed path by clicks and a smooth anchor by a drag; Select
// moves a shape and Delete removes it; the editor's Undo takes changes back; Apply writes an
// SVG into Decal.Texture as one undo step, the sign shows it in 3D, and it opens again as the
// same shapes; the scene's Undo takes it back.
import { PNG } from 'pngjs';

export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  const cdp = phone ? await t.page.context().newCDPSession(t.page) : null;
  const drag = async (a, b, steps = 12) => {
    if (phone) {
      const tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
      await tp('touchStart', a); for (let i = 1; i <= steps; i++) await tp('touchMove', [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]); await tp('touchEnd');
    } else {
      await t.page.mouse.move(...a); await t.page.mouse.down(); for (let i = 1; i <= steps; i++) await t.page.mouse.move(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps); await t.page.mouse.up();
    }
    await E(() => window.editor.frames(1));
  };
  const tap = async p => { if (phone) await t.page.touchscreen.tap(...p); else await t.page.mouse.click(...p); await E(() => window.editor.frames(1)); };
  // Drawing point (x, y) -> page coordinates.
  const at = (x, y) => E(([x, y]) => { const s = document.querySelector('#vectoreditor .ve-svg'), p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return [p.x, p.y]; }, [x, y]);
  // The colour on screen at drawing point (x, y).
  const pix = async (x, y) => { const [px, py] = await at(x, y); const png = PNG.sync.read(await t.page.screenshot({ clip: { x: Math.round(px) - 1, y: Math.round(py) - 1, width: 3, height: 3 } })); const i = 4 * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const setV = (k, v) => E(([k, v]) => { const i = document.querySelector(`#vectoreditor [data-v=${k}]`); if (i.type === 'checkbox') i.checked = v; else i.value = v; i.dispatchEvent(new Event(i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input', { bubbles: true })); }, [k, v]);
  const st = () => E(() => { const ed = window.editor, s = ed.dm.workspace.children.find(c => c.props.Name === 'Sign'), d = s && s.children.find(c => c.ClassName === 'Decal'), ve = ed.vectorEditor;
    return { open: !document.getElementById('vectoreditor').hidden, doc: ve.doc && JSON.parse(JSON.stringify(ve.doc)), sel: ve.sel, tex: d ? d.props.Texture : null, steps: ed.commands.history.past.length, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }; });
  const inFill = (i, x, y) => E(([i, x, y]) => document.querySelectorAll('#vectoreditor .ve-art path')[i].isPointInFill(new DOMPoint(x, y)), [i, x, y]);

  // A sign facing the camera with an empty Decal on its front.
  await E(() => { const ed = window.editor, CF = ed.CF, V3 = ed.V3;
    const p = ed.commands.run('insert', { className: 'Part', props: { Name: 'Sign', Size: new V3(8, 8, 1), CFrame: new CF([0, 6, -20, 1, 0, 0, 0, 1, 0, 0, 0, 1]) } });
    ed.commands.run('insert', { className: 'Decal', parent: p, props: { Face: 'Front' } });
    const V = ed.camera.pos.constructor; ed.camera.pos = new V(0, 6, -34); ed.camera.lookAt(new V(0, 6, -20)); ed.camera.apply(); ed.frames(1);
    ed.commands.run('select', { items: [p] }); });
  await btn('#ui [data-act=paint]');
  await btn('#paintbar [data-vector]');
  const p0 = await st();
  check(!p0.open && /Select a Decal/.test(p0.toast), `on a Part the Vector button says what it needs ("${p0.toast}") and doesn't open`);

  await E(() => { const ed = window.editor, s = ed.dm.workspace.children.find(c => c.props.Name === 'Sign'); ed.commands.run('select', { items: [s.children.find(c => c.ClassName === 'Decal')] }); });
  const steps0 = (await st()).steps;
  await btn('#paintbar [data-vector]');
  await t.page.waitForFunction(() => window.editor.vectorEditor.active);
  const s0 = await st();
  check(s0.open && s0.doc.w === 512 && s0.doc.h === 512 && s0.doc.shapes.length === 0 && !s0.doc.background, `on the Decal it opens a blank 512x512 drawing`);

  // A red rectangle, dragged from (60, 60) to (300, 220).
  await setV('fill', '#ff0000');
  await btn('#vectoreditor [data-tool=rect]');
  await drag(await at(60, 60), await at(300, 220));
  const s1 = await st(), r = s1.doc.shapes[0] && s1.doc.shapes[0].live.r;
  check(s1.doc.shapes.length === 1 && r && r.every((v, i) => Math.abs(v - [60, 60, 300, 220][i]) < 3), `a Rect drag draws a rectangle where it was dragged (${r && r.map(Math.round)})`);
  const red = await pix(180, 140), outside = await pix(330, 140);
  check(near(red, [255, 0, 0]) && !near(outside, [255, 0, 0], 60), `it's filled red on screen (${red}), not beyond its edge (${outside})`);
  // Live Corners: round, radius 50; the corner is cut, the middle of the side isn't.
  await setV('corner', 50);
  check(!(await inFill(0, 64, 64)) && (await inFill(0, 180, 63)) && (await inFill(0, 64, 140)), 'Corners rounds the selected rectangle: its corner is cut, its sides stay');
  await setV('cornerKind', 'Chamfer');
  check(!(await inFill(0, 70, 70)) && (await inFill(0, 85, 85)), 'Chamfer cuts it straight (inside the round cut, still filled)');

  // A star with 6 points, centred at (400, 380), radius 90: 12 anchors, filled blue.
  await btn('#vectoreditor [data-tool=star]'); // a new tool drops the selection: settings below are for the next shape
  await setV('corner', 0); await setV('fill', '#0000ff'); await setV('points', 6);
  await drag(await at(400, 380), await at(400, 290));
  const s2 = await st(), star = s2.doc.shapes[1];
  const anchors = await E(() => window.editor.vectorEditor.art.children[1].getAttribute('d').match(/[LC]/g).length + 1);
  check(star && star.kind === 'star' && star.live.points === 6 && Math.abs(star.live.radius - 90) < 3 && anchors === 12 && near(await pix(400, 380), [0, 0, 255]), `a Star drag draws a 6-pointed star (${anchors} anchors, radius ${star && star.live.radius.toFixed(1)}), blue on screen`);
  check(s2.doc.shapes[0].cornerKind === 'Chamfer' && s2.doc.shapes[0].corner === 50, `changing settings with nothing selected leaves the rectangle as it was`);

  // The Pen: corners at three clicks, then a click on the first anchor closes it; green, no stroke.
  await btn('#vectoreditor [data-tool=pen]');
  await setV('fill', '#00ff00');
  for (const p of [[80, 300], [220, 300], [150, 440], [80, 300]]) await tap(await at(...p));
  const s3 = await st(), tri = s3.doc.shapes[2];
  check(tri && tri.kind === 'path' && tri.path[0].closed && tri.path[0].anchors.length === 3 && near(await pix(150, 340), [0, 255, 0]), `three Pen clicks and a click on the first anchor make a closed triangle, green on screen`);
  // A Pen drag makes a smooth anchor with handles; Enter finishes the open path.
  check((await st()).sel === 2, 'the finished path is selected (as in Illustrator: the next setting applies to it)');
  await btn('#vectoreditor [data-tool=pen]'); // picking a tool again drops it
  await setV('nofill', true); await setV('strokeWidth', 8);
  check((await st()).doc.shapes[2].fill === '#00ff00', 'settings for the next path leave the triangle green');
  await tap(await at(300, 470)); await drag(await at(420, 470), await at(460, 500)); await tap(await at(500, 420));
  if (phone) await btn('#vectoreditor [data-tool=select]'); else { await t.page.keyboard.press('Enter'); await E(() => window.editor.frames(1)); }
  const s4 = await st(), curve = s4.doc.shapes[3], mid = curve && curve.path[0].anchors[1];
  check(curve && !curve.path[0].closed && curve.fill === 'none' && curve.strokeWidth === 8 && mid.kind === 'Smooth' && Math.abs(mid.out[0] - 460) < 4 && Math.abs(mid.in[0] - 380) < 4, `a Pen drag makes a smooth anchor (out ${mid && mid.out.map(Math.round)}, in mirrored ${mid && mid.in.map(Math.round)}); ${phone ? 'another tool' : 'Enter'} finishes the open path`);

  // Select: tap the rectangle, drag it 40 right; Delete removes it; Undo brings it back.
  await btn('#vectoreditor [data-tool=select]');
  await tap(await at(180, 100));
  check((await st()).sel === 0, 'Select picks the rectangle under the tap');
  await drag(await at(180, 100), await at(220, 100));
  const r2 = (await st()).doc.shapes[0].live.r;
  check(Math.abs(r2[0] - 100) < 3 && Math.abs(r2[2] - 340) < 3, `dragging it moves it 40 right (${r2.map(Math.round)})`);
  await btn('#vectoreditor [data-ve=delete]');
  check((await st()).doc.shapes.length === 3, 'Delete removes it');
  await btn('#vectoreditor [data-ve=undo]'); await btn('#vectoreditor [data-ve=undo]');
  const s5 = await st();
  check(s5.doc.shapes.length === 4 && Math.abs(s5.doc.shapes[0].live.r[0] - 60) < 3 && s5.steps === steps0, `Undo brings it back, then puts it back where it was; the scene's history is untouched`);
  await E(() => { window.editor.vectorEditor.sel = -1; window.editor.vectorEditor.render(); });
  await t.golden('editor-vector');

  // Apply: SVG into Decal.Texture, one undo step; the sign shows it; it opens again as shapes.
  await btn('#vectoreditor [data-ve=apply]');
  const s6 = await st();
  check(!s6.open && /^data:image\/svg\+xml;base64,/.test(s6.tex) && s6.steps === steps0 + 1, 'Apply writes an SVG into Decal.Texture as one undo step and closes');
  await t.page.waitForTimeout(500);
  const colourAt = async p => { await E(() => window.editor.frames(2)); const [x, y] = await E(p => { const ed = window.editor; const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p); const png = PNG.sync.read(await t.page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })); const i = 4 * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  // Drawing (180, 140) on an 8-stud sign: x = (180/512 - 0.5) * 8, y = 6 + (0.5 - 140/512) * 8.
  const onSign = await colourAt([(180 / 512 - 0.5) * 8, 6 + (0.5 - 140 / 512) * 8, -20.51]);
  check(onSign[0] > 120 && onSign[0] > onSign[1] * 2 && onSign[0] > onSign[2] * 2, `the sign shows the rectangle in red in the 3D view (${onSign})`);
  await btn('#paintbar [data-vector]');
  await t.page.waitForFunction(() => window.editor.vectorEditor.active);
  const s7 = await st();
  check(s7.doc.shapes.length === 4 && s7.doc.shapes.map(s => s.kind).join() === 'rect,star,path,path' && s7.doc.shapes[0].corner === 50, `it opens again as the same shapes, still live (${s7.doc.shapes.map(s => s.kind)})`);
  await btn('#vectoreditor [data-ve=cancel]');
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  check((await st()).tex === '', `the scene's Undo takes the drawing back (Texture empty again)`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
