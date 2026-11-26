// SurfaceGuis (Roblox; mashup-research/ROBLOX_SURFACEGUI_2026-11-26.md): a GUI canvas on one face of a part.
// runtime/gui.js lays one out as DOM like any other GUI; this module holds what is particular to it:
// - faceFrame: where the canvas lies on the part. Its top-left corner, and its right and down directions, so
//   that text reads from outside the face: on the sides the canvas's up is the part's up; on Top its up points
//   to the part's Back, on Bottom to its Front (UNSURE: Roblox doesn't document it; the same way up as our
//   Decals). A wedge's Front is its slope, up the slope. Balls and cylinders: the flat face of their box (OURS).
// - surfaceMatrix: the CSS matrix3d that draws the canvas onto the page over that face (AlwaysOnTop, which
//   draws over the 3D view as a ScreenGui does, and the invisible copy that takes clicks).
// - measure + raster: the canvas drawn into an image for the face's texture (occluded by the 3D world like
//   any surface). The DOM is drawn as an SVG <foreignObject> image (Chromium draws that; an image from a data
//   URL doesn't taint the canvas, a blob URL does). Such an image can't reach the page's fonts or files, so
//   its text is written as the bundled fonts' glyph outlines (vector/text.js), at the positions the page laid
//   each character out at, and its images are inlined as data URLs. (Embedding the fonts instead cost 15-45 ms
//   on the main thread per drawing.) Limits: characters the bundled fonts lack (emoji) aren't drawn;
//   ligatures draw as separate letters; underline and strikethrough are drawn as lines of our own weight.
import { glyphFile, isBundled, loadGlyphs } from '../vector/text.js';

const isWedge = p => p.ClassName === 'WedgePart' || p.props.Shape === 'Wedge';

/** The face's canvas in the part's own space (studs): its centre c, unit vectors r (the canvas's right), d (its
 *  down) and n (outward), and its size w x h studs. Null for a face it doesn't have. */
export function faceFrame(part, face) {
  const S = part.props.Size, x = S.x, y = S.y, z = S.z;
  if (face === 'Front' && isWedge(part)) {
    const L = Math.hypot(y, z) || 1;
    return { c: [0, 0, 0], r: [-1, 0, 0], d: [0, -y / L, -z / L], n: [0, z / L, -y / L], w: x, h: L };
  }
  const F = {
    Front: { c: [0, 0, -z / 2], r: [-1, 0, 0], d: [0, -1, 0], n: [0, 0, -1], w: x, h: y },
    Back: { c: [0, 0, z / 2], r: [1, 0, 0], d: [0, -1, 0], n: [0, 0, 1], w: x, h: y },
    Right: { c: [x / 2, 0, 0], r: [0, 0, -1], d: [0, -1, 0], n: [1, 0, 0], w: z, h: y },
    Left: { c: [-x / 2, 0, 0], r: [0, 0, 1], d: [0, -1, 0], n: [-1, 0, 0], w: z, h: y },
    Top: { c: [0, y / 2, 0], r: [-1, 0, 0], d: [0, 0, -1], n: [0, 1, 0], w: x, h: z },
    Bottom: { c: [0, -y / 2, 0], r: [-1, 0, 0], d: [0, 0, 1], n: [0, -1, 0], w: x, h: z },
  }[face];
  return F || null;
}

/** The canvas point (u, v) px of a W x H canvas on frame `f`, in the part's space (studs). */
export function canvasPoint(f, W, H, u, v) {
  const a = (u / W - 0.5) * f.w, b = (v / H - 0.5) * f.h;
  return [0, 1, 2].map(i => f.c[i] + f.r[i] * a + f.d[i] * b);
}

// The part's CFrame applied to a point (w = 1) or a direction (w = 0).
export function toWorld(cf, p, w = 1) {
  const m = cf.m;
  return [m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + cf.x * w, m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + cf.y * w, m[9] * p[0] + m[10] * p[1] + m[11] * p[2] + cf.z * w];
}

/** The canvas's map onto the page: `homog([x, y, z, w])` gives a homogeneous world point's page position
 *  [X, Y, W] (page px = X/W, Y/W). Returns { css (a matrix3d for an element at the page's top left, its
 *  transform-origin 0 0), toCanvas(px, py) -> [u, v] } or null while a corner of the canvas is behind the
 *  camera (CSS can't draw a plane that crosses it). */
export function surfaceMatrix(part, f, W, H, homog) {
  const cf = part.props.CFrame, o = toWorld(cf, canvasPoint(f, W, H, 0, 0));
  const ru = toWorld(cf, f.r.map(v => v * f.w / W), 0), dv = toWorld(cf, f.d.map(v => v * f.h / H), 0);
  const A = homog([...ru, 0]), B = homog([...dv, 0]), C = homog([...o, 1]);
  for (const [u, v] of [[0, 0], [W, 0], [0, H], [W, H]]) if (A[2] * u + B[2] * v + C[2] < 0.05) return null;
  const css = `matrix3d(${[A[0], A[1], 0, A[2], B[0], B[1], 0, B[2], 0, 0, 1, 0, C[0], C[1], 0, C[2]].map(v => +v.toPrecision(10)).join(',')})`;
  // Its inverse: the canvas point under a page point.
  const M = [[A[0], B[0], C[0]], [A[1], B[1], C[1]], [A[2], B[2], C[2]]];
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const toCanvas = (px, py) => {
    const inv = (r, c) => { const a = [0, 1, 2].filter(i => i !== c), b = [0, 1, 2].filter(i => i !== r); const s = ((r + c) % 2 ? -1 : 1); return s * (M[a[0]][b[0]] * M[a[1]][b[1]] - M[a[0]][b[1]] * M[a[1]][b[0]]) / det; };
    const q = [0, 1, 2].map(i => inv(i, 0) * px + inv(i, 1) * py + inv(i, 2));
    return [q[0] / q[2], q[1] / q[2]];
  };
  return { css, toCanvas };
}

// ---- Drawing the canvas into an image
const canvasCtx = (() => { let c = null; return () => c || (c = document.createElement('canvas').getContext('2d')); })();
const firstFamily = list => list.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
const dataUrls = new Map(); // url -> Promise of a data URL (or null)
function dataUrl(url) {
  if (!dataUrls.has(url)) dataUrls.set(url, fetch(new URL(url, document.baseURI)).then(r => r.ok ? r.blob() : null).then(b => b && new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); })).catch(() => null));
  return dataUrls.get(url);
}

/** What the canvas shows now, read from its laid-out DOM `root` (synchronously: the page's layout of this
 *  frame): a detached copy without its text, each text character's place and style, and the box everything
 *  drawn reaches (canvas px; beyond the canvas only when `clip` is off). `keepText(el)`: a text element whose
 *  hidden text is drawn anyway (a focused TextBox: its field shows the same text). */
export function measure(root, W, H, clip, keepText = () => false) {
  root.classList.add('cs-sg-measure'); // (no transforms while measuring: positions in each box's own frame)
  const R = root.getBoundingClientRect(), hosts = [];
  let bx0 = 0, by0 = 0, bx1 = W, by1 = H;
  if (!clip) for (const el of root.querySelectorAll('.cs-gui')) {
    const q = el.getBoundingClientRect(); if (!q.width || !q.height || getComputedStyle(el).display === 'none') continue;
    bx0 = Math.min(bx0, q.left - R.left); by0 = Math.min(by0, q.top - R.top); bx1 = Math.max(bx1, q.right - R.left); by1 = Math.max(by1, q.bottom - R.top);
  }
  // (Never more than a canvas past each edge.)
  bx0 = Math.max(bx0, -W); by0 = Math.max(by0, -H); bx1 = Math.min(bx1, 2 * W); by1 = Math.min(by1, 2 * H);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), range = document.createRange(), byHost = new Map();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement, host = el && el.closest('.cs-gui');
    if (!host || el.closest('input, textarea') || !node.data.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' && !keepText(host)) continue;
    const family = firstFamily(cs.fontFamily), size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 600, italic = cs.fontStyle !== 'normal';
    const ctx = canvasCtx(); ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px '${family}', Arimo, sans-serif`;
    const asc = ctx.measureText('Hg').fontBoundingBoxAscent;
    const span = el.closest('span') || el, ss = getComputedStyle(span);
    const style = {
      family: isBundled(family) ? family : 'Arimo', bold, italic, size, fill: cs.color,
      strokeW: parseFloat(cs.webkitTextStrokeWidth) || 0, strokeC: cs.webkitTextStrokeColor,
      shadow: cs.textShadow && cs.textShadow !== 'none' ? (/rgba?\([^)]*\)/.exec(cs.textShadow) || [null])[0] : null,
      grad: (ss.webkitBackgroundClip === 'text' || ss.backgroundClip === 'text') && span.style.backgroundImage ? span.style.backgroundImage : null,
      under: /underline/.test(cs.textDecorationLine), strike: /line-through/.test(cs.textDecorationLine),
    };
    const H0 = host.getBoundingClientRect(), chars = [];
    for (let i = 0; i < node.data.length; i++) {
      const ch = node.data[i]; if (ch === '\n') continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const q = range.getClientRects()[0]; if (!q) continue;
      chars.push({ ch, x: q.left - H0.left, base: q.top - H0.top + asc, w: q.width });
    }
    if (!chars.length) continue;
    if (!byHost.has(host)) { byHost.set(host, hosts.length); hosts.push({ el: host, runs: [], w: H0.width, h: H0.height }); }
    hosts[byHost.get(host)].runs.push({ style, chars });
  }
  hosts.forEach((h, i) => h.el.setAttribute('data-sgt', String(i)));
  const copy = root.cloneNode(true);
  hosts.forEach(h => h.el.removeAttribute('data-sgt'));
  root.classList.remove('cs-sg-measure');
  copy.classList.remove('cs-sg-measure');
  // The copy: no text (drawn as outlines), no text fields, untransformed at the box's origin.
  for (const f of copy.querySelectorAll('input, textarea')) f.remove();
  const tw = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT), drop = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) drop.push(n);
  drop.forEach(n => n.remove());
  Object.assign(copy.style, { left: -bx0 + 'px', top: -by0 + 'px', transform: 'none', opacity: '1', visibility: 'visible', pointerEvents: 'none' });
  return { copy, hosts, bounds: [bx0, by0, bx1 - bx0, by1 - by0] };
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// One run of characters as SVG: each glyph once (<defs>) and placed where the page laid its character out.
function runSvg(run, data, fallback, id, defs) {
  const S = run.style, k = S.size / data.upm, kf = S.size / fallback.upm, out = [];
  const gf = glyphFile(S.family, S.bold, S.italic) || {};
  const skew = gf.fauxItalic ? ' skewX(-12)' : '';
  for (const c of run.chars) {
    let src = data, kk = k, g = data.glyphs[c.ch];
    if (!g) { g = fallback.glyphs[c.ch]; src = fallback; kk = kf; } // the page falls back to Arimo too
    if (!g || !g[1]) continue;
    const key = (src === data ? 'a' : 'b') + c.ch.codePointAt(0);
    if (!defs.has(key)) defs.set(key, `<path id="${id}${defs.size}" d="${g[1]}"/>`);
    const ref = defs.get(key).match(/id="([^"]+)"/)[1];
    out.push(`<use href="#${ref}" transform="translate(${c.x.toFixed(2)} ${c.base.toFixed(2)})${skew} scale(${kk.toPrecision(6)} ${(-kk).toPrecision(6)})"/>`);
  }
  const glyphs = out.join(''), sw = (w, s) => (w / (s || 1)).toPrecision(5);
  let svg = '';
  if (S.shadow) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) svg += `<g transform="translate(${dx} ${dy})" fill="${S.shadow}">${glyphs}</g>`;
  const bold = gf.fauxBold ? ` stroke="${S.fill}" stroke-width="${sw(S.size * 0.04, k)}" stroke-linejoin="round"` : '';
  const stroke = S.strokeW > 0 ? ` stroke="${S.strokeC}" stroke-width="${sw(S.strokeW, k)}" stroke-linejoin="round" paint-order="stroke"` : '';
  svg += `<g fill="${S.grad ? '#000' : S.fill}"${stroke || bold}>${glyphs}</g>`;
  // Underline and strikethrough: a line under (through) each character (OURS: their weight and height).
  if (S.under || S.strike) for (const c of run.chars) {
    if (S.under) svg += `<rect x="${c.x.toFixed(2)}" y="${(c.base + S.size * 0.1).toFixed(2)}" width="${c.w.toFixed(2)}" height="${(S.size / 16).toFixed(2)}" fill="${S.fill}"/>`;
    if (S.strike) svg += `<rect x="${c.x.toFixed(2)}" y="${(c.base - S.size * 0.3).toFixed(2)}" width="${c.w.toFixed(2)}" height="${(S.size / 16).toFixed(2)}" fill="${S.fill}"/>`;
  }
  return svg;
}

/** The snapshot `measure` took, drawn: a canvas of the bounds at `k` pixels per canvas pixel. `css`: the
 *  GUI's own stylesheet rules (the copy's classes). */
export async function raster(snap, k, css) {
  const fallback = await loadGlyphs(glyphFile('Arimo', false, false).file);
  for (const [hi, h] of snap.hosts.entries()) {
    const el = snap.copy.querySelector(`[data-sgt="${hi}"]`) || (snap.copy.getAttribute('data-sgt') === String(hi) ? snap.copy : null);
    if (!el) continue;
    el.removeAttribute('data-sgt');
    const defs = new Map(), parts = [], masks = [];
    for (const run of h.runs) {
      const gf = glyphFile(run.style.family, run.style.bold, run.style.italic);
      const data = gf ? await loadGlyphs(gf.file) : fallback;
      const s = runSvg(run, data, fallback, `h${hi}g`, defs);
      if (run.style.grad) masks.push([run.style.grad, s]); else parts.push(s);
    }
    const defsSvg = `<defs>${[...defs.values()].join('')}</defs>`;
    const box = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    let add = `<svg xmlns="http://www.w3.org/2000/svg" width="${h.w}" height="${h.h}" style="${box}">${defsSvg}${parts.join('')}</svg>`;
    // Gradient-filled text: the box's gradient shown through the glyphs' shapes.
    for (const [grad, s] of masks) {
      const m = `<svg xmlns="http://www.w3.org/2000/svg" width="${h.w}" height="${h.h}">${defsSvg}${s}</svg>`;
      add += `<div style="${box};width:${h.w}px;height:${h.h}px;background-image:${esc(grad)};background-size:100% 100%;-webkit-mask-image:url(&quot;data:image/svg+xml;charset=utf-8,${esc(encodeURIComponent(m))}&quot;);mask-image:url(&quot;data:image/svg+xml;charset=utf-8,${esc(encodeURIComponent(m))}&quot;)"></div>`;
    }
    const tmp = document.createElement('div'); tmp.innerHTML = add;
    while (tmp.firstChild) el.appendChild(tmp.firstChild);
  }
  let html = new XMLSerializer().serializeToString(snap.copy);
  // Images as data URLs (a page path or https in the image would draw nothing).
  const urls = [...new Set([...html.matchAll(/url\((?:&quot;|")([^"&]+)(?:&quot;|")\)/g)].map(m => m[1]).filter(u => !/^data:/.test(u)))];
  for (const u of urls) { const d = await dataUrl(u); html = html.split(u).join(d || 'data:,'); }
  const [bx, by, bw, bh] = snap.bounds, cw = Math.max(1, Math.round(bw * k)), ch = Math.max(1, Math.round(bh * k));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${bw} ${bh}"><foreignObject x="0" y="0" width="${bw}" height="${bh}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${bw}px;height:${bh}px;overflow:hidden"><style>${css}</style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(img, 0, 0, cw, ch);
  return { canvas: c, bounds: [bx, by, bw, bh] };
}
