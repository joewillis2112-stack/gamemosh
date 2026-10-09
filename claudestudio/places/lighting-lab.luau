-- Lighting lab: one scene, blocky and realistic, to judge the lighting range
-- (the Lighting service, its effects and LightingStyle). A corner of walls
-- shows occlusion; the helmet shows reflections; plastic shows the sun.
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(6, 1, 6) spawn.Position = Vector3.new(0, 0.5, 10) spawn.Parent = workspace

local function part(name, size, pos, color, material)
  local p = Instance.new("Part")
  p.Name = name p.Anchored = true p.Size = size p.Position = pos p.Color = color
  if material then p.Material = material end
  p.Parent = workspace
  return p
end
-- A corner: two walls and a floor slab, with blocks tucked into it.
part("WallBack", Vector3.new(16, 10, 1), Vector3.new(-6, 5, -8.5), Color3.fromRGB(226, 220, 205))
part("WallSide", Vector3.new(1, 10, 16), Vector3.new(-14.5, 5, -1), Color3.fromRGB(226, 220, 205))
part("BlockA", Vector3.new(3, 3, 3), Vector3.new(-12.5, 1.5, -6.5), Color3.fromRGB(196, 40, 28))
part("BlockB", Vector3.new(2, 5, 2), Vector3.new(-9, 2.5, -7), Color3.fromRGB(13, 105, 172))
part("Ball", Vector3.new(3, 3, 3), Vector3.new(-5, 1.5, -5), Color3.fromRGB(245, 205, 48), Enum.Material.SmoothPlastic).Shape = Enum.PartType.Ball
part("Metal", Vector3.new(4, 1, 4), Vector3.new(4, 0.5, -3), Color3.fromRGB(160, 165, 170), Enum.Material.Metal)

local loader = Instance.new("Script") loader.Name = "Helmet" loader.Parent = game:GetService("ServerScriptService")
loader.Source = [[
local helmet = game:GetService("AssetService"):CreateMeshPartAsync("assets/models/DamagedHelmet.glb")
helmet.Name = "Helmet" helmet.Anchored = true
helmet.Size = helmet.Size * 0.6
helmet.CFrame = CFrame.new(5, helmet.Size.Y / 2 + 1, -6) * CFrame.Angles(0, math.rad(-20), 0)
helmet.Parent = workspace
print("lab ready")
]]
