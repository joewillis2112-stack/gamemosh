-- The default place: a baseplate, a spawn, and a few parts to judge the look.
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
spawn.Size = Vector3.new(12, 1, 12)
spawn.Position = Vector3.new(0, 0.5, 0)
spawn.Anchored = true
spawn.Orientation = Vector3.new(0, 180, 0) -- face +Z, toward the course (Roblox spawns face -Z at 0)
spawn.Material = Enum.Material.SmoothPlastic
spawn.Color = Color3.new(0.64, 0.64, 0.66)
spawn.Parent = workspace

local colours = {
  Color3.new(0.77, 0.16, 0.11), -- red
  Color3.new(0.05, 0.41, 0.67), -- blue
  Color3.new(0.29, 0.59, 0.29), -- green
  Color3.new(0.96, 0.80, 0.19), -- yellow
}
for i, c in ipairs(colours) do
  local p = Instance.new("Part")
  p.Name = "Block" .. i
  p.Size = Vector3.new(4, 4, 4)
  p.Position = Vector3.new(-18 + i * 7, 2, 16)
  p.Anchored = true
  p.Color = c
  p.Parent = workspace
end
local ball = Instance.new("Part")
ball.Shape = Enum.PartType.Ball
ball.Size = Vector3.new(4, 4, 4)
ball.Position = Vector3.new(14, 2, 6)
ball.Anchored = true
ball.Material = Enum.Material.Metal
ball.Color = Color3.new(0.85, 0.85, 0.88)
ball.Parent = workspace
local neon = Instance.new("Part")
neon.Size = Vector3.new(1, 8, 1)
neon.Position = Vector3.new(-14, 4, 4)
neon.Anchored = true
neon.Material = Enum.Material.Neon
neon.Color = Color3.new(0.0, 0.85, 1.0)
neon.Parent = workspace
