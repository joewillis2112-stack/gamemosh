// Type definitions (Luau's definition-file syntax, `declare extern type X with ... end`) for the script checker (web/luaucheck.mjs, Luau's own type checker), generated
// from what the engine really has: every class in the class table with its properties (their real
// types), methods and events; Instance.new and GetService typed per class; Enum types; the VM's
// libraries (from autocomplete's probe); and, as Roblox Studio does, the open place's own
// instance tree, so `workspace.Baseplate` is a Part (a child that only exists at run time isn't
// known: use WaitForChild, as in Studio). Methods and events take Roblox's own parameter and return
// types (apidocs.json, from Roblox's API dump), with two changes so working code isn't flagged: a
// method that returns a bare Instance (FindFirstChild, Clone, GetService by a name) or a list of
// them returns `any`, since the script knows better than the base class what it found (Roblox's
// checker narrows with IsA; ours can't); and a class or datatype the engine lacks is `any`.
// Datatypes are declared as the VM has them (apidocs.json's `dts`, asked from the VM): Roblox's
// properties, methods and constructors with their types, and only the operators the VM applies
// (`Vector3 + 5` is flagged, `cf * cf` is a CFrame); so are the task library and Roblox's globals.
// Methods the VM gives instances outside the class table (Workspace:Raycast) are declared too.
import { allClasses, membersOf, serviceClasses, ENUMS, DataModel } from '../datamodel.js';
import API from './apidocs.json' with { type: 'json' };

const DATATYPES = Object.keys(API.dts); // the ones the VM has
const LUAU_LIBS = new Set(['math', 'string', 'table', 'coroutine', 'bit32', 'utf8', 'os', 'debug', 'buffer']); // Luau's own: its checker already knows them

function luauType(t, opts) {
  if (t === 'number' || t === 'string') return t;
  if (t === 'bool') return 'boolean';
  if (t === 'Instance') return opts.instanceProps;
  if (t.startsWith('Enum.')) return 'EnumItem';
  return API.dts[t] ? t : 'any'; // a datatype the VM has
}
// A Roblox type from the API (apidocs.json's Luau spelling) as the checker gets it. ret: a return type.
const PLAIN = new Set(['number', 'string', 'boolean', 'any', '()', 'thread', '{any}', '{[any]: any}']);
// Split at a separator outside brackets ("A | (B) -> C" at " | ").
function splitTop(t, sep) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]; if ('({<'.includes(c)) depth++; else if (')}>'.includes(c) && t[i - 1] !== '-') depth--;
    else if (!depth && t.startsWith(sep, i)) { out.push(t.slice(from, i)); from = i + sep.length; i += sep.length - 1; }
  }
  return [...out, t.slice(from)];
}
function apiType(t, ret, classes) {
  if (t == null) return 'any';
  t = t.trim();
  if (PLAIN.has(t)) return t;
  const alts = splitTop(t, ' | ');
  if (alts.length > 1) { const a = alts.map(x => apiType(x, ret, classes)); return a.includes('any') ? 'any' : a.map(x => x.includes('->') ? `(${x})` : x).join(' | '); }
  if (t.endsWith('?')) { const a = apiType(t.slice(0, -1), ret, classes); return a === 'any' ? a : a.includes('->') ? `(${a})?` : a + '?'; }
  if (t.startsWith('...')) return '...' + apiType(t.slice(3), ret, classes);
  if (t.startsWith('(') && t.endsWith(')') && splitTop(t.slice(1, -1), ' -> ').length === 1) { // a tuple, or a function in brackets
    const inner = t.slice(1, -1); if (inner.includes('->')) return apiType(inner, ret, classes);
    return `(${splitTop(inner, ', ').map(x => apiType(x, ret, classes)).join(', ')})`;
  }
  if (t.includes('->')) return '(...any) -> ...any';
  if (t === '{Instance}') return ret ? '{any}' : t;
  if (t === 'Instance') return ret ? 'any' : t;
  if (t.startsWith('Enum.')) return 'EnumItem';
  if (classes.has(t)) return t;
  if (API.dts[t]) return t;
  return 'any'; // a class or datatype the engine lacks (InputObject, Path...), buffer, vector
}
const IDENTISH = /^[A-Za-z_]\w*$/;
// A parameter list: "name: T" ("name: T?" if it may be left out), "...: T" for the rest. fnType: as in a function type ("...T").
const paramList = (ps, classes, fnType) => ps.map(([n, t, opt]) => n === '...' ? (fnType ? '...' : '...: ') + apiType(t, false, classes) : `${n}: ${apiType(t, false, classes)}${opt ? '?' : ''}`);
const fnType = ([ps, r], classes, self) => `(${[...(self ? [`self: ${self}`] : []), ...paramList(ps, classes, true)].join(', ')}) -> ${apiType(r, true, classes)}`;
const overloads = (list, classes, self) => list.length === 1 ? fnType(list[0], classes, self) : list.map(f => `(${fnType(f, classes, self)})`).join(' & ');
function methodDecl(owner, name, classes) {
  const s = API.sigs[owner + ':' + name];
  if (!s || !IDENTISH.test(name)) return `  function ${name}(self, ...: any): ...any`;
  return `  function ${name}(${['self', ...paramList(s[0], classes)].join(', ')}): ${apiType(s[1], true, classes)}`;
}
// A datatype: its properties, methods and operators, and (if the VM has its table) its constructors and constants.
function datatypeDecl(dt, d, keys, classes, out) {
  out.push(`declare extern type ${dt} with`);
  for (const [k, t] of Object.entries(d.p)) out.push(`  ${k}: ${apiType(t, false, classes)}`);
  for (const [k, [ps, r]] of Object.entries(d.m)) out.push(`  function ${k}(${['self', ...paramList(ps, classes)].join(', ')}): ${apiType(r, true, classes)}`);
  for (const [mm, list] of Object.entries(d.o)) out.push(`  ${mm}: ${list.map(([b, r]) => `((self: ${dt}${b ? `, other: ${apiType(b, false, classes)}` : ''}) -> ${apiType(r, true, classes)})`).join(' & ')}`);
  out.push('end');
}
function libraryDecl(name, keys, consts = {}) {
  const fields = [...new Set([...keys, ...Object.keys(consts), ...Object.keys(API.fns).filter(k => k.startsWith(name + '.')).map(k => k.slice(name.length + 1))])].filter(k => IDENTISH.test(k));
  return `declare ${name}: { ${fields.map(k => { const f = API.fns[name + '.' + k]; return `${k}: ${f ? overloads(f, CLASSES) : consts[k] ? apiType(consts[k], true, CLASSES) : '(...any) -> ...any'}`; }).join(', ')} }`;
}
let CLASSES = new Set();
function eventDecl(owner, name, classes) {
  const s = API.sigs[owner + '.' + name];
  return `  ${name}: ${s ? `RBXScriptSignal<${s[0].map(([, t]) => apiType(t, false, classes)).join(', ')}>` : 'RBXScriptSignal'}`;
}

// The place's tree as types: one per instance with children (its class, plus a field per child
// whose name is an identifier), so paths into the place check. Depth- and size-limited.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/, MAX_LIVE = 2000;
const LIVE_CLASS = { LiveGame: 'DataModel' }; // generated type -> the class it is, for messages
function liveTypes(dm, out) {
  let n = 0;
  const typeOf = (inst, depth) => {
    const kids = inst.children.filter(c => IDENT.test(c.props.Name));
    if (!kids.length || depth > 12 || n > MAX_LIVE) return inst.ClassName;
    const fields = [], seen = new Set();
    for (const c of kids) { if (seen.has(c.props.Name)) continue; seen.add(c.props.Name); fields.push(`  ${c.props.Name}: ${typeOf(c, depth + 1)}`); }
    const name = `Live${++n}`; LIVE_CLASS[name] = inst.ClassName;
    out.push(`declare extern type ${name} extends ${inst.ClassName} with`, ...fields, 'end');
    return name;
  };
  return typeOf;
}

/** The definitions file. dm: the open place (its tree is typed), or null. opts.instanceProps: the type of Instance-valued properties. */
export function definitions(libs = {}, opts = {}, dm = null) {
  opts = { instanceProps: 'any', ...opts };
  const out = [];
  const classes = allClasses(), names = new Set(classes.map(c => c.name)); CLASSES = names;
  for (const [dt, d] of Object.entries(API.dts)) datatypeDecl(dt, d, libs[dt] || [], names, out);
  for (const [dt, d] of Object.entries(API.dts)) if (d.lib) out.push(libraryDecl(dt, (libs[dt] || []).filter(k => !(k in d.p) && !(k in d.m)), d.k));
  out.push('declare extern type EnumItem with', '  Name: string', '  Value: number', '  EnumType: any', 'end');
  out.push('declare extern type RBXScriptConnection with', '  Connected: boolean', '  function Disconnect(self): ()', 'end');
  // A signal passes its event's values (T...) to the handler, and Wait returns them.
  out.push('type RBXScriptSignal<T... = ...any> = {', '  Connect: (self: any, callback: (T...) -> ...any) -> RBXScriptConnection,', '  Once: (self: any, callback: (T...) -> ...any) -> RBXScriptConnection,', '  Wait: (self: any) -> T...,', '}');
  for (const c of classes) {
    const own = membersOf(c.name), base = c.base && membersOf(c.base);
    const inherited = k => base && [...base.props, ...base.methods, ...base.events].some(x => x.name === k);
    out.push(`declare extern type ${c.name}${c.base ? ' extends ' + c.base : ''} with`);
    if (c.name === 'Instance') out.push('  ClassName: string', `  Parent: ${opts.instanceProps}`);
    for (const p of own.props) if (!inherited(p.name)) out.push(`  ${p.name}: ${luauType(p.type, opts)}`);
    for (const e of own.events) if (!inherited(e.name)) out.push(eventDecl(e.owner, e.name, names));
    for (const m of own.methods) if (!inherited(m.name)) out.push(methodDecl(m.owner, m.name, names));
    for (const m of API.extra[c.name] || []) out.push(methodDecl(c.name, m, names)); // the VM's, outside the class table
    out.push('end');
  }
  const creatable = classes.filter(c => c.creatable && !c.service), services = classes.filter(c => c.service);
  // One overload per class (nonstrict lets a name held in a variable through; a misspelt literal isn't).
  out.push(`declare Instance: { new: ${creatable.map(c => `((className: "${c.name}", parent: any?) -> ${c.name})`).join(' & ')} }`);
  let gameType = 'DataModel', wsType = 'Workspace';
  if (dm) {
    // Every service (a place makes them on first use): the live tree where it exists, else the class.
    // A service the place hasn't made yet is typed as a fresh one (with the children the engine gives it,
    // e.g. StarterPlayer's StarterPlayerScripts), made in a throwaway DataModel, not the place.
    const typeOf = liveTypes(dm, out), fresh = new DataModel();
    const svcTypes = serviceClasses().filter(k => IDENT.test(k)).map(k => [k, typeOf(dm.services[k] || fresh.service(k), 1)]);
    wsType = (svcTypes.find(([k]) => k === 'Workspace') || [0, 'Workspace'])[1];
    out.push('declare extern type LiveGame extends DataModel with', ...svcTypes.map(([k, t]) => `  ${k}: ${t}`),
      ...(svcTypes.length ? [`  GetService: ${svcTypes.map(([k, t]) => `((self: any, name: "${k}") -> ${t})`).join(' & ')}`] : []), 'end');
    gameType = 'LiveGame';
  }
  out.push(`declare game: ${gameType}`, `declare workspace: ${wsType}`, `declare script: any`, `declare shared: { [any]: any }`);
  out.push(`declare Enum: { ${Object.keys(ENUMS).map(e => `${e}: { ${Object.keys(ENUMS[e]).map(i => `${i}: EnumItem`).join(', ')} }`).join(', ')} }`);
  for (const f of ['wait', 'delay', 'spawn', 'tick', 'time', 'warn', 'settings', 'UserSettings']) { // Roblox's globals: typed where the VM has them
    const s = API.fns[f]; out.push(s && s.length === 1 ? `declare function ${f}(${paramList(s[0][0], names).join(', ')}): ${apiType(s[0][1], true, names)}` : `declare function ${f}(...: any): ...any`);
  }
  for (const [lib, keys] of Object.entries(libs)) if (!LUAU_LIBS.has(lib) && !DATATYPES.includes(lib) && lib !== 'Instance') out.push(libraryDecl(lib, keys));
  void services;
  return out.join('\n') + '\n';
}

/** A checker message in Studio's words: "class 'Workspace'", not our generated "external type 'Live5'" (nor "table 'RBXScriptSignal<BasePart>'"). */
export function readable(message) {
  return message.replace(/external type '(\w+)'/g, (_, t) => `class '${LIVE_CLASS[t] || t}'`).replace(/table 'RBXScriptSignal(?:<[^']*>)?'/g, "class 'RBXScriptSignal'")
    .replace(/\bLive(\d+|Game)\b/g, t => LIVE_CLASS[t] || t);
}
