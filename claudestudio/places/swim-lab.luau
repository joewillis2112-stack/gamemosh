-- Swim lab: a pool of Terrain water (runtime/character.js swims in it). Rock ground with its top at y 0, and a pool
-- 40 x 40 studs (x -20..20, z -40..0), 12 deep, full of water to y 0. test/scenarios/swimming.mjs swims in it.
local T = workspace.Terrain
T:FillBlock(CFrame.new(0, -8, 0), Vector3.new(128, 16, 128), Enum.Material.Rock)
T:FillBlock(CFrame.new(0, -6, -20), Vector3.new(40, 12, 40), Enum.Material.Water)
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 20); spawn.Anchored = true; spawn.Parent = workspace
_G.swims = {}
game:GetService("Players").PlayerAdded:Connect(function(pl)
  pl.CharacterAdded:Connect(function(ch)
    ch:WaitForChild("Humanoid").Swimming:Connect(function(speed) table.insert(_G.swims, speed) end)
  end)
end)
-- Parts dropped into the pool: slabs (4 x 1 x 4: a cube of these densities floats tilted, as a real one does) of Plastic
-- (density 0.7) and Wood float, a 2 x 2 x 2 block of Concrete sinks; each carries a BuoyancySensor, as does a block on
-- dry land.
local function block(name, mat, pos, size)
  local p = Instance.new("Part"); p.Name = name; p.Size = size or Vector3.new(2, 2, 2); p.Material = mat; p.CFrame = CFrame.new(pos)
  Instance.new("BuoyancySensor").Parent = p
  p.Parent = workspace
  return p
end
block("Float", Enum.Material.Plastic, Vector3.new(12, 6, -30), Vector3.new(4, 1, 4))
block("Raft", Enum.Material.Wood, Vector3.new(-12, 6, -30), Vector3.new(4, 1, 4))
block("Sink", Enum.Material.Concrete, Vector3.new(12, 6, -10))
block("Dry", Enum.Material.Plastic, Vector3.new(30, 2, 20))
