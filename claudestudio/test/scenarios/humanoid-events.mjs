// Humanoid events and fallen parts, by script, as a Roblox creator would use
// them: Running(speed) as speed changes, Jumping, FreeFalling(true/false), and
// an unanchored part that falls below Workspace.FallenPartsDestroyHeight is
// destroyed.
export default async function (t) {
  await t.sim(20);
  await t.eval(() => window.studio.vm.run('events', `
    local h = game.Players.LocalPlayer.Character:WaitForChild("Humanoid")
    local runs = 0
    h.Running:Connect(function(s) runs += 1 end)
    h.Jumping:Connect(function(a) print("jumping", a) end)
    h.FreeFalling:Connect(function(a) print("freefalling", a) end)
    workspace.FallenPartsDestroyHeight = -20
    local p = Instance.new("Part") p.Name = "Dropper" p.Size = Vector3.new(2, 2, 2) p.Position = Vector3.new(30, 5, 30) p.CanCollide = false p.Parent = workspace
    p.Destroying:Connect(function() print("fallen part destroyed") end)
    task.wait(2)
    print("running events", runs > 2, "dropper in workspace", p.Parent ~= nil)
  `));
  await t.sim(30, { move: [0, 1] }); await t.sim(20);
  await t.sim(1, { jump: true }); await t.sim(70);
  await t.sim(60);
  const out = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, '')).join('\n');
  console.log(out);
  for (const want of ['fallen part destroyed', 'jumping true', 'freefalling true', 'freefalling false', 'running events true dropper in workspace false'])
    if (!out.includes(want)) throw new Error('missing: ' + want);
}
