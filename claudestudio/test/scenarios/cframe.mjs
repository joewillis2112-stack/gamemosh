// CFrame in the running engine: setting HumanoidRootPart.CFrame teleports and
// turns the character (the usual teleport idiom), Model:PivotTo on the
// character does the same, and a part a script rotates through CFrame is drawn
// with exactly that rotation.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(20);
  const S = () => t.eval(() => {
    const p = window.studio.player, f = p.footPosition;
    return { foot: [f.x, f.y, f.z], look: [Math.sin(p.yaw), Math.cos(p.yaw)] };
  });
  const near = (a, b, e = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= e);

  // Root CFrame: 3 studs above the feet, facing -X (Angles(0, 90°, 0)).
  await t.eval(() => window.studio.vm.run('tp', `
    local root = game.Players.LocalPlayer.Character.HumanoidRootPart
    root.CFrame = CFrame.new(20, 3, 10) * CFrame.Angles(0, math.rad(90), 0)
  `));
  await t.sim(10);
  let s = await S();
  check(near(s.foot, [20, 0, 10]), `root CFrame moves the feet to (20, 0, 10): ${s.foot.map(v => v.toFixed(2))}`);
  check(near(s.look, [-1, 0]), `and faces -X: ${s.look.map(v => v.toFixed(2))}`);

  // Model:PivotTo on the character (its PrimaryPart is the root), facing +Z.
  await t.eval(() => window.studio.vm.run('pivot', `
    local c = game.Players.LocalPlayer.Character
    c:PivotTo(CFrame.lookAt(Vector3.new(-10, 3, -5), Vector3.new(-10, 3, 100)))
  `));
  await t.sim(10);
  s = await S();
  check(near(s.foot, [-10, 0, -5]), `PivotTo moves the feet to (-10, 0, -5): ${s.foot.map(v => v.toFixed(2))}`);
  check(near(s.look, [0, 1]), `and faces +Z: ${s.look.map(v => v.toFixed(2))}`);

  // Position alone keeps the facing.
  await t.eval(() => window.studio.vm.run('pos', `game.Players.LocalPlayer.Character.HumanoidRootPart.Position = Vector3.new(0, 3, 30)`));
  await t.sim(10);
  s = await S();
  check(near(s.foot, [0, 0, 30]) && near(s.look, [0, 1]), `Position keeps the facing: ${s.foot.map(v => v.toFixed(2))} ${s.look.map(v => v.toFixed(2))}`);

  // A part turned by a script, read back from the drawn mesh.
  await t.eval(() => window.studio.vm.run('spin', `
    local p = Instance.new("Part")
    p.Name = "Spun" p.Anchored = true p.Size = Vector3.new(6, 1, 2)
    p.CFrame = CFrame.new(0, 4, -20) * CFrame.Angles(math.rad(30), math.rad(60), math.rad(-20))
    p.Parent = workspace
  `));
  await t.sim(2);
  const m = await t.eval(() => {
    const s = window.studio, inst = s.dm.workspace.children.find(c => c.Name === 'Spun'), mesh = s.world.parts.get(inst).mesh;
    mesh.computeWorldMatrix(true);
    const w = mesh.getWorldMatrix().m; // Babylon: row-major, row-vector, so rows are the scaled local axes
    const len = i => Math.hypot(w[i], w[i + 1], w[i + 2]);
    return { right: [w[0], w[1], w[2]].map(v => v / len(0)), up: [w[4], w[5], w[6]].map(v => v / len(4)), pos: [w[12], w[13], w[14]], cf: inst.props.CFrame.m };
  });
  const c = m.cf;
  check(near(m.right, [c[3], c[6], c[9]], 1e-4) && near(m.up, [c[4], c[7], c[10]], 1e-4) && near(m.pos, [0, 4, -20], 1e-4), 'the mesh is drawn with the CFrame\'s rotation and position');
  // Angles(30°, 60°, -20°) = Rx Ry Rz; its RightVector, worked by hand.
  const r = Math.PI / 180, [cx, sx, cy, sy, cz, sz] = [Math.cos(30 * r), Math.sin(30 * r), Math.cos(60 * r), Math.sin(60 * r), Math.cos(-20 * r), Math.sin(-20 * r)];
  check(near([c[3], c[6], c[9]], [cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz], 1e-5), 'RightVector matches Rx*Ry*Rz by hand');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
