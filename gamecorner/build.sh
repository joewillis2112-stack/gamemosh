#!/usr/bin/env bash
# Builds Game Corner Arcade into dist/index.html.
#
# Clones the two Rust rewrites at pinned commits, applies this folder's
# patches, compiles both to wasm32, then inlines everything into one HTML
# file. Needs: git, cargo (Rust 1.94+), rustup target wasm32-unknown-unknown,
# node 20+, and npm deps installed at the repo root (esbuild).
set -euo pipefail
cd "$(dirname "$0")"
HERE="$PWD"
WORK="${GC_WORK:-$HERE/.work}"
POKERED_URL=https://github.com/liuyanghejerry/open-pokered
POKERED_REV=cb131bbde9168cb7486aeff0d220cc9b21849b30
PICO_URL=https://github.com/mnmlyw/pico-r
PICO_REV=0de0ef94198d786ea30716e0cbfb87bd13b77f07
WASM_BINDGEN_VERSION=0.2.128

mkdir -p "$WORK"

checkout() { # url dir rev
  if [ ! -d "$2/.git" ]; then git clone -q "$1" "$2"; fi
  git -C "$2" cat-file -e "$3^{commit}" 2>/dev/null || git -C "$2" fetch -q origin
  git -C "$2" checkout -q -f "$3"
}
checkout "$POKERED_URL" "$WORK/open-pokered" "$POKERED_REV"
checkout "$PICO_URL" "$WORK/pico-r" "$PICO_REV"
git -C "$WORK/open-pokered" apply "$HERE/patches/open-pokered.patch"
git -C "$WORK/pico-r" apply "$HERE/patches/pico-r.patch"

rustup target add wasm32-unknown-unknown >/dev/null
(cd "$WORK/open-pokered" && scripts/fetch-gfx.sh \
  && cargo build --release --target wasm32-unknown-unknown -p pokered-runner-web)
(cd "$WORK/pico-r" && cargo build --locked --release --target wasm32-unknown-unknown --lib)

WB="$WORK/wasm-bindgen/bin/wasm-bindgen"
if ! "$WB" --version 2>/dev/null | grep -q "$WASM_BINDGEN_VERSION"; then
  cargo install -q wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --root "$WORK/wasm-bindgen" --locked
fi
"$WB" --target web --no-typescript --out-dir "$WORK/pk" \
  "$WORK/open-pokered/target/wasm32-unknown-unknown/release/pokered_runner_web.wasm"
cp "$WORK/pico-r/target/wasm32-unknown-unknown/release/pico_r.wasm" "$WORK/pico_r.wasm"

node tools/bundle.mjs "$WORK"
