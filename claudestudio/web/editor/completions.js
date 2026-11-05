// Autocomplete for the script editor, from what the engine really has: the Luau VM's own library
// tables (asked once, `libraries`), the studio's class table (properties, methods, events,
// services, creatable classes, enums) and the open place itself (an instance's real children).
// Pure: complete(text, pos, ctx) -> { from, options: [{ label, type, detail }] } or null.
// ctx: { libs: { name: [keys] }, dm, script } (dm: the editor's DataModel; script: the open script).
import { membersOf, serviceClasses, creatableClasses, classInfo, ENUMS } from '../datamodel.js';

const KEYWORDS = ['and', 'break', 'continue', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'];
const GLOBALS = ['game', 'workspace', 'script', 'print', 'warn', 'error', 'assert', 'pairs', 'ipairs', 'next', 'select', 'type', 'typeof', 'tostring', 'tonumber', 'pcall', 'xpcall', 'require', 'setmetatable', 'getmetatable', 'rawget', 'rawset', 'rawequal', 'unpack', 'wait', 'delay', 'spawn', 'tick', 'time', 'Enum'];

/** The VM's library tables (name -> sorted keys), asked from Luau itself: what scripts really get. */
export const LIBRARY_PROBE = `for _, name in {"math","string","table","task","coroutine","bit32","utf8","os","buffer","debug","Vector3","Vector2","CFrame","Color3","UDim","UDim2","Instance","TweenInfo"} do
  local v = getfenv()[name]; local keys = {}
  if type(v) == "table" then for k in pairs(v) do table.insert(keys, tostring(k)) end end
  table.sort(keys); print("@lib " .. name .. " " .. table.concat(keys, " "))
end`;
export function parseLibraries(lines) {
  const libs = {};
  for (const l of lines) { const m = /^@lib (\w+) ?(.*)$/.exec(l); if (m) libs[m[1]] = m[2] ? m[2].split(' ') : []; }
  return libs;
}

// What an expression is, as far as the text says: a library, Enum (or an Enum type), a class, an
// instance of the open place, or unknown. Expressions are dotted paths (a.b.c, game:GetService("X").Y).
function resolve(expr, text, ctx) {
  const parts = [], re = /(\w+)|:GetService\(\s*["'](\w+)["']\s*\)|:WaitForChild\(\s*["']([^"']+)["'][^)]*\)|:FindFirstChild\(\s*["']([^"']+)["'][^)]*\)|(\.)/g;
  let m, rest = expr;
  // Split into segments: names, and calls that give an instance.
  while ((m = re.exec(rest))) { if (m[1]) parts.push({ name: m[1] }); else if (m[2]) parts.push({ service: m[2] }); else if (m[3] || m[4]) parts.push({ child: m[3] || m[4] }); }
  if (!parts.length) return null;
  const head = parts[0].name;
  let cur;
  if (head === 'Enum') {
    if (parts.length === 1) return { enum: true };
    if (parts.length === 2 && ENUMS[parts[1].name]) return { enumType: parts[1].name };
    return null;
  }
  if (ctx.libs && ctx.libs[head] && parts.length === 1) return { lib: head };
  if (head === 'game') cur = { cls: 'DataModel', inst: null }; // its children are the services (below)
  else if (head === 'workspace') cur = { cls: 'Workspace', inst: ctx.dm ? ctx.dm.workspace : null };
  else if (head === 'script') cur = { cls: ctx.script ? ctx.script.ClassName : 'Script', inst: ctx.script || null };
  else { // a local: `local x = Instance.new("C")`, `= game:GetService("S")`, or `= <a resolvable path>`
    const decl = new RegExp(`local\\s+${head}\\s*=\\s*([^\\n]+)`).exec(text);
    if (!decl) return null;
    const rhs = decl[1].trim(), inew = /^Instance\.new\(\s*["'](\w+)["']/.exec(rhs);
    if (inew) cur = { cls: inew[1], inst: null };
    else if (rhs.split(/[.:]/)[0] !== head) cur = resolve(rhs.replace(/\s+$/, ''), text, ctx);
    if (!cur || !cur.cls) return null;
  }
  for (const p of parts.slice(1)) {
    if (p.service) { const s = ctx.dm && ctx.dm.services && ctx.dm.services[p.service]; cur = { cls: p.service, inst: s || null }; continue; }
    const name = p.name || p.child;
    if (cur.cls === 'DataModel' && ctx.dm && ctx.dm.services[name]) { cur = { cls: name, inst: ctx.dm.services[name] }; continue; }
    const kid = cur.inst && cur.inst.children.find(c => c.props.Name === name);
    if (kid) { cur = { cls: kid.ClassName, inst: kid }; continue; }
    if (p.name === 'Parent' && cur.inst && cur.inst.parent) { cur = { cls: cur.inst.parent.ClassName, inst: cur.inst.parent }; continue; }
    const prop = p.name && membersOf(cur.cls).props.find(x => x.name === p.name);
    if (prop && prop.type === 'Instance') { cur = { cls: 'Instance', inst: null }; continue; }
    if (cur.cls === 'DataModel' && p.name && classInfo(p.name) && classInfo(p.name).service) { cur = { cls: p.name, inst: ctx.dm && ctx.dm.services[p.name] }; continue; }
    return null;
  }
  return cur;
}

const opt = (label, type, detail) => ({ label, type, detail });
export function complete(text, pos, ctx = {}) {
  const before = text.slice(0, pos);
  // Inside a string argument: GetService, Instance.new, WaitForChild / FindFirstChild.
  let m = /(?:game|\w+):GetService\(\s*["'](\w*)$/.exec(before);
  if (m) return { from: pos - m[1].length, options: serviceClasses().map(c => opt(c, 'class', 'service')) };
  m = /Instance\.new\(\s*["'](\w*)$/.exec(before);
  if (m) return { from: pos - m[1].length, options: creatableClasses().map(c => opt(c, 'class', 'class')) };
  m = /([\w.:"'()\s]*?):(?:WaitForChild|FindFirstChild)\(\s*["']([^"']*)$/.exec(before);
  if (m) { const r = resolve(m[1].trim(), text, ctx); if (r && r.inst) return { from: pos - m[2].length, options: r.inst.children.map(c => opt(c.props.Name, 'variable', c.ClassName)) }; return null; }
  if (/["'`][^"'`\n]*$/.test(before.split('\n').pop().replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ''))) return null; // in some other string
  if (/--[^\n]*$/.test(before.split('\n').pop())) return null; // in a comment
  // After a dot or a colon: members of what's before it.
  m = /((?:\w+|:GetService\([^)]*\)|:(?:WaitForChild|FindFirstChild)\([^)]*\))(?:\s*[.:]\s*(?:\w+|GetService\([^)]*\)|(?:WaitForChild|FindFirstChild)\([^)]*\)))*)\s*([.:])(\w*)$/.exec(before);
  if (m) {
    const r = resolve(m[1], text, ctx), from = pos - m[3].length, colon = m[2] === ':';
    if (!r) return null;
    if (r.lib) return colon ? null : { from, options: ctx.libs[r.lib].map(k => opt(k, /^[A-Z]/.test(k) || ['pi', 'huge', 'e', 'nan', 'tau', 'phi', 'sqrt2', 'zero', 'one', 'identity'].includes(k) ? 'constant' : 'function', r.lib)) };
    if (r.enum) return colon ? null : { from, options: Object.keys(ENUMS).sort().map(e => opt(e, 'enum', 'Enum')) };
    if (r.enumType) return colon ? null : { from, options: Object.keys(ENUMS[r.enumType]).map(e => opt(e, 'enum', 'Enum.' + r.enumType)) };
    const mem = membersOf(r.cls);
    if (colon) return { from, options: mem.methods.map(x => opt(x.name, 'method', r.cls)) };
    const kids = r.inst ? r.inst.children.map(c => opt(c.props.Name, 'variable', c.ClassName)) : [];
    const services = r.cls === 'DataModel' ? serviceClasses().map(c => opt(c, 'class', 'service')) : [];
    const always = [opt('Parent', 'property', 'Instance'), opt('ClassName', 'property', 'string')]; // every instance has these (the engine keeps them outside its property lists)
    return { from, options: [...kids, ...services, ...mem.props.map(x => opt(x.name, 'property', x.type)), ...always, ...mem.events.map(x => opt(x.name, 'event', 'event'))] };
  }
  // A plain word: keywords, globals, libraries, and the script's own locals and functions.
  m = /(?:^|[^\w.:])(\w+)$/.exec(before);
  if (!m) return null;
  const locals = new Set();
  for (const d of text.matchAll(/\b(?:local\s+function|function|local)\s+([\w, ]+)/g)) d[1].split(',').forEach(n => { n = n.trim(); if (/^\w+$/.test(n)) locals.add(n); });
  for (const d of text.matchAll(/\bfor\s+([\w, ]+)\s+(?:=|in)\b/g)) d[1].split(',').forEach(n => { n = n.trim(); if (n) locals.add(n); });
  locals.delete(m[1]);
  const seen = new Set(), options = [];
  const add = (label, type, detail) => { if (!seen.has(label)) { seen.add(label); options.push(opt(label, type, detail)); } };
  [...locals].forEach(n => add(n, 'variable', 'local'));
  GLOBALS.forEach(g => add(g, 'variable', 'global'));
  Object.keys(ctx.libs || {}).forEach(l => add(l, 'namespace', 'library'));
  KEYWORDS.forEach(k => add(k, 'keyword', 'keyword'));
  return { from: pos - m[1].length, options };
}
