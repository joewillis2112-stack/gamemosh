-- TextBox lab: a name field, a code field that clears on focus, a notes box (MultiLine), a locked
-- box (TextEditable off) and a button that focuses the code field, built from StarterGui by a
-- LocalScript the way creators build a form (test/scenarios/gui-textbox.mjs).
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace

local gui = Instance.new("ScreenGui") gui.Name = "Form" gui.Parent = game:GetService("StarterGui")
local build = Instance.new("LocalScript") build.Name = "BuildForm" build.Parent = gui
build.Source = [[
local gui = script.Parent
local panel = Instance.new("Frame")
panel.Name = "Panel" panel.Position = UDim2.fromOffset(16, 16) panel.Size = UDim2.fromOffset(300, 330)
panel.BackgroundColor3 = Color3.fromRGB(28, 30, 40) panel.BorderSizePixel = 0 panel.Parent = gui
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 12)

local function field(name, y, h)
  local b = Instance.new("TextBox")
  b.Name = name b.Position = UDim2.fromOffset(16, y) b.Size = UDim2.fromOffset(268, h or 44)
  b.BackgroundColor3 = Color3.fromRGB(245, 246, 250) b.BorderSizePixel = 0
  b.Font = Enum.Font.SourceSans b.TextSize = 22 b.TextColor3 = Color3.fromRGB(20, 22, 30)
  b.TextXAlignment = Enum.TextXAlignment.Left
  Instance.new("UICorner", b).CornerRadius = UDim.new(0, 8)
  local pad = Instance.new("UIPadding", b) pad.PaddingLeft = UDim.new(0, 10) pad.PaddingRight = UDim.new(0, 10)
  b.Parent = panel
  b.Focused:Connect(function() print("focused", name) end)
  b.FocusLost:Connect(function(enter) print("lost", name, enter, b.Text) end)
  return b
end

-- A name field: keeps what's typed when focused again, shows a hint while empty.
local name = field("Name", 16)
name.ClearTextOnFocus = false name.Text = "" name.PlaceholderText = "Your name" name.PlaceholderColor3 = Color3.fromRGB(150, 150, 165)
local edits = 0
name:GetPropertyChangedSignal("Text"):Connect(function() edits += 1 end)
-- A code field: clears when focused (Roblox's default), centred digits.
local code = field("Code", 72) code.Text = "1234" code.TextXAlignment = Enum.TextXAlignment.Center code.Font = Enum.Font.RobotoMono
-- Notes: several lines, top-left.
local notes = field("Notes", 128, 90) notes.MultiLine = true notes.ClearTextOnFocus = false notes.Text = "" notes.PlaceholderText = "Notes"
notes.TextYAlignment = Enum.TextYAlignment.Top notes.TextWrapped = true notes.TextSize = 18
-- A box the player can focus but not change.
local locked = field("Locked", 230) locked.TextEditable = false locked.ClearTextOnFocus = false locked.Text = "Read only"

-- A button that puts the cursor in the code field, and a report of what the script sees.
local go = Instance.new("TextButton")
go.Name = "Go" go.Position = UDim2.fromOffset(16, 284) go.Size = UDim2.fromOffset(268, 36) go.BorderSizePixel = 0
go.BackgroundColor3 = Color3.fromRGB(46, 160, 90) go.Font = Enum.Font.GothamBold go.TextSize = 18 go.TextColor3 = Color3.new(1, 1, 1)
go.Text = "Enter code" go.Parent = panel
Instance.new("UICorner", go).CornerRadius = UDim.new(0, 8)
go.Activated:Connect(function() code:CaptureFocus() end)
_G.report = function() print("report", name.Text, edits, name:IsFocused(), code:IsFocused()) end
print("form built")
]]
