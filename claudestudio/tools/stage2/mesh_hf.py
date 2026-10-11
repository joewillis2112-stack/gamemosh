# Stage 2, realistic route: Hugging Face ZeroGPU Spaces, free with a read token.
#   drawing.png -> FLUX.1 Kontext: a photo of a real person, same outfit and pose
#               -> rembg (CPU): the photo cut out
#               -> Hunyuan3D-2 /shape_generation: an untextured mesh
#               -> paint_cpu.py: textured from the photo, phone budget, contract
# Then: node tools/rigmesh.mjs OUTDIR/mesh.glb OUT.glb --reference OUTDIR/cutout.png
# (the cutout, not the drawing: a real person's proportions aren't the drawing's).
#
# Usage: mesh_hf.py IN.png OUTDIR [--seed N] [--prompt TEXT] [--triangles N]
#        [--from-photo]  (IN.png is already the photo: skip Kontext)
# Writes OUTDIR/input.png, photo.png, cutout.png, shape.glb, mesh.glb.
# Needs HF_TOKEN (a free read token) in the environment; gradio_client 2.x
# takes token=, not hf_token=.
#
# Free quota (2026-10-11): about 4 minutes of ZeroGPU a day. Kontext and the
# shape fit in it; Hunyuan's own texturing doesn't (/generation_all on
# Hunyuan3D-2 fails with a NameError in the Space, Hunyuan3D-2.1 asks for
# 270 s), hence the CPU paint.
import argparse, os, subprocess, sys, urllib.request, numpy as np
from PIL import Image
from gradio_client import Client, handle_file

PROMPT = ('Transform into a real photograph of a real adult person with realistic '
          'human anatomy and normal adult body proportions (head about one seventh '
          'of their height), real skin and real hair. Same outfit, same colours, '
          'same hairstyle. Full body from head to feet, facing the camera, standing '
          'straight with arms relaxed at the sides, plain white studio background. '
          'Not a toy, not a cartoon, not a 3D render.')

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--prompt', default=PROMPT)
ap.add_argument('--triangles', type=int, default=20000)
ap.add_argument('--from-photo', action='store_true')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
token = os.environ['HF_TOKEN']
out = lambda name: os.path.join(a.out, name)

def on_white(path, side):
    """Subject centred on white, filling 85% of a square, at side px."""
    img = Image.open(path).convert('RGBA')
    al = np.array(img)[..., 3]; ys, xs = np.nonzero(al > 16)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    k = side * 0.85 / max(img.size)
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', (side, side), (255, 255, 255, 255))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas.convert('RGB')

on_white(a.src, 1024).save(out('input.png'))
if a.from_photo:
    Image.open(out('input.png')).save(out('photo.png'))
else:
    kontext = Client('black-forest-labs/FLUX.1-Kontext-Dev', token=token, verbose=False)
    img, seed = kontext.predict(handle_file(out('input.png')), a.prompt, a.seed, False, 2.5, 28, api_name='/infer')
    Image.open(img['path'] if isinstance(img, dict) else img).convert('RGB').save(out('photo.png'))
    print('photo', out('photo.png'))

# The photo cut out: stage 1's flood fill can't take a photo's graded backdrop.
from rembg import remove, new_session
remove(Image.open(out('photo.png')), session=new_session('isnet-general-use')).save(out('cutout.png'))

hy = Client('tencent/Hunyuan3D-2', token=token, verbose=False)
res = hy.predict(None, handle_file(out('photo.png')), None, None, None, None,
                 30, 5.0, 1234, 256, True, 8000, False, api_name='/shape_generation')
f = res[0]
path = f.get('value', f) if isinstance(f, dict) else f
path = path['path'] if isinstance(path, dict) else path
if os.path.exists(path):  # gradio_client downloaded it
    Image  # (nothing to do)
    data = open(path, 'rb').read()
else:  # an update dict carries the Space's own path: fetch it
    req = urllib.request.Request(hy.src.rstrip('/') + '/gradio_api/file=' + path, headers={'Authorization': 'Bearer ' + token})
    data = urllib.request.urlopen(req).read()
open(out('shape.glb'), 'wb').write(data)
print('shape', out('shape.glb'), res[2].get('number_of_faces'), 'faces')

here = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, os.path.join(here, 'paint_cpu.py'), out('shape.glb'), out('cutout.png'), out('mesh.glb'), str(a.triangles)], check=True)
