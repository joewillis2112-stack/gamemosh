# Mashup shortlist

Filtered from [VERIFIED.md](VERIFIED.md) on 2026-10-03, for a personal Rust mashup project that an AI agent builds (reference: chasmlol/2010-rust-rewrite-mashup).

Scoring keys:
- **Done**: full = plays the whole game. partial = some systems. engine = engine or logic only.
- **Embed**: lib = has library crate(s) you can depend on. plugins = Bevy plugins you can add to another Bevy app. fb = draws to a software framebuffer (easiest to composite). mono = one binary, so you have to extract code from it.
- **WASM**: yes = runs in a browser today. plausible = engine supports web, but there's no target yet. unlikely = desktop-only stack or huge data.
- **Effort**: small = days to about a week of agent sessions. medium = 2–4 weeks. large = 1–3 months.
- ✔ = I re-verified it on 2026-10-03 with a fresh `git clone --depth 1 --filter=blob:none`, read the Cargo.toml and lockfile, and checked for a wasm target.

## Key findings from re-verification

- **There's a shared engine cluster: Bevy 0.19 / wgpu 29.** IW4L (and the reference mashup), star-andreas (GTA SA) and Davenstein (Wolf3D) are all on Bevy 0.19. room4doom and zelda-rs are on wgpu 29. Pieces in this cluster can share one ECS world, renderer and GPU device. Skate 3 and Seismon are one step behind (Bevy 0.18, wgpu 27). Ruffle is one step ahead (wgpu 30). DukeNukemRust is far behind (Bevy 0.14).
- **The research missed one project: SK8-ENGINE/skate-3-rust-engine** (Bevy 0.18.1, last commit 2026-10-02). The reference mashup vendors its `skate-core`, `skate-data` and `skate-net` crates, and those depend only on serde, so they work with any engine. It's added to Section 1 below.
- **Iron Doom (A3) is not a full port.** It's 6.6k lines of Rust, with crates for the title screen, screen melt and world view. Cut.
- **DukeNukemRust (A14) claims to be the full game, but its own `assessment.md` calls it a "~19% prototype".** That assessment was written at 8k lines, and the code is now 40.5k lines. Treat it as partial and unverified.
- **zelda-rs's README links a PROGRESS.md that isn't in the repo.** The README does say it has a "standalone playable binary".
- **MinecraftOSS crates have no engine dependencies** (only glam, serde, zip, flate2). That makes them the most portable world source here.
- **Ruffle can be embedded as a library.** `ruffle_core::Player` has `tick`, `handle_event` and `render`. `ExternalInterfaceProvider` lets your code and the SWF call each other. `render/wgpu` has a `TextureTarget` for drawing offscreen into your own texture.
- Live web builds answered HTTP 200: Iron Wolf, open-pokered, chromatron-oxide, Ruffle, Another World Suite and Dejavu.

---

## 1. Top picks: already rebuilt in Rust

Ranked by mashup value: completeness × ease of embedding × phone potential.

| # | Game: project | Done | Embed / engine | Data | WASM / mobile | Notes |
|---|---|---|---|---|---|---|
| 1 | Wolfenstein 3D: **Ragnaroek/iron-wolf** ✔ | full | lib + bin, fb (emulated VGA 320×200), SDL2 desktop, wasm-bindgen web. 33k LOC | shareware in repo; full game: upload your files | **yes** (wolf.ironmule.dev) | 70 Hz tick. The most mashable browser piece |
| 2 | Pokémon Red/Blue: **liuyanghejerry/open-pokered** ✔ | full | 17 crates (`pokered-core` lib), pixels+winit, web runner, TUI. 252k LOC | assets in repo (from pret) | **yes** (live) + Android/iOS crates | Has touch/mobile crates. Built with an agent workflow |
| 3 | Prince of Persia (DOS): **krepl/SDLPoP-rs** ✔ | full (bug-for-bug) | lib + bin, SDL2 desktop, own wasm backend (no SDL in browser). 42k LOC | in repo | **yes** (`cargo xtask wasm-serve`; no hosted copy found) | Built with Claude Code |
| 4 | All Flash games: **ruffle-rs/ruffle** ✔ | near-full (AS1/2 good, AS3 mostly) | `ruffle_core` lib, wgpu 30 offscreen `TextureTarget`, ExternalInterface bridge | SWFs (Flashpoint) | **yes** (web + extension) | See Flash notes in Section 2 |
| 5 | Wolfenstein 3D: **Ophois47/Davenstein** ✔ | full | **Bevy 0.19 plugins** (`CombatPlugin`, `EnemiesPlugin`…), lib `davelib`. 40k LOC | bundled `assets.pak` | native Android/iOS with touch. WASM plausible | Same engine as IW4L and star-andreas |
| 6 | GTA San Andreas: **dntAtMe/star-andreas** ✔ | partial: streamed world, peds, drivable cars, knockable props. No missions or combat | **Bevy 0.19.1 plugins** (`StreamPlugin`, `VehiclePlugin`, `PlayerPlugin`) + bevy_rapier3d. 14k LOC | your PC 1.0 install | unlikely (GBs of data) | Physics runs at 120 Hz FixedUpdate. The open-world source |
| 7 | MW2: **vladtrc/iw4L** + the reference mashup ✔ | partial MP | Bevy 0.19 / wgpu 29, 61 lib crates. 399k LOC | your Steam MW2 | unlikely | The base the existing mashup is built on |
| 8 | Skate 3: **SK8-ENGINE/skate-3-rust-engine** ✔ *(new)* | partial: skating, tricks, grinds, `.skate` maps | Bevy 0.18.1 host. `skate-core/data/net` work with any engine | your X360 ISO / `default.xex` | unlikely | Missing from VERIFIED.md |
| 9 | Minecraft 26.3: **MinecraftOSS** (vendored in mashup `third_party/`) ✔ | engine: seed-exact worldgen, mobs, inventory | 5 pure-logic crates, no engine (glam, serde, zip) | downloaded from Mojang (~125 MB) | plausible: bake the Mojang files ahead of time (browsers block the fetch), and C codecs in `zip` need care | The mashup's `minecraft_terrain` crate already renders it |
| 10 | Doom: **flukejones/room4doom** ✔ | full (demo-compatible) | 33-crate workspace (gameplay, render, wad…), wgpu 29 / softbuffer / SDL2. 167k LOC | shareware DOOM1.WAD or Freedoom (free) | plausible (softbuffer and winit support web; no target yet) | 35 Hz tick. Good base for Heretic and Hexen |
| 11 | Cave Story: **doukutsu-rs** ✔ | full | lib + bin, own framework on forked SDL2/glutin/winit. 92k LOC | freeware download | native Android. WASM unlikely (forked backends) | |
| 12 | Chromatron: **stared/chromatron-oxide** ✔ | full (pixel-perfect) | single crate, softbuffer+winit, Trunk. 6k LOC | recovered from binary, in repo | **yes** (live) | Small laser puzzle. Good minigame |
| 13 | Zelda ALttP: **kenerwin88/zelda-rs** ✔ | substantial, unfinished, parity-tested | 14 crates, wgpu 29 + winit. 510k LOC | your ROM (assets baked at build) | plausible | Top-down 2D overworld and combat |
| 14 | Pokémon battle engine: **vjeux/pokemon-showdown-rs** ✔ | engine (Gen 9 random-battle parity) | single lib, pure logic (rayon) | in repo | plausible (make rayon optional) | Drop-in turn-based combat |
| 15 | Pokémon-like battles: **jackson-nestelroad/battler** ✔ | engine + AI + damage calc | 47 crates, wasm-bindgen already used (`js-clients/battler-web-app`) | own dex in repo | yes-ish (bindings exist, untested) | Alternative to #14 with AI included |
| 16 | Duke Nukem 3D: **NicholasMeacoe/DukeNukemRust** ✔ | claims full; own assessment says partial | Bevy **0.14** (old) + bevy_rapier3d, one binary. 40k LOC | shareware GRP (free) | unlikely | Porting to Bevy 0.19 is a prerequisite |
| 17 | Quake: **eira-fransham/seismon** ✔ | partial (demos play on the `bevy` branch; main branch is mid-migration) | Bevy 0.18 sub-crates + wgpu 27, plugin-based | shareware pak (free) | unlikely | Only Rust Quake with a PC renderer |
| 18 | Red Alert 2 YR: **YuriPlanet/vera20k** | partial (skirmish vs placeholder AI) | wgpu 27 + winit + egui, mostly one binary | your Yuri's Revenge | unlikely | Only usable RTS. Built with AI agents |
| 19 | Another World: **another-world-suite** / **AWER** | full engine (the Suite has no sound) | wasm-bindgen + SDL2 / SDL2 | your original data | **yes** (Suite live) | Polygon cutscene style |
| 20 | Minecraft worldgen: **Pumpkin-MC/Pumpkin** | engine (server; the `pumpkin-world` crate has worldgen) | lib crates, tokio, no renderer | none | unlikely | Backup world source if MinecraftOSS falls short |
| 21 | Shockwave: **igorlira/dirplayer-rs** | varies by movie | wasm | DCRs (Flashpoint) | **yes** | Like Ruffle, for Director games |
| 22 | Tetris: **YannickHerrero/tetrs** | full guideline | ratatui terminal, but the engine logic is reusable | none | plausible (logic only) | Minigame logic |
| 23 | Bethesda worlds: **matiaszanolli/ByroRedux** | engine (world loader/renderer) | ash/Vulkan + wgpu 27 | your Bethesda installs | unlikely | World source only, and heavy |
| 24 | GameMaker 8: **OpenGMK** | full runner | desktop binary | GM8 .exe | unlikely | Only for a specific GM8 game |
| 25 | Quake III: **immunant/ioq3** (C2Rust) | full | transpiled unsafe C, one binary | demo pak | unlikely | Hard for an agent to edit |

## 2. Top picks: could be rebuilt

Ranked by how fast an AI agent could produce a working Rust version. Games already in Section 1 are excluded.

| # | Game | Source (proof in VERIFIED.md) | Size | Agent rebuild time | Data | WASM / phone | What it brings to a mashup |
|---|---|---|---|---|---|---|---|
| 1 | **Any Flash game** (e.g. Bloons TD 1, Club Penguin minigames) | Ruffle runs it; JPEXS decompiles it | n/a | **~0** to run; small per game for a real port | Flashpoint | yes | See notes below |
| 2 | **Line Rider** | conundrumer/lr-core (JS physics core) | small | days | none (JSON tracks) | yes | Physics: a sled on lines you draw |
| 3 | **Canabalt** | ericjohnson/canabalt-ios (Obj-C/Flixel) | small | days–1 wk | in repo | yes | Runner controls and procedural rooftops |
| 4 | **Tiny JS games**: Hextris, 2048, Clumsy Bird | official repos | tiny | 1–3 days each | in repo | yes | Minigames, hacking or lock-pick screens |
| 5 | **Incremental games**: Universal Paperclips (6.5k lines), A Dark Room, Candy Box 2, Cookie Clicker (17k lines) | readable JS/TS | small | ~1 wk | text / in repo | yes | An economy or progression layer over another game |
| 6 | **SimCity (Micropolis)** | SimHacker/micropolis (C/C++ sim) | small–medium | 1–2 wks | in repo | yes | Tile city generator and sim: a world source |
| 7 | **Space Cadet Pinball** | k4zmu2a/SpaceCadetPinball (full decomp). Partial Rust (A36) is a head start | small | 1–2 wks | PINBALL.DAT (your XP copy) | yes | Pinball physics and table minigame |
| 8 | **Heretic / Hexen** | Raven source releases | small–medium | 1–2 wks *as room4doom extensions* | Heretic shareware free | plausible | New weapons, monsters and inventory for the Doom engine |
| 9 | **Commander Keen 4** | sulix/omnispeak (bug-for-bug C) | small–medium | 2–3 wks | shareware free | yes | 2D platformer controls and levels |
| 10 | **BrowserQuest** | mozilla/BrowserQuest (JS client + server) | medium | 2–3 wks | in repo | yes | Top-down RPG world and simple MMO netcode |
| 11 | **HexGL** | BKcore/HexGL (three.js) | small–medium | 1–2 wks (Bevy/wgpu) | in repo | yes | Anti-gravity racing physics and track |
| 12 | **Abuse** | Xenoveritas/abuse (C++ + Lisp scripts) | small–medium | 3–4 wks | in repo | plausible | Side-scrolling shooter with mouse aim |
| 13 | **Rise of the Triad** | videogamepreservation/rott (Wolf3D-derived C) | medium | 3–4 wks; start from Iron Wolf | shareware free | plausible | A beefier raycaster: jump pads, rockets |
| 14 | **Quake** | id-Software/Quake (Seismon and quake-psx as references) | medium | 4+ wks | shareware pak free | plausible (software renderer) | First true-3D rebuild candidate |
| 15 | **Super Metroid / Super Mario World** | snesrev/sm, snesrev/smw (C reimplementations) | medium | 4+ wks (mechanical port; zelda-rs took ~3 months for full parity) | your ROM | plausible | 2D platforming at its best |
| 16 | **Sonic 1/2 (2013)** | RSDKv4 decomp | medium | 4+ wks | your Data.rsdk | plausible | Momentum physics |
| 17 | **Pokémon Crystal** | pret/pokecrystal | medium | 3–4 wks (reuse open-pokered's architecture) | built from repo | yes | Johto region, day/night cycle |
| 18 | **Diablo** | diasurgical/devilution | medium–large | 4–6 wks | free shareware spawn.mpq | plausible | Isometric loot and dungeon generation |
| 19 | **Duke Nukem 3D** | icculus/duke3d + Build source | medium | finish DukeNukemRust instead | shareware free | plausible | Build-engine levels and weapons |
| 20 | **shapez.io** | tobspr/shapez.io | medium | 3–4 wks | in repo | yes | Factory and conveyor logic |

**Flash via Ruffle: what a mashup actually involves.** Nothing needs rebuilding to *run* a Flash game. Ruffle plays the SWF, either in a browser (wasm) or embedded as `ruffle_core`. The mashup work depends on how deep you go:
- **Game-in-game (small).** Render the SWF to a texture with Ruffle's wgpu `TextureTarget` (desktop), or to a DOM overlay (web), and show it on an arcade cabinet, a phone or a pause screen.
- **Event bridge (small).** Ruffle's `ExternalInterfaceProvider` passes calls both ways between your Rust code and the SWF. Unmodified SWFs rarely call out, so the bridge usually needs a small patch: either use JPEXS to edit the SWF and add `ExternalInterface.call("score", n)`, or read the SWF's variables from Rust.
- **Deep mash (medium per game).** To swap the physics or controls into another engine, use JPEXS to decompile the ActionScript and assets, then have an agent port the logic to Rust. Most Flash games are small, so this is usually 1–2 weeks.
- Caveat: Ruffle is on wgpu 30, while the Bevy 0.19 cluster is on wgpu 29. They can't share a GPU device, so render on a separate device and copy the texture over (or wait for Bevy to catch up). In the browser this doesn't matter.

## 3. Suggested pairings

| # | Mashup | Who supplies what | Why it fits | Effort | Phone |
|---|---|---|---|---|---|
| 1 | **Wolfenstein of Persia** (Iron Wolf + SDLPoP-rs) | Wolf3D: the maze world, guns, first-person exploration. PoP: side-view sword duels, traps, spike pits. Opening certain doors drops you into a PoP room; win the duel to return | Same DOS era and look. Both draw to a palettized 320×200 framebuffer, so switching between them is just swapping buffers. Both already build to wasm. Ticks (Wolf 70 Hz, PoP ~12 Hz logic) run separately because only one mode is active at a time | small–medium | **yes, mobile browser** (needs on-screen buttons) |
| 2 | **Pokémon Game Corner arcade** (open-pokered + Ruffle) | Pokémon: the world, NPCs and coin economy. Flash: Celadon's slot machines become real Flash games (BTD1 and others from Flashpoint). Winning pays out Pokémon coins | Pokémon already has an arcade building. Both run as wasm on the same page, with Ruffle in a DOM overlay. The JS bridge carries the score into the game | small | **yes, mobile browser** (open-pokered already has touch) |
| 3 | **Pokémon Red × Wolfenstein encounters** (open-pokered + Iron Wolf) | Pokémon: overworld, trainers, progression. Wolf3D: tall grass and trainer fights become short first-person firefights in an arena generated from the route's tile map. Defeated guards become party "captures" | Both are tile grids (GB 8×8 metatiles, Wolf 64×64 cells), so mapping between them is direct. Both are framebuffer wasm games | medium | **yes, mobile browser** |
| 4 | **Rooftop Rider** (rebuild Canabalt + Line Rider core) | Canabalt: endless rooftops, speed ramp, controls. Line Rider: the sled physics. You draw lines with a finger to bridge gaps ahead of the runner | Both are small 2D browser games and an agent could port each in days. Line Rider's physics runs at a fixed 40 Hz, which fits a 60 fps runner | small–medium | **yes, mobile browser** (touch drawing is natural) |
| 5 | **Minecraft overworld for Pokémon** (MinecraftOSS + open-pokered) | Minecraft: seed-exact terrain, biomes, mobs (grass and beach become routes; villages become towns). Pokémon: top-down rendering, movement, battles (optionally with showdown-rs). Minecraft mobs become wild encounters | Pure-logic world crates feeding a 2D tile renderer. Matches the reference mashup's "endless Minecraft world" idea, but on a phone | medium | plausible (bake the Mojang data ahead of time) |
| 6 | **Wolfenstein in San Andreas** (star-andreas + Davenstein) | GTA SA: streamed city, peds, drivable cars, knockable props. Wolf3D: enemy AI, combat, weapons and HUD, with Nazi guards as billboard sprites patrolling Grove Street | Both are Bevy 0.19 plugin sets, so they add to one `App` without fighting over the renderer or ECS. Physics shares Rapier | medium | no (desktop. Davenstein alone runs on Android) |
| 7 | **Extend the reference: MW2 + Skate 3 in San Andreas** (iw4L mashup + star-andreas + skate-core) | MW2: player, weapons, bots. GTA SA: the open world and cars. Skate 3: the skate mode, already linked into the mashup | All Bevy 0.19 / wgpu 29, and the mashup already uses skate-core with this engine. SA's COL collision becomes the skate surface | medium–large | no |
| 8 | **SimWolf** (rebuild Micropolis + Iron Wolf) | Micropolis: you build the city, and its crime and pollution maps decide enemy density and decorations. Wolf3D: patrol any city block in first person, generated as a 64×64 map | Micropolis's tile grid maps directly onto Wolf3D's grid. Both are small, 2D and wasm-friendly | medium | **yes, mobile browser** |

Mobile-browser pairings: 1, 2, 3, 4 and 8. Pairings with browser games: 2 (Flash via Ruffle) and 4 (Canabalt and Line Rider).

## 4. Cut (don't re-check)

**Section A**
- A0 (reference mashup): kept as the base project, not a building block in its own right.
- A3 Iron Doom: 6.6k lines, early (title screen, melt, world view only). Use room4doom.
- A4 rust-doom: walk-around renderer only, dormant since 2021. Use room4doom.
- A7 Rustenstein: 2022 hack-week prototype. Use Iron Wolf or Davenstein.
- A8 wolf3d-reimpl-rs: archived, partial raycaster. Use Iron Wolf.
- A9 Richter: abandoned, continued as Seismon.
- A11 quake-psx: builds a PS1 executable, so it only runs in an emulator.
- A12 Quake Anthology Rust: headless so far. Windowed GL, audio and sockets aren't in yet. Revisit in a month.
- A15 HL2-RS: 4 commits, one day old, trainstation preview only (macroquad). Revisit later.
- A16 Lambda: an HL1 asset viewer only.
- A18 gta3-rebuild-rust: asset pipeline only, not playable.
- A20 OpenFallout3: a quest vertical slice, and ByroRedux covers the world better.
- A21 Vault13: not playable (demo map walk-around).
- A27 ra2.exe (rust-alert): backdated history, launched through npm, completeness unverifiable. vera20k is the verified RA2 option.
- A28 OpenAOE/Chariot: an asset demo, dormant since 2018.
- A29 OpenTTD-Rust: mostly C++, with only a few subsystems swapped to Rust.
- A30 JA2 Stracciatella: C++ with 53 Rust files for config and I/O.
- A35 Rusty Lemmings: partial, Bevy 0.10, dormant since 2023.
- A36 rs-pinball-space-cadet: "an attempt". Rebuild from the decomp instead (Section 2 #7).
- A38 celeste-rust: no README, TAS-oriented, 2022.
- A43 Dejavu: partial GM8 support. OpenGMK is complete.
- A44 encrusted: just a Z-machine interpreter. Only useful as an in-game "Zork terminal" gag.
- A46 Valence: a server framework with no vanilla game or worldgen.
- A47 Feather: inactive, 1.16.5.
- A48 FerrumC: a server with no renderer, and Pumpkin and MinecraftOSS are better world sources.
- A49 Stevenarella / Leafish / Azalea: old-protocol clients (≤1.18.2) that need a server. Azalea has no renderer.
- A51 wrath-rs / wow_vanilla_server: servers that are "nowhere near playable" and need a WoW client.
- A52 terrustia: a Terraria server with no worldgen, and it needs the real client.
- A53 Oxidia, A54 Sirius, A55 Yewoh: pre-alpha servers with no client.
- A56 rs-cache: a cache reader only.

**Section B**
- Doom, Wolfenstein 3D, Cave Story, Prince of Persia (Apple II), Zork, Pokémon Red, ALttP: already in Rust (Section 1).
- Super Mario 64, OoT, Majora's Mask, TP/BotW, Perfect Dark, Mario Kart 64, Banjo-Kazooie, Star Fox 64, Paper Mario, Animal Crossing, Metroid Prime: large 3D console decomps, months of work each.
- Jak and Daxter (OpenGOAL): a huge custom Lisp engine.
- GTA SA (gta-reversed): huge and incomplete. star-andreas already covers the world.
- Fallout 1/2 CE: a large isometric RPG with a long script tail.
- Tomb Raider (TRX/OpenLara): large 3D. OpenLara's web demo already exists as-is.
- Morrowind, Daggerfall, RCT2, OpenTTD, OpenRA, X-COM, Theme Hospital, Warcraft II, StarCraft: large sims, RPGs and strategy games, too big for a few weeks.
- Doom 3, RTCW/ET, Jedi Outcast/Academy, Generals, Renegade, Half-Life 1, FreeSpace 2, UT99: large 2000s 3D engines.
- Quake II / Quake III: large. Do Quake 1 first. A C2Rust Q3 already exists.
- Shadow Warrior / Blood: do Duke 3D (same Build engine) first.
- Descent, Marathon: medium-large 3D engines with weak mashup fit compared with the picks above.
- C&C Tiberian Dawn / Red Alert source: a large C++ RTS codebase. vera20k covers RTS.
- LEGO Island: a medium decomp that needs your CD, with weak mashup value.
- Minecraft Java (unobfuscated jars): large, and MinecraftOSS already exists.
- Pokémon Emerald: GBA, medium-large. Do Crystal first.
- Pokémon Showdown client and server: UI-heavy, and the battle engine is already in Rust.
- Untrusted: the game is editing JavaScript, so a Rust rewrite would need a JS engine anyway.
- Club Penguin (MMO), Habbo v14, RuneScape Classic/2004/377/OSRS: MMO servers are large. Run their minigames or SWFs through Ruffle instead.
- Bloons TD5 decomp: needs your copy, medium. BTD1 runs through Ruffle for free.
