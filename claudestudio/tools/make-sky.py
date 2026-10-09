#!/usr/bin/env python3
"""Make the studio's sky textures from assets/sky/sky_1k.hdr:
assets/sky/sky_1k_nosun.hdr has the sun disk (and its hot glare) removed and
filled from the surrounding sky, because the sun is drawn and lit by the
engine at the time of day's position (a baked sun would sit at one fixed spot
and be counted twice: once by the directional light, once by the environment).
Prints where the sun was and how much of the sky's light it carried."""
import sys, numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from hdr import read_hdr, write_hdr

src = sys.argv[1] if len(sys.argv) > 1 else 'assets/sky/sky_1k.hdr'
dst = sys.argv[2] if len(sys.argv) > 2 else 'assets/sky/sky_1k_nosun.hdr'
im = read_hdr(src); h, w, _ = im.shape
lum = im @ np.array([0.2126, 0.7152, 0.0722])
y0, x0 = np.unravel_index(np.argmax(lum[:h // 2]), (h // 2, w))
elev, az = (0.5 - (y0 + 0.5) / h) * 180, (x0 + 0.5) / w * 360
# Background brightness around the sun: the median of a ring 8-12 degrees out.
yy, xx = np.mgrid[0:h, 0:w]
def ang(y, x):  # angle between pixel directions (degrees), equirect
    th1, ph1 = (0.5 - (y + 0.5) / h) * np.pi, (x + 0.5) / w * 2 * np.pi
    th0, ph0 = (0.5 - (y0 + 0.5) / h) * np.pi, (x0 + 0.5) / w * 2 * np.pi
    c = np.sin(th1) * np.sin(th0) + np.cos(th1) * np.cos(th0) * np.cos(ph1 - ph0)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))
d = ang(yy, xx)
bg = np.median(lum[(d > 8) & (d < 12)])
mask = (d < 10) & (lum > 3 * bg)          # the disk and its hot glare
mask |= d < 1.5                            # always the disk itself
# Solid angle per pixel (equirect): cos(latitude) * dθ dφ.
sa = np.cos((0.5 - (yy + 0.5) / h) * np.pi) * (np.pi / h) * (2 * np.pi / w)
up = yy < h // 2
irr_total = float((lum * sa * np.maximum(np.sin((0.5 - (yy + 0.5) / h) * np.pi), 0))[up].sum())
irr_sun = float((lum * sa * np.maximum(np.sin((0.5 - (yy + 0.5) / h) * np.pi), 0))[mask].sum())
# Laplace fill of the masked region from its border (Jacobi iterations on a crop).
ys, xs = np.where(mask)
y1, y2, x1, x2 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
crop, m = im[y1:y2, x1:x2].copy(), mask[y1:y2, x1:x2]
crop[m] = np.median(im[(d > 8) & (d < 12)], axis=0)
for _ in range(4000):
    avg = (np.roll(crop, 1, 0) + np.roll(crop, -1, 0) + np.roll(crop, 1, 1) + np.roll(crop, -1, 1)) / 4
    crop[m] = avg[m]
out = im.copy(); out[y1:y2, x1:x2] = crop
write_hdr(dst, out)
print(f'sun at elevation {elev:.1f}, azimuth {az:.1f} (u = {(x0 + 0.5) / w:.4f}); masked {int(mask.sum())} px within 10 deg; '
      f'it carried {100 * irr_sun / irr_total:.1f}% of the sky\'s horizontal irradiance; peak {lum.max():.0f} -> {float((out @ np.array([0.2126, 0.7152, 0.0722])).max()):.1f}')
