# Close-up orthographic views of a mesh in the stage-2 contract (Y up, facing
# +Z): front, its left side, back, top, with vertex or texture colour times a
# fixed lambert light (textures sampled per pixel).
# Usage: view.py MESH.glb OUT.png [size] [--crop y0 y1]
import sys, numpy as np, trimesh
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 384
# --crop y0 y1: show only that band of the height (0 = feet, 1 = top), e.g. 0.8 1 for the head.
crop = [float(x) for x in sys.argv[sys.argv.index('--crop') + 1:][:2]] if '--crop' in sys.argv else None
TEX = None
scene = trimesh.load(src)
# One mesh per file here (generator output, or a rigged body in bind pose).
mesh = list(scene.geometry.values())[0] if isinstance(scene, trimesh.Scene) else scene
V, F = mesh.vertices, mesh.faces
vis = mesh.visual
if vis.kind == 'texture' and 'color' in getattr(vis, 'vertex_attributes', {}):
    C = vis.vertex_attributes['color'][:, :3].astype(float)  # COLOR_0 beside an untextured material (rigged files)
    C = C / 255.0 if C.max() > 1 else C ** (1 / 2.2)            # stored linear: show as sRGB
elif vis.kind == 'texture':
    C = vis.to_color().vertex_colors[:, :3] / 255.0
    # Sampled per pixel below when there's a texture: per vertex blurs a face away.
    mat = vis.material
    T = getattr(mat, 'baseColorTexture', None) or getattr(mat, 'image', None)
    if T is not None and vis.uv is not None:
        TEX = np.asarray(T.convert('RGB'), float) / 255.0; UV = vis.uv
else:
    C = vis.vertex_colors[:, :3] / 255.0
FN = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
FN /= np.linalg.norm(FN, axis=1, keepdims=True) + 1e-12
L = np.array([0.4, 0.7, 0.6]); L /= np.linalg.norm(L)

# view: (right, up, toward viewer) axes in model space
views = {'front': ([1, 0, 0], [0, 1, 0], [0, 0, 1]), 'left side': ([0, 0, -1], [0, 1, 0], [1, 0, 0]),
         'back': ([-1, 0, 0], [0, 1, 0], [0, 0, -1]), 'top': ([1, 0, 0], [0, 0, -1], [0, 1, 0])}
lo, hi = V.min(0), V.max(0)
if crop:
    y0c, y1c = lo[1] + crop[0] * (hi[1] - lo[1]), lo[1] + crop[1] * (hi[1] - lo[1])
    keep = (V[F][:, :, 1] >= y0c).any(1) & (V[F][:, :, 1] <= y1c).any(1)
    F = F[keep]; FN = FN[keep]
    lo, hi = V[np.unique(F)].min(0), V[np.unique(F)].max(0)
ext = (hi - lo).max() * 1.08; mid = (lo + hi) / 2
tiles = []
for name, (r, u, f) in views.items():
    R = np.array([r, u, f], float)
    P = (V - mid) @ R.T
    px = (P[:, 0] / ext + 0.5) * S; py = (0.5 - P[:, 1] / ext) * S; pz = P[:, 2]
    img = np.ones((S, S, 3)) * 0.85; zb = np.full((S, S), -np.inf)
    shade = 0.35 + 0.65 * np.clip(FN @ L, 0, 1)
    for t in np.argsort(pz[F].mean(1)):  # painter's order + z-buffer per pixel
        a, b, c = F[t]
        if (FN[t] @ np.array(f, float)) <= 0: continue  # back-facing
        xs, ys = px[[a, b, c]], py[[a, b, c]]
        x0, x1 = int(max(0, xs.min())), int(min(S - 1, xs.max()) + 1)
        y0, y1 = int(max(0, ys.min())), int(min(S - 1, ys.max()) + 1)
        if x1 <= x0 or y1 <= y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-12: continue
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
        w2 = 1 - w0 - w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        z = w0 * pz[a] + w1 * pz[b] + w2 * pz[c]
        sub = zb[y0:y1, x0:x1]; m &= z > sub
        if TEX is not None:
            uv = w0[..., None] * UV[a] + w1[..., None] * UV[b] + w2[..., None] * UV[c]
            th, tw = TEX.shape[:2]
            col = TEX[np.clip(((1 - uv[..., 1]) * th).astype(int), 0, th - 1), np.clip((uv[..., 0] * tw).astype(int), 0, tw - 1)] * shade[t]
        else:
            col = (w0[..., None] * C[a] + w1[..., None] * C[b] + w2[..., None] * C[c]) * shade[t]
        sub[m] = z[m]; img[y0:y1, x0:x1][m] = col[m]
    tiles.append(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)))
sheet = Image.new('RGB', (S * len(tiles), S))
for i, t in enumerate(tiles): sheet.paste(t, (i * S, 0))
sheet.save(dst); print('saved', dst)
