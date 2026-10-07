#!/bin/sh
# Build the oracle: id's own server C (WinQuake, GPL) compiled 32-bit with SSE
# math, driven headless by harness.c. Needs gcc-multilib.
set -e
H="$(cd "$(dirname "$0")" && pwd)"
"$H/../fetch.sh" >/dev/null
W="$H/../data/quake-src/WinQuake"
O="$H/../data/oracle-obj"
mkdir -p "$O"
# id386 off: plain C, no x86 asm. SSE: no x87 extended precision, as in the Rust port.
CF="-m32 -msse2 -mfpmath=sse -O1 -w -U__i386__ -Did386=0 -I$W"
for f in pr_exec pr_edict pr_cmds sv_main sv_phys sv_move sv_user world mathlib common cvar cmd zone crc model; do
  gcc $CF -c "$W/$f.c" -o "$O/$f.o"
done
gcc $CF -c "$H/harness.c" -o "$O/harness.o"
gcc $CF -c "$H/stubs.c" -o "$O/stubs.o"
gcc -m32 "$O"/*.o -o "$H/../data/harness" -lm
echo "built $H/../data/harness"
