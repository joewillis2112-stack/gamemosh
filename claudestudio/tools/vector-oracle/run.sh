#!/usr/bin/env bash
# Regenerate the Vector Editor's oracle files from VectorCraft (github.com/storytold/vectorcraft,
# MIT/Apache) at a pinned commit, and build its path booleans to wasm:
# - test/fixtures/vector/oracle.json: the geometry kernel (crates/geom) on cases.mjs, for geom.js.
# - test/fixtures/vector/pathops-oracle.json: the booleans (crates/pathops) natively and the
#   gradient model (crates/color) on cases-pathops.mjs, for pathops.wasm and gradient.js.
# - web/vector/pathops.wasm: crates/pathops through pathops/lib.rs (a flat-array binding).
# Needs Rust (cargo) and the wasm32-unknown-unknown target. Clone lives in ../.cache/ext/vectorcraft
# (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
COMMIT=2ac3ba2
D=../.cache/ext/vectorcraft
if [ ! -d "$D/.git" ]; then git clone -q --filter=blob:limit=1m https://github.com/storytold/vectorcraft "$D"; fi
git -C "$D" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$D" checkout -q "$COMMIT" 2>/dev/null || git -C "$D" checkout -q FETCH_HEAD
node tools/vector-oracle/cases.mjs > test/fixtures/vector/cases.json
mkdir -p "$D/crates/geom/examples"
cp tools/vector-oracle/oracle.rs "$D/crates/geom/examples/studio_oracle.rs"
(cd "$D" && cargo run -q --release -p vectorcraft-geom --example studio_oracle -- "$OLDPWD/test/fixtures/vector/cases.json") > test/fixtures/vector/oracle.json
echo "oracle: $(wc -c < test/fixtures/vector/oracle.json) bytes, VectorCraft $(git -C "$D" rev-parse --short HEAD)"

# Booleans and gradients: our binding crate goes into the workspace (crates/* are its members).
P="$D/crates/claudestudio-pathops"
mkdir -p "$P" && cp tools/vector-oracle/pathops/{Cargo.toml,lib.rs,oracle.rs} "$P/"
node tools/vector-oracle/cases-pathops.mjs > test/fixtures/vector/pathops-cases.json
(cd "$D" && cargo run -q --release -p claudestudio-pathops --example studio_oracle2 -- "$OLDPWD/test/fixtures/vector/pathops-cases.json") > test/fixtures/vector/pathops-oracle.json
echo "pathops oracle: $(wc -c < test/fixtures/vector/pathops-oracle.json) bytes"
(cd "$D" && CARGO_PROFILE_RELEASE_OPT_LEVEL=s CARGO_PROFILE_RELEASE_LTO=true CARGO_PROFILE_RELEASE_STRIP=true CARGO_PROFILE_RELEASE_PANIC=abort \
  cargo build -q --release -p claudestudio-pathops --lib --target wasm32-unknown-unknown)
cp "$D/target/wasm32-unknown-unknown/release/claudestudio_pathops.wasm" web/vector/pathops.wasm
echo "pathops.wasm: $(wc -c < web/vector/pathops.wasm) bytes"
