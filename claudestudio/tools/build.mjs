// Bundle the browser entry points with esbuild into build/web/.
import { build } from 'esbuild';
const entries = process.argv.slice(2).length ? process.argv.slice(2) : ['web/turntable.js'];
await build({ entryPoints: entries, bundle: true, format: 'esm', outdir: 'build/web', sourcemap: false, minify: false, logLevel: 'warning', target: 'es2020' });
console.log('built', entries.join(' '));
