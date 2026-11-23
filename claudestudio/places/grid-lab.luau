-- UIGridLayout lab: an inventory grid in a ScrollingFrame that grows to it, and small grids that
-- show FillDirection, FillDirectionMaxCells, StartCorner, alignment, sorting and constraints
-- (test/scenarios/gui-grid.mjs).
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace

local gui = Instance.new("ScreenGui") gui.Name = "Bag" gui.Parent = game:GetService("StarterGui")
local build = Instance.new("LocalScript") build.Name = "BuildBag" build.Parent = gui
build.Source = [[
local gui = script.Parent
local function cell(parent, name, color, order)
  local c = Instance.new("TextLabel")
  c.Name = name c.BackgroundColor3 = color c.BorderSizePixel = 0 c.Text = name:gsub("%a+", "") c.TextSize = 16
  c.Font = Enum.Font.GothamBold c.TextColor3 = Color3.new(1, 1, 1) c.LayoutOrder = order or 0
  c.Size = UDim2.fromOffset(10, 10) -- the grid's cell size wins over this
  Instance.new("UICorner", c).CornerRadius = UDim.new(0, 6)
  c.Parent = parent
  return c
end

-- The inventory: 24 slots of 64 px, 8 apart, newest first (LayoutOrder), in a list that grows to fit.
local bag = Instance.new("ScrollingFrame")
bag.Name = "Inventory" bag.Position = UDim2.fromOffset(16, 16) bag.Size = UDim2.fromOffset(316, 260)
bag.CanvasSize = UDim2.new() bag.AutomaticCanvasSize = Enum.AutomaticSize.Y bag.ScrollBarThickness = 8
bag.VerticalScrollBarInset = Enum.ScrollBarInset.ScrollBar bag.BackgroundColor3 = Color3.fromRGB(34, 38, 52) bag.BorderSizePixel = 0 bag.Parent = gui
local pad = Instance.new("UIPadding", bag)
pad.PaddingTop = UDim.new(0, 8) pad.PaddingBottom = UDim.new(0, 8) pad.PaddingLeft = UDim.new(0, 8) pad.PaddingRight = UDim.new(0, 8)
local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.fromOffset(64, 64) grid.CellPadding = UDim2.fromOffset(8, 8) grid.SortOrder = Enum.SortOrder.LayoutOrder grid.Parent = bag
for i = 1, 24 do cell(bag, string.format("Slot%02d", i), Color3.fromHSV((i * 0.13) % 1, 0.55, 0.85), 100 - i) end
print("grid", grid.AbsoluteContentSize.X, grid.AbsoluteContentSize.Y, grid.AbsoluteCellCount.X, grid.AbsoluteCellCount.Y)

-- Columns of at most 3 (Vertical, FillDirectionMaxCells 3), sorted by Name.
local cols = Instance.new("Frame")
cols.Name = "Columns" cols.Position = UDim2.fromOffset(16, 290) cols.Size = UDim2.fromOffset(150, 140) -- room for 4 a column: the 3 is the limit
cols.BackgroundColor3 = Color3.fromRGB(230, 230, 236) cols.BorderSizePixel = 0 cols.Parent = gui
local g2 = Instance.new("UIGridLayout", cols)
g2.FillDirection = Enum.FillDirection.Vertical g2.FillDirectionMaxCells = 3 g2.CellSize = UDim2.fromOffset(30, 30) g2.CellPadding = UDim2.fromOffset(4, 4)
for i, n in ipairs({ "C7", "C3", "C1", "C5", "C2", "C6", "C4" }) do cell(cols, n, Color3.fromRGB(60, 130, 220)) end

-- From the bottom right, centred cells sized by scale (a third of the box), with a padding of 2%.
local corner = Instance.new("Frame")
corner.Name = "Corner" corner.Position = UDim2.fromOffset(180, 290) corner.Size = UDim2.fromOffset(150, 120)
corner.BackgroundColor3 = Color3.fromRGB(230, 230, 236) corner.BorderSizePixel = 0 corner.Parent = gui
local g3 = Instance.new("UIGridLayout", corner)
g3.StartCorner = Enum.StartCorner.BottomRight g3.CellSize = UDim2.fromScale(0.3, 0.3) g3.CellPadding = UDim2.fromScale(0.02, 0.02)
g3.HorizontalAlignment = Enum.HorizontalAlignment.Center g3.VerticalAlignment = Enum.VerticalAlignment.Center
for i = 1, 4 do cell(corner, "K" .. i, Color3.fromRGB(220, 90, 60)) end
-- A cell whose own constraint sizes it: twice as wide as tall, inside its cell.
local wide = cell(corner, "K5", Color3.fromRGB(240, 170, 40))
local ar = Instance.new("UIAspectRatioConstraint", wide) ar.AspectRatio = 2

-- A panel that follows its grid's AbsoluteContentSize, as creators size containers to a grid.
local panel = Instance.new("Frame")
panel.Name = "Panel" panel.Position = UDim2.fromOffset(16, 444) panel.Size = UDim2.fromOffset(130, 10)
panel.BackgroundColor3 = Color3.fromRGB(20, 20, 24) panel.BorderSizePixel = 0 panel.Parent = gui
local g4 = Instance.new("UIGridLayout", panel) g4.CellSize = UDim2.fromOffset(40, 40) g4.CellPadding = UDim2.fromOffset(5, 5)
g4:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
  panel.Size = UDim2.fromOffset(130, g4.AbsoluteContentSize.Y)
  print("panel", g4.AbsoluteContentSize.Y)
end)
for i = 1, 5 do cell(panel, "P" .. i, Color3.fromRGB(90, 180, 110)) end
print("bag built")
]]
