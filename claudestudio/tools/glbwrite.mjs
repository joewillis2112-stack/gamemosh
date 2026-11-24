// A minimal glTF 2.0 binary (.glb) writer: nodes (name, translation, rotation, children, an optional
// mesh of positions, normals, UVs and triangles) under one scene, one material. Used by tools/r15.mjs
// and tools/body.mjs.
import fs from 'node:fs';

/** nodes: [{ name, translation, rotation, children: [index], extras, mesh: { positions, normals, uvs, indices } }];
 *  roots: indices of the scene's top nodes; color: the material's base colour. */
export function writeGlb(file, nodes, roots, { color = [0.64, 0.64, 0.65, 1], roughness = 0.8 } = {}) {
  const gNodes = [], meshes = [], accessors = [], views = [], chunks = [];
  let off = 0;
  const view = (arr, target) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target });
    chunks.push(b); off += b.length;
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    return views.length - 1;
  };
  const acc = (arr, type, comp, count, extra = {}) => { accessors.push({ bufferView: view(arr, comp === 5125 ? 34963 : 34962), componentType: comp, count, type, ...extra }); return accessors.length - 1; };
  for (const n of nodes) {
    const g = { name: n.name, translation: n.translation, rotation: n.rotation };
    if (n.children && n.children.length) g.children = n.children;
    if (n.extras) g.extras = n.extras;
    const m = n.mesh;
    if (m && m.indices.length) {
      const min = [0, 1, 2].map(k => { let v = Infinity; for (let i = k; i < m.positions.length; i += 3) v = Math.min(v, m.positions[i]); return v; });
      const max = [0, 1, 2].map(k => { let v = -Infinity; for (let i = k; i < m.positions.length; i += 3) v = Math.max(v, m.positions[i]); return v; });
      meshes.push({ name: n.name, primitives: [{ attributes: {
        POSITION: acc(new Float32Array(m.positions), 'VEC3', 5126, m.positions.length / 3, { min, max }),
        NORMAL: acc(new Float32Array(m.normals), 'VEC3', 5126, m.normals.length / 3),
        TEXCOORD_0: acc(new Float32Array(m.uvs), 'VEC2', 5126, m.uvs.length / 2),
      }, indices: acc(new Uint32Array(m.indices), 'SCALAR', 5125, m.indices.length), material: 0 }] });
      g.mesh = meshes.length - 1;
    }
    gNodes.push(g);
  }
  const gltf = { asset: { version: '2.0', generator: 'claudestudio tools/glbwrite.mjs' }, scene: 0, scenes: [{ nodes: roots }], nodes: gNodes, meshes, accessors, bufferViews: views, buffers: [{ byteLength: off }], materials: [{ name: 'body', pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: roughness } }] };
  let js = Buffer.from(JSON.stringify(gltf)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(chunks), hdr = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  hdr.write('glTF'); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
  fs.writeFileSync(file, Buffer.concat([hdr, jh, js, bh, bin]));
}
