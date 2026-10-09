// The player list (places/leaderstats-lab.luau), against Roblox's CoreScripts:
// - columns: IsPrimary first, then Priority, then creation order (Wins, Coins, Stage);
// - numbers get thousands separators; 7+ characters abbreviate; no stat shows "-";
// - rows: highest first stat first, ties by name, players without it last;
// - the panel: top right, 4 px in, under the 58 px top bar, width
//   66 per stat + 16 + (150 + 11 per stat);
// - a script's change (the stage pad) shows; Tab and SetCoreGuiEnabled hide it;
// - on a phone, one stat column (run with --phone).
// Goldens: the list on desktop and on a phone.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(30);
  await t.eval(() => window.studio.gui.fontsReady());
  await t.sim(1);
  const phone = await t.eval(() => window.studio.controls.isTouch);
  const state = () => t.eval(() => window.studio.gui.playerList.state);
  const rect = () => t.eval(() => { const r = window.studio.gui.playerList.el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, right: innerWidth - r.right }; });
  const me = await t.eval(() => window.studio.players.player.props.Name);
  let s = await state();
  console.log('list', JSON.stringify(s), JSON.stringify(await rect()));
  if (!phone) {
    check(JSON.stringify(s.columns) === '["Wins","Coins","Stage"]', 'columns: IsPrimary first, then Priority, then creation order');
    check(JSON.stringify(s.rows) === JSON.stringify([[me, '3', '1,250', '1']]), 'values with thousands separators');
    const r = await rect();
    check(s.width === 3 * 66 + 16 + 150 + 33 && Math.abs(r.w - s.width) < 0.5 && Math.abs(r.right - 4) < 0.5 && Math.abs(r.y - 62) < 0.5, `panel at the top right, 4 px in, under the top bar, ${s.width} px wide`);
    check(Math.abs(r.h - (4 + 20 + 40 + 4)) < 0.5, 'one 40 px row under a 20 px title bar, with 4 px caps');
  } else {
    check(JSON.stringify(s.columns) === '["Wins"]', 'a phone shows one stat column (the first)');
    check(s.width === 66 + 16 + 161, `phone panel width ${s.width}`);
  }

  // The stage pad: the server script raises Stage once per visit.
  await t.eval(() => { const S = window.studio, p = S.player, V = p.holder.position.constructor; p.teleport(new V(0, 0, -16), 0); S.sim(20); });
  const stage = await t.eval(() => window.studio.players.player.children.find(c => c.props.Name === 'leaderstats').children.find(c => c.props.Name === 'Stage').props.Value);
  s = await state();
  check(stage === 2 && (phone || s.rows[0][3] === '2'), `the pad raised Stage to ${stage}, and the list shows it`);

  // Other players (made here: scripts can't create Players), to test the row order.
  await t.eval(() => {
    const S = window.studio, dm = S.dm, I = S.players.player.constructor, svc = S.players.service;
    const add = (name, stats) => {
      const p = new I(dm, 'Player'); p.props.Name = name; p.props.DisplayName = name; p.props.UserId = name.length * 1000;
      if (stats) {
        const f = new I(dm, 'Folder'); f.props.Name = 'leaderstats';
        for (const [k, v] of Object.entries(stats)) { const iv = new I(dm, 'IntValue'); iv.props.Name = k; iv.props.Value = v; dm.setParent(iv, f); }
        dm.setParent(f, p);
      }
      dm.setParent(p, svc);
    };
    add('alice', { Wins: 10, Coins: 1234567, Stage: 4 });
    add('Zed', { Wins: 3, Coins: 999999, Stage: 9 });
    add('Bob', null);
  });
  await t.sim(1);
  s = await state();
  const order = s.rows.map(r => r[0]);
  console.log('rows', JSON.stringify(s.rows));
  const want = me.toUpperCase() < 'ZED' ? ['alice', me, 'Zed', 'Bob'] : ['alice', 'Zed', me, 'Bob'];
  check(JSON.stringify(order) === JSON.stringify(want), `rows by Wins, highest first; a tie by name; no stats last (${order.join(', ')})`);
  if (!phone) {
    const row = n => s.rows.find(r => r[0] === n);
    check(row('alice')[2] === '1.23M' && row('Zed')[2] === '999,999' && row('Bob').slice(1).join() === '-,-,-', 'a 7-digit number abbreviates, 6 digits don\'t, a missing stat is "-"');
  }
  await t.frames(2);
  await t.shot('leaderstats'); await t.golden('leaderstats');

  // Hiding: Tab on a keyboard, and StarterGui:SetCoreGuiEnabled from a script.
  const shown = () => t.eval(() => window.studio.gui.playerList.el.style.display !== 'none');
  if (!phone) {
    await t.page.keyboard.press('Tab'); await t.sim(1);
    const a = await shown();
    await t.page.keyboard.press('Tab'); await t.sim(1);
    check(!a && await shown(), 'Tab hides the list and shows it again');
  }
  await t.eval(() => window.studio.vm.run('core', `local SG = game:GetService("StarterGui") SG:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false) print("core", SG:GetCoreGuiEnabled(Enum.CoreGuiType.PlayerList), SG:GetCoreGuiEnabled(Enum.CoreGuiType.All))`));
  await t.sim(1);
  const hidden = !(await shown());
  await t.eval(() => window.studio.vm.run('core2', `game:GetService("StarterGui"):SetCoreGuiEnabled("All", true)`));
  await t.sim(1);
  const logs = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  check(hidden && await shown() && logs.includes('core false false'), 'SetCoreGuiEnabled(PlayerList, false) hides it; All turns it back on');
  check(logs.includes('leaderstats made') && logs.filter(l => l.startsWith('stage ')).length === 1, 'the server script ran once per player join, and the pad fired once');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
