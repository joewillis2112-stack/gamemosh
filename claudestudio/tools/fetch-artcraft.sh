#!/usr/bin/env bash
# Fetch ArtCraft's source (github.com/storytold/artcraft, MIT or Apache-2.0) into
# ../.cache/ext/artcraft (gitignored), at the commit ARTCRAFT.md was written against.
# Read it as reference; port what ARTCRAFT.md lists; never run its build or app here.
# Usage: tools/fetch-artcraft.sh [commit]
set -eu
cd "$(dirname "$0")/../.."
COMMIT=${1:-d4e4ac69bbd93d237eaf5d0260bc6a5ff3a5e373}
D=.cache/ext/artcraft
mkdir -p .cache/ext
if [ ! -d "$D/.git" ]; then git clone -q --filter=blob:none https://github.com/storytold/artcraft "$D"; fi
git -C "$D" fetch -q origin "$COMMIT" 2>/dev/null || git -C "$D" fetch -q origin
git -C "$D" checkout -q "$COMMIT"
echo "artcraft at $(git -C "$D" rev-parse --short HEAD) in $D"
