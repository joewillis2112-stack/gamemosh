// Bundles the game into single self-contained HTML files (no server, no installs).
//   dist/index.html      full document: open directly or host anywhere (GitHub Pages, itch.io)
//   dist/artifact.html   same content without <html>/<head>/<body> wrappers, for hosts that add them
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const minify = !process.argv.includes('--dev');
const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify,
  target: ['es2020', 'safari15'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/style.css', 'utf8');
const tpl = await readFile('src/index.html', 'utf8');
const body = tpl.replace('/*STYLE*/', () => css).replace('/*SCRIPT*/', () => js);

await mkdir('dist', { recursive: true });
await writeFile('dist/artifact.html', body);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${body.replace('</style>', '</style>\n</head>\n<body>')}\n</body>\n</html>\n`;
await writeFile('dist/index.html', full);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`built dist/index.html (${kb(full.length)}), dist/artifact.html`);
