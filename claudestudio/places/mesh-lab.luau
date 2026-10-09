-- Mesh lab: glTF models as MeshParts, from realistic (DamagedHelmet, CC-BY 4.0
-- ctxwing / theblueturtle_) to blocky (BoxTextured, CC-BY 4.0 Cesium), used
-- the way a creator would: loaded by a script, placed, stretched, dropped.
local base = Instance.new("Part")
base.Name = "Baseplate" base.Anchored = true base.Size = Vector3.new(256, 4, 256) base.Position = Vector3.new(0, -2, 0)
base.Color = Color3.fromRGB(91, 93, 105) base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true spawn.Size = Vector3.new(6, 1, 6) spawn.Position = Vector3.new(6, 0.5, 8) spawn.Parent = workspace

local loader = Instance.new("Script") loader.Name = "Meshes" loader.Parent = game:GetService("ServerScriptService")
loader.Source = [[
local AssetService = game:GetService("AssetService")

-- CreateMeshPartAsync yields until the file has loaded; the part comes back at the mesh's own size.
local helmet = AssetService:CreateMeshPartAsync("assets/models/DamagedHelmet.glb")
helmet.Name = "Helmet"
helmet.Anchored = true
helmet.CFrame = CFrame.new(-4, helmet.Size.Y / 2 + 1, -9) * CFrame.Angles(0, math.rad(25), 0)
helmet.Parent = workspace
print("helmet", math.floor(helmet.MeshSize.X * 100 + 0.5) / 100, helmet.Size == helmet.MeshSize)

-- A MeshPart made with Instance.new and given a MeshId at run time (Roblox only
-- allows that in Studio), stretched by its Size.
local slab = Instance.new("MeshPart")
slab.Name = "Slab"
slab.MeshId = "assets/models/BoxTextured.glb"
slab.Size = Vector3.new(8, 2, 4)
slab.Anchored = true
slab.Position = Vector3.new(-15, 1, -5)
slab.Parent = workspace

-- A loose crate with a hull collider, dropped from above.
local crate = AssetService:CreateMeshPartAsync("assets/models/BoxTextured.glb", { CollisionFidelity = Enum.CollisionFidelity.Hull })
crate.Name = "Crate"
crate.Size = Vector3.new(3, 3, 3)
crate.Position = Vector3.new(10, 12, -6)
crate.Parent = workspace
-- A ball (our generated test sphere): its mass comes from the mesh's volume, not its box.
local ball = AssetService:CreateMeshPartAsync("assets/models/TestSphere.glb", { CollisionFidelity = Enum.CollisionFidelity.Hull })
ball.Name = "Ball"
ball.Size = Vector3.new(2, 2, 2)
ball.Position = Vector3.new(15, 6, -1)
ball.Parent = workspace
print("meshes ready")
]]
