// TweenService and TweenInfo against Roblox's documented behaviour
// (mashup-research/ROBLOX_PLATFORMS_TWEENS_2026-10-08.md §7). Frames are
// stepped by hand: tweens, then resumed threads, as play.js orders them.
import createLuau from '../web/luau.mjs';
import { DataModel } from '../web/datamodel.js';
import { startLuau } from '../web/luau.js';

const out = [];
const dm = new DataModel();
const vm = await startLuau(createLuau, dm, (s, lvl) => out.push((lvl === 2 ? 'ERR ' : '') + s));
let t = 0;
const frames = (seconds, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) { t += dt; dm.stepTweens(dt); vm.flush(); vm.step(t); } };

vm.run('info', `
local TweenService = game:GetService("TweenService")
local i = TweenInfo.new()
print("defaults", typeof(i), i.Time, i.EasingStyle == Enum.EasingStyle.Quad, i.EasingDirection == Enum.EasingDirection.Out, i.RepeatCount, i.Reverses, i.DelayTime)
local j = TweenInfo.new(2, Enum.EasingStyle.Linear, Enum.EasingDirection.In, -1, true, 0.5)
print("custom", j.Time, j.EasingStyle.Name, j.EasingDirection.Name, j.RepeatCount, j.Reverses, j.DelayTime)
local ok, err = pcall(function() j.Time = 3 end)
print("info readonly", ok)
local g = function(a, s, d) return math.floor(TweenService:GetValue(a, Enum.EasingStyle[s], Enum.EasingDirection[d]) * 1e6 + 0.5) / 1e6 end
print("getvalue", g(0.5, "Quad", "Out"), g(0.5, "Bounce", "In"), g(0.3, "Linear", "InOut"), g(2, "Quad", "In"), g(-1, "Quad", "In"), g(0.5, "Sine", "InOut"), g(1, "Elastic", "Out"), g(0, "Back", "In"))
`);

vm.run('basic', `
local TweenService = game:GetService("TweenService")
local p = Instance.new("Part") p.Name = "Mover" p.Anchored = true p.Position = Vector3.zero p.Parent = workspace
local tw = TweenService:Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { Position = Vector3.new(10, 0, 0), Transparency = 0.5 })
print("created", typeof(tw), tw.ClassName, tw.PlaybackState.Name, tw.Instance == p)
tw.Completed:Connect(function(state) print("completed", state == Enum.PlaybackState.Completed, p.Position.X, p.Transparency, tw.PlaybackState.Name) end)
tw:Play()
print("playing", tw.PlaybackState.Name)
task.wait(0.5)
print("half", math.abs(p.Position.X - 5) < 0.2, math.abs(p.Transparency - 0.25) < 0.01)
local ok, err = pcall(function() TweenService:Create(p, TweenInfo.new(), { Nope = 1 }) end)
print("bad prop", ok, err)
ok, err = pcall(function() TweenService:Create(p, TweenInfo.new(), { Position = 5 }) end)
print("bad type", ok, err)
`);

vm.run('cancel', `
local TweenService = game:GetService("TweenService")
local p = Instance.new("Part") p.Anchored = true p.Position = Vector3.zero p.Parent = workspace
local tw = TweenService:Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { Position = Vector3.new(0, 10, 0) })
tw.Completed:Connect(function(state) print("cancel completed", state.Name) end)
tw:Play()
task.wait(0.5)
tw:Cancel()
local y = p.Position.Y
task.wait(0.5)
print("cancel kept", math.abs(y - 5) < 0.2, p.Position.Y == y, tw.PlaybackState.Name)
-- Pause keeps progress; Play resumes it; Pause fires nothing.
local q = Instance.new("Part") q.Anchored = true q.Position = Vector3.zero q.Parent = workspace
local tw2 = TweenService:Create(q, TweenInfo.new(1, Enum.EasingStyle.Linear), { Position = Vector3.new(0, 0, 10) })
local fired = 0
tw2.Completed:Connect(function() fired += 1 end)
tw2:Play() task.wait(0.25) tw2:Pause()
local z = q.Position.Z
task.wait(0.5)
print("paused", math.abs(z - 2.5) < 0.2, q.Position.Z == z, tw2.PlaybackState.Name, fired)
tw2:Play() task.wait(0.4)
print("resumed", math.abs(q.Position.Z - 6.5) < 0.5) -- 2.5 + 4, plus up to a frame per wait
task.wait(0.5)
print("resumed done", q.Position.Z, fired)
`);

vm.run('overwrite', `
local TweenService = game:GetService("TweenService")
local p = Instance.new("Part") p.Anchored = true p.Position = Vector3.zero p.Parent = workspace
local a = TweenService:Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { Position = Vector3.new(10, 0, 0) })
local b = TweenService:Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { Position = Vector3.new(-10, 0, 0) })
a.Completed:Connect(function(s) print("older", s.Name) end)
a:Play() task.wait(0.5) b:Play()
task.wait(1.2)
print("newest wins", p.Position.X, a.PlaybackState.Name, b.PlaybackState.Name)
-- Reverses, repeated once, with a delay: there and back twice, ending where it began.
local r = Instance.new("Part") r.Anchored = true r.Position = Vector3.zero r.Parent = workspace
local rt = TweenService:Create(r, TweenInfo.new(0.5, Enum.EasingStyle.Linear, Enum.EasingDirection.Out, 1, true, 0.25), { Position = Vector3.new(4, 0, 0) })
rt:Play()
task.wait(0.1) print("delayed", rt.PlaybackState.Name, r.Position.X)
task.wait(0.65) print("out", math.abs(r.Position.X - 4) < 0.3) -- 0.5 s after the delay: the far end
task.wait(0.25) print("back", math.abs(r.Position.X - 2) < 0.5, rt.PlaybackState.Name) -- 0.75 s after the delay: halfway back
task.wait(1.5) print("reverse done", r.Position.X, rt.PlaybackState.Name)
-- Colour and CFrame tween too.
local c = Instance.new("Part") c.Anchored = true c.Color = Color3.new(0, 0, 0) c.Parent = workspace
TweenService:Create(c, TweenInfo.new(1, Enum.EasingStyle.Linear), { Color = Color3.new(1, 0.5, 0), CFrame = CFrame.new(0, 2, 0) * CFrame.Angles(0, math.pi / 2, 0) }):Play()
task.wait(0.5)
local _, ry = c.CFrame:ToOrientation()
print("color cframe", math.abs(c.Color.R - 0.5) < 0.02, math.abs(c.Color.G - 0.25) < 0.02, math.abs(ry - math.pi / 4) < 0.03)
`);

frames(6);
console.log(out.join('\n'));
const expect = [
  'defaults TweenInfo 1 true true 0 false 0',
  'custom 2 Linear In -1 true 0.5',
  'info readonly false',
  'getvalue 0.75 0.234375 0.3 1 0 0.5 1 0',
  'created Instance Tween Begin true',
  'playing Playing',
  'half true true',
  'completed true 10 0.5 Completed',
  'cancel completed Cancelled',
  'cancel kept true true Cancelled',
  'paused true true Paused 0',
  'resumed true',
  'resumed done 10 1',
  'older Cancelled',
  'newest wins -10 Cancelled Completed',
  'delayed Delayed 0',
  'out true',
  'back true Playing',
  'reverse done 0 Completed',
  'color cframe true true true',
];
const missing = expect.filter(e => !out.includes(e));
const badProp = out.find(l => l.startsWith('bad prop false') && l.includes("no property named 'Nope'"));
const badType = out.find(l => l.startsWith('bad type false') && l.includes("type mismatch (property is a 'Vector3', but given type is 'number')"));
const errs = out.filter(l => l.startsWith('ERR'));
if (missing.length || !badProp || !badType || errs.length) { console.log('FAIL', { missing, badProp: !!badProp, badType: !!badType, errs }); process.exit(1); }
console.log('PASS');
