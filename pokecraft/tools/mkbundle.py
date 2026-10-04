# Packs what Minecraft's world generator reads into one gzipped bundle that
# mcgen.wasm mounts as its file system: the client jar's worldgen data, tags,
# structures, dimension type and mob variants, plus MinecraftOSS's block-state
# catalog. Format (little-endian): u32 count, then per file u32 path length,
# path, u32 data length, data.
# Usage: python3 mkbundle.py client.jar block-state-catalog-26.3.json.gz out.bin
import gzip, re, struct, sys, zipfile

jar = zipfile.ZipFile(sys.argv[1])
catalog = gzip.decompress(open(sys.argv[2], 'rb').read())
out = sys.argv[3]

DATA = 'datapacks/local/minecraft-26.3/data/'
KEEP = re.compile(r'^data/minecraft/(worldgen|tags|structure|dimension_type|[a-z_]+_variant|[a-z_]+_sound_variant)/')
files = {'artifacts/block-state-catalog/26.3.json': catalog}
for name in jar.namelist():
    if name.endswith('/'):
        continue
    if name == 'data/.mcassetsroot' or KEEP.match(name):
        files[DATA + name[len('data/'):]] = jar.read(name)

blob = [struct.pack('<I', len(files))]
for path in sorted(files):
    p, data = path.encode(), files[path]
    blob += [struct.pack('<I', len(p)), p, struct.pack('<I', len(data)), data]
raw = b''.join(blob)
open(out, 'wb').write(gzip.compress(raw, 9, mtime=0))
print(f'{len(files)} files, {len(raw) / 1e6:.1f} MB raw, {len(gzip.compress(raw, 9)) / 1e6:.2f} MB gzipped')
