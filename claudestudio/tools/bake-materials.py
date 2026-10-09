# Bake ambientCG (CC0) 1K-JPG sets into assets/materials/<Material>/.
# usage: python3 tools/bake-materials.py <dir with unzipped <AssetId>/ folders>
# Download a set: curl -L -A Mozilla/5.0 -o X.zip "https://ambientcg.com/get?file=<AssetId>_1K-JPG.zip"
#   albedo.jpg  greyscale luminance / mean, contrast x0.7, stored at half (0.5 = the part's Color)
#   normal.jpg  OpenGL normal map
#   orm.jpg     R ambient occlusion, G roughness shifted to the target mean, B metalness
import os, sys, json
from PIL import Image
import numpy as np

M = {'Wood': ('Wood094', 0.6), 'WoodPlanks': ('WoodFloor040', 0.6), 'Brick': ('Bricks101', 0.8),
     'Cobblestone': ('PavingStones141', 0.75), 'Concrete': ('Concrete034', 0.8), 'Grass': ('Grass004', 0.85),
     'Sand': ('Ground080', 0.9), 'Granite': ('Granite002A', 0.6), 'Marble': ('Marble012', 0.35),
     'DiamondPlate': ('DiamondPlate008B', 0.4), 'CorrodedMetal': ('Metal041B', 0.6), 'Fabric': ('Fabric061', 0.9),
     'Pebble': ('Gravel023', 0.75), 'Ice': ('Ice003', 0.15)}
src, out = sys.argv[1], os.path.join(os.path.dirname(__file__), '..', 'assets', 'materials')
enc = lambda g: np.where(g <= 0.0031308, g * 12.92, 1.055 * np.clip(g, 0, None) ** (1 / 2.4) - 0.055)
meta = {}
for name, (aid, rt) in M.items():
    f = lambda k: f'{src}/{aid}/{aid}_1K-JPG_{k}.jpg'
    os.makedirs(f'{out}/{name}', exist_ok=True)
    col = np.asarray(Image.open(f('Color')).convert('RGB').resize((512, 512), Image.LANCZOS)).astype(np.float64) / 255
    lin = np.where(col <= 0.04045, col / 12.92, ((col + 0.055) / 1.055) ** 2.4)
    v = lin @ [0.2126, 0.7152, 0.0722]; v = v / v.mean(); v = 1 + (v - 1) * 0.7
    Image.fromarray((enc(np.clip(v / 2, 0, 1)) * 255 + 0.5).astype(np.uint8), 'L').convert('RGB').save(f'{out}/{name}/albedo.jpg', quality=88)
    Image.open(f('NormalGL')).convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{out}/{name}/normal.jpg', quality=92)
    r = np.asarray(Image.open(f('Roughness')).convert('L').resize((512, 512), Image.LANCZOS)).astype(np.float64) / 255
    r = np.clip(r - r.mean() + rt, 0.02, 1)
    ao = Image.open(f('AmbientOcclusion')).convert('L').resize((512, 512)) if os.path.exists(f('AmbientOcclusion')) else Image.new('L', (512, 512), 255)
    met = Image.open(f('Metalness')).convert('L').resize((512, 512), Image.LANCZOS) if os.path.exists(f('Metalness')) else Image.new('L', (512, 512), 0)
    Image.merge('RGB', (ao, Image.fromarray((r * 255 + 0.5).astype(np.uint8), 'L'), met)).save(f'{out}/{name}/orm.jpg', quality=92)
    meta[name] = {'source': aid, 'metal': os.path.exists(f('Metalness')), 'roughness': rt, 'clipped': round(float((v / 2 > 1).mean()), 4)}
json.dump(meta, open(f'{out}/meta.json', 'w'), indent=1)
print('baked', len(meta))
