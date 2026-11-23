// The Toolbox's catalog (assets/library/catalog.json, tools/library.mjs): every item complete, its
// thumbnail there, its size sane, its URL one the World can load at a tier's resolution, Kenney's
// pinned to a commit; nothing refused on review listed.
import fs from 'node:fs';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const LIB = new URL('../assets/library/', import.meta.url);
const { items } = JSON.parse(fs.readFileSync(new URL('catalog.json', LIB)));
const rejects = fs.existsSync(new URL('rejects.json', LIB)) ? JSON.parse(fs.readFileSync(new URL('rejects.json', LIB))).map(r => r.id || r) : [];

check(items.length > 300, `${items.length} items`);
check(new Set(items.map(i => i.id)).size === items.length, 'ids are unique');
const bad = (what, f) => { const b = items.filter(f); check(!b.length, what + (b.length ? ': not ' + b.slice(0, 4).map(i => i.id).join(', ') : '')); };
bad('every item has a name, a source, categories, tags, a credit and a page', i => !i.name || !i.source || !Array.isArray(i.categories) || !i.categories.length || !Array.isArray(i.tags) || !i.credit || !/^https:\/\//.test(i.page));
bad('every licence is CC0 (Poly Haven) or MIT (Kenney)', i => !(i.source === 'Poly Haven' ? i.license === 'CC0' : i.source === 'Kenney' && i.license === 'MIT'));
bad('every thumbnail is there (a JPEG)', i => { const f = new URL(i.thumb, LIB); return !fs.existsSync(f) || fs.readFileSync(f).readUInt16BE(0) !== 0xffd8; });
bad('every size is three positive studs, under 500', i => i.size.length !== 3 || i.size.some(v => !(v > 0 && v < 500)));
bad('every triangle count is positive and under 100k', i => !(i.tris > 0 && i.tris <= 100000));
bad("Poly Haven's URLs are its 1k glTF (the World picks the tier's)", i => i.source === 'Poly Haven' && !/^https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Models\/gltf\/1k\/([^/]+)\/\1_1k\.gltf$/.test(i.url));
bad("Kenney's URLs are pinned to a commit on jsDelivr", i => i.source === 'Kenney' && !/^https:\/\/cdn\.jsdelivr\.net\/gh\/KenneyNL\/Starter-Kit-[^@]+@[0-9a-f]{40}\/.+\.glb$/.test(i.url));
bad('nothing refused on review is listed', i => rejects.includes(i.id));
// Real size: a Kenney platformer character is about 5 studs tall; a city tile is 24 studs.
const ch = items.find(i => i.id === 'kenney/3d-platformer/character'), tile = items.find(i => i.id === 'kenney/city-builder/road-straight');
check(ch && Math.abs(ch.size[1] - 4.4) < 0.1, `the Kenney platformer character is ${ch && ch.size[1]} studs tall (4.4: 1.1 units at 4 studs)`);
check(tile && Math.abs(tile.size[0] - 24) < 0.1, `a Kenney city tile is ${tile && tile.size[0]} studs wide (24)`);

if (fail.length) { console.log(fail.length + ' failed'); process.exit(1); }
console.log('PASS');
