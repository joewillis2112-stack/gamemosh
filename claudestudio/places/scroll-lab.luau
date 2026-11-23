-- ScrollingFrame lab: a shop list, a fixed-size canvas, a sideways strip and a default frame, built
-- from StarterGui by a LocalScript the way creators build them (test/scenarios/gui-scroll.mjs).
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace

local gui = Instance.new("ScreenGui") gui.Name = "Shop" gui.Parent = game:GetService("StarterGui")
local build = Instance.new("LocalScript") build.Name = "BuildShop" build.Parent = gui
build.Source = [[
local gui = script.Parent

-- A shop list: rows of buttons stacked by a UIListLayout; the canvas grows to fit them.
local list = Instance.new("ScrollingFrame")
list.Name = "List" list.Position = UDim2.fromOffset(16, 16) list.Size = UDim2.fromOffset(240, 240)
list.BackgroundColor3 = Color3.fromRGB(232, 234, 242) list.BorderSizePixel = 0
list.CanvasSize = UDim2.new(0, 0, 0, 0) list.AutomaticCanvasSize = Enum.AutomaticSize.Y
list.ScrollBarThickness = 8
list.VerticalScrollBarInset = Enum.ScrollBarInset.ScrollBar
list.Parent = gui
Instance.new("UICorner", list).CornerRadius = UDim.new(0, 10)
local pad = Instance.new("UIPadding", list)
pad.PaddingTop = UDim.new(0, 8) pad.PaddingBottom = UDim.new(0, 8) pad.PaddingLeft = UDim.new(0, 8) pad.PaddingRight = UDim.new(0, 8)
local layout = Instance.new("UIListLayout", list) layout.Padding = UDim.new(0, 6) layout.SortOrder = Enum.SortOrder.LayoutOrder
for i = 1, 20 do
  local row = Instance.new("TextButton")
  row.Name = "Item" .. i row.LayoutOrder = i row.Size = UDim2.new(1, 0, 0, 40) row.BorderSizePixel = 0
  row.BackgroundColor3 = i % 2 == 0 and Color3.fromRGB(52, 120, 220) or Color3.fromRGB(46, 160, 90)
  row.Font = Enum.Font.GothamBold row.TextSize = 18 row.TextColor3 = Color3.new(1, 1, 1) row.Text = "Item " .. i
  row.Parent = list
  Instance.new("UICorner", row).CornerRadius = UDim.new(0, 6)
  row.Activated:Connect(function() print("bought", i) end)
end
list:GetPropertyChangedSignal("CanvasPosition"):Connect(function() print("scrolled", list.CanvasPosition.Y) end)
print("content", layout.AbsoluteContentSize.X, layout.AbsoluteContentSize.Y)

-- A fixed canvas (CanvasSize in offset) that scrolls only up and down, with no elastic pull.
local fixed = Instance.new("ScrollingFrame")
fixed.Name = "Fixed" fixed.AnchorPoint = Vector2.new(1, 0) fixed.Position = UDim2.new(1, -16, 0, 16) fixed.Size = UDim2.fromOffset(110, 160)
fixed.CanvasSize = UDim2.fromOffset(0, 400) fixed.ScrollingDirection = Enum.ScrollingDirection.Y fixed.ElasticBehavior = Enum.ElasticBehavior.Never
fixed.BackgroundColor3 = Color3.fromRGB(240, 240, 235) fixed.BorderSizePixel = 0 fixed.Parent = gui
for i = 0, 3 do
  local band = Instance.new("Frame")
  band.Name = "Band" .. i band.Position = UDim2.fromOffset(0, i * 100) band.Size = UDim2.new(1, 0, 0, 100) band.BorderSizePixel = 0
  band.BackgroundColor3 = Color3.fromHSV(i / 4, 0.6, 0.9) band.Parent = fixed
end

-- A sideways strip: X only, canvas three windows wide (scale).
local strip = Instance.new("ScrollingFrame")
strip.Name = "Strip" strip.Position = UDim2.new(0, 16, 0, 340) strip.Size = UDim2.fromOffset(240, 70)
strip.CanvasSize = UDim2.fromScale(3, 0) strip.ScrollingDirection = Enum.ScrollingDirection.X
strip.ScrollBarThickness = 6 strip.ScrollBarImageColor3 = Color3.fromRGB(255, 120, 120) strip.BackgroundColor3 = Color3.fromRGB(60, 30, 70) strip.BorderSizePixel = 0 strip.Parent = gui
for i = 0, 2 do
  local card = Instance.new("TextLabel")
  card.Name = "Card" .. i card.Position = UDim2.fromScale(i / 3, 0) card.Size = UDim2.new(1 / 3, -8, 1, -6) card.BorderSizePixel = 0
  card.BackgroundColor3 = Color3.fromHSV(0.1 + i * 0.3, 0.5, 0.95) card.Text = "Card " .. (i + 1) card.TextSize = 20 card.Font = Enum.Font.FredokaOne
  card.Parent = strip
end

-- Roblox's defaults: Instance.new with only a size and a place.
local plain = Instance.new("ScrollingFrame") plain.Name = "Plain" plain.Position = UDim2.new(0, 16, 0, 422) plain.Size = UDim2.fromOffset(160, 90) plain.Parent = gui

-- The classic gotcha: a canvas as wide as the frame (scale 1) with a vertical bar and no inset also
-- scrolls sideways, by the bar's width.
local wide = Instance.new("ScrollingFrame") wide.Name = "Wide" wide.Position = UDim2.new(0, 190, 0, 422) wide.Size = UDim2.fromOffset(70, 90)
wide.CanvasSize = UDim2.fromScale(1, 2) wide.BackgroundColor3 = Color3.fromRGB(200, 90, 90) wide.Parent = gui
print("shop built")
]]
