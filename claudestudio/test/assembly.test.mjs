// Joints and assemblies (web/assembly.js), driven by Luau as a game would: Weld places Part1 at
// Part0 * C0 * C1:Inverse() with the root staying; an anchored part is the root; WeldConstraint keeps
// its offset, CFrame moves the whole assembly while Position moves one part and re-welds; the root
// rules (size, RootPriority, Massless, HumanoidRootPart); two anchored parts or a cycle make a joint
// inactive; Motor6D.Transform turns Part1 about the joint; removing a joint splits; AssemblyRootPart
// is nil outside the Workspace; GetRootPart, GetConnectedParts, GetJoints.
import createLuau from '../web/luau.mjs';
import { DataModel } from '../web/datamodel.js';
import { startLuau } from '../web/luau.js';

const out = [];
const dm = new DataModel();
const vm = await startLuau(createLuau, dm, (s, lvl) => out.push((lvl === 2 ? 'ERR ' : '') + s));
vm.run('joints', `
local function part(name, pos, size, anchored)
  local p = Instance.new("Part")
  p.Name = name; p.Size = size or Vector3.new(2, 2, 2); p.Anchored = anchored or false
  p.CFrame = CFrame.new(pos); p.Parent = workspace
  return p
end
local function near(a, b) if type(a) == "number" then return math.abs(a - b) < 1e-4 end return (a - b).Magnitude < 1e-4 end
local function check(ok, what) print((ok and "ok   " or "FAIL ") .. what) end

-- Weld: Part1 goes to Part0 * C0 * C1:Inverse(); the anchored Part0 is the root and stays.
local A = part("A", Vector3.new(0, 5, 0), nil, true)
local B = part("B", Vector3.new(10, 0, 0))
local w = Instance.new("Weld"); w.Part0 = A; w.Part1 = B; w.C0 = CFrame.new(0, 2, 0); w.C1 = CFrame.new(1, 0, 0); w.Parent = A
check(near(B.Position, Vector3.new(-1, 7, 0)) and near(A.Position, Vector3.new(0, 5, 0)), "a Weld puts Part1 at Part0 * C0 * C1:Inverse(), the anchored root staying")
check(w.Active and B.AssemblyRootPart == A and A:GetRootPart() == A, "it's active; the anchored part is the root")
w.C0 = CFrame.new(0, 3, 0) * CFrame.Angles(0, math.rad(90), 0)
check(near(B.Position, (A.CFrame * w.C0 * w.C1:Inverse()).Position) and near(A.Position, Vector3.new(0, 5, 0)), "changing C0 moves Part1, not the root")
-- An anchored Part1: it becomes the root and Part0 moves instead.
local C = part("C", Vector3.new(20, 0, 0))
local D = part("D", Vector3.new(30, 4, 0), nil, true)
local w2 = Instance.new("Weld"); w2.Part0 = C; w2.Part1 = D; w2.C0 = CFrame.new(0, 0, 5); w2.Parent = workspace
check(near(D.Position, Vector3.new(30, 4, 0)) and near(C.Position, Vector3.new(30, 4, -5)), "an anchored Part1 is the root: Part0 moves to Part1 * C1 * C0:Inverse()")

-- WeldConstraint: the offset at activation; CFrame moves the assembly; Position re-welds.
local E = part("E", Vector3.new(0, 20, 0), Vector3.new(4, 1, 4))
local F = part("F", Vector3.new(3, 21, 0))
local wc = Instance.new("WeldConstraint"); wc.Part0 = E; wc.Part1 = F; wc.Parent = E
check(near(F.Position, Vector3.new(3, 21, 0)) and wc.Active, "a WeldConstraint keeps where its parts were")
E.CFrame = CFrame.new(0, 30, 0) * CFrame.Angles(0, math.rad(90), 0)
check(near(F.Position, (CFrame.new(0, 30, 0) * CFrame.Angles(0, math.rad(90), 0) * CFrame.new(3, 1, 0)).Position), "setting one part's CFrame moves the other with it")
F.Position = F.Position + Vector3.new(0, 5, 0)
local eBefore = E.Position
check(near(E.Position, eBefore) and near(F.Position.Y, 36), "setting Position moves that part alone")
E.CFrame = E.CFrame + Vector3.new(0, 10, 0)
check(near(F.Position.Y, 46), "and the weld keeps the new offset")

-- The root: the biggest part; then RootPriority; Massless never wins; HumanoidRootPart is favoured.
local G = part("G", Vector3.new(0, 50, 0), Vector3.new(1, 1, 1))
local H = part("H", Vector3.new(0, 52, 0), Vector3.new(6, 6, 6))
local wg = Instance.new("WeldConstraint"); wg.Part0 = G; wg.Part1 = H; wg.Parent = G
check(G.AssemblyRootPart == H, "the bigger part is the root")
G.RootPriority = 5
check(G.AssemblyRootPart == G, "a higher RootPriority wins over size")
G.RootPriority = 0; H.Massless = true
check(G.AssemblyRootPart == G, "a Massless part isn't the root while another has mass")
H.Massless = false; G.Name = "HumanoidRootPart"; G.Size = Vector3.new(1, 1, 1)
check(G.AssemblyRootPart == H, "size still wins over the HumanoidRootPart bonus here (6x6 face vs 1x1 x10)")
G.Size = Vector3.new(4, 4, 1)
check(G.AssemblyRootPart == G, "a HumanoidRootPart wins when near in size (4x4 x10 vs 6x6)")

-- Inactive joints: two anchored assemblies; a cycle.
local I = part("I", Vector3.new(40, 0, 0), nil, true)
local J = part("J", Vector3.new(44, 0, 0), nil, true)
local wij = Instance.new("WeldConstraint"); wij.Part0 = I; wij.Part1 = J; wij.Parent = I
check(not wij.Active and I.AssemblyRootPart == I and J.AssemblyRootPart == J, "a weld between two anchored parts is inactive")
local K, L, M = part("K", Vector3.new(60, 0, 0)), part("L", Vector3.new(62, 0, 0)), part("M", Vector3.new(64, 0, 0))
local k1 = Instance.new("WeldConstraint"); k1.Part0 = K; k1.Part1 = L; k1.Parent = K
local k2 = Instance.new("WeldConstraint"); k2.Part0 = L; k2.Part1 = M; k2.Parent = L
local k3 = Instance.new("WeldConstraint"); k3.Part0 = M; k3.Part1 = K; k3.Parent = M
local actives = (k1.Active and 1 or 0) + (k2.Active and 1 or 0) + (k3.Active and 1 or 0)
check(actives == 2 and K.AssemblyRootPart == M.AssemblyRootPart, "a cycle: one weld inactive, one assembly")
check(#K:GetConnectedParts(true) == 3 and #L:GetConnectedParts() == 2 and #K:GetJoints() >= 1, "GetConnectedParts (recursive: all three) and GetJoints")

-- Motor6D: Transform turns Part1 about the joint; the root stays; ChildName mirrors Part1.
local N = part("N", Vector3.new(80, 10, 0), Vector3.new(2, 2, 2), true)
local O = part("Arm", Vector3.new(0, 0, 0), Vector3.new(1, 2, 1))
local m = Instance.new("Motor6D"); m.Part0 = N; m.Part1 = O; m.C0 = CFrame.new(1.5, 0.5, 0); m.C1 = CFrame.new(0, 0.5, 0); m.Parent = N
check(near(O.Position, Vector3.new(81.5, 10, 0)), "a Motor6D places Part1 from its C0 and C1")
m.Transform = CFrame.Angles(0, 0, math.rad(90))
check(near(O.Position, (N.CFrame * m.C0 * m.Transform * m.C1:Inverse()).Position) and near(N.Position, Vector3.new(80, 10, 0)), "Transform turns it about the joint; the root stays")
check(m.ChildName == "Arm", "ChildName is Part1's Name")

-- Removing a joint splits the assembly; a part outside the Workspace has no root part.
wc.Parent = nil
check(F.AssemblyRootPart == F and E.AssemblyRootPart == E and not wc.Active, "removing the weld splits the assembly")
local Fpos = F.Position
E.CFrame = E.CFrame + Vector3.new(0, 10, 0)
check(near(F.Position, Fpos), "and its parts move alone")
O.Parent = nil
check(O.AssemblyRootPart == nil, "AssemblyRootPart is nil outside the Workspace")
-- Model:PivotTo on a welded model moves each part once (not once per part set).
local mdl = Instance.new("Model"); mdl.Parent = workspace
local P1 = part("P1", Vector3.new(100, 5, 0)); P1.Parent = mdl
local P2 = part("P2", Vector3.new(103, 5, 0)); P2.Parent = mdl
local wp = Instance.new("WeldConstraint"); wp.Part0 = P1; wp.Part1 = P2; wp.Parent = P1
mdl.PrimaryPart = P1
mdl:PivotTo(CFrame.new(0, 50, 0))
check(near(P1.Position, Vector3.new(0, 50, 0)) and near(P2.Position, Vector3.new(3, 50, 0)), "Model:PivotTo moves a welded model once, rigidly")
local ok = pcall(function() m.Active = false end)
check(not ok, "Active is read-only")
`);
for (const l of out) console.log(l);
const fail = out.filter(l => l.startsWith('FAIL') || l.startsWith('ERR'));
if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
