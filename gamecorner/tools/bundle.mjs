// Bundles Game Corner Arcade into one self-contained HTML file:
// page script (esbuild IIFE), both wasm modules and the carts, base64-inlined.
// Usage: node tools/bundle.mjs <work-dir>   (work-dir holds pk/ and pico_r.wasm)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(process.argv[2] || join(root, '.work'));

const result = await build({
  entryPoints: [join(root, 'web/gc.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  alias: { 'pokered-runner': join(work, 'pk/pokered_runner_web.js') },
  // The wasm-bindgen glue only reads import.meta.url when no module is passed in.
  define: { 'import.meta.url': '"about:blank"' },
  logLevel: 'warning',
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const b64 = (p) => readFileSync(p).toString('base64');
const carts = {};
for (const f of readdirSync(join(root, 'carts'))) {
  if (f.endsWith('.p8.png')) carts[f.replace('.p8.png', '')] = b64(join(root, 'carts', f));
}
const assets = {
  pk: b64(join(work, 'pk/pokered_runner_web_bg.wasm')),
  pico: b64(join(work, 'pico_r.wasm')),
  carts,
};
const assetJs = `window.GC_ASSETS=${JSON.stringify(assets)};`;

const html = readFileSync(join(root, 'web/index.html'), 'utf8')
  .replace('/*STYLE*/', () => readFileSync(join(root, 'web/gc.css'), 'utf8'))
  .replace('/*ASSETS*/', () => assetJs)
  .replace('/*SCRIPT*/', () => script);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`dist/index.html ${mb(html.length)} (pokered ${mb(assets.pk.length)}, pico ${mb(assets.pico.length)}, ${Object.keys(carts).length} carts: ${Object.keys(carts).join(', ')})`);
