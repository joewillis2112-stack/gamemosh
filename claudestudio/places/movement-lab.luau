-- Movement lab: ramps from 15 to 75 degrees and stairs with 0.5 to 2 stud
-- risers, for measuring the character on slopes and steps.
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
spawn.Position = Vector3.new(0, 0.5, -20)
spawn.Anchored = true
spawn.Orientation = Vector3.new(0, 180, 0) -- face +Z, toward the course (Roblox spawns face -Z at 0)
spawn.Material = Enum.Material.SmoothPlastic
spawn.Color = Color3.new(0.64, 0.64, 0.66)
spawn.Parent = workspace

-- Ramps rise toward +Z from z = 20, 40 studs long, 10 wide.
local L = 40
for i, angle in ipairs({15, 30, 45, 60, 75}) do
  local a = math.rad(angle)
  local r = Instance.new("Part")
  r.Name = "Ramp" .. angle
  r.Size = Vector3.new(10, 1, L)
  -- Centre of the slab so its top surface starts at the ground at z = 20.
  r.Position = Vector3.new(-60 + i * 16, (L / 2) * math.sin(a) - 0.5 * math.cos(a), 20 + (L / 2) * math.cos(a) + 0.5 * math.sin(a))
  r.Orientation = Vector3.new(-angle, 0, 0)
  r.Anchored = true
  r.Material = Enum.Material.SmoothPlastic
  r.Color = Color3.fromHSV(i / 7, 0.45, 0.85)
  r.Parent = workspace
end

-- Stairs toward +Z from z = 20: 8 steps, 2 studs deep, one rise per flight.
for i, rise in ipairs({0.5, 0.8, 1, 1.2, 1.5, 2}) do
  for s = 1, 8 do
    local p = Instance.new("Part")
    p.Name = "Stair" .. rise .. "_" .. s
    p.Size = Vector3.new(10, rise * s, 2)
    p.Position = Vector3.new(24 + i * 14, rise * s / 2, 20 + (s - 1) * 2 + 1)
    p.Anchored = true
    p.Color = Color3.fromHSV(0.6, 0.15, 0.55 + (s % 2) * 0.1)
    p.Parent = workspace
  end
end

-- A wall too tall to jump (auto-jump must not try it).
local wall = Instance.new("Part")
wall.Name = "TallWall"
wall.Size = Vector3.new(10, 10, 2)
wall.Position = Vector3.new(130, 5, 22)
wall.Anchored = true
wall.Color = Color3.fromRGB(200, 190, 170)
wall.Parent = workspace
