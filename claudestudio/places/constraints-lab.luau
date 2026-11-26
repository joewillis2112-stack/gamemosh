-- Constraints lab (runtime/constraints.js): a door on a hinge (a motor, a servo, limits), a ball on a rope and one
-- on a rod, a block hanging on a spring, a slider on a prismatic servo, and blocks moved by VectorForce,
-- LinearVelocity, AngularVelocity, AlignPosition and AlignOrientation. test/scenarios/constraints.mjs measures each.
local base = Instance.new("Part")
base.Name = "Baseplate"; base.Size = Vector3.new(256, 4, 256); base.CFrame = CFrame.new(0, -2, 0); base.Anchored = true; base.Parent = workspace
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(6, 1, 6); spawn.CFrame = CFrame.new(0, 0.5, 60); spawn.Anchored = true; spawn.Parent = workspace
local function part(name, size, cf, anchored, shape)
  local p = Instance.new("Part"); p.Name = name; p.Size = size; p.CFrame = cf; p.Anchored = anchored
  if shape then p.Shape = shape end
  p.Parent = workspace
  return p
end
local function attach(p, name, cf)
  local a = Instance.new("Attachment"); a.Name = name; a.CFrame = cf or CFrame.new(); a.Parent = p
  return a
end
local function constraint(class, name, a0, a1, parent)
  local c = Instance.new(class); c.Name = name; c.Attachment0 = a0; c.Attachment1 = a1; c.Parent = parent or a0.Parent
  return c
end
local up = CFrame.Angles(0, 0, math.pi / 2) -- an attachment whose X axis points up

-- The door: a post, and a door hinged on its edge about the vertical; the hinge starts with no actuator.
local post = part("Post", Vector3.new(1, 10, 1), CFrame.new(0, 5, 0), true)
local door = part("Door", Vector3.new(6, 8, 0.5), CFrame.new(3.5, 5, 0), false)
door.CanCollide = false -- (swings through its post: the hinge alone is measured)
local hinge = constraint("HingeConstraint", "Hinge", attach(post, "H0", CFrame.new(0.5, 0, 0) * up), attach(door, "H1", CFrame.new(-3, 0, 0) * up), post)

-- A ball on a rope (Length 6) from a beam, let go 4 studs to the side; one on a rod (Length 5).
local beam = part("Beam", Vector3.new(2, 1, 2), CFrame.new(30, 20, 0), true)
local ball = part("Ball", Vector3.new(2, 2, 2), CFrame.new(34, 16, 0), false, Enum.PartType.Ball)
constraint("RopeConstraint", "Rope", attach(beam, "R0", CFrame.new(0, -0.5, 0)), attach(ball, "R1"), beam).Length = 6
local beam2 = part("Beam2", Vector3.new(2, 1, 2), CFrame.new(40, 20, 0), true)
local bob = part("Bob", Vector3.new(2, 2, 2), CFrame.new(44, 19.5, 0), false, Enum.PartType.Ball)
constraint("RodConstraint", "Rod", attach(beam2, "D0", CFrame.new(0, -0.5, 0)), attach(bob, "D1"), beam2).Length = 5

-- A block (2 x 2 x 2) hanging on a spring: FreeLength 3, Stiffness 400, Damping 20.
local hook = part("Hook", Vector3.new(2, 1, 2), CFrame.new(50, 20, 0), true)
local weight = part("Weight", Vector3.new(2, 2, 2), CFrame.new(50, 16, 0), false)
local spring = constraint("SpringConstraint", "Spring", attach(hook, "S0", CFrame.new(0, -0.5, 0)), attach(weight, "S1", CFrame.new(0, 1, 0)), hook)
spring.FreeLength = 3; spring.Stiffness = 400; spring.Damping = 20

-- A slider: a block on a prismatic along +X from a rail, as a servo to TargetPosition 4.
local rail = part("Rail", Vector3.new(1, 1, 1), CFrame.new(60, 10, 0), true)
local slider = part("Slider", Vector3.new(1, 1, 1), CFrame.new(60, 10, 0), false)
slider.CanCollide = false
local pr = constraint("PrismaticConstraint", "Slide", attach(rail, "P0"), attach(slider, "P1"), rail)
pr.ActuatorType = Enum.ActuatorType.Servo; pr.Speed = 4; pr.ServoMaxForce = 1e6; pr.TargetPosition = 4; pr.LimitsEnabled = true; pr.LowerLimit = -10; pr.UpperLimit = 10

-- Movers, on 2 x 2 x 2 blocks in the air.
local hover = part("Hover", Vector3.new(2, 2, 2), CFrame.new(-20, 10, 0), false)
local vf = constraint("VectorForce", "Lift", attach(hover, "V0"), nil, hover)
vf.RelativeTo = Enum.ActuatorRelativeTo.World; vf.Force = Vector3.new(0, hover.AssemblyMass * workspace.Gravity, 0)
local runner = part("Runner", Vector3.new(2, 2, 2), CFrame.new(-30, 10, 12), false)
local lv = constraint("LinearVelocity", "Run", attach(runner, "L0"), nil, runner)
lv.VectorVelocity = Vector3.new(5, 0, 0); lv.MaxForce = 1e7
local spinner = part("Spinner", Vector3.new(2, 2, 2), CFrame.new(-40, 2, -12), false) -- (on the ground: it spins against friction)
local av = constraint("AngularVelocity", "Spin", attach(spinner, "W0"), nil, spinner)
av.AngularVelocity = Vector3.new(0, 3, 0); av.MaxTorque = 1e7
local seeker = part("Seeker", Vector3.new(2, 2, 2), CFrame.new(-50, 5, 0), false)
local ap = constraint("AlignPosition", "Seek", attach(seeker, "A0"), nil, seeker)
ap.Mode = Enum.PositionAlignmentMode.OneAttachment; ap.Position = Vector3.new(-50, 12, 6); ap.MaxForce = 1e6; ap.Responsiveness = 20
local turner = part("Turner", Vector3.new(2, 2, 2), CFrame.new(-60, 12, 0), true)
local turned = part("Turned", Vector3.new(2, 2, 2), CFrame.new(-60, 12, 0), false)
turned.CanCollide = false
local ao = constraint("AlignOrientation", "Turn", attach(turned, "O0"), attach(turner, "O1", CFrame.Angles(0, math.rad(60), 0)), turned)
ao.MaxTorque = 1e7; ao.Responsiveness = 30
local hold = constraint("AlignPosition", "Hold", turned.O0, turner.O1, turned)
hold.RigidityEnabled = true
-- A block high up, turned by a Torque about the vertical as it falls.
local torquer = part("Torquer", Vector3.new(2, 2, 4), CFrame.new(-70, 120, 0), false)
local tq = constraint("Torque", "Twist", attach(torquer, "T0"), nil, torquer)
tq.RelativeTo = Enum.ActuatorRelativeTo.World; tq.Torque = Vector3.new(0, 200, 0)
-- NoCollisionConstraint: a block dropped on a slab with one between them falls through it; one without lands.
local slab = part("Slab", Vector3.new(6, 1, 12), CFrame.new(80, 5, 0), true)
local ghost = part("Ghost", Vector3.new(2, 2, 2), CFrame.new(80, 8, -3), false)
local lander = part("Lander", Vector3.new(2, 2, 2), CFrame.new(80, 8, 3), false)
local nc = Instance.new("NoCollisionConstraint"); nc.Part0 = ghost; nc.Part1 = slab; nc.Parent = ghost
-- UniversalConstraint: a block hung from a beam by its primary (vertical) axis: it can tilt, not twist.
local yoke = part("Yoke", Vector3.new(1, 1, 1), CFrame.new(95, 20, 0), true)
local swing = part("Swing", Vector3.new(2, 4, 2), CFrame.new(95, 17.5, 0), false)
swing.CanCollide = false -- (it would knock against the yoke: constrained parts collide, as in Roblox)
constraint("UniversalConstraint", "Cardan", attach(yoke, "U0", CFrame.new(0, -0.5, 0) * up), attach(swing, "U1", CFrame.new(0, 2, 0) * up), yoke)
