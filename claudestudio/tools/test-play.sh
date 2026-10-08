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
run --noshots --scenario test/scenarios/defaults.mjs
run --noshots --phone --scenario test/scenarios/defaults.mjs
run --noshots --scenario test/scenarios/sounds.mjs
run --noshots --place places/obby.luau --scenario test/scenarios/obby.mjs
run --place places/obby.luau --scenario test/scenarios/obby-look.mjs
node test/luau.test.mjs | tail -1
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
