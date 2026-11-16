// The script checker (web/luaucheck.mjs: Luau's own type checker, built by luau/build-check.sh)
// with the engine's definitions (web/editor/luautypes.js): no false alarms on every place in
// places/ and every script embedded in them (code that runs correctly), nor on everyday Roblox
// patterns; and it catches planted mistakes: typos in members, children, classes, services,
// enums and libraries, unknown globals, wrong argument types. Nonstrict, as Studio checks scripts by
// default: an unannotated local is `any` there, so its members aren't checked unless the script
// says `--!strict` (checked below too).
import fs from 'node:fs';
import createLuauCheck from '../web/luaucheck.mjs';
import createLuau from '../web/luau.mjs';
import { startLuau } from '../web/luau.js';
import { DataModel } from '../web/datamodel.js';
import { LIBRARY_PROBE, parseLibraries } from '../web/editor/completions.js';
import { definitions, readable } from '../web/editor/luautypes.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const lines = []; const vm = await startLuau(createLuau, new DataModel(), s => lines.push(s), { runScripts: false }); vm.run('p', LIBRARY_PROBE);
const libs = parseLibraries(lines);
const M = await createLuauCheck();
const call = (fn, s) => { const p = M.stringToNewUTF8(s); try { return M.UTF8ToString(M[fn](p)); } finally { M._free(p); } };
const initFor = dm => { const r = call('_lc_init', definitions(libs, {}, dm)); if (r) check(false, 'definitions load: ' + r.slice(0, 200)); };
const problems = code => call('_lc_check', code).trim().split('\n').filter(Boolean).map(l => { const [line, , , , msg] = l.split('\t'); return { line: +line, msg }; });

// 1. No false alarms on the places and their scripts, each checked against its own place's tree.
let n = 0;
for (const f of fs.readdirSync('places').filter(f => f.endsWith('.luau'))) {
  const src = fs.readFileSync('places/' + f, 'utf8');
  const dm = new DataModel(), pvm = await startLuau(createLuau, dm, () => {}, { runScripts: false }); pvm.run(f, src);
  initFor(new DataModel());
  let p = problems(src); n++;
  check(!p.length, `${f}: no problems${p.length ? ' (' + p.map(x => x.line + ': ' + x.msg).join('; ').slice(0, 200) + ')' : ''}`);
  initFor(dm);
  for (const m of src.matchAll(/\.Source = \[(=*)\[([\s\S]*?)\]\1\]/g)) { p = problems(m[2]); n++; check(!p.length, `${f}, its embedded script: no problems${p.length ? ' (' + p.map(x => x.line + ': ' + x.msg).join('; ').slice(0, 200) + ')' : ''}`); }
}

// A place with a Baseplate, for the rest.
const dm = new DataModel(), pvm = await startLuau(createLuau, dm, () => {}, { runScripts: false });
pvm.run('place', 'local b = Instance.new("Part") b.Name = "Baseplate" b.Parent = workspace\nlocal m = Instance.new("Model") m.Name = "Tower" m.Parent = workspace\nlocal d = Instance.new("Part") d.Name = "Door" d.Parent = m');
initFor(dm);
// 2. Everyday patterns that are right.
for (const code of [
  'local Players = game:GetService("Players")\nPlayers.PlayerAdded:Connect(function(player) print(player.Name) end)',
  'workspace.Baseplate.Touched:Connect(function(hit)\n  local h = hit.Parent:FindFirstChild("Humanoid")\n  if h then h.Health = 0 end\nend)',
  'local p = Instance.new("Part", workspace)\np.Anchored = true\np.Size = Vector3.new(4, 1, 2)\np.Color = Color3.fromRGB(255, 0, 0)\np.Material = Enum.Material.Neon',
  'task.wait(1)\nlocal v = Vector3.new(1, 2, 3) + Vector3.one\nprint(v.Magnitude, math.clamp(v.X, 0, 1))',
  'workspace.Tower.Door.Transparency = 0.5\nworkspace.Tower:WaitForChild("Door"):Destroy()',
  'local TweenService = game:GetService("TweenService")\nlocal t = TweenService:Create(workspace.Baseplate, TweenInfo.new(1), { Transparency = 1 })\nt:Play()',
  'for _, c in ipairs(workspace:GetChildren()) do if c:IsA("BasePart") then c.CanCollide = false end end',
  'local gui = Instance.new("ScreenGui")\nlocal f = Instance.new("Frame", gui)\nf.Size = UDim2.new(1, 0, 0, 40)\nf.BackgroundColor3 = Color3.new(0, 0, 0)',
  'script.Parent.Name = "x"\nlocal ok, err = pcall(function() error("no") end)\nwarn(ok, err)',
  'local e = Instance.new("ParticleEmitter", workspace.Baseplate)\ne.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0) })\ne.Color = ColorSequence.new(Color3.new(1, 1, 0), Color3.new(1, 0, 0))\ne.Lifetime = NumberRange.new(0.5, 1)\ne.CastLight = true\ne.Collision = Enum.ParticleCollision.Bounce\ne:Emit(20)',
  // With Roblox's parameter and return types: optional parameters left out, events' values, what methods return.
  'workspace:WaitForChild("Baseplate", 5)\nworkspace:FindFirstChild("Door", true)\nInstance.new("ParticleEmitter"):Emit()\nlocal tr = Instance.new("Animator"):LoadAnimation(Instance.new("Animation"))\ntr:Play()\ntr:Stop(0.2)',
  'game:GetService("Players").PlayerRemoving:Connect(function(player, reason) print(player.Name, reason) end)\nlocal dt = game:GetService("RunService").Heartbeat:Wait()\nprint(dt * 60)',
  'workspace.Baseplate.Touched:Connect(function(hit) local m = hit.Parent if m then print(m.Name) end end)\nworkspace.ChildAdded:Connect(function(c) c.Name = "x" end)',
  'local f = workspace:FindFirstChild("Baseplate")\nif f then f.Anchored = true end\nworkspace.Tower:WaitForChild("Door").Transparency = 1\nworkspace.Baseplate:Clone().Anchored = false',
  'workspace.Tower:GetChildren()[1].Transparency = 1\nfor _, p in ipairs(game:GetService("Players"):GetPlayers()) do print(p.UserId) end\nfor _, d in ipairs(workspace:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true end end',
  'local cam = workspace.CurrentCamera\nlocal pos, onScreen = cam:WorldToViewportPoint(Vector3.new(0, 5, 0))\nprint(pos, onScreen)\nworkspace.Tower:PivotTo(workspace.Tower:GetPivot() * CFrame.new(0, 1, 0))',
  'game:GetService("StarterGui"):SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)\nlocal t = game:GetService("TweenService"):Create(workspace.Baseplate, TweenInfo.new(1), { Transparency = 1 })\nt.Completed:Connect(function(state) print(state) end)\nt:Play()',
]) { const p = problems(code); check(!p.length, `no problems in ${JSON.stringify(code.split('\n')[0].slice(0, 50))}${p.length ? ' (' + p.map(x => x.line + ': ' + x.msg).join('; ').slice(0, 160) + ')' : ''}`); }

// 3. Planted mistakes, each caught on its line.
for (const [code, line, re] of [
  ['workspace.Baseplate.Anchord = true', 1, /Anchord/],
  ['workspace.Baseplat.Anchored = true', 1, /Baseplat/],
  ['workspace.Tower.Dor.Transparency = 1', 1, /Dor/],
  ['local p = Instance.new("Prt")', 1, /overload|Prt/],
  ['local s = game:GetService("Player")', 1, /Player/],
  ['workspace:FindFirstChld("x")', 1, /FindFirstChld/],
  ['print(undefinedThing)', 1, /Unknown global 'undefinedThing'/],
  ['workspace.Baseplate.Touched:Conect(function() end)', 1, /Conect/],
  ['print(string.lower(5))', 1, /string/],
  ['local m = Enum.Material.Plastik', 1, /Plastik/],
  ['task.wiat(1)', 1, /wiat/],
  ['workspace.Baseplate.Anchored = "yes"', 1, /boolean|string/],
  ['--!strict\nlocal p = Instance.new("Part")\np.Anchord = true', 3, /Anchord/],
  ['--!strict\nlocal p = Instance.new("Part")\np.Touched:Conect(function() end)', 3, /Conect/],
  // Roblox's types on methods and events: a wrong argument, too many or too few, a wrong use of what one returns.
  ['workspace:FindFirstChild(5)', 1, /Expected this to be 'string', but got 'number'/],
  ['local plr = game:GetService("Players"):GetPlayerFromCharacter("Bob")', 1, /Expected this to be 'Model', but got 'string'/],
  ['game:GetService("Lighting"):SetMinutesAfterMidnight("noon")', 1, /Expected this to be 'number', but got 'string'/],
  ['print(workspace.Baseplate:IsDescendantOf("Workspace"))', 1, /Expected this to be 'Instance', but got 'string'/],
  ['local x = 1\nworkspace.Baseplate:Destroy(x)', 2, /Argument count mismatch/],
  ['if workspace.Baseplate:IsA() then end', 1, /Argument count mismatch/],
  ['print(game:GetService("Lighting"):GetMinutesAfterMidnight():upper())', 1, /'number' does not have key 'upper'/],
  ['local label = workspace.Baseplate:GetFullName() + 1', 1, /Expected this to be 'number', but got 'string'/],
  ['game:GetService("TweenService"):Create(workspace.Baseplate, TweenInfo.new(1), {}):Pley()', 1, /Key 'Pley' not found in .*'Tween'/],
  ['print(workspace.Baseplate.Touched:Wait().Sizee)', 1, /Key 'Sizee' not found in .*'BasePart'/],
  ['local hb = game:GetService("RunService").Heartbeat:Wait():upper()', 1, /'number' does not have key 'upper'/],
  ['workspace.Baseplate.Touched:Connect(function(hit: string) end)', 1, /Expected this to be 'string', but got 'BasePart'/],
  ['game:GetService("StarterGui"):SetCoreGuiEnabled("All", false)', 1, /EnumItem/],
]) {
  const p = problems(code);
  check(p.some(x => x.line === line && re.test(x.msg)), `caught on line ${line}: ${JSON.stringify(code.split('\n').pop())} (${p.map(x => x.msg).join('; ').slice(0, 120)})`);
}

// Messages in Studio's words, not our generated type names.
const msg = readable(problems('workspace.Tower.Dor.Transparency = 1')[0].msg);
check(msg === "Key 'Dor' not found in class 'Model'", `messages name the class, as Studio does ("${msg}")`);
const sigMsg = readable(problems('workspace.Baseplate.Touched:Conect(function() end)')[0].msg);
check(sigMsg === "Key 'Conect' not found in class 'RBXScriptSignal'", `and a signal is RBXScriptSignal, as in Studio ("${sigMsg}")`);
const defs = definitions(libs, {}, null);
check(defs.includes('  function PivotTo(self, targetCFrame: CFrame): ()') && defs.includes('  function FindFirstChild(self, name: string, recursive: boolean?): any') && defs.includes('  Touched: RBXScriptSignal<BasePart>'),
  'methods and events are declared with Roblox\'s types (a bare Instance returned is any: the script knows what it found)');
// The documented limit: nonstrict doesn't check an unannotated local's members (Studio's default).
check(!problems('local p = Instance.new("Part")\np.Anchord = true').length, 'nonstrict leaves an unannotated local unchecked, as Studio does (the documented limit)');

console.log(fail.length ? `FAIL (${fail.length})` : `PASS (${n} sources from places/, no false alarms)`);
process.exit(fail.length ? 1 : 0);
