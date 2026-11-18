#!/usr/bin/env bash
# Regenerate test/fixtures/paint/selection-oracle.json from PhotoCraft's selection code
# (crates/algo/src/selection*.rs; github.com/storytold/photocraft, MIT/Apache) at a pinned commit.
# Needs Rust (cargo). Clone lives in ../.cache/ext/photocraft (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
COMMIT=f9e94aa
D=../.cache/ext/photocraft
if [ ! -d "$D/.git" ]; then git clone -q --filter=blob:limit=1m https://github.com/storytold/photocraft "$D"; fi
git -C "$D" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$D" checkout -q "$COMMIT" 2>/dev/null || git -C "$D" checkout -q FETCH_HEAD
node tools/selection-oracle/cases.mjs > test/fixtures/paint/selection-cases.json
mkdir -p "$D/crates/algo/examples"
cp tools/selection-oracle/oracle.rs "$D/crates/algo/examples/studio_selection_oracle.rs"
(cd "$D" && cargo run -q --release -p photocraft-algo --example studio_selection_oracle -- "$OLDPWD/test/fixtures/paint/selection-cases.json") > test/fixtures/paint/selection-oracle.json
echo "oracle: $(wc -c < test/fixtures/paint/selection-oracle.json) bytes, PhotoCraft $(git -C "$D" rev-parse --short HEAD)"
