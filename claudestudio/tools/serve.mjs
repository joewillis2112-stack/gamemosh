// A static server for the studio folder (tests and local play).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm', '.luau': 'text/plain', '.json': 'application/json', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2' };
export function serve(root = path.resolve('.')) {
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  return { port: server.address().port, close: () => server.close() };
}
if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) { const s = serve(); console.log(`http://127.0.0.1:${s.port}/web/play.html`); }
