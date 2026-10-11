// WorldRoot:Raycast, Ray, RaycastParams and RaycastResult (luau/lib_raycast.h,
// web/raycast.js), from Luau, against exact answers worked out by hand.
import createLuau from '../web/luau.mjs';
import { DataModel } from '../web/datamodel.js';
import { startLuau } from '../web/luau.js';

const out = [];
const dm = new DataModel();
const vm = await startLuau(createLuau, dm, (s, lvl) => out.push((lvl === 2 ? 'ERR ' : '') + s));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const run = src => { out.length = 0; vm.run('t', src); return out.slice(); };
const nums = s => s.split(/[ ,]+/).map(Number);
const near = (a, b, e = 1e-4) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= e);

run(`
local function part(name, size, cf, shape)
  local p = Instance.new(shape == "Wedge" and "WedgePart" or "Part")
  p.Name = name p.Anchored = true p.Size = size p.CFrame = cf
  if shape and shape ~= "Wedge" then p.Shape = Enum.PartType[shape] end
  p.Parent = workspace
  return p
end
part("Floor", Vector3.new(200, 1, 200), CFrame.new(0, 0, 0))
part("Turned", Vector3.new(4, 4, 4), CFrame.new(20, 5, 0) * CFrame.Angles(0, 0, math.rad(45)))
part("Ball", Vector3.new(4, 4, 4), CFrame.new(40, 2.5, 0), "Ball")
part("Cyl", Vector3.new(6, 4, 4), CFrame.new(60, 2.5, 0), "Cylinder")
part("Wedge", Vector3.new(4, 4, 4), CFrame.new(80, 2.5, 0), "Wedge")
local ghost = part("Ghost", Vector3.new(4, 1, 4), CFrame.new(0, 5, 30)) ghost.CanQuery = false
local glass = part("Glass", Vector3.new(4, 1, 4), CFrame.new(0, 5, 40)) glass.CanCollide = false
local m = Instance.new("Model") m.Name = "Crate" m.Parent = workspace
local lid = part("Lid", Vector3.new(4, 1, 4), CFrame.new(0, 5, 50)) lid.Parent = m
part("Roof", Vector3.new(4, 1, 4), CFrame.new(0, 12, 60))
part("Inside", Vector3.new(4, 4, 4), CFrame.new(0, 2.5, 60))
`);
const ray = (o, d, extra = '') => {
  const r = run(`local p = RaycastParams.new() ${extra}
    local r = workspace:Raycast(Vector3.new(${o}), Vector3.new(${d}), p)
    if r then print(r.Instance.Name, string.format("%.5f,%.5f,%.5f", r.Position.X, r.Position.Y, r.Position.Z), string.format("%.5f,%.5f,%.5f", r.Normal.X, r.Normal.Y, r.Normal.Z), r.Material.Name, string.format("%.5f", r.Distance)) else print("nil") end`);
  if (r[0] === 'nil') return null;
  const [name, pos, nrm, mat, dist] = r[0].split(' ');
  return { name, pos: nums(pos), nrm: nums(nrm), mat, dist: +dist };
};

let h = ray('0, 10, 0', '0, -20, 0');
check(h && h.name === 'Floor' && near(h.pos, [0, 0.5, 0]) && near(h.nrm, [0, 1, 0]) && h.mat === 'Plastic' && Math.abs(h.dist - 9.5) < 1e-4, `a block: hit on top, normal up, Material, Distance (${JSON.stringify(h)})`);
h = ray('20.5, 20, 0', '0, -30, 0');
check(h && h.name === 'Turned' && near(h.pos, [20.5, 5 + 2 * Math.SQRT2 - 0.5, 0]) && near(h.nrm, [Math.SQRT1_2, Math.SQRT1_2, 0]), `a block turned 45 degrees: the hit on its slanted face and that face's normal (${h && h.pos}, ${h && h.nrm})`);
h = ray('41, 10, 0', '0, -20, 0');
check(h && h.name === 'Ball' && near(h.pos, [41, 2.5 + Math.sqrt(3), 0]) && near(h.nrm, [0.5, Math.sqrt(3) / 2, 0]), `a ball: the exact sphere, not its mesh (${h && h.pos})`);
h = ray('60, 10, 1', '0, -20, 0');
check(h && h.name === 'Cyl' && near(h.pos, [60, 2.5 + Math.sqrt(3), 1]) && near(h.nrm, [0, Math.sqrt(3) / 2, 0.5]), `a cylinder's side (along X), exactly (${h && h.pos})`);
h = ray('70, 2.5, 0', '-20, 0, 0');
check(h && h.name === 'Cyl' && near(h.pos, [63, 2.5, 0]) && near(h.nrm, [1, 0, 0]), `a cylinder's end cap (${h && h.pos}, ${h && h.nrm})`);
h = ray('80, 10, 1', '0, -20, 0');
check(h && h.name === 'Wedge' && near(h.pos, [80, 3.5, 1]) && near(h.nrm, [0, Math.SQRT1_2, -Math.SQRT1_2]), `a wedge's slope (rising toward the back) and its normal (${h && h.pos}, ${h && h.nrm})`);
h = ray('80, 1.5, -10', '0, 0, 20');
check(h && h.name === 'Wedge' && near(h.pos, [80, 1.5, -1]) && near(h.nrm, [0, Math.SQRT1_2, -Math.SQRT1_2]), `a wedge from the front hits its slope (${h && h.pos})`);
h = ray('0, 10, 30', '0, -20, 0');
check(h && h.name === 'Floor', `CanQuery false: the ray passes through (${h && h.name})`);
h = ray('0, 10, 40', '0, -20, 0');
const h2 = ray('0, 10, 40', '0, -20, 0', 'p.RespectCanCollide = true');
check(h && h.name === 'Glass' && h2 && h2.name === 'Floor', `CanCollide false is hit, unless RespectCanCollide (${h && h.name}, ${h2 && h2.name})`);
h = ray('0, 10, 50', '0, -20, 0', 'p.FilterDescendantsInstances = { workspace.Crate }');
check(h && h.name === 'Floor', `Exclude a Model: its parts are skipped (${h && h.name})`);
h = ray('0, 10, 50', '0, -20, 0', 'p.FilterType = Enum.RaycastFilterType.Include p.FilterDescendantsInstances = { workspace.Crate }');
const h3 = ray('0, 10, 0', '0, -20, 0', 'p.FilterType = Enum.RaycastFilterType.Include p.FilterDescendantsInstances = { workspace.Crate }');
check(h && h.name === 'Lid' && h3 === null, `Include: only the listed instances' parts (${h && h.name}, ${h3})`);
h = ray('0, 2.5, 60', '0, 20, 0');
check(h && h.name === 'Roof', `a ray starting inside a part doesn't hit it, and goes on (${h && h.name})`);
h = ray('0, 10, 0', '0, -5, 0');
check(h === null, 'a ray shorter than the distance to the floor hits nothing');
h = ray('0, 10, 0', '0, 0, 0');
check(h === null, 'a zero-length direction hits nothing');

let r = run(`
local p = RaycastParams.new()
local list = { workspace.Floor }
p.FilterDescendantsInstances = list
table.insert(list, workspace.Ball)
print("copy", #p.FilterDescendantsInstances)
p:AddToFilter(workspace.Ball) p:AddToFilter({ workspace.Cyl })
print("added", #p.FilterDescendantsInstances)
p.FilterType = "Include" print("byname", p.FilterType.Name)
p.FilterType = 0 print("byvalue", p.FilterType.Name)
print("types", typeof(p), typeof(workspace:Raycast(Vector3.new(0, 10, 0), Vector3.new(0, -20, 0))), typeof(Ray.new(Vector3.zero, Vector3.xAxis)))
print("default", RaycastParams.new().FilterType.Name, RaycastParams.new().CollisionGroup, RaycastParams.new().RespectCanCollide)
print(pcall(function() p.Nope = 1 end))
print(pcall(function() p.FilterType = "Sideways" end))
print(pcall(function() p.IgnoreWater = "yes" end))
print(pcall(function() workspace:Raycast(Vector3.zero, Vector3.yAxis, {}) end))
print(pcall(function() workspace.Floor:Raycast(Vector3.zero, Vector3.yAxis) end))
local res = workspace:Raycast(Vector3.new(0, 10, 0), Vector3.new(0, -20, 0))
print(pcall(function() res.Distance = 3 end))
print(pcall(function() return getmetatable(res) end))
`);
const line = k => r.find(l => l.startsWith(k)) || '';
check(line('copy') === 'copy 1' && line('added') === 'added 3', `FilterDescendantsInstances is copied when set; AddToFilter adds instances and lists (${line('copy')}, ${line('added')})`);
check(line('byname') === 'byname Include' && line('byvalue') === 'byvalue Exclude', 'FilterType takes an EnumItem, its name or its value');
check(line('types') === 'types RaycastParams RaycastResult Ray', `typeof names the datatypes (${line('types')})`);
check(line('default') === 'default Exclude Default false', `RaycastParams defaults (${line('default')})`);
check(r.some(l => /false.*Nope is not a valid member of RaycastParams/.test(l)) && r.some(l => /false.*Invalid value for enum RaycastFilterType/.test(l)) && r.some(l => /false.*boolean expected, got string/.test(l)), 'bad RaycastParams fields and values raise');
check(r.some(l => /false.*Unable to cast table to RaycastParams/.test(l)) && r.some(l => /false.*Raycast is not a valid member of Part/.test(l)), 'Raycast checks its params and only exists on the Workspace');
check(r.some(l => /false.*Distance cannot be assigned to/.test(l)) && r.some(l => /true.*The metatable is locked/.test(l)), 'a RaycastResult is read-only and its metatable locked');

r = run(`
local ray = Ray.new(Vector3.new(0, 0, 0), Vector3.new(10, 0, 0))
print("unit", ray.Unit.Direction.Magnitude, ray.Unit.Origin == ray.Origin)
local c = ray:ClosestPoint(Vector3.new(4, 3, 0)) print("closest", c.X, c.Y, c.Z)
print("dist", ray:Distance(Vector3.new(4, 3, 0)), ray:Distance(Vector3.new(-3, 4, 0)))
print("str", tostring(ray))
print(pcall(function() ray.Origin = Vector3.zero end))
`);
check(line('unit') === 'unit 1 true' && line('closest') === 'closest 4 0 0' && line('dist') === 'dist 3 5', `Ray: Unit, ClosestPoint, Distance (behind the origin it measures to the origin) (${line('unit')}; ${line('closest')}; ${line('dist')})`);
check(line('str') === 'str {0, 0, 0}, {10, 0, 0}' && r.some(l => /false.*Origin cannot be assigned to/.test(l)), `Ray: tostring and immutability (${line('str')})`);

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
