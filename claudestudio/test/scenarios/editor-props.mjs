// The Properties panel's typed fields (web/editor/panels.js), through the real UI: a
// ParticleEmitter's NumberRange (Lifetime), NumberSequence (Size: a constant, "start end",
// Roblox's serialised form; a broken one is refused), ColorSequence (the first and last colour,
// inner keypoints kept), Vector2 (SpreadAngle); a Frame's UDim2 (Size, in Studio's
// "{scale, offset},{scale, offset}") and Vector2 (AnchorPoint); a UICorner's UDim. Each edit is
// one undo step; the read-only AbsoluteSize is shown but disabled. A part's BrickColor is picked from
// Roblox's named colours and sets its Color; a custom Color shows as its nearest.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  if (phone) { await t.page.tap('#ui [data-act=panels]'); await E(() => window.editor.frames(1)); }
  const select = name => E(n => { const ed = window.editor; const find = (r) => { for (const c of r.children) { if (c.props.Name === n) return c; const f = find(c); if (f) return f; } return null; }; const x = find(ed.dm.workspace) || find(ed.dm.service('StarterGui')); ed.commands.run('select', { items: [x] }); ed.properties.update(); return !!x; }, name);
  // Type into a field and press Enter (Studio commits on Enter / leaving the field).
  const type = async (key, text, a) => {
    const sel = `#properties [data-k="${key}"]${a ? `[data-a="${a}"]` : ''}`;
    await t.page.fill(sel, text); await t.page.press(sel, 'Enter');
    await E(() => { window.editor.properties.update(); });
  };
  const color = async (key, a, hex) => { await E(([k, a, h]) => { const el = document.querySelector(`#properties [data-k="${k}"][data-a="${a}"]`); el.value = h; el.dispatchEvent(new Event('change', { bubbles: true })); window.editor.properties.update(); }, [key, a, hex]); };
  const val = (name, key) => E(([n, k]) => { const ed = window.editor; const find = r => { for (const c of r.children) { if (c.props.Name === n) return c; const f = find(c); if (f) return f; } return null; }; const x = find(ed.dm.workspace) || find(ed.dm.service('StarterGui')); const v = x.props[k]; return v && v.toString !== Object.prototype.toString ? v.toString() : JSON.parse(JSON.stringify(v)); }, [name, key]);
  const shown = key => E(k => { const el = document.querySelector(`#properties [data-k="${k}"]`); return el && el.value; }, key);
  const steps = () => E(() => window.editor.commands.history.past.length);

  await E(() => { const ed = window.editor, p = ed.commands.run('insert', { className: 'Part' }); p.props.Name = 'Host'; const e = ed.commands.run('insert', { className: 'ParticleEmitter', parent: p }); e.props.Name = 'Fx'; });
  await select('Fx');
  check(await shown('Lifetime') === '5 10' && await shown('Size') === '1' && await shown('Speed') === '5', `Studio's text forms: Lifetime "${await shown('Lifetime')}", Size "${await shown('Size')}", Speed "${await shown('Speed')}"`);
  let s0 = await steps();
  await type('Lifetime', '2 4');
  check(JSON.stringify(await val('Fx', 'Lifetime')) === '{"min":2,"max":4}' && await steps() === s0 + 1, 'NumberRange "2 4" sets Lifetime, one undo step');
  await type('Lifetime', '9 1');
  check(JSON.stringify(await val('Fx', 'Lifetime')) === '{"min":2,"max":4}' && await shown('Lifetime') === '2 4', 'min above max is refused, the field shows the value again');
  await type('Size', '3');
  check(await val('Fx', 'Size') === '0 3 0 1 3 0 ', 'NumberSequence "3": a constant');
  await type('Size', '2 0');
  check(await val('Fx', 'Size') === '0 2 0 1 0 0 ' && await shown('Size') === '2 0', 'NumberSequence "2 0": from 2 to 0 over the life');
  await type('Transparency', '0 0 0 0.5 0.2 0.1 1 1 0');
  check(await val('Fx', 'Transparency') === '0 0 0 0.5 0.200000003 0.100000001 1 1 0 ', `Roblox's serialised form, with an envelope (${await val('Fx', 'Transparency')})`);
  await type('Transparency', '0 0 0 0.5 1 0');
  check((await val('Fx', 'Transparency')).startsWith('0 0 0 0.5 0.2'), 'a sequence not ending at time 1 is refused');
  await E(() => { const ed = window.editor; let fx; const f = r => { for (const c of r.children) { if (c.props.Name === 'Fx') fx = c; f(c); } }; f(ed.dm.workspace); const CS = fx.props.Color.constructor, C3 = fx.props.Color.k[0][1].constructor; ed.commands.run('setProperty', { key: 'Color', value: new CS([[0, new C3(1, 1, 1)], [0.5, new C3(0, 1, 0)], [1, new C3(1, 1, 1)]]) }); ed.properties.update(); });
  await color('Color', 'first', '#ff0000'); await color('Color', 'last', '#0000ff');
  check(await val('Fx', 'Color') === '0 1 0 0 0 0.5 0 1 0 0 1 0 0 1 0 ', `ColorSequence: first red, last blue, the green middle kept (${await val('Fx', 'Color')})`);
  await type('SpreadAngle', '30', 'x');
  check(JSON.stringify(await val('Fx', 'SpreadAngle')) === '{"x":30,"y":0}', 'Vector2: SpreadAngle X 30');
  s0 = await steps();
  await E(() => { window.editor.commands.history.undo(); window.editor.properties.update(); });
  check(JSON.stringify(await val('Fx', 'SpreadAngle')) === '{"x":0,"y":0}' && await steps() === s0 - 1, 'Undo takes the edit back');

  // GUI: a Frame under a ScreenGui in StarterGui.
  await E(() => { const ed = window.editor, g = ed.commands.run('insert', { className: 'ScreenGui', parent: ed.dm.service('StarterGui') }); const f = ed.commands.run('insert', { className: 'Frame', parent: g }); f.props.Name = 'Box'; const c = ed.commands.run('insert', { className: 'UICorner', parent: f }); c.props.Name = 'Round'; });
  await select('Box');
  await type('Size', '{0.5, 0},{0, 120}');
  check(JSON.stringify(await val('Box', 'Size')) === '{"xs":0.5,"xo":0,"ys":0,"yo":120}' && await shown('Size') === '{0.5, 0},{0, 120}', 'UDim2 typed as {0.5, 0},{0, 120}');
  await type('Size', '{1, 2}');
  check(JSON.stringify(await val('Box', 'Size')) === '{"xs":0.5,"xo":0,"ys":0,"yo":120}', 'a UDim2 with two numbers is refused');
  await type('AnchorPoint', '0.5', 'x'); await type('AnchorPoint', '1', 'y');
  check(JSON.stringify(await val('Box', 'AnchorPoint')) === '{"x":0.5,"y":1}', 'Vector2: AnchorPoint (0.5, 1)');
  check(await E(() => { const el = document.querySelector('#properties [data-k="AbsoluteSize"]'); return !!el && el.disabled; }), 'AbsoluteSize is shown, read-only');
  await select('Round');
  await type('CornerRadius', '{0, 12}');
  check(JSON.stringify(await val('Round', 'CornerRadius')) === '{"s":0,"o":12}', 'UDim: CornerRadius {0, 12}');
  await select('Fx');
  await E(() => window.editor.frames(3));
  await t.golden('editor-props');
  // A part's BrickColor (after the golden, which shows the part's colour): its named colour, picked
  // from a list; picking one sets Color as one undo step; a custom Color shows as its nearest.
  await select('Host');
  const bc = () => E(() => { const el = document.querySelector('#properties [data-k="BrickColor"]'); return el && { v: el.value, text: el.selectedOptions[0] && el.selectedOptions[0].textContent, n: el.options.length }; });
  let b = await bc();
  check(b && b.v === '194' && b.text === 'Medium stone grey' && b.n === 208, `BrickColor shows the part's (${JSON.stringify(b)}), all 208 to pick from`);
  s0 = await steps();
  await t.page.selectOption('#properties [data-k="BrickColor"]', '11'); await E(() => window.editor.properties.update());
  const col = () => E(() => { const ed = window.editor, x = ed.dm.workspace.children.find(c => c.props.Name === 'Host'); return [x.props.Color.r, x.props.Color.g, x.props.Color.b].map(v => Math.round(v * 255)).join(','); });
  check(await col() === '128,187,219' && (await bc()).text === 'Pastel Blue' && await shown('Color') === '#80bbdb' && await steps() === s0 + 1, `picking Pastel Blue sets Color to it (${await col()}), one undo step`);
  await E(() => { const el = document.querySelector('#properties [data-k="Color"]'); el.value = '#fa0a0a'; el.dispatchEvent(new Event('change', { bubbles: true })); window.editor.properties.update(); });
  check(await col() === '250,10,10' && (await bc()).text === 'Really red', `a custom Color shows as its nearest BrickColor (${(await bc()).text}), the Color kept`);
  await E(() => { window.editor.commands.run('undo'); window.editor.commands.run('undo'); window.editor.properties.update(); });
  check(await col() === '163,162,165' && (await bc()).text === 'Medium stone grey', 'undo puts the colour back');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
