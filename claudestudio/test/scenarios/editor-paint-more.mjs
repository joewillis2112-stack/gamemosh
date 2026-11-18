// The Paint tool beyond blocks (web/editor/paint.js, runtime/world.js), with real drags and touches:
//  - a Ball, a Cylinder (its round side and a cap) and a WedgePart (its slope and a triangular side)
//    take paint where it is dragged, into a Decal on the face under the pointer, and the paint lies
//    on the surface: red where the drag crossed the surface (seen from an angle, so a flat plane in
//    front of the face would show elsewhere), nothing past the face's edge (a cap's corner, the air
//    above a wedge's slope), every vertex of the Decal's mesh on the part's surface;
//  - the texture size choice makes the new Decal's image that size;
//  - brush presets set the brush and the bar follows; moving a slider leaves the preset;
//  - Pick (and Alt+click) takes the colour under the pointer: the paint's, or the part's own where
//    nothing is painted;
//  - on a phone every Paint bar control is at least 44 px; on desktop the bar shows everything.
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
    await t.page.waitForTimeout(300); await E(() => window.editor.frames(2));
  };
  const tap = async p => { if (phone) await t.page.touchscreen.tap(...p); else await t.page.mouse.click(...p); await t.page.waitForTimeout(300); await E(() => window.editor.frames(1)); };
  const screen = p => E(p => { const ed = window.editor; ed.frames(1); const c = document.getElementById('c'), r = c.getBoundingClientRect(), cam = ed.camera.cam, V = cam.position.constructor, s = ed.camera.scale(); const q = V.Project(new V(...p), ed.scene.getTransformMatrix().constructor.Identity(), ed.scene.getTransformMatrix(), cam.viewport.toGlobal(c.width, c.height)); return [r.left + q.x / s, r.top + q.y / s]; }, p);
  const colourAt = async p => { await E(() => window.editor.frames(2)); const [x, y] = await screen(p); const png = PNG.sync.read(await t.page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })); const i = (1 * png.width + 1) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const red = c => c[0] > 120 && c[0] > c[1] * 2 && c[0] > c[2] * 2;
  const reddish = c => c[0] > 40 && c[0] > c[1] * 3 && c[0] > c[2] * 2; // red in shade (a cap turned from the light)
  const settled = async (p, want) => { let c; for (let i = 0; i < 30; i++) { c = await colourAt(p); if (want(c)) return c; await t.page.waitForTimeout(100); } return c; };
  const look = (pos, at) => E(([p, a]) => { const ed = window.editor, V = ed.camera.pos.constructor; ed.camera.pos = new V(...p); ed.camera.lookAt(new V(...a)); ed.camera.apply(); ed.frames(1); }, [pos, at]);
  const setBar = (k, v) => E(([k, v]) => { const i = document.querySelector(`#paintbar [data-k=${k}]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
  const insert = (cls, name, props) => E(([cls, name, props]) => { const ed = window.editor, CF = ed.CF, V3 = ed.V3; const p = ed.commands.run('insert', { className: cls, props: { Name: name, Size: new V3(...props.size), CFrame: new CF([...props.at, 1, 0, 0, 0, 1, 0, 0, 0, 1]), Color: new ed.C3(0.62, 0.62, 0.62), ...(props.shape ? { Shape: props.shape } : {}) } }); ed.commands.run('select', { items: [] }); }, [cls, name, props]);
  // The Decals on a part: face, and whether every vertex of the mesh drawing it lies on the part's
  // surface (`on`: the test of a unit-space point; planes are left out: they are the flat faces).
  const decals = (name, on) => E(([name, on]) => {
    const ed = window.editor, P = ed.dm.workspace.children.find(c => c.props.Name === name), e = ed.world.parts.get(P), test = new Function('x', 'y', 'z', 'return ' + on);
    return P.children.filter(c => c.ClassName === 'Decal').map(d => { const m = e.decals.find(p => p.metadata.decal === d), pos = m.getVerticesData("position"); let bad = 0; if (m.metadata.projected) for (let i = 0; i < pos.length; i += 3) if (!test(pos[i], pos[i + 1], pos[i + 2])) bad++; return { face: d.props.Face, verts: pos.length / 3, bad, tex: d.props.Texture }; });
  }, [name, on]);
  const near = (a, b, tol = 1e-3) => Math.abs(a - b) < tol;

  await btn('#ui [data-act=paint]');
  await setBar('size', 64); await setBar('hardness', 1);

  // ---- A Ball (diameter 6): a stroke across its front, above the middle.
  await insert('Part', 'Ball', { size: [6, 6, 6], at: [0, 6, -20], shape: 'Ball' });
  await look([0, 6, -34], [0, 6, -20]);
  const onBall = (x, y) => [x, y, -20 - Math.sqrt(9 - x * x - (y - 6) ** 2) - 0.01];
  await drag(await screen(onBall(-1.6, 7.2)), await screen(onBall(1.2, 7.2)));
  let d = await decals('Ball', 'Math.abs(Math.hypot(x, y, z) - 0.5) < 1e-3');
  check(d.length === 1 && d[0].face === 'Front' && d[0].bad === 0 && d[0].verts > 30, `Ball: the stroke adds a Front Decal drawn on the sphere itself (${d.map(x => `${x.face}, ${x.verts} vertices, ${x.bad} off the surface`)})`);
  await look([9, 9, -32], [0, 6, -20]); // from the right and above: a plane at the face would show elsewhere
  const b1 = await settled(onBall(-0.4, 7.2), red), b2 = await colourAt(onBall(-0.4, 4.8));
  check(red(b1) && !red(b2), `Ball: seen from an angle, red where the drag crossed the surface (${b1}), not mirrored below (${b2})`);

  // An image made elsewhere lies the right way up on a ball, as on a block's face: a Decal whose top
  // half is red, on another ball's Front, is red above the middle and clear below.
  await insert('Part', 'Ball2', { size: [6, 6, 6], at: [0, 6, 12], shape: 'Ball' });
  await E(() => { const ed = window.editor, c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e01010'; g.fillRect(0, 0, 64, 32);
    const P = ed.dm.workspace.children.find(x => x.props.Name === 'Ball2'); ed.commands.run('insert', { className: 'Decal', parent: P, props: { Face: 'Front', Texture: c.toDataURL('image/png') } }); ed.commands.run('select', { items: [] }); });
  await look([0, 6, -2], [0, 6, 12]);
  const up = await settled([0, 7.5, 12 - Math.sqrt(9 - 2.25) - 0.01], red), down = await colourAt([0, 4.5, 12 - Math.sqrt(9 - 2.25) - 0.01]);
  check(red(up) && !red(down), `a Decal's own image on a Ball is the right way up: its red top half above the middle (${up}), not below (${down})`);

  // ---- A Cylinder (Roblox's: along X), length 6, diameter 4: its round front, then its right cap.
  await insert('Part', 'Cyl', { size: [6, 4, 4], at: [14, 6, -20], shape: 'Cylinder' });
  await look([14, 6, -34], [14, 6, -20]);
  const onSide = (x, y) => [x, y, -20 - Math.sqrt(4 - (y - 6) ** 2) - 0.01];
  await drag(await screen(onSide(12, 6.9)), await screen(onSide(15.5, 6.9)));
  await look([20, 9, -31], [14, 6, -20]);
  const c1 = await settled(onSide(13.5, 6.9), red), c2 = await colourAt(onSide(13.5, 5.1));
  d = await decals('Cyl', 'Math.abs(x) > 0.5 - 1e-3 || Math.abs(Math.hypot(y, z) - 0.5) < 1e-3');
  check(d.length === 1 && d[0].face === 'Front' && d[0].bad === 0 && red(c1) && !red(c2), `Cylinder: the round front takes the paint on its surface (${d.map(x => `${x.face}, ${x.bad} off`)}; ${c1} at the stroke, ${c2} below)`);
  await look([28, 6, -20], [17, 6, -20]); // facing the right cap
  await setBar('size', 160);
  const capA = await screen([17.01, 7.2, -21]), capB = await screen([17.01, 7.2, -19]);
  await drag(capA, capB);
  d = await decals('Cyl', 'Math.abs(x) > 0.5 - 1e-3 || Math.abs(Math.hypot(y, z) - 0.5) < 1e-3');
  await look([26, 9, -27], [17, 6, -20]);
  const capIn = await settled([17.01, 7.3, -20], reddish), capCorner = await colourAt([17.01, 7.85, -21.85]);
  check(d.length === 2 && d.some(x => x.face === 'Right') && d.every(x => x.bad === 0) && reddish(capIn) && !reddish(capCorner), `Cylinder: its cap takes paint (${capIn}) only inside its circle, not at the square's corner (${capCorner}) [${d.map(x => `${x.face} ${x.verts}v ${x.bad} off`)}]`);

  // ---- A WedgePart, 4 wide, 4 high, 6 deep: the slope is its Front; then its left side, a triangle.
  await setBar('size', 64);
  await insert('WedgePart', 'Wedge', { size: [4, 4, 6], at: [-14, 6, -20] });
  await look([-14, 12, -32], [-14, 6, -20]);
  const onSlope = (x, f) => [x, 4 + 4 * f, -23 + 6 * f]; // f: 0 at the front edge, 1 at the top
  await drag(await screen(onSlope(-15.2, 0.6)), await screen(onSlope(-12.8, 0.6)));
  const w1 = await settled(onSlope(-14, 0.6), red), w2 = await colourAt(onSlope(-14, 0.25));
  d = await decals('Wedge', 'true');
  check(d.length === 1 && d[0].face === 'Front' && red(w1) && !red(w2), `Wedge: the slope takes the paint as its Front Decal (${d.map(x => x.face)}; ${w1} at the stroke, ${w2} lower down)`);
  await look([-28, 7, -20], [-16, 6, -20]); // facing the left side
  await setBar('size', 200);
  const side = (fz, fy) => [-16.01, 6 + 4 * fy, -20 + 6 * fz]; // in the side's unit square (−0.5..0.5); the wedge fills fy <= fz
  await drag(await screen(side(0.3, -0.35)), await screen(side(0.05, -0.35)));
  d = await decals('Wedge', 'Math.abs(x) > 0.5 - 1e-3 ? y <= z + 1e-3 : true');
  await look([-26, 9, -12], [-16, 6, -20]);
  const sIn = await settled(side(0.2, -0.3), red), sAir = await colourAt(side(-0.2, 0.25));
  check(d.length === 2 && d.some(x => x.face === 'Left') && d.every(x => x.bad === 0) && red(sIn) && !red(sAir), `Wedge: its triangular side takes paint (${sIn}), none in the air above the slope (${sAir}), the Decal's mesh only the triangle (${d.map(x => `${x.face} ${x.verts}v ${x.bad} off`)})`);

  // ---- Texture size: a new Decal's image at 256 x 256 (Auto made 512).
  const sizeOf = url => E(u => new Promise(ok => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.src = u; }), url);
  const auto = await sizeOf((await decals('Ball', 'true'))[0].tex);
  await E(() => { const s = document.querySelector('#paintbar [data-k=texSize]'); s.value = '256'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await setBar('size', 64);
  await look([0, 6, -8], [0, 6, -20]); // the ball's back
  const back = (x, y) => [x, y, -20 + Math.sqrt(9 - x * x - (y - 6) ** 2) + 0.01];
  await drag(await screen(back(1, 6.5)), await screen(back(-1, 6.5)));
  d = await decals('Ball', 'true');
  const small = d.find(x => x.face === 'Back');
  const sz = small && await sizeOf(small.tex);
  check(auto[0] === 512 && sz && sz[0] === 256 && sz[1] === 256, `the texture size choice: a new Decal at 256² (${sz}); Auto made ${auto}`);
  await E(() => { const s = document.querySelector('#paintbar [data-k=texSize]'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); });

  // ---- Brush presets.
  const brushNow = () => E(() => { const S = window.editor.paintTools.settings, B = document.getElementById('paintbar'); return { S: { size: S.size, hardness: S.hardness, aliased: S.aliased, roundness: S.roundness, angle: S.angle, spacing: S.spacing, sd: S.shapeDynamics, preset: S.preset, color: S.color }, slider: { size: +B.querySelector('[data-k=size]').value, hardness: +B.querySelector('[data-k=hardness]').value }, sel: B.querySelector('[data-k=preset]').value, on: [...B.querySelectorAll('button.on')].map(b => b.dataset.p) }; });
  const pick = async name => E(n => { const s = document.querySelector('#paintbar [data-k=preset]'); s.value = n; s.dispatchEvent(new Event('change', { bubbles: true })); }, name);
  await pick('Hard Pencil');
  let bn = await brushNow();
  check(bn.S.size === 3 && bn.S.aliased && bn.slider.size === 3 && bn.sel === 'Hard Pencil' && bn.on.includes('pencil'), `the Hard Pencil preset: a 3 px aliased tip, the Size slider and the Pencil button follow (${JSON.stringify(bn.slider)}, ${bn.on})`);
  await pick('Gouache Flat');
  bn = await brushNow();
  check(bn.S.size === 40 && !bn.S.aliased && Math.abs(bn.S.roundness - 0.35) < 1e-6 && bn.S.sd && bn.S.sd.angle.control === 'direction' && bn.slider.hardness === 0.9 && bn.on.includes('brush'), `Gouache Flat: a flat tip turned along the stroke (roundness ${bn.S.roundness}, angle by ${bn.S.sd && bn.S.sd.angle.control}), Brush on`);
  await setBar('size', 30);
  bn = await brushNow();
  check(bn.sel === '' && bn.S.size === 30 && bn.S.sd && bn.S.sd.angle.control === 'direction', `moving a slider leaves the preset's name (the rest of it stays)`);
  await pick('Hard Round');

  // ---- Pick: the stroke's colour off the ball's front, then the part's own where nothing is painted.
  await look([0, 6, -34], [0, 6, -20]);
  await E(() => { const i = document.querySelector('#paintbar [data-k=color]'); i.value = '#20c040'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await btn('#paintbar [data-p=pick]');
  const steps0 = await E(() => window.editor.commands.history.past.length);
  await tap(await screen(onBall(-0.3, 7.2)));
  bn = await brushNow();
  const want = [0.85, 0.15, 0.1], got = bn.S.color;
  check(got.slice(0, 3).every((v, i) => Math.abs(v - want[i]) < 1.5 / 255) && !bn.on.includes('pick') && await E(() => window.editor.commands.history.past.length) === steps0, `Pick on the stroke takes its colour (${got.slice(0, 3).map(v => v.toFixed(3))}), paints nothing, and goes back to the brush`);
  await btn('#paintbar [data-p=pick]');
  await tap(await screen(onBall(0, 4.6))); // below the stroke: the Decal is clear there
  bn = await brushNow();
  check(bn.S.color.slice(0, 3).every(v => Math.abs(v - 0.62) < 1.5 / 255), `Pick where nothing is painted takes the part's Color (${bn.S.color.slice(0, 3).map(v => v.toFixed(3))})`);
  if (!phone) {
    await E(() => { const i = document.querySelector('#paintbar [data-k=color]'); i.value = '#20c040'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    const [x, y] = await screen(onBall(0.3, 7.2));
    await t.page.keyboard.down('Alt'); await t.page.mouse.click(x, y); await t.page.keyboard.up('Alt'); await t.page.waitForTimeout(300);
    bn = await brushNow();
    check(bn.S.color.slice(0, 3).every((v, i) => Math.abs(v - want[i]) < 1.5 / 255), `Alt+click picks too (${bn.S.color.slice(0, 3).map(v => v.toFixed(3))})`);
  }

  // ---- The bar itself.
  if (phone) {
    const small = await E(() => [...document.querySelectorAll('#paintbar button, #paintbar select, #paintbar input[type=color]')].map(el => { const r = el.getBoundingClientRect(); return [el.dataset.p || el.dataset.k || el.textContent, Math.round(Math.min(r.width, r.height))]; }).filter(([, s]) => s < 44));
    check(!small.length, `phone: every Paint bar control is at least 44 px (${small.length ? JSON.stringify(small) : 'all'})`);
  } else {
    const fit = await E(() => { const B = document.getElementById('paintbar'), r = B.getBoundingClientRect(), tb = document.getElementById('ui'); return { over: [...B.children].filter(c => { const q = c.getBoundingClientRect(); return q.right > r.right + 0.5 || q.left < r.left - 0.5; }).length, tool: tb.scrollWidth }; });
    check(fit.over === 0 && fit.tool <= 1280, `desktop: every Paint bar control shows inside the bar (${fit.over} cut off); the toolbar is ${fit.tool} px`);
  }
  await look([4, 12, -40], [2, 6, -20]);
  await t.golden('editor-paint-more');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
