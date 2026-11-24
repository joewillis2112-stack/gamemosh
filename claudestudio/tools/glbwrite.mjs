// A .glb file from nodes: web/runtime/glb.js's bytes (shared with the browser) written to `file`.
// Used by tools/r15.mjs and tools/body.mjs.
import fs from 'node:fs';
import { glbBytes } from '../web/runtime/glb.js';

/** nodes: [{ name, translation, rotation, children: [index], extras, mesh: { positions, normals, uvs, indices } }];
 *  roots: indices of the scene's top nodes. */
export function writeGlb(file, nodes, roots, opts = {}) { fs.writeFileSync(file, glbBytes(nodes, roots, opts)); }
