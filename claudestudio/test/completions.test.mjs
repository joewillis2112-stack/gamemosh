// Script editor autocomplete (web/editor/completions.js): libraries as the Luau VM reports them,
// classes, members, services and enums from the class table, an instance's real children, locals;
// each with its one-line summary and a method its typed signature (apidocs.json), and the hover.
import createLuau from '../web/luau.mjs';
import { startLuau } from '../web/luau.js';
import { DataModel, Instance, ENUMS, allClasses, membersOf } from '../web/datamodel.js';
import { complete, describe, docOf, LIBRARY_PROBE, parseLibraries } from '../web/editor/completions.js';
import API from '../web/editor/apidocs.json' with { type: 'json' };

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
// Each option carries its summary (shown beside the list) and a method its typed signature.
const opts = (text) => Object.fromEntries(complete(text, text.length, ctx).options.map(o => [o.label, o]));
let o = opts('workspace:');
check(o.PivotTo === undefined && o.FindFirstChild.detail === '(name: string, recursive: boolean?): Instance' && /^Returns the first child of the Instance found with the given name/.test(o.FindFirstChild.info), `a method's option has its typed signature and summary (${o.FindFirstChild.detail}; ${o.FindFirstChild.info})`);
o = opts('local e = Instance.new("ParticleEmitter")\ne.');
check(o.Rate.detail === 'number' && /particles emitted per second/.test(o.Rate.info) && o.CastLight.info === docOf('ParticleEmitter.CastLight') && /light their surroundings/.test(o.CastLight.info) && /^Fires after an object is parented/.test(o.ChildAdded.info) && /parent/i.test(o.Parent.info), 'properties, events, Parent and Claude Studio\'s own members have their summaries');
o = opts('local x = math.');
check(/between min and max/.test(o.clamp.info) && /Vector3/.test(opts('local v = Vector3.').new.info) && /output/.test(opts('pri').print.info) && /Materials/.test(opts('local m = Enum.').Material.info) && /connected Player/.test(opts('local s = game:GetService("').Players.info), 'libraries, datatypes, globals, enums and services too');
// Every class and member the engine has gets a summary (the docs cover the class table), except
// Roblox members whose pages have none and members that aren't Roblox's (internal ones, MeshData).
const NO_DOC = new Set(['MeshPart.MeshData', 'ParticleEmitter:FastForward', 'ParticleEmitter.OnEmitRequested', 'ParticleEmitter.OnClearRequested', 'ParticleEmitter.OnFastForwardRequested', 'PoseBase.Weight', 'Highlight.LineThickness']);
const undocumented = [];
for (const c of allClasses()) {
  if (!docOf(c.name)) undocumented.push(c.name);
  const m = membersOf(c.name), mine = x => x.owner === c.name;
  for (const [list, s] of [[m.props, '.'], [m.methods, ':'], [m.events, '.']]) for (const x of list.filter(mine)) { const k = c.name + s + x.name; if (!docOf(k) && !NO_DOC.has(k) && !x.name.startsWith('__')) undocumented.push(k); }
}
check(!undocumented.length, `every class and member in the class table has a summary${undocumented.length ? ' (missing: ' + undocumented.join(', ') + '; rerun tools/gen-apidocs.mjs)' : ''}`);
const marked = Object.entries(API.docs).filter(([, s]) => /[`\n]|<\/?[a-z]+[^>]*>|\]\(|\*\*|Class\.|Datatype\./.test(s) || s !== s.trim() || !s);
check(!marked.length, `summaries are plain one-liners: no markdown, links, tags or doc references (${Object.keys(API.docs).length} summaries${marked.length ? '; e.g. ' + marked.slice(0, 2).map(([k, s]) => k + ': ' + s.slice(0, 80)).join('; ') : ''})`);

// Hover (describe): what the word under the pointer is: its typed signature (Roblox's types), its
// one-line summary (Roblox's creator-docs; Claude Studio's own members their own), and facts.
const hover = (text, word, k = 0) => { let i = -1; for (let n = 0; n <= k; n++) i = text.indexOf(word, i + 1); const d = describe(text, i + 1, ctx); return d && [d.title, d.doc, ...d.lines].filter(Boolean).join(' | '); };
const H = (text, word, want, k) => { const got = hover(text, word, k); check(got === want, `hover ${JSON.stringify(word)} in ${JSON.stringify(text.slice(0, 40))}: ${got}`); };
H('local p = Instance.new("Part")\np.Anchored = true', 'Anchored', 'Part.Anchored: boolean | Determines whether a part is immovable by physics. | property of BasePart');
H('workspace.Baseplate:PivotTo(cf)', 'PivotTo', 'Part:PivotTo(targetCFrame: CFrame): () | Transforms the PVInstance along with all of its descendant PVInstances such that the pivot is now located at the specified CFrame. | method of BasePart');
H('workspace:FindFirstChild("x")', 'FindFirstChild', 'Workspace:FindFirstChild(name: string, recursive: boolean?): Instance | Returns the first child of the Instance found with the given name. | method of Instance');
H('workspace:WaitForChild("x")', 'WaitForChild', 'Workspace:WaitForChild(childName: string, timeOut: number?): Instance | Returns the child of the Instance with the given name. If the child does not exist, it will yield the current thread until it does. | method of Instance');
H('local e = Instance.new("ParticleEmitter")\ne.CastLight = true', 'CastLight', "ParticleEmitter.CastLight: boolean | Whether the particles light their surroundings, in their average colour, from their centre. | property of ParticleEmitter | Claude Studio's own (not in Roblox)");
H('local e = Instance.new("ParticleEmitter")\ne.Rate = 5', 'Rate', 'ParticleEmitter.Rate: number | Determines the number of particles emitted per second. | property of ParticleEmitter');
H('local e = Instance.new("ParticleEmitter")\ne:Emit(5)', 'Emit', 'ParticleEmitter:Emit(particleCount: number?): () | Emits a given number of particles. | method of ParticleEmitter', 1);
H('local c = Enum.ParticleCollision.Bounce', 'ParticleCollision', "Enum.ParticleCollision | What a ParticleEmitter's particles do when they hit a part (its Collision property). | 4 items | Claude Studio's own (not in Roblox)");
H('workspace.Baseplate.Touched:Connect(f)', 'Touched', 'Part.Touched: RBXScriptSignal<(otherPart: BasePart)> | Fires when a part touches another part as a result of physical movement. | event of BasePart');
H('workspace.Baseplate', 'Baseplate', 'Baseplate: Part | A common type of BasePart that comes in different primitive shapes. | Workspace.Baseplate in this place');
H('local n = game.Players.LocalPlayer', 'LocalPlayer', 'Players.LocalPlayer: Instance | The Player that the LocalScript is running for. | property of Players | read-only to scripts');
H('local x = math.clamp(1, 2, 3)', 'clamp', 'math.clamp | Returns a number between min and max, inclusive. | in Luau\'s math library');
H('local v = Vector3.new(1, 2, 3)', 'new', 'Vector3.new | Returns a new Vector3 from the given x, y, and z components. | in Luau\'s Vector3 library');
H('task.wait(1)', 'task', 'task | Allows for functions and threads to be coordinated with the engine\'s scheduler. | Luau library: ' + libs.task.length + ' members');
H('print("hi")', 'print', 'print | Prints all provided values to the output. | global');
H('local m = Enum.Material.Neon', 'Neon', 'Enum.Material.Neon | enum item');
H('local m = Enum.Material.Neon', 'Material', 'Enum.Material | Materials used for parts and/or terrain. | ' + Object.keys(ENUMS.Material).length + ' items');
H('script.Parent', 'script', 'script: Script | A reference to the LuaSourceContainer object (Script, LocalScript, or ModuleScript) that is executing this code. | Workspace.Script, the script this code runs as');
H('local p = Instance.new("Part")\np.Size = Vector3.one', 'p', 'local p: Part | = Instance.new("Part")', 1);
check(describe('-- workspace.Gravity', 15, ctx) === null && describe('print("workspace.Gravity")', 18, ctx) === null && describe('local q = 5\nq.foo', 14, ctx) === null, 'no hover inside comments and strings, or on what it can\'t resolve');

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
