#!/usr/bin/env bash
# Regenerate test/fixtures/paint/oracle.json from PhotoCraft's brush engine
# (github.com/storytold/photocraft, MIT/Apache) at a pinned commit.
# Needs Rust (cargo). Clone lives in ../.cache/ext/photocraft (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
COMMIT=f9e94aa
D=../.cache/ext/photocraft
if [ ! -d "$D/.git" ]; then git clone -q --filter=blob:limit=1m https://github.com/storytold/photocraft "$D"; fi
git -C "$D" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$D" checkout -q "$COMMIT" 2>/dev/null || git -C "$D" checkout -q FETCH_HEAD
mkdir -p "$D/crates/paint/examples"
cp tools/paint-oracle/oracle.rs "$D/crates/paint/examples/studio_oracle.rs"
(cd "$D" && cargo run -q --release -p photocraft-paint --example studio_oracle -- "$OLDPWD/test/fixtures/paint/cases.json") > test/fixtures/paint/oracle.json
cp tools/paint-oracle/blend_oracle.rs "$D/crates/paint/examples/studio_blend_oracle.rs"
(cd "$D" && cargo run -q --release -p photocraft-paint --example studio_blend_oracle -- "$OLDPWD/test/fixtures/paint/blend-cases.json") > test/fixtures/paint/blend-oracle.json
echo "oracle: $(wc -c < test/fixtures/paint/oracle.json) bytes, PhotoCraft $(git -C "$D" rev-parse --short HEAD)"
