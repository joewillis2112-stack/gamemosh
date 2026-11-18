// The editor's Image Editor (web/editor/imageeditor.js), with real drags, taps, wheel and pinches:
// opened on a Decal it starts from a clear 512x512 Background; zoom (wheel at the cursor; pinch
// on a phone) keeps the point under the cursor or fingers still, pan (Space-drag; two fingers)
// moves the view, and neither paints; strokes land on the canvas where they were dragged (shown
// smaller than the image, so a scale bug shows); a second layer in Multiply blends as
// PhotoCraft's blend::composite does (the maths is checked in test/paint.test.mjs; here, that
// the panel uses it); layer opacity and visibility count; the editor's own Undo takes a change
// back. Selections (Rect, Ellipse, Lasso, Invert, None) limit painting and Adjust; a layer mask
// made from a selection hides the rest, and painting the mask black hides, the Eraser reveals.
// Apply writes the PNG into Decal.Texture as one undo step (the layers inside it) and the decal
// shows it in 3D; opening it again brings back the layers, blend, opacity and mask; Image Size
// and Canvas Size change every layer; a part without an image says so.
import { PNG } from 'pngjs';

export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  const cdp = phone ? await t.page.context().newCDPSession(t.page) : null;
  // CDP touches can land late; a tap sent before the last touchend landed is a second finger (no click). Wait for it.
  if (phone) await E(() => { const n = e => { window.__touches = e.touches.length; }; for (const k of ['touchstart', 'touchend', 'touchcancel']) addEventListener(k, n, true); });
  const tp = async (type, pts) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) }); if (type === 'touchEnd') await t.page.waitForFunction(() => !window.__touches); };
  // A finger that lifts while moving starts a fling, and Chrome drops the next tap as the fling's cancel (no click): hold still first.
  const rest = async p => { await t.page.waitForTimeout(80); await tp('touchMove', [p]); await t.page.waitForTimeout(80); await tp('touchMove', [p]); };
  const dragPath = async (pts, steps = 16) => { // through each point in turn
    if (phone) { await tp('touchStart', [pts[0]]); for (let k = 1; k < pts.length; k++) for (let i = 1; i <= steps; i++) await tp('touchMove', [[pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * i / steps, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * i / steps]]); await rest(pts[pts.length - 1]); await tp('touchEnd', []); }
    else { await t.page.mouse.move(...pts[0]); await t.page.mouse.down(); for (let k = 1; k < pts.length; k++) for (let i = 1; i <= steps; i++) await t.page.mouse.move(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * i / steps, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * i / steps); await t.page.mouse.up(); }
    await E(() => window.editor.frames(1));
  };
  const drag = (a, b, steps) => dragPath([a, b], steps);
  // Image pixel (x, y) of the panel's canvas -> page coordinates, and the canvas's colour there (0..255 RGBA).
  const onCanvas = (x, y) => E(([x, y]) => { const c = document.querySelector('#imageeditor canvas'), r = c.getBoundingClientRect(); return [r.left + (x + 0.5) * r.width / c.width, r.top + (y + 0.5) * r.height / c.height]; }, [x, y]);
  const toImg = p => E(p => { const c = document.querySelector('#imageeditor canvas'), r = c.getBoundingClientRect(); return [(p[0] - r.left) * c.width / r.width, (p[1] - r.top) * c.height / r.height]; }, p);
  const view = () => E(() => { const ie = window.editor.imageEditor, r = ie.canvas.getBoundingClientRect(); return { k: ie.view.k, left: r.left, top: r.top, w: r.width }; });
  const pix = (x, y) => E(([x, y]) => Array.from(document.querySelector('#imageeditor canvas').getContext('2d').getImageData(x, y, 1, 1).data), [x, y]);
  const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const CLEAR = [0, 0, 0, 0];
  const setColour = h => E(h => { const i = document.querySelector('#imageeditor [data-k=color]'); i.value = h; i.dispatchEvent(new Event('input', { bubbles: true })); }, h);
  const setRange = (sel, v) => E(([sel, v]) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
  const setValue = (sel, v) => E(([sel, v]) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const st = () => E(() => { const ed = window.editor, s = ed.dm.workspace.children.find(c => c.props.Name === 'Sign'), d = s && s.children.find(c => c.ClassName === 'Decal'), ie = ed.imageEditor;
    return { open: !document.getElementById('imageeditor').hidden, layers: ie.doc ? ie.doc.layers.map(l => [l.name, l.blend, l.opacity, l.visible, !!l.mask]) : null, size: ie.doc && [ie.doc.width, ie.doc.height], active: ie.doc && ie.doc.active, editMask: ie.editMask, sel: !!ie.sel, undo: ie.undo.length, tex: d ? d.props.Texture : null, steps: ed.commands.history.past.length, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }; });

  // A sign facing the camera with an empty Decal on its front, selected.
  await E(() => { const ed = window.editor, CF = ed.CF, V3 = ed.V3;
    const p = ed.commands.run('insert', { className: 'Part', props: { Name: 'Sign', Size: new V3(8, 8, 1), CFrame: new CF([0, 6, -20, 1, 0, 0, 0, 1, 0, 0, 0, 1]) } });
    ed.commands.run('insert', { className: 'Decal', parent: p, props: { Face: 'Front' } });
    const V = ed.camera.pos.constructor; ed.camera.pos = new V(0, 6, -34); ed.camera.lookAt(new V(0, 6, -20)); ed.camera.apply(); ed.frames(1); });
  // A part has no image: the editor says so and stays closed.
  await E(() => { const ed = window.editor; ed.commands.run('select', { items: [ed.dm.workspace.children.find(c => c.props.Name === 'Sign')] }); });
  await btn('#ui [data-act=paint]'); // the Image Editor opens from the Paint bar
  await btn('#paintbar [data-image]');
  const p0 = await st();
  check(!p0.open && /Select a Decal/.test(p0.toast), `on a Part the Image button says what it needs ("${p0.toast}") and doesn't open`);

  await E(() => { const ed = window.editor, s = ed.dm.workspace.children.find(c => c.props.Name === 'Sign'); ed.commands.run('select', { items: [s.children.find(c => c.ClassName === 'Decal')] }); });
  const steps0 = (await st()).steps;
  await btn('#paintbar [data-image]');
  await t.page.waitForFunction(() => window.editor.imageEditor.active);
  const s0 = await st();
  const size = await E(() => [document.querySelector('#imageeditor canvas').width, document.querySelector('#imageeditor canvas').height]);
  check(s0.open && s0.layers.length === 1 && s0.layers[0][0] === 'Background' && size[0] === 512 && size[1] === 512 && near(await pix(256, 256), CLEAR, 0), `on the Decal it opens a clear 512x512 Background (${size}, ${s0.layers.length} layer)`);

  // Zoom and pan. The point under the cursor (or between the fingers) stays where it is.
  const v0 = await view(), P = await onCanvas(300, 200), under0 = await toImg(P);
  if (phone) { // pinch out from 80 to 160 px apart, about P
    await tp('touchStart', [[P[0] - 40, P[1]], [P[0] + 40, P[1]]]);
    for (let i = 1; i <= 8; i++) await tp('touchMove', [[P[0] - 40 - 5 * i, P[1]], [P[0] + 40 + 5 * i, P[1]]]);
    await tp('touchEnd', []);
  } else { await t.page.mouse.move(...P); await t.page.mouse.wheel(0, -300); }
  await E(() => window.editor.frames(1));
  const v1 = await view(), under1 = await toImg(P), want = phone ? 2 : Math.exp(0.45);
  check(Math.abs(v1.k / v0.k - want) < 0.02 && Math.hypot(under1[0] - under0[0], under1[1] - under0[1]) < 1, `${phone ? 'a pinch' : 'the wheel'} zooms ${(v1.k / v0.k).toFixed(2)}x about the ${phone ? 'fingers' : 'cursor'}: the image point there stays put (${under0.map(Math.round)} -> ${under1.map(Math.round)})`);
  const P2 = [P[0] + 60, P[1] + 40];
  if (phone) {
    await tp('touchStart', [[P[0] - 30, P[1]], [P[0] + 30, P[1]]]);
    for (let i = 1; i <= 6; i++) await tp('touchMove', [[P[0] - 30 + 10 * i, P[1] + 40 * i / 6], [P[0] + 30 + 10 * i, P[1] + 40 * i / 6]]);
    await tp('touchEnd', []);
  } else { await t.page.keyboard.down(' '); await drag(P, P2, 6); await t.page.keyboard.up(' '); }
  await E(() => window.editor.frames(1));
  const v2 = await view(), s1u = await st();
  check(Math.abs(v2.left - v1.left - 60) < 1 && Math.abs(v2.top - v1.top - 40) < 1 && s1u.undo === 0 && near(await pix(...under0.map(Math.round)), CLEAR, 0), `${phone ? 'two fingers' : 'Space-drag'} pan the view (${Math.round(v2.left - v1.left)}, ${Math.round(v2.top - v1.top)}) and paint nothing`);
  await btn('#imageeditor [data-ie=fit]');
  check(Math.abs((await view()).k - v0.k) < 1e-9, `Fit goes back to the whole image (${Math.round(v0.k * 100)}%)`);
  await btn('#imageeditor [data-ie=zoomout]'); // shown smaller than the image (half of fit), so screen and image pixels differ
  check(Math.abs((await view()).k - v0.k / 2) < 1e-9 && (await view()).w < 512, `− halves the zoom (${Math.round((await view()).w)} px across)`);

  // Red across the middle (hard, 40 px), on the Background.
  await setColour('#ff0000'); await setRange('#imageeditor [data-k=size]', 40); await setRange('#imageeditor [data-k=opacity]', 1);
  await btn('#imageeditor [data-p=brush]');
  await drag(await onCanvas(60, 256), await onCanvas(452, 256));
  const red = await pix(256, 256), above = await pix(256, 180);
  check(near(red, [255, 0, 0, 255]) && near(above, CLEAR, 0), `a stroke paints the canvas where it was dragged (${red}; clear above it ${above})`);

  // A new layer in Multiply, half grey down the middle: over red, Multiply gives (128, 0, 0); over nothing it's the grey itself.
  await btn('#imageeditor [data-ie=add]');
  await setValue('#imageeditor [data-ie=blend]', 'Multiply');
  await setColour('#808080');
  await drag(await onCanvas(256, 60), await onCanvas(256, 452));
  const s1 = await st(), cross = await pix(256, 256), alone = await pix(256, 120);
  check(s1.layers.length === 2 && s1.layers[1][1] === 'Multiply' && near(cross, [128, 0, 0, 255]) && near(alone, [128, 128, 128, 255]), `a second layer in Multiply darkens the red where they cross (${cross}) and is plain grey elsewhere (${alone})`);
  await setRange('#imageeditor [data-ie=opacity]', 0.5);
  const half = await pix(256, 256);
  check(near(half, [191, 0, 0, 255], 4), `at half opacity the layer darkens it half as much (${half})`);
  await E(() => { const b = document.querySelector('#imageeditor .layer[data-i="1"] input'); b.click(); });
  await E(() => window.editor.frames(1));
  const hidden = await pix(256, 256);
  check(near(hidden, [255, 0, 0, 255]), `hiding the layer shows the red alone (${hidden})`);
  await btn('#imageeditor [data-ie=undo]');
  const back = await pix(256, 256), s2 = await st();
  check(near(back, [191, 0, 0, 255], 4) && s2.layers[1][3] === true && s2.steps === steps0, `the Image Editor's Undo shows the layer again (${back}); the scene's history is untouched (${s2.steps - steps0} steps)`);
  await t.golden('editor-image');

  // Selections limit painting: green strokes on the Background through a Rect, an Ellipse and a Lasso selection.
  await btn('#imageeditor .layer[data-i="0"] span');
  await setColour('#00ff00'); await setRange('#imageeditor [data-k=size]', 16);
  const GREEN = [0, 255, 0, 255], isGreen = async (x, y) => near(await pix(x, y), GREEN, 3);
  const paintAcross = async (y, x0, x1) => { await btn('#imageeditor [data-p=brush]'); await drag(await onCanvas(x0, y), await onCanvas(x1, y)); };
  await btn('#imageeditor [data-t=rect]'); await drag(await onCanvas(300, 300), await onCanvas(400, 400));
  check((await st()).sel, 'a Rect drag makes a selection');
  await paintAcross(350, 250, 470);
  check(await isGreen(350, 350) && !(await isGreen(280, 350)) && !(await isGreen(430, 350)), 'a stroke across it paints only inside the rectangle');
  await btn('#imageeditor [data-t=ellipse]'); await drag(await onCanvas(300, 100), await onCanvas(420, 180));
  await paintAcross(140, 270, 450);
  check(await isGreen(360, 140) && !(await isGreen(290, 140)) && !(await isGreen(432, 140)), `an Ellipse selection: inside the ellipse only (${await pix(360, 140)} / ${await pix(290, 140)} / ${await pix(432, 140)})`);
  await btn('#imageeditor [data-t=lasso]'); await dragPath([await onCanvas(60, 380), await onCanvas(200, 380), await onCanvas(130, 480), await onCanvas(60, 380)], 10);
  await paintAcross(400, 30, 230);
  check(await isGreen(130, 400) && !(await isGreen(45, 400)) && !(await isGreen(215, 400)), 'a Lasso round a triangle: inside the triangle only');
  await btn('#imageeditor [data-ie=invert]');
  await paintAcross(430, 30, 230);
  check(!(await isGreen(130, 430)) && await isGreen(45, 430) && await isGreen(215, 430), 'Invert: now only outside the triangle');
  await btn('#imageeditor [data-ie=none]');
  check(!(await st()).sel, 'None drops the selection');
  // Adjust inside a selection: the left half's red goes grey, the right half's stays red.
  await btn('#imageeditor [data-t=rect]'); await drag(await onCanvas(0, 0), await onCanvas(255.5, 511.5));
  await btn('#imageeditor .ie-adjust summary');
  await setRange('#imageeditor [data-adj="color.saturation"]', -100);
  const lft = await pix(100, 256), rgt = await pix(400, 256);
  check(Math.max(...lft.slice(0, 3)) - Math.min(...lft.slice(0, 3)) <= 3 && near(rgt, [255, 0, 0, 255], 1), `Saturation −100 inside a left-half selection greys the red there (${lft}) and not on the right (${rgt})`);
  await btn('#imageeditor [data-ie=reset]'); await btn('#imageeditor .ie-adjust summary');
  await btn('#imageeditor [data-ie=none]');

  // A mask on the grey layer, from a top-half selection: the stripe shows above, not below.
  await btn('#imageeditor .layer[data-i="1"] span');
  await btn('#imageeditor [data-t=rect]'); await drag(await onCanvas(0, 0), await onCanvas(511.5, 255.5));
  await btn('#imageeditor [data-ie=mask]');
  const m1 = await st();
  check(m1.layers[1][4] && m1.editMask && near(await pix(256, 120), [128, 128, 128, 128], 3) && near(await pix(256, 400), CLEAR, 0), `Add Mask with a selection reveals only it: the stripe shows above (${await pix(256, 120)}), not below (${await pix(256, 400)}); the mask is the target`);
  await t.golden('editor-image-mask'); // the selection's outline, the mask chip, the target line
  await btn('#imageeditor [data-ie=none]');
  await setColour('#000000'); await paintAcross(100, 200, 312);
  check(near(await pix(256, 100), CLEAR, 0) && near(await pix(256, 180), [128, 128, 128, 128], 3), 'painting black on the mask hides the stripe there, nowhere else');
  await btn('#imageeditor [data-p=erase]'); await drag(await onCanvas(200, 400), await onCanvas(312, 400));
  check(near(await pix(256, 400), [128, 128, 128, 128], 3), `the Eraser on the mask reveals it again (${await pix(256, 400)})`);
  const layer1 = await E(() => Array.from(window.editor.imageEditor.doc.layers[1].img.data.slice((400 * 512 + 256) * 4, (400 * 512 + 256) * 4 + 4)));
  check(near(layer1.map(v => Math.round(v * 255)), [128, 128, 128, 255], 1), 'and the layer\'s own pixels were never touched (the mask took the paint)');
  await btn('#imageeditor .layer[data-i="1"] span');
  check(!(await st()).editMask, 'tapping the layer\'s name goes back to painting its pixels');

  // Apply: the flattened image into Decal.Texture, one undo step, with the layers inside; the sign shows it.
  const before = { a: await pix(256, 120), b: await pix(256, 100), c: await pix(350, 350), d: await pix(100, 256) };
  await btn('#imageeditor [data-ie=apply]');
  await t.page.waitForFunction(() => !window.editor.imageEditor.active);
  const s3 = await st(), chunk = await E(t => atob(t.split(',')[1]).includes('csLy'), s3.tex || 'x,');
  check(!s3.open && /^data:image\/png/.test(s3.tex) && chunk && s3.steps === steps0 + 1, `Apply writes the PNG into Decal.Texture as one undo step and closes, the layers in a csLy chunk`);
  await t.page.waitForTimeout(300);
  const colourAt = async p => { await E(() => window.editor.frames(2)); const [x, y] = await E(p => { const ed = window.editor; const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p); const png = PNG.sync.read(await t.page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })); const i = 4 * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const onSign = await colourAt([-2.5, 6, -20.51]); // on the red band, left of the grey stripe
  check(onSign[0] > 120 && onSign[0] > onSign[1] * 2 && onSign[0] > onSign[2] * 2, `the sign shows the edited image in the 3D view (${onSign})`);

  // Opened again: the same layers, blend, opacity and mask, and the same picture.
  await btn('#paintbar [data-image]');
  await t.page.waitForFunction(() => window.editor.imageEditor.active);
  const s4 = await st(), after = { a: await pix(256, 120), b: await pix(256, 100), c: await pix(350, 350), d: await pix(100, 256) };
  check(s4.layers.length === 2 && s4.layers[1][1] === 'Multiply' && s4.layers[1][2] === 0.5 && s4.layers[1][4] && s4.layers[0][0] === 'Background', `it opens again in layers: ${JSON.stringify(s4.layers)}`);
  check(Object.keys(before).every(k => near(before[k], after[k], 1)), `the same picture (${Object.values(after).map(String).join(' / ')})`);

  // Image Size: every layer (and mask) resampled; Undo puts it back.
  await btn('#imageeditor .ie-size summary');
  await setValue('#imageeditor [data-sz=w]', 256); await setValue('#imageeditor [data-sz=h]', 256);
  await btn('#imageeditor [data-ie=resize]');
  const s5 = await st();
  check(String(s5.size) === '256,256' && s5.layers.length === 2 && near(await pix(50, 128), [255, 0, 0, 255], 2) && near(await pix(128, 200), [128, 128, 128, 128], 4) && near(await pix(128, 50), CLEAR, 2), `Image Size 256x256: the picture at half size, mask and all (${await pix(50, 128)} / ${await pix(128, 200)})`);
  await btn('#imageeditor [data-ie=undo]');
  check(String((await st()).size) === '512,512' && near(await pix(100, 256), before.d, 1), 'Undo brings back 512x512');
  // Canvas Size: 600 wide about the centre: 44 clear pixels each side.
  await setValue('#imageeditor [data-sz=w]', 600); await setValue('#imageeditor [data-sz=h]', 512);
  await btn('#imageeditor [data-ie=canvas]');
  check(String((await st()).size) === '600,512' && near(await pix(144, 256), before.d, 1) && near(await pix(20, 256), CLEAR, 0), `Canvas Size 600x512 adds clear canvas each side (${await pix(20, 256)}), the picture moved 44 right`);
  await btn('#imageeditor [data-ie=cancel]');

  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  check((await st()).tex === '', `the scene's Undo takes the edit back (Texture empty again)`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
