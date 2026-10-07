// Luau in wasm driving the JS DataModel: properties, parenting, lists,
// vectors, events, task.wait, Signal:Wait, errors.
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
];
const missing = expect.filter(e => !out.includes(e));
const badprop = out.find(l => l.startsWith('bad prop false') && l.includes('Nope is not a valid member of Part'));
const badtype = out.find(l => l.startsWith('bad type false') && l.includes('bool expected'));
const broken = out.find(l => l.startsWith('ERR') && l.includes('attempt to index nil'));
const t1 = out.includes('t1 1');
if (missing.length || !badprop || !badtype || !broken || !t1 || vm.waiting() !== 0) {
  console.log('FAIL', { missing, badprop: !!badprop, badtype: !!badtype, broken: !!broken, t1, waiting: vm.waiting() });
  process.exit(1);
}
console.log('PASS');
