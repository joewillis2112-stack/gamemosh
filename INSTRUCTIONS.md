# INSTRUCTIONS: rewriting and moshing games

This is how to rebuild a game in Rust with AI agents, and how to "mosh" (merge) two or more of those rebuilds into one game.

Sources, gathered 2026-10-03, are listed at the bottom. Each claim is tagged with where it came from:
- **[mashup]**: chasmlol/2010-rust-rewrite-mashup
- **[legaia]**: legend-of-legaia-re
- **[re-skill]**: vgrichina/re-skill
- **[bun]**: the Bun Zig→Rust port write-up
- **[ours]**: what this repo learned
- **[merges]**: the 2026-10-05 survey of true game merges

For what to mosh, see `mashup-research/`. For working rules, see `RESEARCH.md`.

---

## 0. What "gamemoshing" is

- **It's several independent rewrites joined by a host.** The viral MW2 + Minecraft + Skate 3 build is three separate Rust rewrites (IW4L, MinecraftOSS, skate-3-rust-engine). One of them, the host, owns the screen. The others are plugged in as gameplay modules. [mashup]
- **Nothing from the original games ships.** Each piece reads data from the player's own copy, or downloads it from the official server on first run. The original games never run. [mashup]
- **The same creator also made SkyCraft (Minecraft inside Skyrim).** It uses the same pattern. [heldgames]
- **A mosh is one game, not two games behind a menu.** You play a single world in which both games are running at once: MW2's guns in Minecraft's world, Minecraft's player inside Skyrim's. Game Corner Arcade (`gamecorner/`) is a game-in-game, an arcade you walk up to, and the user rejected it as "an arcade menu where I get to choose which game". [ours]
- **The pattern that makes "two games as one": one game draws, the other runs hidden.** In SkyCraft, Skyrim draws everything and Minecraft runs underneath as the player. In Pokécraft (`pokecraft/`), Minecraft's world generator makes the land and the page draws it in first person, while Pokémon Red runs hidden for battles, menus, party and shops. Its HUD, menus and text are drawn on top of the Minecraft world, and battles happen in that world. The question to ask is which game owns the world and which owns the player or the rules. [ours]
- **Match the reference's viewpoint.** If players know a mosh from a famous mod (Pixelmon for Pokémon + Minecraft), build its view and core loop first. A 2D top-down Minecraft world was rejected as "a dumbed down version of the old Pokémon games". [ours]
- **A merge means the systems touch, not the assets.** The user's gold example is the Rocket League car and ball in GTA V. RL's physics is rewritten and checked 1:1 against RocketSim. GTA's city becomes RL's collision, so the ball pinches against parked cars. RL's demolition maths decides a hit, and GTA's ragdolls and explosions carry it out. GTA's own weapons are mounted on the RL car. The control case: Rocket League's licensed Batmobile is a skin on a standard hitbox, an asset swap. Apply the merge test in §B8 before calling something a mosh. Examples are in `mashup-research/MERGE_EXAMPLES.md`. [merges]
- **"Gamemosh" is a community nickname.** No guide uses it. The working phrases are "Rust rewrite mashup" and "games rebuilt inside other games". [ours: searches]

There are two separate jobs: **A. rewrite** a game (or find an existing rewrite), and **B. mosh** rewrites together. Job A is almost always the expensive one.

---

## A. Rewriting a game with agents

### A1. Pick a target you can actually finish

Easiest first (details in `RESEARCH.md` §3):
1. A Rust rewrite or runtime already exists, so skip to part B.
2. Official source release or full decompilation: port readable C.
3. The engine ships readable code (LÖVE, PICO-8, C#/XNA/Unity Mono, Godot, RPG Maker, Ren'Py, Scratch).
4. Formats are documented by a community.
5. Raw binary. For small NES, Game Boy or DOS games, use **re-skill** (A6). Otherwise avoid.

AI rewrites are fast (IW4L took ~3 weeks of public history, Skate 3 ~4) only because years of human reverse-engineering already existed. [mashup, skate README]

### A2. Set up the repo so agents can work in it

- **`CLAUDE.md` is a map, not a manual.** Each row is one line plus a link, and the specs live in `docs/`. [legaia]
- **One doc page per file format.** Each page records where every fact came from and a confidence level (Confirmed, Inferred or Unknown). "Read the relevant page before writing a parser; don't guess from the data." [legaia]
- **Keep a journal outside git.** Use one folder per task, made of numbered slices named `<N>-<NAME>-<SUFFIX>`. The suffix says whose move it is: `-FINAL` (done), `-PART` (another agent continues) or `-READY` (waiting on a human playtest or decision). "Knowledge that is not in an artifact does not exist for the next agent." Old slices are never rewritten; corrections go in a new slice. [mashup CONTEXT.md]
- **Keep a dead-ends log.** After about 10 unproductive tool calls on one approach, write down what failed and move on. [re-skill]
- **Keep a symbol table** (`labels.csv`) that every tool loads, so discoveries compound across sessions. [re-skill]
- **Never commit game data.** Use `extracted/` (gitignored). Tests that need the disc skip when its env var (e.g. `LEGAIA_DISC_BIN`) is unset, so CI runs without game data. [legaia]

### A3. Build the judge before translating

- **Parity oracles first.** Use traced dumps, demo playback (Doom-style demos), emulator-run screenshots and save-state comparisons. "Given these inputs, does the port produce the same output?" Check the judge itself against known-good and known-broken code. [bun, legaia, re-skill]
- **Visual check.** Show the extracted assets next to a live emulator (re-skill's `catalog.html`).
- **Make the simulation deterministic.** Use one funnel, `TickInput → sim::step → Snapshot`, for authority, prediction and replay, on a fixed tick (IW4L: 17 ms physics step). Then replays become tests. [mashup docs/SIM-STEP.md, IW4L.md]

### A4. Run translation as a pipeline, not one big prompt

1. **Write a rulebook.** Cover type mappings, ownership, error handling, unsafe policy, and when to escalate. When reviewers keep finding the same mistake, update the rulebook and regenerate the affected files. [bun]
2. **Map dependencies.** Know which modules come first, which can run in parallel, and which need judgement rather than mechanical translation. [bun]
3. **Do a disposable trial.** Port about 3 files and throw the result away. The improved process is the deliverable. [bun]
4. **Separate implementers from reviewers.** Reviewers assume the code is wrong and don't inherit the implementer's reasoning. [bun]
5. **Queue the failures.** Each stage's failures become the next batch of work: compiler errors, then smoke tests, then behaviour parity, then performance. Bun's first pass "didn't work at all", and the loop is what finished it. [bun]
6. **Parallelise carefully.** Run several agents in separate git worktrees (Bun peaked at 64 agents across 4 worktrees). The mashup gives each agent its own clone (`make mr new/ship`). [bun, mashup]

### A5. Keep the port faithful, and allow extras

- **Retail behaviour is the ground truth**, and a retail-faithful mode always stays available and testable. [legaia]
- **Enhancements are toggles.** When a toggle is off, output must be bit-identical to retail. [legaia]
- **"Port" doesn't mean 1:1.** New mechanics are in scope, which matters for moshing. [legaia]

### A6. Tiny ROM games: re-skill

re-skill is a Claude Code skill. Install it to `~/.claude/skills/re`, then run `/re path/to/rom.nes`.

Its pipeline:
1. identify
2. decompress
3. build a custom disassembler
4. extract assets to PNG
5. map the data structures
6. validate against an emulator
7. HTML5 web port

It supports NES, Game Boy and DOS; adding a CPU means writing one `instruction_set.py`. It produced a Battle City web port. [re-skill]

### A7. Before shipping

- **Strip the scaffolding.** Read your own diff and ask of every probe, test and debug print: "what breaks tomorrow if this is gone?" If the answer is nothing, delete it now. [mashup]
- **No traces of the dig.** No retail addresses or offsets (`FUN_…`, `DAT_…`) and no "as in the original" comments. The code should read as a standalone runtime. [mashup]

---

## B. Moshing rewrites together

### B1. Choose the host

The **host** owns the window, renderer, camera, game state, input routing and save system. **Guests** contribute logic: physics, worldgen, AI, rules or minigames. In the reference mashup, IW4L is the host. Its own comment reads: "Rendering and match ownership remain in IW4L." [mashup `render_anim/src/skate.rs`]

Pick the host by:
- **Perspective.** The game whose camera and controls the player uses most of the time.
- **Engine.** If two pieces share an engine version, they can run in one app. The Bevy 0.19 / wgpu 29 cluster is IW4L, star-andreas and Davenstein, plus vange-rs on wgpu 29.
- **Platform.** For a phone, the host must already build to wasm.

### B2. Turn each guest into a library

- **Keep the guest's pure-logic crates and drop its GPU code.** The mashup uses MinecraftOSS's server, light solver and mesher "with its GPU binding code left out". It uses skate-3-rust-engine's `skate-core`, `skate-data` and `skate-net`, which depend only on serde. [mashup]
- **Best case: the guest is already split.**
  - Logic-only crates: `chipcore`, the Taipan `engine/` folder, `pokered-core`, pokemon-showdown-rs.
  - Bevy plugin sets: Davenstein, star-andreas.
  - Framebuffer runtimes: pico-r, Iron Wolf, SDLPoP-rs.
- **Worst case: one monolithic binary.** Then the first agent task is to split a library out of it.

### B3. Connect host and guest

| Pattern | When | Example |
|---|---|---|
| **Worker thread + messages** | The guest has its own loop or heavy state | Skate: `Job::{Activate, Step, Suspend}` in, `Reply::{Ready, Activated, Pose, Error}` out, over `mpsc` channels. The host sends input frames and reads back poses. [mashup] |
| **Same-app plugins** | Same engine version | Add Davenstein's `EnemiesPlugin` to the star-andreas `App` |
| **Framebuffer swap** | 2D/retro guests | The guest renders 128×128 or 320×200 pixels; the host shows it as a texture or a full screen. pico-r exports `web_update` / `web_get_pixel_buffer` / `web_set_buttons` |
| **Browser bridge** | Both are wasm on one page, or Flash | Ruffle in a DOM overlay, with JS passing scores between them |

### B4. Make the worlds agree

- **Coordinates and units.** Convert at the boundary only. MW2 uses inches with Z up and Skate uses metres with Y up, so the converter is `to_skate(p) = (p.x, p.z, -p.y) * 0.0254` and back. [mashup `skate/collision.rs`]
- **Collision.** Feed the guest the host's **collision** geometry, not its visible triangles: "invisible player clips and solid props must remain solid." In streaming worlds, rebuild a local window around the player. The skate mashup uses ±40 blocks across, ±20 vertically, and rebuilds after 14 m of movement. [mashup]
- **Derive what the guest expects from host data.** The mashup finds grind rails automatically in any MW2 map: walkable edges where the ground drops away, merged into rails. [mashup `skate/rails.rs`]
- **Animation.** Retarget the guest skeleton onto the host's: map Skate 3's bones onto the MW2 soldier. [mashup `skate/rig.rs`]
- **Rules.** Translate between the games' systems instead of bolting one on:
  - block hardness scaled by each MW2 gun's real damage and range
  - grenades act as TNT
  - guns become hotbar items
  - the Minecraft inventory is restyled in MW2's look
  [mashup README]

### B5. Switching modes and control

- **Give control to one side explicitly.** The mashup toggles skate mode with J or by clicking both sticks. While skating, the soldier hands control to the skate worker; on exit the worker is suspended. [mashup]
- **Pause the inactive side.** Suspend the guest instead of ticking it in the background. It's cheaper, especially on phones.

### B6. Game data at runtime

- **First-run setup.** Find the user's install (or ask for it), extract only what's needed into a cache folder (`skate-data/`), and save the paths in `.env`. Never modify the game folders. [mashup `launcher/src/first_run.rs`]
- **Official downloads where they exist.** Minecraft 26.3 files are fetched from Mojang, pinned by SHA-1 like the launcher does (~125 MB, then offline). [mashup `assets/src/minecraft_setup.rs`]
- **Free data where it exists:** Wolf3D and Doom shareware, Freedoom, the PICO-8 BBS, and in-repo assets for open-pokered, SDLPoP-rs and chipdx.

### B7. Engine version mismatches

- **Same Bevy/wgpu version:** one app, one GPU device.
- **Different versions:** either upgrade the older piece (DukeNukemRust on Bevy 0.14 would need porting first), or render the guest on its own device and copy the texture across. Ruffle is on wgpu 30 against the cluster's 29.
- **In the browser this matters less.** Separate wasm modules can share one page.

### B8. Make the systems touch: the merge test

Merging assets is easy and doesn't count. Before shipping, score the mosh against the 14 questions in `mashup-research/MERGE_EXAMPLES.md` §3. The ones that matter most:

1. **Rules, not looks.** The guest's thing obeys the guest's original rules 1:1, and a test proves it. The RL core is checked tick by tick against RocketSim and `cargo test` enforces the tolerances. Pokécraft's battles are pokered itself. [merges]
2. **One owner per body.** Every object is simulated by exactly one game; the other only draws it or reacts to it. GTA physics is switched off on the RL car and ball, and the Rust sim teleports them each frame. Two physics engines must never fight over one body. [merges]
3. **The host world is the guest's level, translated into the guest's geometry.** Use GTA ray probes for RL contact planes, Minecraft blocks for SM64 triangles, and Skyrim Havok shapes copied out. Generate what the guest's moves need: quarter-pipes where floors meet walls let the RL car drive up buildings, and Minecraft stairs become 45° ramps for Mario. Map materials too: lava burns, water sets the water level. [merges]
4. **Guest rule, host consequence.** The guest decides an outcome with its own maths, and the host carries it out with its own verbs, so the host's AI, police and factions react for free. RL demolition then becomes `EXPLODE_VEHICLE`; a Pokérim capture puts the NPC in a Skyrim faction. [merges]
5. **Each game's verbs act on the other's actors.** Mario stomps Minecraft mobs; Cappy captures SM64 enemies; portals carry TNT; GTA's guns are mounted on the RL car. [merges]
6. **Bridge economy, health and powers.** At least one resource crosses (XP orbs heal Retro64 Mario). Damage counts on both sides (the SM64 power meter mirrors hearts). The host's powers still work while you use the guest's thing (GTA story abilities in the RL car). [merges]
7. **Fill an interaction matrix.** Put each game's systems on the rows and the other game's objects on the columns. Each cell is a test asserting that something happens. Empty cells are where it's still two games. [ours]

**Architecture that scales:** an engine-agnostic guest core behind a C ABI, plus thin per-host adapters (collision, rendering, input, entity effects). One RL core runs in GTA, Minecraft, Skyrim and Bevy; libsm64 runs in GMod, Minecraft, Rocket League, GTA SA, GZDoom and more. Run the guest at its own fixed step and interpolate poses (RL at 120 Hz in GTA, SM64 at 30 Hz in Minecraft). Where the host streams the world around its player, keep the host's player hidden under the guest (Skyrim RL) or parked (Pokécraft). [merges]

---

## C. Getting a mosh running on a phone

1. **The target is `wasm32-unknown-unknown` in a mobile browser.** Skip native app stores. Single-file HTML, as Gloamreach does it, is the easiest to share. [ours]
2. **Prefer guests with no C dependencies.** C code needs emscripten or a wasi-sdk setup: balatro-port-tui's vendored Lua blocks wasm, and doukutsu-rs's forked SDL does too. pico-r has zero JS imports and a hand-written Lua VM. [round 2]
3. **Bundle the data.** Browsers block cross-origin fetches from game servers, and phones have little storage. Use free or in-repo data, or let the user pick a file in the tab (Legaia reads your disc image locally). Keep the total download small; vange.rs is 10 MB of wasm with its data.
4. **Add touch controls.** Use an on-screen stick and buttons, mapped to the host's input frame and forwarded to the guest. Several candidates don't have them yet (pico-r doesn't).
5. **One tick owner.** The host's `requestAnimationFrame` loop steps the active guest a fixed number of ticks (Wolf3D 70 Hz, PICO-8 30/60 Hz, Doom 35 Hz) with an accumulator. [ours: fixed-step lessons]
6. **Test headless, then on a real device.** Use Playwright mobile emulation at 390×844 with touch. Swiftshader runs at about 4 fps, so wait on game time, not wall time. Real-phone frame rate is the final judge. [ours]

---

## D. Recipe for an agent (copy into a task prompt)

1. Read `RESEARCH.md`, this file and `mashup-research/SHORTLIST.md`.
2. Pick the host and guests. Write down who owns render, input, state and tick.
3. Clone each piece. Confirm it builds natively, then for `wasm32-unknown-unknown`. Note any C dependencies.
4. Turn each guest into a library (B2). Build a minimal host that runs the guest alone in the browser.
5. Add the connection pattern (B3), unit conversion, collision and rules mapping (B4), and the mode switch (B5). Then run the merge test (B8): write the interaction matrix and fill its cells.
6. Bundle the data (B6, C3) and add touch controls (C4).
7. Run headless mobile tests, then a gametest agent playthrough. Fix everything it finds.
8. Strip the scaffolding (A7). Merge to `main`. Log the lessons in `RESEARCH.md`.

---

## Sources

- chasmlol/2010-rust-rewrite-mashup: `README.md`, `AGENT.md`, `CONTEXT.md`, `docs/INDEX.md`, `docs/SKATE.md`, `docs/IW4L.md`, `crates/render_anim/src/skate.rs` and `skate/{collision,rails,rig}.rs`, `crates/minecraft_terrain/src/lib.rs`, `crates/assets/src/minecraft_setup.rs` (commit f608f85)
- AndrewAltimit/legend-of-legaia-re `CLAUDE.md`
- https://github.com/vgrichina/re-skill
- https://techscoop.substack.com/p/how-claude-rewrote-bun-in-rust-in
- https://heldgames.com/guides/mw2-skate-minecraft-rust-rewrite
- https://www.makeuseof.com/rust-game-mashup-brings-mw2-gunplay-into-minecraft-while-doing-skate-3-tricks/
- **[merges]**: `mashup-research/MERGE_EXAMPLES.md` (2026-10-05). Key sources: https://github.com/lewistardif/RocketLeagueMinecraft (`gta/`, `crates/rl_car_core`, README validation tables), https://github.com/ZealanL/RocketSim, https://github.com/libsm64/libsm64, https://github.com/Zckyy/mario64-in-minecraft
