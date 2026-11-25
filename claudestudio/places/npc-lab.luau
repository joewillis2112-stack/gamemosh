-- NPC lab: walking humanoids (runtime/npcs.js, runtime/walk.js; mashup-research/ROBLOX_HUMANOID_MOVETO_2026-11-24.md).
-- A walker made by Players:CreateHumanoidModelFromDescriptionAsync (unanchored: a character), a wall to get
-- stuck on, and a moving pad for MoveTo-with-a-part. test/scenarios/npcs.mjs drives them.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(512, 4, 512); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(-30, 0.5, 0); spawn.Anchored = true; spawn.Parent = workspace
local wall = Instance.new("Part")
wall.Name = "Wall"; wall.Size = Vector3.new(40, 12, 2); wall.CFrame = CFrame.new(0, 6, 60); wall.Anchored = true; wall.Parent = workspace
local pad = Instance.new("Part")
pad.Name = "Pad"; pad.Size = Vector3.new(4, 0.4, 4); pad.CFrame = CFrame.new(30, 0.2, 0); pad.Anchored = true; pad.CanCollide = false; pad.Parent = workspace
local mat = Instance.new("Part")
mat.Name = "Mat"; mat.Size = Vector3.new(6, 0.2, 6); mat.CFrame = CFrame.new(0, 0.1, -12); mat.Anchored = true; mat.CanCollide = false; mat.Parent = workspace
mat.Touched:Connect(function(hit) print("mat touched", hit.Name, hit.Parent.Name) end)
mat.TouchEnded:Connect(function(hit) print("mat ended", hit.Name) end)
local d = Instance.new("HumanoidDescription")
d.HeadColor = Color3.fromRGB(240, 200, 170); d.LeftArmColor = d.HeadColor; d.RightArmColor = d.HeadColor
d.TorsoColor = Color3.fromRGB(200, 120, 40); d.LeftLegColor = Color3.fromRGB(50, 50, 60); d.RightLegColor = d.LeftLegColor
Instance.new("BodyShape").Parent = d
local npc = game:GetService("Players"):CreateHumanoidModelFromDescriptionAsync(d, Enum.HumanoidRigType.R15)
npc.Name = "Walker"
npc:PivotTo(CFrame.new(0, npc.HumanoidRootPart.Position.Y, 0))
npc.Parent = workspace
