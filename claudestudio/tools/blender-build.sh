#!/usr/bin/env bash
# Builds Blender's own BMesh (mesh editing) from Blender's source, for the
# studio's mesh tools (PLAN.md, "Mesh editing"). Every step that compiles or
# runs Blender's code is here, so one permission rule covers exactly this:
#   bash tools/blender-build.sh <step>
# Steps:
#   fetch    sparse clone of Blender v4.2.0 (the parts BMesh needs) into .cache/blender-src
#   dna      build and run Blender's makesdna (generates dna_type_offsets.h)
#   native   compile BMesh + blenlib + customdata natively (.cache/bm-native)
#   probe    link and run the native probe (a cube, an inset) to list what's still missing
#   oracle   set up Blender 4.2 as a Python module (.cache/bpy-venv) for checking results
set -euo pipefail
cd "$(dirname "$0")/.."
C=.cache; SRC=$C/blender-src; OUT=$C/bm-native; GEN=$OUT/gen; SHIM=$C/bmwasm/shim
mkdir -p "$C" "$OUT" "$GEN" "$SHIM"
echo "/* shim: Blender's strict-flags pragmas off for this build */" > "$SHIM/BLI_strict_flags.h"
INC="-I$GEN -I$SHIM -I$SRC/source/blender/bmesh -I$SRC/source/blender/blenlib -I$SRC/source/blender/makesdna -I$SRC/source/blender/blenkernel -I$SRC/intern/guardedalloc -I$SRC/intern/clog -I$SRC/intern/atomic -I$SRC/source/blender/blentranslation -I$SRC/source/blender/depsgraph -I$SRC/extern/rangetree -I$SRC/source/blender -I$SRC/intern/eigen -I$SRC/extern/Eigen3 -I$SRC/extern/wcwidth -I$SRC/extern/fmtlib/include -DFMT_HEADER_ONLY -I$SRC/source/blender/blenloader -I$SRC/source/blender/imbuf -I$SRC/source/blender/makesrna"

step_fetch() {
  [ -d "$SRC/.git" ] || git clone -q --filter=blob:none --no-checkout --depth 1 --branch v4.2.0 https://github.com/blender/blender.git "$SRC"
  git -C "$SRC" sparse-checkout set --no-cone /source/blender/bmesh /source/blender/blenlib /source/blender/makesdna \
    '/source/blender/blenkernel/BKE_*.hh' '/source/blender/blenkernel/BKE_*.h' '/source/blender/blenkernel/intern/*.hh' \
    /source/blender/blenkernel/intern/customdata.cc /intern/guardedalloc /intern/clog /intern/atomic /intern/eigen \
    /source/blender/blentranslation /extern/rangetree /extern/Eigen3 /extern/wcwidth /extern/fmtlib \
    /source/blender/depsgraph/DEG_depsgraph_query.hh '/source/blender/blenloader/BLO_*.hh' '/source/blender/imbuf/IMB_*.hh' \
    '/source/blender/makesrna/RNA_*.hh' /source/blender/CMakeLists.txt
  git -C "$SRC" checkout -q
}

step_dna() {
  # The list of DNA headers, as CMake writes it (source/blender/makesdna/intern/CMakeLists.txt).
  python3 - "$SRC" "$GEN" <<'EOF'
import re, sys
src, gen = sys.argv[1], sys.argv[2]
s = open(src + '/source/blender/CMakeLists.txt').read()
hs = re.findall(r'\$\{CMAKE_CURRENT_SOURCE_DIR\}/makesdna/(DNA_\w+\.h)', re.search(r'set\(SRC_DNA_INC(.*?)\)', s, re.S).group(1))
open(gen + '/dna_includes_all.h', 'w').write('/* generated */\n' + ''.join(f'#include "{h}"\n' for h in hs))
open(gen + '/dna_includes_as_strings.h', 'w').write('/* generated */\n' + ''.join(f'\t"{h}",\n' for h in hs))
print(len(hs), 'DNA headers')
EOF
  local B=$SRC/source/blender/blenlib/intern
  g++ -std=c++20 -O1 $INC -I$SRC/source/blender/makesdna/intern \
    $SRC/source/blender/makesdna/intern/makesdna.cc $SRC/source/blender/makesdna/intern/dna_utils.cc \
    $B/BLI_assert.c $B/BLI_ghash.c $B/BLI_ghash_utils.cc $B/BLI_memarena.c $B/BLI_mempool.c $B/hash_mm2a.cc $B/string.c $B/system.c \
    $SRC/intern/guardedalloc/intern/*.c* -o "$GEN/makesdna" -lpthread
  (cd "$GEN" && ./makesdna dna.c dna_type_offsets.h dna_verify.c "$(realpath ../../blender-src/source/blender/makesdna)/")
  ls -la "$GEN"
}

step_native() {
  local list=$OUT/files.txt
  ls $SRC/source/blender/bmesh/intern/*.cc $SRC/source/blender/bmesh/operators/*.cc $SRC/source/blender/bmesh/tools/*.cc \
     $SRC/source/blender/blenlib/intern/*.c* $SRC/intern/guardedalloc/intern/*.c* $SRC/extern/rangetree/intern/*.c* \
     $SRC/extern/wcwidth/wcwidth.c $SRC/source/blender/blenkernel/intern/customdata.cc > "$list"
  : > "$OUT/fails.txt"
  while read -r f; do
    o=$OUT/$(echo "$f" | tr / _).o
    case "$f" in *.c) gcc -std=gnu11 -O2 -c $INC "$f" -o "$o" ;; *) g++ -std=c++20 -O2 -c $INC "$f" -o "$o" ;; esac 2>>"$OUT/errors.txt" || echo "$f" >> "$OUT/fails.txt"
  done < "$list"
  echo "$(wc -l < "$list") files, $(wc -l < "$OUT/fails.txt") failed (see $OUT/fails.txt, $OUT/errors.txt)"
}

step_probe() {
  g++ -std=c++20 -O2 $INC -c blender/probe.cc -o "$OUT/probe.o"
  if g++ "$OUT"/*.o -o "$OUT/probe" -lpthread 2> "$OUT/link.txt"; then "$OUT/probe"
  else grep -o "undefined reference to \`[^']*'" "$OUT/link.txt" | sort -u | sed 's/undefined reference to //' | c++filt | head -80; fi
}

step_oracle() {
  [ -x $C/bpy-venv/bin/python ] || { uv venv -q -p python3.11 $C/bpy-venv && uv pip install -q -p $C/bpy-venv/bin/python bpy==4.2.0; }
  $C/bpy-venv/bin/python -c "import bpy, bmesh; print('Blender', bpy.app.version_string)"
}

[ $# -ge 1 ] || { sed -n '2,13p' "$0"; exit 1; }
for s in "$@"; do "step_$s"; done
