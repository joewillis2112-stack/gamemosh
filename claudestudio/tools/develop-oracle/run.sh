#!/usr/bin/env bash
# Regenerate test/fixtures/develop/oracle.json from LightCraft's develop pipeline
# (github.com/storytold/lightcraft, MIT/Apache, crates/pipeline) at a pinned commit.
# Needs Rust (cargo). Clone lives in ../.cache/ext/lightcraft (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
COMMIT=76b5377
D=../.cache/ext/lightcraft
if [ ! -d "$D/.git" ]; then git clone -q --filter=blob:limit=1m https://github.com/storytold/lightcraft "$D"; fi
git -C "$D" fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$D" checkout -q "$COMMIT" 2>/dev/null || git -C "$D" checkout -q FETCH_HEAD
mkdir -p test/fixtures/develop
node tools/develop-oracle/cases.mjs > test/fixtures/develop/cases.json
cp tools/develop-oracle/oracle.rs "$D/crates/pipeline/examples/studio_oracle.rs"
(cd "$D" && cargo run -q --release -p lightcraft-pipeline --example studio_oracle -- "$OLDPWD/test/fixtures/develop/cases.json") > test/fixtures/develop/oracle.json
echo "oracle: $(wc -c < test/fixtures/develop/oracle.json) bytes, LightCraft $(git -C "$D" rev-parse --short HEAD)"
