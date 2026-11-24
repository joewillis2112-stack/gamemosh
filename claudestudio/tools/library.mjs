// The Toolbox's library: free models (CC0 or MIT) from Poly Haven and Kenney's kits, each through
// the asset gate before it is listed (PLAN.md: rendered from five views and a three-quarter view at
// its real size, checked in code, looked at). The models stay on their CDNs (loaded when inserted,
// Poly Haven's textures at the fidelity tier's resolution); the catalog and thumbnails are ours.
//
//   node tools/library.mjs fetch      candidates from the sources, their files into .cache/library
//   node tools/library.mjs gate [id…]  the turntable at real size for each candidate not yet gated (or those)
//   node tools/library.mjs sheets     thumbnail sheets for looking at every item (build/library)
//   node tools/library.mjs catalog    assets/library/catalog.json + thumbs, from the gated items
//                                     minus assets/library/rejects.json (ones I looked at and refused)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, '.cache/library'), LIB = path.join(ROOT, 'assets/library');
const STUD = 0.28; // metres
const MAX_TRIS = 100000; // heavier models aren't listed (phones); by Poly Haven's count, then the gate's own
const LIFT = 0.02; // studs: a model whose base is a flat upward surface (a road tile) is placed this far up, or it z-fights with the floor
// Kenney's kits are in their own units, not metres: studs per unit, so each kit lands at Roblox's
// scale (a character about 5 studs tall, a city tile 24 studs, a car about 9 x 17 studs). Measured
// from the gate: platformer character 1.1 units, Mini Arena soldier 0.84, city tiles 1, racing
// trucks 1.5 x 2.8, FPS cover walls 1.7 high (as metres).
const KENNEY = { 'Starter-Kit-City-Builder': 24, 'Starter-Kit-Racing': 6, 'Starter-Kit-FPS': 1 / STUD, 'Starter-Kit-3D-Platformer': 4, 'Starter-Kit-Basic-Scene': 6 };
const cmd = process.argv[2];
fs.mkdirSync(CACHE, { recursive: true });
const candPath = path.join(CACHE, 'candidates.json');
const readJson = (p, d) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d;

// A download, retried; with an md5 (Poly Haven gives one) a cut-off or changed file is retried too.
async function get(url, as = 'json', md5 = null) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url);
      if (as === 'json') return r.json();
      const buf = Buffer.from(await r.arrayBuffer());
      if (md5 && createHash('md5').update(buf).digest('hex') !== md5) throw new Error('md5 mismatch ' + url);
      return buf;
    }
    catch (e) { if (i === 3) throw e; await new Promise(res => setTimeout(res, 1000 * 2 ** i)); }
  }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
const save = (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); };
const titleCase = s => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// A .glb's files outside it (each Kenney kit's models share a Textures/colormap.png): fetched to
// beside it, where the CDN has them relative to the .glb.
async function glbExternals(buf, url, local) {
  const n = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + n).toString());
  for (const u of [...(j.images || []), ...(j.buffers || [])].map(x => x.uri).filter(u => u && !u.startsWith('data:'))) {
    const file = path.join(path.dirname(local), decodeURIComponent(u));
    if (!fs.existsSync(file)) save(file, await get(new URL(u, url).href, 'buf'));
  }
}
async function fetchCandidates() {
  const cands = readJson(candPath, {});
  // Poly Haven: CC0, glTF at 1k/2k/4k, real dimensions (mm).
  const ph = await get('https://api.polyhaven.com/assets?type=models');
  const want = Object.entries(ph).filter(([, a]) => (a.polycount || 0) <= MAX_TRIS);
  console.log(`Poly Haven: ${want.length} of ${Object.keys(ph).length} models under ${MAX_TRIS} triangles`);
  await pool(want, 6, async ([id, a]) => {
    const key = 'polyhaven/' + id;
    if (cands[key] && fs.existsSync(path.join(ROOT, cands[key].local))) return;
    const files = await get('https://api.polyhaven.com/files/' + id);
    const g = files.gltf && files.gltf['1k'] && files.gltf['1k'].gltf;
    if (!g) return;
    const dir = path.join(CACHE, 'polyhaven', id);
    // A model whose files don't match Poly Haven's own md5s (its CDN has served an older .bin for
    // one: cannon_01) can't load: it's left out.
    try {
      save(path.join(dir, path.basename(g.url)), await get(g.url, 'buf', g.md5));
      for (const [rel, f] of Object.entries(g.include || {})) save(path.join(dir, rel), await get(f.url, 'buf', f.md5));
    } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); console.log(`\nleft out ${id}: ${e.message}`); return; }
    const urls = Object.fromEntries(Object.entries(files.gltf).map(([res, v]) => [res, v.gltf.url]));
    cands[key] = {
      id: key, source: 'Poly Haven', name: a.name, categories: (a.categories || []).filter(c => !c.startsWith('collection')), tags: a.tags || [],
      credit: Object.keys(a.authors || {}).join(', '), license: 'CC0', tris: a.polycount, sizeStuds: (a.dimensions || []).map(mm => +(mm / 1000 / STUD).toFixed(2)),
      urls, local: path.relative(ROOT, path.join(dir, path.basename(g.url))), page: 'https://polyhaven.com/a/' + id,
    };
    process.stdout.write('.');
  });
  // Kenney's starter kits (MIT; Kenney's models): one .glb each, on jsDelivr at a pinned commit (a
  // placed model must not change when the kit's repository does).
  for (const kit of Object.keys(KENNEY)) {
    const sha = execFileSync('git', ['ls-remote', `https://github.com/KenneyNL/${kit}`, 'HEAD'], { encoding: 'utf8' }).split(/\s/)[0];
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`no commit for ${kit}`);
    const list = await get(`https://data.jsdelivr.com/v1/packages/gh/KenneyNL/${kit}@${sha}?structure=flat`);
    for (const f of list.files.filter(f => f.name.endsWith('.glb'))) {
      const name = path.basename(f.name, '.glb'), key = `kenney/${kit.replace('Starter-Kit-', '').toLowerCase()}/${name}`;
      const url = `https://cdn.jsdelivr.net/gh/KenneyNL/${kit}@${sha}${encodeURI(f.name)}`;
      const local = path.join(CACHE, key + '.glb'), known = cands[key] && cands[key].urls.glb === url && fs.existsSync(local);
      if (!known) save(local, await get(url, 'buf'));
      await glbExternals(fs.readFileSync(local), url, local);
      if (known) continue;
      cands[key] = { id: key, source: 'Kenney', name: titleCase(name), categories: [titleCase(kit.replace('Starter-Kit-', ''))], tags: name.split('-'), credit: 'Kenney', license: 'MIT', urls: { glb: url }, local: path.relative(ROOT, local), page: `https://github.com/KenneyNL/${kit}` };
    }
  }
  fs.writeFileSync(candPath, JSON.stringify(cands, null, 1));
  console.log(`\n${Object.keys(cands).length} candidates`);
}

// The gate: web/turntable.html at real size (?meters) with a three-quarter view (?thumb), one
// browser for all; metrics, the contact sheet and a 160 px thumbnail per item.
async function gate() {
  const { chromium } = await import('../../node_modules/playwright-core/index.mjs');
  const cands = readJson(candPath, {}), gateDir = path.join(CACHE, 'gate');
  fs.mkdirSync(gateDir, { recursive: true });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
  let fresh = true;
  // The browser: relaunched if it dies (a dead browser is not the asset's failure, and is never
  // recorded as one: the asset is tried again in the new browser, and the run stops if that dies too).
  let browser = null, page = null, missing = [];
  const launch = async () => {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 256, height: 256 } });
    // A file the asset needs that didn't load (a missing texture renders as untextured, not as an error).
    page.on('response', r => { if (r.status() >= 400) missing.push(r.status() + ' ' + decodeURIComponent(new URL(r.url()).pathname)); });
    page.on('requestfailed', r => missing.push('failed ' + r.url()));
    fresh = true;
  };
  const dead = e => /Target page, context or browser has been closed|Target crashed|browser has disconnected|Page crashed/i.test(String(e));
  const only = process.argv.slice(3); // ids: gate just these (again)
  const todo = Object.values(cands).filter(c => only.length ? only.includes(c.id) : !fs.existsSync(path.join(gateDir, c.id.replace(/\//g, '__') + '.json')));
  console.log(`${todo.length} to gate`);
  // One page renders many assets (window.turntable, ?batch): the sky is built once per page, not per
  // asset. A fresh page every 50 assets, and after any failure.
  let n = 0;
  const open = async () => {
    await page.goto(`http://127.0.0.1:${server.address().port}/web/turntable.html?batch=1&meters=1&thumb=1&px=256&lift=${LIFT}`);
    await page.waitForFunction(() => window.turntable, null, { timeout: 120000 });
    fresh = false;
  };
  // One asset in the page: its result, or an error (a dead browser throws, to be relaunched).
  const one = async c => {
    missing = [];
    if (fresh || n % 50 === 0) await open();
    let timer;
    try {
      return await Promise.race([
        page.evaluate(async u => {
          const r = await window.turntable(u); if (r.error) return { error: r.error };
          const tq = r.views.find(v => v[0] === 'three-quarter')[1], img = new Image(); img.src = tq; await img.decode();
          const c = document.createElement('canvas'); c.width = c.height = 160; c.getContext('2d').drawImage(img, 0, 0, 160, 160);
          return { metrics: r.metrics, sheet: r.sheet, thumb: c.toDataURL('image/jpeg', 0.82) };
        }, '../' + c.local),
        new Promise((_, no) => { timer = setTimeout(() => no(new Error('timed out after 120 s')), 120000); }),
      ]);
    } catch (e) { if (dead(e)) throw e; return { error: String(e.message || e).slice(0, 300) }; }
    finally { clearTimeout(timer); }
  };
  await launch();
  for (const c of todo) {
    const base = path.join(gateDir, c.id.replace(/\//g, '__'));
    let out;
    try { out = await one(c); }
    catch (e) {
      console.log(`the browser died on ${c.id}: relaunching`); await launch();
      try { out = await one(c); }
      catch { console.log(`it died again on ${c.id}: stopping (nothing recorded for it)`); await browser.close().catch(() => {}); server.close(); process.exit(1); }
    }
    if (!out.error && missing.length) out = { error: 'missing files: ' + missing.join(', ').slice(0, 300) };
    if (out.error) fresh = true;
    const png = d => Buffer.from(d.split(',')[1], 'base64');
    if (out.sheet) fs.writeFileSync(base + '.sheet.png', png(out.sheet));
    if (out.thumb) fs.writeFileSync(base + '.thumb.jpg', png(out.thumb));
    fs.writeFileSync(base + '.json', JSON.stringify({ id: c.id, error: out.error || null, metrics: out.metrics || null }, null, 1));
    if (++n % 20 === 0) console.log(`${n}/${todo.length}`);
  }
  await browser.close(); server.close();
}

// The gate measures at 1 unit = 1 m; a Kenney kit's units are its own (KENNEY): the factor to studs.
// A Poly Haven file off from Poly Haven's own dimensions by a power of ten (steel_frame_shelves_01
// is 21 m tall in its file, 2.1 m by the site) is put right.
function unitScale(c, m = null) {
  const kit = c.source === 'Kenney' && Object.keys(KENNEY).find(k => k.replace('Starter-Kit-', '').toLowerCase() === c.id.split('/')[1]);
  if (kit) return KENNEY[kit] * STUD;
  if (m && c.sizeStuds && Math.max(...c.sizeStuds) > 0) {
    const got = Math.max(...[0, 1, 2].map(i => m.bbox.max[i] - m.bbox.min[i])), ratio = got / Math.max(...c.sizeStuds);
    if (ratio > 3 || ratio < 1 / 3) return 10 ** -Math.round(Math.log10(ratio));
  }
  return 1;
}
// Gate results: the automatic part (it loaded, it has triangles, its base sits on the ground).
function results() {
  const cands = readJson(candPath, {}), gateDir = path.join(CACHE, 'gate');
  return Object.values(cands).map(c => {
    const base = path.join(gateDir, c.id.replace(/\//g, '__')), g = readJson(base + '.json', null);
    const m = g && g.metrics, why = !g ? 'not gated' : g.error ? 'error: ' + g.error : !m.triangles ? 'no triangles' : m.triangles > MAX_TRIS ? `${m.triangles} triangles (over ${MAX_TRIS})` : Math.abs(m.groundGap) > 0.01 ? 'off the ground' : null;
    return { c, m, why, thumb: base + '.thumb.jpg', sheet: base + '.sheet.png' };
  });
}

async function sheets() {
  const { chromium } = await import('../../node_modules/playwright-core/index.mjs');
  const ok = results().filter(r => !r.why), out = path.join(ROOT, 'build/library');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }), page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  for (let k = 0; k * 48 < ok.length; k++) {
    const part = ok.slice(k * 48, k * 48 + 48);
    const cells = part.map(r => `<div><img src="data:image/jpeg;base64,${fs.readFileSync(r.thumb).toString('base64')}"><p>${r.c.id.split('/').slice(1).join('/')}<br>${(r.m.heightStuds * unitScale(r.c, r.m)).toFixed(1)} studs${unitScale(r.c, r.m) !== 1 && r.c.source !== 'Kenney' ? ' (rescaled)' : ''}${r.m.flatBase > 0.05 ? ' (lifted)' : ''}, ${r.m.triangles} tris</p></div>`).join('');
    await page.setContent(`<style>body{margin:0;background:#222;color:#ddd;font:10px sans-serif;display:grid;grid-template-columns:repeat(8,150px)}div{padding:2px}img{width:146px;height:146px;display:block}p{margin:2px 0;height:26px;overflow:hidden}</style>${cells}`);
    await page.screenshot({ path: path.join(out, `review-${k}.png`), fullPage: true });
  }
  await browser.close();
  console.log(`${ok.length} items on ${Math.ceil(ok.length / 48)} sheets in build/library; refused automatically: ${results().filter(r => r.why).map(r => r.c.id + ' (' + r.why + ')').join(', ') || 'none'}`);
}

function catalog() {
  const rejects = new Set(readJson(path.join(LIB, 'rejects.json'), []).map(r => r.id || r));
  const items = results().filter(r => !r.why && !rejects.has(r.c.id));
  fs.rmSync(path.join(LIB, 'thumbs'), { recursive: true, force: true }); // only the listed items' (none left from refused ones)
  fs.mkdirSync(path.join(LIB, 'thumbs'), { recursive: true });
  const list = items.map(({ c, m }) => {
    const thumb = 'thumbs/' + c.id.replace(/\//g, '__') + '.jpg';
    fs.copyFileSync(path.join(CACHE, 'gate', c.id.replace(/\//g, '__') + '.thumb.jpg'), path.join(LIB, thumb));
    // size: as it is placed (kit units and rescales applied); meshSize: the file's own (studs at 1 m =
    // 1/0.28 studs), the MeshPart's MeshSize, so loading the file doesn't put Size back to it.
    const k = unitScale(c, m);
    const size = [m.bbox.max[0] - m.bbox.min[0], m.bbox.max[1] - m.bbox.min[1], m.bbox.max[2] - m.bbox.min[2]].map(v => Math.max(0.05, +(v * k).toFixed(2))); // a flat model (a floor tile) still gets a thin collider
    return { id: c.id, name: c.name, source: c.source, categories: c.categories, tags: c.tags, credit: c.credit, license: c.license, page: c.page, size, meshSize: [0, 1, 2].map(i => +Math.max(0.01, m.bbox.max[i] - m.bbox.min[i]).toFixed(4)), ...(m.flatBase > 0.05 ? { lift: LIFT } : {}), tris: m.triangles, url: c.urls['1k'] || c.urls.glb, thumb }; // Poly Haven's 1k (runtime/world.js picks the tier's)
  }).sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(LIB, 'catalog.json'), JSON.stringify({ generated: 'tools/library.mjs', items: list }));
  console.log(`catalog: ${list.length} items (${rejects.size} refused on review)`);
}

if (cmd === 'fetch') await fetchCandidates();
else if (cmd === 'gate') await gate();
else if (cmd === 'sheets') await sheets();
else if (cmd === 'catalog') catalog();
else console.log('usage: node tools/library.mjs fetch | gate | sheets | catalog');
