// A place as a file: the DataModel's saved services and their instances, as JSON.
// What's saved is what Roblox Studio saves: every service but the runtime ones'
// contents (Players' players, characters in Workspace), each instance's class,
// its properties that differ from the class's defaults, and its children.
// Engine-written properties (read-only to scripts) and ones derived from others
// (a part's Position and Orientation, from its CFrame) aren't saved. References
// (a Model's PrimaryPart, Workspace.CurrentCamera) are saved as ids inside the
// file and come back pointing at the loaded copies; ones pointing outside the
// saved tree come back nil.
import { DataModel, Instance, V3, V2, C3, UDim, UDim2, isA, propertiesOf } from './datamodel.js';
import { CF } from './cframe.js';

export const PLACE_FORMAT = 'claudestudio-place';
export const PLACE_VERSION = 1;
// Services saved, in Studio's Explorer order.
const SAVED = ['Workspace', 'Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'SoundService'];
const DERIVED = new Set(['Position', 'Orientation']);
const RUNTIME_CHILDREN = new Set(['Players']); // its children are joined players, not place content

let defaultsDm = null;
const defaults = new Map();
function defaultsOf(cls) {
  // A fresh instance of the class (services and other non-creatable classes too).
  if (!defaults.has(cls)) { defaultsDm = defaultsDm || new DataModel(); defaults.set(cls, new Instance(defaultsDm, cls)); }
  return defaults.get(cls).props;
}

function encode(type, v, ids) {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'number': return Number.isFinite(v) ? v : undefined;
    case 'string': case 'bool': return v;
    case 'Vector3': return [v.x, v.y, v.z];
    case 'Vector2': return [v.x, v.y];
    case 'Color3': return [v.r, v.g, v.b];
    case 'CFrame': return [...v.m];
    case 'UDim': return [v.s, v.o];
    case 'UDim2': return [v.xs, v.xo, v.ys, v.yo];
    case 'Instance': return ids.has(v) ? { ref: ids.get(v) } : null;
    default: return type.startsWith('Enum.') ? (v.name || v) : undefined; // TweenInfo and other runtime-only types aren't saved
  }
}
function decode(type, v) {
  if (v === null) return null;
  switch (type) {
    case 'Vector3': return new V3(v[0], v[1], v[2]);
    case 'Vector2': return new V2(v[0], v[1]);
    case 'Color3': return new C3(v[0], v[1], v[2]);
    case 'CFrame': return new CF(v);
    case 'UDim': return new UDim(v[0], v[1]);
    case 'UDim2': return new UDim2(v[0], v[1], v[2], v[3]);
    default: return v;
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The place file (a JSON-ready object) for a DataModel. */
export function savePlace(dm) {
  // Ids for every saved instance first, so references can point forward.
  const ids = new Map(), order = [];
  const keep = inst => !inst.isCharacter && inst.props.Archivable !== false;
  const collect = (inst, top) => { ids.set(inst, ids.size); order.push(inst); if (!(top && RUNTIME_CHILDREN.has(inst.ClassName))) for (const c of inst.children) if (keep(c)) collect(c, false); };
  for (const name of SAVED) if (dm.services[name]) collect(dm.services[name], true);
  const props = inst => {
    const out = {}, d = defaultsOf(inst.ClassName);
    for (const p of propertiesOf(inst.ClassName)) {
      if (p.readOnly || DERIVED.has(p.name) && inst.props.CFrame) continue;
      const v = encode(p.type, inst.props[p.name], ids);
      if (v === undefined) continue;
      const dv = p.name === 'Name' ? inst.ClassName : encode(p.type, d[p.name], new Map());
      if (!same(v, dv)) out[p.name] = v;
    }
    return out;
  };
  const node = (inst, top) => {
    const n = { class: inst.ClassName, id: ids.get(inst), props: props(inst) };
    const kids = top && RUNTIME_CHILDREN.has(inst.ClassName) ? [] : inst.children.filter(c => ids.has(c));
    if (kids.length) n.children = kids.map(c => node(c, false));
    return n;
  };
  return { format: PLACE_FORMAT, version: PLACE_VERSION, services: SAVED.filter(n => dm.services[n]).map(n => node(dm.services[n], true)) };
}

/** Load a place file into a fresh DataModel (its services already exist). Returns the warnings. */
export function loadPlace(dm, file) {
  if (!file || file.format !== PLACE_FORMAT) throw new Error('not a Claude Studio place file');
  if (file.version > PLACE_VERSION) throw new Error(`place file version ${file.version} is newer than this studio's (${PLACE_VERSION})`);
  const warnings = [], byId = new Map(), refs = [], claimed = new Set();
  const apply = (inst, props) => {
    const types = new Map(propertiesOf(inst.ClassName).map(p => [p.name, p.type]));
    for (const [k, v] of Object.entries(props || {})) {
      const ty = types.get(k);
      if (!ty) { warnings.push(`${inst.ClassName}.${k} isn't a property (skipped)`); continue; }
      if (ty === 'Instance') { refs.push([inst, k, v]); continue; }
      inst.props[k] = decode(ty, v);
    }
    // A part's derived properties follow its CFrame.
    if (inst.props.CFrame && isA(inst.ClassName, 'BasePart')) { const cf = inst.props.CFrame; inst.props.Position = new V3(cf.x, cf.y, cf.z); inst.props.Orientation = new V3(...cf.toOrientation()); }
  };
  const build = (n, parent) => {
    // A new DataModel already has some children (the Workspace's Camera, StarterPlayer's
    // script folders): load onto the matching one rather than add a second.
    const name = (n.props && n.props.Name) || n.class;
    let inst = parent.children.find(c => !claimed.has(c) && c.ClassName === n.class && c.props.Name === name) || dm.create(n.class);
    if (inst) claimed.add(inst);
    if (!inst) { warnings.push(`can't create a ${n.class} (skipped with its children)`); return; }
    byId.set(n.id, inst);
    apply(inst, n.props);
    if (inst.parent !== parent) dm.setParent(inst, parent); // parented complete, top-down, so watchers see each one whole
    for (const c of n.children || []) build(c, inst);
  };
  for (const s of file.services || []) {
    const svc = dm.service(s.class);
    if (!svc) { warnings.push(`no service ${s.class} (skipped)`); continue; }
    byId.set(s.id, svc);
    apply(svc, s.props);
    for (const c of s.children || []) build(c, svc);
  }
  for (const [inst, k, v] of refs) inst.props[k] = v && byId.has(v.ref) ? byId.get(v.ref) : null;
  return warnings;
}
