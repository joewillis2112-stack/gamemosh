// NumberRange, NumberSequence(Keypoint), ColorSequence(Keypoint) in Luau, and ParticleEmitter's
// properties that use them, against Roblox's documentation (creator-docs datatypes/*.yaml) and the
// API dump's defaults (mashup-research/ROBLOX_PARTICLES_2026-11-13.md).
import createLuau from '../web/luau.mjs';
import { startLuau } from '../web/luau.js';
import { DataModel } from '../web/datamodel.js';

const out = [], dm = new DataModel();
const vm = await startLuau(createLuau, dm, (s, lvl) => out.push((lvl === 2 ? 'ERR ' : '') + s), { runScripts: false });
vm.run('seq', `
local r = NumberRange.new(2, 5)
print("range", r.Min, r.Max, tostring(r), typeof(r), NumberRange.new(3) == NumberRange.new(3, 3))
print("range bad", pcall(NumberRange.new, 5, 2))
local ns = NumberSequence.new(1, 0)
print("numseq", tostring(ns), typeof(ns), #ns.Keypoints, ns.Keypoints[2].Time, ns.Keypoints[2].Value)
print("numseq one", tostring(NumberSequence.new(0.5)))
local k = NumberSequenceKeypoint.new(0.5, 2, 0.25)
print("keypoint", k.Time, k.Value, k.Envelope, typeof(k), NumberSequenceKeypoint.new(0, 1).Envelope)
local many = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.5, 4, 1), NumberSequenceKeypoint.new(1, 0) })
print("numseq kps", tostring(many), many == NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.5, 4, 1), NumberSequenceKeypoint.new(1, 0) }), many == ns)
print("numseq one kp", pcall(NumberSequence.new, { NumberSequenceKeypoint.new(0, 1) }))
print("numseq ends", pcall(NumberSequence.new, { NumberSequenceKeypoint.new(0.1, 1), NumberSequenceKeypoint.new(1, 1) }))
print("numseq order", pcall(NumberSequence.new, { NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.6, 1), NumberSequenceKeypoint.new(0.4, 1), NumberSequenceKeypoint.new(1, 1) }))
print("numseq same time", pcall(NumberSequence.new, { NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.5, 1), NumberSequenceKeypoint.new(0.5, 3), NumberSequenceKeypoint.new(1, 1) }))
print("envelope", pcall(NumberSequenceKeypoint.new, 0, 1, -1))
local red, blue = Color3.new(1, 0, 0), Color3.new(0, 0, 1)
local cs = ColorSequence.new(red, blue)
print("colorseq", tostring(cs), typeof(cs), #cs.Keypoints, cs.Keypoints[2].Value == blue, typeof(cs.Keypoints[1]))
print("colorseq one", tostring(ColorSequence.new(red)))
print("colorseq kps", ColorSequence.new({ ColorSequenceKeypoint.new(0, red), ColorSequenceKeypoint.new(1, blue) }) == cs, pcall(ColorSequence.new, { ColorSequenceKeypoint.new(0, red) }))
print("readonly", pcall(function() r.Min = 1 end))
-- On a ParticleEmitter: the dump's defaults, and values set from Luau come back as set.
local p = Instance.new("ParticleEmitter")
print("defaults", tostring(p.Size), tostring(p.Color), tostring(p.Lifetime), tostring(p.Speed), tostring(p.Squash), p.Rate, p.LightInfluence, p.Orientation == Enum.ParticleOrientation.FacingCamera)
p.Size = many  p.Color = cs  p.Lifetime = NumberRange.new(1, 2)
print("set", p.Size == many, p.Color == cs, p.Lifetime == NumberRange.new(1, 2), tostring(p.Size))
print("wrong type", pcall(function() p.Size = 3 end))
p.Orientation = Enum.ParticleOrientation.VelocityParallel
print("enum", p.Orientation.Name, #Enum.ParticleFlipbookMode:GetEnumItems())
`);
const expect = [
  'range 2 5 2 5  NumberRange true',
  'numseq 0 1 0 1 0 0  NumberSequence 2 1 0',
  'numseq one 0 0.5 0 1 0.5 0 ',
  'keypoint 0.5 2 0.25 NumberSequenceKeypoint 0',
  'numseq kps 0 0 0 0.5 4 1 1 0 0  true false',
  'colorseq 0 1 0 0 0 1 0 0 1 0  ColorSequence 2 true ColorSequenceKeypoint',
  'colorseq one 0 1 0 0 0 1 1 0 0 0 ',
  'defaults 0 1 0 1 1 0  0 1 1 1 0 1 1 1 1 0  5 10  5 5  0 0 0 1 0 0  20 0 true',
  'set true true true 0 0 0 0.5 4 1 1 0 0 ',
  'enum VelocityParallel 4',
];
const fail = [];
for (const e of expect) if (!out.includes(e)) fail.push('missing: ' + JSON.stringify(e));
const errs = { 'range bad': /invalid range/, 'numseq one kp': /at least 2 keypoints/, 'numseq ends': /start at 0 and end at 1/, 'numseq order': /non-descending/, 'envelope': /non-negative/, 'readonly': /cannot be assigned/, 'wrong type': /NumberSequence expected/ };
for (const [k, re] of Object.entries(errs)) { const l = out.find(x => x.startsWith(k + ' false')); if (!l || !re.test(l)) fail.push(`${k}: expected an error matching ${re} (${l})`); }
if (!out.includes('numseq same time true NumberSequence')) { const l = out.find(x => x.startsWith('numseq same time')); if (!l || !l.startsWith('numseq same time true')) fail.push('equal times are allowed (non-descending): ' + l); }
if (!out.find(x => x.startsWith('colorseq kps true false'))) fail.push('colorseq kps: ' + out.find(x => x.startsWith('colorseq kps')));
for (const l of out) console.log('  ' + l);
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
process.exit(fail.length ? 1 : 0);
