-- IK lab: IKControls on the player's R15 body (runtime/ik.js; mashup-research/ROBLOX_IKCONTROL_2026-11-24.md).
-- The place's body is our studio body; targets are anchored parts the scenario moves. The controls are
-- made when the character arrives, under its Humanoid, all disabled; test/scenarios/ik.mjs turns them on.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 0); spawn.Anchored = true; spawn.Parent = workspace
local d = Instance.new("HumanoidDescription")
for _, g in ipairs({ "Head", "LeftArm", "RightArm" }) do d[g .. "Color"] = Color3.fromRGB(230, 190, 160) end
d.TorsoColor = Color3.fromRGB(70, 110, 180); d.LeftLegColor = Color3.fromRGB(60, 60, 70); d.RightLegColor = Color3.fromRGB(60, 60, 70)
Instance.new("BodyShape").Parent = d
d.Parent = game:GetService("StarterPlayer")
local function target(name, pos)
  local p = Instance.new("Part"); p.Name = name; p.Size = Vector3.new(0.4, 0.4, 0.4); p.Anchored = true; p.CanCollide = false
  p.Color = Color3.fromRGB(255, 170, 0); p.CFrame = CFrame.new(pos); p.Parent = workspace
  return p
end
local hand = target("HandTarget", Vector3.new(2, 4, -2))
local look = target("LookTarget", Vector3.new(-6, 8, -10))
local pole = target("PoleTarget", Vector3.new(2, 12, 0))
game:GetService("Players").PlayerAdded:Connect(function(pl)
  pl.CharacterAdded:Connect(function(ch)
    local hum = ch:WaitForChild("Humanoid")
    local function ik(name, kind, root, eff, tgt)
      local c = Instance.new("IKControl"); c.Name = name; c.Type = kind; c.ChainRoot = ch:WaitForChild(root); c.EndEffector = ch:WaitForChild(eff)
      c.Target = tgt; c.Enabled = false; c.SmoothTime = 0; c.Parent = hum
      return c
    end
    ik("Reach", Enum.IKControlType.Position, "RightUpperArm", "RightHand", hand)
    ik("Grip", Enum.IKControlType.Transform, "RightUpperArm", "RightHand", hand)
    ik("Look", Enum.IKControlType.LookAt, "UpperTorso", "Head", look)
    ik("Step", Enum.IKControlType.Position, "LeftUpperLeg", "LeftFoot", hand)
    print("ik ready")
  end)
end)
