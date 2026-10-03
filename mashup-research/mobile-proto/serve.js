const http=require('http'),fs=require('fs'),path=require('path');
const [root,port]=[process.argv[2],+process.argv[3]];
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);
fs.readFile(f,(e,d)=>{r.setHeader('Cross-Origin-Opener-Policy','same-origin');r.setHeader('Cross-Origin-Embedder-Policy','require-corp');r.setHeader('Cross-Origin-Resource-Policy','same-origin');
if(e){r.statusCode=404;return r.end('nf');}r.setHeader('Content-Type',T[path.extname(f)]||'application/octet-stream');r.end(d);});}).listen(port,()=>console.log('serving',root,port));
