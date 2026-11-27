#!/usr/bin/env bash
# Every player scenario, in order. Exits non-zero if any scenario fails or any
# golden mismatches. Pass --update to re-save goldens (look at them first).
set -u
# The suite runs on a snapshot of the tree, so files edited while it runs (it takes about an hour)
# can't reach it. Goldens re-saved with --update are copied back; shots and diffs stay in the
# snapshot's build/play (its path is printed first).
if [ -z "${SUITE_SNAPSHOT:-}" ]; then
  SRC="$(cd "$(dirname "$0")/.." && pwd)"
  rm -rf /tmp/cs-suite-* 2>/dev/null
  SNAP="$(mktemp -d /tmp/cs-suite-XXXX)"
  mkdir -p "$SNAP/claudestudio"
  (cd "$SRC" && tar cf - --exclude=./node_modules --exclude=./build --exclude=./.cache .) | (cd "$SNAP/claudestudio" && tar xf -)
  ln -s "$SRC/node_modules" "$SNAP/claudestudio/node_modules"
  ln -s "$(cd "$SRC/.." && pwd)/node_modules" "$SNAP/node_modules"
  [ -d "$SRC/.cache" ] && ln -s "$SRC/.cache" "$SNAP/claudestudio/.cache"
  echo "suite snapshot: $SNAP/claudestudio"
  SUITE_SNAPSHOT=1 bash "$SNAP/claudestudio/tools/test-play.sh" "$@"; code=$?
  [ "${1:-}" = "--update" ] && cp -r "$SNAP/claudestudio/goldens/." "$SRC/goldens/"
  exit $code
fi
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
run --noshots --scenario test/scenarios/joints.mjs
run --noshots --scenario test/scenarios/charbody.mjs
run --noshots --character assets/characters/r15/studio.glb --scenario test/scenarios/charbody-r15.mjs
run --noshots --body chibi --quality low --scenario test/scenarios/charbody-r15.mjs
run --place places/bodies-lab.luau --scenario test/scenarios/bodies.mjs
run --noshots --place places/bodies-lab.luau --quality low --scenario test/scenarios/bodies.mjs
run --place places/ik-lab.luau --scenario test/scenarios/ik.mjs
run --noshots --place places/ik-lab.luau --quality low --scenario test/scenarios/ik.mjs
run --place places/npc-lab.luau --scenario test/scenarios/npcs.mjs
run --noshots --place places/npc-lab.luau --quality low --scenario test/scenarios/npcs.mjs
run --place places/path-lab.luau --scenario test/scenarios/pathfinding.mjs
run --place places/billboard-lab.luau --scenario test/scenarios/billboards.mjs
run --noshots --phone --place places/billboard-lab.luau --scenario test/scenarios/billboards.mjs
run --place places/surfacegui-lab.luau --scenario test/scenarios/surfaceguis.mjs
run --noshots --phone --place places/surfacegui-lab.luau --scenario test/scenarios/surfaceguis.mjs
run --noshots --place places/constraints-lab.luau --scenario test/scenarios/constraints.mjs
run --place places/truss-lab.luau --scenario test/scenarios/truss.mjs
run --noshots --phone --place places/truss-lab.luau --scenario test/scenarios/truss.mjs
run --place places/swim-lab.luau --scenario test/scenarios/swimming.mjs
run --noshots --phone --place places/swim-lab.luau --scenario test/scenarios/swimming.mjs
run --noshots --place places/scripts-lab.luau --scenario test/scenarios/scripts.mjs
run --place places/materials-lab.luau --scenario test/scenarios/materials.mjs
run --noshots --scenario test/scenarios/defaults.mjs
run --noshots --phone --scenario test/scenarios/defaults.mjs
run --noshots --scenario test/scenarios/sounds.mjs
run --noshots --place places/obby.luau --scenario test/scenarios/obby.mjs
run --place places/obby.luau --scenario test/scenarios/obby-look.mjs
run --place places/gui-lab.luau --scenario test/scenarios/gui.mjs
run --phone --place places/gui-lab.luau --scenario test/scenarios/gui.mjs
run --place places/scroll-lab.luau --scenario test/scenarios/gui-scroll.mjs
run --phone --place places/scroll-lab.luau --scenario test/scenarios/gui-scroll.mjs
run --place places/grid-lab.luau --scenario test/scenarios/gui-grid.mjs
run --phone --place places/grid-lab.luau --scenario test/scenarios/gui-grid.mjs
run --place places/textbox-lab.luau --scenario test/scenarios/gui-textbox.mjs
run --phone --place places/textbox-lab.luau --scenario test/scenarios/gui-textbox.mjs
run --place places/gradient-lab.luau --scenario test/scenarios/gui-gradient.mjs
run --phone --place places/gradient-lab.luau --scenario test/scenarios/gui-gradient.mjs
run --place places/scale-lab.luau --scenario test/scenarios/gui-scale.mjs
run --phone --place places/scale-lab.luau --scenario test/scenarios/gui-scale.mjs
run --scenario test/scenarios/gui-fontface.mjs
run --phone --scenario test/scenarios/gui-fontface.mjs
run --place places/mesh-lab.luau --scenario test/scenarios/meshes-gltf.mjs
run --place places/leaderstats-lab.luau --scenario test/scenarios/leaderstats.mjs
run --phone --place places/leaderstats-lab.luau --scenario test/scenarios/leaderstats.mjs
run --place places/lighting-lab.luau --scenario test/scenarios/lighting.mjs
run --phone --place places/lighting-lab.luau --scenario test/scenarios/lighting.mjs
run --scenario test/scenarios/charmaker.mjs
run --scenario test/scenarios/charmaker2.mjs
run --phone --scenario test/scenarios/charmaker2.mjs
node tools/rigmesh.mjs test/fixtures/stage2/male-adventurer-tripo.glb build/stage2/male-rigged.glb --reference test/fixtures/characters/male-adventurer.png >/dev/null && run --noshots --character build/stage2/male-rigged.glb --scenario test/scenarios/feet.mjs
run --place places/lights-lab.luau --scenario test/scenarios/lights.mjs
run --phone --place places/lights-lab.luau --scenario test/scenarios/lights.mjs
run --place places/particles-lab.luau --scenario test/scenarios/particles.mjs
run --phone --place places/particles-lab.luau --scenario test/scenarios/particles.mjs
run --quality low --place places/particles-lab.luau --scenario test/scenarios/particles.mjs
run --quality ultra --place places/particles-lab.luau --scenario test/scenarios/particles.mjs
run --scenario test/scenarios/highlights.mjs
run --phone --scenario test/scenarios/highlights.mjs
run --place places/styles-lab.luau --scenario test/scenarios/styles.mjs
run --phone --place places/styles-lab.luau --scenario test/scenarios/styles.mjs
run --quality low --place places/styles-lab.luau --scenario test/scenarios/styles.mjs
run --place places/atmosphere-lab.luau --scenario test/scenarios/atmosphere.mjs
run --quality low --place places/atmosphere-lab.luau --scenario test/scenarios/atmosphere.mjs
run --scenario test/scenarios/unions.mjs
run --noshots --scenario test/scenarios/stress.mjs
run --scenario test/scenarios/fonts.mjs
run --quality auto --place places/lighting-lab.luau --scenario test/scenarios/graphics.mjs
run --phone --quality auto --place places/lighting-lab.luau --scenario test/scenarios/graphics.mjs
run --place places/lighting-lab.luau --scenario test/scenarios/posteffects.mjs
run --phone --place places/lighting-lab.luau --scenario test/scenarios/posteffects.mjs
run --scenario test/scenarios/camera.mjs
run --phone --scenario test/scenarios/camera.mjs
run --scenario test/scenarios/animation.mjs
run --scenario test/scenarios/terrain.mjs
run --page editor --scenario test/scenarios/editor.mjs
run --page editor --phone --scenario test/scenarios/editor.mjs
run --page editor --scenario test/scenarios/editor-modal.mjs
run --page editor --scenario test/scenarios/editor-play.mjs
run --page editor --scenario test/scenarios/editor-mesh.mjs
run --page editor --phone --scenario test/scenarios/editor-mesh.mjs
run --page editor --scenario test/scenarios/editor-animate.mjs
run --page editor --phone --scenario test/scenarios/editor-animate.mjs
run --page editor --scenario test/scenarios/editor-bodies.mjs
run --page editor --phone --scenario test/scenarios/editor-bodies.mjs
run --page editor --scenario test/scenarios/editor-animate-r15.mjs
run --page editor --phone --scenario test/scenarios/editor-animate-r15.mjs
run --page editor --scenario test/scenarios/editor-terrain.mjs
run --page editor --phone --scenario test/scenarios/editor-terrain.mjs
run --page editor --scenario test/scenarios/editor-paint.mjs
run --page editor --phone --scenario test/scenarios/editor-paint.mjs
run --page editor --scenario test/scenarios/editor-paint-more.mjs
run --page editor --phone --scenario test/scenarios/editor-paint-more.mjs
run --page editor --scenario test/scenarios/editor-image.mjs
run --page editor --phone --scenario test/scenarios/editor-image.mjs
run --page editor --scenario test/scenarios/editor-vector.mjs
run --page editor --phone --scenario test/scenarios/editor-vector.mjs
run --page editor --scenario test/scenarios/editor-adjust.mjs
run --page editor --phone --scenario test/scenarios/editor-adjust.mjs
run --page editor --scenario test/scenarios/editor-script.mjs
run --page editor --phone --scenario test/scenarios/editor-script.mjs
run --page editor --scenario test/scenarios/editor-toolbox.mjs
run --page editor --phone --scenario test/scenarios/editor-toolbox.mjs
run --page editor --scenario test/scenarios/editor-props.mjs
run --page editor --phone --scenario test/scenarios/editor-props.mjs
if [ -d .cache/fidelity/assets ]; then
  node tools/build.mjs web/fidelity.js >/dev/null
  node tools/fidelity.mjs --check test/fidelity-baseline.json 2>&1 | grep "FAIL\|^fidelity:" ; [ ${PIPESTATUS[0]} -ne 0 ] && { echo "FAILED: glTF fidelity"; fail=1; }
else echo "glTF fidelity skipped (run tools/fetch-fidelity.sh first)"; fi
timeout 600 node test/text.test.mjs | tail -1 | grep -q PASS && echo "text outlines test PASS" || { echo "FAILED: text outlines test"; fail=1; }
timeout 600 node test/quality.test.mjs | tail -1 | grep -q PASS && echo "graphics quality test PASS" || { echo "FAILED: graphics quality test"; fail=1; }
timeout 600 node test/bodygen.test.mjs | tail -1 | grep -q PASS && echo "generated bodies test PASS" || { echo "FAILED: generated bodies test"; fail=1; }
timeout 600 node test/pathfinding.test.mjs | tail -1 | grep -q PASS && echo "pathfinding test PASS" || { echo "FAILED: pathfinding test"; fail=1; }
timeout 600 node test/assembly.test.mjs | tail -1 | grep -q PASS && echo "joints and assemblies test PASS" || { echo "FAILED: joints and assemblies test"; fail=1; }
timeout 600 node test/library.test.mjs | tail -1 | grep -q PASS && echo "toolbox catalog test PASS" || { echo "FAILED: toolbox catalog test"; fail=1; }
timeout 600 node test/luau.test.mjs | tail -1 | grep -q PASS && echo "luau test PASS" || { echo "FAILED: luau test"; fail=1; }
timeout 600 node test/tween.test.mjs | tail -1 | grep -q PASS && echo "tween test PASS" || { echo "FAILED: tween test"; fail=1; }
timeout 600 node test/raycast.test.mjs | tail -1 | grep -q PASS && echo "raycast test PASS" || { echo "FAILED: raycast test"; fail=1; }
timeout 600 node test/camera.test.mjs | tail -1 | grep -q PASS && echo "camera test PASS" || { echo "FAILED: camera test"; fail=1; }
timeout 600 node test/editor-commands.test.mjs | tail -1 | grep -q PASS && echo "editor commands test PASS" || { echo "FAILED: editor commands test"; fail=1; }
timeout 600 node test/animation.test.mjs | tail -1 | grep -q PASS && echo "animation test PASS" || { echo "FAILED: animation test"; fail=1; }
timeout 600 node test/terrain.test.mjs | tail -1 | grep -q PASS && echo "terrain test PASS" || { echo "FAILED: terrain test"; fail=1; }
timeout 600 node test/placefile.test.mjs | tail -1 | grep -q PASS && echo "place file test PASS" || { echo "FAILED: place file test"; fail=1; }
vt=$(timeout 900 npx vitest run web/modeling/kernel test/modeling.test.mjs test/csg.test.mjs 2>&1); echo "$vt" | grep -q "Tests .*passed" && ! echo "$vt" | grep -q "failed" && echo "modeling tests PASS ($(echo "$vt" | grep -o "Tests .*passed[^)]*"))" || { echo "FAILED: modeling tests"; fail=1; }
timeout 600 node test/paint.test.mjs | tail -1 | grep -q PASS && echo "brush engine test PASS" || { echo "FAILED: brush engine test"; fail=1; }
timeout 600 node test/vector.test.mjs | tail -1 | grep -q PASS && echo "vector geometry test PASS" || { echo "FAILED: vector geometry test"; fail=1; }
timeout 600 node test/vector-ops.test.mjs | tail -1 | grep -q PASS && echo "vector booleans/gradients/trace test PASS" || { echo "FAILED: vector booleans/gradients/trace test"; fail=1; }
timeout 600 node test/resample.test.mjs | tail -1 | grep -q PASS && echo "resample test PASS" || { echo "FAILED: resample test"; fail=1; }
timeout 600 node test/selection.test.mjs | tail -1 | grep -q PASS && echo "selection test PASS" || { echo "FAILED: selection test"; fail=1; }
timeout 600 node test/layerfile.test.mjs | tail -1 | grep -q PASS && echo "layer file test PASS" || { echo "FAILED: layer file test"; fail=1; }
timeout 600 node test/develop.test.mjs | tail -1 | grep -q PASS && echo "develop test PASS" || { echo "FAILED: develop test"; fail=1; }
timeout 600 node test/sequences.test.mjs | tail -1 | grep -q PASS && echo "particle datatypes test PASS" || { echo "FAILED: particle datatypes test"; fail=1; }
timeout 600 node test/completions.test.mjs | tail -1 | grep -q PASS && echo "completions test PASS" || { echo "FAILED: completions test"; fail=1; }
timeout 600 node test/luaucheck.test.mjs | tail -1 | grep -q PASS && echo "script checker test PASS" || { echo "FAILED: script checker test"; fail=1; }
timeout 600 node test/charmaker.test.mjs | tail -1 | grep -q PASS && echo "character maker test PASS" || { echo "FAILED: character maker test"; fail=1; }
timeout 600 node test/rigmesh.test.mjs | tail -1 | grep -q PASS && echo "rigmesh test PASS" || { echo "FAILED: rigmesh test"; fail=1; }
timeout 600 node test/maker.test.mjs | tail -1 | grep -q PASS && echo "character maker page test PASS" || { echo "FAILED: character maker page test"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
