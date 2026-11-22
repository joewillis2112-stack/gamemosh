// Text outlines from the bundled fonts (web/vector/text.js): SVG path data into anchors (implicit
// repeated commands, quadratics as cubics, closing), the glyph file a weight and slant pick, and
// every glyph of every bundled family parsing into finite, closed contours.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToAnchors, glyphFile, FAMILY_NAMES } from '../web/vector/text.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const id = p => p;
const pts = path => path.map(sp => sp.anchors.map(a => a.p));

check(JSON.stringify(pts(pathToAnchors('M0 0 10 0 10 10H0Z', id))) === JSON.stringify(pts(pathToAnchors('M0 0L10 0L10 10L0 10Z', id))), 'pairs after M are line-tos (SVG), as fontTools writes them');
check(JSON.stringify(pts(pathToAnchors('M0 0L10 0 10 10 0 10Z', id))) === '[[[0,0],[10,0],[10,10],[0,10]]]', 'repeated L pairs, and a closing point equal to the start merges into it');
{
  const [sp] = pathToAnchors('M0 0Q30 0 30 30Z', id), a = sp.anchors;
  check(a.length === 2 && JSON.stringify(a[0].out) === '[20,0]' && JSON.stringify(a[1].in) === '[30,10]' && sp.closed, 'a quadratic becomes the cubic with handles at 2/3 towards its control point');
}
check(pathToAnchors('M0 0L1 0L1 1ZM5 5L6 5L6 6Z', id).length === 2, 'two contours, two subpaths');
{
  const tf = ([x, y]) => [100 + x * 0.5, 200 - y * 0.5], [sp] = pathToAnchors('M0 0L10 0L10 20Z', tf);
  check(JSON.stringify(pts([sp])) === '[[[100,200],[105,200],[105,190]]]', 'the transform takes font units (y up) to document units (y down)');
}

// Variants: a variable family has 400 and 700; a static one only what it has (the browser fakes the rest).
const roboto = glyphFile('Roboto', true, false), creepBold = glyphFile('Creepster', true, false), ubuntuI = glyphFile('Ubuntu', false, true), comicI = glyphFile('Comic Neue Angular', true, true);
check(roboto.file === 'Roboto-700.json.gz' && !roboto.fauxBold, 'bold Roboto (variable): its 700 instance');
check(creepBold.file === 'Creepster-400.json.gz' && creepBold.fauxBold, 'bold Creepster (no bold): the regular, marked as faked');
check(ubuntuI.file === 'Ubuntu-400i.json.gz' && !ubuntuI.fauxItalic, 'italic Ubuntu: its italic file');
check(comicI.file === 'Comic Neue Angular-400i.json.gz' && comicI.fauxBold && !comicI.fauxItalic, 'bold italic Comic Neue Angular (no bold italic): the italic, bold faked');
check(glyphFile('Arial', false, false) === null, 'a system font has no glyph file');

// Every glyph of every bundled family: finite, closed contours.
const dir = new URL('../assets/fonts/glyphs/', import.meta.url);
let files = 0, glyphs = 0, bad = [];
for (const f of fs.readdirSync(dir)) {
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(f, dir))).toString());
  files++;
  for (const [ch, [adv, d]] of Object.entries(data.glyphs)) {
    glyphs++;
    if (!(adv >= 0)) { bad.push(`${f} ${ch} advance`); continue; }
    if (!d) continue;
    const path = pathToAnchors(d, id);
    if (!path.length || path.some(sp => !sp.closed || sp.anchors.some(a => [...a.p, ...a.in, ...a.out].some(v => !Number.isFinite(v))))) bad.push(`${f} ${ch}`);
  }
}
const families = new Set(fs.readdirSync(dir).map(f => f.replace(/-\d+i?\.json\.gz$/, '')));
check(FAMILY_NAMES.every(n => families.has(n)), `every bundled family has glyphs (${families.size} of ${FAMILY_NAMES.length})`);
check(!bad.length, `all ${glyphs} glyphs in ${files} files parse into finite, closed contours${bad.length ? ': not ' + bad.slice(0, 5).join(', ') : ''}`);

if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
