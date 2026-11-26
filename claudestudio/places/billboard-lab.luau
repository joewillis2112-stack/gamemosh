-- Billboard lab: BillboardGuis (runtime/gui.js). A sign 4 x 1 studs over a post; a name tag in pixels on an NPC's
-- head; one behind a wall (AlwaysOnTop off: hidden while the wall is in the way); one far off (MaxDistance); one in
-- PlayerGui adorning a part. test/scenarios/billboards.mjs checks where and how big each draws.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 20); spawn.Anchored = true; spawn.Parent = workspace
local function part(name, size, pos)
  local p = Instance.new("Part"); p.Name = name; p.Size = size; p.CFrame = CFrame.new(pos); p.Anchored = true; p.Parent = workspace
  return p
end
local function board(parent, name, size, text)
  local b = Instance.new("BillboardGui"); b.Name = name; b.Size = size
  local t = Instance.new("TextLabel"); t.Name = "Label"; t.Size = UDim2.fromScale(1, 1); t.Text = text; t.TextScaled = true
  t.BackgroundColor3 = Color3.fromRGB(30, 34, 44); t.TextColor3 = Color3.fromRGB(255, 220, 120); t.Parent = b
  b.Parent = parent
  return b
end
local post = part("Post", Vector3.new(1, 6, 1), Vector3.new(0, 3, 0))
local sign = board(post, "Sign", UDim2.fromScale(4, 1), "SHOP"); sign.StudsOffset = Vector3.new(0, 4, 0)
local hidden = part("Hidden", Vector3.new(1, 4, 1), Vector3.new(12, 2, -14))
local hb = board(hidden, "Behind", UDim2.fromScale(3, 1), "BEHIND")
part("Wall", Vector3.new(10, 12, 1), Vector3.new(12, 6, -8))
local far = part("Far", Vector3.new(1, 4, 1), Vector3.new(-14, 2, -60))
local fb = board(far, "Faraway", UDim2.fromOffset(100, 30), "FAR"); fb.MaxDistance = 40; fb.AlwaysOnTop = true
local pad = part("Pad", Vector3.new(2, 1, 2), Vector3.new(-8, 0.5, -4))
local d = Instance.new("HumanoidDescription")
d.HeadColor = Color3.fromRGB(240, 200, 170); d.LeftArmColor = d.HeadColor; d.RightArmColor = d.HeadColor
d.TorsoColor = Color3.fromRGB(180, 60, 60); d.LeftLegColor = Color3.fromRGB(40, 40, 50); d.RightLegColor = d.LeftLegColor
Instance.new("BodyShape").Parent = d
local npc = game:GetService("Players"):CreateHumanoidModelFromDescriptionAsync(d, Enum.HumanoidRigType.R15)
npc.Name = "Merchant"
npc:PivotTo(CFrame.new(6, npc.HumanoidRootPart.Position.Y, 0))
npc.Parent = workspace
game:GetService("Players").PlayerAdded:Connect(function(pl)
  local pg = pl:WaitForChild("PlayerGui")
  local mine = board(pg, "Mine", UDim2.fromOffset(80, 24), "MINE"); mine.Adornee = workspace.Pad; mine.StudsOffset = Vector3.new(0, 2, 0); mine.AlwaysOnTop = true
  mine.ResetOnSpawn = false
end)
