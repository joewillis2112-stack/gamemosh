// Script editor autocomplete (web/editor/completions.js): libraries as the Luau VM reports them,
// classes, members, services and enums from the class table, an instance's real children, locals.
import createLuau from '../web/luau.mjs';
import { startLuau } from '../web/luau.js';
import { DataModel, Instance } from '../web/datamodel.js';
import { complete, describe, LIBRARY_PROBE, parseLibraries } from '../web/editor/completions.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const lines = [], dm = new DataModel();
const vm = await startLuau(createLuau, dm, s => lines.push(s), { runScripts: false });
vm.run('probe', LIBRARY_PROBE);
const libs = parseLibraries(lines);
const base = new Instance(dm, 'Part'); dm.set(base, 'Name', 'Baseplate'); dm.setParent(base, dm.workspace);
const script = new Instance(dm, 'Script'); dm.setParent(script, dm.workspace);
const ctx = { libs, dm, script };
const at = (text, ctx2 = ctx) => { const r = complete(text, text.length, ctx2); return r && { from: r.from, labels: r.options.map(o => o.label), types: Object.fromEntries(r.options.map(o => [o.label, o.type])) }; };
const has = (r, ...ls) => !!r && ls.every(l => r.labels.includes(l));
const lacks = (r, ...ls) => !!r && ls.every(l => !r.labels.includes(l));

check(libs.math && libs.math.includes('clamp') && libs.task.includes('wait') && libs.CFrame.includes('lookAt'), `libraries come from the VM (math ${libs.math && libs.math.length} keys, task ${libs.task}, CFrame has lookAt)`);
let r = at('local x = math.fl');
check(has(r, 'floor', 'clamp', 'pi') && lacks(r, 'new') && r.from === 'local x = math.'.length, 'math. lists math\'s functions, replacing what was typed after the dot');
check(has(at('Vector3.'), 'new', 'zero') && at('Vector3:') === null, 'Vector3. lists its constructors; a colon after a library offers nothing');
r = at('local rs = game:GetService("Rep');
check(has(r, 'ReplicatedStorage', 'Players', 'Workspace') && lacks(r, 'Part') && r.from === 'local rs = game:GetService("'.length, 'GetService(" offers the services');
r = at('local p = Instance.new("Pa');
check(has(r, 'Part', 'Script', 'ScreenGui') && lacks(r, 'Workspace', 'BasePart'), 'Instance.new(" offers creatable classes only (no services or abstract classes)');
r = at('workspace.');
check(has(r, 'Baseplate', 'Gravity', 'ChildAdded', 'Name') && lacks(r, 'FindFirstChild') && r.types.Baseplate === 'variable' && r.types.ChildAdded === 'event', 'workspace. lists its real children, properties and events, not methods');
r = at('workspace:');
check(has(r, 'FindFirstChild', 'GetChildren', 'Destroy') && lacks(r, 'Gravity', 'Baseplate'), 'workspace: lists methods only');
r = at('local p = Instance.new("Part")\np.');
check(has(r, 'Anchored', 'Size', 'Touched', 'Parent') && lacks(r, 'Baseplate', 'Gravity'), 'a local made by Instance.new("Part") completes as a Part');
check(has(at('local p = Instance.new("Part")\np:'), 'Destroy', 'Clone', 'IsA'), 'and its methods after a colon');
check(has(at('workspace.Baseplate.'), 'Size', 'Anchored', 'Material'), 'a path into the place resolves to the real instance (workspace.Baseplate is a Part)');
check(has(at('workspace:WaitForChild("'), 'Baseplate', 'Script'), 'WaitForChild(" offers the instance\'s real children');
check(has(at('local ws = game:GetService("Workspace")\nws.'), 'Baseplate', 'Gravity'), 'a local from GetService resolves to that service, children included');
check(has(at('game.'), 'Workspace', 'Players', 'ReplicatedStorage'), 'game. lists the services');
check(has(at('script.Parent.'), 'Baseplate', 'Gravity'), 'script.Parent is the open script\'s real parent');
check(has(at('local m = Enum.'), 'Material', 'EasingStyle') && lacks(at('local m = Enum.'), 'KeyCode') && has(at('x = Enum.Material.'), 'Plastic', 'Neon'), 'Enum. lists the enum types the engine has (not KeyCode, which it lacks yet); Enum.Material. lists its items');
r = at('local speed = 10\nlocal function jump() end\nfor i, v in pairs({}) do end\nsp');
check(has(r, 'speed', 'jump', 'i', 'v', 'print', 'local', 'math'), 'a plain word offers the script\'s locals and functions, globals, libraries and keywords');
check(at('print("math.') === null && at('-- math.') === null, 'nothing inside a string or a comment');
check(at('nosuch.') === null && at('local q = 5\nq.') === null, 'nothing for what it can\'t resolve (no guessing)');

// Hover (describe): what the word under the pointer is.
const hover = (text, word, k = 0) => { let i = -1; for (let n = 0; n <= k; n++) i = text.indexOf(word, i + 1); const d = describe(text, i + 1, ctx); return d && [d.title, ...d.lines].join(' | '); };
const H = (text, word, want, k) => { const got = hover(text, word, k); check(got === want, `hover ${JSON.stringify(word)} in ${JSON.stringify(text.slice(0, 40))}: ${got}`); };
H('local p = Instance.new("Part")\np.Anchored = true', 'Anchored', 'Part.Anchored: bool | property of BasePart');
H('workspace.Baseplate:PivotTo(cf)', 'PivotTo', 'Part:PivotTo(cf) | method of BasePart');
H('workspace.Baseplate.Touched:Connect(f)', 'Touched', 'Part.Touched: RBXScriptSignal | event of BasePart');
H('workspace.Baseplate', 'Baseplate', 'Baseplate: Part | Workspace.Baseplate in this place');
H('local n = game.Players.LocalPlayer', 'LocalPlayer', 'Players.LocalPlayer: Instance | property of Players | read-only to scripts');
H('local x = math.clamp(1, 2, 3)', 'clamp', 'math.clamp | in Luau\'s math library');
H('local m = Enum.Material.Neon', 'Neon', 'Enum.Material.Neon | enum item');
H('script.Parent', 'script', 'script: Script | Workspace.Script, the script this code runs as');
H('local p = Instance.new("Part")\np.Size = Vector3.one', 'p', 'local p: Part | = Instance.new("Part")', 1);
check(describe('-- workspace.Gravity', 15, ctx) === null && describe('print("workspace.Gravity")', 18, ctx) === null && describe('local q = 5\nq.foo', 14, ctx) === null, 'no hover inside comments and strings, or on what it can\'t resolve');

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
