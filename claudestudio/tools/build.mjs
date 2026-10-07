// Bundle the browser entry points with esbuild into build/web/.
import { build } from 'esbuild';
import fs from 'node:fs';
const entries = process.argv.slice(2).length ? process.argv.slice(2) : ['web/turntable.js', 'web/play.js'];
await build({ entryPoints: entries, bundle: true, format: 'esm', outdir: 'build/web', sourcemap: false, minify: false, external: ['node:*'], ignoreAnnotations: true, logLevel: 'warning', target: 'es2020' });
fs.copyFileSync('node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm', 'build/web/HavokPhysics.wasm');
console.log('built', entries.join(' '));
