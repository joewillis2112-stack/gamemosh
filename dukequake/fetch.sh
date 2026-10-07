#!/bin/sh
# Fetch the 1996 shareware data (PAK0.PAK: start + E1M1-E1M8, progs.dat) and
# id's GPL source (the oracle's C) into dukequake/data. Idempotent.
set -e
D="$(cd "$(dirname "$0")" && pwd)/data"
mkdir -p "$D"
if [ ! -f "$D/id1/pak0.pak" ]; then
  curl -sSL -o "$D/quake_sw.zip" https://archive.org/download/quakeshareware/QUAKE_SW.zip
  (cd "$D" && unzip -qo quake_sw.zip 'QUAKE_SW/ID1/PAK0.PAK' && mkdir -p id1 && mv QUAKE_SW/ID1/PAK0.PAK id1/pak0.pak && rm -rf QUAKE_SW quake_sw.zip)
fi
if [ ! -d "$D/quake-src/WinQuake" ]; then
  git clone -q --depth 1 https://github.com/id-Software/Quake "$D/quake-src"
fi
echo "data in $D"
