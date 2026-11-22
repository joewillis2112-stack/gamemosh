// Layers kept in the PNG (web/paint/layerfile.js) and layer masks (web/paint/layers.js), by hand:
// pack a two-layer document with a mask into a real PNG, check it's still a valid PNG that any
// reader shows (pngjs decodes it; its CRC is checked against node:zlib), unpack it back value for value, and refuse a
// damaged chunk. Masks: flattening scales a layer's alpha by its mask.
import { PNG } from 'pngjs';
import zlib from 'node:zlib';
import { LayeredImage } from '../web/paint/layers.js';
import { image } from '../web/paint/brush.js';
import { packLayers, unpackLayers, pngChunks } from '../web/paint/layerfile.js';

const fail = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const W = 7, H = 5;
const doc = new LayeredImage(W, H);
const bg = doc.add('Background', image(W, H, [1, 0, 0, 1]));
const top = doc.add('Top', image(W, H));
for (let i = 0; i < W * H; i++) top.img.data.set([i / 40, 0.5, 1 - i / 40, (i % 5) / 4], i * 4);
doc.set(1, 'blend', 'Multiply'); doc.set(1, 'opacity', 0.75); doc.set(0, 'visible', true);
const sel = new Float32Array(W * H).map((_, i) => (i % W) < 3 ? 1 : (i % W) === 3 ? 0.5 : 0);
doc.addMask(1, sel);

// Masks in flattening: where the mask is 0 the top layer is gone; where 1 it counts in full.
const flat = doc.flatten(), px = (img, x, y) => Array.from(img.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const noMask = new LayeredImage(W, H); noMask.layers = doc.layers.map(l => ({ ...l, mask: null }));
const flatNo = noMask.flatten();
check(px(flat, 6, 1).every((v, i) => Math.abs(v - [1, 0, 0, 1][i]) < 1e-6), 'mask 0: only the Background shows');
check(px(flat, 1, 1).every((v, i) => Math.abs(v - px(flatNo, 1, 1)[i]) < 1e-6), 'mask 1: the same as no mask');
const halfAlpha = new LayeredImage(W, H); halfAlpha.layers = [bg, { ...top, mask: null, img: { ...top.img, data: top.img.data.map((v, i) => i % 4 === 3 ? v * 0.5 : v) } }];
check(px(flat, 3, 2).every((v, i) => Math.abs(v - px(halfAlpha.flatten(), 3, 2)[i]) < 1e-6), 'mask 0.5: as if the layer\'s alpha were halved');

// Pack into a real PNG of the flattened image.
const png = new PNG({ width: W, height: H }); png.data = Buffer.from(Array.from(flat.data, v => Math.round(v * 255)));
const url = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
const packed = await packLayers(url, doc), bytes = Buffer.from(packed.split(',')[1], 'base64');
const types = pngChunks(new Uint8Array(bytes)).map(c => c.type);
check(types.at(-1) === 'IEND' && types.at(-2) === 'csLy', `the layers go in a csLy chunk just before IEND (${types.join(' ')})`);
const shown = PNG.sync.read(bytes);
check(shown.width === W && Buffer.compare(shown.data, png.data) === 0, 'it is still a valid PNG of the flattened image (pngjs reads it)');
const back = await unpackLayers(packed);
const u8 = a => Array.from(a, v => Math.round(v * 255));
check(back && back.w === W && back.h === H && back.active === doc.active && back.layers.length === 2, 'it unpacks to the same document size, layer count and active layer');
check(back && back.layers.map(l => [l.name, l.blend, l.opacity, l.visible, !!l.mask].join()).join('|') === doc.layers.map(l => [l.name, l.blend, l.opacity, l.visible, !!l.mask].join()).join('|'), 'names, blend, opacity, visibility and which layer has a mask come back');
check(back && back.layers.every((l, i) => u8(l.img.data).join() === u8(doc.layers[i].img.data).join()), 'every layer\'s pixels come back to the 8-bit level');
check(back && u8(back.layers[1].mask.data).join() === u8(doc.layers[1].mask.data).join(), 'and the mask\'s');
check(await unpackLayers(url) === null, 'a PNG without the chunk has no layers (null)');
const ck = pngChunks(new Uint8Array(bytes)).find(c => c.type === 'csLy'), stored = bytes.readUInt32BE(ck.end - 4);
check(stored === zlib.crc32(Buffer.concat([Buffer.from('csLy'), Buffer.from(ck.data)])), 'its CRC is the standard one (node:zlib agrees)');
const bad = Buffer.from(bytes), at = bad.indexOf('"Top"'); bad[at + 2] = 'a'.charCodeAt(0); // "Tap": still good JSON, only the CRC knows
check(at > 0 && await unpackLayers('data:image/png;base64,' + bad.toString('base64')) === null, 'a damaged chunk (CRC wrong) is refused');

console.log(fail.length ? `FAIL (${fail.length})` : 'PASS');
process.exit(fail.length ? 1 : 0);
