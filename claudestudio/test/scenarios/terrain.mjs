// Smooth terrain in play, by script (Roblox's API on workspace.Terrain):
// a grass hill (FillBall), a rock block, a sand cylinder, a ground wedge and a
// water pool are drawn as chunk meshes; a loose ball dropped on the rock slab
// rests on it; the character stands on it; Air carves a hole the ball then
// falls through; the cell helpers and
// material colours answer as Roblox's do.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  const E = (fn, arg) => t.eval(fn, arg);
  const out = () => t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  const line = p => out().filter(l => l.startsWith(p)).pop() || '';
  await t.sim(5);
  await E(() => window.studio.vm.run('terrain', `
    local T = workspace.Terrain
    T:FillBall(Vector3.new(0, -2, -40), 14, Enum.Material.Grass)          -- a hill: top at y 12
    T:FillBlock(CFrame.new(24, 2, -20), Vector3.new(16, 4, 16), Enum.Material.Rock) -- a slab on the floor: top at y 4
    T:FillCylinder(CFrame.new(-24, 4, -20), 8, 6, Enum.Material.Sand)
    T:FillWedge(CFrame.new(-24, 4, -44), Vector3.new(12, 8, 16), Enum.Material.Ground)
    T:FillBlock(CFrame.new(24, 1, -48), Vector3.new(20, 2, 20), Enum.Material.Water)
    local b = Instance.new("Part") b.Name = "Ball" b.Shape = Enum.PartType.Ball b.Size = Vector3.new(2, 2, 2)
    b.Position = Vector3.new(22, 20, -22) b.Parent = workspace
    print("cells", T:CountCells() > 100, T:WorldToCell(Vector3.new(5, -1, 9)), T:CellCenterToWorld(1, -1, 2), T:CellCornerToWorld(1, -1, 2))
    local c = T:GetMaterialColor(Enum.Material.Grass)
    print("grass", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
    local ok, err = pcall(function() T:FillBall(Vector3.new(), 1, Enum.Material.Plastic) end)
    print("plastic", ok, err ~= nil)
  `));
  await t.sim(150);
  check(line('cells') === 'cells true 1, -1, 2 6, -2, 10 4, -4, 8', `CountCells, WorldToCell, CellCenterToWorld, CellCornerToWorld (${line('cells')})`);
  check(/^grass \d+ \d+ \d+$/.test(line('grass')), `GetMaterialColor gives Grass's colour (${line('grass')})`);
  check(line('plastic') === 'plastic false true', 'a non-terrain material is an error');
  const s = await E(() => window.studio.world.terrain.stats());
  check(s.solid > 500 && s.water > 20, `drawn: ${s.solid} ground triangles, ${s.water} water triangles in ${s.chunks} chunks`);
  const ballY = await E(() => [...window.studio.dm.workspace.children].find(c => c.props.Name === 'Ball').props.CFrame.y);
  check(Math.abs(ballY - 5) < 0.3, `a ball dropped on the rock slab rests on its top (centre y ${ballY.toFixed(2)}; the top is 4, the ball's radius 1)`);

  // The character, put on the slab, walks across it and stands on it.
  await E(() => { const s = window.studio, P = s.player; P.teleport(new P.holder.position.constructor(24, 4.5, -20)); });
  await t.sim(15, { move: [0, -1] }); // 4 studs: it stays on the 16-stud slab
  await t.sim(30);
  const foot = await E(() => window.studio.player.holder.position.y);
  check(Math.abs(foot - 4) < 0.3, `the character stands on the slab's top (feet y ${foot.toFixed(2)}; the top is 4)`);

  // Carve the slab under the ball: it falls through to the baseplate.
  await E(() => window.studio.vm.run('carve', 'workspace.Terrain:FillBlock(CFrame.new(20, 2, -24), Vector3.new(8, 8, 8), Enum.Material.Air)'));
  await t.sim(120);
  const after = await E(() => [...window.studio.dm.workspace.children].find(c => c.props.Name === 'Ball').props.CFrame.y);
  check(Math.abs(after - 1) < 0.3, `Air carves the slab; the ball drops through to the baseplate (y ${ballY.toFixed(1)} -> ${after.toFixed(1)})`);

  await E(() => window.studio.vm.run('cam', 'local c = workspace.CurrentCamera c.CameraType = Enum.CameraType.Scriptable c.CFrame = CFrame.lookAt(Vector3.new(0, 30, 10), Vector3.new(0, 0, -36))'));
  await t.frames(2);
  await t.golden('terrain');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
