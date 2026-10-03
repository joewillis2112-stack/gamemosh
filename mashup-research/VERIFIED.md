# Game mashup research: verified candidates

Checked 2026-10-03. Every repo below was cloned anonymously (`git clone --bare --filter=blob:none`) or fetched, so it exists. "Last activity" is the date of the newest commit on the default branch. "First commit" and commit counts come from full history clones where noted. File counts are from the HEAD tree.

AI-written evidence key:
- **yes**: the README says so, or commits carry AI co-author trailers.
- **likely**: agent config files (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, `GEMINI.md`) or agent workflow folders, but no explicit statement.
- **no**: predates coding agents, or says it was hand-written.
- **unknown**: no evidence either way.

> **Corrections from the filter pass and spot checks (2026-10-03).** These override the entries below:
> - **A3 Iron Doom** is not a full port. It's 6.6k lines covering only the title screen, screen melt and world view.
> - **A14 DukeNukemRust**'s own `assessment.md` calls it a "~19% prototype". That was written at 8k lines, and it's now 40.5k lines. Treat it as partial and unverified.
> - **A17 star-andreas** is real and every commit is co-authored by Claude, but it's young: 20 commits between 2026-10-02 and 2026-10-03.
> - **A26 VERA20k** has 4,603 commits between 2026-03-29 and 2026-10-03.
> - **A57 skate-3-rust-engine** was missing and has been added at the end of Section A.

---

## Section A: Already rebuilt in Rust

### Reference: the mashup itself
#### A0. MW2 + Skate 3 + Minecraft: 2010 Rust Rewrite Mashup
- Type: real
- Project: chasmlol/2010-rust-rewrite-mashup, https://github.com/chasmlol/2010-rust-rewrite-mashup
- Covers: IW4L's MW2 runtime with a Skate 3 mode (press J) and an endless Minecraft 26.3 world map. Vendors 5 MinecraftOSS crates in `third_party/minecraftoss` and Skate code in `skate/`.
- Status: last commit 2026-10-02. Windows release zip.
- AI-written: yes. MakeUseOf quotes the creator calling it "basically 100% vibe coded" with Claude Opus 5.5, though the Minecraft part needed weeks of manual tuning.
- Data: your own MW2 (Steam), optionally your Xbox 360 Skate 3 `default.xex` + `data`. Minecraft files are downloaded from Mojang's servers on first run (~125 MB).
- Browser/WASM: no

### First-person shooters
#### A1. Call of Duty: Modern Warfare 2 (2009): IW4L
- Type: real
- Project: https://github.com/vladtrc/iw4L
- Covers: partial. Multiplayer maps, movement, combat, bots, GSC script runtime, demo record/replay, and D3D9 SM3 shaders translated to WGSL. The README says "Gameplay remains incomplete". Its asset readers also cover MW3 and Black Ops.
- Status: last 2026-10-02. First commit 2026-09-13, 120 commits, about 1,200 .rs files.
- AI-written: yes. The README says "This whole project is written by an LLM." Commits are co-authored by Claude Opus 5.5.
- Data: your installed MW2 multiplayer (Steam). Nothing is redistributed.
- Browser/WASM: no (Windows release; builds on Linux/macOS)

#### A2. Doom: ROOM4DOOM ("Rusted Doom")
- Type: real
- Project: https://github.com/flukejones/room4doom
- Covers: full game. Transliterated from Doom C, then refactored. The README claims "complete demo compatibility with OG Doom", plus software 2.5D/3D renderers, OPL2 music and voxels.
- Status: last 2026-08-11 (OpenXR stereo output was being added)
- AI-written: unknown. No agent files.
- Data: IWAD (shareware DOOM1.WAD works; Freedoom also usable)
- Browser/WASM: unknown

#### A3. Doom: Iron Doom
- Type: real
- Project: https://github.com/Henrique194/iron-doom
- Covers: full source port. "Developed entirely in Rust", built on the Chocolate Doom codebase, ECS architecture, demo compatibility work.
- Status: last 2025-09-12
- AI-written: unknown
- Data: IWAD
- Browser/WASM: unknown

#### A4. Doom 1/2: rust-doom (cristicbz)
- Type: real
- Project: https://github.com/cristicbz/rust-doom
- Covers: level renderer and walk-around only. The README says it is "not a port of the original Doom C source", written from the Doom Wiki and Unofficial Doom Specs.
- Status: last 2021-10-25 (dormant)
- AI-written: no (written around 2015 while the author learned Rust)
- Data: WAD (the README links a shareware WAD)
- Browser/WASM: no

#### A5. Wolfenstein 3D: Iron Wolf
- Type: real + browser
- Project: https://github.com/Ragnaroek/iron-wolf. Web version: https://wolf.ironmule.dev/
- Covers: full game, aiming for a "pixel-perfect, mod-friendly recreation". E1M1 demo shown.
- Status: last 2026-09-19
- AI-written: unknown (no agent files)
- Data: shareware .WL1 files are checked into the repo. You can upload full-game files to the web version.
- Browser/WASM: yes

#### A6. Wolfenstein 3D: Davenstein
- Type: real
- Project: https://github.com/Ophois47/Davenstein
- Covers: full ground-up recreation in Bevy, with release packages for Windows, Linux, macOS, FreeBSD and Android
- Status: last 2026-08-06. First commit 2025-12-16, 641 commits.
- AI-written: unknown. Only Visual Studio Copilot index files are committed under `.vs/`.
- Data: ships its own `assets.pak` (the repo holds ~900 png/wav/ogg asset files)
- Browser/WASM: no

#### A7. Wolfenstein 3D: Rustenstein 3D (AdRoll)
- Type: real
- Project: https://github.com/AdRoll/rustenstein
- Covers: a "prototype" port from a 2022 company hack week. Partial.
- Status: last 2022-04-07
- AI-written: no
- Data: shareware .WL1 files placed in `data/` (the README links archive.org)
- Browser/WASM: no

#### A8. Wolfenstein 3D (style): wolf3d-reimpl-rs
- Type: real
- Project: https://github.com/hamzaq2000/wolf3d-reimpl-rs
- Covers: partial. Raycasting, textures, sprites, doors, walking and shootable enemies, custom maps.
- Status: archived; last 2026-03-25
- AI-written: unknown
- Data: bundled png/bmp textures
- Browser/WASM: no

#### A9. Quake: Richter
- Type: real
- Project: https://github.com/cormac-obrien/richter
- Covers: partial. A pre-alpha engine whose client is "nearly alpha-ready".
- Status: last 2021-06-29 (abandoned; Seismon continues it)
- AI-written: no
- Data: Quake .pak files
- Browser/WASM: no

#### A10. Quake: Seismon
- Type: real
- Project: https://github.com/eira-fransham/seismon
- Covers: partial. A rewrite of Richter as Bevy components. The `bevy` branch "can load and play demos from any level in Quake 1, as well as Hipnotic and Rogue". The default branch is mid-migration (QuakeC VM via bevy_mod_scripting, maps via bevy_trenchbroom).
- Status: last 2026-03-04
- AI-written: unknown
- Data: Quake paks
- Browser/WASM: unknown

#### A11. Quake (PS1 port): quake-psx
- Type: real (targets the original PlayStation)
- Project: https://github.com/EBonura/quake-psx
- Covers: the full shareware episode (Start + E1M1–E1M8), with weapons, monsters, BSP collision, audio and menus. Tested on real PS1 hardware.
- Status: last 2026-10-01. First commit 2026-08-25, 150 commits.
- AI-written: unknown (no agent files; PROVENANCE.md covers code lineage only)
- Data: Quake shareware, downloaded and "cooked" locally (not tracked in git)
- Browser/WASM: no (PS1 executable, runs in emulators)

#### A12. Quake / Quake II / Quake III / QuakeWorld: Quake Anthology (Rust)
- Type: real
- Project: https://github.com/mgd34msu/Quake-Anthology-Rust (port of https://github.com/mgd34msu/Quake-Anthology-TS)
- Covers: partial. According to the repo description, headless simulation runs (startup, server ticks, client seats, demos) while windowed GL, audio and sockets are still "landing". The TypeScript original is at v1.0.0.
- Status: last 2026-10-03. First commit 2026-09-29, 589 commits in 5 days, ~2,087 .rs files.
- AI-written: unknown, but the pace and agent-style "lane/final-b" merge naming point that way. Neither README makes a statement.
- Data: your Quake game files
- Browser/WASM: unknown

#### A13. Quake III Arena: C2Rust translation (Immunant)
- Type: real
- Project: https://github.com/immunant/ioq3 (branches `transpiled` and `quake3-rs`). Write-up: https://immunant.com/blog/2020/01/quake3/
- Covers: the full ioquake3 game, machine-translated C to unsafe Rust with the C2Rust tool
- Status: master last 2020-01-10 (dormant)
- AI-written: no (C2Rust is a deterministic transpiler)
- Data: your Quake 3 paks (the demo pak works for ioq3)
- Browser/WASM: no

#### A14. Duke Nukem 3D: DukeNukemRust
- Type: real
- Project: https://github.com/NicholasMeacoe/DukeNukemRust
- Covers: claims full game in Bevy + Rapier: 4-episode campaign (44 maps), 12 weapons, all enemies and bosses, a CON script VM. The original C source is a submodule.
- Status: last 2026-09-30. First commit 2026-08-28, 125 commits.
- AI-written: likely. It has `conductor/` track folders with spec.md/plan.md per feature, a Gemini-CLI-Conductor-style layout, but no explicit statement.
- Data: your `duke3d.grp` (shareware, Atomic or modern release)
- Browser/WASM: no

#### A15. Half-Life 2: HL2-RS
- Type: real
- Project: https://github.com/kvalls/hl2-rs
- Covers: partial. Loads maps, models, textures, animations and sounds, with a playable preview on trainstation maps. "The full campaign is not playable yet."
- Status: last 2026-10-03 (4 commits, all 2026-10-03)
- AI-written: yes. The README says "an AI-assisted project developed with OpenAI Codex and GPT-6", using the universal-modder Codex plugin.
- Data: your installed Steam HL2 (Windows)
- Browser/WASM: no

#### A16. Half-Life 1 (GoldSrc): Lambda
- Type: real
- Project: https://github.com/EngineersBox/Lambda
- Covers: asset viewer and engine base. "GoldSrc style engine with BSP v30 and WAD3 map support".
- Status: last 2024-07-30
- AI-written: no/unknown
- Data: your HL1 BSP/WAD files
- Browser/WASM: no

### RPG / open world
#### A17. GTA San Andreas: star-andreas (sa-rs)
- Type: real
- Project: https://github.com/dntAtMe/star-andreas
- Covers: partial. A world renderer with streaming, peds with IFP animation, drivable cars using handling.cfg, collision and knockable props. A side experiment drives StarCraft II units through a retail SC2 client.
- Status: last 2026-10-03. First commit 2026-10-02, 20 commits.
- AI-written: yes. Every commit is co-authored by "Claude Opus 5.5".
- Data: your PC 1.0 install
- Browser/WASM: no

#### A18. GTA III: gta3-rebuild-rust
- Type: real
- Project: https://github.com/adamk324/gta3-rebuild-rust
- Covers: asset pipeline only (ISO extraction, PS2 TXD parsing, frontend render). "Not yet a playable GTA III remake."
- Status: last 2026-09-27 (16 files)
- AI-written: yes. The repo description says "A Passionate Vibecoded project".
- Data: your GTA III PS2 ISO
- Browser/WASM: no

#### A19. Oblivion / Fallout 3 / New Vegas / Skyrim SE / Fallout 4 / Starfield: ByroRedux
- Type: real
- Project: https://github.com/matiaszanolli/ByroRedux
- Covers: engine rebuild in Rust + Vulkan with ray tracing. It loads cells from ESM + BSA, with screenshots of Whiterun, Anvil and Goodsprings. It is a world loader and renderer, not full gameplay.
- Status: last 2026-10-03. First commit 2026-03-28, 5,279 commits.
- AI-written: yes. 1,441 commits are co-authored by Claude Opus 4.6/4.7, and there are `.claude/agents/`.
- Data: your Bethesda game installs
- Browser/WASM: no

#### A20. Fallout 3: OpenFallout3
- Type: real
- Project: https://github.com/sofia-gros/OpenFallout3
- Covers: partial. ESM parsing, rendering, a script VM and dialogue/terminal UI. A Megaton "Moriarty's Saloon" quest vertical slice is in progress.
- Status: last 2026-09-24. First commit 2026-09-06, 72 commits.
- AI-written: likely (CLAUDE.md, AGENTS.md, GEMINI.md, .claude/, .gemini/)
- Data: your Fallout 3
- Browser/WASM: no

#### A21. Fallout 2: Vault13
- Type: real
- Project: https://github.com/pingw33n/vault13
- Covers: partial. "Work in progress and is not playable." You can walk around a demo map (artemple).
- Status: last 2025-12-15
- AI-written: no
- Data: your Fallout 2 install
- Browser/WASM: no

#### A22. Zelda: A Link to the Past: zelda3-rs
- Type: real
- Project: https://github.com/kenerwin88/zelda-rs
- Covers: a Rust port of snesrev/zelda3 (the C reimplementation), with lockstep parity checks against Snes9x. Substantial but not finished. The latest commit records "full-route proof for native inventory tail".
- Status: last 2026-09-13. First commit 2026-06-08, 2,394 commits.
- AI-written: likely (CLAUDE.md, `.claude/skills/parity`)
- Data: your own USA ROM, used for asset generation
- Browser/WASM: unknown

#### A23. Pokémon Red/Blue: open-pokered
- Type: real (Game Boy game) with a browser build
- Project: https://github.com/liuyanghejerry/open-pokered. Web: https://liuyanghejerry.github.io/open-pokered/
- Covers: full game, "fully playable" in English and Chinese, plus an editor suite. It runs on desktop, web, Android, iOS and terminal.
- Status: last 2026-10-02. First commit 2026-08-09, 204 commits.
- AI-written: likely. It has CLAUDE.md, AGENTS.md, `.claude/skills`, and a README section "Why AI agents work well here".
- Data: built from the pret/pokered disassembly. Converted assets are in the repo.
- Browser/WASM: yes

#### A24. Pokémon Showdown (battle simulator): pokemon-showdown-rs
- Type: browser (Showdown is a browser game); battle engine only
- Project: https://github.com/vjeux/pokemon-showdown-rs. Blog: https://blog.vjeux.com/2026/analysis/porting-100k-lines-from-typescript-to-rust-using-claude-code-in-a-month.html
- Covers: partial. A 1-to-1 port of the battle engine with exact parity for Gen 9 random battles. About 50 battles/s single-threaded.
- Status: last 2026-01-25. First commit 2025-12-22, 4,828 commits.
- AI-written: yes ("using Claude Code"; CLAUDE.md)
- Data: Showdown JSON data (moves, items, etc.) is in the repo
- Browser/WASM: no

#### A25. Pokémon battles (original engine): battler
- Type: real/browser-agnostic engine
- Project: https://github.com/jackson-nestelroad/battler
- Covers: a battle engine "based on the Pokémon games", not a port, with AI, a damage calculator and a data service
- Status: last 2026-09-26
- AI-written: unknown (`.agents/AGENTS.md` and `.gemini/GEMINI.md` are present; an optional Gemini player script)
- Data: its own dex data in the repo
- Browser/WASM: unknown (core is `no_std`)

### Strategy / sim
#### A26. Red Alert 2: Yuri's Revenge: VERA20k
- Type: real
- Project: https://github.com/YuriPlanet/vera20k
- Covers: partial, pre-alpha. Local skirmish is playable on Windows against a placeholder AI, with menus, building, harvesting, combat and save/load. Multiplayer, the original AI and the campaign are missing.
- Status: last 2026-10-03. First commit 2026-03-29, 4,603 commits.
- AI-written: yes. The README says "Most of the code is written by AI coding agents that I direct". Behaviour is ported from Ghidra decompilation of gamemd.exe.
- Data: your own Yuri's Revenge
- Browser/WASM: no

#### A27. Red Alert 2 / Yuri's Revenge / Mental Omega: ra2.exe (rust-alert)
- Type: real
- Project: https://github.com/rust-alert/ra2.exe
- Covers: a claimed modern rewrite (GPU renderer, `ra-engine` and a `ra-wasm` WebGL2 target), launched via the npm CLI `@game-gpt/red-alert2` (`ra2 emulate --path`). About 820 .rs files. Completeness was not verified.
- Status: the git commit dates are backdated (2013-01 to 2017-08-12). A web search result shows GitHub activity in Sept 2026.
- AI-written: unknown (the npm scope is "game-gpt"; no statement)
- Data: your RA2/YR MIX/INI install
- Browser/WASM: partial (a `ra-wasm` crate exists; not tested)

#### A28. Age of Empires (1997): OpenAOE → Chariot
- Type: real
- Projects: https://github.com/angered-ghandi/OpenAOE (last 2017-05-09) and https://github.com/ChariotEngine/Chariot (last 2018-04-17)
- Covers: asset loading demo only. "There is no game to be played."
- Status: dormant
- AI-written: no
- Data: your original AoE CD
- Browser/WASM: no

#### A29. OpenTTD (Transport Tycoon Deluxe): OpenTTD-Rust
- Type: real
- Project: https://github.com/dylanfetch/openttd-rust
- Covers: hybrid. An OpenTTD 15.3 fork that swaps individual C++ subsystems for Rust (iterators, UTF-8, string builders, a landscape kernel). It is mostly still C++.
- Status: last 2026-10-02
- AI-written: likely (`.codex/config.toml`, AGENTS.md)
- Data: OpenGFX/OpenSFX (free) or TTD originals
- Browser/WASM: no

#### A30. Jagged Alliance 2: JA2 Stracciatella
- Type: real
- Project: https://github.com/ja2-stracciatella/ja2-stracciatella
- Covers: full game. It is mostly C++ with 53 Rust files (the `stracciatella` crate handles config, mods and file I/O). Not a full Rust rewrite.
- Status: last 2026-10-01
- AI-written: no
- Data: your JA2 data
- Browser/WASM: no

### Platformers / action / puzzle
#### A31. Cave Story: doukutsu-rs
- Type: real
- Project: https://github.com/doukutsu-rs/doukutsu-rs
- Covers: full game, with quality-of-life improvements
- Status: last 2026-09-04. Releases at get.doukutsu.rs (desktop + Android).
- AI-written: no
- Data: freeware Cave Story data (free download), Cave Story+ or Switch files
- Browser/WASM: unknown

#### A32. Prince of Persia (DOS): SDLPoP-rs
- Type: real + browser
- Project: https://github.com/krepl/SDLPoP-rs
- Covers: full game, "verified bug-for-bug identical to the original C build by an automated test harness"
- Status: last 2026-09-12
- AI-written: yes. The README says "AI-assisted with Claude Code", and there are `.claude/agents/pop-porter.md` and `pop-reviewer.md`.
- Data: SDLPoP's data folder (in the repo)
- Browser/WASM: yes (`cargo xtask wasm-serve`)

#### A33. Another World / Out of This World: Another World Suite
- Type: browser
- Project: https://github.com/malandrin/another-world-suite. Play: https://malandrin.github.io/another-world-suite/
- Covers: game engine + debugger + resource viewer. The game runs without sound.
- Status: last 2022-08-11
- AI-written: no
- Data: original game resource files
- Browser/WASM: yes

#### A34. Another World: AWER
- Type: real
- Project: https://github.com/Gnurou/awer
- Covers: full engine (bytecode VM, polygon renderer, optional GPU hi-res)
- Status: last 2025-09-27
- AI-written: no
- Data: original DOS data (or the 20th anniversary edition)
- Browser/WASM: no

#### A35. Lemmings: Rusty Lemmings
- Type: real
- Project: https://github.com/chrishulbert/rusty-lemmings
- Covers: partial rewrite (loads all DOS Lemmings variants' data)
- Status: last 2023-05-05
- AI-written: no
- Data: original Lemmings `.dat` files in `~/Lemmings`
- Browser/WASM: no

#### A36. 3D Pinball Space Cadet: rs-pinball-space-cadet
- Type: real
- Project: https://github.com/dszczyt/rs-pinball-space-cadet
- Covers: partial ("an attempt")
- Status: last 2023-12-28
- AI-written: no/unknown
- Data: `PINBALL.DAT` and related files from Windows XP
- Browser/WASM: no

#### A37. Chromatron: chromatron-oxide
- Type: real + browser
- Project: https://github.com/stared/chromatron-oxide. Play: https://p.migdal.pl/chromatron-oxide/. Write-up: https://quesma.com/blog/chromatron-recompiled/
- Covers: full game, pixel-perfect (307,199 of 307,200 pixels match), decompiled from the Win32/PPC binaries with Ghidra
- Status: last 2026-08-27
- AI-written: yes (Claude Opus 4.6, GPT-5.2-Codex and Cursor, per the blog)
- Data: recovered from the original binary
- Browser/WASM: yes

#### A38. Celeste Classic (PICO-8): celeste-rust
- Type: real
- Project: https://github.com/tehwalris/celeste-rust
- Covers: a small reimplementation geared to TAS work (has `cart/` and `tas/` folders; no README)
- Status: last 2022-10-02
- AI-written: no
- Data: the PICO-8 cart in the repo
- Browser/WASM: no

#### A39. Tetris (Guideline clone; not a specific commercial game): tetrs
- Type: real (terminal)
- Project: https://github.com/YannickHerrero/tetrs
- Covers: full guideline engine (SRS, T-spins, 7-bag, hold, sprint/marathon/versus-AI modes)
- Status: last 2026-02-12
- AI-written: unknown
- Data: none needed
- Browser/WASM: no

### Engines and players for whole platforms (browser + PC)
#### A40. Adobe Flash games (all of them): Ruffle
- Type: browser
- Project: https://github.com/ruffle-rs/ruffle (https://ruffle.rs)
- Covers: a full Flash Player emulator. "Supports ActionScript 1, 2 and 3 pretty well, but it's still not finished."
- Status: last 2026-10-02 (very active)
- AI-written: no
- Data: SWF files (Flashpoint Archive, original sites)
- Browser/WASM: yes (web, browser extensions, desktop)

#### A41. Shockwave/Director games (Habbo-era): DirPlayer
- Type: browser
- Project: https://github.com/igorlira/dirplayer-rs (live demo linked in the README; Chrome extension)
- Covers: a Shockwave Player emulator plus a Lingo debugging toolset. Completeness varies per movie.
- Status: last 2026-09-06
- AI-written: unknown
- Data: .dcr/.dir/.cct files (Flashpoint, archives)
- Browser/WASM: yes

#### A42. GameMaker 8 and earlier games: OpenGMK
- Type: real
- Project: https://github.com/OpenGMK/OpenGMK
- Covers: a full runner sourceport (GM8Emulator), a decompiler and a TAS framework
- Status: last 2026-09-26
- AI-written: no
- Data: the original GM8 game .exe
- Browser/WASM: no

#### A43. GameMaker classic games: Dejavu
- Type: browser + real
- Project: https://github.com/rpjohnst/dejavu (playground: https://dejavu.abubalay.com/)
- Covers: partial GM 8.0 compatibility
- Status: last 2025-03-24
- AI-written: no
- Data: GM project/game files
- Browser/WASM: yes

#### A44. Zork and Infocom text adventures: encrusted
- Type: browser + terminal
- Project: https://github.com/DeMille/encrusted (https://demille.github.io/encrusted/)
- Covers: full Z-machine interpreter (Zork-era story files), with live mapping
- Status: last 2019-02-24
- AI-written: no
- Data: .z3/.z5 story files (Zork I's compiled `zork1.z3` is in historicalsource/zork1)
- Browser/WASM: yes

### Online games: servers and clients
#### A45. Minecraft Java (server): Pumpkin
- Type: real
- Project: https://github.com/Pumpkin-MC/Pumpkin (https://pumpkinmc.org/)
- Covers: a server aiming at vanilla mechanics for the latest Java and Bedrock versions. Worldgen and entities are partial.
- Status: last 2026-10-01 (very active)
- AI-written: unknown (AGENTS.md files present)
- Data: none (a vanilla client connects)
- Browser/WASM: no (it has a wasm plugin host, not a browser build)

#### A46. Minecraft Java (server): Valence
- Type: real
- Project: https://github.com/valence-rs/valence
- Covers: a Bevy-based server framework (protocol, chunks, entities) for building custom servers. It is not a vanilla game.
- Status: last 2026-06-15
- AI-written: no
- Data: none
- Browser/WASM: no

#### A47. Minecraft Java (server): Feather
- Type: real
- Project: https://github.com/feather-rs/feather
- Covers: a 1.16.5 server. The README says it is "currently inactive" and points to Valence.
- Status: last 2024-02-19
- AI-written: no
- Data: 1.16.5 world saves
- Browser/WASM: no

#### A48. Minecraft Java (server): FerrumC
- Type: real
- Project: https://github.com/ferrumc-rs/ferrumc
- Covers: a server reimplementation
- Status: last 2026-08-15
- AI-written: unknown
- Data: none
- Browser/WASM: no

#### A49. Minecraft Java (clients): Stevenarella / Leafish / Azalea
- Type: real
- Projects: https://github.com/iceiix/stevenarella (client for 1.7.10–1.18.2; last 2025-11-14), https://github.com/Lea-fish/Leafish (fork; last 2024-07-07), https://github.com/azalea-rs/azalea (headless bot/client library; last 2026-09-30)
- Covers: the clients render and play on servers, with partial features. Azalea has no renderer.
- AI-written: no
- Data: Mojang client assets (downloaded)
- Browser/WASM: no

#### A50. Minecraft 26.3 (engine): MinecraftOSS (vendored only)
- Type: real
- Project: no public upstream. 5 crates (core, generator, world, player, entities) are vendored from commit `4013a68` in https://github.com/chasmlol/2010-rust-rewrite-mashup/tree/main/third_party/minecraftoss. Issue #21 there asks where upstream is, and the README, NOTICE and Cargo.toml don't link one.
- Covers: vanilla 26.3 seed-exact worldgen, mobs and AI, inventory, recipes and loot
- Status: frozen copy (mashup last 2026-10-02)
- AI-written: unknown (the mashup author calls the overall project vibe coded)
- Data: Mojang's servers
- Browser/WASM: unknown

#### A51. World of Warcraft (servers): wrath-rs / wow_vanilla_server
- Type: real
- Projects: https://github.com/Victov/wrath-rs (3.3.5a: login, character creation, entering the world and movement; "nowhere near playable"; last 2026-01-28) and https://github.com/gtker/wow_vanilla_server (1.12, WIP; last 2025-09-17)
- AI-written: no
- Data: your WoW client of the matching version
- Browser/WASM: no

#### A52. Terraria (server): terrustia
- Type: real
- Project: https://github.com/VegaKernel/terrustia
- Covers: a from-scratch dedicated server for 1.4.5.8 (protocol 326)
- Status: last 2026-09-09. First commit 2026-08-22, 978 commits.
- AI-written: likely (CLAUDE.md, `.claude/agents/parity-lane.md`; the README accepts AI-assisted contributions)
- Data: none (your Terraria client connects)
- Browser/WASM: no

#### A53. Tibia (server): Oxidia
- Type: real
- Project: https://github.com/diegoQuinas/oxidia
- Covers: an Open Tibia server for protocol 10.98 (OTClient Redemption). Pre-alpha: login, map and GM commands.
- Status: last 2026-07-09
- AI-written: unknown
- Data: OT map/data files (`forgotten.otbm`); the OTClient
- Browser/WASM: no

#### A54. Habbo Hotel (Nitro/HTML5 era, server): Sirius
- Type: browser
- Project: https://github.com/sirius-emu/sirius
- Covers: a Habbo emulator "targeting the Nitro client" over WebSocket. Early: handshake and packet crates.
- Status: last 2026-05-10
- AI-written: unknown
- Data: the Nitro client and its assets
- Browser/WASM: n/a (server)

#### A55. Ultima Online (server): Yewoh
- Type: real
- Project: https://github.com/ricky26/yewoh
- Covers: a protocol library and a proof-of-concept server with no real game logic
- Status: last 2024-11-14
- AI-written: no
- Data: your UO client
- Browser/WASM: no

#### A56. Old School RuneScape / RS3 (cache reader): rs-cache
- Type: browser-era (Java) game; asset reader only
- Project: https://github.com/jimvdl/rs-cache
- Covers: reads the cache filesystem and item/NPC definitions
- Status: last 2025-11-30
- AI-written: no
- Data: an OSRS/RS3 cache (from OpenRS2 archives)
- Browser/WASM: no

#### A57. Skate 3: skate-3-rust-engine
- Type: real
- Project: SK8-ENGINE/skate-3-rust-engine, https://github.com/SK8-ENGINE/skate-3-rust-engine
- Covers: partial. Skating, tricks, grinds and `.skate` maps. Its `skate-core`, `skate-data` and `skate-net` crates depend only on serde, so they work with any engine.
- Status: Bevy 0.18.1 host. 303 commits, 2026-09-06 → 2026-10-02.
- AI-written: yes. The README's "AI usage" section credits AI tools and says they built on years of human reverse-engineering. Commits are co-authored by Claude and Cursor.
- Data: your own Xbox 360 `default.xex` and `data/`.
- Browser/WASM: unlikely.

---

## Section B: Capable of being rebuilt

Size is a rough guide for an AI agent port: **small** is a weekend-scale codebase (under ~20k lines, or a simple design), **medium** is a 1990s engine or a mid-size game, and **large** is a 3D console decomp or a modern engine. URLs were all verified (cloned or fetched) on 2026-10-03.

### B1. Real games with official or historical source releases
| Game | Type | What makes it rebuildable (proof URL) | Size | Where data comes from |
|---|---|---|---|---|
| Doom | real | id source release: https://github.com/id-Software/DOOM (plus Chocolate Doom reference port: https://github.com/chocolate-doom/chocolate-doom) | small–medium | shareware DOOM1.WAD free; Freedoom IWADs free |
| Wolfenstein 3D | real | id source release: https://github.com/id-Software/wolf3d | small | shareware .WL1 free |
| Quake | real | id source release: https://github.com/id-Software/Quake | medium | shareware pak0.pak free |
| Quake II | real | id source release: https://github.com/id-Software/Quake-2 | medium | demo data free; full needs your copy |
| Quake III Arena | real | id source release: https://github.com/id-Software/Quake-III-Arena (C2Rust attempt exists, see A13) | large | demo pak free; full needs your copy |
| Doom 3 | real | id source release: https://github.com/id-Software/DOOM-3 | large | needs your copy |
| Return to Castle Wolfenstein / Enemy Territory | real | id source release: https://github.com/id-Software/RTCW-SP, https://github.com/id-Software/Enemy-Territory | large | ET was released free; RTCW needs your copy |
| Heretic / Hexen | real | Raven source release: https://github.com/videogamepreservation/heretic, https://github.com/ioan-chera/hexen | small–medium | Heretic shareware WAD free; Hexen demo free |
| Duke Nukem 3D (Build engine) | real | 3D Realms source (icculus port): https://github.com/icculus/duke3d; Ken Silverman's Build source: https://advsys.net/ken/buildsrc/ | medium | shareware DUKE3D.GRP free |
| Shadow Warrior / Blood (Build) | real | Shadow Warrior source release port: https://github.com/jonof/jfsw; Blood reverse-engineered: https://github.com/nukeykt/NBlood | medium | Shadow Warrior Classic has been given away free; Blood needs your copy |
| Rise of the Triad | real | Apogee source release: https://github.com/videogamepreservation/rott | medium | shareware data free |
| Descent | real | Parallax source release: https://github.com/videogamepreservation/descent; modern port https://github.com/dxx-rebirth/dxx-rebirth | medium | shareware data free |
| Jedi Outcast / Jedi Academy | real | Raven source release: https://github.com/grayj/Jedi-Outcast, https://github.com/grayj/Jedi-Academy; maintained port https://github.com/JACoders/OpenJK | large | needs your copy |
| C&C Tiberian Dawn / Red Alert | real | EA source release: https://github.com/electronicarts/CnC_Tiberian_Dawn, https://github.com/electronicarts/CnC_Red_Alert, https://github.com/electronicarts/CnC_Remastered_Collection | medium | EA's freeware TD/RA data (OpenRA downloads it) |
| C&C Generals Zero Hour | real | EA source release: https://github.com/electronicarts/CnC_Generals_Zero_Hour | large | needs your copy |
| C&C Renegade | real | EA source release: https://github.com/electronicarts/CnC_Renegade | large | needs your copy |
| SimCity (Micropolis) | real | GPL source release: https://github.com/SimHacker/micropolis (C++ engine rewrite: MicropolisCore, linked from the README) | small–medium | assets included in repo |
| Prince of Persia (Apple II) | real | Jordan Mechner's 6502 source: https://github.com/jmechner/Prince-of-Persia-Apple-II (DOS version already in Rust, A32) | small–medium | images and data in repo |
| Zork I (and II/III) | real | Infocom ZIL source + compiled `COMPILED/zork1.z3`: https://github.com/historicalsource/zork1 | small (Z-machine interpreter) | story file in repo |
| Half-Life 1 | real | Valve's game-DLL SDK: https://github.com/ValveSoftware/halflife; clean-room engine Xash3D: https://github.com/FWGS/xash3d-fwgs | large | needs your copy |
| Marathon 1–3 | real | Bungie source → Aleph One: https://github.com/Aleph-One-Marathon/alephone | medium | Marathon trilogy data released free |
| FreeSpace 2 | real | Volition source → FS2 Open: https://github.com/scp-fs2open/fs2open.github.com | large | needs your copy |
| Abuse | real | Crack dot Com source + data: https://github.com/Xenoveritas/abuse | small–medium | data in repo |
| Canabalt (iOS) | real | Semi Secret source release: https://github.com/ericjohnson/canabalt-ios | small | assets in repo |
| Space Cadet Pinball | real | full decompilation: https://github.com/k4zmu2a/SpaceCadetPinball (a partial Rust port exists, A36) | small | PINBALL.DAT from Windows XP / Full Tilt |

### B2. Real games with decompilations / disassemblies
| Game | Type | What makes it rebuildable (proof URL) | Size | Where data comes from |
|---|---|---|---|---|
| Super Mario 64 | real | matching decomp: https://github.com/n64decomp/sm64 (no Rust port found) | large | your ROM |
| Zelda: Ocarina of Time | real | decomp: https://github.com/zeldaret/oot | large | your ROM |
| Zelda: Majora's Mask | real | decomp: https://github.com/zeldaret/mm (plus recomp https://github.com/Zelda64Recomp/Zelda64Recomp) | large | your ROM |
| Zelda: Twilight Princess / BotW | real | decomps in progress: https://github.com/zeldaret/tp, https://github.com/zeldaret/botw | large | your disc dump |
| Perfect Dark | real | decomp: https://github.com/n64decomp/perfect_dark; PC port https://github.com/fgsfdsfgs/perfect_dark | large | your ROM |
| Mario Kart 64 | real | decomp: https://github.com/n64decomp/mk64 | large | your ROM |
| Banjo-Kazooie | real | decomp: https://github.com/n64decomp/banjo-kazooie | large | your ROM |
| Star Fox 64 | real | decomp: https://github.com/sonicdcer/sf64 | large | your ROM |
| Paper Mario | real | decomp: https://github.com/pmret/papermario | large | your ROM |
| Animal Crossing (GC) | real | decomp: https://github.com/ACreTeam/ac-decomp | large | your disc dump |
| Metroid Prime | real | decomp: https://github.com/PrimeDecomp/prime | large | your disc dump |
| Pokémon Red/Blue, Crystal, Emerald | real | pret disassemblies/decomps: https://github.com/pret/pokered, https://github.com/pret/pokecrystal, https://github.com/pret/pokeemerald (Red already done in Rust, A23) | medium | assets are in the repos (builds the ROM) |
| Zelda: A Link to the Past / Super Metroid / Super Mario World | real | C reimplementations: https://github.com/snesrev/zelda3, https://github.com/snesrev/sm, https://github.com/snesrev/smw (ALttP Rust port exists, A22) | medium | your ROM (assets extracted) |
| Diablo + Hellfire | real | reverse-engineered source: https://github.com/diasurgical/devilution, modern port https://github.com/diasurgical/DevilutionX (no Rust port found) | medium–large | DIABDAT.MPQ (your copy) or free shareware spawn.mpq |
| Sonic 1 & 2 (2013), Sonic CD, Sonic Mania | real | RSDK decomps: https://github.com/RSDKModding/RSDKv4-Decompilation, https://github.com/RSDKModding/RSDKv5-Decompilation | medium | your Data.rsdk |
| Sonic 1 (Mega Drive) | real | 68k disassembly: https://github.com/sonicretro/s1disasm | medium | built from repo (+ your ROM to verify) |
| Jak and Daxter 1–3 | real | OpenGOAL decomp/port: https://github.com/open-goal/jak-project | large | your PS2 ISO |
| LEGO Island | real | decomp: https://github.com/isledecomp/isle | medium | your CD |
| GTA San Andreas | real | reverse-engineered reimplementation (in progress): https://github.com/gta-reversed/gta-reversed (Rust renderer exists, A17) | large | your copy |
| Fallout 1 / Fallout 2 | real | reverse-engineered C++ "Community Edition": https://github.com/alexbatalov/fallout1-ce, https://github.com/alexbatalov/fallout2-ce (FO2 Rust attempt stalled, A21) | large | your copy |
| Commander Keen 4–6 | real | bug-for-bug reimplementation: https://github.com/sulix/omnispeak (no Rust port found) | small–medium | Keen 4 shareware free |
| Cave Story | real | reimplementation: https://github.com/nxengine/nxengine-evo (Rust already done, A31) | small | freeware data |
| Tomb Raider 1–3 | real | decomp-based TRX: https://github.com/LostArtefacts/TRX; OpenLara (has a WebGL build): https://github.com/XProger/OpenLara | large | your copy (OpenLara web demo level) |

### B3. Real games with well-documented reimplementations in other languages (portable by an agent)
| Game | Type | What makes it rebuildable (proof URL) | Size | Where data comes from |
|---|---|---|---|---|
| Morrowind | real | OpenMW (C++): https://github.com/OpenMW/openmw | large | your copy |
| RollerCoaster Tycoon 2 | real | OpenRCT2 (C++): https://github.com/OpenRCT2/OpenRCT2 | large | your RCT2 (or RCT Classic) data |
| Transport Tycoon Deluxe | real | OpenTTD (C++): https://github.com/OpenTTD/OpenTTD | large | free OpenGFX/OpenSFX/OpenMSX |
| C&C / Red Alert / Dune 2000 | real | OpenRA (C#): https://github.com/OpenRA/OpenRA | large | freeware data downloaded by OpenRA |
| Theme Hospital | real | CorsixTH (Lua/C++): https://github.com/CorsixTH/CorsixTH | medium | your copy (demo data also works) |
| X-COM: UFO Defense / TFTD | real | OpenXcom (C++): https://github.com/OpenXcom/OpenXcom | medium–large | your copy |
| Daggerfall | real | Daggerfall Unity (C#): https://github.com/Interkarma/daggerfall-unity | large | Daggerfall was released free by Bethesda |
| Warcraft II | real | Wargus on Stratagus: https://github.com/Wargus/wargus | medium | your CD |
| StarCraft: Brood War | real | OpenBW engine (C++): https://github.com/OpenBW/openbw | large | your MPQs (StarCraft has been free since 2017) |
| Unreal Tournament (99) | real | SurrealEngine (C++): https://github.com/dpjudas/SurrealEngine | large | your copy |
| Minecraft Java | real | Mojang ships un-obfuscated jars from late-2025 snapshots on (announcement: https://fabricmc.net/2025/10/31/obfuscation.html); protocol/data dumps: https://github.com/PrismarineJS/minecraft-data | large | downloaded from Mojang's servers |
| Pokémon Showdown | browser | TypeScript source: https://github.com/smogon/pokemon-showdown (Rust battle engine exists, A24; the client, team builder and server are not ported) | medium | data in repo |

### B4. Browser games
| Game | Type | What makes it rebuildable (proof URL) | Size | Where data comes from |
|---|---|---|---|---|
| Any Flash game | browser | Ruffle runs SWFs (A40); JPEXS decompiles SWF → ActionScript + assets: https://github.com/jindrapetrik/jpexs-decompiler | small–medium per game | Flashpoint Archive (https://flashpointarchive.org/, 220k+ games, also Shockwave and Java applets) |
| Bloons Tower Defense 1 (Flash) / BTD5 | browser | BTD1: SWF decompile via JPEXS (a speedrun.com thread documents BTD1's SWF internals, found by search; page returned 403 to fetch). BTD5 C++ decomp: https://github.com/NKHook/BTD5-Decomp | small (BTD1), medium (BTD5) | BTD1 SWF via Flashpoint; BTD5 needs your copy |
| Club Penguin | browser | TypeScript server emulator + archived client (repo holds ~26k SWFs): https://github.com/nhaar/Waddle-Forever; Python server with documented protocol: https://github.com/solero/houdini | large (MMO), small per minigame | SWFs in Waddle-Forever repo |
| Habbo Hotel (Shockwave v14) | browser | Java v14 server emulator: https://github.com/Quackster/Kepler (discontinued but complete); DirPlayer runs the Shockwave client (A41) | large | Shockwave client DCRs from community archives |
| RuneScape Classic | browser (Java applet) | Open RSC full server/client framework: https://github.com/Open-RSC/Core-Framework; JS port of mudclient204: https://github.com/2003scape/rsc-client | large (server), medium (client) | cache in repos |
| RuneScape 2 (May 2004) | browser (Java applet) | Lost City / 2004Scape TypeScript engine + content: https://github.com/2004Scape/Server (archived monorepo) → https://github.com/LostCityRS/Server | large | content in repo |
| RuneScape 377 client | browser (Java applet) | TypeScript port of the 377 client: https://github.com/reinismu/runescape-web-client-377 (pairs with an Apollo server) | medium | 377 cache |
| Old School RuneScape (server) | browser-era | Kotlin server emulator: https://github.com/rsmod/rsmod (Rust cache reader exists, A56) | large | OSRS cache |
| Line Rider | browser (Flash originally) | JS physics core, backwards compatible with the original: https://github.com/conundrumer/lr-core; C# Line Rider Advanced: https://github.com/jealouscloud/linerider-advanced | small | none (tracks are JSON) |
| BrowserQuest | browser | Mozilla HTML5 MMO, client + Node server: https://github.com/mozilla/BrowserQuest | medium | assets in repo |
| Hextris | browser | open-source JS: https://github.com/Hextris/hextris | small | in repo |
| 2048 | browser | open-source JS: https://github.com/gabrielecirulli/2048 | small | in repo |
| HexGL | browser | open-source three.js racer: https://github.com/BKcore/HexGL | small–medium | in repo |
| A Dark Room | browser | open-source JS: https://github.com/doublespeakgames/adarkroom | small | in repo |
| Candy Box 2 | browser | official TypeScript source: https://github.com/candybox2/candybox2.github.io | small | in repo (ASCII art) |
| Untrusted | browser | open-source JS: https://github.com/AlexNisnevich/untrusted | small–medium | in repo |
| Clumsy Bird | browser | open-source melonJS: https://github.com/ellisonleao/clumsy-bird | small | in repo |
| shapez.io | browser + Steam | open-source JS: https://github.com/tobspr/shapez.io | medium | in repo |
| Cookie Clicker | browser | readable, unminified JS ships live: https://orteil.dashnet.org/cookieclicker/main.js (17,360 lines, fetched with curl; WebFetch got 403) | small–medium | images from the site |
| Universal Paperclips | browser | readable JS ships live: https://www.decisionproblem.com/paperclips/index2.html loads main.js (6,499 lines), projects.js, combat.js, globals.js | small | text-only |

---

## Checked but dropped (don't re-check)
- **Zlacki/RSCRust** (RuneScape Classic in Rust): the repo has only a README (2 files, last 2017). No code.
- **WangYiBen0/Ruleste** (Celeste in Rust): a single empty initial commit.
- **EngineersBox/Morrowind** (Rust): "Init crate" only (4 files, 2023).
- **Strophox/tetrs**: the repo now contains only a README.md.
- **joankaradimov/Magnetar** (StarCraft): C++, not Rust.
- **xinbenlv/rustalarm** (Red Alert): TypeScript, not Rust, despite the name.
- **reinismu/runescape-web-client-377** as a Rust project: TypeScript with a single Rust wasm helper file. It moved to Section B as a TS port.
- **pkmn/engine** (Pokémon battle engine): Zig, not Rust.
- **jaenster/libd2** (Diablo II): Zig core, not Rust.
- **rlabrecque/rl-diablo-2-hack**: a Diablo 2 hack, not a reimplementation.
- **Bytekeeper/rsbwapi**: a StarCraft AI bot library, not a reimplementation.
- **MinecraftOSS upstream repo**: not public anywhere (see issue #21 on the mashup). Only the vendored crates exist (A50).
- **SergioBenitez/minecraft**: a guessed URL; doesn't exist.
- **Rust ports not found**: Super Mario 64, Commander Keen, Diablo 1/2 (beyond hacks), StarCraft, Sonic, Club Penguin servers, Settlers, X-COM. Searches turned up only C/C++/other-language projects.
- **icculus/rott**: not on GitHub. ROTT source was verified via videogamepreservation/rott instead.
- **gearboxsoftware/HomeworldSDL**: URL doesn't exist (not re-searched).
- **uqm-community/uqm** (Star Control 2): URL doesn't exist on GitHub. https://sc2.sourceforge.net/ returns 200 but wasn't inspected.
- **aduros/candybox2**: wrong URL. The official repo is candybox2/candybox2.github.io (in B4).
- **minecraft-classic/minecraft-classic**: doesn't exist. classic.minecraft.net loads a bundled `/assets/js/app.js`, but its readability wasn't checked, so it's left out.
- **speedrun.com BTD1 decompile thread**: WebFetch returned 403. It's cited in B4 only as a search-result lead.
- **Seen in search but not cloned/verified**: tadeu2/RustUO, thisdotrob/rust-uo-server, rustuo.org, arlyon/azerust, idairfguido/rustycore (WoW), osrs-rs/rs2-cache, runebite (OSRS client), TeamQuantumFusion/rustaria (Terraria-like rework).
