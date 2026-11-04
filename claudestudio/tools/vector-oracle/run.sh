#!/usr/bin/env bash
# Regenerate test/fixtures/vector/oracle.json from VectorCraft's geometry kernel
# (github.com/storytold/vectorcraft, MIT/Apache, crates/geom) at a pinned commit.
# Needs Rust (cargo). Clone lives in ../.cache/ext/vectorcraft (gitignored).
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
