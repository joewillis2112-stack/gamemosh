#!/bin/bash
# Build Claude Studio's script checker (luau/check.cpp + Luau.Analysis) to web/luaucheck.mjs.
# Needs luau/build.sh run first (it fetches emsdk and Luau at the pinned revision).
set -e
H="$(cd "$(dirname "$0")" && pwd)"
B="$H/../build"
export EMSDK_QUIET=1
source "$B/emsdk/emsdk_env.sh" >/dev/null
# Its own build directory: Luau.Analysis needs <cstdlib> forced in under emscripten's libc++
# (TableLiteralInference.cpp calls std::abs(int) without including it); the runtime's build stays as it is.
L="$B/luau-check-wasm"
emcmake cmake -S "$B/luau" -B "$L" -DCMAKE_BUILD_TYPE=Release -DLUAU_BUILD_CLI=OFF -DLUAU_BUILD_TESTS=OFF "-DCMAKE_CXX_FLAGS=-fwasm-exceptions -include cstdlib" >/dev/null
cmake --build "$L" --target Luau.Analysis -j"$(nproc)" >/dev/null
em++ -O2 -std=c++17 -fwasm-exceptions "$H/check.cpp" \
  -I"$B/luau/Analysis/include" -I"$B/luau/Ast/include" -I"$B/luau/Common/include" -I"$B/luau/Config/include" -I"$B/luau/EqSat/include" -I"$B/luau/Compiler/include" -I"$B/luau/VM/include" \
  "$L/libLuau.Analysis.a" $(ls "$L"/libLuau.*.a | grep -v Analysis) \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLuauCheck -sENVIRONMENT=web,node -sSINGLE_FILE=1 \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB -sEXPORTED_FUNCTIONS=_lc_init,_lc_check,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=stringToNewUTF8,UTF8ToString \
  -o "$H/../web/luaucheck.mjs"
ls -la "$H/../web/luaucheck.mjs"
