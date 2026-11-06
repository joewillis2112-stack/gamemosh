# Checks Il2CppDumper output against a game's published C# source: every class and
# method in the source should appear in dump.cs / script.json.
# Usage: python3 -I check_il2cpp_dump.py <dumper-out-dir> <source-scripts-dir>
import re, sys, json, glob
dump_dir, src_dir = sys.argv[1], sys.argv[2]
dump = open(dump_dir + '/dump.cs', encoding='utf-8', errors='replace').read()
sj = json.load(open(dump_dir + '/script.json'))
names = {m['Name'] for m in sj['ScriptMethod']}
tot = found = 0
miss = []
for f in glob.glob(src_dir + '/**/*.cs', recursive=True):
    src = open(f, encoding='utf-8', errors='replace').read()
    for cls in re.findall(r'\bclass\s+(\w+)', src):
        ok = re.search(r'\bclass ' + cls + r'\b', dump) is not None
        tot += 1; found += ok
        if not ok: miss.append(cls)
        for meth in set(re.findall(r'(?:void|int|float|bool|IEnumerator|string)\s+(\w+)\s*\(', src)):
            tot += 1
            k = cls + '$$' + meth
            ok = k in names
            found += ok
            if not ok: miss.append(k)
print(f'{found}/{tot} source classes+methods found (methods matched to script.json entries with addresses)')
print('missing:', miss[:20])
print('script.json methods total:', len(sj['ScriptMethod']))
