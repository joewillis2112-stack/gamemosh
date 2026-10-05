// Bundles Pokécraft into one self-contained HTML file: the page script and
// the world worker (esbuild IIFEs), both wasm modules gzipped, Minecraft's
// worldgen data, the block textures and the Pokémon pictures, base64-inlined.
// Usage: node tools/bundle.mjs <work-dir>   (holds pk/, mcgen.wasm, mcdata.bin, assets/)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(process.argv[2] || join(root, '.work'));

// The world worker is its own script, embedded as text and started from a blob.
const workerBuild = await build({
  entryPoints: [join(root, 'web/worker.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  logLevel: 'warning',
});
const workerSrc = workerBuild.outputFiles[0].text;

const result = await build({
  entryPoints: [join(root, 'web/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  alias: { 'pokered-runner': join(work, 'pk/pokered_runner_web.js') },
  // The wasm-bindgen glue only reads import.meta.url when no module is passed in.
  define: { 'import.meta.url': '"about:blank"', __WORKER_SRC__: JSON.stringify(workerSrc) },
  logLevel: 'warning',
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const b64 = (buf) => Buffer.from(buf).toString('base64');
const gz = (p) => gzipSync(readFileSync(p), { level: 9 });
const assets = {
  pk: b64(gz(join(work, 'pk/pokered_runner_web_bg.wasm'))),
  mc: b64(gz(join(work, 'mcgen.wasm'))),
  data: b64(readFileSync(join(work, 'mcdata.bin'))), // already gzipped; mcgen unpacks it
  atlas: b64(readFileSync(join(work, 'assets/blocks.png'))),
  mons: b64(readFileSync(join(work, 'assets/mons.png'))),
  world: JSON.parse(readFileSync(join(work, 'assets/world.json'), 'utf8')),
};
const assetJs = `window.PC_ASSETS=${JSON.stringify(assets)};`;

const html = readFileSync(join(root, 'web/index.html'), 'utf8')
  .replace('/*STYLE*/', () => readFileSync(join(root, 'web/pc.css'), 'utf8'))
  .replace('/*ASSETS*/', () => assetJs)
  .replace('/*SCRIPT*/', () => script);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);

// claude.ai artifact version: a fragment (the host adds the document, the
// viewport meta and safe-area padding on :root), so the app fills 100% height.
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>')).replace(/<meta[^>]*>\s*/g, '');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const fit = '<style>html,body{height:100%}#app{height:100%;padding-top:0;padding-bottom:0}</style>';
writeFileSync(join(root, 'dist/artifact.html'), head.trim() + '\n' + fit + '\n' + body.trim() + '\n');
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`dist/index.html ${mb(html.length)} (pokered ${mb(assets.pk.length)}, mcgen ${mb(assets.mc.length)}, data ${mb(assets.data.length)}, art ${mb(assets.atlas.length + assets.mons.length)}, script ${mb(script.length)})`);
