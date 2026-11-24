-- Bodies lab: the place chooses its players' body (web/datamodel.js, Bodies). A HumanoidDescription in
-- StarterPlayer is every player's: its BodyShape child (Claude Studio's own) the shape, its scales and
-- six body colours over it. Tested by test/scenarios/bodies.mjs.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0)
base.Anchored = true; base.Color = Color3.fromRGB(91, 93, 105); base.Material = Enum.Material.Concrete
base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 0); spawn.Anchored = true; spawn.Parent = workspace

local d = Instance.new("HumanoidDescription")
d.HeightScale = 1.15; d.WidthScale = 0.9; d.DepthScale = 1.05; d.HeadScale = 1.1
d.HeadColor = Color3.fromRGB(224, 172, 135)
d.TorsoColor = Color3.fromRGB(196, 64, 52)
d.LeftArmColor = Color3.fromRGB(224, 172, 135); d.RightArmColor = Color3.fromRGB(224, 172, 135)
d.LeftLegColor = Color3.fromRGB(38, 52, 94); d.RightLegColor = Color3.fromRGB(38, 52, 94)
local shape = Instance.new("BodyShape")
shape.LegLength = 2.7; shape.ShoulderWidth = 2.1; shape.ArmThickness = 0.6; shape.Roundness = 0.7; shape.Taper = 0.16
shape.Parent = d
d.Parent = game:GetService("StarterPlayer")
