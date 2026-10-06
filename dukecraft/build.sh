#!/usr/bin/env bash
# Builds Dukecraft into dist/index.html (the whole game in one file).
# Needs what pokecraft/build.sh needs (it builds the Minecraft half), plus
# unzip. Downloads the free 1996 Duke Nukem 3D shareware from archive.org.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HERE/.work"
mkdir -p "$WORK"
cd "$HERE"

# The Minecraft half: worldgen wasm, data and textures.
[ -f ../pokecraft/.work/mcgen.wasm ] && [ -f ../pokecraft/.work/assets/world.json ] || ../pokecraft/build.sh

# Duke Nukem 3D 1.3D shareware (episode 1, freely distributable).
DUKE_ZIP_URL=https://archive.org/download/3dduke13/3dduke13.zip
DUKE_GRP_SHA1=a58bdbfaf28416528a0d9a4452f896f46774a806
if [ ! -f "$WORK/DUKE3D.GRP" ]; then
  curl -sSfL -o "$WORK/3dduke13.zip" "$DUKE_ZIP_URL"
  (cd "$WORK" && unzip -o -q 3dduke13.zip DN3DSW13.SHR && unzip -o -q DN3DSW13.SHR DUKE3D.GRP)
fi
echo "$DUKE_GRP_SHA1  $WORK/DUKE3D.GRP" | sha1sum -c --quiet
node tools/dukepak.mjs "$WORK/DUKE3D.GRP" "$WORK/duke.grp.gz"

# Duke's CON VM with Duke's own move(), for the page.
(cd conwasm && cargo build --locked --release --target wasm32-unknown-unknown)

cd "$HERE/.." && node dukecraft/tools/bundle.mjs
