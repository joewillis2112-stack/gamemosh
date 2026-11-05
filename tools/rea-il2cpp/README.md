# IL2CPP names into REA

Unity IL2CPP games ship their C# compiled to `libil2cpp.so` with no symbols; the
names live in `global-metadata.dat`. Il2CppDumper reads both and writes
`script.json`. `il2cpp-names.mjs` turns that into what an agent applies in its
REA (Ghidra) session:

    node tools/rea-il2cpp/il2cpp-names.mjs script.json out/ --match 'Ad|Revive|Difficulty|Score'

Then, in REA: `open_binary` on `libil2cpp.so`, `binary_overview` (check
`image_base` is 0x100000, or rerun with `--base`), and `set_addresses_names`
with each `out/names-NNN.json`. `out/index.tsv` lists every selected method with
its signature, for grep. Names last only for the REA session.

Test: `node tools/rea-il2cpp/test.mjs` (needs gcc, nm).

## Big binaries: Ghidra headless instead of REA

A real game's `libil2cpp.so` is tens of MB. Ghidra's first full analysis of one
takes far longer than REA's 60-second tool timeout, so REA calls on it time out.
`ApplyNamesDecompile.java` skips the full analysis: import with `-noanalysis`,
create and name only the functions in the batches, decompile the ones asked for.

    analyzeHeadless /tmp/proj p -import libil2cpp.so -noanalysis -deleteProject \
      -scriptPath tools/rea-il2cpp -postScript ApplyNamesDecompile.java out/ 'gameManager$$Start'

Calls to other named functions show by name; calls to unnamed ones stay
`func_0x...` (add them with a wider `--match`). Field offsets are in
Il2CppDumper's `dump.cs` (`// 0x8c` after each field).

Checked 2026-11-05 on Carparim (open-source Unity game, IL2CPP arm64 release
APK, source on GitHub): the dump has all 48 classes and methods of its scripts
(the 49th is commented out in the source), and the decompile of
`gameManager$$SonucuKontrolEt` matches the C# line for line (field offsets
from the dump, +20 points, calls by name). About 2 minutes end to end.

