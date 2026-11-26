// Exact text outlines from the bundled fonts' own glyphs (assets/fonts/glyphs, tools/glyphs.py):
// each character's outline from the font file, placed where the browser lays that character out
// (the width of the text before it, as the page measures it, so kerning matches the live text).
// Used for Type > Create Outlines, Pathfinder on text, and the exported image (an SVG drawn as an
// image can't reach the page's fonts, so bundled-font text is written as these paths).
// Limits: a weight or slant the family has no outlines for (no bold file, no italic file) is the
// regular outline (the browser fakes those); ligatures are drawn as their separate letters.
import FAMILIES from '../../assets/fonts/families.json' with { type: 'json' };

const BASE = new URL('../../assets/fonts/glyphs/', import.meta.url);
const cache = new Map(); // file -> Promise of glyph data

/** Every bundled family's name (what a text's font names). */
export const FAMILY_NAMES = Object.values(FAMILIES).map(f => f.family);
const byName = new Map(Object.values(FAMILIES).map(f => [f.family, f]));
export const isBundled = family => byName.has(family);

// The glyph files a family has: weights (400, 700 where it has a bold) and whether italic.
function variants(f) {
  const out = [];
  for (const file of f.files) {
    const italic = file.style === 'italic', w = String(file.weight).split(' ').map(Number);
    if (w.length > 1) { for (const x of [400, 700]) if (w[0] <= x && x <= w[1]) out.push({ w: x, italic }); }
    else out.push({ w: w[0], italic });
  }
  return out;
}
/** The glyph file for a family, weight and slant (the nearest it has), and what it lacks. */
export function glyphFile(family, bold, italic) {
  const f = byName.get(family);
  if (!f) return null;
  const want = bold ? 700 : 400, vs = variants(f);
  const pick = vs.filter(v => v.italic === !!italic).sort((a, b) => Math.abs(a.w - want) - Math.abs(b.w - want))[0]
    || vs.sort((a, b) => Math.abs(a.w - want) - Math.abs(b.w - want))[0];
  return { file: `${family}-${pick.w}${pick.italic ? 'i' : ''}.json.gz`, fauxBold: bold && pick.w < 600, fauxItalic: !!italic && !pick.italic };
}

/** A glyph file's data ({ upm, ascender, descender, glyphs: { char: [advance, path] } }), loaded once. */
export async function loadGlyphs(file) { return load(file); }
async function load(file) {
  if (!cache.has(file)) cache.set(file, (async () => {
    const res = await fetch(new URL(encodeURIComponent(file), BASE));
    if (!res.ok) throw new Error(`no glyphs ${file}`);
    const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  })());
  return cache.get(file);
}

// SVG path data (absolute M L H V Q C Z, font units, y up) into the editor's subpaths of anchors
// ({ p, in, out, kind }), through `tf` (font units to document units).
export function pathToAnchors(d, tf) {
  const out = [], tok = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  let i = 0, sp = null, cur = [0, 0], start = [0, 0];
  const num = () => +tok[i++];
  const corner = p => ({ p, in: p.slice(), out: p.slice(), kind: 'Corner' });
  const to = (c1, c2, p) => { const last = sp.anchors[sp.anchors.length - 1]; last.out = tf(c1); sp.anchors.push({ p: tf(p), in: tf(c2), out: tf(p), kind: 'Corner' }); cur = p; };
  const close = () => {
    if (!sp) return;
    const a = sp.anchors, f = a[0], l = a[a.length - 1];
    if (a.length > 1 && Math.hypot(f.p[0] - l.p[0], f.p[1] - l.p[1]) < 1e-9) { f.in = l.in; a.pop(); }
    sp.closed = true; sp = null;
  };
  const isNum = () => i < tok.length && !/^[A-Za-z]$/.test(tok[i]);
  let c = null;
  while (i < tok.length) {
    // A command's parameters may repeat without it (SVG): after M the extra pairs are line-tos.
    if (isNum() && c) c = c === 'M' ? 'L' : c; else c = tok[i++];
    if (c === 'M') { close(); cur = start = [num(), num()]; sp = { anchors: [corner(tf(cur))], closed: false }; out.push(sp); }
    else if (c === 'L') { const p = [num(), num()]; to(cur, p, p); }
    else if (c === 'H') { const p = [num(), cur[1]]; to(cur, p, p); }
    else if (c === 'V') { const p = [cur[0], num()]; to(cur, p, p); }
    else if (c === 'Q') { const q = [num(), num()], p = [num(), num()], p0 = cur; to([p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1])], [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p); }
    else if (c === 'C') { const c1 = [num(), num()], c2 = [num(), num()], p = [num(), num()]; to(c1, c2, p); }
    else if (c === 'Z' || c === 'z') { close(); cur = start; }
  }
  close();
  return out;
}

/** A text's exact outline (subpaths, document units): its font's glyphs at the positions `advance`
 *  gives (advance(i): the width of the text's first i characters, as the page lays it out). Null
 *  if its font isn't bundled. */
export async function textGlyphPath(s, advance) {
  const g = glyphFile(s.font, s.bold, s.italic);
  if (!g) return null;
  const data = await load(g.file), k = s.size / data.upm, chars = [...s.text];
  const glyphs = [];
  let prefix = '';
  for (const ch of chars) {
    const x0 = s.at[0] + advance(prefix);
    prefix += ch;
    const glyph = data.glyphs[ch];
    if (!glyph || !glyph[1]) continue; // a space, or a character the subset lacks
    glyphs.push(pathToAnchors(glyph[1], ([x, y]) => [x0 + x * k, s.at[1] - y * k]));
  }
  return { glyphs, path: glyphs.flat(), fauxBold: g.fauxBold, fauxItalic: g.fauxItalic };
}

/** The bundled fonts as @font-face rules in this page (once), for the editor's live text. */
let declared = false;
export function declareFonts() {
  if (declared || typeof document === 'undefined') return;
  declared = true;
  const base = new URL('../../assets/fonts/', import.meta.url), st = document.createElement('style');
  st.textContent = Object.values(FAMILIES).flatMap(f => f.files.map(x => `@font-face{font-family:'${f.family}';src:url('${new URL(x.file, base)}') format('woff2');font-weight:${x.weight};font-style:${x.style || 'normal'};font-display:block}`)).join('\n');
  document.head.appendChild(st);
}
