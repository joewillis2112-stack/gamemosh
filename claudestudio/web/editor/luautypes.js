// Type definitions (Luau's definition-file syntax, `declare extern type X with ... end`) for the script checker (web/luaucheck.mjs, Luau's own type checker), generated
// from what the engine really has: every class in the class table with its properties (their real
// types), methods and events; Instance.new and GetService typed per class; Enum types; the VM's
// libraries (from autocomplete's probe); and, as Roblox Studio does, the open place's own
// instance tree, so `workspace.Baseplate` is a Part (a child that only exists at run time isn't
// known: use WaitForChild, as in Studio). Datatypes (Vector3, CFrame...) and method signatures are
// `any`: the engine doesn't record their member types or parameter types, and a guess would flag
// correct code.
import { allClasses, membersOf, serviceClasses, ENUMS, DataModel } from '../datamodel.js';

const DATATYPES = ['Vector3', 'Vector2', 'CFrame', 'Color3', 'UDim', 'UDim2', 'TweenInfo', 'BrickColor', 'Ray', 'NumberRange', 'NumberSequence', 'ColorSequence', 'RaycastParams', 'Rect', 'RaycastResult'];
const LUAU_LIBS = new Set(['math', 'string', 'table', 'coroutine', 'bit32', 'utf8', 'os', 'debug', 'buffer']); // Luau's own: its checker already knows them

function luauType(t, opts) {
  if (t === 'number' || t === 'string') return t;
  if (t === 'bool') return 'boolean';
  if (t === 'Instance') return opts.instanceProps;
  if (t.startsWith('Enum.')) return 'EnumItem';
  return 'any'; // datatypes
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
  for (const d of DATATYPES) out.push(`type ${d} = any`, `declare ${d}: any`);
  out.push('declare extern type EnumItem with', '  Name: string', '  Value: number', '  EnumType: any', 'end');
  out.push('declare extern type RBXScriptConnection with', '  Connected: boolean', '  function Disconnect(self): ()', 'end');
  out.push('declare extern type RBXScriptSignal with', '  function Connect(self, callback: (...any) -> ...any): RBXScriptConnection', '  function Once(self, callback: (...any) -> ...any): RBXScriptConnection', '  function Wait(self): ...any', 'end');
  const classes = allClasses();
  for (const c of classes) {
    const own = membersOf(c.name), base = c.base && membersOf(c.base);
    const inherited = k => base && [...base.props, ...base.methods, ...base.events].some(x => x.name === k);
    out.push(`declare extern type ${c.name}${c.base ? ' extends ' + c.base : ''} with`);
    if (c.name === 'Instance') out.push('  ClassName: string', `  Parent: ${opts.instanceProps}`);
    for (const p of own.props) if (!inherited(p.name)) out.push(`  ${p.name}: ${luauType(p.type, opts)}`);
    for (const e of own.events) if (!inherited(e.name)) out.push(`  ${e.name}: RBXScriptSignal`);
    for (const m of own.methods) if (!inherited(m.name)) out.push(`  function ${m.name}(self, ...: any): ...any`);
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
  for (const f of ['wait', 'delay', 'spawn', 'tick', 'time', 'warn', 'settings']) out.push(`declare function ${f}(...: any): ...any`);
  for (const [lib, keys] of Object.entries(libs)) if (!LUAU_LIBS.has(lib) && !DATATYPES.includes(lib) && lib !== 'Instance')
    out.push(`declare ${lib}: { ${keys.map(k => `${k}: (...any) -> ...any`).join(', ')} }`);
  void services;
  return out.join('\n') + '\n';
}

/** A checker message in Studio's words: "class 'Workspace'", not our generated "external type 'Live5'". */
export function readable(message) {
  return message.replace(/external type '(\w+)'/g, (_, t) => `class '${LIVE_CLASS[t] || t}'`).replace(/\bLive(\d+|Game)\b/g, t => LIVE_CLASS[t] || t);
}
