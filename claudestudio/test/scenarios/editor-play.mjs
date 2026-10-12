// Edit, Play, Stop (Roblox Studio's loop), through the real pages:
// - the editor doesn't run scripts or physics (edit mode);
// - Play hands the place as edited to the player: the moved part is where it was
//   put, the new unanchored part falls, the place's Script runs;
// - Stop comes back to the editor with the place as it was before Play.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const find = name => `(function(){ const w = (window.editor || window.studio).dm.workspace; for (const c of w.children) if (c.props.Name === ${JSON.stringify(name)}) return c; })()`;

  // Edit: move Block1 up 10 studs, add an unanchored "Drop" part at height 30, add a Script.
  const b0 = await E(f => { const ed = window.editor, b = eval(f); ed.commands.run('move', { items: [b], by: { x: 0, y: 10, z: 0 } }); return [b.props.CFrame.x, b.props.CFrame.y, b.props.CFrame.z]; }, find('Block1'));
  await E(() => {
    const ed = window.editor, { V3 } = ed;
    const drop = ed.commands.run('insert', { className: 'Part' });
    ed.commands.run('setProperty', { items: [drop], key: 'Name', value: 'Drop' });
    ed.commands.run('setProperty', { items: [drop], key: 'Anchored', value: false });
    ed.commands.run('setProperty', { items: [drop], key: 'Position', value: new V3(20, 30, 0) });
    ed.commands.run('insert', { className: 'Script', parent: ed.dm.service('ServerScriptService'), props: { Source: 'print("script ran") workspace.Block2.Transparency = 0.7' } });
    ed.vm.run('flush', ''); // anything that runs Luau also starts queued scripts: none may start in edit mode
    ed.frames(30);
  });
  const edit = await E(f => { const d = eval(f), b2 = eval(f.replace('"Drop"', '"Block2"')); return { dropY: d.props.CFrame.y, b2t: b2.props.Transparency }; }, find('Drop'));
  check(edit.dropY === 30 && edit.b2t === 0 && !t.logs.some(l => l.includes('script ran')), `edit mode: nothing falls and no script runs (Drop y ${edit.dropY}, Block2 transparency ${edit.b2t})`);

  // Play.
  await t.page.click('#ui [data-act=play]');
  await t.page.waitForFunction(() => window.studio && (window.studio.ready || window.studio.error), null, { timeout: 120000 });
  check(!(await E(() => window.studio.error)), 'Play opens the place in the player');
  await E(() => window.studio.sim(60));
  const play = await E(f => { const w = window.studio.dm.workspace, get = n => [...w.children].find(c => c.props.Name === n); const b = get('Block1'), d = get('Drop'), b2 = get('Block2'); return { b: [b.props.CFrame.x, b.props.CFrame.y, b.props.CFrame.z], dropY: d && d.props.CFrame.y, b2t: b2.props.Transparency }; });
  check(JSON.stringify(play.b) === JSON.stringify(b0.map((v, i) => i === 1 ? v : v)) || Math.abs(play.b[1] - b0[1]) < 1e-6, `the moved part is where the editor put it (${play.b})`);
  check(play.dropY < 25, `the unanchored part falls in play (y ${play.dropY && play.dropY.toFixed(1)})`);
  check(t.logs.some(l => l.includes('script ran')) && play.b2t === 0.7, `the place's Script runs in play (Block2 transparency ${play.b2t})`);

  // Stop.
  await t.page.click('#stop');
  await t.page.waitForFunction(() => window.editor && (window.editor.ready || window.editor.error), null, { timeout: 120000 });
  const back = await E(f => { const ed = window.editor, w = ed.dm.workspace, get = n => [...w.children].find(c => c.props.Name === n); return { dropY: get('Drop').props.CFrame.y, b: get('Block1').props.CFrame.y, b2t: get('Block2').props.Transparency, scripts: ed.dm.service('ServerScriptService').children.length }; });
  check(back.dropY === 30 && Math.abs(back.b - b0[1]) < 1e-6 && back.b2t === 0 && back.scripts === 1, `Stop returns to the editor with the place as it was before Play (Drop y ${back.dropY}, Block2 transparency ${back.b2t}, ${back.scripts} script)`);
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
