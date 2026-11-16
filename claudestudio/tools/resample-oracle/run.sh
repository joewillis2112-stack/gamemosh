#!/usr/bin/env bash
# Regenerate test/fixtures/paint/resample-oracle.json from PhotoCraft's Image Size resampler
# (crates/algo/src/resample.rs; github.com/storytold/photocraft, MIT/Apache) at a pinned commit.
# Needs Rust (cargo). Clone lives in ../.cache/ext/photocraft (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
COMMIT=f9e94aa
D=../.cache/ext/photocraft
if [ ! -d "$D/.git" ]; then git clone -q --filter=blob:limit=1m https://github.com/storytold/photocraft "$D"; fi
git -C "$D" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$D" checkout -q "$COMMIT" 2>/dev/null || git -C "$D" checkout -q FETCH_HEAD
node tools/resample-oracle/cases.mjs > test/fixtures/paint/resample-cases.json
mkdir -p "$D/crates/algo/examples"
cp tools/resample-oracle/oracle.rs "$D/crates/algo/examples/studio_resample_oracle.rs"
(cd "$D" && cargo run -q --release -p photocraft-algo --example studio_resample_oracle -- "$OLDPWD/test/fixtures/paint/resample-cases.json") > test/fixtures/paint/resample-oracle.json
echo "oracle: $(wc -c < test/fixtures/paint/resample-oracle.json) bytes, PhotoCraft $(git -C "$D" rev-parse --short HEAD)"
