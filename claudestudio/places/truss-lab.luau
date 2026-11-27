-- Truss lab: TrussParts (runtime/world.js draws them, runtime/character.js climbs them). A 20-stud truss tower in
-- front of the spawn with a platform at its top behind it, two short trusses in the other styles, and a plain wall
-- (not climbable). test/scenarios/truss.mjs climbs it.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 12); spawn.Anchored = true; spawn.Parent = workspace
local function part(class, name, size, pos)
  local p = Instance.new(class); p.Name = name; p.Size = size; p.CFrame = CFrame.new(pos); p.Anchored = true; p.Parent = workspace
  return p
end
part("TrussPart", "Tower", Vector3.new(2, 20, 2), Vector3.new(0, 10, -10))
part("Part", "Top", Vector3.new(8, 1, 8), Vector3.new(0, 19.5, -15))
part("TrussPart", "Bridge", Vector3.new(2, 8, 2), Vector3.new(8, 4, -10)).Style = Enum.Style.BridgeStyleSupports
part("TrussPart", "Bare", Vector3.new(2, 8, 2), Vector3.new(-8, 4, -10)).Style = Enum.Style.NoSupports
part("TrussPart", "Beam", Vector3.new(12, 2, 2), Vector3.new(20, 10, -10)) -- lying along X
part("Part", "Wall", Vector3.new(8, 12, 2), Vector3.new(30, 6, -10))
_G.climbs = {}
game:GetService("Players").PlayerAdded:Connect(function(pl)
  pl.CharacterAdded:Connect(function(ch)
    ch:WaitForChild("Humanoid").Climbing:Connect(function(speed) table.insert(_G.climbs, speed) end)
  end)
end)
