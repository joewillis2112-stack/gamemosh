// Bundles Dukecraft into one self-contained HTML file: the page script and
// the world worker (esbuild IIFEs), the CON VM and Minecraft's world
// generator as gzipped wasm, Minecraft's worldgen data and textures (built
// by pokecraft/build.sh), and Duke's own files (art, scripts, sounds) as a
// gzipped GRP, all base64-inlined.
// Usage: node dukecraft/tools/bundle.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const poke = resolve(root, '../pokecraft');
const pw = join(poke, '.work'), dw = join(root, '.work');

const workerSrc = (await build({ entryPoints: [join(poke, 'web/worker.js')], bundle: true, format: 'iife', minify: true, target: ['es2020'], write: false, logLevel: 'warning' })).outputFiles[0].text;
const result = await build({
  entryPoints: [join(root, 'web/main.js')], bundle: true, format: 'iife', minify: true, target: ['es2020'], write: false,
  define: { __WORKER_SRC__: JSON.stringify(workerSrc) }, logLevel: 'warning',
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const b64 = (buf) => Buffer.from(buf).toString('base64');
const gz = (p) => gzipSync(readFileSync(p), { level: 9 });
const assets = {
  mc: b64(gz(join(pw, 'mcgen.wasm'))),
  data: b64(readFileSync(join(pw, 'mcdata.bin'))),
  atlas: b64(readFileSync(join(pw, 'assets/blocks.png'))),
  items: b64(readFileSync(join(pw, 'assets/items.png'))),
  world: JSON.parse(readFileSync(join(pw, 'assets/world.json'), 'utf8')),
  con: b64(gz(join(root, 'conwasm/target/wasm32-unknown-unknown/release/conwasm.wasm'))),
  duke: b64(readFileSync(join(dw, 'duke.grp.gz'))),
};
const assetJs = `window.DC_ASSETS=${JSON.stringify(assets)};`;
const css = readFileSync(join(poke, 'web/pc.css'), 'utf8') + '\n' + readFileSync(join(root, 'web/dc.css'), 'utf8');
const html = readFileSync(join(root, 'web/index.html'), 'utf8')
  .replace('/*STYLE*/', () => css)
  .replace('/*ASSETS*/', () => assetJs)
  .replace('/*SCRIPT*/', () => script);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`dist/index.html ${mb(html.length)} (duke ${mb(assets.duke.length)}, con ${mb(assets.con.length)}, mcgen ${mb(assets.mc.length)}, data ${mb(assets.data.length)}, script ${mb(script.length)})`);
