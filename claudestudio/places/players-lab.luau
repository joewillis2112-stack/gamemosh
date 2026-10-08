-- Players lab: the scripts every obby uses, written the way Roblox creators
-- write them, to check the player API end to end.
local Players = game:GetService("Players")

local base = Instance.new("Part")
base.Name = "Baseplate"
base.Size = Vector3.new(512, 20, 512)
base.Position = Vector3.new(0, -10, 0)
base.Anchored = true
base.Color = Color3.new(0.39, 0.40, 0.42)
base.Parent = workspace
local grid = Instance.new("Texture") -- the baseplate grid, Roblox-style: a Texture on the top face
grid.Texture = "studio://grid"
grid.Face = Enum.NormalId.Top
grid.StudsPerTileU = 4
grid.StudsPerTileV = 4
grid.Parent = base

local spawn = Instance.new("SpawnLocation")
spawn.Name = "Start"
spawn.Size = Vector3.new(12, 1, 12)
spawn.Position = Vector3.new(0, 0.5, 0)
spawn.Anchored = true
spawn.Orientation = Vector3.new(0, 180, 0) -- face +Z, toward the course (Roblox spawns face -Z at 0)
spawn.Parent = workspace

local function pad(name, size, pos, color)
  local p = Instance.new("Part")
  p.Name = name
  p.Size = size
  p.Position = pos
  p.Anchored = true
  p.Color = color
  p.Parent = workspace
  return p
end

local speed = pad("SpeedPad", Vector3.new(8, 0.4, 8), Vector3.new(0, 0.2, 14), Color3.fromRGB(80, 200, 120))
speed.Touched:Connect(function(hit)
  local h = hit.Parent:FindFirstChild("Humanoid")
  if h then h.WalkSpeed = 32 print("speed", h.WalkSpeed) end
end)

local cp = Instance.new("SpawnLocation")
cp.Name = "Checkpoint"
cp.Size = Vector3.new(8, 1, 8)
cp.Position = Vector3.new(0, 0.5, 34)
cp.Anchored = true
cp.Color = Color3.fromRGB(240, 200, 60)
cp.Parent = workspace
cp.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if player and player.RespawnLocation ~= cp then
    player.RespawnLocation = cp
    print("checkpoint", player.Name)
  end
end)

local kill = pad("KillBrick", Vector3.new(8, 1, 8), Vector3.new(0, 0.5, 50), Color3.fromRGB(220, 40, 40))
kill.Touched:Connect(function(hit)
  local h = hit.Parent:FindFirstChild("Humanoid")
  if h then h.Health = 0 end
end)

local tp = pad("Teleporter", Vector3.new(6, 0.4, 6), Vector3.new(30, 0.2, 0), Color3.fromRGB(120, 120, 255))
tp.Touched:Connect(function(hit)
  local root = hit.Parent:FindFirstChild("HumanoidRootPart")
  if root then root.Position = Vector3.new(80, 3, 0) print("teleported") end
end)

Players.PlayerAdded:Connect(function(player)
  print("joined", player.Name, #Players:GetPlayers())
  player.CharacterAdded:Connect(function(char)
    local h = char:WaitForChild("Humanoid")
    print("character", char.Name, h.Health, char.PrimaryPart.Name, h.WalkSpeed)
    h.Died:Connect(function() print("died", char.Name) end)
  end)
end)
