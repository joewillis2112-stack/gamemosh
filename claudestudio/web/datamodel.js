// The Instance tree: classes, properties, methods and events, following the
// shapes in Roblox's public API reference so Luau scripts read the same.
// Luau reaches it through `host` (see bridge in luau.js): values cross as
// {t, n, s, v} with the tags in binding.cpp.
import { CF } from './cframe.js';
import { ease, lerpValue } from './tween.js';
export { CF };
export const T = { NIL: 0, BOOL: 1, NUM: 2, STR: 3, VEC: 4, INST: 5, METHOD: 6, SIGNAL: 7, ERR: 8, LIST: 9, COLOR: 10, ENUM: 11, CFRAME: 12, DICT: 13, TWEENINFO: 14, UDIM: 15, UDIM2: 16, VEC2: 17 };
// UI datatypes: UDim (scale, integer offset), UDim2 (x and y UDims), Vector2.
export class UDim { constructor(s = 0, o = 0) { this.s = Math.fround(s); this.o = Math.trunc(o); } }
export class UDim2 { constructor(xs = 0, xo = 0, ys = 0, yo = 0) { this.xs = Math.fround(xs); this.xo = Math.trunc(xo); this.ys = Math.fround(ys); this.yo = Math.trunc(yo); } }
export class V2 { constructor(x = 0, y = 0) { this.x = Math.fround(x); this.y = Math.fround(y); } }
// TweenInfo: Roblox's fields; style and direction by EasingStyle/EasingDirection name.
export class TweenInfo { constructor(time = 1, style = 'Quad', dir = 'Out', repeat = 0, reverses = false, delay = 0) { Object.assign(this, { time, style, dir, repeat, reverses, delay }); } }
// A Luau table passed to the engine (keys and values converted).
// Returned by an async method: the calling script yields until `ev` fires on
// `inst`, and resumes with the event's args (Instance:async below makes one).
export class Yield { constructor(inst, ev) { this.inst = inst; this.ev = ev; } }
export class LuaTable { constructor(entries) { this.entries = entries; } }
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
  EasingStyle: { Linear: 0, Sine: 1, Back: 2, Quad: 3, Quart: 4, Quint: 5, Bounce: 6, Elastic: 7, Exponential: 8, Circular: 9, Cubic: 10 },
  EasingDirection: { In: 0, Out: 1, InOut: 2 },
  PlaybackState: { Begin: 0, Delayed: 1, Playing: 2, Paused: 3, Completed: 4, Cancelled: 5 },
  // UI (values from the creator docs' enum pages)
  Font: {Legacy:  0,  Arial:  1,  ArialBold:  2,  SourceSans:  3,  SourceSansBold:  4,  SourceSansLight:  5,  SourceSansItalic:  6,  Bodoni:  7,  Garamond:  8,  Cartoon:  9,  Code:  10,  Highway:  11,  SciFi:  12,  Arcade:  13,  Fantasy:  14,  Antique:  15,  SourceSansSemibold:  16,  Gotham:  17,  GothamMedium:  18,  GothamBold:  19,  GothamBlack:  20,  AmaticSC:  21,  Bangers:  22,  Creepster:  23,  DenkOne:  24,  Fondamento:  25,  FredokaOne:  26,  GrenzeGotisch:  27,  IndieFlower:  28,  JosefinSans:  29,  Jura:  30,  Kalam:  31,  LuckiestGuy:  32,  Merriweather:  33,  Michroma:  34,  Nunito:  35,  Oswald:  36,  PatrickHand:  37,  PermanentMarker:  38,  Roboto:  39,  RobotoCondensed:  40,  RobotoMono:  41,  Sarpanch:  42,  SpecialElite:  43,  TitilliumWeb:  44,  Ubuntu:  45,  BuilderSans:  46,  BuilderSansMedium:  47,  BuilderSansBold:  48,  BuilderSansExtraBold:  49,  Arimo:  50,  ArimoBold:  51},
  TextXAlignment: { Left: 0, Right: 1, Center: 2 }, TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
  FillDirection: { Horizontal: 0, Vertical: 1 }, HorizontalAlignment: { Center: 0, Left: 1, Right: 2 }, VerticalAlignment: { Center: 0, Top: 1, Bottom: 2 },
  SortOrder: { Name: 0, Custom: 1, LayoutOrder: 2 }, ZIndexBehavior: { Global: 0, Sibling: 1 }, ApplyStrokeMode: { Contextual: 0, Border: 1 },
  ScaleType: { Stretch: 0, Slice: 1, Tile: 2, Fit: 3, Crop: 4 }, AspectType: { FitWithinMaxSize: 0, ScaleWithParentSize: 1 }, DominantAxis: { Width: 0, Height: 1 },
  TextTruncate: { None: 0, AtEnd: 1, SplitWord: 2 },
  LightingStyle: { Realistic: 0, Soft: 1 },
  CollisionFidelity: { Default: 0, Hull: 1, Box: 2, PreciseConvexDecomposition: 3 }, RenderFidelity: { Automatic: 0, Precise: 1, Performance: 2 },
  // From Roblox's API dump (Roblox-Client-Tracker, v0.719).
  CoreGuiType: { PlayerList: 0, Health: 1, Backpack: 2, Chat: 3, All: 4, EmotesMenu: 5, SelfView: 6, Captures: 7, AvatarSwitcher: 8 },
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
    Clone(self) { return [self.dm.clone(self)]; },
    ClearAllChildren(self) { for (const c of self.children.slice()) self.dm.destroy(c); return []; },
    GetFullName(self) { const n = []; for (let i = self; i && i.parent; i = i.parent) n.unshift(i.Name); return [n.join('.')]; },
    WaitForChild(self, name) { return [self.children.find(c => c.Name === name) || null]; },
  },
  events: ['ChildAdded', 'ChildRemoved', 'Changed', 'Destroying'],
});
defineClass('DataModel', 'Instance', { creatable: false, methods: { GetService(self, name) { return [self.dm.service(name)]; } } });
defineClass('Workspace', 'Instance', { creatable: false, service: true, props: { Gravity: ['number', 196.2], FallenPartsDestroyHeight: ['number', -500] } });
defineClass('Folder', 'Instance');
// The frame's events, fired by play.js in Roblox's documented order:
// PreAnimation, PreSimulation (Stepped), physics, PostSimulation (Heartbeat),
// then waiting threads resume, then PreRender (RenderStepped) and the frame is drawn.
// One local session plays both sides, so it reports client and server.
defineClass('RunService', 'Instance', {
  creatable: false, service: true,
  methods: { IsClient() { return [true]; }, IsServer() { return [true]; }, IsStudio() { return [false]; }, IsRunning() { return [true]; }, IsEdit() { return [false]; } },
  events: ['PreAnimation', 'PreSimulation', 'Stepped', 'PostSimulation', 'Heartbeat', 'PreRender', 'RenderStepped'],
});
// TweenService (create.roblox.com/docs/reference/engine/classes/TweenService).
// Play starts from the properties' current values; a newer tween on the same
// property cancels the older; Pause keeps progress and works only while
// Playing; Cancel resets progress but leaves the properties where they are;
// Completed fires on finishing or Cancel (not Pause) with the PlaybackState.
// Ours, where Roblox documents nothing: DelayTime is waited once, before the
// first cycle; a cycle with Reverses is there and back; tweens step once per
// frame just before physics, so physics sees where a tween put a part.
const enumName = v => v instanceof EnumItem ? v.name : v;
defineClass('TweenBase', 'Instance', {
  creatable: false,
  props: { PlaybackState: ['Enum.PlaybackState', 'Begin'] },
  methods: {
    Play(self) { self.dm.tweenPlay(self); return []; },
    Pause(self) { if (self.props.PlaybackState === 'Playing') self.dm.set(self, 'PlaybackState', 'Paused'); return []; },
    Cancel(self) { self.dm.tweenEnd(self, 'Cancelled'); self.elapsed = 0; return []; },
  },
  events: ['Completed'],
});
defineClass('Tween', 'TweenBase', { creatable: false, props: { Instance: ['Instance', null], TweenInfo: ['TweenInfo', null] } });
defineClass('TweenService', 'Instance', {
  creatable: false, service: true,
  methods: {
    Create(self, inst, info, goals) {
      if (!(inst instanceof Instance)) throw new Error('Unable to cast value to Object');
      if (!(info instanceof TweenInfo)) throw new Error('Unable to cast value to TweenInfo');
      if (!(goals instanceof LuaTable)) throw new Error('Unable to cast to Dictionary');
      const list = [];
      for (const [k, v] of goals.entries) {
        const ty = typeof k === 'string' ? typeOf(inst.ClassName, k) : undefined;
        if (!ty) throw new Error(`TweenService:Create no property named '${k}' for object '${inst.Name}'`);
        const given = v instanceof V3 ? 'Vector3' : v instanceof C3 ? 'Color3' : v instanceof CF ? 'CFrame' : v instanceof UDim2 ? 'UDim2' : v instanceof UDim ? 'UDim' : v instanceof V2 ? 'Vector2' : v instanceof EnumItem ? 'Enum.' + v.type : typeof v === 'boolean' ? 'bool' : typeof v;
        if (!['number', 'bool', 'Vector3', 'Color3', 'CFrame', 'UDim2', 'UDim', 'Vector2'].includes(ty) && !ty.startsWith('Enum.')) throw new Error(`TweenService:Create property named '${k}' on object '${inst.Name}' is not a data type that can be tweened`);
        if (given !== ty) throw new Error(`TweenService:Create property named '${k}' cannot be tweened due to type mismatch (property is a '${ty}', but given type is '${given}')`);
        list.push([k, v instanceof EnumItem ? v.name : v]);
      }
      const tw = new Instance(self.dm, 'Tween');
      tw.props.Name = 'Tween';
      tw.props.Instance = inst; tw.props.TweenInfo = info;
      tw.goals = list; tw.elapsed = 0;
      return [tw];
    },
    GetValue(self, alpha, style, dir) { return [ease(alpha, enumName(style), enumName(dir))]; },
  },
});
// Roblox's standard containers. Nothing replicates (one local session), so they only hold things.
for (const name of ['ReplicatedStorage', 'ReplicatedFirst', 'ServerStorage', 'ServerScriptService', 'StarterPack', 'StarterPlayer'])
  defineClass(name, 'Instance', { creatable: false, service: true });
// StarterGui also switches Roblox's own UI on and off; `All` sets every type.
const coreGuiType = v => { const e = v instanceof EnumItem ? v : enumItem('CoreGuiType', v); if (!e || e.type !== 'CoreGuiType') throw new Error('Unable to cast value to Enum.CoreGuiType'); return e.name; };
defineClass('StarterGui', 'Instance', {
  creatable: false, service: true,
  methods: {
    SetCoreGuiEnabled(self, type, on) {
      const name = coreGuiType(type), core = self.dm.coreGui;
      for (const k of name === 'All' ? Object.keys(ENUMS.CoreGuiType).filter(k => k !== 'All') : [name]) core[k] = !!on;
      self.dm.notify(self, 'CoreGui'); return [];
    },
    GetCoreGuiEnabled(self, type) {
      const name = coreGuiType(type), core = self.dm.coreGui;
      return [name === 'All' ? Object.keys(core).every(k => core[k]) : core[name] !== false];
    },
  },
});
// ---- UI (create.roblox.com/docs/ui; defaults are Instance.new's, from Roblox's
// reflection data: mashup-research/ROBLOX_GUI_2026-10-09.md). Drawn by
// runtime/gui.js. AbsolutePosition/AbsoluteSize are written by its layout pass.
const rgb = (r, g, b) => [r / 255, g / 255, b / 255];
defineClass('GuiBase2d', 'Instance', { creatable: false, props: { AbsolutePosition: ['Vector2', [0, 0]], AbsoluteSize: ['Vector2', [0, 0]], AbsoluteRotation: ['number', 0] } });
defineClass('LayerCollector', 'GuiBase2d', { creatable: false, props: { Enabled: ['bool', true], ResetOnSpawn: ['bool', true], ZIndexBehavior: ['Enum.ZIndexBehavior', 'Sibling'] } });
defineClass('ScreenGui', 'LayerCollector', { props: { IgnoreGuiInset: ['bool', false], DisplayOrder: ['number', 0] } });
defineClass('GuiObject', 'GuiBase2d', {
  creatable: false,
  props: {
    Size: ['UDim2', [0, 0, 0, 0]], Position: ['UDim2', [0, 0, 0, 0]], AnchorPoint: ['Vector2', [0, 0]],
    BackgroundColor3: ['Color3', rgb(163, 162, 165)], BackgroundTransparency: ['number', 0],
    BorderSizePixel: ['number', 1], BorderColor3: ['Color3', rgb(27, 42, 53)],
    Visible: ['bool', true], ZIndex: ['number', 1], Rotation: ['number', 0], LayoutOrder: ['number', 0],
    ClipsDescendants: ['bool', false], Active: ['bool', false],
  },
  events: ['MouseEnter', 'MouseLeave', 'InputBegan', 'InputEnded'],
});
defineClass('Frame', 'GuiObject');
const TEXT = {
  Text: ['string', 'Label'], TextColor3: ['Color3', rgb(27, 42, 53)], TextSize: ['number', 8], Font: ['Enum.Font', 'Legacy'],
  TextScaled: ['bool', false], TextWrapped: ['bool', false], TextXAlignment: ['Enum.TextXAlignment', 'Center'], TextYAlignment: ['Enum.TextYAlignment', 'Center'],
  TextTransparency: ['number', 0], TextStrokeTransparency: ['number', 1], TextStrokeColor3: ['Color3', [0, 0, 0]], RichText: ['bool', false],
  LineHeight: ['number', 1], TextTruncate: ['Enum.TextTruncate', 'None'],
};
const IMAGE = { Image: ['string', ''], ImageColor3: ['Color3', [1, 1, 1]], ImageTransparency: ['number', 0], ScaleType: ['Enum.ScaleType', 'Stretch'] };
defineClass('TextLabel', 'GuiObject', { props: { ...TEXT } });
defineClass('ImageLabel', 'GuiObject', { props: { ...IMAGE } });
// Buttons: Active by default; Activated fires on a press and release inside (only while Active).
defineClass('GuiButton', 'GuiObject', { creatable: false, props: { AutoButtonColor: ['bool', true], Active: ['bool', true] }, events: ['Activated', 'MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up'] });
defineClass('TextButton', 'GuiButton', { props: { ...TEXT, Text: ['string', 'Button'] } });
defineClass('ImageButton', 'GuiButton', { props: { ...IMAGE } });
// Modifiers: children of a GuiObject that change how it's drawn or laid out.
defineClass('UIComponent', 'Instance', { creatable: false });
defineClass('UICorner', 'UIComponent', { props: { CornerRadius: ['UDim', [0, 8]] } });
defineClass('UIStroke', 'UIComponent', { props: { Thickness: ['number', 1], Color: ['Color3', [0, 0, 0]], Transparency: ['number', 0], ApplyStrokeMode: ['Enum.ApplyStrokeMode', 'Contextual'], Enabled: ['bool', true] } });
defineClass('UIPadding', 'UIComponent', { props: { PaddingTop: ['UDim', [0, 0]], PaddingBottom: ['UDim', [0, 0]], PaddingLeft: ['UDim', [0, 0]], PaddingRight: ['UDim', [0, 0]] } });
defineClass('UIListLayout', 'UIComponent', { props: { FillDirection: ['Enum.FillDirection', 'Vertical'], HorizontalAlignment: ['Enum.HorizontalAlignment', 'Left'], VerticalAlignment: ['Enum.VerticalAlignment', 'Top'], SortOrder: ['Enum.SortOrder', 'Name'], Padding: ['UDim', [0, 0]] } });
defineClass('UIAspectRatioConstraint', 'UIComponent', { props: { AspectRatio: ['number', 1], AspectType: ['Enum.AspectType', 'FitWithinMaxSize'], DominantAxis: ['Enum.DominantAxis', 'Width'] } });
defineClass('UITextSizeConstraint', 'UIComponent', { props: { MinTextSize: ['number', 1], MaxTextSize: ['number', 100] } });

// Per-player containers, and StarterPlayer's two script folders.
for (const name of ['PlayerGui', 'Backpack', 'PlayerScripts', 'StarterPlayerScripts', 'StarterCharacterScripts'])
  defineClass(name, 'Instance', { creatable: false });
// Pivots: a part's pivot is its CFrame (PivotOffset isn't modelled). A model's
// is its PrimaryPart's CFrame, else the centre of its parts' bounding box
// (Roblox keeps a stored WorldPivot there; this recomputes it).
function partsOf(model) { const out = []; const walk = i => i.children.forEach(c => { if (isA(c.ClassName, 'BasePart')) out.push(c); walk(c); }); walk(model); return out; }
function modelPivot(model) {
  const pp = model.props.PrimaryPart;
  if (pp && !pp.destroyed && isDescendant(pp, model)) return pp.props.CFrame;
  const parts = partsOf(model);
  if (!parts.length) return new CF();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const m = p.props.CFrame.m, s = p.props.Size;
    for (let r = 0; r < 3; r++) {
      const ext = (Math.abs(m[3 + r * 3]) * s.x + Math.abs(m[4 + r * 3]) * s.y + Math.abs(m[5 + r * 3]) * s.z) / 2;
      lo[r] = Math.min(lo[r], m[r] - ext); hi[r] = Math.max(hi[r], m[r] + ext);
    }
  }
  return new CF([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
}
defineClass('Model', 'Instance', {
  props: { PrimaryPart: ['Instance', null] },
  methods: {
    GetPivot(self) { return [modelPivot(self)]; },
    // Moves every part rigidly so the pivot lands on `cf`.
    PivotTo(self, cf) {
      if (!(cf instanceof CF)) throw new Error('Unable to cast value to CFrame');
      const delta = cf.mul(modelPivot(self).inverse());
      for (const p of partsOf(self)) self.dm.set(p, 'CFrame', delta.mul(p.props.CFrame));
      return [];
    },
  },
});
defineClass('BasePart', 'Instance', {
  creatable: false,
  props: {
    CFrame: ['CFrame', null], Position: ['Vector3', [0, 0, 0]], Orientation: ['Vector3', [0, 0, 0]], Size: ['Vector3', [4, 1, 2]],
    Anchored: ['bool', false], CanCollide: ['bool', true], CanTouch: ['bool', true], Transparency: ['number', 0],
    Color: ['Color3', [163 / 255, 162 / 255, 165 / 255]], Material: ['Enum.Material', 'Plastic'], Reflectance: ['number', 0],
    // studs/s and rad/s. Physics writes them for unanchored parts; on an anchored part they only carry what stands on it (a conveyor).
    AssemblyLinearVelocity: ['Vector3', [0, 0, 0]], AssemblyAngularVelocity: ['Vector3', [0, 0, 0]],
  },
  methods: {
    GetPivot(self) { return [self.props.CFrame]; },
    PivotTo(self, cf) { if (!(cf instanceof CF)) throw new Error('Unable to cast value to CFrame'); self.dm.set(self, 'CFrame', cf); return []; },
  },
  events: ['Touched', 'TouchEnded'],
});
defineClass('Part', 'BasePart', { props: { Shape: ['Enum.PartType', 'Block'] } });
defineClass('SpawnLocation', 'Part');
// A wedge: its sloped face is the front (-Z), rising to the back (+Z) top edge.
defineClass('WedgePart', 'BasePart');
// Meshes from glTF 2.0 files, drawn by runtime/world.js through runtime/gltf.js
// (checked against Khronos's goldens: mashup-research/GLTF_FIDELITY_2026-10-09.md).
// Roblox's names and semantics: Size stretches the mesh's own bounding box
// (MeshSize, read-only); CollisionFidelity picks the collider. Beyond Roblox:
// scripts may set MeshId at run time (Roblox lets only Studio set it), MeshId
// takes a URL to a .glb/.gltf (no asset ids here), and the file's own PBR
// materials are kept (Roblox needs a SurfaceAppearance for that). Files are in
// glTF's metres, converted at Roblox's 1 stud = 0.28 m.
defineClass('TriangleMeshPart', 'BasePart', { creatable: false, props: { CollisionFidelity: ['Enum.CollisionFidelity', 'Default'], MeshSize: ['Vector3', [0, 0, 0]] } });
defineClass('MeshPart', 'TriangleMeshPart', { props: { MeshId: ['string', ''], TextureID: ['string', ''], DoubleSided: ['bool', false], RenderFidelity: ['Enum.RenderFidelity', 'Automatic'] } });
defineClass('AssetService', 'Instance', {
  creatable: false, service: true,
  methods: {
    // Yields until the file has loaded; the part comes back at the mesh's own size.
    // options: { CollisionFidelity = Enum.CollisionFidelity.X } (Roblox's option table).
    CreateMeshPartAsync(self, url, options) {
      if (typeof url !== 'string' || !url) throw new Error('CreateMeshPartAsync expects a mesh URL');
      const mp = self.dm.create('MeshPart');
      const opt = options instanceof LuaTable ? options.entries.find(([k]) => k === 'CollisionFidelity') : null, cf = opt && opt[1];
      if (cf !== undefined && cf !== null) mp.props.CollisionFidelity = enumName(cf);
      mp.props.MeshId = url;
      return self.dm.async(self, self.dm.hooks.loadMesh(url).then(info => {
        mp.props.MeshSize = new V3(...info.size); mp.props.Size = new V3(...info.size);
        return [mp];
      }));
    },
  },
});
// Images on a part's face. Texture tiles in studs; Decal stretches. Built-in
// images: "studio://grid" (the baseplate grid). Roblox asset ids aren't available.
defineClass('Decal', 'Instance', { props: { Texture: ['string', ''], Face: ['Enum.NormalId', 'Front'], Transparency: ['number', 0], Color3: ['Color3', [1, 1, 1]] } });
defineClass('Texture', 'Decal', { props: { StudsPerTileU: ['number', 2], StudsPerTileV: ['number', 2], OffsetStudsU: ['number', 0], OffsetStudsV: ['number', 0] } });
defineClass('LuaSourceContainer', 'Instance', { creatable: false, props: { Source: ['string', ''], Enabled: ['bool', true] } });
defineClass('Script', 'LuaSourceContainer');
defineClass('LocalScript', 'LuaSourceContainer');
defineClass('ModuleScript', 'LuaSourceContainer');
// ---- Lighting (runtime/lighting.js draws it). Research and sources:
// mashup-research/ROBLOX_LIGHTING_2026-10-09.md. Defaults are a new Studio
// Baseplate's (Studio's own saved "File > New" place), not Instance.new's bare
// engine defaults, since that's the look a new place starts from.
const grey = v => [v / 255, v / 255, v / 255];
// The sun's direction (towards the sun). Roblox computes it in C++; this
// formula is what four community sources agree on, one checked against
// GetSunDirection() in Studio (UNSURE until checked here). a = time of day as
// an angle, L = latitude less the earth's tilt: rises at +X at 06:00, sets at -X.
export function sunDirection(clock, latitude) {
  const a = 2 * Math.PI * clock / 24, L = (latitude - 23.5) * Math.PI / 180;
  return [Math.cos(L) * Math.sin(a), -Math.cos(L) * Math.cos(a), Math.sin(L)];
}
const clockString = h => { const t = Math.round((((h % 24) + 24) % 24) * 3600); return [t / 3600 | 0, (t / 60 | 0) % 60, t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
defineClass('Lighting', 'Instance', {
  creatable: false, service: true,
  props: {
    Ambient: ['Color3', grey(70)], OutdoorAmbient: ['Color3', grey(70)], Brightness: ['number', 3],
    ClockTime: ['number', 14.5], TimeOfDay: ['string', '14:30:00'], GeographicLatitude: ['number', 0],
    EnvironmentDiffuseScale: ['number', 1], EnvironmentSpecularScale: ['number', 1], ExposureCompensation: ['number', 0],
    GlobalShadows: ['bool', true], ShadowSoftness: ['number', 0.2], ColorShift_Top: ['Color3', [0, 0, 0]], ColorShift_Bottom: ['Color3', [0, 0, 0]],
    FogColor: ['Color3', grey(192)], FogStart: ['number', 0], FogEnd: ['number', 100000],
    LightingStyle: ['Enum.LightingStyle', 'Soft'], PrioritizeLightingQuality: ['bool', true],
  },
  methods: {
    GetSunDirection(self) { return [new V3(...sunDirection(self.props.ClockTime, self.props.GeographicLatitude))]; },
    // The moon mirrors the sun in X and Y (not simply opposite).
    GetMoonDirection(self) { const [x, y, z] = sunDirection(self.props.ClockTime, self.props.GeographicLatitude); return [new V3(-x, -y, z)]; },
    GetMinutesAfterMidnight(self) { return [self.props.ClockTime * 60]; },
    SetMinutesAfterMidnight(self, m) { self.dm.set(self, 'ClockTime', (+m || 0) / 60); return []; },
  },
  events: ['LightingChanged'],
});
// Post effects and the sky's look: children of Lighting (or the camera). Instance.new
// defaults from rbx-dom's reflection database. Which properties are drawn so far:
// runtime/lighting.js.
defineClass('PostEffect', 'Instance', { creatable: false, props: { Enabled: ['bool', true] } });
defineClass('BloomEffect', 'PostEffect', { props: { Intensity: ['number', 0.4], Size: ['number', 24], Threshold: ['number', 0.95] } });
defineClass('ColorCorrectionEffect', 'PostEffect', { props: { Brightness: ['number', 0], Contrast: ['number', 0], Saturation: ['number', 0], TintColor: ['Color3', [1, 1, 1]] } });
defineClass('DepthOfFieldEffect', 'PostEffect', { props: { FarIntensity: ['number', 0.75], FocusDistance: ['number', 0.05], InFocusRadius: ['number', 10], NearIntensity: ['number', 0.75] } });
defineClass('SunRaysEffect', 'PostEffect', { props: { Intensity: ['number', 0.25], Spread: ['number', 1] } });
defineClass('BlurEffect', 'PostEffect', { props: { Size: ['number', 24] } });
defineClass('Atmosphere', 'Instance', { props: { Density: ['number', 0.395], Offset: ['number', 0], Color: ['Color3', [0.7843, 0.6667, 0.4235]], Decay: ['Color3', [0.3608, 0.2353, 0.0549]], Glare: ['number', 0], Haze: ['number', 0] } });
defineClass('Sky', 'Instance', { props: { CelestialBodiesShown: ['bool', true], StarCount: ['number', 3000], SunAngularSize: ['number', 21], MoonAngularSize: ['number', 11] } });
// A new Studio Baseplate's Lighting children (Studio 0.727's saved place).
export function baseplateLighting(dm) {
  const L = dm.service('Lighting');
  const add = (cls, name, props) => { const i = dm.create(cls); i.props.Name = name; Object.assign(i.props, props); dm.setParent(i, L); };
  add('Sky', 'Sky', {});
  add('SunRaysEffect', 'SunRays', { Intensity: 0.01, Spread: 0.1 });
  add('Atmosphere', 'Atmosphere', { Density: 0.3, Offset: 0.25, Color: new C3(199 / 255, 199 / 255, 199 / 255), Decay: new C3(106 / 255, 112 / 255, 125 / 255), Glare: 0, Haze: 0 });
  add('BloomEffect', 'Bloom', { Intensity: 1, Size: 24, Threshold: 2 });
  add('DepthOfFieldEffect', 'DepthOfField', { Enabled: false, FarIntensity: 0.1, FocusDistance: 0.05, InFocusRadius: 30, NearIntensity: 0.75 });
}
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
// Value objects: Changed fires with the new value (not the property name), as in Roblox.
defineClass('ValueBase', 'Instance', { creatable: false });
defineClass('BoolValue', 'ValueBase', { props: { Value: ['bool', false] } });
defineClass('NumberValue', 'ValueBase', { props: { Value: ['number', 0] } });
defineClass('IntValue', 'ValueBase', { props: { Value: ['number', 0] } });
defineClass('StringValue', 'ValueBase', { props: { Value: ['string', ''] } });
defineClass('ObjectValue', 'ValueBase', { props: { Value: ['Instance', null] } });

// ------------------------------------------------------------------ instances
export class Instance {
  constructor(dm, cls) {
    this.dm = dm;
    this.ClassName = cls;
    this.parent = null;
    this.children = [];
    this.props = {};
    for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) {
      for (const [k, [ty, d]] of Object.entries(c.props)) if (!(k in this.props)) this.props[k] = ty === 'Vector3' ? new V3(...d) : ty === 'Color3' ? new C3(...d) : ty === 'CFrame' ? new CF() : ty === 'UDim2' ? new UDim2(...(d || [])) : ty === 'UDim' ? new UDim(...(d || [])) : ty === 'Vector2' ? new V2(...(d || [])) : d;
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
    this.connsOf = new Map(); // inst -> Map(ev -> Set(id)): fire looks up only its own
    this.nextConn = 1;
    this.onFire = null; // (ref, args) -> void, set by the Luau bridge
    // Roblox's own UI is opt-in here (unlike Roblox): a project shows the player
    // list only after StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, true).
    this.coreGui = Object.fromEntries(Object.keys(ENUMS.CoreGuiType).filter(k => k !== 'All').map(k => [k, k !== 'PlayerList']));
    this.watchers = []; // (inst, key) -> void: the renderer, the player runtime
    this.tweens = new Set(); // playing (or delayed or paused) tweens
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
      if (name === 'StarterPlayer') for (const f of ['StarterPlayerScripts', 'StarterCharacterScripts']) this.setParent(new Instance(this, f), s);
    }
    return this.services[name];
  }
  // A promise as a yield: the calling script waits until it settles and gets
  // its values back (a failure warns and returns nothing).
  async(inst, promise) {
    const ev = '__async' + (this.nextAsync = (this.nextAsync || 0) + 1);
    promise.then(vals => this.fire(inst, ev, vals), err => { console.warn(err && err.message || err); this.fire(inst, ev, []); });
    return new Yield(inst, ev);
  }
  create(cls) { return CLASSES[cls] && CLASSES[cls].creatable ? new Instance(this, cls) : null; }

  fire(inst, ev, args) {
    const ids = this.connsOf.get(inst)?.get(ev);
    if (!ids) return;
    for (const id of [...ids]) {
      const c = this.conns.get(id);
      if (!c) continue;
      if (c.once) this.disconnect(id);
      // The id travels with the queued event: a connection disconnected before
      // the queue runs must not run (Roblox), and its ref may be reused.
      // Destroying handlers run even though destroy ends the connection (id 0: not checked).
      this.onFire && this.onFire(c.ref, args, c.once || ev === 'Destroying' ? 0 : id);
    }
  }
  connect(inst, ev, ref) {
    const id = this.nextConn++;
    // ref < 0: a thread waiting in Signal:Wait(), resumed once.
    this.conns.set(id, { inst, ev, ref, once: ref < 0 });
    if (!this.connsOf.has(inst)) this.connsOf.set(inst, new Map());
    const byEv = this.connsOf.get(inst);
    if (!byEv.has(ev)) byEv.set(ev, new Set());
    byEv.get(ev).add(id);
    return id;
  }
  disconnect(id) {
    const c = this.conns.get(id);
    if (!c) return;
    this.conns.delete(id);
    this.connsOf.get(c.inst)?.get(c.ev)?.delete(id);
  }
  setParent(inst, p) {
    if (inst.destroyed) throw new Error(`The Parent property of ${inst.Name} is locked, current parent: NULL, new parent ${p ? p.Name : 'NULL'}`);
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
    if (inst.destroyed) return;
    this.fire(inst, 'Destroying', []);
    for (const c of inst.children.slice()) this.destroy(c);
    this.setParent(inst, null);
    inst.destroyed = true;
    // Its connections end (Roblox: Connected becomes false); their Luau refs are released by the binding.
    const gone = [];
    for (const ids of (this.connsOf.get(inst) || new Map()).values()) for (const id of ids) { const c = this.conns.get(id); if (c && c.ref > 0) gone.push(c.ref); this.conns.delete(id); }
    this.connsOf.delete(inst);
    if (gone.length) this.onRelease && this.onRelease(gone);
  }
  set(inst, key, value) {
    if (key === 'Parent') return this.setParent(inst, value);
    if ((key === 'CFrame' || key === 'Position' || key === 'Orientation') && inst.props.CFrame) return this.place(inst, key, value);
    if (inst.ClassName === 'Humanoid' && key === 'Health') value = Math.min(Math.max(value, 0), inst.props.MaxHealth); // as Roblox clamps it
    if (inst.ClassName === 'Lighting' && (key === 'ClockTime' || key === 'TimeOfDay')) {
      // Two views of one time (Roblox): ClockTime wraps into [0, 24); TimeOfDay is its "HH:MM:SS".
      const h = key === 'ClockTime' ? (((+value % 24) + 24) % 24) : (() => { const m = /^(-?\d+):(\d+):(\d+)$/.exec(String(value)); return m ? (((+m[1] + m[2] / 60 + m[3] / 3600) % 24) + 24) % 24 : inst.props.ClockTime; })();
      const ts = clockString(h), changed = [];
      if (!sameValue(inst.props.ClockTime, h)) { inst.props.ClockTime = h; changed.push('ClockTime'); }
      if (inst.props.TimeOfDay !== ts) { inst.props.TimeOfDay = ts; changed.push('TimeOfDay'); }
      if (!changed.length) return;
      this.notify(inst, 'ClockTime');
      for (const k of changed) this.fire(inst, 'Changed', [k]);
      this.fire(inst, 'LightingChanged', [false]);
      return;
    }
    if (sameValue(inst.props[key], value)) return; // Roblox fires Changed only on a real change
    inst.props[key] = value;
    this.notify(inst, key);
    if (isA(inst.ClassName, 'ValueBase')) { if (key === 'Value') this.fire(inst, 'Changed', [value]); }
    else this.fire(inst, 'Changed', [key]);
  }
  // A part's placement: CFrame is the truth; Position and Orientation are
  // views of it, and setting any one updates the others (as in Roblox, where
  // each fires its own Changed). Watchers hear one 'CFrame' change.
  place(inst, key, value) {
    const P = inst.props, old = P.CFrame;
    let cf;
    if (key === 'CFrame') cf = value;
    else if (key === 'Position') cf = old.withPosition(value.x, value.y, value.z);
    else cf = CF.fromOrientation(old.x, old.y, old.z, value.x, value.y, value.z);
    const [ox, oy, oz] = cf.toOrientation();
    const next = { CFrame: cf, Position: new V3(cf.x, cf.y, cf.z), Orientation: new V3(Math.fround(ox), Math.fround(oy), Math.fround(oz)) };
    const changed = Object.keys(next).filter(k => !sameValue(P[k], next[k]));
    if (!changed.length) return;
    Object.assign(P, next);
    this.notify(inst, 'CFrame');
    for (const k of changed) this.fire(inst, 'Changed', [k]);
  }
  // ---- tweens (TweenService)
  tweenPlay(tw) {
    const st = tw.props.PlaybackState, inst = tw.props.Instance;
    if (st === 'Playing' || st === 'Delayed') return;
    if (st === 'Paused') return this.set(tw, 'PlaybackState', tw.elapsed < tw.props.TweenInfo.delay ? 'Delayed' : 'Playing');
    if (!inst || inst.destroyed) return;
    tw.from = tw.goals.map(([k]) => inst.props[k]);
    tw.elapsed = 0;
    for (const o of [...this.tweens]) if (o !== tw && o.props.Instance === inst && o.goals.some(([k]) => tw.goals.some(([k2]) => k2 === k))) this.tweenEnd(o, 'Cancelled');
    this.tweens.add(tw);
    this.set(tw, 'PlaybackState', tw.props.TweenInfo.delay > 0 ? 'Delayed' : 'Playing');
  }
  tweenEnd(tw, state) {
    if (!this.tweens.has(tw)) return;
    this.tweens.delete(tw);
    this.set(tw, 'PlaybackState', state);
    this.fire(tw, 'Completed', [new EnumItem('PlaybackState', state, ENUMS.PlaybackState[state])]);
  }
  stepTweens(dt) {
    for (const tw of [...this.tweens]) {
      const inst = tw.props.Instance, I = tw.props.TweenInfo;
      if (!inst || inst.destroyed) { this.tweens.delete(tw); continue; }
      if (tw.props.PlaybackState === 'Paused') continue;
      tw.elapsed += dt;
      if (tw.elapsed < I.delay) continue;
      if (tw.props.PlaybackState === 'Delayed') this.set(tw, 'PlaybackState', 'Playing');
      const t = tw.elapsed - I.delay, cycle = I.time * (I.reverses ? 2 : 1);
      const total = I.repeat < 0 ? Infinity : cycle * (I.repeat + 1);
      if (t >= total) { this.tweenApply(tw, I.reverses ? 0 : 1); this.tweenEnd(tw, 'Completed'); continue; }
      const c = cycle > 0 ? t % cycle : 0;
      this.tweenApply(tw, I.time <= 0 ? 1 : c < I.time ? c / I.time : 1 - (c - I.time) / I.time);
    }
  }
  tweenApply(tw, alpha) {
    const I = tw.props.TweenInfo, e = ease(alpha, I.style, I.dir), inst = tw.props.Instance;
    tw.goals.forEach(([k, to], i) => this.set(inst, k, lerpValue(tw.from[i], to, alpha >= 1 ? 1 : alpha <= 0 ? 0 : e)));
  }
  // Instance:Clone(): a copy of inst and its Archivable descendants, parent
  // nil. References inside the copied tree (a Model's PrimaryPart, an
  // ObjectValue's Value) point at the copies; outside ones are kept.
  clone(inst) {
    if (!inst.props.Archivable) return null;
    const map = new Map();
    const copy = i => {
      const c = new Instance(this, i.ClassName);
      for (const [k, v] of Object.entries(i.props)) c.props[k] = v instanceof V3 ? new V3(v.x, v.y, v.z) : v instanceof C3 ? new C3(v.r, v.g, v.b) : v;
      map.set(i, c);
      for (const ch of i.children) if (ch.props.Archivable) { const cc = copy(ch); cc.parent = c; c.children.push(cc); }
      return c;
    };
    const root = copy(inst);
    for (const c of map.values()) for (const [k, v] of Object.entries(c.props)) if (v instanceof Instance && map.has(v)) c.props[k] = map.get(v);
    return root;
  }
  watch(fn) { this.watchers.push(fn); }
  notify(inst, key) { for (const w of this.watchers) w(inst, key); }
}
function sameValue(a, b) {
  if (a === b) return true;
  if (a instanceof V3 && b instanceof V3) return a.x === b.x && a.y === b.y && a.z === b.z;
  if (a instanceof C3 && b instanceof C3) return a.r === b.r && a.g === b.g && a.b === b.b;
  if (a instanceof CF) return a.equals(b);
  if (a instanceof UDim2 && b instanceof UDim2) return a.xs === b.xs && a.xo === b.xo && a.ys === b.ys && a.yo === b.yo;
  if (a instanceof UDim && b instanceof UDim) return a.s === b.s && a.o === b.o;
  if (a instanceof V2 && b instanceof V2) return a.x === b.x && a.y === b.y;
  return false;
}
function isDescendant(a, b) { for (let p = a.parent; p; p = p.parent) if (p === b) return true; return false; }

// Properties scripts may read but not write (the engine sets them), as in Roblox.
const READ_ONLY = new Set(['TriangleMeshPart.MeshSize', 'GuiBase2d.AbsolutePosition', 'GuiBase2d.AbsoluteSize', 'GuiBase2d.AbsoluteRotation', 'TweenBase.PlaybackState', 'Tween.Instance', 'Tween.TweenInfo', 'Humanoid.MoveDirection', 'Humanoid.FloorMaterial', 'Players.LocalPlayer', 'Player.UserId', 'Instance.ClassName']);
function readOnly(cls, key) { for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) if (READ_ONLY.has(c.name + '.' + key)) return true; return false; }

// ------------------------------------------------------------------ the Luau-facing host
// Converts between JS values and the {t, n, s, v} channel.
// Deprecated names Roblox still accepts.
const ALIASES = { Velocity: 'AssemblyLinearVelocity', RotVelocity: 'AssemblyAngularVelocity' };
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
      else if (v instanceof CF) o.push({ t: T.CFRAME, v: v.m });
      else if (v instanceof UDim2) o.push({ t: T.UDIM2, n: v.xs, v: [v.xo, v.ys, v.yo] });
      else if (v instanceof UDim) o.push({ t: T.UDIM, v: [v.s, v.o, 0] });
      else if (v instanceof V2) o.push({ t: T.VEC2, v: [v.x, v.y, 0] });
      else if (v instanceof TweenInfo) o.push({ t: T.TWEENINFO, n: v.time, s: v.style + ',' + v.dir, v: [v.repeat, v.reverses ? 1 : 0, v.delay] });
      else if (v instanceof EnumItem) o.push({ t: T.ENUM, s: v.type + '.' + v.name, n: v.value });
      else if (Array.isArray(v)) { o.push({ t: T.LIST, n: v.length }); v.forEach(x => host.put(o, x)); }
      else o.push({ t: T.NIL });
      return o;
    },
    out(v) { return host.put([], v)[0]; },
    // Arguments arrive flat; a table is {DICT, n} then n key/value pairs.
    readArgs(list) {
      let i = 0;
      const one = () => {
        const a = list[i++];
        if (a.t !== T.DICT) return host.in(a);
        const entries = [];
        for (let k = 0; k < a.n; k++) { const key = one(); entries.push([key, one()]); }
        return new LuaTable(entries);
      };
      const out = [];
      while (i < list.length) out.push(one());
      return out;
    },
    in(a) {
      switch (a.t) {
        case T.TWEENINFO: { const [style, dir] = a.s.split(','); return new TweenInfo(a.n, style, dir, a.v[0], !!a.v[1], a.v[2]); }
        case T.NIL: return null;
        case T.BOOL: return !!a.n;
        case T.NUM: return a.n;
        case T.STR: return a.s;
        case T.VEC: return new V3(a.v[0], a.v[1], a.v[2]);
        case T.COLOR: return new C3(a.v[0], a.v[1], a.v[2]);
        case T.CFRAME: return new CF(a.v);
        case T.UDIM2: return new UDim2(a.n, a.v[0], a.v[1], a.v[2]);
        case T.UDIM: return new UDim(a.v[0], a.v[1]);
        case T.VEC2: return new V2(a.v[0], a.v[1]);
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
      if (ALIASES[key] && ALIASES[key] in inst.props) key = ALIASES[key];
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
      if (ALIASES[key] && ALIASES[key] in inst.props) key = ALIASES[key];
      const v = host.readArgs(host.args)[0];
      host.ret = [];
      if (key === 'Size') inst.userSized = true; // a MeshPart keeps a script's Size over its mesh's own
      if (key === 'Parent') {
        if (v !== null && !(v instanceof Instance)) return host.err('Parent must be an Instance');
        try { dm.setParent(inst, v); } catch (e) { host.err(e.message); }
        return;
      }
      const ty = typeOf(inst.ClassName, key);
      if (!ty) return host.err(`${key} is not a valid member of ${inst.ClassName} "${inst.Name}"`);
      if (readOnly(inst.ClassName, key)) return host.err(`Unable to assign property ${key}. Property is read only`);
      const ok = { string: 'string', number: 'number', bool: 'boolean' }[ty];
      if (ok && typeof v !== ok) return host.err(`Unable to assign property ${key}. ${ty} expected, got ${v === null ? 'nil' : typeof v}`);
      if (ty === 'Vector3' && !(v instanceof V3)) return host.err(`Unable to assign property ${key}. Vector3 expected`);
      if (ty === 'Color3' && !(v instanceof C3)) return host.err(`Unable to assign property ${key}. Color3 expected`);
      if (ty === 'CFrame' && !(v instanceof CF)) return host.err(`Unable to assign property ${key}. CFrame expected`);
      for (const [name, C] of [['UDim2', UDim2], ['UDim', UDim], ['Vector2', V2]]) if (ty === name && !(v instanceof C)) return host.err(`Unable to assign property ${key}. ${name} expected`);
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
      try { res = fn(inst, ...host.readArgs(host.args)); } catch (e) { host.err(e.message); return 1; }
      host.ret = [];
      if (res instanceof Yield) { host.yieldOn = { h: res.inst.handle, ev: res.ev }; return 0; }
      res.forEach(r => host.put(host.ret, r));
      return res.length;
    },
    connect(h, ev, ref) { return dm.connect(dm.byHandle[h], ev, ref); },
    disconnect(id) { dm.disconnect(id); },
    connected(id) { return dm.conns.has(id) ? 1 : 0; },
    print(s, level) { log(s, level); },
  };
  return host;
}
