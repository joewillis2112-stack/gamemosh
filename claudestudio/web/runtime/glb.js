// Minimal glTF binary reader (browser and Node): each mesh node's triangles
// as [x,y,z,u,v] x3 in the mesh's own space, its bounds and the node's scale,
// read straight from the file (no engine conversions).
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
