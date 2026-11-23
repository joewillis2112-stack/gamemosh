-- Joints lab: welds, a WeldConstraint, a Motor6D hinge (web/assembly.js). Saved and loaded by the
-- place file test, so joints round-trip (Part0/Part1 references, C0, C1).
local function part(name, size, pos, anchored)
  local p = Instance.new("Part")
  p.Name = name; p.Size = size; p.CFrame = CFrame.new(pos); p.Anchored = anchored or false
  p.Parent = workspace
  return p
end
local base = part("Base", Vector3.new(4, 1, 4), Vector3.new(0, 0.5, 0), true)
local post = part("Post", Vector3.new(1, 6, 1), Vector3.new(0, 4, 0))
local w = Instance.new("Weld"); w.Part0 = base; w.Part1 = post; w.C0 = CFrame.new(0, 3.5, 0); w.Parent = base
local cap = part("Cap", Vector3.new(2, 1, 2), Vector3.new(0, 7.5, 0))
local wc = Instance.new("WeldConstraint"); wc.Part0 = post; wc.Part1 = cap; wc.Parent = post
local frame = part("Frame", Vector3.new(1, 8, 1), Vector3.new(10, 4, 0), true)
local door = part("Door", Vector3.new(4, 7, 0.5), Vector3.new(12.5, 4, 0))
local hinge = Instance.new("Motor6D"); hinge.Name = "Hinge"; hinge.Part0 = frame; hinge.Part1 = door
hinge.C0 = CFrame.new(0.5, 0, 0); hinge.C1 = CFrame.new(-2, 0, 0); hinge.Parent = frame
