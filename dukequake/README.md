# Duke × Quake

One engine running both games' own rules. See [PLAN.md](PLAN.md) for the design and the merge points.

## Status (2026-10-07): phase 1 done, Quake's rules core

`engine/` is id's Quake server ported to Rust from the GPL source, line by line: the QuakeC interpreter (`pr_exec.c`), edicts and map entities (`pr_edict.c`), all 79 builtins (`pr_cmds.c`), collision and traces (`world.c`), physics for every movetype (`sv_phys.c`), monster walking (`sv_move.c`) and player movement (`sv_user.c`). It runs the shareware's own `progs.dat`, so every monster, weapon, door and item is id's 1996 QuakeC.

**Checked against the original:** `oracle/` builds id's C (WinQuake) as a headless server, and `oracle/run.sh` plays both side by side with a random player: 9 maps (start, E1M1–E1M8) × 4 skills × 2 frame rates, 1,500 frames each. After every frame it compares every field of every entity and every named global. **72 of 72 runs match bit for bit**, including combat, monster AI, glibc `rand()`, deaths and pickups. A 0.25% change to friction on the Rust side is caught on frame 1, so the comparison is live.

The oracle runs id's C with SSE math (not 1996's x87), so x87 rounding is not checked. Messages to the client are not compared (they don't change game state).

Speed: E1M1 spawns in 9 ms, and 200 frames take 7 ms. The crate builds for `wasm32-unknown-unknown`.

## Run

```sh
dukequake/fetch.sh                      # shareware PAK0.PAK + id's source into dukequake/data
cd dukequake/engine
cargo run --release --example headless -- ../data/id1/pak0.pak e1m1 200
dukequake/oracle/run.sh [frames]        # needs gcc-multilib (32-bit) for id's C
```

## Files

| Path | What |
|---|---|
| `engine/src/progs.rs` | progs.dat, strings, entity memory laid out as the C engine does |
| `engine/src/server.rs` | QuakeC VM, edict alloc/free, map entities, SpawnServer, client connect, the frame, glibc `rand()` |
| `engine/src/world.rs` | area nodes, hull traces (`SV_Move`) |
| `engine/src/phys.rs` | `sv_phys.c` |
| `engine/src/user.rs` | `sv_user.c` |
| `engine/src/movestep.rs` | `sv_move.c` |
| `engine/src/cmds.rs` | `pr_cmds.c` builtins |
| `engine/src/bsp.rs`, `pak.rs`, `mathlib.rs`, `defs.rs` | data and maths |
| `oracle/harness.c`, `stubs.c` | drive id's C headless and dump state each frame |
| `engine/examples/oracle.rs` | the comparison, plus the random-player generator |
