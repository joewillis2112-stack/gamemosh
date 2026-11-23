-- UIGradient lab: colour, transparency, rotation and offset on frames, a text gradient, a disabled
-- gradient, a gradient over an image, and a child the gradient leaves alone (test/scenarios/gui-gradient.mjs).
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace

local gui = Instance.new("ScreenGui") gui.Name = "Shine" gui.Parent = game:GetService("StarterGui")
local build = Instance.new("LocalScript") build.Name = "BuildShine" build.Parent = gui
build.Source = [[
local gui = script.Parent
local function frame(name, x, y, w, h, color)
  local f = Instance.new("Frame")
  f.Name = name f.Position = UDim2.fromOffset(x, y) f.Size = UDim2.fromOffset(w, h) f.BorderSizePixel = 0
  f.BackgroundColor3 = color or Color3.new(1, 1, 1) f.Parent = gui
  return f
end
local redBlue = ColorSequence.new(Color3.new(1, 0, 0), Color3.new(0, 0, 1))

-- Red to blue, left to right, on white: the gradient's own colours.
local bar = frame("Bar", 16, 16, 300, 40)
Instance.new("UIGradient", bar).Color = redBlue
-- White fading out to the right.
local fade = frame("Fade", 16, 66, 300, 40)
Instance.new("UIGradient", fade).Transparency = NumberSequence.new(0, 1)
-- Black at the top to white at the bottom (Rotation 90, clockwise from left to right).
local rot = frame("Rot", 16, 116, 120, 120)
local g3 = Instance.new("UIGradient", rot) g3.Color = ColorSequence.new(Color3.new(0, 0, 0), Color3.new(1, 1, 1)) g3.Rotation = 90
-- Moved right by half its width: the left half is all red.
local shifted = frame("Shifted", 146, 116, 170, 40)
local g4 = Instance.new("UIGradient", shifted) g4.Color = redBlue g4.Offset = Vector2.new(0.5, 0)
-- On a coloured frame: the gradient multiplies it (yellow x red-to-blue: red to black).
local tinted = frame("Tinted", 146, 166, 170, 30, Color3.new(1, 1, 0))
Instance.new("UIGradient", tinted).Color = redBlue
-- Disabled: the plain background.
local off = frame("Off", 146, 206, 170, 30, Color3.fromRGB(40, 170, 90))
local g5 = Instance.new("UIGradient", off) g5.Color = redBlue g5.Enabled = false
-- A child keeps its own colour.
local parent = frame("Parent", 16, 246, 300, 50)
Instance.new("UIGradient", parent).Color = redBlue
local kid = frame("Kid", 0, 0, 40, 30, Color3.fromRGB(40, 170, 90)) kid.Position = UDim2.fromOffset(130, 10) kid.Parent = parent

-- 45 degrees on a box twice as wide as tall: in shares of the size, so it runs corner to corner.
local diag = frame("Diagonal", 146, 386, 120, 60)
local g6 = Instance.new("UIGradient", diag) g6.Color = redBlue g6.Rotation = 45

-- A title with yellow at the top running to red at the bottom.
local title = Instance.new("TextLabel")
title.Name = "Title" title.Position = UDim2.fromOffset(16, 306) title.Size = UDim2.fromOffset(300, 70) title.BackgroundTransparency = 1
title.Font = Enum.Font.LuckiestGuy title.TextSize = 64 title.Text = "LEVEL UP" title.TextColor3 = Color3.new(1, 1, 1) title.Parent = gui
local tg = Instance.new("UIGradient", title) tg.Color = ColorSequence.new(Color3.fromRGB(255, 230, 0), Color3.fromRGB(255, 40, 0)) tg.Rotation = 90
print("shine built")
]]
