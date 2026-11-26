-- SurfaceGui lab: SurfaceGuis (runtime/gui.js, runtime/surfacegui.js, runtime/surfaces.js). A cube with a pattern on
-- every face (its left half red, its right half blue, a green band along its top: which way round and which way up
-- it lies shows), a wedge with one on its slope, a board of text, a board behind a wall, a panel whose SurfaceGui
-- lives in PlayerGui (a button that counts presses), and a strip sized in PixelsPerStud.
-- test/scenarios/surfaceguis.mjs looks at each from a scripted camera.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 40); spawn.Anchored = true; spawn.Parent = workspace
local function part(name, size, cf, class)
  local p = Instance.new(class or "Part"); p.Name = name; p.Size = size; p.CFrame = cf; p.Anchored = true
  p.Color = Color3.fromRGB(128, 128, 128); p.Parent = workspace
  return p
end
local function box(sg, name, pos, size, c)
  local f = Instance.new("Frame"); f.Name = name; f.Position = pos; f.Size = size; f.BackgroundColor3 = c; f.BorderSizePixel = 0; f.Parent = sg
  return f
end
local function pattern(sg)
  box(sg, "Left", UDim2.fromScale(0, 0), UDim2.fromScale(0.5, 1), Color3.fromRGB(230, 30, 30))
  box(sg, "Right", UDim2.fromScale(0.5, 0), UDim2.fromScale(0.5, 1), Color3.fromRGB(30, 50, 230))
  box(sg, "Band", UDim2.fromScale(0, 0), UDim2.fromScale(1, 0.2), Color3.fromRGB(30, 210, 50))
end
local function surface(parent, name, face)
  local s = Instance.new("SurfaceGui"); s.Name = name; s.Face = face; s.Parent = parent
  return s
end
-- The cube, high enough to look at its bottom from below.
local cube = part("Cube", Vector3.new(6, 6, 6), CFrame.new(0, 20, 0))
for _, f in ipairs({ "Front", "Back", "Left", "Right", "Top", "Bottom" }) do pattern(surface(cube, f, Enum.NormalId[f])) end
-- A wedge: its Front is the slope.
local wedge = part("Wedge", Vector3.new(6, 4, 8), CFrame.new(-20, 2, 0), "WedgePart")
pattern(surface(wedge, "Slope", Enum.NormalId.Front))
-- A board of text: white letters on black, facing +Z.
local board = part("Board", Vector3.new(8, 6, 1), CFrame.new(20, 5, 0))
local bs = surface(board, "Screen", Enum.NormalId.Back)
local l = Instance.new("TextLabel"); l.Name = "Label"; l.Size = UDim2.fromScale(1, 1); l.BackgroundColor3 = Color3.new(0, 0, 0); l.BorderSizePixel = 0
l.TextColor3 = Color3.new(1, 1, 1); l.Text = "Hello, SurfaceGui"; l.TextSize = 90; l.TextWrapped = true; l.Font = Enum.Font.SourceSansBold; l.Parent = bs
-- A board behind a wall that hides its left half.
local hid = part("Hidden", Vector3.new(8, 6, 1), CFrame.new(40, 5, 0))
pattern(surface(hid, "Behind", Enum.NormalId.Back))
part("Wall", Vector3.new(4, 10, 1), CFrame.new(38, 5, 6)).Color = Color3.fromRGB(70, 70, 80)
-- A strip sized in studs: 10 x 2 at 50 pixels a stud.
local strip = part("Strip", Vector3.new(10, 2, 1), CFrame.new(0, 2, -20))
local ss = surface(strip, "Sized", Enum.NormalId.Back); ss.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
pattern(ss)
-- The panel: its SurfaceGui is in PlayerGui (where buttons take clicks), adorning it.
local panel = part("Panel", Vector3.new(8, 6, 1), CFrame.new(-40, 5, 0))
_G.presses = 0
game:GetService("Players").PlayerAdded:Connect(function(pl)
  local pg = pl:WaitForChild("PlayerGui")
  local s = Instance.new("SurfaceGui"); s.Name = "Controls"; s.Face = Enum.NormalId.Back; s.Adornee = panel; s.ResetOnSpawn = false
  local b = Instance.new("TextButton"); b.Name = "Press"; b.Size = UDim2.fromScale(0.5, 1); b.Text = "PRESS"; b.TextScaled = true
  b.BackgroundColor3 = Color3.fromRGB(240, 200, 40); b.BorderSizePixel = 0; b.Parent = s
  b.MouseButton1Click:Connect(function() _G.presses += 1 end)
  s.Parent = pg
end)
