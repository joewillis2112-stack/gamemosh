// The Image Editor's Adjust section (LightCraft's develop tools; web/paint/develop.js is checked
// against LightCraft's Rust in test/develop.test.mjs; here, that the panel applies them): on a
// Decal whose image is a red, a blue and a grey patch, Exposure brightens the active layer live,
// to the colours develop.js gives; Black & white greys it; the colour mixer's Blue band moves only
// the blue patch; Reset restores the image exactly; an adjustment is one step of the editor's Undo
// and is baked in by the next stroke; Apply writes it into the Decal as one scene step.
import { developer } from '../../web/paint/develop.js';

const RED = [200, 60, 40], BLUE = [40, 80, 200], GREY = [128, 128, 128];
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  const pix = (x, y) => E(([x, y]) => Array.from(document.querySelector('#imageeditor canvas').getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3), [x, y]);
  const near = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const dev = (s, c) => developer(s)(c.map(v => v / 255)).map(v => Math.round(Math.min(Math.max(v, 0), 1) * 255));
  const setRange = (sel, v) => E(([sel, v]) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
  const setChange = (sel, v) => E(([sel, v]) => { const i = document.querySelector(sel); if (i.type === 'checkbox') i.checked = v; else i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const patches = async () => ({ red: await pix(40, 32), blue: await pix(120, 32), grey: await pix(80, 96) });
  const st = () => E(() => { const ed = window.editor, d = ed.dm.workspace.children.find(c => c.props.Name === 'Sign').children.find(c => c.ClassName === 'Decal'); return { tex: d.props.Texture, steps: ed.commands.history.past.length, undo: ed.imageEditor.undo.length }; });

  // A sign whose Decal shows a 160x128 image: red left, blue right on top, grey below.
  await E(([R, B, G]) => { const ed = window.editor, CF = ed.CF, V3 = ed.V3;
    const c = document.createElement('canvas'); c.width = 160; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = `rgb(${R})`; g.fillRect(0, 0, 80, 64); g.fillStyle = `rgb(${B})`; g.fillRect(80, 0, 80, 64); g.fillStyle = `rgb(${G})`; g.fillRect(0, 64, 160, 64);
    const p = ed.commands.run('insert', { className: 'Part', props: { Name: 'Sign', Size: new V3(8, 8, 1), CFrame: new CF([0, 6, -20, 1, 0, 0, 0, 1, 0, 0, 0, 1]) } });
    const d = ed.commands.run('insert', { className: 'Decal', parent: p, props: { Face: 'Front', Texture: c.toDataURL('image/png') } });
    ed.commands.run('select', { items: [d] }); }, [RED, BLUE, GREY]);
  const steps0 = (await st()).steps;
  await btn('#ui [data-act=paint]');
  await btn('#paintbar [data-image]');
  await t.page.waitForFunction(() => window.editor.imageEditor.active);
  const p0 = await patches();
  check(near(p0.red, RED, 0) && near(p0.blue, BLUE, 0) && near(p0.grey, GREY, 0), `it opens on the Decal's image (${p0.red} / ${p0.blue} / ${p0.grey})`);
  await btn('#imageeditor .ie-adjust summary');

  // Exposure +1: live, to develop.js's colours.
  await setRange('#imageeditor [data-adj="light.exposure"]', 1);
  const p1 = await patches(), want1 = { red: dev({ light: { exposure: 1 } }, RED), blue: dev({ light: { exposure: 1 } }, BLUE), grey: dev({ light: { exposure: 1 } }, GREY) };
  check(near(p1.red, want1.red) && near(p1.blue, want1.blue) && near(p1.grey, want1.grey) && p1.grey[0] > 160, `Exposure +1 brightens the layer to develop.js's colours (grey ${p1.grey}, want ${want1.grey}; red ${p1.red}, want ${want1.red})`);
  check((await st()).undo === 1, 'the adjustment is one step of the editor\'s Undo, however many slider moves');
  await setRange('#imageeditor [data-adj="light.exposure"]', 0.5);
  check((await st()).undo === 1 && near(await pix(80, 96), dev({ light: { exposure: 0.5 } }, GREY)), 'moving the slider again re-develops from the original, still one step');

  // Black & white on top: every patch grey.
  await setChange('#imageeditor [data-adj="treatment"]', true);
  const p2 = await patches();
  check([p2.red, p2.blue].every(c => Math.max(...c) - Math.min(...c) <= 2) && near(p2.red, dev({ light: { exposure: 0.5 }, treatment: 'bw' }, RED)), `Black & white greys the colours (red patch ${p2.red}, blue ${p2.blue})`);

  // Reset: the original exactly.
  await btn('#imageeditor [data-ie=reset]');
  const p3 = await patches();
  check(near(p3.red, RED, 0) && near(p3.blue, BLUE, 0) && near(p3.grey, GREY, 0) && (await st()).undo === 0, `Reset restores the image exactly and leaves nothing to undo`);
  check(await E(() => document.querySelector('#imageeditor [data-adj="light.exposure"]').value === '0' && !document.querySelector('#imageeditor [data-adj="treatment"]').checked), 'and the sliders read zero again');

  // Temp: 4000 K against the image's 6500 K says the light was warmer, so the image cools (as in
  // Lightroom), to develop.js's colours; then Reset.
  await setRange('#imageeditor [data-adj="wb.temp"]', 4000);
  const warm = await pix(80, 96), wantW = dev({ wb: { mode: 'custom', temp: 4000 } }, GREY);
  check(near(warm, wantW) && warm[2] > warm[0] + 20, `Temp 4000 K cools the grey, as Lightroom's Temp does (${warm}, want ${wantW})`);
  await btn('#imageeditor [data-ie=reset]');

  // The mixer: Blue band saturation −100 greys the blue patch, leaves the red one.
  await setChange('#imageeditor [data-ie=band]', 'blue');
  await setRange('#imageeditor [data-adj="mixer.band.sat"]', -100);
  const p4 = await patches(), wantB = dev({ mixer: { blue: { sat: -100 } } }, BLUE);
  check(near(p4.blue, wantB) && Math.max(...p4.blue) - Math.min(...p4.blue) < 40 && near(p4.red, RED, 1), `the mixer's Blue band desaturates the blue patch (${p4.blue}, want ${wantB}), not the red (${p4.red})`);

  // A stroke bakes the adjustment in: Undo takes the stroke, then the adjustment.
  await E(() => { const i = document.querySelector('#imageeditor [data-k=size]'); i.value = 6; i.dispatchEvent(new Event('input', { bubbles: true })); });
  const box = await E(() => { const r = document.querySelector('#imageeditor canvas').getBoundingClientRect(); return [r.left, r.top, r.width / 160]; });
  const [a, b] = [[box[0] + 20 * box[2], box[1] + 110 * box[2]], [box[0] + 60 * box[2], box[1] + 110 * box[2]]];
  if (phone) {
    const cdp = await t.page.context().newCDPSession(t.page), tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
    await tp('touchStart', a); for (let i = 1; i <= 6; i++) await tp('touchMove', [a[0] + (b[0] - a[0]) * i / 6, a[1]]); await tp('touchEnd');
  } else { await t.page.mouse.move(...a); await t.page.mouse.down(); await t.page.mouse.move(...b, { steps: 6 }); await t.page.mouse.up(); }
  await E(() => window.editor.frames(1));
  check((await st()).undo === 2 && near(await pix(120, 32), wantB), 'a stroke keeps the adjusted pixels (baked) as its own step');
  await btn('#imageeditor [data-ie=undo]');
  check(near(await pix(120, 32), wantB) && (await st()).undo === 1, 'Undo takes back the stroke, the adjustment stays');
  await btn('#imageeditor [data-ie=undo]');
  check(near(await pix(120, 32), BLUE, 0), 'Undo again takes back the adjustment');

  // Apply an adjustment: one scene step.
  await setRange('#imageeditor [data-adj="color.saturation"]', -60);
  await t.golden('editor-adjust');
  await btn('#imageeditor [data-ie=apply]');
  const s5 = await st();
  check(/^data:image\/png/.test(s5.tex) && s5.steps === steps0 + 1, 'Apply writes the adjusted image into the Decal as one scene step');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
