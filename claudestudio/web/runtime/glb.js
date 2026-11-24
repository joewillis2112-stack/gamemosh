// Minimal glTF binary reader and writer (browser and Node). parseGlb: each mesh node's triangles
// as [x,y,z,u,v] x3 in the mesh's own space, its bounds and the node's scale, read straight from the
// file (no engine conversions). glbBytes: nodes (name, translation, rotation, children, extras, a mesh)
// under one scene, one material, as a .glb's bytes (tools/glbwrite.mjs writes them to a file; the play
// page loads a generated body from them: runtime/bodygen.js bodyGlb).
export function parseGlb(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const binOff = 20 + jl + 8;
  const acc = i => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    const get = { 5126: o => dv.getFloat32(o, true), 5125: o => dv.getUint32(o, true), 5123: o => dv.getUint16(o, true), 5121: o => dv.getUint8(o) }[a.componentType];
    const stride = bv.byteStride || n * size, off = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Array(a.count);
    for (let k = 0; k < a.count; k++) { const v = new Array(n); for (let c = 0; c < n; c++) v[c] = get(off + k * stride + c * size); out[k] = v; }
    return out;
  };
  const meshes = {};
  for (const node of j.nodes) {
    if (node.mesh === undefined) continue;
    const tris = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of j.meshes[node.mesh].primitives) {
      const P = acc(p.attributes.POSITION), U = acc(p.attributes.TEXCOORD_0), I = acc(p.indices).map(v => v[0]);
      for (const v of P) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
      for (const i of I) tris.push(...P[i], ...U[i]);
    }
    meshes[node.name] = { tris: Float32Array.from(tris), min, max, scale: node.scale || [1, 1, 1] };
  }
  return { meshes, image: j.images && j.images[0] && j.images[0].uri };
}

const enc = new TextEncoder();

/** nodes: [{ name, translation, rotation, children: [index], extras, mesh: { positions, normals, uvs, indices } }];
 *  roots: indices of the scene's top nodes. Returns the .glb's bytes. */
export function glbBytes(nodes, roots, { color = [0.64, 0.64, 0.65, 1], roughness = 0.8 } = {}) {
  const gNodes = [], meshes = [], accessors = [], views = [], chunks = [];
  let off = 0;
  const view = (arr, target) => {
    const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target });
    chunks.push(b); off += b.length;
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; }
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
  const gltf = { asset: { version: '2.0', generator: 'claudestudio glb.js' }, scene: 0, scenes: [{ nodes: roots }], nodes: gNodes, meshes, accessors, bufferViews: views, buffers: [{ byteLength: off }], materials: [{ name: 'body', pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: roughness } }] };
  let js = enc.encode(JSON.stringify(gltf));
  const jpad = (4 - js.length % 4) % 4;
  const out = new Uint8Array(12 + 8 + js.length + jpad + 8 + off), dv = new DataView(out.buffer);
  out.set(enc.encode('glTF'), 0); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length + jpad, true); out.set(enc.encode('JSON'), 16); out.set(js, 20); out.fill(0x20, 20 + js.length, 20 + js.length + jpad);
  let o = 20 + js.length + jpad;
  dv.setUint32(o, off, true); out.set(enc.encode('BIN\0'), o + 4); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
