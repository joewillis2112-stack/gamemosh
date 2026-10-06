// Packs what Dukecraft uses from the shareware DUKE3D.GRP into a smaller GRP
// (same "KenSilverman" format), gzipped: the art, the palette, the CON
// scripts and the sounds the scripts play.
// Usage: node dukecraft/tools/dukepak.mjs <DUKE3D.GRP> <out.grp.gz>
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [src, out] = process.argv.slice(2);
const d = readFileSync(src);
if (d.toString('latin1', 0, 12) !== 'KenSilverman') throw new Error('not a GRP');
const n = d.readUInt32LE(12);
let off = 16 + n * 16;
const files = [];
for (let i = 0; i < n; i++) {
  const name = d.toString('latin1', 16 + i * 16, 28 + i * 16).replace(/\0.*$/, '');
  const size = d.readUInt32LE(28 + i * 16);
  files.push({ name, data: d.subarray(off, off + size) });
  off += size;
}
const keep = files.filter((f) => /\.(ART|CON|VOC)$/.test(f.name) || /^(PALETTE|LOOKUP)\.DAT$/.test(f.name));
const head = Buffer.alloc(16 + keep.length * 16);
head.write('KenSilverman', 0, 'latin1');
head.writeUInt32LE(keep.length, 12);
keep.forEach((f, i) => { head.write(f.name.padEnd(12, '\0'), 16 + i * 16, 'latin1'); head.writeUInt32LE(f.data.length, 28 + i * 16); });
const grp = Buffer.concat([head, ...keep.map((f) => f.data)]);
const gz = gzipSync(grp, { level: 9 });
writeFileSync(out, gz);
console.log(`${out}: ${keep.length} files, ${(grp.length / 1048576).toFixed(2)} MB → ${(gz.length / 1048576).toFixed(2)} MB gzipped`);
