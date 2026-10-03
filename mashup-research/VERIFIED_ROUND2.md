# Round 2: verified additions

This adds to [VERIFIED.md](VERIFIED.md) and [SHORTLIST.md](SHORTLIST.md). Entry numbers continue from round 1 (A58+, P9+). The round-2 Section B items (B1–B12) have their own numbering and are separate from round 1's B1–B4 group headings.

Checked 2026-10-03. ✔ means I cloned the repo anonymously (`git clone --bare --filter=blob:none`, plus `--depth 1` checkouts to count lines), read its README and every Cargo.toml, and fetched any live page (HTTP 200 unless noted). Commit counts are full-history `git rev-list --count HEAD`. LOC means lines in `.rs` files at HEAD. AI evidence uses round 1's key (yes, likely, no, unknown).

Same scoring as SHORTLIST.md: full game > partial > viewer; lib/plugins > monolith; Bevy 0.19 / wgpu 29 cluster or browser > other.


> **Spot checks I ran myself (2026-10-03).** These override the entries below:
> - **vange-rs** has 946 commits since 2016. It started as a human project (kvark). Claude authored 133 of the commits in 2026. Read "AI-written: yes" as "recently extended with AI", not "AI-written from scratch".
> - **legend-of-legaia-re** has 493 commits (2026-05-05 → 10-01). Each commit carries several co-author trailers, so the "2,100+ trailers" figure is not a commit count. It's still AI-written throughout.
> - **pico-r** has 117 commits (2026-04-27 → 10-02), co-authored by Claude Fable 5, Sonnet 5 and Opus 5. Confirmed.

---

## 1. Key findings

- **pico-r is the best new piece for a phone.** It's a complete PICO-8 runtime in a single 360 KB wasm module with zero JS imports. The page passes in a cart and button bits and reads back a 128×128 pixel buffer. It plays Celeste Classic and the whole free BBS catalog in a mobile browser, and it was written with Claude. Embedding it in any framebuffer game (Iron Wolf, open-pokered, SDLPoP-rs) is a small job. It has no touch pad yet.
- **vange-rs (Vangers) adds a second 3D world to the cluster.** It's on wgpu 29, it runs live in the browser at vange.rs (a 10 MB wasm build with the game data bundled), and it has multiplayer. 133 of its commits are authored by Claude, between April and August 2026.
- **Legend of Legaia is the largest AI-written rewrite found so far.** It's about 775k non-test lines across 31 crates, with more than 2,100 Claude co-author trailers. It plays towns, dialogue, menus, battles and minigames in a browser, reading your own disc image locally in the tab.
- **Chip's Challenge DX is the cleanest embeddable phone game.** `chipcore` is a pure-logic library ("no graphics, audio, or input"), and the live web build already has touch and gamepad controls.
- **No Rust runtime exists for Godot, Unity, XNA/FNA, Ren'Py, Scratch or RPG Maker.** Luminol is an editor only, renrs died in 2023, and hctarcs has no input. For these engines the readable code is a source to port from, not something you can run. The browser route for C# games is .NET wasm (celeste-wasm, terraria-wasm), not Rust.
- **LÖVE is the exception.** balatro-port-tui reimplements about 80 LÖVE functions in Rust (`love-api`) and runs the unmodified Balatro Lua. It draws to a software pixel buffer, so it can become a texture. It's terminal/desktop only, because the vendored C Lua blocks a `wasm32-unknown-unknown` build.
- **An AI reverse-engineering pipeline exists: vgrichina/re-skill.** It's a Claude Code skill that takes a ROM through to an annotated disassembly and then a web port, and it produced the Battle City port below. Your agents can run it on other small NES, Game Boy or DOS games, so new Section B items can be made rather than only found.
- **Static recomps are for running games, not porting them.** N64Recomp, XenonRecomp and Unleashed Recomp emit machine-level C/C++ for the whole binary. XenonRecomp says outright that it ships no runtime. Use the human-readable decomps from round 1 (B2) as port sources instead. The unricopie catalog lists 123 projects, and none mention Rust or WASM (checked with grep).
- **awesome-game-remakes had only 5 Rust entries, and all were already known.** Its useful additions are browser games: Battle City, sm64js, Dungeon Keeper Reborn and Pillage First.
- **Corrections to candidates.md:**
  - Warhorst/pacman does not yet reproduce the original's bugs. Its README lists that as to-do.
  - terra-rust's 126k lines are generated stubs.
  - Ruleste is still one empty commit.
  - The parabellum demo returns 502.

---

## 2. Section A additions: already rebuilt in Rust

Ranked by mashup value.

| # | Game: project | Done | Engine / embed | WASM / phone | Activity | AI-written | Data | ✔ |
|---|---|---|---|---|---|---|---|---|
| A58 | **All PICO-8 carts (Celeste Classic etc.): mnmlyw/pico-r** https://github.com/mnmlyw/pico-r | full runtime: bit-exact numbers, rasterizer checked byte-for-byte against the official binary, audio, multi-cart. 15.5k LOC | single crate; only dependency is `miniz_oxide`. Own Lua VM. Exports `web_init / web_update / web_get_pixel_buffer / web_set_buttons`. **fb** | **yes**, live: https://mnmlyw.github.io/pico-r/ (200). No touch pad (touch only resumes audio) | 117 commits, 2026-04-27 → 2026-10-02 | **yes** (110 trailers: Claude Fable 5, Sonnet 5) | free carts from the Lexaloffle BBS | ✔ |
| A59 | **Vangers: kvark/vange-rs** https://github.com/kvark/vange-rs | substantial: mechous, items, levels, persistent multiplayer (TCP + WebSocket). Not every original feature is ported | **wgpu 29** + winit 0.30 + egui 0.34, lib crates under `lib/` (m3d, net, splay…). 49k LOC | **yes**, live: https://vange.rs/mesh/ (`web_bg.wasm` 10 MB, data bundled). Touch unverified | 946 commits, 2016-06 → 2026-09-15 | **yes** (133 commits authored by Claude; trailers name Opus 5 and Opus 4.7, Apr–Aug 2026) | web: bundled. Native: the KranX/Vangers tree plus your GOG/Steam copy for mechous | ✔ |
| A60 | **Chip's Challenge: CasualX/chipdx** https://github.com/CasualX/chipdx | full (a "DX" remaster: 3D-sprite look plus a level editor) | **lib**: `chipcore` is pure sim logic; renders with the author's `shade` (GL/WebGL) + winit 0.30. Has `chipwasm` and Android JNI crates. 19k LOC | **yes**, live: https://casualhacks.net/chipdx/index.html (200), **touch + gamepad** | 381 commits, 2024-07 → 2026-08-23 | likely (`skills/*.md` agent-skill files) | CC1 and community level sets in the repo | ✔ |
| A61 | **Legend of Legaia (PSX): AndrewAltimit/legend-of-legaia-re** https://github.com/AndrewAltimit/legend-of-legaia-re | substantial: towns and fields, NPC dialogue VM, the full menu stack, shops, battles, FMVs, real memory-card saves, plus 3 minigames (slots, dance, Baka Fighter) | wgpu 26 + winit 0.30 + cpal. 31 crates (engine-core, engine-vm, engine-render, per-format parsers). ~775k non-test LOC | **yes**, live: https://andrewaltimit.github.io/legend-of-legaia-re/play.html (200). Phone plausible but heavy (the disc image loads in the tab) | 493 commits, 2026-05-05 → 2026-10-01 | **yes** (2,100+ Claude trailers: Opus 4.8, Fable 5; CLAUDE.md, `.claude/skills`) | your PSX disc `.bin`, read locally | ✔ |
| A62 | **Taipan, Oregon Trail, Hammurabi, Colossal Cave Adventure, Dukedom, Santa Paravia, Fur Trader: Riparion/riparion-retro** https://github.com/Riparion/riparion-retro | full ports (8 games, one of them original) | Dioxus 0.7 web. Each game has a **UI-free `engine/` module** (Taipan's engine doesn't import Dioxus). 44.7k LOC | **yes** (mobile-first wasm via `dx build`). No hosted URL found | 136 commits, 2026-06-07 → 06-16 | **yes** (89 Claude Opus 4.8 trailers, AGENTS.md) | none | ✔ |
| A63 | **Balatro (LÖVE): 4RH1T3CT0R7/balatro-port-tui** https://github.com/4RH1T3CT0R7/balatro-port-tui | full: runs the unmodified Balatro Lua | **lib** `love-api` (~80 LÖVE functions on a software pixel buffer) + mlua 0.10 (vendored Lua 5.1) + ratatui 0.29. 11.4k LOC | unlikely (C Lua blocks wasm32-unknown-unknown); terminal/desktop | 95 commits, 2026-02-25 → 03-12 | unknown | your Steam `Balatro.exe` (a zip of Lua) | ✔ |
| A64 | **NES Tetris: Ramirisu/tetris** https://github.com/Ramirisu/tetris | full (NES rules, linecap, NTSC/PAL) | **Bevy 0.19.1** (matches the cluster), one binary (no lib). 6.5k LOC | **yes**, live: https://ramirisu.github.io/tetris/ (200); README says desktop is smoother | 334 commits, 2024-08 → 2026-09-24 | no evidence | in repo | ✔ |
| A65 | **Mine Bombers 3.11 (DOS): jeiel85/minebombers-reloaded** https://github.com/jeiel85/minebombers-reloaded | full engine (Windows play-tested; Linux reaches the menu) | SDL2 0.35 native, plus a separate `mb-wasm` crate for a web edition. 18k LOC | **yes**, live: https://jeiel85.github.io/minebombers-reloaded/ (200) | 75 commits, 2026-09-16 → 10-01 | **yes** (120 Claude Sonnet 5 trailers) | freeware 3.11 from archive.org (you pick the folder) | ✔ |
| A66 | **Celeste Classic: jjant/runty8** https://github.com/jjant/runty8 | full Celeste Classic, hand-ported to Rust on a PICO-8-like API | crates `runty8-core/runtime`, winit 0.27 + glow 0.11, wasm target. 10.4k LOC | yes (wasm target) | 648 commits, dormant since 2023-12-29 | no | in repo | ✔ |
| A67 | **Pac-Man: Warhorst/pacman** https://github.com/Warhorst/pacman | full per the Pac-Man dossier. The original's bugs are *not* reproduced (README to-do) | Bevy 0.18, one binary. 8k LOC | yes, live: https://warhorst.github.io/pacman/ (200, a Dec 2024 build) | 370 commits, → 2026-05-05 | no | in repo | ✔ |
| A68 | **Quake III ("reimagined"): Oli97430/quake3-rust-edition** https://github.com/Oli97430/quake3-rust-edition | playable solo vs bots, 9 weapons, a battle-royale mode, level editor. **Not faithful** (glTF weapons, PBR, new modes) | 15 crates (q3-bsp, q3-collision, q3-bot…), wgpu 22 + winit 0.30 + rodio. 65k LOC | no (desktop) | 41 commits, 2026-04-30 → 09-10 | **yes** (39 trailers: Claude Fable 5, Opus 4.7) | your `pak0.pk3` | ✔ |
| A69 | **Wages of War (1996): suhteevah/wages-of-war** https://github.com/suhteevah/wages-of-war | alpha: full contract loop works, units drawn as placeholder squares | `ow-core` pure rules lib + SDL2 0.37. 29k LOC | no | 115 commits, 2026-04-09 → 06-29 | **yes** (41 Claude Opus 4.6 trailers, CLAUDE.md) | your original data | ✔ |
| A70 | **Sangokushi Eiketsuden (KOEI 1995): jeiel85/eiketsuden-reloaded** https://github.com/jeiel85/eiketsuden-reloaded | full campaign (60 battles) converted from your files. Prologue and chapter 1 aren't play-tested | macroquad 0.4.16. 92k LOC | yes (web build with stand-in media): https://jeiel85.github.io/eiketsuden-reloaded/ (200) | 496 commits in 6 days, 2026-09-26 → 10-01 | **yes** (408 Claude trailers, Opus/Sonnet 5.5) | your Korean DOS/V copy | ✔ |
| A71 | **Code the Classics (Boing, Cavern, Bunner, Soccer) + Catacomb II: 64kramsystem/rust-game-ports** https://github.com/64kramsystem/rust-game-ports | full small ports (Catacomb II is an exact port) | ggez 0.7, macroquad 0.3, Fyrox 0.26, SDL2 0.35, one folder each. 19k LOC | macroquad ones plausible | 624 commits, last 2022-09-26. Archive status unconfirmed (GitHub API returned 403) | no | in repo; Catacomb II needs the original files | ✔ |

Engine match:
- Bevy 0.19 cluster: Ramirisu/tetris.
- wgpu 29 cluster: vange-rs.
- Browser today: pico-r, vange-rs, chipdx, Legaia, Ramirisu/tetris, minebombers, eiketsuden, pacman.

---

## 3. Section B additions: could be rebuilt

| # | Game | Source (proof) | Code you can read | Size | Data | WASM / phone | Mashup value | ✔ |
|---|---|---|---|---|---|---|---|---|
| B1 | **Battle City (Famicom)** | https://github.com/vgrichina/battlecity, live: https://battle-city.berrry.app | JS port of 4,337 lines (game.js 3,071), with ROM addresses cited inline; annotated 6502 disassembly (249 labels). Made with Claude (97 trailers) | small (days to port to Rust) | the repo's Python extractors read your ROM; the live site hosts the tiles | **yes**, touch-ready page | tank combat on a tile grid; base defence | ✔ |
| B2 | **Balatro** (port the rules to Rust) | runs today via A63; the Lua is readable in your `Balatro.exe` zip | Lua | medium | your copy | needed only for a phone: a pure-Rust rules engine avoids C Lua | poker-roguelike scoring as a casino minigame | ✔ (via A63) |
| B3 | **Celeste (2018)** | https://github.com/MercuryWorkshop/celeste-wasm (.NET wasm + FNA, runs Everest mods) | C# via ILSpy | medium–large | your copy (patched at load) | browser yes, but ~600 MB RAM, so no phone | precision platforming | ✔ |
| B4 | **Terraria** | https://github.com/MercuryWorkshop/terraria-wasm (build decompiles with ilspycmd) | C# via ILSpy | large | your copy | browser yes (needs COOP/COEP headers); phone unlikely | 2D sandbox world | ✔ |
| B5 | **Tyler Glaiel's Flash games** (Closure, Aqua Slug, Paths, Fracuum…) | https://github.com/TylerGlaiel/GlaielGamesOldFlashSources | 130 `.as` + 50 `.fla`. AS2 code inside FLAs needs Flash CS6, or JPEXS on the SWF | small per game | in repo, CC BY-NC-SA | yes, via Ruffle | ready-made minigames with source | ✔ |
| B6 | **Little Big Adventure 1 & 2** | https://github.com/LBALab/lba2remake (5,152 commits, last 2026-04-17), live: https://lba2remake.net (200) | TypeScript + three.js | large | your LBA1/2 files for a local build | browser yes; phone plausible | isometric 3D adventure world | ✔ |
| B7 | **Panzer General 2** | https://github.com/nicupavel/openpanzer (last 2021-02), live: https://panzermarshal.com (200) | ES5 JS | medium | in repo | **yes** (README says it was tested on Android/iOS) | hex wargame layer | ✔ |
| B8 | **Pillage First (Travian-style)** | https://github.com/jurerotar/Pillage-First-Ask-Questions-Later (1,315 commits, → 2026-10-02), live: https://pillagefirst.com (200) | TS + React, single-player | medium | in repo | **yes** | village economy and raids, with no server needed | ✔ |
| B9 | **Dungeon Keeper (reimagining)** | https://github.com/joko1977-ui/DungeonKeeperReborn, live (200) | TS + three.js 0.169. Built with Claude Opus 5 (46 trailers, 3 days) | medium | procedural / in repo | **yes** (a PWA; README says Android/iOS) | dig-and-lure dungeon builder (not faithful) | ✔ |
| B10 | **SCP: Containment Breach** | https://github.com/q8j-dev/scpcb-web-port, live: https://q8j-dev.github.io/scpcb-web-port/ (200) | unmodified Blitz3D `.bb` source, compiled to wasm with WebGPU | medium–large | 300 MB, in repo | browser: Chrome/Edge 137+ only; phone unlikely | horror facility and SCP AI | ✔ |
| B11 | **The 7th Guest** | https://github.com/mattseabrook/v64tng (last 2026-09-26) | C++ engine plus a NASM rebuild covering 100% of V.EXE's bytes (31.5% of functions named) | medium | your copy | no | puzzle rooms as minigames | ✔ |
| B12 | **Super Mario 64 (JS)** | https://github.com/sm64jsarchive/sm64jsarchive (an archive; sm64js.com is dead) | JS transliteration of the decomp + a WebGL F3D renderer; old Rust actix server for multiplayer | large | extract from your ROM | browser yes | 3D platformer. The C decomp (round 1) is just as good a source | ✔ |

---

## 4. New category: engines and formats that ship readable game code

| Format / engine | How to read the code | Rust runtime? | Browser route | Example games | ✔ |
|---|---|---|---|---|---|
| **PICO-8** (`.p8` text, `.p8.png`) | open `.p8` as text, or convert with pico-r's `p8png2p8.py` | **yes: pico-r (A58)**; runty8 for Celeste | pico-r wasm | Celeste Classic, BBS carts | ✔ |
| **LÖVE** (`.love`, or a fused `.exe` = zip of Lua) | unzip | **partial: `love-api` in balatro-port-tui (A63)**, ~80 functions, terminal only | love.js (Emscripten, not Rust) | Balatro, Mari0 | ✔ |
| **XNA / FNA / MonoGame** (.NET IL) | ILSpy / `ilspycmd` | none | .NET wasm: celeste-wasm, terraria-wasm; FNA-WASM-Build (https://github.com/r58Playz/FNA-WASM-Build ✔) | Celeste, Terraria, Stardew Valley, FEZ | ✔ |
| **Unity, Mono builds** (`Assembly-CSharp.dll`) | ILSpy / dnSpy (IL2CPP builds don't qualify) | none | none | Mono-build Unity games | search only |
| **Godot** (`.pck`) | GDRE Tools recovers the GDScript project | none (godot-rust/gdext is bindings, not a runner) | Godot's own web export | Godot titles | search only |
| **RPG Maker XP / VX / VX Ace** (`Scripts.rxdata`, Ruby Marshal) | decrypt `.rgssad`, then unmarshal the Ruby | **no player.** Luminol (https://github.com/Astrabit-ST/Luminol ✔) is an XP-only editor (wgpu 25, egui 0.32, web build) with a Marshal reader (alox-48) and map renderer | none | XP-era games | ✔ |
| **RPG Maker MV / MZ** | plain JS + JSON in `www/` | none needed | already a browser game | MV/MZ games | search only |
| **Ren'Py** (`.rpy`; `.rpyc` via unrpyc) | text / unrpyc | dead: renrs (https://codeberg.org/ElnuDev/renrs ✔, 10 days in 2023, WIP) | none in Rust | visual novels | ✔ |
| **Scratch** (`.sb3` = zip of project.json) | unzip | **no usable one**: hctarcs ✔ (no input), scratch-vm-wasm-runtime ✔ (abandoned prototype) | TurboWarp / forkphorus (JS) | Scratch community games | ✔ |
| **Blitz3D** (`.bb` source) | text | none | blitz3d-ng → wasm (scpcb-web-port, B10) | SCP: Containment Breach | ✔ |
| **Flash** (`.swf`, `.fla`/`.as`) | JPEXS; source FLAs where released | **yes: Ruffle** (round 1, A40) | Ruffle | Glaiel sources (B5) | round 1 |
| **NES / GB / DOS ROMs, via an AI RE pipeline** | **vgrichina/re-skill** (https://github.com/vgrichina/re-skill ✔, a Claude Code `/re` skill): ROM → `labels.csv` + REVERSE.md → web port | n/a (it writes a JS port; ask the agent for Rust instead) | output is a canvas page | Battle City (B1) | ✔ |

---

## 5. New pairings

| # | Mashup | Who supplies what | Why it fits | Effort | Phone |
|---|---|---|---|---|---|
| P9 | **Wolf Arcade** (Iron Wolf + pico-r) | Wolf3D: the maze, guards and guns. PICO-8: arcade cabinets in secret rooms run Celeste Classic or a BBS cart. Beating the cart (read from PICO-8 RAM or `dset` cartdata) pays out ammo or treasure | Both are framebuffer wasm games. pico-r has zero imports and hands back a 128×128 buffer, so the host page just swaps which buffer the canvas shows and routes the buttons. No engine merge needed | **small** | **yes, mobile browser** (needs one shared on-screen D-pad) |
| P10 | **Battle Chip** (chipdx + rebuild Battle City) | Chip's Challenge: tile levels, keys, doors, hazards, editor, touch UI. Battle City: some levels become tank stages, with Chip driving a tank, brick walls you can shoot, an eagle to defend and waves of enemy tanks | Both are tile grids. `chipcore` is UI-free logic, and an agent can port Battle City's 4.3k lines of ROM-annotated JS to a Rust `tankcore` in days, then plug it into chipdx's renderer and web build | small–medium | **yes, mobile browser** (chipdx already has touch) |
| P11 | **Taipan Vangers** (vange-rs + riparion-retro's Taipan engine) | Vangers: drive mechous across live voxel worlds between escaves. Taipan: its `prices.rs` market, `events.rs` (pirates, storms) and `combat.rs` drive what each escave buys and sells, and pirate attacks happen on the road | Vangers is already a trade-and-drive game whose economy is thin. Taipan's engine is pure Rust with no Dioxus inside, so it drops into vange-rs as a crate. vange-rs is wgpu 29, live on the web and already networked | medium | plausible (vange.rs runs in a mobile browser; touch driving unverified) |
| P12 | **Four Dragons Balatro** (star-andreas + balatro-port-tui's `love-api`) | GTA SA: walk into Las Venturas casinos (Four Dragons, Caligula's). Balatro: sit at a table and the real Balatro runs on a texture, with winnings paid out as SA cash | `love-api` already draws to a software pixel buffer, so you upload it to a Bevy 0.19 texture instead of a terminal. Input maps to Balatro's gamepad events, as the port already does | medium | no (desktop) |
| P13 | **Line-clear killstreaks** (Ramirisu/tetris + Davenstein, or the IW4L mashup) | Tetris: an in-game laptop or terminal. Wolf3D/MW2: clearing 4 lines calls in a killstreak (a dog, an airstrike, ammo) | Ramirisu/tetris is Bevy **0.19.1**, the same version as Davenstein and IW4L. Turning its `main.rs` into a plugin is small, after which both run in one `App` | small | Davenstein runs natively on Android; no browser build |

Phone-browser pairings: P9 and P10 (definite), plus P11 (plausible).

---

## 6. Cut / dropped

- **WangYiBen0/Ruleste**: still one empty commit (also dropped in round 1). ✔
- **smileybaal/terra-rust**: its 126k generated lines are stubs. Only the handshake, `SyncPlayer` and the world reader work. It's a server only and needs the real client. ✔
- **EliseZeroTwo/WARS-8**: a two-week project from 2021 whose README says "game support is limited". SDL2 + wasmtime 0.21. ✔
- **Astrabit-ST/Luminol**: an editor, not a player. Moved to the category table. ✔
- **LukeGrahamLandry/hctarcs**: no keyboard or mouse input, so it can't run games. Dormant since 2024. In the category table. ✔
- **zabackary/scratch-vm-wasm-runtime**: an abandoned prototype; its author says it's slower than TurboWarp. ✔
- **ElnuDev/renrs**: a 10-day WIP from 2023. ✔
- **gapolli/fantasyconsole**: 11 commits, with carts that are only "inspired by" PICO-8 and TIC-80, on SDL2. pico-r is strictly better. ✔
- **andreapavoni/parabellum**: a Travian-inspired MMO that needs Postgres + Bun; demo returns 502. Pillage First (B8) does the same job on a phone. ✔
- **IbsYoussef/Maze-Runner-FPS**: a school project, an original Maze Wars-style game. ✔
- **Dj-Shortcut/mw2-rust-rust-rewrite**: a two-day-old sibling of the reference mashup (IW4L + skate) that is turning into an original survival game, with no playable release. Worth watching, but not a building block. ✔
- **wdominik/motionvm**: German 1990s advergames, with no mashup fit. ✔
- **Theaninova/mhlib** (Moorhuhn): Godot + Rust, partial, dormant since 2023. ✔
- **jstasiak/openpol** (Polanie): only the intro and menu work; last commit 2022. ✔
- **begiedz/wedges-trial**: a WIP Next.js lockpick toy whose README is still the create-next-app boilerplate. ✔
- **2009scape** (https://gitlab.com/2009scape/2009scape): a large MMO server, cut for the same reason as round 1's RuneScape entries. ✔
- **2003scape/rsc-c**: a C99 RuneScape Classic client that needs a server. Low value next to the round 1 cuts. ✔
- **N64Recomp / XenonRecomp / UnleashedRecomp**: for running games only. Their output is machine-level C/C++, not a port source, and XenonRecomp's README says it has "no runtime". Use the round 1 decomps instead. ✔
- **Seen in search but not verified**:
  - zeenix/pixel8: an original console that doesn't run PICO-8 carts.
  - nethercore: a new fantasy console, not a remake.
  - GunZ browser port: C++.
  - The "sb3" desktop Scratch runtime: no URL found.
