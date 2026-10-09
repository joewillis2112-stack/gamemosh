#!/usr/bin/env python3
"""Write assets/models/TestSphere.glb: a closed UV sphere (radius 0.5 m) with
normals, for tests that need a mesh whose volume isn't its box's. Prints the
exact polyhedron volume as a fraction of its bounding box (what a MeshPart's
mass should use). Ours, CC0."""
import json, math, struct, sys

SEG, RINGS, R = 32, 16, 0.5
pos, nrm, idx = [], [], []
for i in range(RINGS + 1):
    th = math.pi * i / RINGS
    for j in range(SEG + 1):
        ph = 2 * math.pi * j / SEG
        n = (math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph))
        nrm.append(n); pos.append(tuple(R * c for c in n))
for i in range(RINGS):
    for j in range(SEG):
        a, b = i * (SEG + 1) + j, (i + 1) * (SEG + 1) + j
        # counter-clockwise seen from outside (glTF front faces)
        if i != 0: idx += [a, a + 1, b]
        if i != RINGS - 1: idx += [a + 1, b + 1, b]

vol = 0.0
for k in range(0, len(idx), 3):
    p, q, r = (pos[idx[k + m]] for m in range(3))
    vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6
lo = [min(p[a] for p in pos) for a in range(3)]; hi = [max(p[a] for p in pos) for a in range(3)]
box = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2])

pb = b''.join(struct.pack('<3f', *p) for p in pos)
nb = b''.join(struct.pack('<3f', *n) for n in nrm)
ib = b''.join(struct.pack('<H', i) for i in idx)
bin_ = pb + nb + ib
gltf = {
    'asset': {'version': '2.0', 'generator': 'claudestudio tools/make-test-sphere.py'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'Sphere'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
    'materials': [{'name': 'Matte', 'pbrMetallicRoughness': {'baseColorFactor': [0.8, 0.35, 0.2, 1], 'metallicFactor': 0, 'roughnessFactor': 0.6}}],
    'buffers': [{'byteLength': len(bin_)}],
    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(pb), 'target': 34962},
                    {'buffer': 0, 'byteOffset': len(pb), 'byteLength': len(nb), 'target': 34962},
                    {'buffer': 0, 'byteOffset': len(pb) + len(nb), 'byteLength': len(ib), 'target': 34963}],
    'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': lo, 'max': hi},
                  {'bufferView': 1, 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'},
                  {'bufferView': 2, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'}],
}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4); bin_ += b'\0' * (-len(bin_) % 4)
out = sys.argv[1] if len(sys.argv) > 1 else 'assets/models/TestSphere.glb'
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
    f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)
print(f'{out}: volume / box = {vol / box:.6f} (a true sphere: {math.pi / 6:.6f})')
