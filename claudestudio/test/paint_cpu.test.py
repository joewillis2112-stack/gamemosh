# Stage 2's CPU texturer (tools/stage2/paint_cpu.py) with several photos: a box
# 0.8 x 2 x 0.6 and four flat "photos" of it, each half one colour, so every
# face must come out in its own view's colour, on the correct side (left and
# right are easy to mirror). Run: .cache/hf-venv/bin/python -I claudestudio/test/paint_cpu.test.py
import os, subprocess, sys, tempfile, numpy as np, trimesh
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
tool = os.path.join(here, '..', 'tools', 'stage2', 'paint_cpu.py')
d = tempfile.mkdtemp()
W_, H_, D_ = 0.8, 2.0, 0.6
box = trimesh.creation.box((W_, H_, D_)).subdivide().subdivide().subdivide()
box.vertices[:, 1] += H_ / 2
box.export(f'{d}/box.glb')

PX = 400  # pixels per unit
def photo(name, width, left, right):
    """A cut-out photo: the box's silhouette (width x 2), image-left half one colour, image-right the other."""
    w, h = int(width * PX), int(H_ * PX)
    im = np.zeros((h + 200, w + 200, 4), np.uint8)
    im[100:100 + h, 100:100 + w // 2] = left + [255]
    im[100:100 + h, 100 + w // 2:100 + w] = right + [255]
    Image.fromarray(im).save(f'{d}/{name}.png')
R, G, B, Y, M, C = [230, 30, 30], [30, 200, 30], [30, 30, 230], [230, 230, 30], [200, 30, 200], [30, 200, 200]
# From the front, image-left is the character's right (-X). From behind, it's their left (+X).
photo('front', W_, R, G)      # front: -X red, +X green
photo('back', W_, Y, B)       # back: +X yellow, -X blue
photo('left', D_, M, M)       # from +X: magenta
photo('right', D_, C, C)      # from -X: cyan
r = subprocess.run([sys.executable, '-I', tool, f'{d}/box.glb', f'{d}/front.png', f'{d}/out.glb', '20000',
                    '--back', f'{d}/back.png', '--left', f'{d}/left.png', '--right', f'{d}/right.png'], capture_output=True, text=True)
print(r.stdout.strip())
if r.returncode: print(r.stderr); sys.exit(1)

m = trimesh.load(f'{d}/out.glb', force='mesh')
tex = np.asarray(m.visual.material.baseColorTexture.convert('RGB'), int)
uv = m.visual.uv
cen = m.triangles_center; n = m.face_normals
fuv = uv[m.faces].mean(1)
col = tex[np.clip(((1 - fuv[:, 1]) * tex.shape[0]).astype(int), 0, tex.shape[0] - 1), np.clip((fuv[:, 0] * tex.shape[1]).astype(int), 0, tex.shape[1] - 1)]
fail = []
def check(ok, what): print(('ok   ' if ok else 'FAIL ') + what); ok or fail.append(what)
def side(mask, want, what):
    if not mask.any(): return check(False, what + ': no faces')
    good = (np.abs(col[mask] - want).max(1) < 40).mean()
    check(good > 0.97, f'{what}: {good:.1%} of {mask.sum()} faces in {want}')
x = cen[:, 0]; edge = 0.06  # keep off the half lines and the box's edges
side((n[:, 2] > 0.9) & (x < -edge), R, 'front, its right half (-X)')
side((n[:, 2] > 0.9) & (x > edge), G, 'front, its left half (+X)')
side((n[:, 2] < -0.9) & (x > edge), Y, 'back, its left half (+X)')
side((n[:, 2] < -0.9) & (x < -edge), B, 'back, its right half (-X)')
side(n[:, 0] > 0.9, M, 'its left side (+X)')
side(n[:, 0] < -0.9, C, 'its right side (-X)')
print('FAIL (%d)' % len(fail) if fail else 'PASS')
sys.exit(1 if fail else 0)
