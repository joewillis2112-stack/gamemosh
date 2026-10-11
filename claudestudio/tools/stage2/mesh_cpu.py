# Stage 2, image to mesh (CPU route): TripoSR on a character with alpha.
# Output follows the mesh contract below.
# Usage: mesh_cpu.py IN.png OUT.glb [resolution]
# Needs .cache/TripoSR (code) and tools/stage2/shim on PYTHONPATH.
import sys, numpy as np, torch, trimesh
from PIL import Image
from tsr.system import TSR

src, dst = sys.argv[1], sys.argv[2]
res = int(sys.argv[3]) if len(sys.argv) > 3 else 192
torch.set_num_threads(4)
model = TSR.from_pretrained('stabilityai/TripoSR', config_name='config.yaml', weight_name='model.ckpt')
model.renderer.set_chunk_size(8192)

# Subject on grey, centred, filling 85% of the frame (TripoSR's preprocessing).
img = Image.open(src).convert('RGBA')
a = np.array(img); ys, xs = np.nonzero(a[..., 3] > 16)
img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
side = int(max(img.size) / 0.85)
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
rgba = np.array(canvas).astype(np.float32) / 255
rgb = rgba[..., :3] * rgba[..., 3:] + 0.5 * (1 - rgba[..., 3:])
image = Image.fromarray((rgb * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS)

with torch.no_grad():
    codes = model([image], device='cpu')
    mesh = model.extract_mesh(codes, True, resolution=res)[0]
# The studio's mesh contract (tools/stage2/README.md): Y up, facing +Z, feet
# at y = 0, centred on x and z. TripoSR's is Z up, facing +X: a proper rotation
# (x, y, z) -> (y, z, x), so nothing is mirrored.
v = mesh.vertices[:, [1, 2, 0]]
v[:, 1] -= v[:, 1].min()
v[:, [0, 2]] -= (v[:, [0, 2]].min(0) + v[:, [0, 2]].max(0)) / 2
mesh.vertices = v
mesh.export(dst)
print('saved', dst, len(mesh.vertices), 'verts', len(mesh.faces), 'faces')
