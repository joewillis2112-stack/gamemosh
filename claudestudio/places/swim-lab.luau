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
