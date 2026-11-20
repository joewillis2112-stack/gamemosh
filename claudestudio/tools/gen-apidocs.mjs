// Generates web/editor/apidocs.json: a one-line summary for every class, property, method, event,
// datatype member, enum, global and library function the engine really has, and Roblox's own
// parameter and return types for the methods and events it implements. The script editor shows
// both (hover, autocomplete) and the type checker's definitions use the types (luautypes.js).
//
// Sources (fetched by hand; give their paths):
//   - Roblox/creator-docs, content/en-us/reference/engine/**.yaml, the `summary:` fields (CC-BY-4.0):
//       git clone --depth 1 --filter=blob:none --sparse https://github.com/Roblox/creator-docs.git cdocs
//       git -C cdocs sparse-checkout set content/en-us/reference/engine
//   - Full-API-Dump.json from MaximumADHD/Roblox-Client-Tracker, branch `roblox`:
//       curl -LO https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/Full-API-Dump.json
// Run (from claudestudio/): node tools/gen-apidocs.mjs <cdocs> <Full-API-Dump.json>
//
// "Really has" is asked from the engine, not assumed: the class table (datamodel.js) for classes and
// their members, and the Luau VM itself for globals, libraries and datatypes (a member of a datatype
// is kept when a sample value answers it). Members of Claude Studio's own (STUDIO_OWN) have their
// docs in datamodel.js, not here.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import createLuau from '../web/luau.mjs';
import { startLuau } from '../web/luau.js';
import { DataModel, allClasses, membersOf, ENUMS, STUDIO_OWN } from '../web/datamodel.js';

import { fileURLToPath } from 'node:url';
const OUT = new URL('../web/editor/apidocs.json', import.meta.url);

// ---------------------------------------------------------------- YAML (the subset these generated files use)
// Mappings, sequences of mappings or scalars, block scalars (|), plain and quoted scalars, [] and {}.
export function parseYaml(text) {
  const lines = text.split('\n'); let i = 0;
  const indentOf = l => /^ */.exec(l)[0].length;
  const blank = l => /^\s*(#.*)?$/.test(l);
  const skip = () => { while (i < lines.length && blank(lines[i])) i++; };
  const scalar = v => {
    v = v.trim();
    if (v === '' || v === '~' || v === 'null') return null;
    if (v === '[]') return []; if (v === '{}') return {};
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    if (/^".*"$/.test(v)) return JSON.parse(v);
    return v;
  };
  const isItem = l => /^ *- |^ *-$/.test(l);
  function value(v, ind) {
    if (v === undefined || v.trim() === '') { // a nested node, or null
      skip(); if (i >= lines.length) return null;
      const n = indentOf(lines[i]);
      return n > ind || (n === ind && isItem(lines[i])) ? (isItem(lines[i]) ? seq(n) : map(n)) : null;
    }
    if (/^[|>][-+]?$/.test(v.trim())) { // block scalar, kept as text
      let j = i; while (j < lines.length && lines[j].trim() === '') j++;
      const bi = j < lines.length ? indentOf(lines[j]) : 0;
      if (bi <= ind) return '';
      const out = [];
      while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) >= bi)) out.push(lines[i++].slice(bi));
      return out.join('\n').replace(/\s+$/, '') + '\n';
    }
    return scalar(v);
  }
  function map(ind) {
    const o = {};
    for (;;) {
      skip(); if (i >= lines.length) break;
      const l = lines[i], n = indentOf(l);
      if (n !== ind || isItem(l)) break;
      const m = /^ *([^:]+):(?: (.*))?$/.exec(l);
      if (!m) throw new Error(`yaml: can't read line ${i + 1}: ${l}`);
      i++; o[m[1]] = value(m[2], ind);
    }
    return o;
  }
  function seq(ind) {
    const a = [];
    for (;;) {
      skip(); if (i >= lines.length) break;
      const l = lines[i], n = indentOf(l);
      if (n !== ind || !isItem(l)) break;
      const rest = l.slice(n + 2);
      if (/^[^:'"]+:( |$)/.test(rest)) { lines[i] = ' '.repeat(n + 2) + rest; a.push(map(n + 2)); } // "- key: v" opens a mapping
      else { i++; a.push(scalar(rest)); }
    }
    return a;
  }
  return map(0);
}

// ---------------------------------------------------------------- text
// A summary as one plain line: `Class.X|Xs` -> Xs, `Datatype.CFrame` -> CFrame, links and markup dropped.
export function plain(md) {
  if (!md) return '';
  return md
    .replace(/`([^`]*)`/g, (_, c) => c.includes('|') ? c.split('|').pop() : c.replace(/^(?:Class|Datatype|Global|Library|Enum)\.(?=\w)/, (p, o, s) => p === 'Enum.' ? p : ''))
    .replace(/\b(?:Class|Datatype|Global|Library)\.(?=[A-Za-z])/g, '') // a bare reference, outside backticks
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<sup>([^<]*)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1').replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ').trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(...process.argv.slice(2));

async function main(docsRoot, dumpPath) {
if (!docsRoot || !dumpPath) { console.error('usage: node tools/gen-apidocs.mjs <creator-docs checkout> <Full-API-Dump.json>'); process.exit(1); }
const ENGINE = path.join(docsRoot, 'content/en-us/reference/engine');
// ---------------------------------------------------------------- the API dump: types
const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const DUMP = Object.fromEntries(dump.Classes.map(c => [c.Name, c]));
const engineClasses = allClasses(), ENGINE_CLASS = new Set(engineClasses.map(c => c.name));
// Datatype pages handled elsewhere (Instance.new and Enum have their own declarations; signals are the checker's own).
const NOT_DATATYPES = new Set(['Instance', 'Enum', 'EnumItem', 'Enums', 'RBXScriptSignal', 'RBXScriptConnection']);
const ENUM_NAMES = new Set(dump.Enums.map(e => e.Name));
// Parameters Roblox lets a script leave out although the dump gives them no default.
const OPTIONAL = new Set(['Instance:WaitForChild.timeOut']);

// A Roblox type as Luau writes it (datatypes and classes by name; the checker maps the ones it lacks).
function luauType(t) {
  if (!t) return 'any';
  switch (t.Category) {
    case 'Primitive': return { bool: 'boolean', int: 'number', int64: 'number', float: 'number', double: 'number', string: 'string', null: '()', void: '()' }[t.Name] || 'any';
    case 'Class': return t.Name;
    case 'Enum': return 'Enum.' + t.Name;
    case 'Group': return { Tuple: '...any', Variant: 'any', Array: '{any}', Dictionary: '{[any]: any}', Map: '{[any]: any}', Function: '(...any) -> ...any' }[t.Name] || 'any';
    case 'DataType': return { Objects: '{Instance}', Instances: '{Instance}', Content: 'string', ContentId: 'string', ProtectedString: 'string', Function: '(...any) -> ...any' }[t.Name] || t.Name;
    default: return 'any';
  }
}
// Where Roblox defines `name` for engine class `cls`: the class itself, then its Roblox ancestors,
// then (for members the engine keeps higher up, like LuaSourceContainer.Source) its Roblox descendants.
// Every match, nearest first: the first gives the types, the first with a summary the doc.
function robloxMember(cls, name, kind) {
  const ok = m => m.Name === name && m.MemberType === kind;
  for (let c = DUMP[cls]; c; c = DUMP[c.Superclass]) { const m = c.Members.find(ok); if (m) return [{ owner: c.Name, m }]; }
  const queue = dump.Classes.filter(c => c.Superclass === cls), out = [];
  while (queue.length) { const c = queue.shift(); const m = c.Members.find(ok); if (m) out.push({ owner: c.Name, m }); queue.push(...dump.Classes.filter(d => d.Superclass === c.Name)); }
  return out;
}

// A type as creator-docs writes it ("int", "Tuple<Vector3>", "NormalId", "function | thread") as Luau writes it.
const DOC_TYPES = { number: 'number', int: 'number', int64: 'number', float: 'number', double: 'number', bool: 'boolean', boolean: 'boolean', string: 'string', '()': '()', void: '()', null: '()',
  Variant: 'any', Tuple: '...any', Array: '{any}', Dictionary: '{[any]: any}', table: '{[any]: any}', function: '(...any) -> ...any', Function: '(...any) -> ...any', thread: 'thread', buffer: 'buffer', vector: 'vector', userdata: 'any' };
function docType(t) {
  if (t == null) return 'any';
  t = String(t).trim();
  if (t.includes(' | ')) return t.split(' | ').map(x => { const u = docType(x); return u.includes('->') ? `(${u})` : u; }).join(' | ');
  if (t.endsWith('?')) return docType(t.slice(0, -1)) + '?';
  const m = /^Tuple<(.+)>$/.exec(t); if (m) return '...' + docType(m[1]);
  if (/^Variant</.test(t)) return 'any';
  if (t in DOC_TYPES) return DOC_TYPES[t];
  if (/^\{.*\}$/.test(t)) return t;
  if (ENUM_NAMES.has(t)) return 'Enum.' + t;
  return t; // a class or datatype, by name
}
// A function from a docs page: [params, returns], a param [name, type, optional?]; a Tuple param is `...`.
function docFn(x, ret) {
  const params = (x.parameters || []).map(q => { const t = docType(q.type); if (t === '...any' || t.startsWith('...')) return ['...', t.slice(3) || 'any']; return [q.name, t.replace(/\?$/, ''), ...(q.default != null || t.endsWith('?') ? [1] : [])]; });
  const rs = (x.returns || []).map(r => docType(r.type)).filter(r => r !== '()');
  return [params, ret || (rs.length === 0 ? '()' : rs.length === 1 ? rs[0] : `(${rs.join(', ')})`)];
}
const tail = n => n.split(/[.:]/).pop();

// ---------------------------------------------------------------- creator-docs summaries
const yamlCache = {};
function yamlOf(dir, name) {
  const k = dir + '/' + name;
  if (!(k in yamlCache)) { const f = path.join(ENGINE, dir, name + '.yaml'); yamlCache[k] = fs.existsSync(f) ? parseYaml(fs.readFileSync(f, 'utf8')) : null; }
  return yamlCache[k];
}
// A member's summary from its Roblox owner's page: { "BasePart.Anchored": ..., "PVInstance:PivotTo": ... }.
function memberDoc(dir, owner, key) {
  const y = yamlOf(dir, owner); if (!y) return '';
  for (const sec of ['properties', 'methods', 'events', 'callbacks', 'functions', 'constructors', 'constants']) {
    const hit = (y[sec] || []).find(x => x && x.name === key); if (hit) return plain(hit.summary);
  }
  return '';
}

// ---------------------------------------------------------------- what the engine has (asked from the VM)
const lines = [];
const vm = await startLuau(createLuau, new DataModel(), s => lines.push(s), { runScripts: false });
const ask = (code) => { lines.length = 0; vm.run('gen', code); return lines.slice(); };
const libNames = fs.readdirSync(path.join(ENGINE, 'libraries')).map(f => f.replace(/\.yaml$/, ''));
const dtPages = fs.readdirSync(path.join(ENGINE, 'datatypes')).map(f => f.replace(/\.yaml$/, '')).filter(n => !NOT_DATATYPES.has(n));
const tables = {};
for (const l of ask(`for _, name in {${[...libNames, ...dtPages].map(n => JSON.stringify(n)).join(',')}} do
  local v = getfenv()[name]; local keys = {}
  if type(v) == "table" then for k in pairs(v) do table.insert(keys, tostring(k)) end; print("@t " .. name .. " " .. table.concat(keys, " ")) end
end`)) { const m = /^@t (\w+) ?(.*)$/.exec(l); if (m) tables[m[1]] = new Set(m[2] ? m[2].split(' ') : []); }
const hasGlobal = names => new Set(ask(`for _, n in {${names.map(n => JSON.stringify(n)).join(',')}} do if getfenv()[n] ~= nil then print("@g " .. n) end end`).map(l => l.slice(3)));
// A sample of each datatype, to ask which members it answers.
const SAMPLE = {
  Vector3: 'Vector3.new(1, 2, 3)', Vector2: 'Vector2.new(1, 2)', CFrame: 'CFrame.new(1, 2, 3)', Color3: 'Color3.new(1, 0.5, 0)', UDim: 'UDim.new(1, 2)', UDim2: 'UDim2.new(1, 2, 3, 4)',
  TweenInfo: 'TweenInfo.new(1)', BrickColor: 'BrickColor.new("Bright red")', Ray: 'Ray.new(Vector3.new(), Vector3.new(0, 1, 0))', NumberRange: 'NumberRange.new(1, 2)',
  NumberSequence: 'NumberSequence.new(1)', NumberSequenceKeypoint: 'NumberSequenceKeypoint.new(0, 1)', ColorSequence: 'ColorSequence.new(Color3.new())',
  ColorSequenceKeypoint: 'ColorSequenceKeypoint.new(0, Color3.new())', RaycastParams: 'RaycastParams.new()', Rect: 'Rect.new(0, 0, 1, 1)',
  Region3: 'Region3.new(Vector3.new(), Vector3.new(1, 1, 1))', Random: 'Random.new(1)', DateTime: 'DateTime.now()', PhysicalProperties: 'PhysicalProperties.new(1, 0.3, 0.5)',
  Font: 'Font.new("rbxasset://fonts/families/SourceSansPro.json")', OverlapParams: 'OverlapParams.new()', Vector3int16: 'Vector3int16.new(1, 2, 3)', Vector2int16: 'Vector2int16.new(1, 2)',
  // No constructor: a hit from a ray down onto a part made for it.
  RaycastResult: '(function() local p = Instance.new("Part") p.Anchored = true p.Parent = workspace local r = workspace:Raycast(Vector3.new(0, 10, 0), Vector3.new(0, -20, 0)) p:Destroy() return r end)()',
};
const hasSample = dt => SAMPLE[dt] && ask(`local ok, v = pcall(function() return ${SAMPLE[dt]} end) if ok and typeof(v) == ${JSON.stringify(dt)} then print("@yes") end`).includes('@yes');
function answers(dt, names) {
  if (!SAMPLE[dt] || !names.length) return new Set();
  const out = ask(`local ok, v = pcall(function() return ${SAMPLE[dt]} end)
if ok and v ~= nil then for _, n in {${names.map(n => JSON.stringify(n)).join(',')}} do
  local ok2, r = pcall(function() return v[n] end); if ok2 and r ~= nil then print("@m " .. n) end
end end`);
  return new Set(out.filter(l => l.startsWith('@m ')).map(l => l.slice(3)));
}

// ---------------------------------------------------------------- build
const docs = {}, sigs = {}, fns = {}, dts = {}, extra = {}, missing = [];
const addFn = (k, f) => { (fns[k] ||= []).push(f); };
const put = (k, s) => { if (s) docs[k] = s; else missing.push(k); };

// Classes: each class's summary, and each member the engine defines, under the engine's owner.
for (const c of engineClasses) {
  const y = yamlOf('classes', c.name);
  put(c.name, y && plain(y.summary));
  const mem = membersOf(c.name), mine = x => x.owner === c.name;
  if (c.name === 'Instance') for (const k of ['Parent', 'ClassName']) put('Instance.' + k, robloxMember('Instance', k, 'Property').map(r => memberDoc('classes', r.owner, r.owner + '.' + k)).find(Boolean)); // kept outside the engine's property lists
  for (const [list, kind, sep] of [[mem.props.filter(mine), 'Property', '.'], [mem.methods.filter(mine), 'Function', ':'], [mem.events.filter(mine), 'Event', '.']]) {
    for (const x of list) {
      const key = c.name + sep + x.name;
      if (STUDIO_OWN.has(key) || x.name.startsWith('__')) continue; // our own (docs in datamodel.js), or internal
      const all = robloxMember(c.name, x.name, kind), r = all[0];
      if (!r) { missing.push(key + ' (not in Roblox)'); continue; }
      put(key, all.map(a => memberDoc('classes', a.owner, a.owner + sep + x.name)).find(Boolean));
      if (kind === 'Function') sigs[key] = [r.m.Parameters.map(p => [p.Name, luauType(p.Type), ...('Default' in p || OPTIONAL.has(`${r.owner}:${x.name}.${p.Name}`) ? [1] : [])]), luauType(r.m.ReturnType)];
      if (kind === 'Event') sigs[key] = [r.m.Parameters.map(p => [p.Name, luauType(p.Type)])];
    }
  }
}
// Datatypes the VM has (a global table, or a sample value of that type): summary; constructors,
// functions and constants (the VM's table) with their signatures; properties and methods (a sample
// answers them) with their types; and the operators the VM really applies to it (each one tried).
const OPS = { '+': '__add', '-': '__sub', '*': '__mul', '/': '__div', '//': '__idiv', '%': '__mod', '^': '__pow' };
for (const dt of dtPages) {
  if (!tables[dt] && !hasSample(dt)) continue;
  const y = yamlOf('datatypes', dt); put(dt, plain(y.summary));
  const lib = tables[dt] || new Set(), d = dts[dt] = { lib: !!tables[dt], p: {}, m: {}, o: {}, k: {} };
  // An overloaded constructor has a page entry per form: its summary is the first form that takes arguments (CFrame.new(pos), not the identity).
  const ctors = (y.constructors || []).filter(x => lib.has(tail(x.name)));
  for (const x of ctors) { addFn(x.name, docFn(x, dt)); if (!docs[x.name]) put(x.name, plain((ctors.find(c => c.name === x.name && (c.parameters || []).length) || x).summary)); }
  for (const x of y.functions || []) if (lib.has(tail(x.name))) { put(x.name, plain(x.summary)); addFn(x.name, docFn(x)); }
  for (const x of y.constants || []) if (lib.has(tail(x.name))) { put(x.name, plain(x.summary)); d.k[tail(x.name)] = docType(x.type); }
  const inst = [...(y.properties || []), ...(y.methods || [])], ok = answers(dt, inst.map(x => tail(x.name)));
  for (const x of y.properties || []) if (ok.has(tail(x.name))) { put(x.name, plain(x.summary)); d.p[tail(x.name)] = docType(x.type); }
  for (const x of y.methods || []) if (ok.has(tail(x.name))) { put(x.name, plain(x.summary)); d.m[tail(x.name)] = docFn(x); }
  const ops = (y.math_operations || []).filter(o => OPS[o.operation] && (o.type_b === 'number' || SAMPLE[o.type_b]));
  const works = new Set(ask(ops.map((o, i) => `if pcall(function() return (${SAMPLE[dt]}) ${o.operation} (${o.type_b === 'number' ? '2' : SAMPLE[o.type_b]}) end) then print("@op ${i}") end`).join('\n') +
    `\nif pcall(function() return -(${SAMPLE[dt]}) end) then print("@unm") end`));
  ops.forEach((o, i) => { if (works.has('@op ' + i)) (d.o[OPS[o.operation]] ||= []).push([docType(o.type_b), docType(o.return_type)]); });
  if (works.has('@unm')) d.o.__unm = [[null, dt]];
}
// Arguments a datatype's functions really need: the VM is called with the first k arguments (sample
// values of their types) for each k, and parameters past the fewest that work become optional
// (Roblox's Vector2.new() is (0, 0) though the docs list x and y without defaults). Only ever loosens.
const sampleArg = t => t === 'number' ? '1' : t === 'string' ? '"a"' : t === 'boolean' ? 'true' : t === '{any}' ? '{}' : SAMPLE[t] ? `(${SAMPLE[t]})`
  : t.startsWith('Enum.') && ENUMS[t.slice(5)] ? `${t}.${Object.keys(ENUMS[t.slice(5)])[0]}` : null;
for (const [k, list] of Object.entries(fns)) {
  if (!dts[k.split('.')[0]]) continue;
  list.forEach((f, oi) => {
    const args = f[0].map(([n, t]) => n === '...' ? null : sampleArg(t)), need = f[0].findIndex(p => p[0] === '...' || p[2]), n = need < 0 ? f[0].length : need;
    if (n === 0 || args.slice(0, n).some(a => a == null)) return;
    const other = new Set(list.filter(g => g !== f).map(g => g[0].length)); // a count another overload takes is that one's
    const ok = ask(Array.from({ length: n }, (_, j) => other.has(j) ? '' : `if pcall(function() return ${k}(${args.slice(0, j).join(', ')}) end) then print("@k ${j}") end`).join('\n')).filter(l => l.startsWith('@k ')).map(l => +l.slice(3));
    if (ok.length) { const min = Math.min(...ok); f[0].forEach((p, j) => { if (j >= min && p[0] !== '...' && !p[2]) p[2] = 1; }); }
  });
}
// Libraries: the ones the VM has, and their members it has, with signatures.
for (const lib of libNames) {
  if (!tables[lib]) continue;
  const y = yamlOf('libraries', lib); put(lib, plain(y.summary));
  for (const x of y.functions || []) if (tables[lib].has(tail(x.name))) { put(x.name, plain(x.summary)); addFn(x.name, docFn(x)); }
  for (const x of y.properties || []) if (tables[lib].has(tail(x.name))) put(x.name, plain(x.summary));
}
// Globals: Luau's and Roblox's, those the VM has, functions with signatures.
for (const g of ['LuaGlobals', 'RobloxGlobals']) {
  const y = yamlOf('globals', g), all = [...(y.functions || []), ...(y.properties || [])], has = hasGlobal(all.map(x => x.name));
  has.add('script'); // each script's own (set when it runs, so this bare VM hasn't one)
  for (const x of all) if (has.has(x.name) && !tables[x.name] && !dts[x.name]) put(x.name, plain(x.summary));
  for (const x of y.functions || []) if (has.has(x.name) && !tables[x.name] && !dts[x.name]) addFn(x.name, docFn(x));
}
// Instance.new's own page, for its hover (the checker declares it per class).
for (const x of yamlOf('datatypes', 'Instance').constructors || []) addFn(x.name, docFn(x, 'Instance'));
// Methods the VM gives instances outside the class table (Workspace:Raycast, Camera:ScreenPointToRay):
// each Roblox method of an engine class that a real instance of it answers, under the nearest engine class.
for (const c of engineClasses) {
  const make = c.service ? `game:GetService(${JSON.stringify(c.name)})` : c.creatable ? `Instance.new(${JSON.stringify(c.name)})` : null; if (!make || !DUMP[c.name]) continue;
  const known = new Set(membersOf(c.name).methods.map(m => m.name)), cand = [];
  for (let r = DUMP[c.name]; r; r = DUMP[r.Superclass]) for (const m of r.Members) if (m.MemberType === 'Function' && !known.has(m.Name) && !cand.some(x => x.m.Name === m.Name)) cand.push({ owner: r.Name, m });
  if (!cand.length) continue;
  const got = new Set(ask(`local ok, i = pcall(function() return ${make} end) if ok and i then for _, n in {${cand.map(x => JSON.stringify(x.m.Name)).join(',')}} do
  local ok2, f = pcall(function() return i[n] end); if ok2 and type(f) == "function" then print("@x " .. n) end end end`).filter(l => l.startsWith('@x ')).map(l => l.slice(3)));
  for (const { owner, m } of cand) {
    if (!got.has(m.Name)) continue;
    let base = c.name; for (let a = c.base; a; a = engineClasses.find(e => e.name === a).base) if ((extra[a] || []).includes(m.Name)) base = null;
    if (!base || (extra[c.name] || []).includes(m.Name)) continue;
    (extra[c.name] ||= []).push(m.Name);
    put(`${c.name}:${m.Name}`, memberDoc('classes', owner, `${owner}:${m.Name}`));
    sigs[`${c.name}:${m.Name}`] = [m.Parameters.map(p => [p.Name, luauType(p.Type), ...('Default' in p ? [1] : [])]), luauType(m.ReturnType)];
  }
}
// Enums: each enum type. (Not their items: those summaries were 20 KB of the file and mostly said
// little, e.g. Material.Neon's "Applies to BasePart only.")
for (const e of Object.keys(ENUMS)) {
  if (STUDIO_OWN.has('Enum.' + e)) continue;
  const y = yamlOf('enums', e); if (!y) { missing.push('Enum.' + e); continue; }
  put('Enum.' + e, plain(y.summary));
}

const rev = (() => { try { return execFileSync('git', ['-C', docsRoot, 'log', '-1', '--format=%h %cs'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const out = { source: `Summaries: Roblox/creator-docs ${rev}, CC-BY-4.0. Types: Roblox-Client-Tracker Full-API-Dump.json ${dump.Version === 1 ? '' : dump.Version}${fs.existsSync(path.join(ENGINE, 'STUDIO_VERSION')) ? 'for Studio ' + fs.readFileSync(path.join(ENGINE, 'STUDIO_VERSION'), 'utf8').trim().split(/\s+/)[0] : ''}.`, docs, sigs, fns, dts, extra };
const json = JSON.stringify(out);
fs.writeFileSync(OUT, json + '\n');
const { gzipSync } = await import('node:zlib');
console.log(`apidocs.json: ${Object.keys(docs).length} summaries, ${Object.keys(sigs).length} member signatures, ${Object.keys(fns).length} functions, ${Object.keys(dts).length} datatypes (${Object.keys(dts).join(' ')}), extra methods ${JSON.stringify(extra)}, ${json.length} bytes (${gzipSync(json).length} gzipped)`);
if (missing.length) console.log(`no summary (${missing.length}): ${missing.join(', ')}`);
}
