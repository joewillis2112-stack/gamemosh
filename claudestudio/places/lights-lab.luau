-- Lights lab: the three local lights at night, to judge and measure them.
-- A floor and a back wall; a lamp (PointLight), a ceiling spot (SpotLight
-- pointing down), a wall panel (SurfaceLight facing out), a red lamp, and a
-- pillar beside a shadow-casting spot.
game:GetService("Lighting").ClockTime = 0
local function part(name, size, pos, color, material)
  local p = Instance.new("Part")
  p.Name = name p.Anchored = true p.Size = size p.Position = pos p.Color = color
  if material then p.Material = material end
  p.Parent = workspace
  return p
end
part("Floor", Vector3.new(120, 1, 120), Vector3.new(0, -0.5, 0), Color3.fromRGB(180, 180, 180))
part("Wall", Vector3.new(80, 20, 1), Vector3.new(0, 10, -20), Color3.fromRGB(200, 200, 200))
local spawn = Instance.new("SpawnLocation") spawn.Anchored = true spawn.Size = Vector3.new(4, 1, 4) spawn.Position = Vector3.new(0, 0.5, 18) spawn.Parent = workspace

local lamp = part("Lamp", Vector3.new(1, 1, 1), Vector3.new(-14, 3, -12), Color3.fromRGB(255, 240, 200), Enum.Material.Neon)
local point = Instance.new("PointLight") point.Name = "Point" point.Range = 12 point.Brightness = 2 point.Parent = lamp

local fixture = part("Fixture", Vector3.new(2, 0.4, 2), Vector3.new(0, 12, -6), Color3.fromRGB(60, 60, 60))
local spot = Instance.new("SpotLight") spot.Name = "Spot" spot.Face = Enum.NormalId.Bottom spot.Range = 16 spot.Angle = 60 spot.Brightness = 3 spot.Parent = fixture

local panel = part("Panel", Vector3.new(6, 3, 0.4), Vector3.new(14, 6, -19.3), Color3.fromRGB(230, 240, 255), Enum.Material.Neon)
local surface = Instance.new("SurfaceLight") surface.Name = "Surface" surface.Face = Enum.NormalId.Back surface.Range = 14 surface.Angle = 120 surface.Brightness = 2 surface.Parent = panel

local red = part("RedLamp", Vector3.new(1, 1, 1), Vector3.new(-26, 2, 4), Color3.fromRGB(255, 60, 60), Enum.Material.Neon)
local redLight = Instance.new("PointLight") redLight.Name = "Red" redLight.Color = Color3.fromRGB(255, 40, 40) redLight.Range = 10 redLight.Brightness = 2 redLight.Parent = red

part("Pillar", Vector3.new(2, 8, 2), Vector3.new(26, 4, 0), Color3.fromRGB(120, 120, 140))
local shadowFixture = part("ShadowFixture", Vector3.new(1, 0.4, 1), Vector3.new(22, 12, 0), Color3.fromRGB(60, 60, 60))
local shadowSpot = Instance.new("SpotLight") shadowSpot.Name = "ShadowSpot" shadowSpot.Face = Enum.NormalId.Bottom shadowSpot.Range = 20 shadowSpot.Angle = 120 shadowSpot.Brightness = 3 shadowSpot.Shadows = true shadowSpot.Parent = shadowFixture
print("lights ready")
