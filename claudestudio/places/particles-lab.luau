-- Particles lab: ParticleEmitters to judge and measure, late afternoon on a
-- grey floor. From left to right: a fountain (Speed, SpreadAngle,
-- Acceleration, Color over life), a fire (LightEmission 1, Size and
-- Transparency over life), smoke (Drag, Rotation, RotSpeed, normal blending,
-- LightInfluence 1),
-- sparkles from a sphere's surface (the default texture), and rain from a
-- wide box (Squash, VelocityParallel).
game:GetService("Lighting").ClockTime = 16
local function part(name, size, pos, color, props)
  local p = Instance.new("Part")
  p.Name = name p.Anchored = true p.Size = size p.Position = pos p.Color = color
  for k, v in pairs(props or {}) do p[k] = v end
  p.Parent = workspace
  return p
end
local function emitter(parent, props)
  local e = Instance.new("ParticleEmitter")
  for k, v in pairs(props) do e[k] = v end
  e.Parent = parent
  return e
end
part("Floor", Vector3.new(140, 1, 80), Vector3.new(0, -0.5, 0), Color3.fromRGB(110, 112, 118))
part("Wall", Vector3.new(140, 30, 1), Vector3.new(0, 15, -30), Color3.fromRGB(60, 64, 76))
local spawn = Instance.new("SpawnLocation") spawn.Anchored = true spawn.Size = Vector3.new(4, 1, 4) spawn.Position = Vector3.new(0, 0.5, 8) spawn.Parent = workspace

local fountain = part("Fountain", Vector3.new(2, 1, 2), Vector3.new(-30, 0.5, -10), Color3.fromRGB(90, 90, 100))
emitter(fountain, {
  Name = "Water", Rate = 60, Lifetime = NumberRange.new(1.4, 1.8), Speed = NumberRange.new(16, 18), SpreadAngle = Vector2.new(12, 12),
  Acceleration = Vector3.new(0, -24, 0), Size = NumberSequence.new(0.5, 0.2),
  Color = ColorSequence.new(Color3.fromRGB(120, 190, 255), Color3.fromRGB(230, 245, 255)),
  Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(0.8, 0.3), NumberSequenceKeypoint.new(1, 1) }),
})

local hearth = part("Hearth", Vector3.new(3, 0.5, 3), Vector3.new(-15, 0.25, -10), Color3.fromRGB(40, 36, 34))
emitter(hearth, {
  Name = "Fire", Texture = "rbxasset://textures/particles/fire_main.dds", Rate = 40, Lifetime = NumberRange.new(0.8, 1.2), Speed = NumberRange.new(3, 5), SpreadAngle = Vector2.new(8, 8),
  LightEmission = 1, Brightness = 2, Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 2.2, 0.4), NumberSequenceKeypoint.new(1, 0.2) }),
  Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 220, 120)), ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 110, 30)), ColorSequenceKeypoint.new(1, Color3.fromRGB(120, 20, 10)) }),
  Transparency = NumberSequence.new(0.1, 1), Rotation = NumberRange.new(0, 360), RotSpeed = NumberRange.new(-90, 90),
})

local chimney = part("Chimney", Vector3.new(2, 1, 2), Vector3.new(0, 0.5, -10), Color3.fromRGB(70, 60, 55))
emitter(chimney, {
  Name = "Smoke", Texture = "rbxasset://textures/particles/smoke_main.dds", Rate = 12, Lifetime = NumberRange.new(4, 5), Speed = NumberRange.new(6, 7), Drag = 1.5, Acceleration = Vector3.new(1.5, 0.6, 0),
  Size = NumberSequence.new(1.5, 6), Transparency = NumberSequence.new(0.35, 1), Rotation = NumberRange.new(0, 360), RotSpeed = NumberRange.new(-30, 30),
  Color = ColorSequence.new(Color3.fromRGB(200, 200, 205), Color3.fromRGB(120, 120, 128)), LightInfluence = 1,
})

local orb = part("Orb", Vector3.new(4, 4, 4), Vector3.new(15, 5, -10), Color3.fromRGB(255, 230, 140), { Shape = Enum.PartType.Ball, Transparency = 0.6 })
emitter(orb, {
  Name = "Sparkles", Shape = Enum.ParticleEmitterShape.Sphere, ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface, Rate = 30,
  Lifetime = NumberRange.new(1, 1.5), Speed = NumberRange.new(1.5), LightEmission = 1, Size = NumberSequence.new(0.9, 0),
  Color = ColorSequence.new(Color3.fromRGB(255, 240, 160)),
})

local cloud = part("Cloud", Vector3.new(14, 1, 10), Vector3.new(32, 18, -10), Color3.fromRGB(200, 200, 210), { Transparency = 1, CanCollide = false })
emitter(cloud, {
  Name = "Rain", EmissionDirection = Enum.NormalId.Bottom, Rate = 120, Lifetime = NumberRange.new(1), Speed = NumberRange.new(18),
  Orientation = Enum.ParticleOrientation.VelocityParallel, Squash = NumberSequence.new(2.5), Size = NumberSequence.new(0.35),
  Color = ColorSequence.new(Color3.fromRGB(170, 200, 255)), Transparency = NumberSequence.new(0.3),
})
print("particles ready")
