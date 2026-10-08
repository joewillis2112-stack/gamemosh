-- The reference obby: six stages over lava, a checkpoint after each, built
-- only from parts that passed the gate. The course runs along +Z, 10 studs up.
local Players = game:GetService("Players")
local TOP = 10 -- the course's walking height

local function part(props)
  local p = Instance.new(props.Class or "Part")
  for k, v in pairs(props) do if k ~= "Class" and k ~= "Parent" then p[k] = v end end
  p.Anchored = true
  p.Parent = props.Parent or workspace
  return p
end
-- A platform whose top is at y = top.
local function platform(name, size, x, z, top, color, material)
  return part({ Name = name, Size = size, Position = Vector3.new(x, top - size.Y / 2, z), Color = color, Material = material or Enum.Material.Plastic })
end

local function kills(p)
  p.Touched:Connect(function(hit)
    local h = hit.Parent:FindFirstChild("Humanoid")
    if h and h.Health > 0 then h.Health = 0 end
  end)
end

local stageOf = {} -- player -> stage reached
local function checkpoint(stage, z)
  local cp = Instance.new("SpawnLocation")
  cp.Name = "Checkpoint" .. stage
  cp.Size = Vector3.new(8, 1, 8)
  cp.Position = Vector3.new(0, TOP - 0.5, z)
  cp.Orientation = Vector3.new(0, 180, 0) -- respawn facing along the course
  cp.Color = Color3.fromRGB(245, 205, 48)
  cp.Material = Enum.Material.SmoothPlastic
  cp.Anchored = true
  cp.Parent = workspace
  cp.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if player and (stageOf[player] or 0) < stage then
      stageOf[player] = stage
      player.RespawnLocation = cp
      print("stage", stage)
    end
  end)
  return cp
end

-- Lava under everything.
local lava = part({ Name = "Lava", Size = Vector3.new(400, 1, 400), Position = Vector3.new(0, -0.5, 120), Color = Color3.fromRGB(120, 28, 12), Material = Enum.Material.SmoothPlastic }) -- dark lava: its shadows show where you will land
kills(lava)

-- Start.
local start = Instance.new("SpawnLocation")
start.Name = "Start"
start.Size = Vector3.new(12, 1, 12)
start.Position = Vector3.new(0, TOP - 0.5, 0)
start.Orientation = Vector3.new(0, 180, 0)
start.Anchored = true
start.Material = Enum.Material.SmoothPlastic
start.Color = Color3.fromRGB(163, 162, 165)
start.Parent = workspace

local stone = Color3.fromRGB(99, 95, 98)
-- 1. Stepping stones (4-stud gaps).
for i, z in ipairs({ 12, 20, 28 }) do platform("Stone" .. i, Vector3.new(4, 1, 4), 0, z, TOP, stone) end
checkpoint(1, 38)

-- 2. Beams over the lava, offset so the second needs a side step.
platform("Beam1", Vector3.new(2, 1, 12), 0, 48, TOP, Color3.fromRGB(163, 162, 165))
platform("Beam2", Vector3.new(2, 1, 12), 3, 60, TOP, Color3.fromRGB(163, 162, 165))
local glow = platform("KillStrip", Vector3.new(1, 0.4, 10), -2.5, 48, TOP - 0.2, Color3.fromRGB(255, 0, 0), Enum.Material.Neon)
kills(glow)
checkpoint(2, 72)

-- 3. A wedge climb (slope faces -Z, toward the player; it starts at the
-- checkpoint's edge), a ledge at its top, then a jump down.
part({ Class = "WedgePart", Name = "Ramp", Size = Vector3.new(8, 6, 12), Position = Vector3.new(0, TOP + 3, 82), Color = Color3.fromRGB(75, 151, 75) })
platform("Ledge", Vector3.new(8, 1, 8), 0, 92, TOP + 6, Color3.fromRGB(75, 151, 75))
checkpoint(3, 106) -- an 8-stud jump down from the ledge (walking off falls short)

-- 4. Pillars: upright cylinders (the cylinder axis is X; turned 90 about Z).
for i, p in ipairs({ { -2, 118 }, { 2, 125 }, { 0, 132 } }) do
  part({ Name = "Pillar" .. i, Shape = Enum.PartType.Cylinder, Size = Vector3.new(TOP + 2, 4, 4), Orientation = Vector3.new(0, 0, 90),
    Position = Vector3.new(p[1], TOP / 2 - 1, p[2]), Color = Color3.fromRGB(13, 105, 172) })
end
checkpoint(4, 142)

-- 5. Platforms that vanish 0.6 s after you touch them and come back 3 s later.
for i, z in ipairs({ 152, 159, 166, 173 }) do
  local p = platform("Fade" .. i, Vector3.new(5, 1, 5), 0, z, TOP, Color3.fromRGB(170, 85, 255), Enum.Material.SmoothPlastic)
  local busy = false
  p.Touched:Connect(function(hit)
    if busy or not hit.Parent:FindFirstChild("Humanoid") then return end
    busy = true
    task.wait(0.6)
    p.Transparency = 0.8
    p.CanCollide = false
    task.wait(3)
    p.Transparency = 0
    p.CanCollide = true
    busy = false
  end)
end
checkpoint(5, 183)

-- 6. Stairs of 3-stud rises (too tall to walk: jump each), then the finish.
for i = 1, 4 do platform("Step" .. i, Vector3.new(6, 1, 4), 0, 186 + i * 6, TOP + i * 3, stone) end
local finish = platform("Finish", Vector3.new(12, 1, 12), 0, 222, TOP + 12, Color3.fromRGB(255, 176, 0), Enum.Material.Neon)
finish.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if player and stageOf[player] ~= "done" then
    stageOf[player] = "done"
    print("finished", player.Name)
  end
end)
