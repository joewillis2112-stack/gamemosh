-- Leaderstats lab: the player list, fed the way Roblox creators feed it, by a
-- server Script that gives each player a "leaderstats" folder of values.
-- Three columns test Roblox's ordering: Stage is made first, Coins has
-- Priority 5, and Wins (made last) is marked IsPrimary, so the list reads
-- Wins, Coins, Stage. A pad raises Stage once per touch.
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace
local pad = Instance.new("Part")
pad.Name = "StagePad" pad.Anchored = true pad.Size = Vector3.new(6, 1, 6) pad.Position = Vector3.new(0, 0.5, -16)
pad.Color = Color3.fromRGB(46, 204, 113) pad.Material = Enum.Material.Neon pad.Parent = workspace

-- The player list is opt-in in Claude Studio.
game:GetService("StarterGui"):SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, true)

local stats = Instance.new("Script") stats.Name = "Leaderstats" stats.Parent = game:GetService("ServerScriptService")
stats.Source = [[
local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
  local leaderstats = Instance.new("Folder")
  leaderstats.Name = "leaderstats"
  leaderstats.Parent = player

  local stage = Instance.new("IntValue")
  stage.Name = "Stage" stage.Value = 1 stage.Parent = leaderstats

  local coins = Instance.new("IntValue")
  coins.Name = "Coins" coins.Value = 1250
  local priority = Instance.new("NumberValue") priority.Name = "Priority" priority.Value = 5 priority.Parent = coins
  coins.Parent = leaderstats

  local wins = Instance.new("IntValue")
  wins.Name = "Wins" wins.Value = 3
  local primary = Instance.new("BoolValue") primary.Name = "IsPrimary" primary.Value = true primary.Parent = wins
  wins.Parent = leaderstats
  print("leaderstats made")
end)

-- The stage pad: one stage per visit (a cooldown, the usual debounce).
local cooldown = {}
workspace.StagePad.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if player and not cooldown[player.UserId] then
    cooldown[player.UserId] = true
    player.leaderstats.Stage.Value += 1
    print("stage", player.leaderstats.Stage.Value)
    task.wait(2)
    cooldown[player.UserId] = nil
  end
end)
]]
