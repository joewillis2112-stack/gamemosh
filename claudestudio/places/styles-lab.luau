-- Styles lab: shapes to judge Claude Studio's own looks on (ToonEffect, OutlineEffect, PixelEffect):
-- a ball, a block, a wedge and a cylinder on a floor, mid-afternoon, with the effects added by the
-- test (or by hand in the editor).
game:GetService("Lighting").ClockTime = 15
local function part(name, size, pos, color, props)
  local p = Instance.new("Part")
  p.Name = name p.Anchored = true p.Size = size p.Position = pos p.Color = color
  for k, v in pairs(props or {}) do p[k] = v end
  p.Parent = workspace
  return p
end
part("Floor", Vector3.new(120, 1, 120), Vector3.new(0, -0.5, 0), Color3.fromRGB(120, 170, 110))
local spawn = Instance.new("SpawnLocation") spawn.Anchored = true spawn.Size = Vector3.new(4, 1, 4) spawn.Position = Vector3.new(0, 0.5, 14) spawn.Parent = workspace
part("Ball", Vector3.new(8, 8, 8), Vector3.new(-12, 4, -6), Color3.fromRGB(230, 120, 90), { Shape = Enum.PartType.Ball })
part("Block", Vector3.new(6, 6, 6), Vector3.new(0, 3, -10), Color3.fromRGB(90, 140, 220))
local wedge = Instance.new("WedgePart") wedge.Name = "Wedge" wedge.Anchored = true wedge.Size = Vector3.new(6, 5, 8) wedge.Position = Vector3.new(12, 2.5, -6) wedge.Color = Color3.fromRGB(240, 200, 80) wedge.Parent = workspace
part("Column", Vector3.new(10, 4, 4), Vector3.new(24, 5, -14), Color3.fromRGB(200, 200, 210), { Shape = Enum.PartType.Cylinder, Orientation = Vector3.new(0, 0, 90) })
print("styles ready")
