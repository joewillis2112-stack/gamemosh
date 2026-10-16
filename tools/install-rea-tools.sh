#!/usr/bin/env bash
# REA (reverse engineering for agents) with Ghidra and JADX, in a fresh cloud
# container. GitHub release downloads and Maven Central are blocked here, so the
# engines come from Homebrew's Linux bottles (ghcr.io answers anonymous reads),
# checked against Homebrew's SHA-256. Homebrew leaves its own loader path
# (@@HOMEBREW_PREFIX@@/lib/ld.so) in the native helpers; they are re-pointed at
# the system loader, or Ghidra's decompiler can't start.
# Usage: bash tools/install-rea-tools.sh   (then restart Claude Code)
set -euo pipefail
ROOT=/opt/rea-tools
mkdir -p "$ROOT/dl" "$ROOT/x"
command -v java >/dev/null || { echo "needs a JDK 21 (Ghidra 12.1's minimum)"; exit 1; }
command -v patchelf >/dev/null || apt-get install -y -q patchelf

for p in ghidra jadx; do
  url=$(curl -sS https://formulae.brew.sh/api/formula/$p.json | python3 -c "import json,sys;print(json.load(sys.stdin)['bottle']['stable']['files']['x86_64_linux']['url'])")
  sha=${url##*sha256:}
  tok=$(curl -sS "https://ghcr.io/token?scope=repository:homebrew/core/$p:pull" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
  curl -sS -L -H "Authorization: Bearer $tok" -o "$ROOT/dl/$p.tar.gz" "$url"
  echo "$sha  $ROOT/dl/$p.tar.gz" | sha256sum -c -
  tar -xzf "$ROOT/dl/$p.tar.gz" -C "$ROOT/x"
done
rm -rf "$ROOT/dl"

GHIDRA=$(ls -d "$ROOT"/x/ghidra/*/libexec | tail -1)
for f in $(find "$GHIDRA" -path "*/os/linux_x86_64/*" -type f); do
  if readelf -l "$f" 2>/dev/null | grep -q HOMEBREW_PREFIX; then
    patchelf --set-interpreter /lib64/ld-linux-x86-64.so.2 --remove-rpath "$f"
  fi
done

# Register REA with Claude Code, with Ghidra's path in the server's environment.
GHIDRA_INSTALL_DIR="$GHIDRA" npx -y rea-agents@latest setup --client claude_code --yes
GHIDRA_INSTALL_DIR="$GHIDRA" npx -y rea-agents@latest doctor --client claude_code
echo "JADX (standalone): $(ls "$ROOT"/x/jadx/*/libexec/bin/jadx)"
echo "Restart Claude Code for the REA tools to appear."
