-- Touch lab: Touched from every side of the body. A wall ahead, a low ceiling,
-- a wedge whose empty space (above its slope) must NOT touch, and an upright
-- cylinder whose square "corners" must NOT touch. Each prints when touched.
local base = Instance.new("Part")
base.Name = "Baseplate"
base.Size = Vector3.new(512, 20, 512)
base.Position = Vector3.new(0, -10, 0)
base.Anchored = true
base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6)
spawn.Position = Vector3.new(0, 0.5, -30)
spawn.Anchored = true
spawn.Parent = workspace
local function part(name, props)
  local p = Instance.new(props.Class or "Part")
  for k, v in pairs(props) do if k ~= "Class" then p[k] = v end end
  p.Name = name
  p.Anchored = true
  p.Parent = workspace
  p.Touched:Connect(function(hit) if hit.Parent:FindFirstChild("Humanoid") then print("touched", name) end end)
  return p
end
part("Wall", { Size = Vector3.new(10, 10, 1), Position = Vector3.new(0, 5, 10) })
part("Ceiling", { Size = Vector3.new(10, 1, 10), Position = Vector3.new(20, 5.6, 0) }) -- underside at 5.1: just over a 5-stud body
part("Wedge", { Class = "WedgePart", Size = Vector3.new(6, 6, 12), Position = Vector3.new(-20, 3, 0) })
part("Pillar", { Shape = Enum.PartType.Cylinder, Size = Vector3.new(8, 6, 6), Orientation = Vector3.new(0, 0, 90), Position = Vector3.new(40, 4, 0) })
