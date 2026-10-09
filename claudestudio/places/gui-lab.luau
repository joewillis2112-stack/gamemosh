-- GUI lab: a HUD built the way creators build one, from StarterGui with a
-- LocalScript, to judge layout, text and buttons.
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace

local hud = Instance.new("ScreenGui") hud.Name = "Hud" hud.Parent = game:GetService("StarterGui")
local build = Instance.new("LocalScript") build.Name = "BuildHud" build.Parent = hud
build.Source = [[
local gui = script.Parent

-- A stage counter, top left under the title (clear of it on a portrait phone): rounded, translucent, outlined text.
local stage = Instance.new("Frame")
stage.Name = "Stage" stage.Size = UDim2.fromOffset(180, 56) stage.Position = UDim2.fromOffset(16, 120)
stage.BackgroundColor3 = Color3.fromRGB(20, 22, 30) stage.BackgroundTransparency = 0.25 stage.BorderSizePixel = 0 stage.Parent = gui
Instance.new("UICorner", stage).CornerRadius = UDim.new(0, 12)
local label = Instance.new("TextLabel")
label.Name = "Label" label.Size = UDim2.fromScale(1, 1) label.BackgroundTransparency = 1
label.Font = Enum.Font.GothamBold label.TextSize = 26 label.TextColor3 = Color3.new(1, 1, 1) label.Text = "Stage 3" label.Parent = stage
local outline = Instance.new("UIStroke", label) outline.Thickness = 2 outline.Color = Color3.fromRGB(0, 0, 0) outline.Transparency = 0.4

-- A centred bar 20 px narrower than half the screen, 10 px under the inset.
local bar = Instance.new("Frame")
bar.Name = "Bar" bar.AnchorPoint = Vector2.new(0.5, 0) bar.Position = UDim2.new(0.5, 0, 0, 10) bar.Size = UDim2.new(0.5, -20, 0, 100)
bar.BackgroundTransparency = 1 bar.Parent = gui
local title = Instance.new("TextLabel")
title.Name = "Title" title.Size = UDim2.fromScale(1, 1) title.BackgroundTransparency = 1 title.TextScaled = true
title.Font = Enum.Font.FredokaOne title.TextColor3 = Color3.fromRGB(255, 214, 64) title.Text = "LAVA TOWER" title.Parent = bar
local ts = Instance.new("UIStroke", title) ts.Thickness = 3 ts.Color = Color3.fromRGB(120, 40, 0)

-- A button, bottom centre, above the mobile jump button's row, that counts its clicks.
local btn = Instance.new("TextButton")
btn.Name = "Boost" btn.AnchorPoint = Vector2.new(0.5, 1) btn.Position = UDim2.new(0.5, 0, 1, -100) btn.Size = UDim2.fromOffset(220, 60)
btn.BackgroundColor3 = Color3.fromRGB(46, 204, 113) btn.Font = Enum.Font.GothamBold btn.TextSize = 24 btn.TextColor3 = Color3.new(1, 1, 1)
btn.Text = "Jump Boost" btn.BorderSizePixel = 0 btn.Parent = gui
Instance.new("UICorner", btn).CornerRadius = UDim.new(0.5, 0)
local bs = Instance.new("UIStroke", btn) bs.ApplyStrokeMode = Enum.ApplyStrokeMode.Border bs.Thickness = 3 bs.Color = Color3.fromRGB(20, 120, 60)
local clicks = 0
btn.Activated:Connect(function() clicks += 1 label.Text = "Boosts: " .. clicks print("activated", clicks) end)

-- A column of slots, right edge, laid out by a UIListLayout with padding.
local col = Instance.new("Frame")
col.Name = "Column" col.AnchorPoint = Vector2.new(1, 0.5) col.Position = UDim2.new(1, -16, 0.5, 0) col.Size = UDim2.fromOffset(64, 232)
col.BackgroundTransparency = 1 col.Parent = gui
local layout = Instance.new("UIListLayout", col) layout.Padding = UDim.new(0, 8) layout.SortOrder = Enum.SortOrder.LayoutOrder
for i, c in ipairs({ Color3.fromRGB(231, 76, 60), Color3.fromRGB(52, 152, 219), Color3.fromRGB(241, 196, 15) }) do
  local slot = Instance.new("TextLabel")
  slot.Name = "Slot" .. i slot.LayoutOrder = 4 - i slot.Size = UDim2.fromOffset(64, 64) slot.BackgroundColor3 = c slot.BorderSizePixel = 0
  slot.Font = Enum.Font.GothamBlack slot.TextSize = 28 slot.TextColor3 = Color3.new(1, 1, 1) slot.Text = tostring(i) slot.Parent = col
  Instance.new("UICorner", slot)
end

-- Roblox's defaults: Instance.new with only a size.
local plain = Instance.new("TextLabel") plain.Name = "Plain" plain.Size = UDim2.fromOffset(120, 40) plain.Position = UDim2.new(0, 16, 1, -64) plain.Parent = gui

-- Rich text.
local rich = Instance.new("TextLabel") rich.Name = "Rich" rich.RichText = true rich.BackgroundTransparency = 1
rich.Size = UDim2.fromOffset(300, 30) rich.Position = UDim2.new(0, 16, 0, 188) rich.TextXAlignment = Enum.TextXAlignment.Left
rich.Font = Enum.Font.SourceSans rich.TextSize = 22 rich.TextColor3 = Color3.new(1, 1, 1)
rich.Text = 'Coins: <b><font color="#FFD700">1,250</font></b> <i>(x2)</i>' rich.Parent = gui
print("hud built")
]]

-- A second ScreenGui that ignores the inset: a thin banner along the very top.
local top = Instance.new("ScreenGui") top.Name = "Banner" top.IgnoreGuiInset = true top.DisplayOrder = 5 top.Parent = game:GetService("StarterGui")
local strip = Instance.new("Frame") strip.Name = "Strip" strip.Size = UDim2.new(1, 0, 0, 4) strip.BackgroundColor3 = Color3.fromRGB(255, 214, 64) strip.BorderSizePixel = 0 strip.Parent = top
