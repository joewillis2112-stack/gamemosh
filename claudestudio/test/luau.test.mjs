// Luau in wasm driving the JS DataModel: properties, parenting, lists,
// vectors, Color3, Enum, events, task.wait, Signal:Wait, errors; BrickColor, Rect, Region3 and
// the members added with them, against Roblox's documented behaviour.
// The Workspace starts with its Camera (workspace.CurrentCamera), as in Roblox.
import createLuau from '../web/luau.mjs';
import { DataModel, V3 } from '../web/datamodel.js';
import { startLuau } from '../web/luau.js';

const out = [];
const dm = new DataModel();
const vm = await startLuau(createLuau, dm, (s, lvl) => out.push((lvl === 2 ? 'ERR ' : lvl === 1 ? 'WARN ' : '') + s));

vm.run('setup', `
local p = Instance.new("Part")
p.Name = "Floor"
p.Size = Vector3.new(64, 1, 64)
p.Anchored = true
p.Parent = workspace
print(p.Name, p.ClassName, p.Parent.Name, p.Size.X, p.Size.Z, p.Anchored)
local v = Vector3.new(3, 4, 0)
print("mag", v.Magnitude, (v + Vector3.one).Y, v.Unit.X)
local added = 0
workspace.ChildAdded:Connect(function(c) added += 1 print("added", c.Name) end)
for i = 1, 3 do
  local b = Instance.new("Part", workspace)
  b.Name = "Box" .. i
  b.Position = Vector3.new(i * 4, 5, 0)
end
print("children", #workspace:GetChildren(), workspace:FindFirstChild("Box2").Position.X, workspace.Box3.Name)
print("isa", p:IsA("BasePart"), p:IsA("Model"), game.Workspace == workspace, game:GetService("Workspace") == workspace)
local ok, err = pcall(function() p.Nope = 1 end)
print("bad prop", ok, err)
ok, err = pcall(function() p.Anchored = "yes" end)
print("bad type", ok, err)
workspace.Box1:Destroy()
print("after destroy", #workspace:GetChildren(), workspace:FindFirstChild("Box1"))
`);

vm.run('color', `
local c = Color3.fromRGB(255, 128, 0)
print("rgb", c.R, math.floor(c.G * 255 + 0.5), c.B, typeof(c))
print("hex", Color3.fromHex("#ff8000"):ToHex(), Color3.fromHex("0f0"):ToHex(), c:ToHex())
print("hsv", Color3.fromHSV(0, 1, 1) == Color3.new(1, 0, 0), Color3.fromHSV(2/3, 1, 1):ToHex())
local h, s, v = Color3.new(0, 1, 0):ToHSV()
print("tohsv", math.floor(h * 3 + 0.5), s, v)
local m = Color3.new(1, 0, 0):Lerp(Color3.new(0, 0, 1), 0.5)
print("lerp", m.R, m.G, m.B, tostring(Color3.new(1, 0.5, 0)))
local part = Instance.new("Part")
part.Color = Color3.fromRGB(13, 105, 172)
print("part color", part.Color:ToHex(), typeof(part.Color))
local ok, err = pcall(function() part.Color = Vector3.new(1, 0, 0) end)
print("color type", ok, err)
ok, err = pcall(function() c.R = 0 end)
print("color readonly", ok, err)
`);

vm.run('enum', `
local part = Instance.new("Part")
print("enum default", part.Material, part.Material == Enum.Material.Plastic, typeof(part.Material), part.Shape.Name)
part.Material = Enum.Material.Neon
print("enum set", part.Material.Name, part.Material.Value, part.Material == Enum.Material.Neon, tostring(Enum.Material.Neon))
part.Material = "Wood"
print("enum string", part.Material.Name)
part.Shape = 0
print("enum number", part.Shape.Name, part.Shape.EnumType == Enum.PartType, tostring(Enum.PartType))
print("enum items", #Enum.PartType:GetEnumItems(), Enum.PartType:GetEnumItems()[2].Name)
local ok, err = pcall(function() part.Material = Enum.PartType.Ball end)
print("enum wrong type", ok, err)
ok, err = pcall(function() part.Material = "Lava" end)
print("enum bad name", ok, err)
ok, err = pcall(function() return Enum.Material.Lava end)
print("enum bad item", ok, err)
`);

vm.run('review', `
-- H2: a handler that disconnects itself doesn't run again for queued events, and nothing else runs in its place.
local p = Instance.new("Part")
p.Parent = workspace
local hits = 0
local c; c = p.Changed:Connect(function(k) hits += 1 c:Disconnect() workspace.ChildAdded:Connect(function() end) end)
p.Transparency = 0.5
p.CanCollide = false
task.wait()
print("disconnect queued", hits, c.Connected)
-- M3: an equal write doesn't fire Changed.
local n = 0
p.Changed:Connect(function() n += 1 end)
p.Anchored = true p.Anchored = true
task.wait()
print("changed once", n)
-- M4: Value objects pass the new value.
local v = Instance.new("IntValue")
local got
v.Changed:Connect(function(x) got = x end)
v.Value = 7
task.wait()
print("value changed", got)
-- Connected is false after the instance is destroyed; Disconnect afterwards is safe.
local q = Instance.new("Part")
local qc = q.Touched:Connect(function() end)
q:Destroy()
print("connected after destroy", qc.Connected)
qc:Disconnect()
-- L10: a destroyed instance can't come back.
print("reparent destroyed", (pcall(function() q.Parent = workspace end)))
-- L9: task.delay passes its arguments.
task.delay(0, function(a, b) print("delay args", a, b) end, "x", 2)
-- L17: Vector3.
local a, b = Vector3.new(1, 0, 0), Vector3.new(0, 1, 0)
print("vector", typeof(a), a:Dot(b), a:Cross(b).Z, a:Lerp(b, 0.5).Y, a:FuzzyEq(Vector3.new(1, 0, 1e-7)), Vector3.yAxis.Y, math.floor(math.deg(a:Angle(b)) + 0.5))
-- M6: shared metatables are locked.
print("metatable", getmetatable(workspace), pcall(function() getmetatable(Color3.new()).__index = nil end))
-- L13: read-only properties.
print("readonly", (pcall(function() local h = Instance.new("Humanoid") h.MoveDirection = Vector3.one end)))
-- L11: Instance.new with a bad parent errors.
print("bad parent", (pcall(function() Instance.new("Part", 5) end)))
-- M5: WaitForChild waits, and times out to nil.
task.delay(0.2, function() local f = Instance.new("Folder") f.Name = "Later" f.Parent = workspace end)
local t0 = os.clock()
local later = workspace:WaitForChild("Later")
print("waitforchild", later and later.Name, workspace:WaitForChild("Never", 0.3))
`);

vm.run('defer', `
-- task.defer runs after the current code, with its arguments; legacy spawn and delay exist (Roblox).
local order = {}
task.defer(function(x) table.insert(order, "deferred " .. x) end, "d")
table.insert(order, "now")
spawn(function() table.insert(order, "spawned") end)
delay(0, function() table.insert(order, "delayed") end)
task.wait() task.wait()
print("defer order", table.concat(order, ","))
`);

vm.run('cframe', `
-- Expectations are Roblox's documented behaviour, not read off this implementation.
local function near(a, b) return (a - b).Magnitude < 1e-4 end
local rad = math.rad
local y90 = CFrame.Angles(0, rad(90), 0)
print("cf type", typeof(CFrame.new()), tostring(CFrame.new(1, 2, 3)))
print("cf y90", near(y90.LookVector, Vector3.new(-1, 0, 0)), near(y90.RightVector, Vector3.new(0, 0, -1)), near(y90.UpVector, Vector3.yAxis))
local la = CFrame.lookAt(Vector3.zero, Vector3.new(10, 0, 0))
print("cf lookAt", near(la.LookVector, Vector3.xAxis), near(la.RightVector, Vector3.zAxis), la == CFrame.new(Vector3.zero, Vector3.new(10, 0, 0)))
local a = CFrame.new(1, 2, 3) * CFrame.Angles(rad(10), rad(20), rad(30))
local b = CFrame.new(-4, 5, 6) * CFrame.fromEulerAnglesYXZ(rad(40), rad(50), rad(60))
print("cf inverse", (a:Inverse() * a):FuzzyEq(CFrame.identity), a:ToObjectSpace(b):FuzzyEq(a:Inverse() * b), a:ToWorldSpace(b):FuzzyEq(a * b))
print("cf points", near(a:PointToWorldSpace(Vector3.new(1, 0, 0)), a * Vector3.new(1, 0, 0)), near(a:PointToObjectSpace(a * Vector3.new(3, 4, 5)), Vector3.new(3, 4, 5)), near(a:VectorToObjectSpace(a:VectorToWorldSpace(Vector3.one)), Vector3.one))
local rx, ry, rz = a:ToEulerAnglesXYZ()
local ox, oy, oz = b:ToOrientation()
print("cf euler", math.abs(rx - rad(10)) < 1e-5, math.abs(ry - rad(20)) < 1e-5, math.abs(rz - rad(30)) < 1e-5, math.abs(ox - rad(40)) < 1e-5, math.abs(oy - rad(50)) < 1e-5, math.abs(oz - rad(60)) < 1e-5)
local ax, an = CFrame.Angles(0, 1, 0):ToAxisAngle()
print("cf axis", near(ax, Vector3.yAxis), math.abs(an - 1) < 1e-5, CFrame.fromAxisAngle(Vector3.yAxis, 1):FuzzyEq(CFrame.Angles(0, 1, 0)), CFrame.new(0, 0, 0, 0, math.sin(0.5), 0, math.cos(0.5)):FuzzyEq(CFrame.Angles(0, 1, 0)))
print("cf lerp", CFrame.new():Lerp(CFrame.new(10, 0, 0) * y90, 0.5):FuzzyEq(CFrame.new(5, 0, 0) * CFrame.Angles(0, rad(45), 0)))
print("cf ops", (CFrame.new(1, 2, 3) + Vector3.one).Position == Vector3.new(2, 3, 4), (CFrame.new(1, 2, 3) - Vector3.one).Y, select("#", a:GetComponents()), CFrame.new(1, 2, 3).p.Z)
local ok, err = pcall(function() a.X = 1 end)
print("cf readonly", ok, err)
local part = Instance.new("Part", workspace)
part.Name = "Spinner"
local changes = {}
part.Changed:Connect(function(k) changes[#changes + 1] = k end)
part.Orientation = Vector3.new(0, 90, 0)
print("cf part orient", near(part.CFrame.LookVector, Vector3.new(-1, 0, 0)), part.Orientation == Vector3.new(0, 90, 0))
part.CFrame = CFrame.new(1, 2, 3) * CFrame.Angles(0, rad(45), 0)
print("cf part set", part.Position == Vector3.new(1, 2, 3), near(part.Orientation, Vector3.new(0, 45, 0)))
part.Position = Vector3.new(7, 8, 9)
print("cf part pos", part.CFrame.Position == Vector3.new(7, 8, 9), near(part.CFrame.LookVector, (CFrame.Angles(0, rad(45), 0)).LookVector))
part.Orientation = Vector3.new(0, 270, 0)
print("cf orient wraps", near(part.Orientation, Vector3.new(0, -90, 0)))
ok, err = pcall(function() part.CFrame = Vector3.one end)
print("cf part type", ok, err)
task.wait() -- Changed handlers are deferred
-- Which properties fire is Roblox's (each view that changed); the order among them is ours.
print("cf changed", table.concat(changes, ","))
-- Pivots: a model with no PrimaryPart pivots about its bounding-box centre;
-- PivotTo moves every part rigidly.
local m = Instance.new("Model")
local p1 = Instance.new("Part", m) p1.Size = Vector3.new(2, 2, 2) p1.Position = Vector3.new(0, 0, 0)
local p2 = Instance.new("Part", m) p2.Size = Vector3.new(2, 2, 2) p2.Position = Vector3.new(10, 0, 0)
print("pivot box", m:GetPivot().Position == Vector3.new(5, 0, 0))
m:PivotTo(CFrame.new(5, 10, 0) * CFrame.Angles(0, rad(90), 0))
print("pivot to", near(p1.Position, Vector3.new(5, 10, 5)), near(p2.Position, Vector3.new(5, 10, -5)), near(p1.CFrame.LookVector, Vector3.new(-1, 0, 0)))
m.PrimaryPart = p2
print("pivot primary", m:GetPivot() == p2.CFrame, p1:GetPivot() == p1.CFrame)
`);
vm.run('g1', `_G.shared_score = 41 shared.flag = "on"`);
vm.run('g2', `_G.shared_score += 1 print("globals", _G.shared_score, shared.flag, type(time()), tick() > 1.7e9)`);
vm.run('scripts', `
-- Clone: a deep copy, parent nil; references inside the copied tree point at the copies.
local m = Instance.new("Model") m.Name = "Orig"
local a = Instance.new("Part", m) a.Name = "A"
local ref = Instance.new("ObjectValue", m) ref.Name = "Ref" ref.Value = a
local outside = Instance.new("ObjectValue", m) outside.Name = "Out" outside.Value = workspace
local hidden = Instance.new("Part", m) hidden.Name = "Hidden" hidden.Archivable = false
m.PrimaryPart = a
local c = m:Clone()
print("clone", c.Parent, c.Name, #c:GetChildren(), c.Ref.Value == c.A, c.Ref.Value ~= a, c.PrimaryPart == c.A, c.Out.Value == workspace, c:FindFirstChild("Hidden"))
-- Scripts run where Roblox runs them, once, deferred.
local s1 = Instance.new("Script") s1.Name = "Hello" s1.Source = 'print("script ran", script.Name, script.Parent.Name)'
s1.Parent = game:GetService("ReplicatedStorage")
print("before start")
task.wait()
print("in storage it waits")
s1.Parent = game:GetService("ServerScriptService")
task.wait()
s1.Parent = workspace
task.wait()
local copy = s1:Clone() copy.Name = "Copy" copy.Parent = workspace
local off = Instance.new("Script") off.Name = "Off" off.Enabled = false off.Source = 'print("off ran")' off.Parent = workspace
task.wait()
off.Enabled = true
task.wait()
-- require: run once, cached, one return value.
local mod = Instance.new("ModuleScript") mod.Name = "Mod" mod.Source = 'print("module body") local M = { n = 0 } function M.inc() M.n += 1 return M.n end return M'
mod.Parent = game:GetService("ReplicatedStorage")
local A, B = require(mod), require(mod)
A.inc()
print("require", A == B, B.inc(), typeof(A))
local two = Instance.new("ModuleScript") two.Source = 'return 1, 2'
print("require two", pcall(require, two))
local bad = Instance.new("ModuleScript") bad.Name = "Loop" bad.Source = 'return require(script)'
print("require loop", pcall(require, bad))
print("require part", pcall(require, a))
`);
vm.run('udim', `
-- From the docs' own examples (datatypes/UDim2.yaml) where they give one.
print("udim2 str", tostring(UDim2.new(0, 300, 1, 0)), typeof(UDim2.new()), typeof(UDim.new()), typeof(Vector2.new()))
print("udim2 math", UDim2.new(1, 100, 1, 50) - UDim2.new(0.5, 30, 0, 10) == UDim2.new(0.5, 70, 1, 40), UDim2.fromScale(0.5, 1) == UDim2.new(0.5, 0, 1, 0), UDim2.fromOffset(10, 20) == UDim2.new(0, 10, 0, 20))
local u = UDim2.new(UDim.new(0.25, 4), UDim.new(1, -8))
print("udim2 parts", u.X.Scale, u.X.Offset, u.Width == u.X, u.Height.Offset, tostring(u.Y), UDim.new(0, 1.7).Offset)
print("udim2 lerp", UDim2.new(0, 0, 0, 0):Lerp(UDim2.new(1, 100, 0, 50), 0.5) == UDim2.new(0.5, 50, 0, 25))
local v = Vector2.new(3, 4)
print("vector2", v.Magnitude, tostring(v * 2), tostring(v + Vector2.one), v:Dot(Vector2.xAxis), Vector2.xAxis:Cross(Vector2.yAxis), tostring(-v), v.Unit:FuzzyEq(Vector2.new(0.6, 0.8)))
print("udim2 ro", pcall(function() u.X = UDim.new() end))
`);
vm.run('timer', `
print("t0")
local dt = task.wait(1)
print("t1", math.floor(dt * 10 + 0.5) / 10)
local who = workspace.Floor.Touched:Wait()
print("touched by", who.Name)
task.wait(0.5)
print("done")
`);
vm.run('broken', `local x = nil; print(x.y)`);

vm.step(0.5);
vm.step(1.0);
dm.fire(dm.workspace.children.find(c => c.Name === 'Floor'), 'Touched', [dm.workspace.children.find(c => c.Name === 'Box2')]);
vm.step(1.2);
vm.step(1.6);
vm.step(2.0);
vm.step(2.5);
console.log(out.join('\n'));
const expect = [
  'Floor Part Workspace 64 64 true',
  'mag 5 5 0.6000000238418579',
  'added Box1', 'added Box2', 'added Box3',
  'children 6 8 Box3', // Camera, Terrain and four parts
  'isa true false true true',
  'touched by Box2',
  'done',
  'after destroy 5 nil',
  'rgb 1 128 0 Color3',
  'hex ff8000 00ff00 ff8000',
  'hsv true 0000ff',
  'tohsv 1 1 1',
  'lerp 0.5 0 0.5 1, 0.5, 0',
  'part color 0d69ac Color3',
  'enum default Enum.Material.Plastic true EnumItem Block',
  'enum set Neon 288 true Enum.Material.Neon',
  'enum string Wood',
  'enum number Ball true PartType', // Roblox: tostring(Enum.PartType) is "PartType"
  'enum items 5 Block',
  'disconnect queued 1 false',
  'changed once 1',
  'value changed 7',
  'connected after destroy false',
  'reparent destroyed false',
  'delay args x 2',
  'defer order now,deferred d,spawned,delayed',
  'vector Vector3 0 1 0.5 true 1 90',
  'readonly false',
  'bad parent false',
  'waitforchild Later nil',
  'cf type CFrame 1, 2, 3, 1, 0, 0, 0, 1, 0, 0, 0, 1',
  'cf y90 true true true',
  'cf lookAt true true true',
  'cf inverse true true true',
  'cf points true true true',
  'cf euler true true true true true true',
  'cf axis true true true true',
  'cf lerp true',
  'cf ops true 1 12 3',
  'cf part orient true true',
  'cf part set true true',
  'cf part pos true true',
  'cf orient wraps true',
  'cf changed CFrame,Orientation,CFrame,Position,Orientation,CFrame,Position,CFrame,Orientation',
  'pivot box true',
  'pivot to true true true',
  'pivot primary true true',
  'globals 42 on number true',
  'clone nil Orig 3 true true true true nil',
  'in storage it waits',
  'script ran Hello ServerScriptService',
  'script ran Copy Workspace',
  'off ran',
  'module body',
  'require true 2 table',
  'udim2 str {0, 300}, {1, 0} UDim2 UDim Vector2',
  'udim2 math true true true',
  'udim2 parts 0.25 4 true -8 1, -8 1',
  'udim2 lerp true',
  'vector2 5 6, 8 4, 5 3 1 -3, -4 true',
];
// BrickColor, Rect, Region3 and the members added with them (luau/more_types.h), against Roblox's
// documented behaviour (creator-docs datatypes/*.yaml). Each line is `name value`, checked exactly.
const dt = {};
const dtOut = [];
const dvm = await startLuau(createLuau, new DataModel(), s => dtOut.push(s), { runScripts: false });
dvm.run('datatypes', `
local function say(k, ...) local t = {} for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end print("@" .. k .. " " .. table.concat(t, ",")) end
local function r3(x) return string.format("%.3f", x) end
-- BrickColor: the docs' examples
say("pastel_number", BrickColor.new("Pastel Blue").Number)
say("by_number", BrickColor.new(11).Name)
say("by_rgb", BrickColor.new(0.502, 0.734, 0.859).Name)
say("by_color3", BrickColor.new(Color3.fromRGB(128, 187, 219)).Name, BrickColor.new(Color3.new(1, 0, 0)).Name)
say("palette70", BrickColor.palette(70).Name, BrickColor.palette(70).Number)
say("palette_bad", pcall(BrickColor.palette, 128))
say("unknown", BrickColor.new("No such colour").Name, BrickColor.new(99999).Name)
say("named", BrickColor.White().Name, BrickColor.Gray().Name, BrickColor.DarkGray().Name, BrickColor.Black().Name, BrickColor.Red().Name, BrickColor.Yellow().Name, BrickColor.Green().Name, BrickColor.Blue().Name)
local p = BrickColor.new("Pastel Blue")
say("members", p.Number, p.Name, r3(p.r), r3(p.g), r3(p.b), typeof(p.Color), p.Color == Color3.fromRGB(128, 187, 219))
say("tostring_eq", tostring(p), p == BrickColor.new(11), p == BrickColor.new(1), typeof(p))
say("readonly", pcall(function() p.Number = 1 end))
local inPalette = true for i = 1, 20 do local c = BrickColor.random() if typeof(c) ~= "BrickColor" then inPalette = false end end
say("random", inPalette)
-- BasePart.BrickColor: setting it sets Color; reading gives the nearest to Color
local part = Instance.new("Part")
say("part_default", part.BrickColor.Name)
part.BrickColor = BrickColor.new("Pastel Blue")
say("part_set", part.Color == Color3.fromRGB(128, 187, 219), part.BrickColor.Name)
part.Color = Color3.fromRGB(250, 10, 10)
say("part_nearest", part.BrickColor.Name, part.Color == Color3.fromRGB(250, 10, 10))
say("part_bad", pcall(function() part.BrickColor = Color3.new() end))
-- Rect
local r = Rect.new(Vector2.new(5, 6), Vector2.new(1, 2))
say("rect", r.Min.X, r.Min.Y, r.Max.X, r.Max.Y, r.Width, r.Height, typeof(r))
say("rect4", Rect.new(0, 0, 10, 4).Width, Rect.new(0, 0, 10, 4).Height, Rect.new().Width, tostring(Rect.new(1, 2, 3, 4)), Rect.new(1, 2, 3, 4) == Rect.new(3, 4, 1, 2))
-- Region3
local g = Region3.new(Vector3.new(0.5, 0, -1), Vector3.new(4, 4, 3))
say("region3", g.Size.X, g.Size.Y, g.Size.Z, g.CFrame.X, g.CFrame.Y, g.CFrame.Z, g.CFrame.Rotation == CFrame.new(), typeof(g))
local e = g:ExpandToGrid(4)
say("expand", e.Size.X, e.Size.Y, e.Size.Z, e.CFrame.X, e.CFrame.Y, e.CFrame.Z)
say("negative", Region3.new(Vector3.one, Vector3.zero).Size.X)
-- Color3: the docs' examples
say("luminance", r3(Color3.fromRGB(255, 0, 0):GetLuminance()), Color3.new(1, 1, 1):GetLuminance(), Color3.new(0, 0, 0):GetLuminance(), r3(Color3.new(2, 2, 2):GetLuminance()))
say("contrast", Color3.new(0, 0, 0):GetContrastRatio(Color3.new(1, 1, 1)), Color3.new(1, 1, 1):GetContrastRatio(Color3.new(0, 0, 0)), Color3.new(0.3, 0.3, 0.3):GetContrastRatio(Color3.new(0.3, 0.3, 0.3)))
local orange = Color3.fromRGB(255, 165, 0)
say("contrasting", tostring(orange:GetContrastingColor()), tostring(Color3.fromRGB(0, 0, 139):GetContrastingColor()), tostring(orange:GetContrastingColor(Color3.fromRGB(20, 20, 20), Color3.fromRGB(240, 240, 240))))
-- Vector3.FromNormalId / FromAxis
say("normals", Vector3.FromNormalId(Enum.NormalId.Top), Vector3.FromNormalId(Enum.NormalId.Front), Vector3.FromNormalId(Enum.NormalId.Right), Vector3.FromNormalId(Enum.NormalId.Left), Vector3.FromNormalId(Enum.NormalId.Bottom), Vector3.FromNormalId(Enum.NormalId.Back))
say("axes", Vector3.FromAxis(Enum.Axis.X), Vector3.FromAxis(Enum.Axis.Y), Vector3.FromAxis(Enum.Axis.Z), (pcall(Vector3.FromAxis, Enum.NormalId.Top)))
-- CFrame: rotation orders. fromEulerAngles(XYZ) is Angles; (YXZ) is fromEulerAnglesYXZ; each order round-trips.
say("order_xyz", CFrame.fromEulerAngles(0.3, 0.5, 0.7):FuzzyEq(CFrame.Angles(0.3, 0.5, 0.7)), CFrame.fromEulerAngles(0.3, 0.5, 0.7, Enum.RotationOrder.YXZ):FuzzyEq(CFrame.fromEulerAnglesYXZ(0.3, 0.5, 0.7)))
local same = true
for _, o in Enum.RotationOrder:GetEnumItems() do
  local c = CFrame.fromEulerAngles(0.3, -0.5, 0.7, o)
  local x, y, z = c:ToEulerAngles(o)
  if math.abs(x - 0.3) > 1e-5 or math.abs(y + 0.5) > 1e-5 or math.abs(z - 0.7) > 1e-5 then same = false end
  -- and the order is the product's: X then Y then Z for XYZ, etc.
  local parts = { X = CFrame.Angles(0.3, 0, 0), Y = CFrame.Angles(0, -0.5, 0), Z = CFrame.Angles(0, 0, 0.7) }
  local n = o.Name
  if not c:FuzzyEq(parts[n:sub(1, 1)] * parts[n:sub(2, 2)] * parts[n:sub(3, 3)]) then same = false end
end
say("orders", same)
local yx, yy, yz = CFrame.fromEulerAnglesYXZ(0.3, 0.5, 0.7):ToEulerAngles(Enum.RotationOrder.YXZ)
local ax, ay, az = CFrame.fromEulerAnglesYXZ(0.3, 0.5, 0.7):ToEulerAnglesYXZ()
say("to_yxz", math.abs(yx - ax) < 1e-6 and math.abs(yy - ay) < 1e-6 and math.abs(yz - az) < 1e-6)
say("angle_between", r3(CFrame.new():AngleBetween(CFrame.Angles(0, 1, 0))), r3(CFrame.new(5, 0, 0):AngleBetween(CFrame.new(-3, 2, 1))), r3(CFrame.Angles(0, 0.5, 0):AngleBetween(CFrame.Angles(0, 0.5, 0) * CFrame.Angles(0.25, 0, 0))))
say("look_along", CFrame.lookAlong(Vector3.new(1, 2, 3), Vector3.new(0, 0, 5)):FuzzyEq(CFrame.lookAt(Vector3.new(1, 2, 3), Vector3.new(1, 2, 8))))
local rb = CFrame.fromRotationBetweenVectors(Vector3.new(0, 2, 0), Vector3.new(3, 0, 0))
say("rotation_between", (rb * Vector3.yAxis):FuzzyEq(Vector3.xAxis), rb.Position == Vector3.zero, (CFrame.fromRotationBetweenVectors(Vector3.yAxis, -Vector3.yAxis) * Vector3.yAxis):FuzzyEq(-Vector3.yAxis), CFrame.fromRotationBetweenVectors(Vector3.xAxis, Vector3.xAxis * 2) == CFrame.new())
`);
for (const l of dtOut) { const m = /^@(\w+) (.*)$/.exec(l); if (m) dt[m[1]] = m[2]; }
const DT_EXPECT = {
  pastel_number: '11', by_number: 'Pastel Blue', by_rgb: 'Pastel Blue', by_color3: 'Pastel Blue,Really red', palette70: 'Gold,333',
  unknown: 'Medium stone grey,Medium stone grey', named: 'White,Medium stone grey,Dark stone grey,Black,Bright red,Bright yellow,Dark green,Bright blue',
  members: '11,Pastel Blue,0.502,0.733,0.859,Color3,true', tostring_eq: 'Pastel Blue,true,false,BrickColor', random: 'true',
  part_default: 'Medium stone grey', part_set: 'true,Pastel Blue', part_nearest: 'Really red,true',
  rect: '1,2,5,6,4,4,Rect', rect4: '10,4,0,1, 2, 3, 4,true',
  region3: '3.5,4,4,2.25,2,1,true,Region3', expand: '4,4,8,2,2,0', negative: '-1',
  luminance: '0.213,1,0,1.000', contrast: '21,21,1',
  contrasting: '0, 0, 0,1, 1, 1,0.0784313753, 0.0784313753, 0.0784313753',
  normals: '0, 1, 0,0, 0, -1,1, 0, 0,-1, 0, 0,0, -1, 0,0, 0, 1', axes: '1, 0, 0,0, 1, 0,0, 0, 1,false',
  order_xyz: 'true,true', orders: 'true', to_yxz: 'true', angle_between: '1.000,0.000,0.250', look_along: 'true', rotation_between: 'true,true,true,true',
};
const dtBad = Object.entries(DT_EXPECT).filter(([k, v]) => dt[k] !== v).map(([k, v]) => `${k}: got ${JSON.stringify(dt[k])}, want ${JSON.stringify(v)}`);
for (const [k, re] of [['palette_bad', /^false,.*out of range/], ['readonly', /^false,.*Number cannot be assigned to/], ['part_bad', /^false,.*BrickColor expected/]]) if (!re.test(dt[k] || '')) dtBad.push(`${k}: got ${JSON.stringify(dt[k])}`);
if (dtBad.length) console.log('datatypes:', dtBad.join('; '));
else console.log(`datatypes: BrickColor, Rect, Region3, Color3 contrast, FromNormalId/FromAxis, CFrame orders: ${Object.keys(DT_EXPECT).length + 3} checks ok`);

const missing = expect.filter(e => !out.includes(e));
const badprop = out.find(l => l.startsWith('bad prop false') && l.includes('Nope is not a valid member of Part'));
const badtype = out.find(l => l.startsWith('bad type false') && l.includes('bool expected'));
const broken = out.find(l => l.startsWith('ERR') && l.includes('attempt to index nil'));
const t1 = out.includes('t1 1');
const colorType = out.find(l => l.startsWith('color type false') && l.includes('Color3 expected'));
const colorRO = out.find(l => l.startsWith('color readonly false') && l.includes('R cannot be assigned to'));
const cfType = out.find(l => l.startsWith('cf part type false') && l.includes('CFrame expected')) && out.find(l => l.startsWith('cf readonly false') && l.includes('X cannot be assigned to'));
const scriptOnce = out.filter(l => l.startsWith('script ran Hello')).length === 1 && out.indexOf('before start') < out.indexOf('script ran Hello ServerScriptService');
const moduleOnce = out.filter(l => l === 'module body').length === 1;
const reqErrs = ['require two false', 'require loop false', 'require part false'].every(p => out.find(l => l.startsWith(p)))
  && out.find(l => l.startsWith('require two') && l.includes('exactly one value')) && out.find(l => l.startsWith('require loop') && l.includes('recursively'));
const udimRO = out.find(l => l.startsWith('udim2 ro false') && l.includes('cannot be assigned to'));
const mtLocked = out.find(l => l.startsWith('metatable The metatable is locked false'));
const enumErrs = ['enum wrong type false', 'enum bad name false', 'enum bad item false'].every(p => out.find(l => l.startsWith(p)));
// Script timeout (Studio's Script Timeout): a resumption that never yields stops with Roblox's error,
// quickly, and the VM carries on; one that yields often runs as long as it likes in total.
vm.scriptTimeout(0.3);
const tRun = Date.now();
vm.run('runaway', 'local n = 0 while true do n += 1 end');
const runawayMs = Date.now() - tRun;
vm.run('patient', 'local busy = 0 for i = 1, 8 do local s = os.clock() while os.clock() - s < 0.1 do busy += 1 end task.wait() end print("patient done")');
for (let i = 0; i < 12; i++) vm.step(3 + i * 0.1);
vm.scriptTimeout(10);
vm.run('alive', 'print("alive after timeout")');
const timedOut = !!out.find(l => l.startsWith('ERR') && l.includes('Script timeout: exhausted allowed execution time')) && runawayMs < 3000;
const patient = out.includes('patient done'), alive = out.includes('alive after timeout');
console.log(`script timeout: runaway stopped after ${runawayMs} ms (${timedOut}), patient ${patient}, alive ${alive}`);
if (!timedOut || !patient || !alive) { console.log('FAIL script timeout'); process.exit(1); }

if (dtBad.length || missing.length || !udimRO || !scriptOnce || !moduleOnce || !reqErrs || !cfType || !badprop || !badtype || !broken || !t1 || !colorType || !colorRO || !enumErrs || !mtLocked || vm.waiting() !== 0) {
  console.log('FAIL', { dtBad, missing, badprop: !!badprop, badtype: !!badtype, broken: !!broken, t1, colorType: !!colorType, colorRO: !!colorRO, enumErrs, mtLocked: !!mtLocked, cfType: !!cfType, scriptOnce, moduleOnce, reqErrs: !!reqErrs, waiting: vm.waiting() });
  process.exit(1);
}
console.log('PASS');
