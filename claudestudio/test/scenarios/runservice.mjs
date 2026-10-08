// RunService, by script: each frame's events fire in Roblox's documented order
// (PreAnimation, PreSimulation/Stepped, physics, PostSimulation/Heartbeat,
// then task.wait threads resume, then PreRender/RenderStepped), with the
// frame's deltaTime; a part spun from Heartbeat turns by exactly sum(dt);
// the standard container services exist.
export default async function (t) {
  const fail = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
  await t.sim(10);
  await t.eval(() => window.studio.vm.run('rs', `
    local RunService = game:GetService("RunService")
    _G.order, _G.dts, _G.stepTimes = {}, {}, {}
    local function log(name) return function(a, b)
      if #_G.order < 400 then table.insert(_G.order, name) end
      if name == "Heartbeat" then table.insert(_G.dts, a) end
      if name == "Stepped" then table.insert(_G.stepTimes, a) end
    end end
    for _, ev in ipairs({ "PreAnimation", "PreSimulation", "Stepped", "PostSimulation", "Heartbeat", "PreRender", "RenderStepped" }) do
      RunService[ev]:Connect(log(ev))
    end
    task.spawn(function() while true do task.wait() if #_G.order < 400 then table.insert(_G.order, "wait") end end end)

    local spin = Instance.new("Part")
    spin.Name = "Spin" spin.Anchored = true spin.Size = Vector3.new(8, 1, 2) spin.Position = Vector3.new(0, 3, -15)
    spin.Parent = workspace
    _G.spun = 0
    RunService.Heartbeat:Connect(function(dt)
      if _G.spun < 60 then spin.CFrame = spin.CFrame * CFrame.Angles(0, dt * math.pi, 0) _G.spun += 1 end
    end)

    local names = {}
    for _, s in ipairs({ "ReplicatedStorage", "ReplicatedFirst", "ServerStorage", "ServerScriptService", "StarterGui", "StarterPack", "StarterPlayer" }) do
      local svc = game:GetService(s)
      table.insert(names, svc and svc.Name == s and svc.Parent == game and "y" or "n")
    end
    print("services", table.concat(names), RunService:IsClient(), RunService:IsServer())
  `));
  await t.sim(70);
  await t.eval(() => window.studio.vm.run('report', `
    print("order", table.concat(_G.order, ",", 9, 32))
    local sum, ok = 0, true
    for i, dt in ipairs(_G.dts) do sum += dt if math.abs(dt - 1/60) > 1e-6 then ok = false end end
    print("dts", #_G.dts, ok)
    local mono = true
    for i = 2, #_G.stepTimes do if math.abs(_G.stepTimes[i] - _G.stepTimes[i - 1] - 1/60) > 1e-6 then mono = false end end
    print("stepped time", mono, math.abs(_G.stepTimes[#_G.stepTimes] - time()) < 0.05)
    local look = workspace.Spin.CFrame.LookVector
    print("spin", _G.spun, math.abs(look.X) < 1e-3 and math.abs(look.Z - 1) < 1e-3, workspace.Spin.Orientation.Y)
  `));
  const out = t.logs.filter(l => l.includes('[luau]')).map(l => l.replace(/^\w+ \[luau\] /, ''));
  console.log(out.join('\n'));
  const line = p => out.find(l => l.startsWith(p)) || '';
  // The documented order, repeating. Between a new name and its legacy one
  // (PreSimulation/Stepped, PostSimulation/Heartbeat, PreRender/RenderStepped) the order is ours.
  const frame = 'PreAnimation,PreSimulation,Stepped,PostSimulation,Heartbeat,wait,PreRender,RenderStepped';
  check(line('order ') === 'order ' + frame + ',' + frame + ',' + frame.split(',').slice(0, 8).join(','), 'events fire in Roblox\'s order each frame');
  check(/^dts \d+ true$/.test(line('dts')), 'Heartbeat deltaTime is the frame step (1/60)');
  check(line('stepped time') === 'stepped time true true', 'Stepped time advances by dt and tracks time()');
  check(/^spin 60 true/.test(line('spin')), '60 Heartbeat steps of dt*pi turn the part exactly 180° (LookVector +Z)');
  check(line('services') === 'services yyyyyyy true true', 'container services exist under game');
  if (fail.length) throw new Error(fail.length + ' check(s) failed');
}
