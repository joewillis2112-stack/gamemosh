#!/bin/sh
# The oracle test: every shareware map x every skill x two frame rates, a
# random player for N frames; the Rust port must match id's C bit for bit in
# every entity field and named global after every frame.
# usage: oracle/run.sh [frames]
set -e
H="$(cd "$(dirname "$0")" && pwd)"
D="$H/../data"
N="${1:-1500}"
[ -x "$D/harness" ] || "$H/build.sh"
(cd "$H/../engine" && cargo build -q --release --example oracle)
O="$H/../engine/target/release/examples/oracle"
pass=0; fail=0; seed=1
for map in start e1m1 e1m2 e1m3 e1m4 e1m5 e1m6 e1m7 e1m8; do
  for sk in 0 1 2 3; do
    for dt in 0.05 0.0138889; do
      seed=$((seed + 1))
      "$O" --gen "$D/cmds.txt" "$N" "$seed" "$dt"
      "$D/harness" "$D" "$map" "$D/cmds.txt" "$D/c.bin" "$sk" >/dev/null
      if r=$("$O" "$D/id1/pak0.pak" "$D/c.bin" "$D/cmds.txt" "$map" "$sk"); then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $map skill $sk dt $dt seed $seed"; echo "$r" | head -12; fi
    done
  done
done
echo "oracle: $pass match, $fail diverged ($N frames each)"
[ "$fail" = 0 ]
