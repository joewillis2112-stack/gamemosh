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
command -v patchelf >/dev/null || { apt-get update -q; apt-get install -y -q patchelf; }

# Pinned versions: REA 6.5.0 accepts Ghidra 12.1.x only (Homebrew's current 12.2
# also needs JDK 25). ghcr.io keeps old bottles by tag; the index gives each one's SHA-256.
for pv in ghidra:12.1.4 jadx:1.5.6; do
  p=${pv%%:*} v=${pv#*:}
  tok=$(curl -sS "https://ghcr.io/token?scope=repository:homebrew/core/$p:pull" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
  sha=$(curl -sS -H "Authorization: Bearer $tok" -H "Accept: application/vnd.oci.image.index.v1+json" "https://ghcr.io/v2/homebrew/core/$p/manifests/$v" | python3 -c "
import json,sys
for m in json.load(sys.stdin)['manifests']:
    a=m.get('annotations',{})
    if a.get('org.opencontainers.image.ref.name','').endswith('.x86_64_linux'): print(a['sh.brew.bottle.digest'])")
  curl -sS -L -H "Authorization: Bearer $tok" -o "$ROOT/dl/$p.tar.gz" "https://ghcr.io/v2/homebrew/core/$p/blobs/sha256:$sha"
  echo "$sha  $ROOT/dl/$p.tar.gz" | sha256sum -c -
  tar -xzf "$ROOT/dl/$p.tar.gz" -C "$ROOT/x"
done
rm -rf "$ROOT/dl"

GHIDRA="$ROOT/x/ghidra/12.1.4/libexec"
for f in $(find "$GHIDRA" -path "*/os/linux_x86_64/*" -type f); do
  if readelf -l "$f" 2>/dev/null | grep -q HOMEBREW_PREFIX; then
    patchelf --set-interpreter /lib64/ld-linux-x86-64.so.2 --remove-rpath "$f"
  fi
done

# Register REA with Claude Code, with Ghidra's path in the server's environment.
# Installed globally, not run through npx: npx fetches the package on the first
# start of each session, past Claude Code's 30 s MCP connect timeout. Setup run
# from the global binary registers that binary (starts in about 2 s).
npm i -g rea-agents@6.5.0
JAVA_HOME=${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}
export JAVA_HOME
GHIDRA_INSTALL_DIR="$GHIDRA" rea-agents setup --client claude_code --yes
GHIDRA_INSTALL_DIR="$GHIDRA" rea-agents doctor --client claude_code
# Il2CppDumper (Perfare, MIT) for Unity IL2CPP games: names out of global-metadata.dat,
# into REA with tools/rea-il2cpp/. Pinned commit; built for .NET 8. RequireAnyKey off so
# it runs headless.
command -v dotnet >/dev/null || { apt-get update -q; apt-get install -y -q dotnet-sdk-8.0; }
[ -d /home/user/ext/Il2CppDumper ] || git clone -q https://github.com/Perfare/Il2CppDumper /home/user/ext/Il2CppDumper
git -C /home/user/ext/Il2CppDumper checkout -q 4741d46b
dotnet build /home/user/ext/Il2CppDumper/Il2CppDumper/Il2CppDumper.csproj -c Release -f net8.0 -o "$ROOT/il2cppdumper"
sed -i 's/"RequireAnyKey": true/"RequireAnyKey": false/' "$ROOT/il2cppdumper/config.json"
echo "Il2CppDumper: dotnet $ROOT/il2cppdumper/Il2CppDumper.dll libil2cpp.so global-metadata.dat out/"
echo "JADX (standalone): $(ls "$ROOT"/x/jadx/*/libexec/bin/jadx)"
echo "Restart Claude Code for the REA tools to appear."
