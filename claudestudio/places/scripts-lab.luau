-- Scripts lab: where scripts live and when they run.
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(128, 4, 128) base.Position = Vector3.new(0, -2, 0) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(8, 1, 8) spawn.Position = Vector3.new(0, 0.5, 0) spawn.Parent = workspace
game:GetService("Players").RespawnTime = 1

local function ls(parent, name, source)
  local s = Instance.new("LocalScript") s.Name = name s.Source = source s.Parent = parent
end
local sp = game:GetService("StarterPlayer")
ls(sp.StarterPlayerScripts, "PlayerScript", 'print("player script in", script.Parent.ClassName)')
ls(sp.StarterCharacterScripts, "CharScript", 'print("character script in", script.Parent.Name, script.Parent:FindFirstChild("Humanoid") ~= nil)')
local folder = Instance.new("Folder") folder.Name = "Hud" folder.Parent = game:GetService("StarterGui")
ls(folder, "GuiScript", 'print("gui script in", script.Parent.Parent.ClassName)')
-- A server script that requires a shared module.
local mod = Instance.new("ModuleScript") mod.Name = "Config" mod.Source = 'return { greeting = "hello from a module" }' mod.Parent = game:GetService("ReplicatedStorage")
local srv = Instance.new("Script") srv.Name = "Server" srv.Source = 'print(require(game:GetService("ReplicatedStorage").Config).greeting)' srv.Parent = game:GetService("ServerScriptService")
