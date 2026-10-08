// Luau in wasm driving the JS DataModel: properties, parenting, lists,
// vectors, Color3, Enum, events, task.wait, Signal:Wait, errors.
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
  'children 4 8 Box3',
  'isa true false true true',
  'touched by Box2',
  'done',
  'after destroy 3 nil',
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
  'vector Vector3 0 1 0.5 true 1 90',
  'readonly false',
  'bad parent false',
  'waitforchild Later nil',
];
const missing = expect.filter(e => !out.includes(e));
const badprop = out.find(l => l.startsWith('bad prop false') && l.includes('Nope is not a valid member of Part'));
const badtype = out.find(l => l.startsWith('bad type false') && l.includes('bool expected'));
const broken = out.find(l => l.startsWith('ERR') && l.includes('attempt to index nil'));
const t1 = out.includes('t1 1');
const colorType = out.find(l => l.startsWith('color type false') && l.includes('Color3 expected'));
const colorRO = out.find(l => l.startsWith('color readonly false') && l.includes('R cannot be assigned to'));
const mtLocked = out.find(l => l.startsWith('metatable The metatable is locked false'));
const enumErrs = ['enum wrong type false', 'enum bad name false', 'enum bad item false'].every(p => out.find(l => l.startsWith(p)));
if (missing.length || !badprop || !badtype || !broken || !t1 || !colorType || !colorRO || !enumErrs || !mtLocked || vm.waiting() !== 0) {
  console.log('FAIL', { missing, badprop: !!badprop, badtype: !!badtype, broken: !!broken, t1, colorType: !!colorType, colorRO: !!colorRO, enumErrs, mtLocked: !!mtLocked, waiting: vm.waiting() });
  process.exit(1);
}
console.log('PASS');
