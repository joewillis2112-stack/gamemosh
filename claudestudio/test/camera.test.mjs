// workspace.CurrentCamera's script side (web/datamodel.js Camera, luau/lib_raycast.h
// point-to-ray), from Luau, against answers worked out by hand. The viewport is
// set to 800x600 here (the engine writes it in the player).
// Roblox: create.roblox.com/docs/reference/engine/classes/Camera
import createLuau from '../web/luau.mjs';
import { DataModel, V2 } from '../web/datamodel.js';
import { startLuau } from '../web/luau.js';

const out = [];
const dm = new DataModel();
const vm = await startLuau(createLuau, dm, (s, lvl) => out.push((lvl === 2 ? 'ERR ' : '') + s));
const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const run = src => { out.length = 0; vm.run('t', src); return out.slice(); };
const line = (r, k) => r.find(l => l.startsWith(k + ' ')) || '';
const nums = (r, k) => line(r, k).split(' ').slice(1).map(Number);
const near = (a, b, e = 1e-3) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= e);

let r = run(`local c = workspace.CurrentCamera
print("cam", typeof(c), c.ClassName, c.Name, c.Parent == workspace, workspace.Camera == c)
print("defaults", c.FieldOfView, c.CameraType.Name, c.CameraSubject, c.NearPlaneZ)`);
check(line(r, 'cam') === 'cam Instance Camera Camera true true', `workspace.CurrentCamera: the Workspace's child Camera (${line(r, 'cam')})`);
check(line(r, 'defaults') === 'defaults 70 Custom nil -0.1', `defaults: FieldOfView 70, Custom, no subject, NearPlaneZ -0.1 (${line(r, 'defaults')})`);

dm.workspace.props.CurrentCamera.props.ViewportSize = new V2(800, 600);
// Camera at (0, 0, 10) looking down -Z, FieldOfView 90: tan(45°) = 1, aspect 4/3.
const P = p => `local v, on = c:WorldToViewportPoint(Vector3.new(${p})) print(string.format("%.4f %.4f %.4f", v.X, v.Y, v.Z), on)`;
r = run(`local c = workspace.CurrentCamera
c.CameraType = Enum.CameraType.Scriptable c.CFrame = CFrame.new(0, 0, 10) c.FieldOfView = 90
print("size", c.ViewportSize.X, c.ViewportSize.Y)
${['0, 0, 0', '5, 0, 0', '0, 5, 0', '0, 0, 20'].map(p => P(p).replace('print(', 'print("p", ')).join('\n')}
local s = c:WorldToScreenPoint(Vector3.new(0, 5, 0)) print("screen", s.X, s.Y, s.Z)`);
const pts = r.filter(l => l.startsWith('p ')).map(l => l.split(' ').slice(1));
check(line(r, 'size') === 'size 800 600', 'ViewportSize reads back');
check(near(pts[0].slice(0, 3).map(Number), [400, 300, 10]) && pts[0][3] === 'true', `the point looked at: the viewport's centre, depth 10 (${pts[0]})`);
check(near(pts[1].slice(0, 3).map(Number), [550, 300, 10]), `5 studs right at depth 10, 90° FOV, 4:3: x = (5/(10·4/3)+1)/2·800 = 550 (${pts[1]})`);
check(near(pts[2].slice(0, 3).map(Number), [400, 150, 10]), `5 studs up: y = (1 - 0.5)/2·600 = 150, from the top (${pts[2]})`);
check(+pts[3][2] < 0 && pts[3][3] === 'false', `behind the camera: negative depth, not on screen (${pts[3]})`);
check(near(nums(r, 'screen'), [400, 150 - 58, 10]), `WorldToScreenPoint: less the 58 px GUI inset (${line(r, 'screen')})`);

r = run(`local c = workspace.CurrentCamera
local ray = c:ViewportPointToRay(550, 150)
print("dir", ray.Direction.X, ray.Direction.Y, ray.Direction.Z) print("org", ray.Origin.X, ray.Origin.Y, ray.Origin.Z)
local d = c:ViewportPointToRay(550, 150, 2) print("deep", d.Origin.X, d.Origin.Y, d.Origin.Z, (d.Origin - c.CFrame.Position).Magnitude)
local s = c:ScreenPointToRay(550, 150 - 58) print("same", s.Direction:FuzzyEq(ray.Direction), s.Origin:FuzzyEq(ray.Origin))
-- Back through the projection: a point along the ray lands on the pixel it came from.
local v = c:WorldToViewportPoint(ray.Origin + ray.Direction * 37) print("back", v.X, v.Y)
print("type", typeof(ray))`);
const u = [0.5, 0.5, -1].map(v => v / Math.hypot(0.5, 0.5, 1));
check(near(nums(r, 'dir'), u, 1e-5) && near(nums(r, 'org'), [0, 0, 10]), `ViewportPointToRay: a unit ray from the camera through the pixel, (0.5, 0.5, -1) normalised (${line(r, 'dir')})`);
check(near(nums(r, 'deep').slice(0, 3), [0, 0, 10].map((v, i) => v + u[i] * 2), 1e-5) && Math.abs(nums(r, 'deep')[3] - 2) < 1e-5, `depth moves the origin along the ray (${line(r, 'deep')})`);
check(line(r, 'same') === 'same true true', 'ScreenPointToRay: the same ray, 58 px higher');
check(near(nums(r, 'back'), [550, 150]), `ray and projection agree (${line(r, 'back')})`);
check(line(r, 'type') === 'type Ray', 'it returns a Ray');

// A turned camera: at (10, 0, 0) looking at the origin, so it looks down -X and its right is -Z.
r = run(`local c = workspace.CurrentCamera
c.CFrame = CFrame.lookAt(Vector3.new(10, 0, 0), Vector3.zero)
local v = c:WorldToViewportPoint(Vector3.new(0, 0, -5)) print("turned", v.X, v.Y, v.Z)
local ray = c:ViewportPointToRay(400, 300) print("ahead", ray.Direction.X, ray.Direction.Y, ray.Direction.Z)`);
check(near(nums(r, 'turned'), [550, 300, 10]), `a turned camera projects through its own axes (${line(r, 'turned')})`);
check(near(nums(r, 'ahead'), [-1, 0, 0], 1e-5), `the centre pixel's ray is the LookVector (${line(r, 'ahead')})`);

// FieldOfView: halving tan(FOV/2) doubles the offset from centre.
r = run(`local c = workspace.CurrentCamera c.CFrame = CFrame.new(0, 0, 10)
c.FieldOfView = 2 * math.deg(math.atan(0.5)) local v = c:WorldToViewportPoint(Vector3.new(5, 0, 0)) print("narrow", v.X)
c.FieldOfView = 0 print("lo", c.FieldOfView) c.FieldOfView = 200 print("hi", c.FieldOfView)
print(pcall(function() c.ViewportSize = Vector2.new(1, 1) end))
print(pcall(function() Instance.new("Part"):ViewportPointToRay(1, 1) end))
print(pcall(function() c:ViewportPointToRay("a", 1) end))`);
check(near(nums(r, 'narrow'), [700]), `FieldOfView narrows the view: x = (5/(10·0.5·4/3)+1)/2·800 = 700 (${line(r, 'narrow')})`);
check(line(r, 'lo') === 'lo 1' && line(r, 'hi') === 'hi 120', `FieldOfView clamps to [1, 120] (${line(r, 'lo')}, ${line(r, 'hi')})`);
check(r.some(l => /^false.*ViewportSize/.test(l)), 'ViewportSize is read-only');
check(r.some(l => /^false.*ViewportPointToRay is not a valid member of/.test(l)) && r.some(l => /^false.*number expected, got string/.test(l)), 'point-to-ray exists only on a Camera and checks its arguments');

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
