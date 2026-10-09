-- Materials lab: one 6-stud cube of each textured material on a slab of the
-- same, coloured as builders typically colour them, for judging scale, tint
-- and relief. Row 1 z = 20, row 2 z = 40.
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 20, 256) base.Position = Vector3.new(0, -10, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, -10) spawn.Parent = workspace
local mats = {
  { "Wood", Color3.fromRGB(160, 110, 70) }, { "WoodPlanks", Color3.fromRGB(150, 100, 60) },
  { "Brick", Color3.fromRGB(170, 85, 70) }, { "Cobblestone", Color3.fromRGB(140, 140, 135) },
  { "Concrete", Color3.fromRGB(163, 162, 165) }, { "Grass", Color3.fromRGB(75, 151, 75) },
  { "Sand", Color3.fromRGB(215, 195, 150) },
  { "Granite", Color3.fromRGB(150, 145, 140) }, { "Marble", Color3.fromRGB(230, 230, 225) },
  { "DiamondPlate", Color3.fromRGB(160, 160, 165) }, { "CorrodedMetal", Color3.fromRGB(120, 95, 80) },
  { "Fabric", Color3.fromRGB(70, 90, 160) }, { "Pebble", Color3.fromRGB(190, 185, 175) },
  { "Ice", Color3.fromRGB(170, 210, 235) },
}
for i, m in ipairs(mats) do
  local row, col = (i - 1) // 7, (i - 1) % 7
  local x, z = -42 + col * 14, 20 + row * 20
  local slab = Instance.new("Part")
  slab.Name = m[1] .. "Slab" slab.Anchored = true slab.Size = Vector3.new(12, 1, 12) slab.Position = Vector3.new(x, 0.5, z)
  slab.Material = Enum.Material[m[1]] slab.Color = m[2] slab.Parent = workspace
  local cube = Instance.new("Part")
  cube.Name = m[1] cube.Anchored = true cube.Size = Vector3.new(6, 6, 6) cube.Position = Vector3.new(x, 4, z)
  cube.Material = Enum.Material[m[1]] cube.Color = m[2] cube.Parent = workspace
end
