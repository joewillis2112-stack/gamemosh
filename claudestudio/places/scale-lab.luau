-- UIScale and UISizeConstraint lab: a card scaled 1.5x about its centre (anchor 0.5, 0.5), a box at
-- half size from its top left, a bar held to 250 px, a box held to at least 60 x 30, and a second
-- ScreenGui scaled to half with a frame pinned to its bottom-right corner (test/scenarios/gui-scale.mjs).
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace

local gui = Instance.new("ScreenGui") gui.Name = "Scales" gui.Parent = game:GetService("StarterGui")
local build = Instance.new("LocalScript") build.Name = "BuildScales" build.Parent = gui
build.Source = [[
local gui = script.Parent
-- A card at 1.5x, about its centre.
local card = Instance.new("Frame")
card.Name = "Card" card.AnchorPoint = Vector2.new(0.5, 0.5) card.Position = UDim2.fromOffset(180, 120) card.Size = UDim2.fromOffset(200, 100)
card.BackgroundColor3 = Color3.fromRGB(250, 245, 235) card.BorderSizePixel = 0 card.Parent = gui
Instance.new("UICorner", card).CornerRadius = UDim.new(0, 10)
Instance.new("UIScale", card).Scale = 1.5
local badge = Instance.new("Frame")
badge.Name = "Badge" badge.Position = UDim2.fromOffset(10, 10) badge.Size = UDim2.new(0.5, 0, 0, 20) badge.BorderSizePixel = 0
badge.BackgroundColor3 = Color3.fromRGB(230, 80, 60) badge.Parent = card
local title = Instance.new("TextLabel")
title.Name = "CardTitle" title.Position = UDim2.fromOffset(10, 40) title.Size = UDim2.fromOffset(180, 40) title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamBold title.TextSize = 20 title.TextColor3 = Color3.fromRGB(30, 30, 40) title.Text = "Scaled 1.5x" title.Parent = card

-- Half size, from the top left (anchor 0, 0).
local small = Instance.new("Frame")
small.Name = "Small" small.Position = UDim2.fromOffset(30, 220) small.Size = UDim2.fromOffset(100, 40)
small.BackgroundColor3 = Color3.fromRGB(60, 130, 220) small.BorderSizePixel = 0 small.Parent = gui
Instance.new("UIScale", small).Scale = 0.5

-- A full-width bar held to 250 px, and a tiny box held to at least 60 x 30.
local wide = Instance.new("Frame")
wide.Name = "Wide" wide.Position = UDim2.fromOffset(30, 280) wide.Size = UDim2.new(1, 0, 0, 30)
wide.BackgroundColor3 = Color3.fromRGB(46, 160, 90) wide.BorderSizePixel = 0 wide.Parent = gui
local c1 = Instance.new("UISizeConstraint", wide) c1.MaxSize = Vector2.new(250, math.huge)
local tiny = Instance.new("Frame")
tiny.Name = "Tiny" tiny.Position = UDim2.fromOffset(30, 320) tiny.Size = UDim2.fromOffset(10, 10)
tiny.BackgroundColor3 = Color3.fromRGB(240, 180, 40) tiny.BorderSizePixel = 0 tiny.Parent = gui
local c2 = Instance.new("UISizeConstraint", tiny) c2.MinSize = Vector2.new(60, 30)
print("scales built", c1.MaxSize, c2.MinSize, c2.MaxSize)

-- A second ScreenGui at half scale: a frame 10 px in from the bottom-right corner, 100 x 100.
local half = Instance.new("ScreenGui") half.Name = "Half" half.Parent = gui.Parent
Instance.new("UIScale", half).Scale = 0.5
local corner = Instance.new("Frame")
corner.Name = "Corner" corner.AnchorPoint = Vector2.new(1, 1) corner.Position = UDim2.new(1, -10, 1, -10) corner.Size = UDim2.fromOffset(100, 100)
corner.BackgroundColor3 = Color3.fromRGB(150, 60, 200) corner.BorderSizePixel = 0 corner.Parent = half
]]
