# How the "merges" actually work: high-quality content ports (2026-10-07)

The user: "Most games im seeing do actually kinda read like a mod but like an extremely complex high quality mod. They have menus so the player can edit which aspects from which impact what, where, and when … this isn't the complete merging of 2 games, its perfectly 'merging' assets from 1 game into another."

I read the code of the projects behind the examples (cloned at the commits below), not their videos or write-ups.

## The projects

| Project | Host (stays the game) | What comes in from the guest | How the guest is 1:1 | Control surface |
|---|---|---|---|---|
| [AZP3001/mc-passthrough](https://github.com/AZP3001/mc-passthrough) @d070f07, Minecraft × GTA V (the firework/TNT clip) | GTA V story mode, missions still playable | Real Minecraft 26.3 runs beside GTA: Steve, items, blocks, mobs, movement, HUD | It *is* Minecraft (a Fabric mod), its picture composited into GTA's frame against GTA's depth | F6 Minecraft movement on/off, F7 whole mod on/off, F9 god mode, `MCPassthrough.ini`, ReShade sliders for how Minecraft is lit, ~20 chat commands (`/gta superjump`, `/tune`, `/range`, `/summon car`) |
| [lewistardif/RocketLeagueMinecraft](https://github.com/lewistardif/RocketLeagueMinecraft) `gta/` @a1d10cc, Rocket League in GTA V | GTA V | The RL car and ball | A Rust core checked tick by tick against RocketSim; real Octane/ball meshes from the user's RL install | `RLCar.ini` holding RL's real constants (gravity −650, boost 991.67…), an F7 menu (become the car, hitbox preset, team, unlimited boost, ball), F10 reload |
| [chasmlol/iw4l-skate](https://github.com/chasmlol/iw4l-skate) @f608f85, "2010 Rust Rewrite Mashup" | MW2 (IW4L, a Rust rewrite reading the user's MW2 files) | Skate 3 mode (press J: the soldier drops onto a board with Skate 3's physics, tricks, grinds); a Minecraft world as an MW2 map, with Minecraft's mobs, blocks, items, sounds | Skate 3 engine built against a static recomp of the user's Xbox 360 `default.xex`; Minecraft from MinecraftOSS (Rust) plus Minecraft's own files downloaded from Mojang's servers at first run | MW2's own options menus extended: controller layouts, every button rebindable, aim assist. Skate on/off is one key |
| [Dingo-Shenanigans/ReSkate](https://github.com/Dingo-Shenanigans/ReSkate) @3d25966 + [reskate-trainer](https://github.com/andrewnakas/reskate-trainer), skate. (2025) | skate. itself (an injected runtime DLL) | Not a guest game: offline play, servers, mods, and a menu | — | Insert menu: map/travel, world (time, population), park editor, skater (first person, noclip, boosts), MODS tab, and the trainer's TUNE tab |
| universal-modder field notes: Halo 3, Half-Life 1, Left 4 Dead into Minecraft | Minecraft | Weapons, enemies, vehicles, maps | A converter reads the user's own install into a private resource pack (real meshes, animations, textures, sounds); stats from the game's own data (`skill.cfg`, Halo tag fields) | Normal Minecraft items and `/summon` |

Correction to my earlier note: in the "Skate and MW2 in Minecraft" build, MW2 is the host. Minecraft is a map inside MW2 and Skate 3 is a mode inside MW2.

## What they have in common

1. **The host stays whole.** mc-passthrough spends a whole changelog section on keeping GTA's story missions working: no Minecraft input in cutscenes, `/clearall` on mission restart, GTA's slow motion slowing Minecraft too, GTA's phone over Minecraft's HUD.
2. **The guest arrives with its real assets and real rules.** Assets come from the user's own install, or the publisher's servers, at run time; nothing is shipped. Rules come from the guest's own code (running the real game, a recomp, a decompile) or a reimplementation checked against a reference (RocketSim).
3. **A translation table does the "seamless" part.** Every guest verb gets a host consequence, one row at a time. mc-passthrough's README has 66 bullets of them, most holding several mappings: arrows → GTA bullets that burst tyres and break glass; crossbow fireworks → GTA rockets; TNT and creepers → explosions in both games; water puts out GTA fires and carries cars; leads tie GTA people and cars by weight; drawn bows make peds raise their hands; Minecraft armour reduces GTA damage 4% a point; hunger = stamina; hearts = GTA health; `/time` and `/weather` set GTA's. The reverse rows exist too: GTA guns break blocks by hardness, GTA fire burns mobs. The quality people see is the length and care of this table.
4. **The guest is matched to the host's look.** Minecraft is relit from GTA's surfaces with GTA's gamma and grade (ReShade sliders). Steve copies GTA's skeleton. RL's car is drawn with GTA's own particles for boost.
5. **The guest is made legible to the host's systems.** Spawned Minecraft cows become GTA animals; the RL car is a GTA vehicle puppet so GTA's AI, police and audio react; guns are GTA's own vehicle weapons.
6. **A control surface over all of it**, at three levels:
   - **Switches:** whole mod, guest movement vs host movement, god mode, which hands (guest items or host weapons).
   - **Numbers:** the guest's real constants in an `.ini` or menu, reloadable live (F8/F10).
   - **Generated menus (ReSkate's trick):** the trainer doesn't hand-code its sliders. It reads the game's own tuning asset (`Gameplay/SkatePhysicsTuning`, field names from the game's data) and builds the whole table from it: search, groups, "only what I changed", locks, presets, a preset a map applies when it loads, all live while you skate. That's why it "changes nearly anything": anything the data names becomes a control for free. Values the game was never seen reading are hidden.

## What that means for us

- **Our rule is now:** a host game that stays whole, plus guest content with its real assets and real rules, plus a long translation table, plus a generated settings menu. Judge the work by the table's length and how faithful the content is, not by whether "both games' loops need each other".
- **Dukecraft had the right shape** (Duke's real CON scripts, ART and sounds in a Minecraft world). It was short on everything else:
  - its translation table was ~8 rows;
  - you stayed Steve with Minecraft's HUD;
  - there was no menu at all;
  - the host was our own approximation of Minecraft, not Minecraft.
- **Menus can be generated from data we already parse:** QuakeC's field and global defs (names and types, read by `dukequake/engine/src/progs.rs`), Quake's cvars, Duke's CON `define`s and actor tables (`dukecraft/con`), RL-style constants. Each becomes a slider or switch without hand work, the way ReSkate does it.
- **Phone constraint (corrected below):** the reference projects are desktop mods, but phone browsers are not the limit. Big decompiled games already run in them. The limit is getting the game's data.

## Candidates, by this standard

| Host (whole, real) | Guest content | Real rules from | Phone |
|---|---|---|---|
| **Quake** (our Rust port, bit-exact against id's C) | Duke Nukem 3D: weapons, HUD, Duke himself, aliens, jetpack, pipebombs, shrinker | Duke's CON scripts (our VM) and Duke's C (JFDuke3D) for the player code | Both shareware; both cores already build for wasm |
| Quake | Minecraft: blocks, TNT, bow, mobs, Steve's kit | MinecraftOSS (vendored in iw4l-skate) | Minecraft files from Mojang at first run |
| Pokécraft's Minecraft (our approximation) | Duke (Dukecraft v2) | as above | Already ships; host not real |

## Big hosts already run in phone browsers (added 2026-10-07)

The user: people have ported GTA to the browser and it runs on phones with no jailbreak; someone embedded a multiplayer Minecraft remake in a tweet.

- **GTA: Vice City runs in the browser, on phones, with touch.** It's the reVC decompilation compiled with Emscripten (WebGL 2).
  - DOS Zone's revcDOS ([Carter54git/revcdos](https://github.com/Carter54git/revcdos), [Lolendor/reVCDOS](https://github.com/Lolendor/reVCDOS)) is binary only: no engine source, data streamed from their CDN or compiled from your own copy.
  - **Source-available builds exist**, which is what adding content needs:
    - [origami-ltd/wasm-revc](https://github.com/origami-ltd/wasm-revc) @acde392: `REVC_AUDIO=OAL ./scripts/build-web.sh` → `reVC.{js,wasm}`; streams your own files on demand; IndexedDB saves; needs SharedArrayBuffer (HTTPS with cross-origin isolation).
    - [ololoken/re3x](https://github.com/ololoken/re3x) @9a1a4fb (2026-10-06): `emcmake cmake` with librw GL3.
  - reVC has a **built-in debug menu** (Ctrl-M, `CDebugMenu`) that any C++ can add entries to: a ready-made control surface for a content port.
  - The game data (~1.4 GB, the user's own copy) is the blocker. DOS Zone's CDN returns 403 from this container, and nothing here has the files.
- **The multiplayer Minecraft in a tweet:** I couldn't find it. One-click multiplayer in the browser is ordinary tech (a WebSocket relay; e.g. "JanneCraft", built in a day with a 21-byte position packet). It needs a server running somewhere; this container can't host one persistently.
- **GTA V in the browser (checked 2026-10-07):** real. playgta5.com went viral on 2026-10-06: it ran story mode and free roam in Chrome and on Android phones, with about 700 MB up front ([Gizmodo](https://gizmodo.com/browser-based-grand-theft-auto-v-shows-how-ai-is-making-it-easy-to-illegally-port-games-to-new-platforms-2000822395), [VideoCardz](https://videocardz.com/newz/someone-ported-gta-v-to-a-web-browser)). Posts say it's built on GTA V's leaked source. It's offline now, and no source or developer is public, so nothing can be built on it. **GTA IV in the browser: I found no evidence.**
- **"Twittercraft":** per the user, a Minecraft remake with textures changed just enough to avoid a takedown, the same kind of thing as Pokécraft's Minecraft half. So our own Minecraft remake is a fair host, and one-click multiplayer on it is a WebSocket relay away.
