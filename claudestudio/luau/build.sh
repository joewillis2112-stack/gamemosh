#!/bin/bash
# Build Luau (MIT, github.com/luau-lang/luau) and Claude Studio's binding to
# WebAssembly: web/luau.mjs (wasm embedded). Needs emsdk.
set -e
H="$(cd "$(dirname "$0")" && pwd)"
B="$H/../build"
LUAU_REV="${LUAU_REV:-1eca9fd}"
mkdir -p "$B"
EMSDK="${EMSDK:-$B/emsdk}"
if [ ! -f "$EMSDK/emsdk_env.sh" ]; then
  git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK"
  (cd "$EMSDK" && ./emsdk install latest >/dev/null && ./emsdk activate latest >/dev/null)
fi
export EMSDK_QUIET=1
source "$EMSDK/emsdk_env.sh" >/dev/null
if [ ! -d "$B/luau" ]; then
  git clone -q https://github.com/luau-lang/luau "$B/luau"
  git -C "$B/luau" checkout -q "$LUAU_REV"
fi
emcmake cmake -S "$B/luau" -B "$B/luau-wasm" -DCMAKE_BUILD_TYPE=Release -DLUAU_BUILD_CLI=OFF -DLUAU_BUILD_TESTS=OFF -DCMAKE_CXX_FLAGS=-fwasm-exceptions >/dev/null
cmake --build "$B/luau-wasm" --target Luau.VM Luau.Compiler Luau.Bytecode Luau.Inliner Luau.Ast Luau.Common -j"$(nproc)" >/dev/null
L="$B/luau-wasm"
em++ -O2 -std=c++17 -fwasm-exceptions "$H/binding.cpp" \
  -I"$B/luau/VM/include" -I"$B/luau/Compiler/include" \
  "$L/libLuau.VM.a" "$L/libLuau.Compiler.a" "$L/libLuau.Inliner.a" "$L/libLuau.Bytecode.a" "$L/libLuau.Ast.a" "$L/libLuau.Common.a" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLuau -sENVIRONMENT=web,node -sSINGLE_FILE=1 \
  -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_FUNCTIONS=_cs_init,_cs_run,_cs_step,_cs_fire,_cs_waiting,_cs_unref,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=stringToNewUTF8,UTF8ToString \
  -o "$H/../web/luau.mjs"
ls -la "$H/../web/luau.mjs"
