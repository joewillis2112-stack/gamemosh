"""Read Radiance .hdr (RGBE, new-style RLE) into a float32 array [h, w, 3]."""
import numpy as np, re

def read_hdr(path):
    data = open(path, 'rb').read()
    end = data.index(b'\n\n') + 2
    m = re.search(rb'-Y (\d+) \+X (\d+)', data[end:end + 64])
    h, w = int(m.group(1)), int(m.group(2))
    p = end + data[end:].index(b'\n') + 1
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        assert data[p] == 2 and data[p + 1] == 2, 'only new-style RLE'
        p += 4
        for c in range(4):
            x = 0
            while x < w:
                n = data[p]; p += 1
                if n > 128:
                    n -= 128; img[y, x:x + n, c] = data[p]; p += 1
                else:
                    img[y, x:x + n, c] = np.frombuffer(data[p:p + n], np.uint8); p += n
                x += n
    e = img[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return (img[..., :3].astype(np.float64) * scale[..., None]).astype(np.float32)


def write_hdr(path, im):
    """Write float RGB [h, w, 3] as Radiance .hdr (RGBE, new-style RLE)."""
    h, w, _ = im.shape
    m = im.max(axis=2)
    e = np.where(m > 1e-32, np.floor(np.log2(np.maximum(m, 1e-32))) + 1, 0).astype(np.int32)
    scale = np.where(m > 1e-32, 256.0 / np.ldexp(1.0, e), 0.0)
    rgbe = np.zeros((h, w, 4), np.uint8)
    rgbe[..., :3] = np.clip(im * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(m > 1e-32, e + 128, 0).astype(np.uint8)
    out = bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
    for y in range(h):
        out += bytes([2, 2, w >> 8, w & 255])
        for c in range(4):
            row = rgbe[y, :, c]; x = 0
            while x < w:
                # a run of 3+ equal bytes -> run; else a literal up to the next run
                r = 1
                while x + r < w and r < 127 and row[x + r] == row[x]: r += 1
                if r >= 3:
                    out += bytes([128 + r, row[x]]); x += r; continue
                s = x
                while x < w and x - s < 128:
                    if x + 2 < w and row[x] == row[x + 1] == row[x + 2]: break
                    x += 1
                out += bytes([x - s]) + row[s:x].tobytes()
    open(path, 'wb').write(out)
