// The Instance tree: classes, properties, methods and events, following the
// shapes in Roblox's public API reference so Luau scripts read the same.
// Luau reaches it through `host` (see bridge in luau.js): values cross as
// {t, n, s, v} with the tags in binding.cpp.
import { CF } from './cframe.js';
import { castRay } from './raycast.js';
import { ease, lerpValue } from './tween.js';
import { compileSequence, stepTracks, stopTrack } from './animation.js';
import { Voxels, CELL, shapes, boxBounds, TERRAIN_MATERIALS } from './terrain/voxels.js';
import { BrickColor, defineBrickColor } from './brickcolor.js';
import { Font, fontFromEnum, enumFromFont, FONT_WEIGHTS, FONT_STYLES } from './fonts.js';
import { Assemblies, isJoint } from './assembly.js';
import { BODY_PRESETS, SHAPE_PROPS, makeBody, describedBody } from './runtime/bodygen.js';
import { NavWorld, collectObstacles, computePath, occlusion, AGENT } from './pathfinding.js';
import { PHYSICAL } from './runtime/physprops.js';
export { CF, BrickColor, Font };
export const T = { NIL: 0, BOOL: 1, NUM: 2, STR: 3, VEC: 4, INST: 5, METHOD: 6, SIGNAL: 7, ERR: 8, LIST: 9, COLOR: 10, ENUM: 11, CFRAME: 12, DICT: 13, TWEENINFO: 14, UDIM: 15, UDIM2: 16, VEC2: 17, NUMRANGE: 18, NUMSEQ: 19, COLORSEQ: 20, BRICKCOLOR: 21, FONT: 22 };
// UI datatypes: UDim (scale, integer offset), UDim2 (x and y UDims), Vector2.
export class UDim { constructor(s = 0, o = 0) { this.s = Math.fround(s); this.o = Math.trunc(o); } }
export class UDim2 { constructor(xs = 0, xo = 0, ys = 0, yo = 0) { this.xs = Math.fround(xs); this.xo = Math.trunc(xo); this.ys = Math.fround(ys); this.yo = Math.trunc(yo); } }
export class V2 { constructor(x = 0, y = 0) { this.x = Math.fround(x); this.y = Math.fround(y); } }
// Particle datatypes (mashup-research/ROBLOX_PARTICLES_2026-11-13.md): float32 values, as Roblox
// stores them. NumberRange: min, max. NumberSequence: keypoints [time, value, envelope];
// ColorSequence: keypoints [time, Color3]. Sequences keep Roblox's rules (the binding checks them on
// construction): at least two keypoints, non-descending times from 0 to 1.
// The JS constructors check the same rules with the same words, so engine code, the editor and
// place files can't make one Luau would refuse.
const f32 = Math.fround;
function checkTimes(k, type) {
  if (k.length < 2) throw new Error(`${type} requires at least 2 keypoints`);
  if (k.length > 20) throw new Error(`${type} supports at most 20 keypoints`);
  if (k[0][0] !== 0 || k[k.length - 1][0] !== 1) throw new Error(`${type} time must start at 0 and end at 1`);
  for (let i = 1; i < k.length; i++) if (!(k[i][0] >= k[i - 1][0])) throw new Error(`${type} keypoints must be in non-descending time order`);
}
export class NumberRange {
  constructor(min = 0, max = min) {
    if (!(+min <= +max)) throw new Error('NumberRange: invalid range (min must be less than or equal to max)');
    this.min = f32(min); this.max = f32(max);
  }
}
export class NumberSequence {
  constructor(k = [[0, 0, 0], [1, 0, 0]]) {
    this.k = k.map(([t, v, e = 0]) => [f32(t), f32(v), f32(e)]);
    checkTimes(this.k, 'NumberSequence');
    if (this.k.some(x => !(x[2] >= 0))) throw new Error('NumberSequenceKeypoint envelope must be non-negative');
  }
  static of(a, b = a) { return new NumberSequence([[0, a, 0], [1, b, 0]]); }
  /** Roblox's serialised form: "time value envelope " per keypoint. */
  toString() { return this.k.map(k => k.map(n => +n.toPrecision(9)).join(' ') + ' ').join(''); }
  static parse(s) { const n = String(s).trim().split(/\s+/).map(Number), k = []; for (let i = 0; i + 2 < n.length; i += 3) k.push([n[i], n[i + 1], n[i + 2]]); return new NumberSequence(k); }
}
export class ColorSequence {
  constructor(k = [[0, new C3(1, 1, 1)], [1, new C3(1, 1, 1)]]) { this.k = k.map(([t, c]) => [f32(t), new C3(c.r, c.g, c.b)]); checkTimes(this.k, 'ColorSequence'); }
  static of(a, b = a) { return new ColorSequence([[0, a], [1, b]]); }
  /** Roblox's serialised form: "time r g b 0 " per keypoint. */
  toString() { return this.k.map(([t, c]) => [t, c.r, c.g, c.b, 0].map(n => +f32(n).toPrecision(9)).join(' ') + ' ').join(''); }
  static parse(s) { const n = String(s).trim().split(/\s+/).map(Number), k = []; for (let i = 0; i + 4 < n.length; i += 5) k.push([n[i], new C3(n[i + 1], n[i + 2], n[i + 3])]); return new ColorSequence(k); }
}
// TweenInfo: Roblox's fields; style and direction by EasingStyle/EasingDirection name.
export class TweenInfo { constructor(time = 1, style = 'Quad', dir = 'Out', repeat = 0, reverses = false, delay = 0) { Object.assign(this, { time, style, dir, repeat, reverses, delay }); } }
// A Luau table passed to the engine (keys and values converted).
// Returned by an async method: the calling script yields until `ev` fires on
// `inst`, and resumes with the event's args (Instance:async below makes one).
export class Yield { constructor(inst, ev) { this.inst = inst; this.ev = ev; } }
export class LuaTable {
  constructor(entries) { this.entries = entries; }
  // The array part (keys 1..n) in order.
  list() { const m = new Map(this.entries.filter(([k]) => typeof k === 'number').map(([k, v]) => [k, v])), out = []; for (let i = 1; m.has(i); i++) out.push(m.get(i)); return out; }
}
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
  Axis: { X: 0, Y: 1, Z: 2 }, // Vector3.FromAxis
  RotationOrder: { XYZ: 0, XZY: 1, YZX: 2, YXZ: 3, ZXY: 4, ZYX: 5 }, // CFrame.fromEulerAngles, :ToEulerAngles (values: Roblox's API dump)
  // ParticleEmitter's (API dump, mashup-research/ROBLOX_PARTICLES_2026-11-13.md).
  ParticleOrientation: { FacingCamera: 0, FacingCameraWorldUp: 1, VelocityParallel: 2, VelocityPerpendicular: 3 },
  ParticleEmitterShape: { Box: 0, Sphere: 1, Cylinder: 2, Disc: 3 },
  ParticleEmitterShapeInOut: { Outward: 0, Inward: 1, InAndOut: 2 },
  ParticleEmitterShapeStyle: { Volume: 0, Surface: 1 },
  ParticleFlipbookLayout: { None: 0, Grid2x2: 1, Grid4x4: 2, Grid8x8: 3, Custom: 4 },
  ParticleFlipbookMode: { Loop: 0, OneShot: 1, PingPong: 2, Random: 3 },
  HighlightDepthMode: { AlwaysOnTop: 0, Occluded: 1 },
  HumanoidRigType: { R6: 0, R15: 1 },
  IKControlType: { Transform: 0, Position: 1, Rotation: 2, LookAt: 3 },
  PathStatus: { Success: 0, ClosestNoPath: 1, ClosestOutOfRange: 2, FailStartNotEmpty: 3, FailFinishNotEmpty: 4, NoPath: 5 },
  PathWaypointAction: { Walk: 0, Jump: 1, Custom: 2 },
  SavedQualitySetting: { Automatic: 0, QualityLevel1: 1, QualityLevel2: 2, QualityLevel3: 3, QualityLevel4: 4, QualityLevel5: 5, QualityLevel6: 6, QualityLevel7: 7, QualityLevel8: 8, QualityLevel9: 9, QualityLevel10: 10 },
  ParticleCollision: { None: 0, Bounce: 1, Stick: 2, Die: 3 }, // Claude Studio's own (STUDIO_OWN)
  RaycastFilterType: { Exclude: 0, Include: 1, Blacklist: 0, Whitelist: 1 }, // the last two: deprecated names
  TonemapperPreset: { Default: 0, Retro: 1 },
  AnimationPriority: { Idle: 0, Movement: 1, Action: 2, Action2: 3, Action3: 4, Action4: 5, Core: 1000 },
  PoseEasingStyle: { Linear: 0, Constant: 1, Elastic: 2, Cubic: 3, Bounce: 4, CubicV2: 5 }, PoseEasingDirection: { In: 0, Out: 1, InOut: 2 },
  CameraType: { Fixed: 0, Attach: 1, Watch: 2, Track: 3, Follow: 4, Custom: 5, Scriptable: 6, Orbital: 7 },
  EasingStyle: { Linear: 0, Sine: 1, Back: 2, Quad: 3, Quart: 4, Quint: 5, Bounce: 6, Elastic: 7, Exponential: 8, Circular: 9, Cubic: 10 },
  EasingDirection: { In: 0, Out: 1, InOut: 2 },
  PlaybackState: { Begin: 0, Delayed: 1, Playing: 2, Paused: 3, Completed: 4, Cancelled: 5 },
  // UI (values from the creator docs' enum pages)
  Font: {Legacy:  0,  Arial:  1,  ArialBold:  2,  SourceSans:  3,  SourceSansBold:  4,  SourceSansLight:  5,  SourceSansItalic:  6,  Bodoni:  7,  Garamond:  8,  Cartoon:  9,  Code:  10,  Highway:  11,  SciFi:  12,  Arcade:  13,  Fantasy:  14,  Antique:  15,  SourceSansSemibold:  16,  Gotham:  17,  GothamMedium:  18,  GothamBold:  19,  GothamBlack:  20,  AmaticSC:  21,  Bangers:  22,  Creepster:  23,  DenkOne:  24,  Fondamento:  25,  FredokaOne:  26,  GrenzeGotisch:  27,  IndieFlower:  28,  JosefinSans:  29,  Jura:  30,  Kalam:  31,  LuckiestGuy:  32,  Merriweather:  33,  Michroma:  34,  Nunito:  35,  Oswald:  36,  PatrickHand:  37,  PermanentMarker:  38,  Roboto:  39,  RobotoCondensed:  40,  RobotoMono:  41,  Sarpanch:  42,  SpecialElite:  43,  TitilliumWeb:  44,  Ubuntu:  45,  BuilderSans:  46,  BuilderSansMedium:  47,  BuilderSansBold:  48,  BuilderSansExtraBold:  49,  Arimo:  50,  ArimoBold:  51, Unknown: 100},
  FontWeight: { ...FONT_WEIGHTS }, FontStyle: { ...FONT_STYLES },
  TextXAlignment: { Left: 0, Right: 1, Center: 2 }, TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
  FillDirection: { Horizontal: 0, Vertical: 1 }, HorizontalAlignment: { Center: 0, Left: 1, Right: 2 }, VerticalAlignment: { Center: 0, Top: 1, Bottom: 2 },
  SortOrder: { Name: 0, Custom: 1, LayoutOrder: 2 }, ZIndexBehavior: { Global: 0, Sibling: 1 }, ApplyStrokeMode: { Contextual: 0, Border: 1 },
  ScaleType: { Stretch: 0, Slice: 1, Tile: 2, Fit: 3, Crop: 4 }, AspectType: { FitWithinMaxSize: 0, ScaleWithParentSize: 1 }, DominantAxis: { Width: 0, Height: 1 },
  TextTruncate: { None: 0, AtEnd: 1, SplitWord: 2 },
  SurfaceGuiSizingMode: { FixedSize: 0, PixelsPerStud: 1 }, // (API dump)
  // Constraints' (API dump).
  ActuatorType: { None: 0, Motor: 1, Servo: 2 }, ActuatorRelativeTo: { Attachment0: 0, Attachment1: 1, World: 2 }, ForceLimitMode: { Magnitude: 0, PerAxis: 1 },
  PositionAlignmentMode: { OneAttachment: 0, TwoAttachment: 1 }, OrientationAlignmentMode: { OneAttachment: 0, TwoAttachment: 1 },
  AlignType: { Parallel: 0, Perpendicular: 1, PrimaryAxisParallel: 2, PrimaryAxisPerpendicular: 3, PrimaryAxisLookAt: 4, AllAxes: 5 },
  VelocityConstraintMode: { Line: 0, Plane: 1, Vector: 2 },
  // ScrollingFrame's (API dump).
  AutomaticSize: { None: 0, X: 1, Y: 2, XY: 3 }, ScrollingDirection: { X: 1, Y: 2, XY: 4 }, ElasticBehavior: { WhenScrollable: 0, Always: 1, Never: 2 },
  ScrollBarInset: { None: 0, ScrollBar: 1, Always: 2 }, VerticalScrollBarPosition: { Right: 0, Left: 1 },
  StartCorner: { TopLeft: 0, TopRight: 1, BottomLeft: 2, BottomRight: 3 },
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
/** A signal a method returns (GetPropertyChangedSignal): its instance and event name. */
export class SignalRef { constructor(inst, ev) { this.inst = inst; this.ev = ev; } }
// defaults: a class's own default for a property an ancestor defines (a ScrollingFrame clips), so the
// property is listed once, under the class that has it.
function defineClass(name, base, { props = {}, methods = {}, events = [], creatable = true, service = false, defaults = {} } = {}) {
  CLASSES[name] = { name, base, props, methods, events, creatable, service, defaults };
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
    // A signal fired (with no arguments) when that one property changes, as Changed fires with its name.
    GetPropertyChangedSignal(self, prop) {
      const name = ALIASES[prop] && ALIASES[prop] in self.props ? ALIASES[prop] : prop;
      if (typeof prop !== 'string' || !(name in self.props) && prop !== 'Parent' && prop !== 'Name') throw new Error(`${prop} is not a valid property name.`);
      return [new SignalRef(self, 'Changed:' + name)];
    },
    Destroy(self) { self.dm.destroy(self); return []; },
    Clone(self) { return [self.dm.clone(self)]; },
    ClearAllChildren(self) { for (const c of self.children.slice()) self.dm.destroy(c); return []; },
    GetFullName(self) { const n = []; for (let i = self; i && i.parent; i = i.parent) n.unshift(i.Name); return [n.join('.')]; },
    WaitForChild(self, name) { return [self.children.find(c => c.Name === name) || null]; },
  },
  events: ['ChildAdded', 'ChildRemoved', 'Changed', 'Destroying'],
});
defineClass('DataModel', 'Instance', { creatable: false, methods: { GetService(self, name) { return [self.dm.service(name)]; } } });
defineClass('Workspace', 'Instance', {
  // GlobalWind (studs/s): ParticleEmitters with WindAffectsDrag drift toward it (runtime/particles.js).
  creatable: false, service: true, props: { Gravity: ['number', 196.2], FallenPartsDestroyHeight: ['number', -500], CurrentCamera: ['Instance', null], GlobalWind: ['Vector3', [0, 0, 0]] },
  methods: {
    // The engine half of WorldRoot:Raycast (the Luau half, with RaycastParams and
    // RaycastResult, is in luau/lib_raycast.h). Returns instance, position, normal,
    // material, distance; or nothing.
    __studioRaycast(self, origin, direction, filter, filterType, respectCanCollide) {
      return self.dm.raycast(origin, direction, { filter: filter instanceof LuaTable ? filter.list() : (filter || []), include: filterType === 1, respectCanCollide: !!respectCanCollide });
    },
  },
});
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
// BillboardGui (Roblox): a GUI canvas in the 3D world, facing the camera, at its Adornee (or its parent part or
// attachment), drawn by runtime/gui.js. Size's Scale is studs, its Offset pixels. Defaults from the API dump.
defineClass('BillboardGui', 'LayerCollector', {
  props: {
    Active: ['bool', false], Adornee: ['Instance', null], AlwaysOnTop: ['bool', false], Brightness: ['number', 1], ClipsDescendants: ['bool', false],
    CurrentDistance: ['number', 0], DistanceLowerLimit: ['number', 0], DistanceStep: ['number', 0], DistanceUpperLimit: ['number', -1],
    ExtentsOffset: ['Vector3', [0, 0, 0]], ExtentsOffsetWorldSpace: ['Vector3', [0, 0, 0]], LightInfluence: ['number', 0], MaxDistance: ['number', Infinity],
    PlayerToHideFrom: ['Instance', null], Size: ['UDim2', [0, 0, 0, 0]], SizeOffset: ['Vector2', [0, 0]], StudsOffset: ['Vector3', [0, 0, 0]], StudsOffsetWorldSpace: ['Vector3', [0, 0, 0]],
  },
});
// SurfaceGui (Roblox): a GUI canvas drawn on a face of its Adornee (or its parent part), by runtime/gui.js (layout,
// the texture, AlwaysOnTop) and runtime/surfaces.js (the face in the 3D view). Defaults from the API dump (Active:
// the docs, "true by default"; SurfaceGuiBase isn't creatable, so the dump has none). MaxDistance 0: no limit.
defineClass('SurfaceGui', 'LayerCollector', {
  props: {
    Active: ['bool', true], Adornee: ['Instance', null], Face: ['Enum.NormalId', 'Front'], AlwaysOnTop: ['bool', false], Brightness: ['number', 1],
    CanvasSize: ['Vector2', [800, 600]], ClipsDescendants: ['bool', false], LightInfluence: ['number', 0], MaxDistance: ['number', 0],
    PixelsPerStud: ['number', 50], SizingMode: ['Enum.SurfaceGuiSizingMode', 'FixedSize'], ToolPunchThroughDistance: ['number', 0], ZOffset: ['number', 0],
  },
});
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
// ScrollingFrame (classes/ScrollingFrame.yaml; defaults from Roblox's reflection data, rbx-dom v0.745).
// Its children sit on a canvas of AbsoluteCanvasSize (CanvasSize against the frame's size, less a
// scroll bar's gutter where an inset says so; AutomaticCanvasSize grows it to the children), seen
// through a window of AbsoluteWindowSize (the frame less the gutters of the bars on show), moved by
// CanvasPosition. The scroll bar images are Roblox's own textures: a flat stand-in is drawn unless
// an image is given (runtime/gui.js).
defineClass('ScrollingFrame', 'GuiObject', {
  defaults: { ClipsDescendants: true },
  props: {
    AbsoluteCanvasSize: ['Vector2', [0, 0]], AbsoluteWindowSize: ['Vector2', [0, 0]], AutomaticCanvasSize: ['Enum.AutomaticSize', 'None'],
    CanvasPosition: ['Vector2', [0, 0]], CanvasSize: ['UDim2', [0, 0, 2, 0]], ElasticBehavior: ['Enum.ElasticBehavior', 'WhenScrollable'],
    HorizontalScrollBarInset: ['Enum.ScrollBarInset', 'None'], VerticalScrollBarInset: ['Enum.ScrollBarInset', 'None'], VerticalScrollBarPosition: ['Enum.VerticalScrollBarPosition', 'Right'],
    ScrollBarImageColor3: ['Color3', [1, 1, 1]], ScrollBarImageTransparency: ['number', 0], ScrollBarThickness: ['number', 12],
    ScrollingDirection: ['Enum.ScrollingDirection', 'XY'], ScrollingEnabled: ['bool', true],
    TopImage: ['string', 'rbxasset://textures/ui/Scroll/scroll-top.png'], MidImage: ['string', 'rbxasset://textures/ui/Scroll/scroll-middle.png'], BottomImage: ['string', 'rbxasset://textures/ui/Scroll/scroll-bottom.png'],
  },
});
const TEXT = {
  Text: ['string', 'Label'], TextColor3: ['Color3', rgb(27, 42, 53)], TextSize: ['number', 8], Font: ['Enum.Font', 'Legacy'],
  TextScaled: ['bool', false], TextWrapped: ['bool', false], TextXAlignment: ['Enum.TextXAlignment', 'Center'], TextYAlignment: ['Enum.TextYAlignment', 'Center'],
  TextTransparency: ['number', 0], TextStrokeTransparency: ['number', 1], TextStrokeColor3: ['Color3', [0, 0, 0]], RichText: ['bool', false],
  LineHeight: ['number', 1], TextTruncate: ['Enum.TextTruncate', 'None'],
  // FontFace and Font are one setting seen two ways (Roblox keeps them in step: DataModel.set).
  FontFace: ['Font', ['rbxasset://fonts/families/LegacyArial.json', 'Regular', 'Normal']],
};
const IMAGE = { Image: ['string', ''], ImageColor3: ['Color3', [1, 1, 1]], ImageTransparency: ['number', 0], ScaleType: ['Enum.ScaleType', 'Stretch'] };
defineClass('TextLabel', 'GuiObject', { props: { ...TEXT } });
defineClass('ImageLabel', 'GuiObject', { props: { ...IMAGE } });
// Buttons: Active by default; Activated fires on a press and release inside (only while Active).
defineClass('GuiButton', 'GuiObject', { creatable: false, props: { AutoButtonColor: ['bool', true], Active: ['bool', true] }, events: ['Activated', 'MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up'] });
defineClass('TextButton', 'GuiButton', { props: { ...TEXT, Text: ['string', 'Button'] } });
defineClass('ImageButton', 'GuiButton', { props: { ...IMAGE } });
// TextBox (classes/TextBox.yaml; defaults from rbx-dom v0.745): a tap or click focuses it (one at a
// time), CaptureFocus too; while focused the player types into Text (Changed fires per keystroke) and
// the game's keys stay out; Enter (not MultiLine, where it starts a new line) or ReleaseFocus(true)
// submits, clicking elsewhere or ReleaseFocus() doesn't. Focused, then FocusLost(enterPressed, input)
// (the InputObject is nil: there are no InputObjects here). ClearTextOnFocus empties Text on focus;
// TextEditable false keeps it as it is; an empty Text shows PlaceholderText in PlaceholderColor3.
defineClass('TextBox', 'GuiObject', {
  defaults: { Active: true },
  props: {
    ...TEXT, Text: ['string', 'TextBox'], ClearTextOnFocus: ['bool', true], MultiLine: ['bool', false], TextEditable: ['bool', true],
    PlaceholderText: ['string', ''], PlaceholderColor3: ['Color3', [0.5, 0.5, 0.5]], ShowNativeInput: ['bool', true],
  },
  methods: {
    CaptureFocus(self) { self.dm.focusTextBox(self); return []; },
    ReleaseFocus(self, submitted) { self.dm.releaseTextBox(self, !!submitted); return []; },
    IsFocused(self) { return [self.dm.focusedTextBox === self]; },
  },
  events: ['Focused', 'FocusLost'],
});
// Modifiers: children of a GuiObject that change how it's drawn or laid out.
defineClass('UIComponent', 'Instance', { creatable: false });
defineClass('UICorner', 'UIComponent', { props: { CornerRadius: ['UDim', [0, 8]] } });
defineClass('UIStroke', 'UIComponent', { props: { Thickness: ['number', 1], Color: ['Color3', [0, 0, 0]], Transparency: ['number', 0], ApplyStrokeMode: ['Enum.ApplyStrokeMode', 'Contextual'], Enabled: ['bool', true] } });
defineClass('UIPadding', 'UIComponent', { props: { PaddingTop: ['UDim', [0, 0]], PaddingBottom: ['UDim', [0, 0]], PaddingLeft: ['UDim', [0, 0]], PaddingRight: ['UDim', [0, 0]] } });
// Layouts (UIGridStyleLayout): AbsoluteContentSize is the space the laid-out children take, padding
// between them included, written by the layout pass (and brought up to date when a script reads it).
defineClass('UILayout', 'UIComponent', { creatable: false });
defineClass('UIGridStyleLayout', 'UILayout', { creatable: false, props: { AbsoluteContentSize: ['Vector2', [0, 0]] } });
defineClass('UIListLayout', 'UIGridStyleLayout', { props: { FillDirection: ['Enum.FillDirection', 'Vertical'], HorizontalAlignment: ['Enum.HorizontalAlignment', 'Left'], VerticalAlignment: ['Enum.VerticalAlignment', 'Top'], SortOrder: ['Enum.SortOrder', 'Name'], Padding: ['UDim', [0, 0]] } });
// UIGridLayout (classes/UIGridLayout.yaml; defaults from rbx-dom v0.745): equal cells of CellSize, CellPadding
// apart, filling lines along FillDirection (as many as fit, at most FillDirectionMaxCells when that is
// above 0) from StartCorner; the block of cells aligned in the parent. A child's own Size is replaced
// by the cell's, unless a constraint of its own sizes it. AbsoluteCellCount and AbsoluteCellSize are
// written by the layout pass (runtime/gui.js).
defineClass('UIGridLayout', 'UIGridStyleLayout', { props: {
  CellPadding: ['UDim2', [0, 5, 0, 5]], CellSize: ['UDim2', [0, 100, 0, 100]], FillDirection: ['Enum.FillDirection', 'Horizontal'], FillDirectionMaxCells: ['number', 0],
  HorizontalAlignment: ['Enum.HorizontalAlignment', 'Left'], VerticalAlignment: ['Enum.VerticalAlignment', 'Top'], SortOrder: ['Enum.SortOrder', 'Name'],
  StartCorner: ['Enum.StartCorner', 'TopLeft'], AbsoluteCellCount: ['Vector2', [0, 0]], AbsoluteCellSize: ['Vector2', [100, 100]],
} });
// UIGradient (classes/UIGradient.yaml; defaults from rbx-dom v0.745): blends a colour and a transparency
// gradient into its parent's own drawing (its background, text and image; not its children), along
// Rotation (clockwise degrees from left to right), moved by Offset (in shares of the parent's size).
// Drawn by runtime/gui.js. Scale, TileMode and Type aren't implemented (Linear, Clamp, Scale 1 only).
defineClass('UIGradient', 'UIComponent', { props: {
  Color: ['ColorSequence', '0 1 1 1 0 1 1 1 1 0 '], Transparency: ['NumberSequence', '0 0 0 1 0 0 '], Offset: ['Vector2', [0, 0]], Rotation: ['number', 0], Enabled: ['bool', true],
} });
defineClass('UIAspectRatioConstraint', 'UIComponent', { props: { AspectRatio: ['number', 1], AspectType: ['Enum.AspectType', 'FitWithinMaxSize'], DominantAxis: ['Enum.DominantAxis', 'Width'] } });
// UIScale (classes/UIScale.yaml): multiplies its parent's AbsoluteSize, and everything inside it, by
// Scale. UISizeConstraint (classes/UISizeConstraint.yaml): keeps its parent between MinSize and MaxSize
// pixels, over any size a layout gives it. Both drawn by runtime/gui.js.
defineClass('UIScale', 'UIComponent', { props: { Scale: ['number', 1] } });
defineClass('UISizeConstraint', 'UIComponent', { props: { MinSize: ['Vector2', [0, 0]], MaxSize: ['Vector2', [Infinity, Infinity]] } });
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
      // Every target first: setting one part's CFrame moves its whole assembly (web/assembly.js), so a
      // part read after another was set would be moved twice.
      const targets = partsOf(self).map(p => [p, delta.mul(p.props.CFrame)]);
      for (const [p, t] of targets) self.dm.set(p, 'CFrame', t);
      return [];
    },
  },
});
defineClass('BasePart', 'Instance', {
  creatable: false,
  props: {
    CFrame: ['CFrame', null], Position: ['Vector3', [0, 0, 0]], Orientation: ['Vector3', [0, 0, 0]], Size: ['Vector3', [4, 1, 2]],
    Anchored: ['bool', false], CanCollide: ['bool', true], CanTouch: ['bool', true], CanQuery: ['bool', true], Transparency: ['number', 0],
    // BrickColor: a view of Color (brickcolor.js), the nearest named colour; setting it sets Color.
    BrickColor: ['BrickColor', null], Color: ['Color3', [163 / 255, 162 / 255, 165 / 255]], Material: ['Enum.Material', 'Plastic'], Reflectance: ['number', 0],
    // Studio only: a locked part can't be clicked to select it (it still shows in the Explorer).
    Locked: ['bool', false],
    // studs/s and rad/s. Physics writes them for unanchored parts; on an anchored part they only carry what stands on it (a conveyor).
    AssemblyLinearVelocity: ['Vector3', [0, 0, 0]], AssemblyAngularVelocity: ['Vector3', [0, 0, 0]],
    // Assemblies (web/assembly.js): parts joined by rigid joints move as one, from a root part.
    Massless: ['bool', false], RootPriority: ['number', 0], AssemblyRootPart: ['Instance', null],
    // Its assembly's mass (Massless parts but the root add none), worked out when read.
    AssemblyMass: ['number', 0],
  },
  methods: {
    // Its mass: its material's density x its shape's volume (as World's bodies have it; OURS: a MeshPart's as its box).
    GetMass(self) { return [partMass(self)]; },
    GetPivot(self) { return [self.props.CFrame]; },
    GetRootPart(self) { self.dm.assemblies.flush(); return [self.props.AssemblyRootPart || self]; },
    // The parts joined to this one by active rigid joints; recursive: its whole assembly, itself
    // included (UNSURE: whether Roblox's list includes the part itself).
    GetConnectedParts(self, recursive) {
      const a = self.dm.assemblies.assemblyOf(self);
      if (!a) return [[]];
      if (recursive) return [a.parts.slice()];
      const out = [];
      for (const [p, [q]] of a.edges) { if (q === self) out.push(p); if (p === self) out.push(q); }
      return [out];
    },
    GetJoints(self) {
      const a = self.dm.assemblies.assemblyOf(self);
      return [a ? [...a.edges.values()].map(([, j]) => j).filter(j => j.props.Part0 === self || j.props.Part1 === self) : []];
    },
    PivotTo(self, cf) { if (!(cf instanceof CF)) throw new Error('Unable to cast value to CFrame'); self.dm.set(self, 'CFrame', cf); return []; },
    // Solid modelling (web/modeling/csg.js, through dm.hooks.csg): yields, and returns the new
    // operation with no Parent, as Roblox's do.
    UnionAsync(self, parts, cf, rf) { return solidModel(self, 'union', parts, cf, rf); },
    SubtractAsync(self, parts, cf, rf) { return solidModel(self, 'subtract', parts, cf, rf); },
    IntersectAsync(self, parts, cf, rf) { return solidModel(self, 'intersect', parts, cf, rf); },
  },
  events: ['Touched', 'TouchEnded'],
});
// Smooth terrain (create.roblox.com/docs/reference/engine/classes/Terrain):
// workspace.Terrain, a grid of 4-stud cells (terrain/voxels.js), drawn and
// collided by runtime/terrain.js. Water defaults from Roblox's API dump.
const terrainMaterial = v => {
  const name = v instanceof EnumItem ? v.name : v;
  if (!TERRAIN_MATERIALS.includes(name)) throw new Error(`Unable to cast value to terrain Material (${name})`);
  return name;
};
const terrainChanged = t => t.dm.notify(t, 'Voxels');
const v3 = v => { if (!(v instanceof V3)) throw new Error('Unable to cast value to Vector3'); return v; };
const cframe = v => { if (!(v instanceof CF)) throw new Error('Unable to cast value to CFrame'); return v; };
defineClass('Terrain', 'BasePart', {
  creatable: false,
  props: { WaterColor: ['Color3', [0.05, 0.33, 0.36]], WaterReflectance: ['number', 1], WaterTransparency: ['number', 0.3], WaterWaveSize: ['number', 0.15], WaterWaveSpeed: ['number', 10] },
  methods: {
    FillBlock(self, cf, size, mat) { cframe(cf); v3(size); const b = boxBounds(cf.m, size); self.voxels.fill(shapes.block(cf.m, size), b.min, b.max, terrainMaterial(mat)); terrainChanged(self); return []; },
    FillBall(self, c, r, mat) { v3(c); r = +r; self.voxels.fill(shapes.ball(c, r), [c.x - r, c.y - r, c.z - r], [c.x + r, c.y + r, c.z + r], terrainMaterial(mat)); terrainChanged(self); return []; },
    FillCylinder(self, cf, height, r, mat) { cframe(cf); height = +height; r = +r; const b = boxBounds(cf.m, new V3(2 * r, height, 2 * r)); self.voxels.fill(shapes.cylinder(cf.m, height, r), b.min, b.max, terrainMaterial(mat)); terrainChanged(self); return []; },
    FillWedge(self, cf, size, mat) { cframe(cf); v3(size); const b = boxBounds(cf.m, size); self.voxels.fill(shapes.wedge(cf.m, size), b.min, b.max, terrainMaterial(mat)); terrainChanged(self); return []; },
    Clear(self) { self.voxels.clear(); terrainChanged(self); return []; },
    CountCells(self) { return [self.voxels.count()]; },
    WorldToCell(self, p) { v3(p); return [new V3(Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL))]; },
    WorldToCellPreferSolid(self, p) { v3(p); return [new V3(Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL))]; },
    WorldToCellPreferEmpty(self, p) { v3(p); return [new V3(Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL))]; },
    CellCenterToWorld(self, x, y, z) { return [new V3((Math.floor(x) + 0.5) * CELL, (Math.floor(y) + 0.5) * CELL, (Math.floor(z) + 0.5) * CELL)]; },
    CellCornerToWorld(self, x, y, z) { return [new V3(Math.floor(x) * CELL, Math.floor(y) * CELL, Math.floor(z) * CELL)]; },
    GetMaterialColor(self, mat) { const c = self.voxels.colors[terrainMaterial(mat)]; if (!c) throw new Error('Material has no colour'); return [new C3(c[0] / 255, c[1] / 255, c[2] / 255)]; },
    SetMaterialColor(self, mat, col) { const name = terrainMaterial(mat); if (!(col instanceof C3)) throw new Error('Unable to cast value to Color3'); self.voxels.colors[name] = [col.r * 255, col.g * 255, col.b * 255].map(Math.round); for (const k of self.voxels.chunks.keys()) self.voxels.dirty.add(k); terrainChanged(self); return []; },
  },
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
// MeshData is the studio's own (Roblox's nearest is EditableMesh): an editable
// mesh from the modeling kernel (web/modeling/), drawn instead of MeshId's file.
defineClass('MeshPart', 'TriangleMeshPart', { props: { MeshId: ['string', ''], TextureID: ['string', ''], DoubleSided: ['bool', false], RenderFidelity: ['Enum.RenderFidelity', 'Automatic'], MeshData: ['string', ''] } });
// Solid modelling's results (web/modeling/csg.js): drawn and collided like an editable MeshPart
// from MeshData (the result in studs, about its extent's centre; Roblox keeps its own MeshData and
// ChildData hidden too). ChildData holds the source parts, for Studio's Separate; PartColors (ours)
// each source part's colour, shown unless UsePartColor.
defineClass('PartOperation', 'TriangleMeshPart', { creatable: false, props: { UsePartColor: ['bool', false], RenderFidelity: ['Enum.RenderFidelity', 'Automatic'], SmoothingAngle: ['number', 0], TriangleCount: ['number', 0], MeshData: ['string', ''], ChildData: ['string', ''], PartColors: ['string', ''] } });
defineClass('UnionOperation', 'PartOperation');
defineClass('NegateOperation', 'PartOperation');
defineClass('IntersectOperation', 'PartOperation');
function solidModel(self, op, parts, cf, rf) {
  const list = parts instanceof LuaTable ? parts.list() : Array.isArray(parts) ? parts : null;
  if (!list) throw new Error('Unable to cast value to Objects');
  if (!self.dm.hooks.csg) throw new Error('Solid modelling is not available here');
  const opts = { collisionFidelity: cf == null ? 'Default' : enumName(cf), renderFidelity: rf == null ? 'Automatic' : enumName(rf) };
  // Worked out before yielding, so a failure is an error in the calling script (as Roblox raises one);
  // the result comes back when the thread resumes, as a yielding call's does.
  const result = self.dm.hooks.csg(op, self, list, opts);
  return self.dm.async(self, Promise.resolve([result]));
}
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
// Only under Lighting, and only the most recently parented one counts (Roblox's docs).
// Claude Studio's own looks (STUDIO_OWN), placed like Roblox's effects (children of Lighting or the
// camera) and drawn by runtime/styles.js: cel shading, ink outlines, and a pixel look.
defineClass('ToonEffect', 'PostEffect', { props: { Bands: ['number', 3], Softness: ['number', 0.05] } });
defineClass('OutlineEffect', 'PostEffect', { props: { Color: ['Color3', [0, 0, 0]], Transparency: ['number', 0], Thickness: ['number', 1], DepthSensitivity: ['number', 0.5], NormalSensitivity: ['number', 0.5] } });
defineClass('PixelEffect', 'PostEffect', { props: { PixelSize: ['number', 4], Colors: ['number', 0], Dither: ['bool', false] } });
defineClass('ColorGradingEffect', 'PostEffect', { props: { TonemapperPreset: ['Enum.TonemapperPreset', 'Default'] } });
defineClass('Atmosphere', 'Instance', { props: { Density: ['number', 0.395], Offset: ['number', 0], Color: ['Color3', [0.7843, 0.6667, 0.4235]], Decay: ['Color3', [0.3608, 0.2353, 0.0549]], Glare: ['number', 0], Haze: ['number', 0] } });
defineClass('Sky', 'Instance', { props: { CelestialBodiesShown: ['bool', true], StarCount: ['number', 3000], SunAngularSize: ['number', 21], MoonAngularSize: ['number', 11] } });
// Highlight (Roblox): a fill and an outline on its Adornee, or its Parent (a part or a model), drawn by
// runtime/highlights.js. Defaults from the API dump.
defineClass('Highlight', 'Instance', {
  props: {
    Adornee: ['Instance', null], DepthMode: ['Enum.HighlightDepthMode', 'AlwaysOnTop'], Enabled: ['bool', true],
    FillColor: ['Color3', [1, 0, 0]], FillTransparency: ['number', 0.5], LineThickness: ['number', 1],
    OutlineColor: ['Color3', [1, 1, 1]], OutlineTransparency: ['number', 0],
  },
});
// Attachment (Roblox): a point and orientation on its parent part. CFrame, Position and Orientation
// are relative to the part (one truth, CFrame, as for parts); the World* values are the part's CFrame
// times it, worked out when read (physics moves parts without telling their attachments) and settable
// (they set the local CFrame). Axis and SecondaryAxis are its X and Y directions. Under anything other
// than a BasePart, the world frame is its own. ParticleEmitters and lights may live in one.
defineClass('Attachment', 'Instance', {
  props: {
    CFrame: ['CFrame'], Position: ['Vector3', [0, 0, 0]], Orientation: ['Vector3', [0, 0, 0]], Visible: ['bool', false],
    Axis: ['Vector3', [1, 0, 0]], SecondaryAxis: ['Vector3', [0, 1, 0]],
    WorldCFrame: ['CFrame'], WorldPosition: ['Vector3', [0, 0, 0]], WorldOrientation: ['Vector3', [0, 0, 0]], WorldAxis: ['Vector3', [1, 0, 0]], WorldSecondaryAxis: ['Vector3', [0, 1, 0]],
  },
});
// Bodies. HumanoidDescription (Roblox): a character's look, here its body scales and six body colours
// (defaults from the API dump: the colours start black, as Roblox's do). BodyColors (Roblox): a
// character's six colours as worn. BodyShape (Claude Studio's own): the shape of a generated R15 body
// (runtime/bodygen.js), every proportion in studs, the defaults our studio body's; a HumanoidDescription's
// BodyShape child gives the shape its scales and colours apply to. A HumanoidDescription in StarterPlayer
// is every player's body (OURS: Roblox keeps a game's avatar settings in Game Settings, outside the
// place's tree). ProportionScale and BodyTypeScale are kept and change nothing: they blend towards
// Roblox's own bodies' proportions, which ours don't have.
defineClass('HumanoidDescription', 'Instance', {
  props: {
    BodyTypeScale: ['number', 0.3], DepthScale: ['number', 1], HeadScale: ['number', 1], HeightScale: ['number', 1], ProportionScale: ['number', 1], WidthScale: ['number', 1],
    HeadColor: ['Color3', [0, 0, 0]], TorsoColor: ['Color3', [0, 0, 0]], LeftArmColor: ['Color3', [0, 0, 0]], RightArmColor: ['Color3', [0, 0, 0]], LeftLegColor: ['Color3', [0, 0, 0]], RightLegColor: ['Color3', [0, 0, 0]],
  },
});
defineClass('BodyColors', 'Instance', {
  props: {
    HeadColor3: ['Color3', [0.992157, 0.917647, 0.552941]], TorsoColor3: ['Color3', [0.156863, 0.498039, 0.278431]], LeftArmColor3: ['Color3', [0.992157, 0.917647, 0.552941]],
    RightArmColor3: ['Color3', [0.992157, 0.917647, 0.552941]], LeftLegColor3: ['Color3', [0.0509804, 0.411765, 0.67451]], RightLegColor3: ['Color3', [0.0509804, 0.411765, 0.67451]],
  },
});
defineClass('BodyShape', 'Instance', { props: Object.fromEntries(SHAPE_PROPS.map(([prop, k]) => [prop, ['number', BODY_PRESETS.studio[k]]])) });
// Joints (web/assembly.js holds what they do). JointInstance: Part1 sits at Part0 * C0 * C1:Inverse()
// (a Motor turned CurrentAngle about Z between them, a Motor6D its Transform: what Animators write).
// WeldConstraint keeps the offset its parts had when it became active. Active is the engine's (a
// joint in a cycle, or joining two anchored assemblies, is inactive). ChildName mirrors Part1's Name.
defineClass('JointInstance', 'Instance', { creatable: false, props: { Part0: ['Instance', null], Part1: ['Instance', null], C0: ['CFrame'], C1: ['CFrame'], Enabled: ['bool', true], Active: ['bool', false] } });
defineClass('Weld', 'JointInstance', {});
defineClass('Snap', 'JointInstance', {});
defineClass('Motor', 'JointInstance', { props: { CurrentAngle: ['number', 0], DesiredAngle: ['number', 0], MaxVelocity: ['number', 0] } });
defineClass('Motor6D', 'Motor', { props: { Transform: ['CFrame'], ChildName: ['string', ''] } });
// Constraints (mashup-research/ROBLOX_CONSTRAINTS_2026-11-26.md; runtime/constraints.js does what they do): between
// two Attachments' parts. Defaults: rbx-dom's (Instance.new's; its nulls are infinities). Color (a BrickColor, for
// Studio's drawing of them) isn't kept: constraints aren't drawn yet; nor the Softlock*UponReachingTarget flags (no docs). Active, CurrentAngle, CurrentDistance,
// CurrentLength, CurrentPosition: the engine's.
const ANG = { AngularResponsiveness: ['number', 45], AngularSpeed: ['number', 0], AngularVelocity: ['number', 0], LowerAngle: ['number', -45], UpperAngle: ['number', 45], ServoMaxTorque: ['number', 0], TargetAngle: ['number', 0] };
defineClass('Constraint', 'Instance', { creatable: false, props: { Active: ['bool', false], Attachment0: ['Instance', null], Attachment1: ['Instance', null], Enabled: ['bool', true], Visible: ['bool', false] } });
defineClass('HingeConstraint', 'Constraint', { props: { ...ANG, ActuatorType: ['Enum.ActuatorType', 'None'], CurrentAngle: ['number', 0], LimitsEnabled: ['bool', false], MotorMaxAcceleration: ['number', 500000], MotorMaxTorque: ['number', 0], Radius: ['number', 0.15], Restitution: ['number', 0] } });
defineClass('BallSocketConstraint', 'Constraint', { props: { LimitsEnabled: ['bool', false], MaxFrictionTorque: ['number', 0], Radius: ['number', 0.15], Restitution: ['number', 0], TwistLimitsEnabled: ['bool', false], TwistLowerAngle: ['number', -45], TwistUpperAngle: ['number', 45], UpperAngle: ['number', 45] } });
defineClass('RopeConstraint', 'Constraint', { props: { CurrentDistance: ['number', 0], Length: ['number', 5], Restitution: ['number', 0], Thickness: ['number', 0.1], WinchEnabled: ['bool', false], WinchForce: ['number', 10000], WinchResponsiveness: ['number', 45], WinchSpeed: ['number', 2], WinchTarget: ['number', 5] } });
defineClass('RodConstraint', 'Constraint', { props: { CurrentDistance: ['number', 0], Length: ['number', 5], LimitAngle0: ['number', 90], LimitAngle1: ['number', 90], LimitsEnabled: ['bool', false], Thickness: ['number', 0.1] } });
defineClass('SpringConstraint', 'Constraint', { props: { Coils: ['number', 3], CurrentLength: ['number', 0], Damping: ['number', 0], FreeLength: ['number', 1], LimitsEnabled: ['bool', false], MaxForce: ['number', Infinity], MaxLength: ['number', 5], MinLength: ['number', 0], Radius: ['number', 0.4], Stiffness: ['number', 0], Thickness: ['number', 0.1] } });
defineClass('SlidingBallConstraint', 'Constraint', { creatable: false, props: { ActuatorType: ['Enum.ActuatorType', 'None'], CurrentPosition: ['number', 0], LimitsEnabled: ['bool', false], LinearResponsiveness: ['number', 45], LowerLimit: ['number', 0], MotorMaxAcceleration: ['number', Infinity], MotorMaxForce: ['number', 0], Restitution: ['number', 0], ServoMaxForce: ['number', 0], Size: ['number', 0.15], Speed: ['number', 0], TargetPosition: ['number', 0], UpperLimit: ['number', 5], Velocity: ['number', 0] } });
defineClass('PrismaticConstraint', 'SlidingBallConstraint', {});
defineClass('CylindricalConstraint', 'SlidingBallConstraint', { props: { ...ANG, AngularActuatorType: ['Enum.ActuatorType', 'None'], AngularLimitsEnabled: ['bool', false], AngularRestitution: ['number', 0], CurrentAngle: ['number', 0], InclinationAngle: ['number', 0], MotorMaxAngularAcceleration: ['number', 500000], MotorMaxTorque: ['number', 0], RotationAxisVisible: ['bool', false] } });
defineClass('UniversalConstraint', 'Constraint', { props: { LimitsEnabled: ['bool', false], MaxAngle: ['number', 45], Radius: ['number', 0.2], Restitution: ['number', 0] } });
// NoCollisionConstraint: no Attachments; Part0 and Part1 don't collide with each other.
defineClass('NoCollisionConstraint', 'Instance', { props: { Enabled: ['bool', true], Part0: ['Instance', null], Part1: ['Instance', null] } });
defineClass('VectorForce', 'Constraint', { props: { ApplyAtCenterOfMass: ['bool', false], Force: ['Vector3', [1000, 0, 0]], RelativeTo: ['Enum.ActuatorRelativeTo', 'Attachment0'] } });
defineClass('Torque', 'Constraint', { props: { RelativeTo: ['Enum.ActuatorRelativeTo', 'Attachment0'], Torque: ['Vector3', [0, 0, 0]] } });
defineClass('LinearVelocity', 'Constraint', { props: { ForceLimitMode: ['Enum.ForceLimitMode', 'Magnitude'], ForceLimitsEnabled: ['bool', true], LineDirection: ['Vector3', [1, 0, 0]], LineVelocity: ['number', 0], MaxAxesForce: ['Vector3', [1000, 1000, 1000]], MaxForce: ['number', 1000], MaxPlanarAxesForce: ['Vector2', [1000, 1000]], PlaneVelocity: ['Vector2', [0, 0]], PrimaryTangentAxis: ['Vector3', [1, 0, 0]], ReactionForceEnabled: ['bool', true], RelativeTo: ['Enum.ActuatorRelativeTo', 'World'], SecondaryTangentAxis: ['Vector3', [0, 1, 0]], VectorVelocity: ['Vector3', [0, 0, 0]], VelocityConstraintMode: ['Enum.VelocityConstraintMode', 'Vector'] } });
defineClass('AngularVelocity', 'Constraint', { props: { AngularVelocity: ['Vector3', [0, 0, 0]], MaxTorque: ['number', 0], ReactionTorqueEnabled: ['bool', false], RelativeTo: ['Enum.ActuatorRelativeTo', 'World'] } });
defineClass('AlignPosition', 'Constraint', { props: { ApplyAtCenterOfMass: ['bool', false], ForceLimitMode: ['Enum.ForceLimitMode', 'Magnitude'], ForceRelativeTo: ['Enum.ActuatorRelativeTo', 'World'], MaxAxesForce: ['Vector3', [10000, 10000, 10000]], MaxForce: ['number', 10000], MaxVelocity: ['number', Infinity], Mode: ['Enum.PositionAlignmentMode', 'TwoAttachment'], Position: ['Vector3', [0, 0, 0]], ReactionForceEnabled: ['bool', false], Responsiveness: ['number', 10], RigidityEnabled: ['bool', false] } });
defineClass('AlignOrientation', 'Constraint', { props: { AlignType: ['Enum.AlignType', 'AllAxes'], CFrame: ['CFrame'], MaxAngularVelocity: ['number', Infinity], MaxTorque: ['number', 10000], Mode: ['Enum.OrientationAlignmentMode', 'TwoAttachment'], PrimaryAxisOnly: ['bool', false], ReactionTorqueEnabled: ['bool', false], Responsiveness: ['number', 10], RigidityEnabled: ['bool', false] } });
defineClass('WeldConstraint', 'Instance', { props: { Part0: ['Instance', null], Part1: ['Instance', null], Enabled: ['bool', true], Active: ['bool', false] } });
// Local lights: direct children of a BasePart (mashup-research/ROBLOX_LIGHTING_2026-10-09.md
// section 7). Instance.new defaults from rbx-dom's reflection database; Range is
// clamped to 120 studs and Angle to [0, 180] when set (Roblox clamps them). Drawn
// by runtime/locallights.js.
defineClass('Light', 'Instance', { creatable: false, props: { Brightness: ['number', 1], Color: ['Color3', [1, 1, 1]], Enabled: ['bool', true], Shadows: ['bool', false] } });
defineClass('PointLight', 'Light', { props: { Range: ['number', 8] } });
// ParticleEmitter: Roblox's properties and defaults, from the API dump (as its serialised strings);
// behaviour in mashup-research/ROBLOX_PARTICLES_2026-11-13.md. Emit and Clear fire the hidden events
// Roblox has for them (OnEmitRequested, OnClearRequested); the renderer (runtime/particles.js) does
// the rest. LightInfluence is 0 from Instance.new, 1 when inserted with the editor's tools.
defineClass('ParticleEmitter', 'Instance', {
  props: {
    Acceleration: ['Vector3', [0, 0, 0]], Brightness: ['number', 1], Color: ['ColorSequence', '0 1 1 1 0 1 1 1 1 0 '], Drag: ['number', 0],
    EmissionDirection: ['Enum.NormalId', 'Top'], Enabled: ['bool', true], FlipbookBlendFrames: ['bool', true], FlipbookFramerate: ['NumberRange', '1 1 '],
    FlipbookLayout: ['Enum.ParticleFlipbookLayout', 'None'], FlipbookMode: ['Enum.ParticleFlipbookMode', 'Loop'], FlipbookSizeX: ['number', 1], FlipbookSizeY: ['number', 1],
    FlipbookStartRandom: ['bool', false], Lifetime: ['NumberRange', '5 10 '], LightEmission: ['number', 0], LightInfluence: ['number', 0], LockedToPart: ['bool', false],
    Orientation: ['Enum.ParticleOrientation', 'FacingCamera'], Rate: ['number', 20], RotSpeed: ['NumberRange', '0 0 '], Rotation: ['NumberRange', '0 0 '],
    Shape: ['Enum.ParticleEmitterShape', 'Box'], ShapeInOut: ['Enum.ParticleEmitterShapeInOut', 'Outward'], ShapePartial: ['number', 1], ShapeStyle: ['Enum.ParticleEmitterShapeStyle', 'Volume'],
    Size: ['NumberSequence', '0 1 0 1 1 0 '], Speed: ['NumberRange', '5 5 '], SpreadAngle: ['Vector2', [0, 0]], Squash: ['NumberSequence', '0 0 0 1 0 0 '],
    Texture: ['string', 'rbxasset://textures/particles/sparkles_main.dds'], TimeScale: ['number', 1], Transparency: ['NumberSequence', '0 0 0 1 0 0 '],
    VelocityInheritance: ['number', 0], WindAffectsDrag: ['bool', false], ZOffset: ['number', 0],
    // Claude Studio's own extras (not in Roblox; STUDIO_OWN): the particles light their surroundings
    // (LightRange studs), and collide with parts. The fidelity tier budgets both (runtime/quality.js).
    CastLight: ['bool', false], LightRange: ['number', 8], Collision: ['Enum.ParticleCollision', 'None'], Bounciness: ['number', 0.5],
  },
  methods: {
    Emit(self, n = 16) { self.dm.fire(self, 'OnEmitRequested', [Math.max(0, Math.floor(+n || 0))]); return []; },
    Clear(self) { self.dm.fire(self, 'OnClearRequested', []); return []; },
    FastForward(self, frames) { self.dm.fire(self, 'OnFastForwardRequested', [Math.max(0, Math.floor(+frames || 0))]); return []; },
  },
  events: ['OnEmitRequested', 'OnClearRequested', 'OnFastForwardRequested'],
});
defineClass('SpotLight', 'Light', { props: { Range: ['number', 16], Angle: ['number', 90], Face: ['Enum.NormalId', 'Front'] } });
defineClass('SurfaceLight', 'Light', { props: { Range: ['number', 16], Angle: ['number', 90], Face: ['Enum.NormalId', 'Front'] } });
export const LIGHT_RANGE_MAX = 120;
// The camera (create.roblox.com/docs/reference/engine/classes/Camera). The engine
// writes CFrame and Focus each frame unless CameraType is Scriptable, when the
// script's CFrame is what's drawn (runtime/camera.js). FieldOfView is vertical, in
// degrees, clamped to [1, 120]. Projections are a pinhole from these properties:
// viewport pixels from the top-left, depth in studs along LookVector; the screen
// is the viewport less the GUI inset at the top (runtime/gui.js).
defineClass('Camera', 'Instance', {
  props: {
    CFrame: ['CFrame', null], Focus: ['CFrame', null], FieldOfView: ['number', 70], CameraType: ['Enum.CameraType', 'Custom'],
    CameraSubject: ['Instance', null], ViewportSize: ['Vector2', [1, 1]], NearPlaneZ: ['number', -0.1],
  },
  methods: {
    WorldToViewportPoint(self, p) { return cameraProject(self, p, 0); },
    WorldToScreenPoint(self, p) { return cameraProject(self, p, GUI_INSET_PX); },
    // The engine half of ViewportPointToRay / ScreenPointToRay (luau/lib_raycast.h builds the Ray).
    __studioPointToRay(self, x, y, depth, inset) {
      const P = self.props, cf = P.CFrame || new CF(), m = cf.m, W = P.ViewportSize.x, H = P.ViewportSize.y;
      const t = Math.tan(P.FieldOfView * Math.PI / 360), a = W / H;
      const cx = (2 * x / W - 1) * t * a, cy = (1 - 2 * (y + inset) / H) * t;
      // Camera space (looking down -Z) into the world: columns are right, up, back.
      const d = [0, 1, 2].map(k => m[3 + k * 3] * cx + m[4 + k * 3] * cy - m[5 + k * 3]), l = Math.hypot(...d), u = d.map(v => v / l);
      return [new V3(m[0] + u[0] * (depth || 0), m[1] + u[1] * (depth || 0), m[2] + u[2] * (depth || 0)), new V3(u[0], u[1], u[2])];
    },
  },
});
const GUI_INSET_PX = 58; // Roblox's top bar (runtime/gui.js GUI_INSET)
function cameraProject(cam, p, inset) {
  const P = cam.props, m = (P.CFrame || new CF()).m, W = P.ViewportSize.x, H = P.ViewportSize.y;
  const d = [p.x - m[0], p.y - m[1], p.z - m[2]];
  const col = k => [m[3 + k], m[6 + k], m[9 + k]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const x = dot(d, col(0)), y = dot(d, col(1)), depth = -dot(d, col(2));
  const t = Math.tan(P.FieldOfView * Math.PI / 360), a = W / H;
  const sx = (x / (depth * t * a) + 1) / 2 * W, sy = (1 - y / (depth * t)) / 2 * H;
  const on = depth > 0 && sx >= 0 && sx <= W && sy >= 0 && sy <= H;
  return [new V3(sx, sy - inset, depth), on];
}
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
// The player's own settings, outside the game tree: UserSettings():GetService("UserGameSettings").
// SavedQualityLevel is the graphics quality the player chose (Automatic or 1..10); scripts may read
// and set it (Roblox: no security on it), the in-game menu sets it, runtime/quality.js follows it.
defineClass('UserSettings', 'Instance', {
  creatable: false,
  methods: {
    GetService(self, name) {
      const have = self.children.find(c => c.ClassName === name);
      if (have) return [have];
      if (name !== 'UserGameSettings') throw new Error(`'${name}' is not a valid Service name`);
      const g = new Instance(self.dm, 'UserGameSettings'); self.dm.setParent(g, self); return [g];
    },
  },
});
defineClass('UserGameSettings', 'Instance', {
  creatable: false,
  props: { SavedQualityLevel: ['Enum.SavedQualitySetting', 'Automatic'] },
});

// Players and characters. Single-player for now: one Player joins after the
// place's scripts have run (so PlayerAdded handlers see it, as in Roblox).
defineClass('Players', 'Instance', {
  creatable: false, service: true,
  props: { LocalPlayer: ['Instance', null], RespawnTime: ['number', 5], CharacterAutoLoads: ['bool', true] },
  methods: {
    GetPlayers(self) { return [self.children.filter(c => c.ClassName === 'Player')]; },
    GetPlayerFromCharacter(self, m) { return [self.children.find(p => p.ClassName === 'Player' && m && p.props.Character === m) || null]; },
    CreateHumanoidModelFromDescriptionAsync(self, desc, rigType) { return [modelFromDescription(self.dm, desc, rigType)]; },
    CreateHumanoidModelFromDescription(self, desc, rigType) { return [modelFromDescription(self.dm, desc, rigType)]; }, // (deprecated in Roblox for the Async one)
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
    RigType: ['Enum.HumanoidRigType', 'R6'], // the character's rig (runtime/charbody.js): R6 or R15
    Health: ['number', 100], MaxHealth: ['number', 100], WalkSpeed: ['number', 16], JumpPower: ['number', 50],
    JumpHeight: ['number', 7.2], UseJumpPower: ['bool', true], AutoJumpEnabled: ['bool', true], MaxSlopeAngle: ['number', 89],
    HipHeight: ['number', 2], Jump: ['bool', false], MoveDirection: ['Vector3', [0, 0, 0]], FloorMaterial: ['Enum.Material', 'Air'],
    WalkToPoint: ['Vector3', [0, 0, 0]], WalkToPart: ['Instance', null],
  },
  methods: {
    TakeDamage(self, amount) { self.dm.set(self, 'Health', Math.max(0, self.props.Health - (+amount || 0))); return []; },
    // Deprecated in Roblox but still common: loads through the Humanoid's Animator (made if missing).
    LoadAnimation(self, anim) { return [self.dm.loadAnimation(self.dm.animatorOf(self), anim)]; },
    // Bodies (see HumanoidDescription below): yields while the body is rebuilt (dm.hooks.applyDescription,
    // runtime: a generated body takes the description's shape, scales and colours; other bodies keep
    // theirs, OURS), then fires ApplyDescriptionFinished. GetAppliedDescription: a copy of the last applied.
    // Walking (mashup-research/ROBLOX_HUMANOID_MOVETO_2026-11-24.md): MoveTo sets WalkToPoint and WalkToPart and
    // starts the walk (with a part, the point is kept in the part's space, so it moves with it); Move walks
    // in a direction until called again. The character's driver (runtime/walk.js) turns them into input.
    MoveTo(self, location, part) {
      const p = part instanceof Instance && isA(part.ClassName, 'BasePart') ? part : null, loc = location instanceof V3 ? location : new V3(0, 0, 0);
      const point = p ? (c => new V3(c.x, c.y, c.z))(p.props.CFrame.inverse().mul(new CF([loc.x, loc.y, loc.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]))) : loc;
      if (self.walk && self.walk.kind === 'to') self.walk = null; // (a new goal: the old one just stops, its timer with it)
      self.dm.set(self, 'WalkToPart', p); self.dm.set(self, 'WalkToPoint', point);
      self.walk = { kind: 'to', point: self.props.WalkToPoint, part: p, since: null };
      return [];
    },
    Move(self, direction, relativeToCamera) {
      const d = direction instanceof V3 ? direction : new V3(0, 0, 0), w = self.walk;
      if (w && w.kind === 'dir' && w.dir.x === d.x && w.dir.y === d.y && w.dir.z === d.z && w.rel === !!relativeToCamera) return [];
      if (w && w.kind === 'to') endWalk(self, false); // a new direction ends a MoveTo
      self.walk = { kind: 'dir', dir: d, rel: !!relativeToCamera };
      return [];
    },
    ApplyDescriptionAsync(self, desc) { return applyDescription(self, desc); },
    ApplyDescription(self, desc) { return applyDescription(self, desc); }, // (deprecated in Roblox for ApplyDescriptionAsync)
    GetAppliedDescription(self) { const d = self.children.find(c => c.ClassName === 'HumanoidDescription'); return [(d && self.dm.clone(d)) || new Instance(self.dm, 'HumanoidDescription')]; },
  },
  events: ['Died', 'HealthChanged', 'Jumping', 'Running', 'FreeFalling', 'Touched', 'ApplyDescriptionFinished', 'MoveToFinished'],
});
/** A humanoid's MoveTo ends: reached, or not (the 8 s timer, a new goal or direction, a teleport). */
export function endWalk(hum, reached) {
  if (!hum.walk || hum.walk.kind !== 'to') return;
  hum.walk = null;
  hum.dm.fire(hum, 'MoveToFinished', [!!reached]);
}
function applyDescription(self, desc) {
  if (!(desc instanceof Instance) || desc.ClassName !== 'HumanoidDescription') throw new Error('Argument 1 missing or nil'); // UNSURE: Roblox's wording
  const copy = self.dm.clone(desc), hook = self.dm.hooks.applyDescription;
  return self.dm.async(self, Promise.resolve(hook ? hook(self, copy) : null).then(() => {
    keepDescription(self, copy);
    self.dm.fire(self, 'ApplyDescriptionFinished', [self.dm.clone(copy)]);
    return [];
  }));
}
/** The description a Humanoid wears is its HumanoidDescription child, as Roblox keeps it (an NPC rig draws
 *  from it: runtime/rigs.js); the one before goes. */
export function keepDescription(hum, d) {
  for (const c of hum.children.slice()) if (c.ClassName === 'HumanoidDescription' && c !== d) hum.dm.destroy(c);
  hum.dm.setParent(d, hum);
}
// Players:CreateHumanoidModelFromDescriptionAsync: a rig of the described body (runtime/bodygen.js): a
// Model with a Humanoid (its Animator, the description) and a HumanoidRootPart of the body's size, its
// centre the body's root height above the origin, unanchored, so in the Workspace it is a character
// (runtime/npcs.js: its R15 parts and Motor6Ds come with its body there). OURS: the limb parts aren't made
// here, before it is placed.
function modelFromDescription(dm, desc, rigType) {
  if (!(desc instanceof Instance) || desc.ClassName !== 'HumanoidDescription') throw new Error('Argument 1 missing or nil'); // UNSURE: Roblox's wording
  const sh = desc.children.find(c => c.ClassName === 'BodyShape'), body = makeBody(describedBody(desc.props, sh && sh.props));
  const m = new Instance(dm, 'Model'), hum = new Instance(dm, 'Humanoid'), root = new Instance(dm, 'Part');
  hum.props.RigType = rigType instanceof EnumItem ? rigType.name : rigType === 'R6' || rigType === 0 ? 'R6' : 'R15';
  dm.setParent(new Instance(dm, 'Animator'), hum);
  keepDescription(hum, dm.clone(desc));
  Object.assign(root.props, { Name: 'HumanoidRootPart', Size: new V3(...body.parts.HumanoidRootPart.size), Transparency: 1, Anchored: false, CanCollide: false });
  dm.set(root, 'CFrame', new CF([0, body.hrpHeight, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  dm.setParent(hum, m); dm.setParent(root, m);
  m.props.PrimaryPart = root;
  return m;
}
// IKControl (Roblox): a procedural pose from inverse kinematics, a child of a Humanoid (mashup-research/
// ROBLOX_IKCONTROL_2026-11-24.md); solved by runtime/ik.js on the player's character. Defaults from the
// API dump. The methods read the last solve (`ik`, the solver's state on the instance).
const ikNode = (self, i, world) => {
  const ch = self.ik && self.ik.chain, nodes = self.ik && self.ik.nodes;
  if (!ch || !nodes || !(i >= 1 && i <= nodes.length)) return new CF();
  const k = Math.floor(i) - 1;
  if (world || k === 0) return world ? nodes[k] : ch.joints[0].part0.props.CFrame.inverse().mul(nodes[0]);
  return nodes[k - 1].inverse().mul(nodes[k]);
};
defineClass('IKControl', 'Instance', {
  props: {
    Type: ['Enum.IKControlType', 'Transform'], ChainRoot: ['Instance', null], EndEffector: ['Instance', null], Target: ['Instance', null], Pole: ['Instance', null],
    Offset: ['CFrame'], EndEffectorOffset: ['CFrame'], Weight: ['number', 1], SmoothTime: ['number', 0.05], Priority: ['number', 0], Enabled: ['bool', true],
  },
  methods: {
    GetChainCount(self) { const ch = self.ik && self.ik.chain; return [ch ? ch.parts.length - 1 : 0]; },
    GetChainLength(self) {
      const ch = self.ik && self.ik.chain; if (!ch) return [0];
      let L = 0; for (let k = 1; k < ch.parts.length; k++) { const a = ch.parts[k - 1].props.CFrame, b = ch.parts[k].props.CFrame; L += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
      return [L];
    },
    GetNodeWorldCFrame(self, i) { return [ikNode(self, i, true)]; },
    GetNodeLocalCFrame(self, i) { return [ikNode(self, i, false)]; },
    GetRawFinalTarget(self) { return [(self.ik && self.ik.raw) || new CF()]; },
    GetSmoothedFinalTarget(self) { return [(self.ik && self.ik.goal) || new CF()]; },
  },
});
// PathfindingService (mashup-research/ROBLOX_PATHFINDING_2026-11-25.md): Paths from CreatePath's agent parameters,
// computed by web/pathfinding.js (yielding, as Roblox's ComputeAsync does). GetWaypoints is Luau's (PathWaypoint is a
// Luau datatype: luau/lib_raycast.h) over __studioWaypoints. Blocked/Unblocked: runtime checks (checkPaths, play.js).
function agentFrom(params) {
  const a = { ...AGENT, Costs: {} };
  if (params instanceof LuaTable) for (const [k, v] of params.entries) {
    if (k === 'Costs' && v instanceof LuaTable) { for (const [m, c] of v.entries) if (typeof m === 'string' && typeof c === 'number') a.Costs[m] = c; }
    else if (k in AGENT && k !== 'Costs' && typeof v === typeof AGENT[k]) a[k] = v;
  }
  return a;
}
function newPath(dm, agent) { const p = new Instance(dm, 'Path'); p.agent = agent; p.waypoints = []; (dm.paths || (dm.paths = new Set())).add(p); return p; }
function computeInto(path, start, finish) {
  if (!(start instanceof V3)) throw new Error('Unable to cast ' + typeName(start) + ' to Vector3');
  if (!(finish instanceof V3)) throw new Error('Unable to cast ' + typeName(finish) + ' to Vector3');
  const dm = path.dm, r = computePath(new NavWorld(collectObstacles(dm, isA), path.agent), start, finish);
  path.waypoints = r.waypoints; path.blocked = false;
  dm.set(path, 'Status', r.status);
}
const typeName = v => v === null || v === undefined ? 'nil' : v instanceof V3 ? 'Vector3' : typeof v;
defineClass('PathfindingService', 'Instance', {
  creatable: false, service: true,
  methods: {
    CreatePath(self, params) { return [newPath(self.dm, agentFrom(params))]; },
    FindPathAsync(self, start, finish) { const p = newPath(self.dm, { ...AGENT }); computeInto(p, start, finish); return self.dm.defer(self, [p]); },
  },
});
defineClass('Path', 'Instance', {
  creatable: false,
  props: { Status: ['Enum.PathStatus', 'NoPath'] }, // (OURS: before ComputeAsync)
  methods: {
    ComputeAsync(self, start, finish) { computeInto(self, start, finish); return self.dm.defer(self, []); }, // (computed at once; yields a frame, as Roblox's does)
    // GetWaypoints' engine half: position, action name, label, for each waypoint in turn.
    __studioWaypoints(self) { return [self.waypoints.flatMap(w => [new V3(...w.pos), w.action, w.label])]; },
    CheckOcclusionAsync(self, start) {
      const n = self.waypoints.length;
      if (typeof start !== 'number' || start < 0 || start > n) throw new Error('Start index out of range');
      return self.dm.defer(self, [occlusion(new NavWorld(collectObstacles(self.dm, isA), self.agent), self.waypoints, Math.max(1, Math.floor(start)))]);
    },
  },
  events: ['Blocked', 'Unblocked'],
});
/** Each frame: computed paths that scripts listen to are checked twice a second; Blocked(index) when one becomes
 *  blocked, Unblocked(index) when it clears (OURS: the interval). */
export function checkPaths(dm, t) {
  if (!dm.paths || !dm.paths.size || (dm.pathsAt !== undefined && t - dm.pathsAt < 0.5)) return;
  dm.pathsAt = t;
  let nav = null;
  for (const p of dm.paths) {
    if (p.destroyed) { dm.paths.delete(p); continue; }
    const conns = dm.connsOf.get(p), listened = conns && ((conns.get('Blocked') || new Set()).size || (conns.get('Unblocked') || new Set()).size);
    if (!listened || p.props.Status !== 'Success' || p.waypoints.length < 2) continue;
    const i = occlusion(nav || (nav = new NavWorld(collectObstacles(dm, isA), p.agent)), p.waypoints, 1);
    if (i > 0 && p.blocked !== i) { p.blocked = i; dm.fire(p, 'Blocked', [i]); }
    else if (i < 0 && p.blocked) { const was = p.blocked; p.blocked = false; dm.fire(p, 'Unblocked', [was]); }
  }
}
// Keyframe animation (create.roblox.com/docs/animation): the data, Animator and
// AnimationTrack. The sampling and blending are in animation.js; the renderer
// applies the result to rigs (runtime/rigs.js, runtime/character.js).
defineClass('AnimationClip', 'Instance', { creatable: false, props: { Loop: ['bool', true], Priority: ['Enum.AnimationPriority', 'Action'] } }); // UNSURE: defaults as remembered
defineClass('KeyframeSequence', 'AnimationClip', {
  methods: {
    AddKeyframe(self, kf) { if (kf instanceof Instance) self.dm.setParent(kf, self); return []; },
    RemoveKeyframe(self, kf) { if (kf instanceof Instance && kf.parent === self) self.dm.setParent(kf, null); return []; },
    GetKeyframes(self) { return [self.children.filter(c => c.ClassName === 'Keyframe')]; },
  },
});
defineClass('Keyframe', 'Instance', {
  props: { Time: ['number', 0] },
  methods: {
    AddPose(self, p) { if (p instanceof Instance) self.dm.setParent(p, self); return []; },
    RemovePose(self, p) { if (p instanceof Instance && p.parent === self) self.dm.setParent(p, null); return []; },
    GetPoses(self) { return [self.children.filter(c => c.ClassName === 'Pose')]; },
    AddMarker(self, m) { if (m instanceof Instance) self.dm.setParent(m, self); return []; },
    RemoveMarker(self, m) { if (m instanceof Instance && m.parent === self) self.dm.setParent(m, null); return []; },
    GetMarkers(self) { return [self.children.filter(c => c.ClassName === 'KeyframeMarker')]; },
  },
});
defineClass('KeyframeMarker', 'Instance', { props: { Value: ['string', ''] } });
defineClass('PoseBase', 'Instance', { creatable: false, props: { EasingStyle: ['Enum.PoseEasingStyle', 'Linear'], EasingDirection: ['Enum.PoseEasingDirection', 'In'], Weight: ['number', 1] } });
defineClass('Pose', 'PoseBase', {
  props: { CFrame: ['CFrame', null] },
  methods: {
    AddSubPose(self, p) { if (p instanceof Instance) self.dm.setParent(p, self); return []; },
    RemoveSubPose(self, p) { if (p instanceof Instance && p.parent === self) self.dm.setParent(p, null); return []; },
    GetSubPoses(self) { return [self.children.filter(c => c.ClassName === 'Pose')]; },
  },
});
defineClass('Animation', 'Instance', { props: { AnimationId: ['string', ''] } });
// Roblox registers a sequence as a temporary id (for testing in Studio); here
// that is the way to play one, as is "studio://" plus its full name
// ("studio://ServerStorage.RBX_ANIMSAVES.Rig.Wave"). UNSURE: the id's form.
defineClass('KeyframeSequenceProvider', 'Instance', {
  creatable: false, service: true,
  methods: {
    RegisterKeyframeSequence(self, ks) { return [self.dm.registerSequence(ks)]; },
    RegisterActiveKeyframeSequence(self, ks) { return [self.dm.registerSequence(ks)]; },
  },
});
defineClass('Animator', 'Instance', {
  methods: {
    LoadAnimation(self, anim) { return [self.dm.loadAnimation(self, anim)]; },
    GetPlayingAnimationTracks(self) { return [(self.tracks || []).filter(t => t.playing)]; },
    StepAnimations(self, dt) { self.dm.stepAnimator(self, +dt || 0); return []; },
  },
  events: ['AnimationPlayed'],
});
defineClass('AnimationTrack', 'Instance', {
  creatable: false,
  props: {
    Animation: ['Instance', null], IsPlaying: ['bool', false], Length: ['number', 0], Looped: ['bool', false], Priority: ['Enum.AnimationPriority', 'Action'],
    Speed: ['number', 1], TimePosition: ['number', 0], WeightCurrent: ['number', 0], WeightTarget: ['number', 0],
  },
  methods: {
    Play(self, fade = 0.1, weight = 1, speed = 1) { self.dm.playTrack(self, fade ?? 0.1, weight ?? 1, speed ?? 1); return []; },
    Stop(self, fade = 0.1) { self.dm.stopTrack(self, fade ?? 0.1); return []; },
    AdjustSpeed(self, speed = 1) { self.props.Speed = +(speed ?? 1); return []; },
    AdjustWeight(self, weight = 1, fade = 0.1) { self.fadeFrom = self.weight; self.target = Math.max(0, +(weight ?? 1)); self.fade = Math.max(0, +(fade ?? 0.1)); self.props.WeightTarget = self.target; return []; },
    GetTimeOfKeyframe(self, name) { const k = self.seq && self.seq.names.find(n => n.name === name); if (!k) throw new Error(`Could not find a keyframe by that name!`); return [k.t]; },
  },
  events: ['DidLoop', 'Ended', 'KeyframeReached', 'Stopped'],
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
      for (const [k, [ty, d]] of Object.entries(c.props)) if (!(k in this.props)) this.props[k] = ty === 'Vector3' ? new V3(...d) : ty === 'Color3' ? new C3(...d) : ty === 'CFrame' ? new CF() : ty === 'UDim2' ? new UDim2(...(d || [])) : ty === 'UDim' ? new UDim(...(d || [])) : ty === 'Vector2' ? new V2(...(d || [])) : ty === 'NumberRange' ? new NumberRange(...String(d).trim().split(/\s+/).map(Number)) : ty === 'NumberSequence' ? NumberSequence.parse(d) : ty === 'ColorSequence' ? ColorSequence.parse(d) : ty === 'Font' ? new Font(...d) : d;
    }
    for (let c = CLASSES[cls], seen = new Set(); c; c = CLASSES[c.base]) for (const [k, v] of Object.entries(c.defaults)) if (!seen.has(k)) { seen.add(k); this.props[k] = v; }
    this.props.Name = cls;
    if (isA(cls, 'BasePart')) defineBrickColor(this.props);
    if (cls === 'Terrain') this.voxels = new Voxels();
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
    this.eventHooks = []; // (inst, event, args) -> void: engine code that answers an event (particles' Emit)
    this.tweens = new Set(); // playing (or delayed or paused) tweens
    this.animators = new Set(); // Animators with loaded tracks
    this.sequences = new Map(); // registered KeyframeSequences: id -> sequence
    this.nextSequence = 1;
    this.hooks = {};    // runtime callbacks the API needs (e.g. Player:LoadCharacter)
    this.game = new Instance(this, 'DataModel');
    this.game.props.Name = 'Game';
    this.services = {};
    this.workspace = this.service('Workspace');
    this.assemblies = new Assemblies(this, isA); // rigid joints (web/assembly.js)
    this.service('Lighting');
    // workspace.CurrentCamera, as Roblox gives every place one.
    const cam = this.create('Camera');
    cam.props.Name = 'Camera'; cam.props.CFrame = new CF([0, 20, 20, 1, 0, 0, 0, 0.7071068, 0.7071068, 0, -0.7071068, 0.7071068]); cam.props.Focus = new CF();
    this.setParent(cam, this.workspace);
    this.workspace.props.CurrentCamera = cam;
    // workspace.Terrain, as every Roblox place has.
    const terrain = new Instance(this, 'Terrain');
    terrain.props.Anchored = true; terrain.props.Locked = true;
    this.setParent(terrain, this.workspace);
  }
  register(inst) { this.byHandle.push(inst); return this.byHandle.length - 1; }
  /** The player's settings (UserSettings()): one per DataModel, outside the game tree. */
  userSettings() { return this._userSettings || (this._userSettings = new Instance(this, 'UserSettings')); }
  /** UserGameSettings, made if needed. */
  userGameSettings() { const u = this.userSettings(); return methodOf('UserSettings', 'GetService')(u, 'UserGameSettings')[0]; }

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
  // A yield whose values are ready now: the script resumes with them on the next frame (flushDeferred, called by
  // the frame before scripts resume), the same in a live page and in a test's run of frames (a Promise would
  // wait for the test's whole run to end).
  defer(inst, vals) {
    const ev = '__async' + (this.nextAsync = (this.nextAsync || 0) + 1);
    (this.deferred || (this.deferred = [])).push([inst, ev, vals]);
    return new Yield(inst, ev);
  }
  flushDeferred() {
    const d = this.deferred; if (!d || !d.length) return;
    this.deferred = [];
    for (const [inst, ev, vals] of d) this.fire(inst, ev, vals);
  }
  create(cls) { return CLASSES[cls] && CLASSES[cls].creatable ? new Instance(this, cls) : null; }

  fire(inst, ev, args) {
    if (ev === 'Changed' && args && typeof args[0] === 'string') this.fire(inst, 'Changed:' + args[0], []); // GetPropertyChangedSignal's
    for (const h of this.eventHooks) h(inst, ev, args);
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
    if (inst.ClassName === 'Attachment') this.attachmentWorld(inst);
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
    // A part's BrickColor sets its Color; naming the BrickColor its Color is already nearest changes
    // nothing, so a custom Color survives props copied one by one (scripts always set: host.newindex).
    if (key === 'BrickColor' && 'Color' in inst.props) { if (!(value instanceof BrickColor) || value === inst.props.BrickColor) return; key = 'Color'; value = value.color; }
    if (inst.ClassName === 'Attachment' && (key === 'WorldCFrame' || key === 'WorldPosition' || key === 'WorldOrientation')) {
      // A world placement becomes the local one under the part.
      const w = this.attachmentWorld(inst).WorldCFrame;
      const world = key === 'WorldCFrame' ? value : key === 'WorldPosition' ? w.withPosition(value.x, value.y, value.z) : CF.fromOrientation(w.x, w.y, w.z, value.x, value.y, value.z);
      return this.place(inst, 'CFrame', this.attachmentParentCF(inst).inverse().mul(world));
    }
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
    // A text object's Font and FontFace follow each other (TextLabel.FontFace's docs): FontFace takes the
    // Font's family, weight and style (Font.fromEnum); Font becomes the item that FontFace matches, or
    // Unknown. Setting Font to Unknown changes nothing (OURS: it names no font). Each changed one fires its
    // Changed, FontFace first (OURS: the order).
    if ((key === 'Font' || key === 'FontFace') && 'FontFace' in inst.props && 'Font' in inst.props) {
      const face = key === 'Font' ? fontFromEnum(value) : value, item = key === 'Font' ? value : enumFromFont(value);
      if (!face) return;
      const changed = [];
      if (!sameValue(inst.props.FontFace, face)) { inst.props.FontFace = face; changed.push('FontFace'); }
      if (inst.props.Font !== item) { inst.props.Font = item; changed.push('Font'); }
      for (const k of changed) this.notify(inst, k);
      for (const k of changed) this.fire(inst, 'Changed', [k]);
      return;
    }
    if (inst.ClassName === 'Camera' && key === 'FieldOfView') value = Math.min(Math.max(+value || 0, 1), 120);
    if (isA(inst.ClassName, 'Light')) {
      if (key === 'Range') value = Math.min(Math.max(+value || 0, 0), LIGHT_RANGE_MAX);
      if (key === 'Angle') value = Math.min(Math.max(+value || 0, 0), 180);
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
    // Position and Orientation follow the CFrame on classes that have them (a part, an Attachment),
    // not on ones that don't (a Camera has only CFrame, as in Roblox).
    const next = { CFrame: cf };
    if (lookup(inst.ClassName, 'props', 'Position')) next.Position = new V3(cf.x, cf.y, cf.z);
    if (lookup(inst.ClassName, 'props', 'Orientation')) { const [ox, oy, oz] = cf.toOrientation(); next.Orientation = new V3(Math.fround(ox), Math.fround(oy), Math.fround(oz)); }
    const changed = Object.keys(next).filter(k => !sameValue(P[k], next[k]));
    if (!changed.length) return;
    const part = isA(inst.ClassName, 'BasePart');
    if (part && key === 'CFrame') this.assemblies.moveWith(inst, cf); // its assembly moves with it
    Object.assign(P, next);
    if (inst.ClassName === 'Attachment') { const R = cf.m; Object.assign(P, { Axis: new V3(R[3], R[6], R[9]), SecondaryAxis: new V3(R[4], R[7], R[10]) }); this.attachmentWorld(inst); }
    else for (const c of inst.children) if (c.ClassName === 'Attachment') this.attachmentWorld(c);
    this.notify(inst, 'CFrame');
    if (part && key !== 'CFrame') this.assemblies.reweld(inst); // Position, Orientation: it moves alone; its WeldConstraints re-take their offsets
    for (const k of changed) this.fire(inst, 'Changed', [k]);
  }
  // An attachment's frame in the world: its part's CFrame times its own (refreshed on every read).
  attachmentParentCF(a) { const p = a.parent; return p && isA(p.ClassName, 'BasePart') && p.props.CFrame ? p.props.CFrame : new CF(); }
  attachmentWorld(a) {
    const P = a.props, w = this.attachmentParentCF(a).mul(P.CFrame), [ox, oy, oz] = w.toOrientation(), R = w.m;
    return Object.assign(P, {
      WorldCFrame: w, WorldPosition: new V3(w.x, w.y, w.z), WorldOrientation: new V3(Math.fround(ox), Math.fround(oy), Math.fround(oz)),
      WorldAxis: new V3(R[3], R[6], R[9]), WorldSecondaryAxis: new V3(R[4], R[7], R[10]),
    });
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
  // ---- animation (Animator, AnimationTrack; the maths is in animation.js)
  registerSequence(ks) {
    if (!(ks instanceof Instance) || ks.ClassName !== 'KeyframeSequence') throw new Error('Unable to cast value to KeyframeSequence');
    const id = 'rbxtemp://' + this.nextSequence++;
    this.sequences.set(id, ks);
    return id;
  }
  // The KeyframeSequence an AnimationId names (registered, or studio:// and a full name), or null.
  sequenceOf(id) {
    if (this.sequences.has(id)) return this.sequences.get(id);
    const m = /^studio:\/\/(.+)$/.exec(id || '');
    if (!m) return null;
    let at = this.game;
    for (const name of m[1].split('.')) at = at && (at === this.game && CLASSES[name] && CLASSES[name].service ? this.service(name) : at.children.find(c => c.props.Name === name));
    return at && at.ClassName === 'KeyframeSequence' ? at : null;
  }
  animatorOf(hum) {
    let a = hum.children.find(c => c.ClassName === 'Animator');
    if (!a) { a = new Instance(this, 'Animator'); this.setParent(a, hum); }
    return a;
  }
  loadAnimation(animator, anim) {
    if (!(anim instanceof Instance) || anim.ClassName !== 'Animation') throw new Error('Unable to cast value to Object');
    const ks = this.sequenceOf(anim.props.AnimationId);
    if (!ks) console.warn(`Failed to load animation with sanitized ID ${anim.props.AnimationId}`);
    const tr = new Instance(this, 'AnimationTrack');
    tr.props.Name = anim.props.Name;
    tr.props.Animation = anim;
    tr.seq = ks ? compileSequence(ks) : null;
    tr.props.Length = tr.seq ? tr.seq.length : 0;
    tr.props.Looped = tr.seq ? !!tr.seq.loop : false;
    tr.props.Priority = tr.seq ? tr.seq.priority : 'Action';
    tr.animator = animator; tr.time = 0; tr.weight = 0; tr.target = 0; tr.fade = 0; tr.fadeFrom = 0; tr.playing = false;
    return tr;
  }
  playTrack(tr, fade, weight, speed) {
    const a = tr.animator;
    if (!a || a.destroyed) return;
    a.tracks = a.tracks || [];
    if (!a.tracks.includes(tr)) a.tracks.push(tr);
    this.animators.add(a);
    if (!tr.playing) { tr.time = 0; tr.ended = false; }
    tr.playing = true;
    tr.fadeFrom = tr.weight; tr.target = Math.max(0, +weight); tr.fade = Math.max(0, +fade);
    if (tr.fade === 0) tr.weight = tr.target;
    tr.props.Speed = +speed; tr.props.IsPlaying = true; tr.props.WeightTarget = tr.target; tr.props.TimePosition = tr.time; tr.lastTime = tr.time;
    this.fire(a, 'AnimationPlayed', [tr]);
  }
  stopTrack(tr, fade) { stopTrack(tr, +fade, this.trackOps()); }
  trackOps() { return { fire: (i, e, a) => this.fire(i, e, a), set: (i, k, v) => { i.props[k] = v; if (k === 'TimePosition') i.lastTime = v; } }; }
  stepAnimator(a, dt) {
    for (const tr of a.tracks || []) if (tr.props.TimePosition !== tr.lastTime) tr.time = tr.props.TimePosition; // a script seeked
    stepTracks(a, dt, this.trackOps());
  }
  stepAnimations(dt) {
    for (const a of [...this.animators]) {
      if (a.destroyed || !(a.tracks && a.tracks.length)) { this.animators.delete(a); continue; }
      this.stepAnimator(a, dt);
    }
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
  // TextBox focus (one at a time). ClearTextOnFocus empties Text before Focused fires (OURS: the order).
  // Watchers hear (box, 'Focus'); the GUI shows the box's text field and gives it the keyboard.
  focusTextBox(tb) {
    if (this.focusedTextBox === tb || tb.destroyed) return;
    if (this.focusedTextBox) this.releaseTextBox(this.focusedTextBox, false);
    this.focusedTextBox = tb;
    if (tb.props.ClearTextOnFocus) this.set(tb, 'Text', '');
    this.notify(tb, 'Focus');
    this.fire(tb, 'Focused', []);
  }
  releaseTextBox(tb, enterPressed) {
    if (this.focusedTextBox !== tb) return;
    this.focusedTextBox = null;
    this.notify(tb, 'Focus');
    this.fire(tb, 'FocusLost', [!!enterPressed, null]);
  }
  watch(fn) { this.watchers.push(fn); }
  onEvent(fn) { this.eventHooks.push(fn); }

  // WorldRoot:Raycast's engine half (web/raycast.js): the nearest queryable part the ray
  // enters. Rays longer than 15000 studs are cut there (UNSURE: Roblox's documented cap).
  raycast(origin, direction, { filter = [], include = false, respectCanCollide = false } = {}) {
    const len = Math.min(Math.hypot(direction.x, direction.y, direction.z), 15000);
    if (!(len > 0)) return [];
    const dir = [direction.x / Math.hypot(direction.x, direction.y, direction.z), direction.y / Math.hypot(direction.x, direction.y, direction.z), direction.z / Math.hypot(direction.x, direction.y, direction.z)];
    const listed = new Set(filter.filter(i => i instanceof Instance));
    const inList = inst => { for (let a = inst; a; a = a.parent) if (listed.has(a)) return true; return false; };
    const cands = [];
    const walk = inst => {
      for (const c of inst.children) {
        if (isA(c.ClassName, 'BasePart') && c.ClassName !== 'Terrain' && c.props.CFrame && c.props.CanQuery !== false && !(respectCanCollide && !c.props.CanCollide) && inList(c) === include) {
          const shape = c.ClassName === 'WedgePart' ? 'Wedge' : isA(c.ClassName, 'TriangleMeshPart') ? 'Mesh' : (c.props.Shape || 'Block');
          cands.push({ inst: c, cf: c.props.CFrame, size: c.props.Size, shape, mesh: shape === 'Mesh' });
        }
        walk(c);
      }
    };
    walk(this.workspace);
    const hit = castRay([origin.x, origin.y, origin.z], dir, len, cands, this.hooks.meshRaycast);
    if (!hit) return [];
    const p = [0, 1, 2].map(k => [origin.x, origin.y, origin.z][k] + dir[k] * hit.t);
    return [hit.inst, new V3(...p), new V3(...hit.normal), enumItem('Material', hit.inst.props.Material || 'Plastic'), hit.t];
  }
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
  if (a instanceof Font) return a.equals(b);
  if (a instanceof NumberRange && b instanceof NumberRange) return a.min === b.min && a.max === b.max;
  if ((a instanceof NumberSequence && b instanceof NumberSequence) || (a instanceof ColorSequence && b instanceof ColorSequence)) return a.toString() === b.toString();
  return false;
}
function isDescendant(a, b) { for (let p = a.parent; p; p = p.parent) if (p === b) return true; return false; }

// Properties scripts may read but not write (the engine sets them), as in Roblox.
// Members that are Claude Studio's own, not Roblox's, with their one-line docs: the editor says so
// where it describes them (Roblox's own members get theirs from web/editor/apidocs.json).
export const STUDIO_OWN = new Map([
  ['ParticleEmitter.CastLight', 'Whether the particles light their surroundings, in their average colour, from their centre.'],
  ['ParticleEmitter.LightRange', 'How far, in studs, the light from CastLight reaches.'],
  ['ParticleEmitter.Collision', 'What particles do when they hit a collidable part: pass through, bounce, stick or die.'],
  ['ParticleEmitter.Bounciness', 'The share of a particle\'s speed kept when it bounces off a part (Collision Bounce), 0 to 1.'],
  ['PartOperation.PartColors', 'The colour of each part a solid-modelling operation was made from, shown on its faces unless UsePartColor is set.'],
  ['Enum.ParticleCollision','What a ParticleEmitter\'s particles do when they hit a part (its Collision property).'],
  ['ToonEffect', 'Cel shading for the whole scene: direct light falls into a few flat bands.'],
  ['ToonEffect.Bands', 'How many steps of light a lit surface shows (2 to 8).'],
  ['ToonEffect.Softness', 'How soft the step between two bands is, as a share of a band (0 hard, 0.5 smooth).'],
  ['OutlineEffect', 'Ink lines on the whole scene: around silhouettes and along creases.'],
  ['OutlineEffect.Color', 'The colour of the lines.'],
  ['OutlineEffect.Transparency', 'How see-through the lines are (0 solid, 1 invisible).'],
  ['OutlineEffect.Thickness', 'The width of the lines in pixels (1 to 4).'],
  ['OutlineEffect.DepthSensitivity', 'How small a jump in distance draws a line (0 only big gaps, 1 every step).'],
  ['OutlineEffect.NormalSensitivity', 'How shallow a crease draws a line (0 only sharp corners, 1 gentle bends).'],
  ['PixelEffect', 'A low-resolution, pixel-art look for the whole screen.'],
  ['PixelEffect.PixelSize', 'How many screen pixels make one big pixel (1 to 16).'],
  ['PixelEffect.Colors', 'Levels per colour channel (2 to 32) for a limited palette; 0 keeps every colour.'],
  ['PixelEffect.Dither', 'Whether a limited palette is dithered (an ordered pattern) instead of banded.'],
  ['BodyShape', 'The shape of a generated R15 body, in studs: under a HumanoidDescription, the body its scales and colours apply to.'],
  ['BodyShape.LegLength', 'Hip to sole, in studs.'],
  ['BodyShape.TorsoLength', 'Both torso parts together, in studs.'],
  ['BodyShape.LowerTorsoShare', 'The lower torso\'s share of the torso\'s length (0 to 1).'],
  ['BodyShape.ShoulderWidth', 'Across the shoulders, in studs.'],
  ['BodyShape.HipWidth', 'Across the hips, in studs.'],
  ['BodyShape.TorsoDepth', 'The torso from front to back, in studs.'],
  ['BodyShape.ArmLength', 'Shoulder to wrist, in studs.'],
  ['BodyShape.ForearmShare', 'The forearm\'s share of the arm\'s length (0 to 1).'],
  ['BodyShape.HandLength', 'Wrist to fingertips, in studs.'],
  ['BodyShape.FootLength', 'Heel to toe, in studs.'],
  ['BodyShape.ArmThickness', 'How thick the arms are, in studs.'],
  ['BodyShape.LegThickness', 'How thick the legs are, in studs.'],
  ['BodyShape.HeadHeight', 'The head from chin to top, in studs.'],
  ['BodyShape.HeadWidth', 'The head from side to side, in studs.'],
  ['BodyShape.HeadDepth', 'The head from front to back, in studs.'],
  ['BodyShape.NeckGap', 'The space between the torso\'s top and the head, in studs.'],
  ['BodyShape.Roundness', 'How rounded the limbs and torso are (0 boxes, 1 fully rounded).'],
  ['BodyShape.HeadRoundness', 'How rounded the head is (0 a box, 1 fully rounded).'],
  ['BodyShape.Taper', 'How much the limbs narrow towards their lower ends (0 none, 0.4 strong).'],
  ['BodyShape.Chest', 'How much wider the upper torso is at the shoulders than at the waist (0 none).'],
  ['BodyShape.Face', 'The face on the head: 0 none, 1 our eyes and smile.'],
]);
const ASSEMBLY_READS = new Set(['CFrame', 'Position', 'Orientation', 'AssemblyRootPart', 'AssemblyMass', 'Active', 'ChildName']);
// A part's mass, as World's bodies have it (runtime/world.js): density x the shape's own volume.
export function partMass(p) {
  const P = p.props, S = P.Size, density = (PHYSICAL[P.Material] || PHYSICAL.Plastic)[0], wedge = p.ClassName === 'WedgePart' || P.Shape === 'Wedge';
  const volume = P.Shape === 'Ball' ? Math.PI / 6 * Math.min(S.x, S.y, S.z) ** 3 : P.Shape === 'Cylinder' ? Math.PI / 4 * Math.min(S.y, S.z) ** 2 * S.x : wedge ? S.x * S.y * S.z / 2 : S.x * S.y * S.z;
  return density * volume;
}
const READ_ONLY = new Set(['BasePart.AssemblyRootPart', 'BasePart.AssemblyMass', 'JointInstance.Active', 'WeldConstraint.Active', 'Constraint.Active', 'HingeConstraint.CurrentAngle', 'CylindricalConstraint.CurrentAngle', 'RopeConstraint.CurrentDistance', 'RodConstraint.CurrentDistance', 'SpringConstraint.CurrentLength', 'SlidingBallConstraint.CurrentPosition', 'Motor6D.ChildName', 'Attachment.Axis', 'Attachment.SecondaryAxis', 'Attachment.WorldAxis', 'Attachment.WorldSecondaryAxis', // (OURS: Roblox lets scripts set the axes; here they follow CFrame)
'TriangleMeshPart.MeshSize', 'PartOperation.TriangleCount', 'Path.Status', 'BillboardGui.CurrentDistance', 'GuiBase2d.AbsolutePosition', 'GuiBase2d.AbsoluteSize', 'GuiBase2d.AbsoluteRotation', 'ScrollingFrame.AbsoluteCanvasSize', 'ScrollingFrame.AbsoluteWindowSize', 'UIGridStyleLayout.AbsoluteContentSize', 'UIGridLayout.AbsoluteCellCount', 'UIGridLayout.AbsoluteCellSize', 'TweenBase.PlaybackState', 'Tween.Instance', 'Tween.TweenInfo', 'Humanoid.MoveDirection', 'Humanoid.FloorMaterial', 'Players.LocalPlayer', 'Player.UserId', 'Instance.ClassName', 'Camera.ViewportSize', 'Camera.NearPlaneZ', 'AnimationTrack.Animation', 'AnimationTrack.IsPlaying', 'AnimationTrack.Length', 'AnimationTrack.Speed', 'AnimationTrack.WeightCurrent', 'AnimationTrack.WeightTarget']);
// The editor's view of a class: every property, the class's own first (as Studio lists them
// by class), with its type and whether scripts may write it.
export function propertiesOf(cls) {
  const out = [];
  for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) for (const [k, [ty]] of Object.entries(c.props)) out.push({ name: k, type: ty, owner: c.name, readOnly: READ_ONLY.has(c.name + '.' + k) });
  return out;
}
/** A class's method (for engine-side tests and tools): fn(self, ...args) -> [returns]. */
export function methodOf(cls, name) { return lookup(cls, 'methods', name); }
/** Classes a creator can insert (Studio's Insert Object list): creatable, not services, by name. */
export function creatableClasses() { return Object.values(CLASSES).filter(c => c.creatable && !c.service).map(c => c.name).sort(); }
/** A class's members for autocomplete: properties, methods and events, its own first, inherited after. */
export function membersOf(cls) {
  const out = { props: [], methods: [], events: [] }, seen = new Set();
  for (let c = CLASSES[cls]; c; c = CLASSES[c.base]) {
    for (const [k, [ty]] of Object.entries(c.props)) if (!seen.has(k)) { seen.add(k); out.props.push({ name: k, type: ty, owner: c.name, readOnly: READ_ONLY.has(c.name + '.' + k), own: STUDIO_OWN.has(c.name + '.' + k) }); }
    for (const [k, fn] of Object.entries(c.methods)) if (!seen.has(k)) { seen.add(k); out.methods.push({ name: k, owner: c.name, params: paramsOf(fn) }); }
    for (const k of c.events) if (!seen.has(k)) { seen.add(k); out.events.push({ name: k, owner: c.name }); }
  }
  return out;
}
// A method's parameter names, from its own definition (`fn(self, a, b)` -> ['a', 'b']).
function paramsOf(fn) {
  const m = /^[^(]*\(([^)]*)\)/.exec(String(fn));
  return m ? m[1].split(',').map(x => x.trim().replace(/\s*=.*$/, '')).filter(x => x && x !== 'self' && !x.startsWith('...')) : [];
}
/** Every class, bases before the classes built on them (definition order): { name, base, creatable, service }. */
export function allClasses() { return Object.values(CLASSES).map(c => ({ name: c.name, base: c.base, creatable: c.creatable, service: c.service })); }
/** Service classes (game:GetService's names), by name. */
export function serviceClasses() { return Object.values(CLASSES).filter(c => c.service).map(c => c.name).sort(); }
export function classInfo(cls) { const c = CLASSES[cls]; return c ? { creatable: c.creatable, service: c.service, base: c.base } : null; }
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
      else if (v instanceof NumberRange) o.push({ t: T.NUMRANGE, n: v.min, v: [v.max, 0, 0] });
      else if (v instanceof NumberSequence) o.push({ t: T.NUMSEQ, n: v.k.length, s: v.toString() });
      else if (v instanceof ColorSequence) o.push({ t: T.COLORSEQ, n: v.k.length, s: v.toString() });
      else if (v instanceof TweenInfo) o.push({ t: T.TWEENINFO, n: v.time, s: v.style + ',' + v.dir, v: [v.repeat, v.reverses ? 1 : 0, v.delay] });
      else if (v instanceof EnumItem) o.push({ t: T.ENUM, s: v.type + '.' + v.name, n: v.value });
      else if (v instanceof BrickColor) o.push({ t: T.BRICKCOLOR, n: v.number });
      else if (v instanceof Font) o.push({ t: T.FONT, s: v.family, n: FONT_WEIGHTS[v.weight] ?? 400, v: [FONT_STYLES[v.style] ?? 0, 0, 0] });
      else if (v instanceof SignalRef) o.push({ t: T.SIGNAL, n: v.inst.handle, s: v.ev });
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
        case T.NUMRANGE: return new NumberRange(a.n, a.v[0]);
        case T.NUMSEQ: return NumberSequence.parse(a.s);
        case T.COLORSEQ: return ColorSequence.parse(a.s);
        case T.ENUM: { const [type, name] = a.s.split('.'); return new EnumItem(type, name, a.n); }
        case T.INST: return dm.byHandle[a.n];
        case T.BRICKCOLOR: return BrickColor.byNumber(a.n);
        case T.FONT: return new Font(a.s, Object.keys(FONT_WEIGHTS).find(k => FONT_WEIGHTS[k] === a.n) || 'Regular', a.v[0] ? 'Italic' : 'Normal');
      }
      return null;
    },
    err(msg) { host.ret = [{ t: T.ERR, s: msg }]; },
    enumType(type) { return !!ENUMS[type]; },
    // Font.fromEnum (the VM's Font datatype asks for the table here): 1 with the Font in ret, or 0.
    fontFromEnum(name) { const f = fontFromEnum(name); host.ret = f ? host.put([], f) : []; return f ? 1 : 0; },
    enumValue(type, name) { const E = ENUMS[type]; return E && name in E ? E[name] : null; },
    enumItems(type) { const E = ENUMS[type] || {}; host.ret = Object.entries(E).map(([k, v]) => ({ t: T.ENUM, s: type + '.' + k, n: v })); return host.ret.length; },
    global(name) { return name === 'game' ? dm.game.handle : name === 'workspace' ? dm.workspace.handle : name === 'UserSettings' ? dm.userSettings().handle : 0; },
    newInstance(cls) { const i = dm.create(cls); return i ? i.handle : 0; },
    index(h, key) {
      const inst = dm.byHandle[h];
      if (ALIASES[key] && ALIASES[key] in inst.props) key = ALIASES[key];
      if (key === 'Parent') { host.ret = host.put([], inst.parent); return 1; }
      if (key === 'ClassName') { host.ret = host.put([], inst.ClassName); return 1; }
      // A layout's AbsoluteContentSize is current when read (Roblox: 'updates as soon as it's read'): lay out now.
      if (key === 'AbsoluteContentSize' && dm.hooks.layoutNow) dm.hooks.layoutNow();
      if (ASSEMBLY_READS.has(key)) dm.assemblies.flush(); // joints placed before a placement is read
      if (key in inst.props) {
        if (inst.ClassName === 'Attachment' && key.startsWith('World')) dm.attachmentWorld(inst); // its part may have moved
        if (key === 'AssemblyMass' && isA(inst.ClassName, 'BasePart')) { const a = dm.assemblies.of.get(inst); inst.props.AssemblyMass = a ? a.parts.reduce((m, q) => m + (q.props.Massless && q !== a.root ? 0 : partMass(q)), 0) : partMass(inst); }
        const ty = typeOf(inst.ClassName, key);
        const v = inst.props[key];
        host.ret = host.put([], ty && ty.startsWith('Enum.') && typeof v === 'string' ? enumItem(ty.slice(5), v) : v);
        return 1;
      }
      if (lookup(inst.ClassName, 'methods', key)) { host.ret = [{ t: T.METHOD }]; return 1; }
      if (hasEvent(inst.ClassName, key)) { host.ret = [{ t: T.SIGNAL, n: h, s: key }]; return 1; }
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
      if (ty === 'BrickColor') { // as in Roblox, a script's BrickColor always sets Color to its colour
        if (!(v instanceof BrickColor)) return host.err(`Unable to assign property ${key}. BrickColor expected`);
        return dm.set(inst, 'Color', v.color);
      }
      if (ty === 'CFrame' && !(v instanceof CF)) return host.err(`Unable to assign property ${key}. CFrame expected`);
      if (ty === 'Font' && !(v instanceof Font)) return host.err(`Unable to assign property ${key}. Font expected`);
      for (const [name, C] of [['UDim2', UDim2], ['UDim', UDim], ['Vector2', V2], ['NumberRange', NumberRange], ['NumberSequence', NumberSequence], ['ColorSequence', ColorSequence]]) if (ty === name && !(v instanceof C)) return host.err(`Unable to assign property ${key}. ${name} expected`);
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
