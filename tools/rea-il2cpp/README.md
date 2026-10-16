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
