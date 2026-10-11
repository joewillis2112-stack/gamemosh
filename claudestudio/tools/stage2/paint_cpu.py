# Stage 2: texture an untextured generated mesh from the photos it was made
# from, on CPU. For when the Space's own texturing is unavailable.
#   - each face a photo sees: that photo, projected straight on (of several,
#     the one it faces most squarely);
#   - everything else (under the chin, between the legs, and with the front
#     alone the back): the colour of the nearest seen point along the surface,
#     i.e. the rim, as stage 1 paints the backs; with no back photo, the back
#     of the head takes the crown's hair, never the face.
# Then decimated to a phone budget. Output: the mesh contract, with uvs and the
# photos as base colour (rigmesh carries both).
# Usage: paint_cpu.py SHAPE.glb FRONT.png OUT.glb [triangles=20000]
#          [--back B.png] [--left L.png] [--right R.png] [--turn]
#   Photos: cut out (background transparent, rembg), each straight on, the
#   whole body in frame. --left is the side of the character's left hand.
#   --turn: the mesh faces -Z (Hunyuan3D-2's face +Z, the contract's way).
import sys, numpy as np, trimesh, fast_simplification
from PIL import Image, ImageFilter
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.ndimage import distance_transform_edt

argv = sys.argv[1:]
opt = lambda k: argv[argv.index(k) + 1] if k in argv else None
named = {opt(k) for k in ('--back', '--left', '--right')} - {None}
args = [a for a in argv if not a.startswith('--') and a not in named]
src, cut, dst = args[:3]
target = int(args[3]) if len(args) > 3 else 20000

m = trimesh.load(src, force='mesh')
# Hunyuan3D-2 leaves a third of its faces degenerate; they break decimation.
m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices(); m.merge_vertices()
if len(m.faces) > target:  # already within budget: nothing to decimate
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

# Views: (name, photo, right, toward the camera) in model space; Y is up in all.
# The contract faces +Z, and its left hand is on +X.
VIEWS = [('front', cut, [1, 0, 0], [0, 0, 1])]
for k, r, c in (('back', [-1, 0, 0], [0, 0, -1]), ('left', [0, 0, -1], [1, 0, 0]), ('right', [0, 0, 1], [-1, 0, 0])):
    if opt('--' + k): VIEWS.append((k, opt('--' + k), r, c))
N = m.vertex_normals
F = m.faces
eps = 0.01 * np.ptp(V[:, 1])

def raster(px, z, H, W):
    """Depth buffer of a view: per pixel, the largest z toward its camera (-inf: empty)."""
    depth = np.full((H, W), -np.inf)
    for tri in F:
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

views = []
for name, path, r, c in VIEWS:
    img = np.array(Image.open(path).convert('RGBA'))
    H, W = img.shape[:2]
    alpha = img[..., 3] > 128
    ys, xs = np.nonzero(alpha)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # The photo's subject box onto the mesh's view: uniform scale by height,
    # centred. (Refining it by silhouette overlap was tried on the front: the
    # overlap rose 0.90 -> 0.92 but the head moved 20 px, as the cutout's floor
    # shadow pulls the fit.)
    u, z = V @ np.array(r, float), V @ np.array(c, float)
    s0 = (by1 - by0) / np.ptp(V[:, 1])
    px = np.stack([(bx0 + bx1) / 2 + (u - (u.min() + u.max()) / 2) * s0, by1 - V[:, 1] * s0], 1)
    depth = raster(px, z, H, W)
    ci = np.clip(px[:, 0].astype(int), 0, W - 1); ri = np.clip(px[:, 1].astype(int), 0, H - 1)
    facing = N @ np.array(c, float)
    seen = (z >= depth[ri, ci] - eps) & (facing > 0.05)
    # The texture: the photo cropped to the subject, every transparent pixel
    # filled with the nearest opaque colour (no background bleeds in at the
    # edges, or through filtering); the 2 px fringe is pulled in too.
    core = distance_transform_edt(alpha) > 2
    _, (ri2, ci2) = distance_transform_edt(~core, return_indices=True)
    pad = 8
    X0, Y0 = max(bx0 - pad, 0), max(by0 - pad, 0); X1, Y1 = min(bx1 + pad, W), min(by1 + pad, H)
    crop_ = img[..., :3][ri2, ci2][Y0:Y1, X0:X1]
    # Hidden areas sample 12 px inside the silhouette (a photo's edge pixels
    # are shaded dark by its lighting), from a blurred copy (the cloth's
    # colour, not its folds).
    inset = distance_transform_edt(alpha) >= 12
    _, (iri, ici) = distance_transform_edt(~inset, return_indices=True)
    views.append(dict(name=name, alpha=alpha, H=H, W=W, box=(bx0, bx1, by0, by1), px=px, seen=seen, facing=facing,
                      fn=m.face_normals @ np.array(c, float), crop=crop_, org=(X0, Y0), inset=(iri, ici)))
    print(f'{name}: {seen.mean():.0%} of vertices seen')

# Per face: the view that sees all three corners and faces it most squarely.
score = np.stack([np.where(v['seen'][F].all(1) & (v['fn'] > 0.05), v['fn'], -np.inf) for v in views], 1)
best = score.argmax(1)
proj = np.isfinite(score.max(1))
seen_any = np.any([v['seen'] for v in views], 0)
# Per vertex: the view that sees it most squarely (for the hidden ones' sources).
vbest = np.stack([np.where(v['seen'], v['facing'], -np.inf) for v in views], 1).argmax(1)

# Hidden vertices take the pixel of the nearest seen vertex measured along the
# surface (so the back of a hip reaches the trousers' side, never the hand
# hanging beside it), in that vertex's own best view.
E = m.edges_unique
G = coo_matrix((m.edges_unique_length, (E[:, 0], E[:, 1])), shape=(len(V),) * 2).tocsr()
_, _, src_of = dijkstra(G, directed=False, indices=np.nonzero(seen_any)[0], min_only=True, return_predecessors=True)
src_of = np.where(src_of < 0, np.arange(len(V)), src_of)  # islands with nothing seen keep their own
hview = vbest[src_of]
hid = np.zeros((len(V), 2))
for k, v in enumerate(views):
    sel = hview == k
    P = v['px'][src_of[sel]]
    iri, ici = v['inset']
    c_ = np.clip(P[:, 0].astype(int), 0, v['W'] - 1); r_ = np.clip(P[:, 1].astype(int), 0, v['H'] - 1)
    hid[sel] = np.stack([ici[r_, c_], iri[r_, c_]], -1).astype(float) + 0.5
if not any(v['name'] == 'back' for v in views):
    # No back photo: the back of the head is hair. Above the neck (the narrowest
    # row between 8% and 25% of the height, as stage 1 finds it), a hidden
    # vertex takes the hair at the top of its own column, in the crown's middle
    # 40% (at the sides the hair is thin and the forehead shows).
    fr = views[0]; alpha = fr['alpha']; bx0, bx1, by0, by1 = fr['box']; px = fr['px']
    h_ = by1 - by0
    rows = np.arange(by0 + int(0.08 * h_), by0 + int(0.25 * h_))
    neck = rows[np.argmin(alpha[rows].sum(1))]
    head_cols = np.nonzero(alpha[by0:neck].any(0))[0]
    top = np.array([np.argmax(alpha[:, c]) if alpha[:, c].any() else by0 for c in range(fr['W'])])
    hc = (head_cols.min() + head_cols.max()) / 2
    hcol = np.clip(hc + (px[:, 0] - hc) * 0.4, 0, fr['W'] - 1).astype(int)
    head_back = ~seen_any & (px[:, 1] < neck)
    hid[head_back] = np.stack([hcol[head_back], top[hcol[head_back]] + 0.015 * h_], 1)
    hview[head_back] = 0
    print(f'neck at row {neck}; {head_back.sum()} hidden head vertices take the hair')

# Each face's corners in its view's pixels, and which slot of the texture.
uvpx = np.zeros((len(F), 3, 2)); slot = np.zeros(len(F), int)
for k, v in enumerate(views):
    sel = proj & (best == k)
    uvpx[sel] = v['px'][F[sel]]; slot[sel] = 2 * k
hf = ~proj
# A hidden face takes its first corner's view for all three (one slot per face).
hk = hview[F[hf, 0]]
uvpx[hf] = np.where((hview[F[hf]] == hk[:, None])[..., None], hid[F[hf]], hid[F[hf, 0]][:, None])
slot[hf] = 2 * hk + 1
# A hidden face whose corners land far apart in the photo (the middle of the
# back, between the left and right sides) takes one corner's colour.
spread = np.ptp(uvpx, axis=1).max(1)
flat = hf & (spread > 0.03 * views[0]['H'])
uvpx[flat] = uvpx[flat][:, :1]
per_view = ', '.join(f"{v['name']} {np.mean(proj & (best == k)):.0%}" for k, v in enumerate(views))
print(f'{proj.mean():.0%} of faces projected ({per_view}); {flat.sum()} hidden faces flattened to one colour')

# The texture: per view, the photo and its blurred copy side by side; slots
# laid out left to right, padded to the tallest.
tiles = []
for v in views:
    tiles += [v['crop'], np.asarray(Image.fromarray(v['crop']).filter(ImageFilter.GaussianBlur(10)))]
TH = max(t.shape[0] for t in tiles)
offs = np.cumsum([0] + [t.shape[1] for t in tiles])
atlas = np.zeros((TH, offs[-1], 3), np.uint8)
for i, t in enumerate(tiles): atlas[:t.shape[0], offs[i]:offs[i] + t.shape[1]] = t
tex = Image.fromarray(atlas)
uv = np.zeros_like(uvpx)
for i, t in enumerate(tiles):
    sel = slot == i
    if not sel.any(): continue
    X0, Y0 = views[i // 2]['org']; tw, th = t.shape[1], t.shape[0]
    cu = np.clip(uvpx[sel][..., 0] - X0, 0.5, tw - 0.5)  # never wrap or cross slots
    cv = np.clip(uvpx[sel][..., 1] - Y0, 0.5, th - 0.5)
    uv[sel] = np.stack([(offs[i] + cu) / offs[-1], cv / TH], -1)
uv = uv.reshape(-1, 2)

# Built unwelded (each face its own corners), then welded wherever the corners
# share a uv too, so seams split only where views meet.
out = trimesh.Trimesh(V[F].reshape(-1, 3), np.arange(len(F) * 3).reshape(-1, 3), process=False)
# glTF's uv origin is the top left, trimesh flips v on export.
out.visual = trimesh.visual.TextureVisuals(uv=np.stack([uv[:, 0], 1 - uv[:, 1]], 1),
    material=trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0, roughnessFactor=1))
out.merge_vertices(merge_tex=False, merge_norm=True)
out.export(dst)
print('saved', dst, len(F), 'faces; texture', tex.size, f'; volume {m.volume:.4f} (positive = faces point out)')
