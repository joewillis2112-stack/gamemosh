# Stage 2: texture an untextured generated mesh from the front image it was
# made from, on CPU. For when the Space's own texturing is unavailable.
#   - front faces the camera sees: the image, projected straight on;
#   - everything else (back, under the chin, between the legs): the colour of
#     the nearest seen point along the surface, i.e. the rim, as stage 1 paints
#     the backs (a head's back takes the hair at its sides, never the face).
# Then decimated to a phone budget. Output: the mesh contract, with uvs and the
# image as base colour (rigmesh carries both).
# Usage: paint_cpu.py SHAPE.glb CUTOUT.png OUT.glb [triangles=20000] [--turn]
#   --turn: the mesh faces -Z (Hunyuan3D-2's face +Z, the contract's way).
#   CUTOUT.png: the front image with the background transparent (rembg).
import sys, numpy as np, trimesh, fast_simplification
from PIL import Image, ImageFilter
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.ndimage import distance_transform_edt

args = [a for a in sys.argv[1:] if not a.startswith('--')]
src, cut, dst = args[:3]
target = int(args[3]) if len(args) > 3 else 20000

m = trimesh.load(src, force='mesh')
# Hunyuan3D-2 leaves a third of its faces degenerate; they break decimation.
m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices(); m.merge_vertices()
v, f = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32), target_count=target)
m = trimesh.Trimesh(v.astype(np.float64), f, process=True)
m.fix_normals()

# Contract: Y up, facing +Z (Hunyuan3D-2's own axes). The front must be known
# before painting; rigmesh's orientation search checks it again afterwards.
V = m.vertices.copy()
if '--turn' in sys.argv: V = V * [-1, 1, -1]  # 180 degrees about Y, not a mirror
V[:, 1] -= V[:, 1].min()
V[:, [0, 2]] -= (V[:, [0, 2]].min(0) + V[:, [0, 2]].max(0)) / 2
m.vertices = V

# The image's subject box onto the mesh's front view (uniform scale by height).
img = np.array(Image.open(cut).convert('RGBA'))
H, W = img.shape[:2]
alpha = img[..., 3] > 128
ys, xs = np.nonzero(alpha)
bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
# The image's subject box onto the mesh's front view: uniform scale by height,
# centred. (Refining it by silhouette overlap was tried: the overlap rose 0.90
# -> 0.92 but the head moved 20 px, as the cutout's floor shadow pulls the fit.)
def raster(px, z):
    """Depth buffer of the front view: per pixel, the largest z (-inf: empty)."""
    depth = np.full((H, W), -np.inf)
    for tri in m.faces:
        p = px[tri]; zt = z[tri]
        c0, r0 = np.floor(p.min(0)).astype(int); c1, r1 = np.ceil(p.max(0)).astype(int)
        c0, r0 = max(c0, 0), max(r0, 0); c1, r1 = min(c1, W - 1), min(r1, H - 1)
        if c1 < c0 or r1 < r0: continue
        cc, rr = np.meshgrid(np.arange(c0, c1 + 1) + 0.5, np.arange(r0, r1 + 1) + 0.5)
        (ax, ay), (bx, by), (qx, qy) = p
        d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
        if abs(d) < 1e-12: continue
        l0 = ((by - qy) * (cc - qx) + (qx - bx) * (rr - qy)) / d
        l1 = ((qy - ay) * (cc - qx) + (ax - qx) * (rr - qy)) / d
        l2 = 1 - l0 - l1
        blk = depth[r0:r1 + 1, c0:c1 + 1]
        np.maximum(blk, np.where((l0 >= 0) & (l1 >= 0) & (l2 >= 0), l0 * zt[0] + l1 * zt[1] + l2 * zt[2], -np.inf), out=blk)
    return depth

s0 = (by1 - by0) / np.ptp(V[:, 1])
px = np.stack([(bx0 + bx1) / 2 + V[:, 0] * s0, by1 - V[:, 1] * s0], 1)
depth = raster(px, V[:, 2])

N = m.vertex_normals
ci = np.clip(px[:, 0].astype(int), 0, W - 1); ri = np.clip(px[:, 1].astype(int), 0, H - 1)
eps = 0.01 * np.ptp(V[:, 1])
seen = (V[:, 2] >= depth[ri, ci] - eps) & (N[:, 2] > 0.05)
print(f'{seen.mean():.0%} of vertices seen from the front')

# Hidden vertices take the pixel of the nearest seen vertex measured along the
# surface (so the back of a hip reaches the trousers' side, never the hand
# hanging beside it).
E = m.edges_unique
G = coo_matrix((m.edges_unique_length, (E[:, 0], E[:, 1])), shape=(len(V),) * 2).tocsr()
_, _, src_of = dijkstra(G, directed=False, indices=np.nonzero(seen)[0], min_only=True, return_predecessors=True)
src_of = np.where(src_of < 0, np.arange(len(V)), src_of)  # islands with nothing seen keep their own
F = m.faces
front = seen[F].all(1) & (m.face_normals[:, 2] > 0.05)
# Hidden areas sample from inside the silhouette (12 px in): a photo's edge
# pixels are shaded dark by its lighting.
inset = distance_transform_edt(alpha) >= 12
_, (iri, ici) = distance_transform_edt(~inset, return_indices=True)
def inward(P):
    c_ = np.clip(P[..., 0].astype(int), 0, W - 1); r_ = np.clip(P[..., 1].astype(int), 0, H - 1)
    return np.stack([ici[r_, c_], iri[r_, c_]], -1).astype(float) + 0.5
hid = inward(px[src_of])
# The back of the head is hair: above the neck (the narrowest row between 8%
# and 25% of the height, as stage 1 finds it), a hidden vertex takes the hair
# at the top of its own column.
h_ = by1 - by0
rows = np.arange(by0 + int(0.08 * h_), by0 + int(0.25 * h_))
neck = rows[np.argmin(alpha[rows].sum(1))]
head_cols = np.nonzero(alpha[by0:neck].any(0))[0]
top = np.array([np.argmax(alpha[:, c]) if alpha[:, c].any() else by0 for c in range(W)])
# The crown's middle 40%: at the sides the hair is thin and the forehead shows.
hc = (head_cols.min() + head_cols.max()) / 2
hcol = np.clip(hc + (px[:, 0] - hc) * 0.4, 0, W - 1).astype(int)
head_back = ~seen & (px[:, 1] < neck)
hid[head_back] = np.stack([hcol[head_back], top[hcol[head_back]] + 0.015 * h_], 1)
print(f'neck at row {neck}; {head_back.sum()} hidden head vertices take the hair')
uvpx = np.where(seen[F][..., None], px[F], hid[F])
# A hidden face whose corners land far apart in the image (the middle of the
# back, between the left and right sides) takes one corner's colour.
spread = np.ptp(uvpx, axis=1).max(1)
flat = ~front & (spread > 0.03 * H)
uvpx[flat] = uvpx[flat][:, :1]
print(f'{flat.sum()} hidden faces flattened to one colour')

# The texture: the image cropped to the subject, every transparent pixel filled
# with the nearest opaque colour (no background bleeds in at the edges, or
# through filtering). Pixels inside the edge's 2 px fringe are pulled in too.
core = distance_transform_edt(alpha) > 2
_, (ri2, ci2) = distance_transform_edt(~core, return_indices=True)
rgb = img[..., :3][ri2, ci2]
pad = 8
X0, Y0 = max(bx0 - pad, 0), max(by0 - pad, 0); X1, Y1 = min(bx1 + pad, W), min(by1 + pad, H)
# Left half: the photo. Right half: the photo blurred, for the hidden faces, so
# what they borrow is the cloth's colour, not its folds and shading.
crop_ = rgb[Y0:Y1, X0:X1]
blur = np.asarray(Image.fromarray(crop_).filter(ImageFilter.GaussianBlur(10)))
tex = Image.fromarray(np.concatenate([crop_, blur], 1))
TW, TH = X1 - X0, Y1 - Y0
cu = np.clip((uvpx[..., 0] - X0) / TW, 0.5 / TW, 1 - 0.5 / TW)
cv = np.clip((uvpx[..., 1] - Y0) / TH, 0.5 / TH, 1 - 0.5 / TH)  # never wrap or cross halves
cu = (cu + np.where(front, 0, 1)[:, None]) / 2
uv = np.stack([cu, cv], -1).reshape(-1, 2)

# Built unwelded (each face its own corners), then welded wherever the corners
# share a uv too, so seams split only where front meets back.
out = trimesh.Trimesh(V[F].reshape(-1, 3), np.arange(len(F) * 3).reshape(-1, 3), process=False)
# glTF's uv origin is the top left, trimesh flips v on export.
out.visual = trimesh.visual.TextureVisuals(uv=np.stack([uv[:, 0], 1 - uv[:, 1]], 1),
    material=trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0, roughnessFactor=1))
out.merge_vertices(merge_tex=False, merge_norm=True)
out.export(dst)
print('saved', dst, len(F), 'faces,', f'{front.mean():.0%} projected; texture {tex.size}; volume {m.volume:.4f} (positive = faces point out)')
