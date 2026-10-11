#!/usr/bin/env bash
# Character maker, stage 2, CPU route, end to end:
#   drawing.png -> TripoSR mesh -> phone budget -> rigged character .glb
# Usage (from claudestudio/): bash tools/stage2/make.sh drawing.png out.glb [triangles=12000]
# Needs the generator venv and models (tools/stage2/README.md, "Setup").
set -euo pipefail
cd "$(dirname "$0")/../.."
in="$1"; out="$2"; tris="${3:-12000}"
root="$(cd .. && pwd)"
py="$root/.cache/gen-venv/bin/python"
export HF_HOME="$root/.cache/hf" HF_HUB_OFFLINE=1 PYTHONPATH="$PWD/tools/stage2/shim:$root/.cache/TripoSR"
tmp="$(mktemp -d)"
"$py" tools/stage2/mesh_cpu.py "$in" "$tmp/mesh.glb" 2>&1 | grep -v -i warn
"$py" tools/stage2/budget.py "$tmp/mesh.glb" "$tmp/budget.glb" "$tris"
node tools/rigmesh.mjs "$tmp/budget.glb" "$out" --reference "$in" | head -12
rm -rf "$tmp"
