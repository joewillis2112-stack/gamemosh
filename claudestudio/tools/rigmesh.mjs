// Character maker, stage 2: rig a generated mesh to the blocky rig.
// node tools/rigmesh.mjs <mesh.glb> <out.glb> [--reference drawing.png] [--rig assets/characters/character-a.glb] [--parts]
// --reference: the drawing the mesh was made from; its stage-1 part boxes give the cuts.
// --parts paints each body part one flat colour (to judge the cuts).
import fs from 'node:fs';
import { readMeshGlb, rigFromKenney, fitMesh, writeRiggedGlb } from '../web/runtime/rigmesh.js';
import { findParts } from '../web/runtime/charmaker.js';
import { loadPNG } from './charmaker.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [src, dst] = args;
const rig = rigFromKenney(fs.readFileSync(opt('rig', 'assets/characters/character-a.glb')));
const mesh = readMeshGlb(fs.readFileSync(src));
const fit = fitMesh(mesh, rig, { reference: opt('reference') ? findParts(loadPNG(opt('reference'))) : null });
if (args.includes('--parts')) {
  const C = [[0.9, 0.2, 0.2], [0.2, 0.3, 0.9], [0.9, 0.9, 0.9], [0.95, 0.6, 0.1], [0.2, 0.8, 0.3], [0.8, 0.3, 0.8]]; // PARTS order
  mesh.colors = new Float64Array(fit.part.length * 3); mesh.uvs = null;
  fit.part.forEach((k, v) => mesh.colors.set(C[k], v * 3));
}
fs.writeFileSync(dst, writeRiggedGlb(rig, mesh, fit));
const r = v => v.map(x => +x.toFixed(3));
console.log(JSON.stringify({ vertices: fit.positions.length / 3, triangles: mesh.indices.length / 3, found: fit.found, cuts: Object.fromEntries(Object.entries(fit.cuts).map(([k, v]) => [k, +v.toFixed(3)])),
  joints: Object.fromEntries(Object.entries(fit.joints).map(([k, v]) => [k, { mesh: r(v), rig: r(rig.joints[k].pos) }])) }, null, 1));
