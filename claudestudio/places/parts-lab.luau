-- Parts lab: every part shape, side by side, for the asset gate. All 4 studs,
-- in a row along X at z = -12 (in front of a spawn facing -Z, Roblox's default).
local base = Instance.new("Part")
base.Name = "Baseplate"
base.Size = Vector3.new(512, 20, 512)
base.Position = Vector3.new(0, -10, 0)
base.Anchored = true
base.Color = Color3.new(0.39, 0.40, 0.42)
base.Parent = workspace
local grid = Instance.new("Texture")
grid.Texture = "studio://grid"
grid.Face = Enum.NormalId.Top
grid.StudsPerTileU = 4
grid.StudsPerTileV = 4
grid.Parent = base

local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(8, 1, 8)
spawn.Position = Vector3.new(0, 0.5, 0)
spawn.Anchored = true
spawn.Parent = workspace

local function part(class, name, x, color)
  local p = Instance.new(class)
  p.Name = name
  p.Size = Vector3.new(4, 4, 4)
  p.Position = Vector3.new(x, 2, -12)
  p.Anchored = true
  p.Color = color
  p.Parent = workspace
  return p
end
local block = part("Part", "Block", -12, Color3.fromRGB(196, 40, 28))
local front = Instance.new("Texture")
front.Texture = "studio://grid"
front.Face = Enum.NormalId.Front
front.StudsPerTileU = 1
front.StudsPerTileV = 1
front.Parent = block
local ball = part("Part", "Ball", -6, Color3.fromRGB(13, 105, 172))
ball.Shape = Enum.PartType.Ball
local cyl = part("Part", "Cylinder", 0, Color3.fromRGB(75, 151, 75))
cyl.Shape = Enum.PartType.Cylinder
part("WedgePart", "Wedge", 6, Color3.fromRGB(245, 205, 48))
local w2 = part("Part", "PartWedge", 12, Color3.fromRGB(170, 85, 255))
w2.Shape = Enum.PartType.Wedge
