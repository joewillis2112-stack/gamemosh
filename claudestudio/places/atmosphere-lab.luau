-- Atmosphere lab: dark walls at 40, 150, 600 and 2400 studs, each about 4 degrees tall as seen from
-- the camera (at 0, 5, 0, looking along -Z), so each stands against the sky just above the horizon:
-- to judge how an Atmosphere fades distance into the sky, and its haze, glare and colours.
game:GetService("Lighting").ClockTime = 16
local floor = Instance.new("Part") floor.Name = "Floor" floor.Anchored = true floor.Size = Vector3.new(200, 1, 200) floor.Position = Vector3.new(0, -0.5, 0) floor.Color = Color3.fromRGB(110, 150, 100) floor.Parent = workspace
local spawn = Instance.new("SpawnLocation") spawn.Anchored = true spawn.Size = Vector3.new(4, 1, 4) spawn.Position = Vector3.new(0, 0.5, 40) spawn.Parent = workspace
local walls = Instance.new("Folder") walls.Name = "Walls" walls.Parent = workspace
for i, w in ipairs({ { 40, -24 }, { 150, -8 }, { 600, 8 }, { 2400, 24 } }) do
  local d, a = w[1], math.rad(w[2])
  local p = Instance.new("Part")
  p.Name = "Wall" .. i p.Anchored = true p.Size = Vector3.new(0.12 * d, 0.07 * d + 5, 1)
  p.CFrame = CFrame.new(d * math.sin(a), p.Size.Y / 2, -d * math.cos(a)) * CFrame.Angles(0, -a, 0)
  p.Color = Color3.fromRGB(40, 40, 46)
  p.Parent = walls
end
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
cam.CFrame = CFrame.lookAt(Vector3.new(0, 5, 0), Vector3.new(0, 5, -1))
print("atmosphere ready")
