#!/usr/bin/env bash
# Builds Pokécraft into dist/index.html (the whole game in one file) and
# dist/artifact.html (the same, as a claude.ai artifact fragment).
# Needs: Rust 1.94+ with wasm32-unknown-unknown, git, curl, Node 20+ (run
# `npm install` at the repo root first), Python 3 with Pillow.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HERE/.work"
mkdir -p "$WORK"
cd "$HERE"

POKERED_URL=https://github.com/liuyanghejerry/open-pokered
POKERED_REV=cb131bbde9168cb7486aeff0d220cc9b21849b30
MASHUP_URL=https://github.com/chasmlol/2010-rust-rewrite-mashup
MASHUP_REV=f608f85e407ff1b7689d54a9aafdd16e95711ac4
MC_JAR_URL=https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar
MC_JAR_SHA1=e877b6a07acd633fb3bb475002175cec036e7b87
WASM_BINDGEN_VERSION=0.2.128

checkout() { # url dir rev
  if [ ! -d "$2/.git" ]; then GIT_LFS_SKIP_SMUDGE=1 git clone -q "$1" "$2"; fi
  git -C "$2" cat-file -e "$3^{commit}" 2>/dev/null || GIT_LFS_SKIP_SMUDGE=1 git -C "$2" fetch -q origin
  GIT_LFS_SKIP_SMUDGE=1 git -C "$2" checkout -q -f "$3"
}
rustup target add wasm32-unknown-unknown >/dev/null

# --- Minecraft: MinecraftOSS's world crates from the reference mashup,
# patched to run in a browser (in-memory files, no threads, no clock).
checkout "$MASHUP_URL" "$WORK/mashup" "$MASHUP_REV"
rm -rf "$WORK/minecraftoss"
mkdir -p "$WORK/minecraftoss"
cp -r "$WORK/mashup/third_party/minecraftoss/"{core,generator,world} "$WORK/minecraftoss/"
# Its own repository, so git apply does not resolve paths against ours.
(cd "$WORK/minecraftoss" && git init -q && git apply "$HERE/patches/minecraftoss.patch")
(cd "$HERE/mcgen" && cargo build --locked --release --target wasm32-unknown-unknown --target-dir "$WORK/mcgen-target")
cp "$WORK/mcgen-target/wasm32-unknown-unknown/release/mcgen.wasm" "$WORK/mcgen.wasm"

# The data world generation reads and the textures come from Mojang's client jar.
if ! echo "$MC_JAR_SHA1  $WORK/client.jar" | sha1sum -c --status 2>/dev/null; then
  curl -sSfL -o "$WORK/client.jar" "$MC_JAR_URL"
  echo "$MC_JAR_SHA1  $WORK/client.jar" | sha1sum -c --status
fi
python3 tools/mkbundle.py "$WORK/client.jar" \
  "$WORK/mashup/crates/assets/data/minecraft/block-state-catalog-26.3.json.gz" "$WORK/mcdata.bin"

# --- Pokémon: open-pokered, patched so the page can draw the world under it.
checkout "$POKERED_URL" "$WORK/open-pokered" "$POKERED_REV"
git -C "$WORK/open-pokered" apply "$HERE/patches/open-pokered.patch"
(cd "$WORK/open-pokered" && scripts/fetch-gfx.sh \
  && cargo build --release --target wasm32-unknown-unknown -p pokered-runner-web)
WB="$WORK/wasm-bindgen/bin/wasm-bindgen"
if ! "$WB" --version 2>/dev/null | grep -q "$WASM_BINDGEN_VERSION"; then
  cargo install -q wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --root "$WORK/wasm-bindgen" --locked
fi
"$WB" --target web --no-typescript --out-dir "$WORK/pk" \
  "$WORK/open-pokered/target/wasm32-unknown-unknown/release/pokered_runner_web.wasm"

# --- Block textures, biome colours, Pokémon and NPC pictures; then one HTML file.
node tools/names.mjs "$WORK"
mkdir -p "$WORK/assets"
python3 tools/mkassets.py "$WORK/client.jar" "$WORK/blocks.json" "$WORK/biomes.json" \
  "$WORK/open-pokered" "$WORK/assets"
node tools/bundle.mjs "$WORK"
