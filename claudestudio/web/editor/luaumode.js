// Luau highlighting and indentation for CodeMirror: CodeMirror's Lua mode (@codemirror/legacy-modes
// mode/lua.js, MIT) with Luau's differences: case-sensitive words, `continue`, compound assignment
// and `//`, backtick (interpolated) strings, and Roblox's globals and libraries as builtins.

const words = list => new RegExp('^(?:' + list.join('|') + ')$');
const builtins = words([
  // Luau's base library and libraries
  'assert', 'error', 'getmetatable', 'ipairs', 'next', 'pairs', 'pcall', 'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'require', 'select', 'setmetatable', 'tonumber', 'tostring', 'type', 'typeof', 'unpack', 'xpcall', 'gcinfo', 'newproxy',
  '(?:math|string|table|coroutine|bit32|utf8|os|debug|buffer|task)(?:\\.\\w+)?',
  // Roblox's globals and datatypes
  'game', 'workspace', 'script', 'shared', 'plugin', 'wait', 'delay', 'spawn', 'tick', 'time', 'warn', 'settings', 'Enum(?:\\.[\\w.]+)?',
  '(?:Instance|Vector3|Vector2|CFrame|Color3|UDim2|UDim|TweenInfo|BrickColor|Ray|Region3|NumberRange|NumberSequence|ColorSequence|RaycastParams|OverlapParams|Rect)(?:\\.\\w+)?',
]);
const keywords = words(['and', 'break', 'continue', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const indentTokens = words(['function', 'if', 'repeat', 'do', '\\(', '\\{']);
const dedentTokens = words(['end', 'until', '\\)', '\\}']);
const dedentPartial = /^(?:end|until|\)|\}|else|elseif)/;

function readBracket(stream) { let level = 0; while (stream.eat('=')) ++level; stream.eat('['); return level; }
function normal(stream, state) {
  const ch = stream.next();
  if (ch === '-' && stream.eat('-')) {
    if (stream.eat('[') && /[[=]/.test(stream.peek())) return (state.cur = bracketed(readBracket(stream), 'comment'))(stream, state);
    stream.skipToEnd(); return 'comment';
  }
  if (ch === '"' || ch === "'" || ch === '`') return (state.cur = string(ch))(stream, state);
  if (ch === '[' && /[[=]/.test(stream.peek())) return (state.cur = bracketed(readBracket(stream), 'string'))(stream, state);
  if (/\d/.test(ch)) { stream.eatWhile(/[\w.]/); return 'number'; }
  if (/[\w_]/.test(ch)) { stream.eatWhile(/[\w_.]/); return 'variable'; }
  if (/[-+*/%^=<>~#.:]/.test(ch)) { stream.eatWhile(/[-+*/%^=<>~.]/); return 'operator'; }
  return null;
}
function bracketed(level, style) {
  return (stream, state) => {
    let cur = null, ch;
    while ((ch = stream.next()) != null) {
      if (cur == null) { if (ch === ']') cur = 0; } else if (ch === '=') ++cur; else if (ch === ']' && cur === level) { state.cur = normal; break; } else cur = null;
    }
    return style;
  };
}
function string(quote) {
  return (stream, state) => {
    let escaped = false, ch;
    while ((ch = stream.next()) != null) { if (ch === quote && !escaped) break; escaped = !escaped && ch === '\\'; }
    if (!escaped) state.cur = normal;
    return 'string';
  };
}

export const luau = {
  name: 'luau',
  startState: () => ({ basecol: 0, indentDepth: 0, cur: normal }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    let style = state.cur(stream, state);
    const word = stream.current();
    if (style === 'variable') { if (keywords.test(word)) style = 'keyword'; else if (builtins.test(word)) style = 'builtin'; }
    if (style !== 'comment' && style !== 'string') { if (indentTokens.test(word)) ++state.indentDepth; else if (dedentTokens.test(word)) --state.indentDepth; }
    return style;
  },
  indent(state, textAfter, cx) { return state.basecol + cx.unit * (state.indentDepth - (dedentPartial.test(textAfter) ? 1 : 0)); },
  languageData: { indentOnInput: /^\s*(?:end|until|else|elseif|\)|\})$/, commentTokens: { line: '--', block: { open: '--[[', close: ']]' } } },
};
