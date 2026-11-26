// BillboardGuis (run with --place places/billboard-lab.luau; runtime/gui.js), measured on the page against the
// camera's own projection:
// - a sign 4 x 1 studs (Scale) over a post stands at the post plus StudsOffset, 4 studs wide at its distance, and
//   grows as the camera comes closer; a name tag in pixels (Offset) on an NPC's head keeps its pixel size and
//   follows the NPC as it walks;
// - AlwaysOnTop off: hidden behind a wall, shown when AlwaysOnTop; MaxDistance hides it beyond; DistanceUpperLimit
//   stops the shrinking; SizeOffset (0.5, 0.5) anchors the bottom left on the point; PlayerToHideFrom hides it from
//   us; CurrentDistance steps by DistanceStep, firing Changed;
// - one in PlayerGui draws at its Adornee; without one it doesn't; its text is drawn.
// (Stepped with sim: the GUI places billboards from the camera of the frame, drawn or not.)
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const run = src => t.eval(s => window.studio.vm.run('bb', s), src);
  for (let i = 0; i < 60; i++) { const ok = await t.eval(() => { const s = window.studio, m = s.dm.workspace.children.find(c => c.props.Name === 'Merchant'), e = m && s.npcs.npcs.get(m); return !!(e && e.char && m.children.find(c => c.props.Name === 'Head')); }); if (ok) break; await t.sim(5); }
  await run(`local tag = Instance.new("BillboardGui"); tag.Name = "Tag"; tag.Size = UDim2.fromOffset(120, 30); tag.StudsOffset = Vector3.new(0, 2, 0); tag.AlwaysOnTop = true
    local l = Instance.new("TextLabel"); l.Size = UDim2.fromScale(1, 1); l.Text = "Merchant"; l.TextScaled = true; l.BackgroundTransparency = 1; l.TextColor3 = Color3.new(1, 1, 1); l.Parent = tag
    tag.Parent = workspace.Merchant.Head`);
  // A view: the camera fixed on a point, looking from the south (+Z) at a distance.
  const view = async (focus, zoom, yaw = 0, pitch = 0.15) => { await t.eval(([f, z, y, p]) => { const c = window.studio.camera; c.focus = f; c.zoom = z; c.yaw = y; c.pitch = p; }, [focus, zoom, yaw, pitch]); await t.sim(30); };
  // A billboard's drawn box and what it should be: the anchor's projection and the size its Size gives there.
  const meas = name => t.eval(name => {
    const s = window.studio, find = (i) => { for (const c of i.children) { if (c.props.Name === name && c.ClassName === 'BillboardGui') return c; const r = find(c); if (r) return r; } return null; };
    const pg = s.dm.service('Players').children[0].children.find(c => c.ClassName === 'PlayerGui');
    const bb = find(s.dm.workspace) || (pg && find(pg)); if (!bb) return null;
    const e = s.gui.els.get(bb), shown = !!(e && e.el.style.display !== 'none' && e.el.isConnected);
    const r = e && e.el.getBoundingClientRect(), P = bb.props, ad = P.Adornee || bb.parent;
    const C = s.dm.workspace.props.CurrentCamera.props.CFrame, m = C.m, f = ad.props.CFrame;
    const so = P.StudsOffset, at = [f.x + m[3] * so.x + m[4] * so.y + m[5] * so.z, f.y + m[6] * so.x + m[7] * so.y + m[8] * so.z, f.z + m[9] * so.x + m[10] * so.y + m[11] * so.z];
    const dist = Math.hypot(at[0] - C.x, at[1] - C.y, at[2] - C.z), p = s.gui.view.project(at), pps = s.gui.view.perStud(dist);
    const text = e ? e.el.textContent : '';
    return { shown, box: r ? [r.left, r.top, r.width, r.height] : null, p: p ? [p.x, p.y] : null, pps, dist, size: [P.Size.xs, P.Size.xo, P.Size.ys, P.Size.yo], cd: P.CurrentDistance, text };
  }, name);
  // The sign: centred on the post's top plus StudsOffset, 4 studs by 1 at its distance.
  await view([0, 4, 0], 30);
  const s1 = await meas('Sign');
  const want = s1 && [s1.p[0] - 2 * s1.pps, s1.p[1] - 0.5 * s1.pps, 4 * s1.pps, s1.pps];
  const off = s1 && s1.box ? Math.max(...s1.box.map((v, i) => Math.abs(v - want[i]))) : Infinity;
  check(s1 && s1.shown && off < 1, `the sign: centred at its anchor, 4 x 1 studs at ${s1 && s1.dist.toFixed(1)} studs (${s1 && s1.box.map(v => v.toFixed(1))}; ${off.toFixed(2)} px off)`);
  check(s1 && s1.text === 'SHOP', `its text is drawn (${s1 && s1.text})`);
  await view([0, 4, 0], 15);
  const s2 = await meas('Sign');
  check(s2 && Math.abs(s2.box[2] / s1.box[2] - s1.dist / s2.dist) < 0.02, `closer, it grows as 1/distance (${(s2.box[2] / s1.box[2]).toFixed(3)} x for ${(s1.dist / s2.dist).toFixed(3)})`);
  // The name tag: 120 x 30 pixels at any distance, following the NPC.
  await view([6, 4, 0], 20);
  const n1 = await meas('Tag');
  await view([6, 4, 0], 40);
  const n2 = await meas('Tag');
  check(n1 && n2 && n1.shown && Math.abs(n1.box[2] - 120) < 0.5 && Math.abs(n2.box[2] - 120) < 0.5 && Math.abs(n1.box[3] - 30) < 0.5, `a name tag in pixels keeps 120 x 30 at ${n1 && n1.dist.toFixed(0)} and ${n2 && n2.dist.toFixed(0)} studs (${n1 && n1.box[2].toFixed(1)}, ${n2 && n2.box[2].toFixed(1)})`);
  await run(`workspace.Merchant.Humanoid:MoveTo(Vector3.new(6, 0, -10))`);
  await t.sim(20);
  const n3 = await meas('Tag');
  const c3 = n3 && [n3.box[0] + n3.box[2] / 2, n3.box[1] + n3.box[3] / 2];
  check(n3 && n3.shown && Math.hypot(c3[0] - n3.p[0], c3[1] - n3.p[1]) < 1 && Math.hypot(n3.p[0] - n2.p[0], n3.p[1] - n2.p[1]) > 5, `it follows the NPC as it walks (centre ${c3 && c3.map(v => v.toFixed(1))}, its head's point ${n3 && n3.p.map(v => v.toFixed(1))})`);
  // Behind the wall: hidden while AlwaysOnTop is off; drawn when on.
  await view([12, 3, 6], 16, 0, 0.05);
  const b1 = await meas('Behind');
  await run(`workspace.Hidden.Behind.AlwaysOnTop = true`); await t.sim(5);
  const b2 = await meas('Behind');
  check(b1 && !b1.shown && b2 && b2.shown, `behind a wall: hidden (AlwaysOnTop off), drawn when AlwaysOnTop (${b1 && b1.shown}, ${b2 && b2.shown})`);
  // MaxDistance 40: hidden from farther; drawn when it's raised.
  await view([-14, 4, -60], 60);
  const f1 = await meas('Faraway');
  await run(`workspace.Far.Faraway.MaxDistance = 100`); await t.sim(5);
  const f2 = await meas('Faraway');
  check(f1 && !f1.shown && f1.dist > 40 && f2 && f2.shown, `MaxDistance 40 hides it from ${f1 && f1.dist.toFixed(0)} studs; 100 shows it`);
  // DistanceUpperLimit 20: past it the sign stops shrinking.
  await run(`workspace.Post.Sign.DistanceUpperLimit = 20`);
  await view([0, 4, 0], 40);
  const u = await meas('Sign');
  check(u && Math.abs(u.box[2] - 4 * u.pps * u.dist / 20) < 1, `DistanceUpperLimit 20: at ${u && u.dist.toFixed(0)} studs it is as wide as at 20 (${u && u.box[2].toFixed(1)} px)`);
  await run(`workspace.Post.Sign.DistanceUpperLimit = -1`);
  // SizeOffset (0.5, 0.5): the bottom left on the point.
  await run(`workspace.Post.Sign.SizeOffset = Vector2.new(0.5, 0.5)`);
  await view([0, 4, 0], 30);
  const so = await meas('Sign');
  check(so && Math.abs(so.box[0] - so.p[0]) < 1 && Math.abs(so.box[1] + so.box[3] - so.p[1]) < 1, `SizeOffset (0.5, 0.5): its bottom left on the anchor (${so && [so.box[0] - so.p[0], so.box[1] + so.box[3] - so.p[1]].map(v => v.toFixed(2))})`);
  // CurrentDistance in steps of 5, firing Changed.
  await run(`local b = workspace.Post.Sign; b.DistanceStep = 5; _G.cdc = 0; b:GetPropertyChangedSignal("CurrentDistance"):Connect(function() _G.cdc += 1 end)`);
  await view([0, 4, 0], 22); await view([0, 4, 0], 33);
  await run(`print("cd", workspace.Post.Sign.CurrentDistance, _G.cdc)`); await t.sim(1);
  const cdl = (t.logs.filter(l => /\[luau\] cd /.test(l)).pop() || '').replace(/^.*cd /, '').split(' ').map(Number);
  check(cdl[0] % 5 === 0 && cdl[0] > 0 && cdl[1] >= 1, `DistanceStep 5: CurrentDistance ${cdl[0]}, Changed fired ${cdl[1]} times`);
  // PlayerToHideFrom: hidden from us.
  await run(`workspace.Post.Sign.PlayerToHideFrom = game.Players.LocalPlayer`); await t.sim(3);
  const ph = await meas('Sign');
  check(ph && !ph.shown, 'PlayerToHideFrom the local player: hidden');
  // In PlayerGui: drawn at its Adornee; without one, not.
  await view([-8, 2, -4], 20);
  const g1 = await meas('Mine');
  await run(`game.Players.LocalPlayer.PlayerGui.Mine.Adornee = nil`); await t.sim(3);
  const g2 = await t.eval(() => { const pg = window.studio.dm.service('Players').children[0].children.find(c => c.ClassName === 'PlayerGui'), bb = pg.children.find(c => c.props.Name === 'Mine'), e = window.studio.gui.els.get(bb); return !!(e && e.el.style.display !== 'none' && e.el.isConnected); });
  check(g1 && g1.shown && Math.abs(g1.box[0] + g1.box[2] / 2 - g1.p[0]) < 1 && !g2, `in PlayerGui: drawn at its Adornee; with no Adornee, not (${g1 && g1.shown}, ${g2})`);
  await run(`game.Players.LocalPlayer.PlayerGui.Mine.Adornee = workspace.Pad; workspace.Post.Sign.PlayerToHideFrom = nil; workspace.Post.Sign.SizeOffset = Vector2.new(0, 0)`);
  if (t.shot) { await view([4, 4, 0], 26, 0.35, 0.2); await t.frames(2); await t.shot('billboards'); }
  if (fail.length) throw new Error(fail.length + ' failed');
}
