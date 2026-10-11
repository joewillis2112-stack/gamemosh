# Stage 2: bring a generated mesh to a phone budget. Taubin smoothing first
# (takes out marching-cubes terraces without shrinking), then quadric
# decimation; vertex colours are carried over from the nearest original vertex.
# Usage: budget.py IN.glb OUT.glb [triangles=12000] [smooth_iterations=10]
import sys, numpy as np, trimesh, fast_simplification
from scipy.spatial import cKDTree

src, dst = sys.argv[1], sys.argv[2]
target = int(sys.argv[3]) if len(sys.argv) > 3 else 12000
iters = int(sys.argv[4]) if len(sys.argv) > 4 else 10
m = trimesh.load(src, force='mesh')
colors = m.visual.vertex_colors.copy() if m.visual.kind == 'vertex' else None
orig = m.vertices.copy()
if iters: trimesh.smoothing.filter_taubin(m, iterations=iters)
v, f = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32), target_count=target)
out = trimesh.Trimesh(v, f, process=False)
if colors is not None:
    _, near = cKDTree(m.vertices).query(v)
    out.visual = trimesh.visual.ColorVisuals(out, vertex_colors=colors[near])
# Keep the contract: feet at 0 (smoothing can lift the soles a hair).
out.vertices[:, 1] -= out.vertices[:, 1].min()
out.export(dst)
print('saved', dst, len(out.vertices), 'verts', len(out.faces), 'faces; volume', round(out.volume, 5), '(positive = faces point out)')
