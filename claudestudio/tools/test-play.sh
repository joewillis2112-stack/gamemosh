#!/usr/bin/env bash
# Every player scenario, in order. Exits non-zero if any scenario fails or any
# golden mismatches. Pass --update to re-save goldens (look at them first).
set -u
cd "$(dirname "$0")/.."
node tools/build.mjs >/dev/null || exit 1
U="${1:-}"
fail=0
run() { echo "== $*"; out=$(timeout 1800 node tools/play.mjs $U "$@" 2>&1); code=$?; echo "$out" | grep -v '^\s*- \|^\s*\[\|^shot '; [ $code -ne 0 ] && { echo "FAILED ($code): $*"; fail=1; }; }
run --scenario test/scenarios/move.mjs
run --noshots --scenario test/scenarios/feet.mjs
run --noshots --scenario test/scenarios/rig.mjs
run --noshots --scenario test/scenarios/desktop.mjs
run --phone --scenario test/scenarios/touch.mjs
run --noshots --place places/movement-lab.luau --scenario test/scenarios/slopes.mjs
run --noshots --place places/movement-lab.luau --scenario test/scenarios/autojump.mjs
run --place places/players-lab.luau --scenario test/scenarios/players.mjs
run --noshots --place places/parts-lab.luau --scenario test/scenarios/meshes.mjs
run --place places/parts-lab.luau --scenario test/scenarios/parts.mjs
run --noshots --place places/touch-lab.luau --scenario test/scenarios/touch-shapes.mjs
run --noshots --place places/touch-lab.luau --scenario test/scenarios/death-clear.mjs
run --noshots --scenario test/scenarios/humanoid-events.mjs
run --noshots --scenario test/scenarios/cframe.mjs
run --noshots --scenario test/scenarios/runservice.mjs
run --noshots --scenario test/scenarios/platforms.mjs
run --noshots --scenario test/scenarios/physics.mjs
run --noshots --place places/scripts-lab.luau --scenario test/scenarios/scripts.mjs
run --place places/materials-lab.luau --scenario test/scenarios/materials.mjs
run --noshots --scenario test/scenarios/defaults.mjs
run --noshots --phone --scenario test/scenarios/defaults.mjs
run --noshots --scenario test/scenarios/sounds.mjs
run --noshots --place places/obby.luau --scenario test/scenarios/obby.mjs
run --place places/obby.luau --scenario test/scenarios/obby-look.mjs
run --place places/gui-lab.luau --scenario test/scenarios/gui.mjs
run --phone --place places/gui-lab.luau --scenario test/scenarios/gui.mjs
run --place places/mesh-lab.luau --scenario test/scenarios/meshes-gltf.mjs
run --place places/leaderstats-lab.luau --scenario test/scenarios/leaderstats.mjs
run --phone --place places/leaderstats-lab.luau --scenario test/scenarios/leaderstats.mjs
if [ -d .cache/fidelity/assets ]; then
  node tools/build.mjs web/fidelity.js >/dev/null
  node tools/fidelity.mjs --check test/fidelity-baseline.json 2>&1 | grep "FAIL\|^fidelity:" ; [ ${PIPESTATUS[0]} -ne 0 ] && { echo "FAILED: glTF fidelity"; fail=1; }
else echo "glTF fidelity skipped (run tools/fetch-fidelity.sh first)"; fi
node test/luau.test.mjs | tail -1 | grep -q PASS && echo "luau test PASS" || { echo "FAILED: luau test"; fail=1; }
node test/tween.test.mjs | tail -1 | grep -q PASS && echo "tween test PASS" || { echo "FAILED: tween test"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
