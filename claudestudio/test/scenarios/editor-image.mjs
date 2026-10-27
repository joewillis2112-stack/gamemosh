// The editor's Image Editor (web/editor/imageeditor.js), with real drags and taps:
// opened on a Decal it starts from a clear 512x512 Background; strokes land on
// the canvas where they were dragged; a second layer in Multiply blends as
// PhotoCraft's blend::composite does (the maths is checked in test/paint.test.mjs;
// here, that the panel uses it); layer opacity and visibility count; the editor's
// own Undo takes a change back; Apply writes the PNG into Decal.Texture as one
// undo step and the decal shows it in the 3D view; a part without an image says so.
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
    await E(() => window.editor.frames(1));
  };
  // Image pixel (x, y) of the panel's canvas -> page coordinates, and the canvas's colour there (0..255 RGBA).
  const onCanvas = (x, y) => E(([x, y]) => { const c = document.querySelector('#imageeditor canvas'), r = c.getBoundingClientRect(); return [r.left + (x + 0.5) * r.width / c.width, r.top + (y + 0.5) * r.height / c.height]; }, [x, y]);
  const pix = (x, y) => E(([x, y]) => Array.from(document.querySelector('#imageeditor canvas').getContext('2d').getImageData(x, y, 1, 1).data), [x, y]);
  const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const setColour = h => E(h => { const i = document.querySelector('#imageeditor [data-k=color]'); i.value = h; i.dispatchEvent(new Event('input', { bubbles: true })); }, h);
  const setRange = (sel, v) => E(([sel, v]) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
  const st = () => E(() => { const ed = window.editor, s = ed.dm.workspace.children.find(c => c.props.Name === 'Sign'), d = s && s.children.find(c => c.ClassName === 'Decal'), ie = ed.imageEditor;
    return { open: !document.getElementById('imageeditor').hidden, layers: ie.doc ? ie.doc.layers.map(l => [l.name, l.blend, l.opacity, l.visible]) : null, tex: d ? d.props.Texture : null, steps: ed.commands.history.past.length, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }; });

  // A sign facing the camera with an empty Decal on its front, selected.
  await E(() => { const ed = window.editor, CF = ed.CF, V3 = ed.V3;
    const p = ed.commands.run('insert', { className: 'Part', props: { Name: 'Sign', Size: new V3(8, 8, 1), CFrame: new CF([0, 6, -20, 1, 0, 0, 0, 1, 0, 0, 0, 1]) } });
    ed.commands.run('insert', { className: 'Decal', parent: p, props: { Face: 'Front' } });
    const V = ed.camera.pos.constructor; ed.camera.pos = new V(0, 6, -34); ed.camera.lookAt(new V(0, 6, -20)); ed.camera.apply(); ed.frames(1); });
  // A part has no image: the editor says so and stays closed.
  await E(() => { const ed = window.editor; ed.commands.run('select', { items: [ed.dm.workspace.children.find(c => c.props.Name === 'Sign')] }); });
  await btn('#ui [data-act=image]');
  const p0 = await st();
  check(!p0.open && /Select a Decal/.test(p0.toast), `on a Part the Image button says what it needs ("${p0.toast}") and doesn't open`);

  await E(() => { const ed = window.editor, s = ed.dm.workspace.children.find(c => c.props.Name === 'Sign'); ed.commands.run('select', { items: [s.children.find(c => c.ClassName === 'Decal')] }); });
  const steps0 = (await st()).steps;
  await btn('#ui [data-act=image]');
  await t.page.waitForFunction(() => window.editor.imageEditor.active);
  const s0 = await st();
  const size = await E(() => [document.querySelector('#imageeditor canvas').width, document.querySelector('#imageeditor canvas').height]);
  check(s0.open && s0.layers.length === 1 && s0.layers[0][0] === 'Background' && size[0] === 512 && size[1] === 512 && near(await pix(256, 256), [0, 0, 0, 0], 0), `on the Decal it opens a clear 512x512 Background (${size}, ${s0.layers.length} layer)`);

  // Shown smaller than the image (as on any small window), so screen and image pixels differ.
  await E(() => { const c = document.querySelector('#imageeditor canvas'); c.style.width = c.style.height = '320px'; });
  // Red across the middle (hard, 40 px), on the Background.
  await setColour('#ff0000'); await setRange('#imageeditor [data-k=size]', 40); await setRange('#imageeditor [data-k=opacity]', 1);
  await btn('#imageeditor [data-p=brush]');
  await drag(await onCanvas(60, 256), await onCanvas(452, 256));
  const red = await pix(256, 256), above = await pix(256, 180);
  check(near(red, [255, 0, 0, 255]) && near(above, [0, 0, 0, 0], 0), `a stroke paints the canvas where it was dragged (${red}; clear above it ${above})`);

  // A new layer in Multiply, half grey down the middle: over red, Multiply gives (128, 0, 0); over nothing it's the grey itself.
  await btn('#imageeditor [data-ie=add]');
  await E(() => { const s = document.querySelector('#imageeditor [data-ie=blend]'); s.value = 'Multiply'; s.dispatchEvent(new Event('change', { bubbles: true })); });
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

  // Apply: the flattened image into Decal.Texture, one undo step, and the sign shows it.
  await btn('#imageeditor [data-ie=apply]');
  const s3 = await st();
  check(!s3.open && /^data:image\/png/.test(s3.tex) && s3.steps === steps0 + 1, `Apply writes the PNG into Decal.Texture as one undo step and closes`);
  await t.page.waitForTimeout(300);
  const colourAt = async p => { await E(() => window.editor.frames(2)); const [x, y] = await E(p => { const ed = window.editor; const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p); const png = PNG.sync.read(await t.page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })); const i = 4 * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const onSign = await colourAt([-2.5, 6, -20.51]); // on the red band, left of the grey stripe
  check(onSign[0] > 120 && onSign[0] > onSign[1] * 2 && onSign[0] > onSign[2] * 2, `the sign shows the edited image in the 3D view (${onSign})`);
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  check((await st()).tex === '', `the scene's Undo takes the edit back (Texture empty again)`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
