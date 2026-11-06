# Checks ILSpy output for a Mono build against the game's published C# source:
# every type and method in the source (outside Editor folders) should be in the output.
# Usage: python3 -I check_mono_decomp.py <ilspy-out-dir> <source-scripts-dir>
import re, sys, glob
decomp_dir, src_dir = sys.argv[1], sys.argv[2]
dec = '\n'.join(open(f, encoding='utf-8', errors='replace').read() for f in glob.glob(decomp_dir + '/**/*.cs', recursive=True))
# strip comments from source so commented-out code doesn't count
strip = lambda s: re.sub(r'/\*.*?\*/', '', re.sub(r'//[^\n]*', '', s, flags=0), flags=re.S)
tot = found = 0
miss = []
for f in glob.glob(src_dir + '/**/*.cs', recursive=True):
    if '/Editor/' in f: continue  # editor-only scripts are not in a player build
    src = strip(open(f, encoding='utf-8', errors='replace').read())
    for cls in set(re.findall(r'\b(?:class|struct|enum)\s+(\w+)', src)):
        tot += 1
        ok = re.search(r'\b(?:class|struct|enum) ' + cls + r'\b', dec) is not None
        found += ok
        if not ok: miss.append(cls)
    for meth in set(re.findall(r'\b(?:void|int|float|bool|IEnumerator|string)\s+(\w+)\s*\(', src)):
        tot += 1
        ok = re.search(r'\b' + meth + r'\s*\(', dec) is not None
        found += ok
        if not ok: miss.append(meth + '()')
print(f'{found}/{tot} source types and methods present in the decompiled output')
print('missing:', miss[:20])
