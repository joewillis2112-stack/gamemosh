// The Instance tree: classes, properties, methods and events, following the
// shapes in Roblox's public API reference so Luau scripts read the same.
// Luau reaches it through `host` (see bridge in luau.js): values cross as
// {t, n, s, v} with the tags in binding.cpp.
export const T = { NIL: 0, BOOL: 1, NUM: 2, STR: 3, VEC: 4, INST: 5, METHOD: 6, SIGNAL: 7, ERR: 8, LIST: 9, COLOR: 10, ENUM: 11 };
// Vector3 values are tagged so a list of three numbers isn't mistaken for one.
export class V3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
// Color3: components 0..1 (sRGB, as Roblox stores them).
export class C3 { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } }

// Enums, with Roblox's documented values. Enum-typed properties store the
// item's name (what the renderer reads); scripts see EnumItems.
export const ENUMS = {
  Material: {
    Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Marble: 784, Basalt: 788, Slate: 800,
    CrackedLava: 804, Concrete: 816, Limestone: 820, Granite: 832, Pavement: 836, Brick: 848, Pebble: 864, Cobblestone: 880,
    Rock: 896, Sandstone: 912, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072, Metal: 1088, Grass: 1280, LeafyGrass: 1284,
    Sand: 1296, Fabric: 1312, Snow: 1328, Mud: 1344, Ground: 1360, Asphalt: 1376, Salt: 1392, Ice: 1536, Glacier: 1552,
    Glass: 1568, ForceField: 1584, Air: 1792, Water: 2048, Cardboard: 2304, Carpet: 2305, CeramicTiles: 2306,
    ClayRoofTiles: 2307, RoofShingles: 2308, Leather: 2309, Plaster: 2310, Rubber: 2311,
  },
  PartType: { Ball: 0, Block: 1, Cylinder: 2, Wedge: 3, CornerWedge: 4 },
  NormalId: { Right: 0, Top: 1, Back: 2, Left: 3, Bottom: 4, Front: 5 },
};
export class EnumItem { constructor(type, name, value) { this.type = type; this.name = name; this.value = value; } }
function enumItem(type, nameOrValue) {
  const E = ENUMS[type];
  if (!E) return null;
  if (typeof nameOrValue === 'string') return nameOrValue in E ? new EnumItem(type, nameOrValue, E[nameOrValue]) : null;
  const name = Object.keys(E).find(k => E[k] === nameOrValue);
  return name ? new EnumItem(type, name, E[name]) : null;
}

// ------------------------------------------------------------------ classes
// Each class: parent class, properties {name: [type, default]}, methods, events.
const CLASSES = {};
function defineClass(name, base, { props = {}, methods = {}, events = [], creatable = true, service = false } = {}) {
  CLASSES[name] = { name, base, props, methods, events, creatable, service };
}
function lookup(cls, field, key) {
  for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) if (key in c[field]) return c[field][key];
  return undefined;
}
function hasEvent(cls, ev) {
  for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) if (c.events.includes(ev)) return true;
  return false;
}
export function isA(cls, other) {
  for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) if (c.name === other) return true;
  return false;
}

defineClass('Instance', null, {
  creatable: false,
  props: { Name: ['string', ''], Archivable: ['bool', true] },
  methods: {
    GetChildren(self) { return [self.children.slice()]; },
    GetDescendants(self) { const out = []; const walk = i => i.children.forEach(c => { out.push(c); walk(c); }); walk(self); return [out]; },
    FindFirstChild(self, name, recursive) {
      const walk = i => { for (const c of i.children) { if (c.Name === name) return c; if (recursive) { const r = walk(c); if (r) return r; } } return null; };
      return [walk(self)];
    },
    FindFirstChildOfClass(self, cls) { return [self.children.find(c => c.ClassName === cls) || null]; },
    FindFirstChildWhichIsA(self, cls) { return [self.children.find(c => isA(c.ClassName, cls)) || null]; },
    FindFirstAncestor(self, name) { for (let p = self.parent; p; p = p.parent) if (p.Name === name) return [p]; return [null]; },
    IsA(self, cls) { return [isA(self.ClassName, cls)]; },
    IsDescendantOf(self, other) { for (let p = self.parent; p; p = p.parent) if (p === other) return [true]; return [false]; },
    Destroy(self) { self.dm.destroy(self); return []; },
    ClearAllChildren(self) { for (const c of self.children.slice()) self.dm.destroy(c); return []; },
    GetFullName(self) { const n = []; for (let i = self; i && i.parent; i = i.parent) n.unshift(i.Name); return [n.join('.')]; },
    WaitForChild(self, name) { return [self.children.find(c => c.Name === name) || null]; },
  },
  events: ['ChildAdded', 'ChildRemoved', 'Changed', 'Destroying'],
});
defineClass('DataModel', 'Instance', { creatable: false, methods: { GetService(self, name) { return [self.dm.service(name)]; } } });
defineClass('Workspace', 'Instance', { creatable: false, service: true, props: { Gravity: ['number', 196.2] } });
defineClass('Folder', 'Instance');
defineClass('Model', 'Instance', { props: { PrimaryPart: ['Instance', null] } });
defineClass('BasePart', 'Instance', {
  creatable: false,
  props: {
    Position: ['Vector3', [0, 0, 0]], Orientation: ['Vector3', [0, 0, 0]], Size: ['Vector3', [4, 1, 2]],
    Anchored: ['bool', false], CanCollide: ['bool', true], CanTouch: ['bool', true], Transparency: ['number', 0],
    Color: ['Color3', [163 / 255, 162 / 255, 165 / 255]], Material: ['Enum.Material', 'Plastic'], Reflectance: ['number', 0],
  },
  events: ['Touched', 'TouchEnded'],
});
defineClass('Part', 'BasePart', { props: { Shape: ['Enum.PartType', 'Block'] } });
defineClass('SpawnLocation', 'Part');
// A wedge: its sloped face is the front (-Z), rising to the back (+Z) top edge.
defineClass('WedgePart', 'BasePart');
// Images on a part's face. Texture tiles in studs; Decal stretches. Built-in
// images: "studio://grid" (the baseplate grid). Roblox asset ids aren't available.
defineClass('Decal', 'Instance', { props: { Texture: ['string', ''], Face: ['Enum.NormalId', 'Front'], Transparency: ['number', 0], Color3: ['Color3', [1, 1, 1]] } });
defineClass('Texture', 'Decal', { props: { StudsPerTileU: ['number', 2], StudsPerTileV: ['number', 2], OffsetStudsU: ['number', 0], OffsetStudsV: ['number', 0] } });
defineClass('LuaSourceContainer', 'Instance', { creatable: false, props: { Source: ['string', ''], Enabled: ['bool', true] } });
defineClass('Script', 'LuaSourceContainer');
defineClass('LocalScript', 'LuaSourceContainer');
defineClass('ModuleScript', 'LuaSourceContainer');
defineClass('Lighting', 'Instance', { creatable: false, service: true, props: { ClockTime: ['number', 14], Brightness: ['number', 2] } });
// Players and characters. Single-player for now: one Player joins after the
// place's scripts have run (so PlayerAdded handlers see it, as in Roblox).
defineClass('Players', 'Instance', {
  creatable: false, service: true,
  props: { LocalPlayer: ['Instance', null], RespawnTime: ['number', 5], CharacterAutoLoads: ['bool', true] },
  methods: {
    GetPlayers(self) { return [self.children.filter(c => c.ClassName === 'Player')]; },
    GetPlayerFromCharacter(self, m) { return [self.children.find(p => p.ClassName === 'Player' && m && p.props.Character === m) || null]; },
  },
  events: ['PlayerAdded', 'PlayerRemoving'],
});
defineClass('Player', 'Instance', {
  creatable: false,
  props: { UserId: ['number', 1], DisplayName: ['string', ''], Character: ['Instance', null], RespawnLocation: ['Instance', null], AutoJumpEnabled: ['bool', true] },
  methods: { LoadCharacter(self) { self.dm.hooks.loadCharacter && self.dm.hooks.loadCharacter(self); return []; } },
  events: ['CharacterAdded', 'CharacterRemoving'],
});
defineClass('Humanoid', 'Instance', {
  props: {
    Health: ['number', 100], MaxHealth: ['number', 100], WalkSpeed: ['number', 16], JumpPower: ['number', 50],
    JumpHeight: ['number', 7.2], UseJumpPower: ['bool', true], AutoJumpEnabled: ['bool', true], MaxSlopeAngle: ['number', 89],
    HipHeight: ['number', 2], Jump: ['bool', false], MoveDirection: ['Vector3', [0, 0, 0]], FloorMaterial: ['Enum.Material', 'Air'],
  },
  methods: {
    TakeDamage(self, amount) { self.dm.set(self, 'Health', Math.max(0, self.props.Health - (+amount || 0))); return []; },
  },
  events: ['Died', 'HealthChanged', 'Jumping', 'Running', 'FreeFalling', 'Touched'],
});
defineClass('BoolValue', 'Instance', { props: { Value: ['bool', false] } });
defineClass('NumberValue', 'Instance', { props: { Value: ['number', 0] } });
defineClass('IntValue', 'Instance', { props: { Value: ['number', 0] } });
defineClass('StringValue', 'Instance', { props: { Value: ['string', ''] } });

// ------------------------------------------------------------------ instances
export class Instance {
  constructor(dm, cls) {
    this.dm = dm;
    this.ClassName = cls;
    this.parent = null;
    this.children = [];
    this.props = {};
    for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) {
      for (const [k, [ty, d]] of Object.entries(c.props)) if (!(k in this.props)) this.props[k] = ty === 'Vector3' ? new V3(...d) : ty === 'Color3' ? new C3(...d) : d;
    }
    this.props.Name = cls;
    this.handle = dm.register(this);
  }
  get Name() { return this.props.Name; }
}

export class DataModel {
  constructor() {
    this.byHandle = [null];
    this.conns = new Map(); // id -> {inst, ev, ref, once}
    this.nextConn = 1;
    this.onFire = null; // (ref, args) -> void, set by the Luau bridge
    this.watchers = []; // (inst, key) -> void: the renderer, the player runtime
    this.hooks = {};    // runtime callbacks the API needs (e.g. Player:LoadCharacter)
    this.game = new Instance(this, 'DataModel');
    this.game.props.Name = 'Game';
    this.services = {};
    this.workspace = this.service('Workspace');
    this.service('Lighting');
  }
  register(inst) { this.byHandle.push(inst); return this.byHandle.length - 1; }
  service(name) {
    if (!this.services[name]) {
      if (!CLASSES[name] || !CLASSES[name].service) return null;
      const s = new Instance(this, name);
      this.services[name] = s;
      this.setParent(s, this.game);
    }
    return this.services[name];
  }
  create(cls) { return CLASSES[cls] && CLASSES[cls].creatable ? new Instance(this, cls) : null; }

  fire(inst, ev, args) {
    for (const [id, c] of [...this.conns]) {
      if (c.inst !== inst || c.ev !== ev) continue;
      if (c.once) this.conns.delete(id);
      this.onFire && this.onFire(c.ref, args);
    }
  }
  setParent(inst, p) {
    if (inst.parent === p) return;
    if (p && (p === inst || isDescendant(p, inst))) throw new Error(`Attempt to set ${inst.Name}.Parent to a descendant`);
    const old = inst.parent;
    if (old) { old.children.splice(old.children.indexOf(inst), 1); this.fire(old, 'ChildRemoved', [inst]); }
    inst.parent = p;
    if (p) { p.children.push(inst); this.fire(p, 'ChildAdded', [inst]); }
    this.notify(inst, 'Parent');
    this.fire(inst, 'Changed', ['Parent']);
  }
  destroy(inst) {
    this.fire(inst, 'Destroying', []);
    for (const c of inst.children.slice()) this.destroy(c);
    this.setParent(inst, null);
    inst.destroyed = true;
    for (const [id, c] of [...this.conns]) if (c.inst === inst) this.conns.delete(id);
  }
  set(inst, key, value) {
    if (key === 'Parent') return this.setParent(inst, value);
    if (inst.ClassName === 'Humanoid' && key === 'Health') value = Math.min(Math.max(value, 0), inst.props.MaxHealth); // as Roblox clamps it
    inst.props[key] = value;
    this.notify(inst, key);
    this.fire(inst, 'Changed', [key]);
  }
  watch(fn) { this.watchers.push(fn); }
  notify(inst, key) { for (const w of this.watchers) w(inst, key); }
}
function isDescendant(a, b) { for (let p = a.parent; p; p = p.parent) if (p === b) return true; return false; }

// ------------------------------------------------------------------ the Luau-facing host
// Converts between JS values and the {t, n, s, v} channel.
function typeOf(cls, key) {
  for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) if (key in c.props) return c.props[key][0];
  return undefined;
}

export function makeHost(dm, log = console.log) {
  const host = {
    ret: [], args: [],
    // Flatten value v into list `o` (lists become {LIST, n} then their items).
    put(o, v) {
      if (v === null || v === undefined) o.push({ t: T.NIL });
      else if (typeof v === 'boolean') o.push({ t: T.BOOL, n: v ? 1 : 0 });
      else if (typeof v === 'number') o.push({ t: T.NUM, n: v });
      else if (typeof v === 'string') o.push({ t: T.STR, s: v });
      else if (v instanceof Instance) o.push({ t: T.INST, n: v.handle });
      else if (v instanceof V3) o.push({ t: T.VEC, v: [v.x, v.y, v.z] });
      else if (v instanceof C3) o.push({ t: T.COLOR, v: [v.r, v.g, v.b] });
      else if (v instanceof EnumItem) o.push({ t: T.ENUM, s: v.type + '.' + v.name, n: v.value });
      else if (Array.isArray(v)) { o.push({ t: T.LIST, n: v.length }); v.forEach(x => host.put(o, x)); }
      else o.push({ t: T.NIL });
      return o;
    },
    out(v) { return host.put([], v)[0]; },
    in(a) {
      switch (a.t) {
        case T.NIL: return null;
        case T.BOOL: return !!a.n;
        case T.NUM: return a.n;
        case T.STR: return a.s;
        case T.VEC: return new V3(a.v[0], a.v[1], a.v[2]);
        case T.COLOR: return new C3(a.v[0], a.v[1], a.v[2]);
        case T.ENUM: { const [type, name] = a.s.split('.'); return new EnumItem(type, name, a.n); }
        case T.INST: return dm.byHandle[a.n];
      }
      return null;
    },
    err(msg) { host.ret = [{ t: T.ERR, s: msg }]; },
    enumType(type) { return !!ENUMS[type]; },
    enumValue(type, name) { const E = ENUMS[type]; return E && name in E ? E[name] : null; },
    enumItems(type) { const E = ENUMS[type] || {}; host.ret = Object.entries(E).map(([k, v]) => ({ t: T.ENUM, s: type + '.' + k, n: v })); return host.ret.length; },
    global(name) { return name === 'game' ? dm.game.handle : name === 'workspace' ? dm.workspace.handle : 0; },
    newInstance(cls) { const i = dm.create(cls); return i ? i.handle : 0; },
    index(h, key) {
      const inst = dm.byHandle[h];
      if (key === 'Parent') { host.ret = host.put([], inst.parent); return 1; }
      if (key === 'ClassName') { host.ret = host.put([], inst.ClassName); return 1; }
      if (key in inst.props) {
        const ty = typeOf(inst.ClassName, key);
        const v = inst.props[key];
        host.ret = host.put([], ty && ty.startsWith('Enum.') && typeof v === 'string' ? enumItem(ty.slice(5), v) : v);
        return 1;
      }
      if (lookup(inst.ClassName, 'methods', key)) { host.ret = [{ t: T.METHOD }]; return 1; }
      if (hasEvent(inst.ClassName, key)) { host.ret = [{ t: T.SIGNAL }]; return 1; }
      const child = inst.children.find(c => c.Name === key);
      if (child) { host.ret = host.put([], child); return 1; }
      if (inst.ClassName === 'DataModel' && dm.service(key)) { host.ret = host.put([], dm.service(key)); return 1; }
      host.err(`${key} is not a valid member of ${inst.ClassName} "${inst.Name}"`);
      return 1;
    },
    newindex(h, key) {
      const inst = dm.byHandle[h];
      const v = host.in(host.args[0]);
      host.ret = [];
      if (key === 'Parent') {
        if (v !== null && !(v instanceof Instance)) return host.err('Parent must be an Instance');
        try { dm.setParent(inst, v); } catch (e) { host.err(e.message); }
        return;
      }
      const ty = typeOf(inst.ClassName, key);
      if (!ty) return host.err(`${key} is not a valid member of ${inst.ClassName} "${inst.Name}"`);
      const ok = { string: 'string', number: 'number', bool: 'boolean' }[ty];
      if (ok && typeof v !== ok) return host.err(`Unable to assign property ${key}. ${ty} expected, got ${v === null ? 'nil' : typeof v}`);
      if (ty === 'Vector3' && !(v instanceof V3)) return host.err(`Unable to assign property ${key}. Vector3 expected`);
      if (ty === 'Color3' && !(v instanceof C3)) return host.err(`Unable to assign property ${key}. Color3 expected`);
      if (ty.startsWith('Enum.')) {
        // An EnumItem of this type, its name, or its number, as Roblox accepts.
        const type = ty.slice(5);
        const item = v instanceof EnumItem ? (v.type === type ? v : null) : (typeof v === 'string' || typeof v === 'number') ? enumItem(type, v) : null;
        if (!item) return host.err(`Unable to assign property ${key}. Invalid value ${v instanceof EnumItem ? 'Enum.' + v.type + '.' + v.name : JSON.stringify(v)} for enum ${type}`);
        return dm.set(inst, key, item.name);
      }
      if (ty === 'Instance' && v !== null && !(v instanceof Instance)) return host.err(`Unable to assign property ${key}. Instance expected`);
      dm.set(inst, key, v);
    },
    call(h, method) {
      const inst = dm.byHandle[h];
      const fn = lookup(inst.ClassName, 'methods', method);
      if (!fn) { host.err(`${method} is not a valid member of ${inst.ClassName}`); return 1; }
      let res;
      try { res = fn(inst, ...host.args.map(host.in)); } catch (e) { host.err(e.message); return 1; }
      host.ret = [];
      res.forEach(r => host.put(host.ret, r));
      return res.length;
    },
    connect(h, ev, ref) {
      const id = dm.nextConn++;
      // ref < 0: a thread waiting in Signal:Wait(), resumed once.
      dm.conns.set(id, { inst: dm.byHandle[h], ev, ref, once: ref < 0 });
      return id;
    },
    disconnect(id) { dm.conns.delete(id); },
    print(s, level) { log(s, level); },
  };
  return host;
}
