#!/usr/bin/env bash
# Fetch Khronos's glTF Render Fidelity references into .cache/fidelity (gitignored):
# the generator at the commit the fidelity site pins (goldens, config.json,
# environment HDRs) and the glTF-Sample-Assets models it pins.
# mashup-research/GLTF_FIDELITY_2026-10-09.md explains what they are.
# Usage: tools/fetch-fidelity.sh [Model ...]   (default: every model in config.json)
set -eu
cd "$(dirname "$0")/.."
GEN_COMMIT=deaaba0b6c87b2a8627eb1ff809eedac6b11a5be
ASSETS_COMMIT=cfbe2f9ac259490855940ff85feb5b4b02386046
D=.cache/fidelity
mkdir -p "$D"
fetch() { # repo dir commit paths...
  local repo=$1 dir=$2 commit=$3; shift 3
  if [ ! -d "$dir/.git" ]; then git clone -q --filter=blob:none --no-checkout "$repo" "$dir"; fi
  git -C "$dir" sparse-checkout set --no-cone "$@"
  git -C "$dir" checkout -q "$commit"
}
fetch https://github.com/KhronosGroup/glTF-Render-Fidelity-Generator.git "$D/gen" $GEN_COMMIT /test/config.json /test/goldens/ /environments/ /src/config-reader.ts
models=("$@")
if [ ${#models[@]} -eq 0 ]; then
  mapfile -t models < <(python3 -c "
import json; c = json.load(open('$D/gen/test/config.json'))
print('\n'.join(sorted({s['model'].split('/Models/')[1].split('/')[0] for s in c['scenarios'] if '/Models/' in s['model']})))")
fi
fetch https://github.com/KhronosGroup/glTF-Sample-Assets.git "$D/assets" $ASSETS_COMMIT $(printf '/Models/%s/ ' "${models[@]}")
# Goldens are Git LFS pointers; fetch the ones we compare against (Babylon, the
# glTF Sample Viewer as ground truth, and Blender Cycles as the path-traced
# reference for realism work) for the fetched models' scenarios.
# FID_RENDERERS="babylon gltf-sample-viewer blender-cycles" overrides the list.
python3 - "$D" "$GEN_COMMIT" "${FID_RENDERERS:-babylon gltf-sample-viewer blender-cycles}" "${models[@]}" <<'PY'
import json, sys, os, urllib.request
D, commit, renderers, models = sys.argv[1], sys.argv[2], sys.argv[3].split(), set(sys.argv[4:])
cfg = json.load(open(f'{D}/gen/test/config.json'))
for s in cfg['scenarios']:
    if '/Models/' not in s['model'] or s['model'].split('/Models/')[1].split('/')[0] not in models: continue
    for r in renderers:
        path = f"test/goldens/{s['name']}/{r}-golden.png"; local = f'{D}/gen/{path}'
        if not os.path.exists(local) or open(local, 'rb').read(8) == b'\x89PNG\r\n\x1a\n': continue
        url = f'https://media.githubusercontent.com/media/KhronosGroup/glTF-Render-Fidelity-Generator/{commit}/{path}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        open(local, 'wb').write(urllib.request.urlopen(req).read())
PY
echo "fidelity: ${#models[@]} models in $D/assets/Models, goldens in $D/gen/test/goldens"
