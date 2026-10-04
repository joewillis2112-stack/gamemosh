// Asks the built world generator for its block and biome names (registry
// order: the ids mcgen.wasm reports) for the asset builder.
// Usage: node tools/names.mjs <work-dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.argv[2];
const { instance } = await WebAssembly.instantiate(readFileSync(join(work, 'mcgen.wasm')), {});
const ex = instance.exports;
const text = (k) => Buffer.from(ex.memory.buffer, ex.mc_text(k), ex.mc_text_len()).toString();
const data = readFileSync(join(work, 'mcdata.bin'));
const p = ex.mc_alloc(data.length);
new Uint8Array(ex.memory.buffer, p, data.length).set(data);
if (ex.mc_init(p, data.length, 0, 0)) throw new Error(text(2));
const blocks = JSON.parse(text(0).replace(/'/g, '"'));
const biomes = JSON.parse(text(1).replace(/'/g, '"'));
writeFileSync(join(work, 'blocks.json'), JSON.stringify(blocks));
writeFileSync(join(work, 'biomes.json'), JSON.stringify(biomes));
console.log(`${blocks.length} blocks, ${biomes.length} biomes`);
