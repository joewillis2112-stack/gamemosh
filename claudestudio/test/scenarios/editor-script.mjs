// Scripts in the editor (web/editor/scripteditor.js, panels.js), through the real UI: the Explorer's
// + opens Insert Object, whose search finds Script; inserting one under ServerScriptService gives
// Studio's `print("Hello world!")` and opens it in the script editor; typed code with a syntax
// error shows Luau's own message and marks the line; fixed, it says no errors; Close writes the
// Source as one undo step, which Undo takes back and Redo restores; double-click (desktop) or
// Edit Script (any) opens it again; Play, with an edit still open, runs the script as edited, and
// the player's Output window shows its print, a warning and a run-time error; clicking an error
// goes back to the editor with that script open at its line.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const phone = await E(() => matchMedia('(max-width:760px)').matches);
  const btn = async sel => { if (phone) await t.page.tap(sel); else await t.page.click(sel); await E(() => window.editor.frames(1)); };
  const st = () => E(() => { const ed = window.editor, sss = ed.dm.service('ServerScriptService'), s = sss.children.find(c => c.ClassName === 'Script');
    return { src: s ? s.props.Source : null, n: sss.children.length, open: !document.getElementById('scripteditor').hidden, steps: ed.commands.history.past.length, status: document.querySelector('#scripteditor .se-status').textContent, menu: !document.getElementById('insertmenu').hidden }; });
  const CODE = 'local p = Instance.new("Part")\np.Name = "FromScript"\np.Anchored = true\np.Parent = workspace\nprint("made " .. p.Name)\n';

  if (phone) await btn('#ui [data-act=panels]');
  const steps0 = (await st()).steps;
  // The Explorer's + on ServerScriptService: Insert Object, searched.
  await E(() => { const ed = window.editor; ed.commands.run('select', { items: [ed.dm.service('ServerScriptService')] }); ed.explorer.update(); });
  const row = `#explorer [data-h="${await E(() => window.editor.dm.service('ServerScriptService').handle)}"]`;
  await btn(row + ' .add');
  check((await st()).menu, 'the + on a row opens Insert Object');
  await t.page.fill('#insertmenu input', 'script');
  const found = await E(() => [...document.querySelectorAll('#insertmenu [data-class]')].map(b => b.dataset.class));
  check(found.join() === 'LocalScript,ModuleScript,Script', `its search finds the script classes (${found})`);
  await btn('#insertmenu [data-class=Script]');
  await t.page.waitForFunction(() => window.editor.scriptEditor.active);
  const s1 = await st();
  check(s1.n === 1 && s1.src === 'print("Hello world!")\n' && s1.open && !s1.menu && s1.steps === steps0 + 1 && s1.status === 'No errors', `Script inserted under ServerScriptService with Studio's Hello world, opened, one undo step ("${s1.status}")`);

  // Type over it: first with an unfinished `if`.
  await E(() => window.editor.scriptEditor.view.focus());
  await t.page.keyboard.press('ControlOrMeta+a');
  await t.page.keyboard.type('if true then\nprint("oops")\n');
  await t.page.waitForTimeout(700);
  const s2 = await st(), marked = await E(() => document.querySelectorAll('#scripteditor .cm-lint-marker-error').length);
  check(/^Line \d+: Expected 'end'/.test(s2.status) && marked > 0 && s2.src === 'print("Hello world!")\n', `a syntax error shows Luau's message ("${s2.status}") and marks the line; the Source isn't written yet`);
  const auto = await E(() => window.editor.scriptEditor.text);
  check(/\n {2,}print\("oops"\)/.test(auto), `the editor indents inside the if (${JSON.stringify(auto)})`);
  // Replace it with working code (typed line by line, so the editor's auto-indent doesn't nest it).
  await t.page.keyboard.press('ControlOrMeta+a'); await t.page.keyboard.press('Backspace');
  await E(code => { const v = window.editor.scriptEditor.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: code } }); }, CODE);
  await t.page.waitForTimeout(700);
  check((await st()).status === 'No errors', 'fixed, it says no errors');
  await t.golden('editor-script');

  // Autocomplete from the engine and the place: "workspace.Base" offers the real Baseplate; picking it inserts it.
  await E(() => { const v = window.editor.scriptEditor.view; v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); });
  await t.page.keyboard.type('workspace.Base');
  await t.page.waitForSelector('#scripteditor .cm-tooltip-autocomplete', { timeout: 5000 }).catch(() => {});
  const offered = await E(() => [...document.querySelectorAll('#scripteditor .cm-tooltip-autocomplete li')].map(li => li.textContent));
  check(offered.some(o => o.startsWith('Baseplate')), `typing "workspace.Base" offers the place's Baseplate (${offered.slice(0, 4)})`);
  const li = '#scripteditor .cm-tooltip-autocomplete li:first-child';
  if (phone) await t.page.tap(li); else await t.page.click(li);
  check((await E(() => window.editor.scriptEditor.text)).endsWith('workspace.Baseplate'), 'picking it completes the line to workspace.Baseplate');
  await t.page.keyboard.type(':Fin');
  await t.page.waitForTimeout(300);
  const methods = await E(() => [...document.querySelectorAll('#scripteditor .cm-tooltip-autocomplete li')].map(li => li.textContent));
  check(methods.some(o => o.startsWith('FindFirstChild')) && !methods.some(o => o.startsWith('Anchored')), `after a colon it offers the Part's methods (${methods.slice(0, 3)})`);
  await E(code => { const v = window.editor.scriptEditor.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: code } }); }, CODE); // back to the working script

  // Close writes the Source: one step, which Undo and Redo move.
  await btn('#scripteditor [data-se=close]');
  const s3 = await st();
  check(!s3.open && s3.src === CODE && s3.steps === s1.steps + 1, 'Close writes the Source as one undo step');
  if (phone) await btn('#ui [data-act=undo]'); else { await t.page.keyboard.press('Control+z'); await E(() => window.editor.frames(1)); }
  check((await st()).src === 'print("Hello world!")\n', 'Undo takes the edit back');
  if (phone) await btn('#ui [data-act=redo]'); else { await t.page.keyboard.press('Control+y'); await E(() => window.editor.frames(1)); }
  check((await st()).src === CODE, 'Redo puts it back');

  // Open again: double-click its row (desktop), or Edit Script in Properties.
  await E(() => { const ed = window.editor; ed.commands.run('select', { items: [ed.dm.service('ServerScriptService').children[0]] }); ed.explorer.update(); ed.properties.update(); });
  if (!phone) {
    await t.page.dblclick(`#explorer [data-h="${await E(() => window.editor.dm.service('ServerScriptService').children[0].handle)}"] .cls`);
    check((await st()).open && (await E(() => window.editor.scriptEditor.text)) === CODE, 'double-clicking the script opens it with its Source');
    await btn('#scripteditor [data-se=close]');
  }
  await btn('#properties [data-edit]');
  const s4 = await st();
  check(s4.open && s4.steps === s3.steps, 'Edit Script opens it; closing unchanged adds no step');
  // A second script that warns and then fails at run time, for the Output window.
  await E(() => { const ed = window.editor; ed.commands.run('insert', { className: 'Script', parent: ed.dm.service('ServerScriptService'), props: { Name: 'Broken', Source: 'warn("careful")\nlocal t = nil\nprint(t.field)\n' } }); });
  await E(() => window.editor.scriptEditor.view.focus());
  // Edited and left open: Play writes it first, so the game runs what's on screen.
  await E(() => { const v = window.editor.scriptEditor.view, d = v.state.doc.toString(), i = d.indexOf('FromScript'); v.dispatch({ changes: { from: i, to: i + 'FromScript'.length, insert: 'Played' } }); });

  // Play runs it.
  if (phone) await btn('#ui [data-act=panels]');
  if (phone) await t.page.tap('#ui [data-act=play]'); else await t.page.click('#ui [data-act=play]'); // the page becomes the player
  await t.page.waitForFunction(() => window.studio && (window.studio.ready || window.studio.error), null, { timeout: 120000 });
  await E(() => window.studio.sim(5));
  const made = await E(() => !!window.studio.dm.workspace.children.find(c => c.props.Name === 'Played'));
  check(made && t.logs.some(l => l.includes('made Played')), 'Play, with the editor still open, runs the script as edited: its part is in the workspace and its print in the output');
  // Studio's Output window: the print, the warning (orange) and the error with its script and line (red).
  const out = await E(() => { const o = document.getElementById('output'); return o && { closed: o.classList.contains('closed'), lines: [...o.querySelectorAll('.out-line')].map(l => [l.className, l.textContent]) }; });
  const has = (re, cls) => out && out.lines.some(([c, t]) => re.test(t) && c.split(' ').filter(k => k !== 'link').join(' ') === cls);
  check(out && has(/^\d\d:\d\d:\d\d\.\d{3}  made Played$/, 'out-line') && has(/careful/, 'out-line warn') && has(/^\d\d:\d\d:\d\d\.\d{3}  ServerScriptService\.Broken:3: attempt to index nil with 'field'/, 'out-line err'),
    `Play from the editor shows the Output window: the print timestamped, the warning orange, the error red with its script and line (${out && out.lines.length} lines)`);
  check(out && out.closed === phone, `it starts ${phone ? 'hidden on a phone' : 'open on desktop'}`);
  if (phone) await t.page.tap('#output [data-out=toggle]'); else await t.page.click('#output [data-out=toggle]');
  check(await E(p => document.getElementById('output').classList.contains('closed') === !p, phone), 'Hide/Show toggles it');
  if (await E(() => document.getElementById('output').classList.contains('closed'))) { if (phone) await t.page.tap('#output [data-out=toggle]'); else await t.page.click('#output [data-out=toggle]'); } // shown again
  if (!phone) { await t.page.click('#output [data-out=clear]'); check(await E(() => document.querySelectorAll('#output .out-line').length === 0), 'Clear empties it'); }
  // An error line is a link: it goes back to the editor with that script open at that line (Studio's Output).
  await E(() => { window.studio.vm.run('=ServerScriptService.Broken', 'local a = 1\nerror("again")'); });
  const link = '#output .out-line.link:last-child';
  if (phone) await t.page.tap(link); else await t.page.click(link);
  await t.page.waitForFunction(() => window.editor && (window.editor.ready || window.editor.error), null, { timeout: 120000 });
  const back = await E(() => { const se = window.editor.scriptEditor, v = se.view; return { open: se.active, name: se.inst && se.inst.props.Name, line: v && v.state.doc.lineAt(v.state.selection.main.head).number }; });
  check(back.open && back.name === 'Broken' && back.line === 2, `clicking an error in the Output returns to the editor with that script open at its line (${back.name}, line ${back.line})`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
