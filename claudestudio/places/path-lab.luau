-- Path lab: PathfindingService (web/pathfinding.js; mashup-research/ROBLOX_PATHFINDING_2026-11-25.md). A walker NPC,
-- a wall between it and a ledge 4 studs high, and the goal on the ledge. test/scenarios/pathfinding.mjs runs Roblox's
-- usual follow-the-waypoints script on it.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(-40, 0.5, 40); spawn.Anchored = true; spawn.Parent = workspace
local function block(name, size, pos, color)
  local p = Instance.new("Part"); p.Name = name; p.Size = size; p.CFrame = CFrame.new(pos); p.Anchored = true
  p.Color = color or Color3.fromRGB(120, 124, 136); p.Parent = workspace
  return p
end
block("Wall", Vector3.new(2, 10, 30), Vector3.new(10, 5, 0))
block("Ledge", Vector3.new(16, 4, 16), Vector3.new(34, 2, 0), Color3.fromRGB(150, 110, 80))
local goal = block("Goal", Vector3.new(2, 0.2, 2), Vector3.new(36, 4.1, 0), Color3.fromRGB(80, 200, 120)); goal.CanCollide = false
local d = Instance.new("HumanoidDescription")
d.HeadColor = Color3.fromRGB(240, 200, 170); d.LeftArmColor = d.HeadColor; d.RightArmColor = d.HeadColor
d.TorsoColor = Color3.fromRGB(60, 120, 200); d.LeftLegColor = Color3.fromRGB(40, 40, 50); d.RightLegColor = d.LeftLegColor
Instance.new("BodyShape").Parent = d
local npc = game:GetService("Players"):CreateHumanoidModelFromDescriptionAsync(d, Enum.HumanoidRigType.R15)
npc.Name = "Seeker"
npc:PivotTo(CFrame.new(-6, npc.HumanoidRootPart.Position.Y, 0))
npc.Parent = workspace
