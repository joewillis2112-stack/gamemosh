// Place files (web/placefile.js): every place in places/ is built by its Luau,
// saved, loaded into a fresh DataModel and saved again. The two saves must be
// identical, and the loaded instances must match the originals property by
// property (derived ones included), with references pointing at the copies.
import fs from 'node:fs';
import createLuau from '../web/luau.mjs';
import { DataModel, V3, C3, baseplateLighting } from '../web/datamodel.js';
import { startLuau } from '../web/luau.js';
import { savePlace, loadPlace } from '../web/placefile.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const SERVICES = ['Workspace', 'Lighting', 'ReplicatedStorage', 'ServerScriptService', 'StarterGui', 'StarterPack', 'StarterPlayer'];

// Every property of every instance under the saved services, as comparable text (refs as paths).
function dump(dm) {
  const path = i => { const p = []; for (let a = i; a && a !== dm.game; a = a.parent) p.unshift(a.props.Name); return p.join('.'); };
  const out = [];
  const walk = i => {
    if (i.isCharacter) return;
    const props = Object.entries(i.props).filter(([k]) => !['AssemblyLinearVelocity', 'AssemblyAngularVelocity', 'ViewportSize'].includes(k)).map(([k, v]) => {
      if (v && v.dm) return `${k}=@${path(v)}`;
      if (v && v.m) return `${k}=${v.m.map(x => x.toFixed(4)).join(',')}`;
      if (v instanceof V3) return `${k}=${[v.x, v.y, v.z].map(x => x.toFixed(3)).join(',')}`;
      return `${k}=${JSON.stringify(v && v.name || v)}`;
    }).sort();
    out.push(`${path(i)} <${i.ClassName}> ${props.join(' ')}`);
    for (const c of i.children) walk(c);
  };
  for (const s of SERVICES) walk(dm.service(s));
  return out;
}

const places = fs.readdirSync('places').filter(f => f.endsWith('.luau'));
for (const f of places) {
  const dm = new DataModel();
  const vm = await startLuau(createLuau, dm, () => {});
  baseplateLighting(dm);
  try { vm.run('place', fs.readFileSync('places/' + f, 'utf8')); } catch (e) { check(false, `${f}: runs (${e.message})`); continue; }
  const file = savePlace(dm), text = JSON.stringify(file);
  const dm2 = new DataModel();
  const warnings = loadPlace(dm2, JSON.parse(text));
  const again = JSON.stringify(savePlace(dm2));
  const a = dump(dm), b = dump(dm2), diff = a.filter((l, i) => l !== b[i]);
  check(again === text && a.length === b.length && !diff.length && !warnings.length, `${f}: save, load, save again is identical; ${a.length} instances match property by property (${(text.length / 1024).toFixed(1)} KB)${diff.length ? ' FIRST DIFF: ' + diff[0].slice(0, 200) + ' vs ' + b[a.indexOf(diff[0])]?.slice(0, 200) : ''}${warnings.length ? ' ' + warnings[0] : ''}`);
}

// References, scripts, the camera, and a part edited after creation.
const dm = new DataModel();
const vm = await startLuau(createLuau, dm, () => {});
vm.run('t', `
local m = Instance.new("Model") m.Name = "Car" m.Parent = workspace
local body = Instance.new("Part") body.Name = "Body" body.Parent = m m.PrimaryPart = body
body.CFrame = CFrame.new(1, 2, 3) * CFrame.Angles(0, math.rad(30), 0) body.Color = Color3.new(0.2, 0.4, 0.6) body.Material = Enum.Material.Neon
local v = Instance.new("ObjectValue") v.Name = "Outside" v.Value = game.Lighting v.Parent = m
local s = Instance.new("Script") s.Source = "print('hi')" s.Parent = game.ServerScriptService
workspace.CurrentCamera.FieldOfView = 50
`);
const dm2 = new DataModel();
loadPlace(dm2, JSON.parse(JSON.stringify(savePlace(dm))));
const car = dm2.workspace.children.find(c => c.props.Name === 'Car'), body = car && car.children.find(c => c.props.Name === 'Body');
check(car && car.props.PrimaryPart === body, 'a Model\'s PrimaryPart points at the loaded copy of its part');
check(body && body.props.Material === 'Neon' && Math.abs(body.props.Orientation.y - 30) < 1e-3 && body.props.Position.x === 1, `a part's CFrame, Material, and derived Position/Orientation come back (${body && body.props.Orientation.y})`);
check(car && car.children.find(c => c.props.Name === 'Outside').props.Value === dm2.service('Lighting'), 'a reference to a saved service points at the new one');
const script = dm2.service('ServerScriptService').children[0];
check(script && script.ClassName === 'Script' && script.props.Source === "print('hi')", 'scripts keep their Source');
check(dm2.workspace.children.filter(c => c.ClassName === 'Camera').length === 1 && dm2.workspace.props.CurrentCamera.props.FieldOfView === 50, 'the camera loads onto the existing one (not a second), with its settings');
let threw = '';
try { loadPlace(new DataModel(), { format: 'something else' }); } catch (e) { threw = e.message; }
check(/not a Claude Studio place/.test(threw), 'a file that isn\'t a place is refused');
const unknown = loadPlace(new DataModel(), { format: 'claudestudio-place', version: 1, services: [{ class: 'Workspace', id: 0, props: { Nope: 1 }, children: [{ class: 'NotAClass', id: 1 }] }] });
check(unknown.length === 2, `unknown properties and classes are skipped with a warning (${unknown.join('; ')})`);

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
