# RESEARCH

A working log for this repo. It records common themes, what has been learned, mistakes and corrections, and ways of working that have held up.

**Read this before starting a task here.** When a task goes sideways, come back and check whether a lesson below already covered it. Add new entries under the right heading, and add a line to the session log at the bottom.

---

## 1. Working agreement with the user

- **Style:** terse. No padding, hedging or performative summaries. Say "I don't know" rather than guess. Call out mistakes, including the user's, but check facts before correcting.
- **The user can't code.** They work entirely through agents. Deliverables must land somewhere they can see, which means `main` on GitHub, not a side branch.
- **Branches and PRs:** this environment creates a `claude/...` branch, opens a draft PR and auto-subscribes to PR activity. The user doesn't want PRs watched or hourly check-ins. If an auto-subscription appears, unsubscribe and don't schedule `send_later`. When the user says "merge", merge it. If unsure whether work should go straight to `main`, ask once at the start.
- **Notes go in files, not chat.** Put findings, notes and long summaries in repo files (this one, `mashup-research/`). Keep chat replies to what changed and where.
- **No legal caveats.** These are personal, never-distributed projects. Only mention licences where they change how files are obtained (for example, "needs your own copy").
- **Sub-agents:** use them when asked, and match the shape asked for (for example, one to find and verify, one to filter). Don't spawn them otherwise.
- **Phone matters.** The user plays on mobile. Prefer WebAssembly/browser builds and touch controls.
- **Write-once, extend-forever.** Prefer structures that grow, such as numbered rounds and appendable files, over rebuilds.

## 2. Mistakes and corrections (don't repeat these)

| # | What happened | Why it was wrong | Do instead |
|---|---|---|---|
| 1 | After the game shipped, I ran ~30 hourly "check the PR" turns over a day with nothing changing | The user never asked for it. It was an environment default I followed without saying so, and it burned usage | State the default up front, and stop after the first idle check. Now: never watch PRs unless asked |
| 2 | The game existed only on `claude/...`, so the user saw an empty `main` and thought nothing was done | I didn't explain where the work lived | Say where deliverables are in plain words, and offer to merge |
| 3 | I kept adding legal caveats after the user said they didn't matter | Ignored stated context | Drop the topic the first time the user waves it off |
| 4 | Infinity Blade IPA extraction plan: started down a path the user then abandoned as "gonna spiral" | Didn't flag the walls before starting | For open-ended asset or RE work, name the likely blockers before doing anything |
| 5 | Round 1 research agent: listed Iron Doom as a full port and DukeNukemRust as complete, and missed skate-3-rust-engine | Agents over-trust READMEs | Always run a second filter/verify pass, and spot-check surprising claims myself (commit counts, dates, co-author trailers) |
| 6 | Round 2 agent marked vange-rs "AI-written: yes" from 133 Claude-authored commits, but the project is from 2016 | "Has AI commits" is not "AI-written" | Report the AI share and the project start date. Count commits, not trailers (one commit can carry several) |
| 7 | Rounds 1 and 2 said open-pokered had "assets in repo" and chipdx was "phone-ready". Building them showed open-pokered fetches its graphics at build time, and chipdx needs rustc 1.95 and ships a 16 MB wasm | Desk research can't see build-time gotchas | "Runs on mobile" is only claimed after a real wasm build and a headless mobile run. Desk research ranks; builds decide |
| 8 | Game Corner v1: GO TO THE GAME CORNER wiped an existing save with no confirmation, and the portrait layout was 410 px wide on a 390 px phone | Guarded only one of two destructive buttons. Tested only with the fallback font (the real pixel font is wider and Google Fonts is unreachable in this sandbox) | Guard every action that replaces a save. Test layout with the real web font served locally (route fonts.googleapis.com in Playwright) at 390, 360 and 320 px |
| 9 | The playtest agent was cut off by a usage limit and could not write its report file | Long sub-agent runs can die partway, and sub-agents may be refused file writes | Tell sub-agents to report incrementally, and to put the full report in their final message. Resume a stopped agent with SendMessage instead of respawning it |
| 10 | Game Corner Arcade was a menu between two games (walk up to a slot, pick a PICO-8 cabinet, coins carry back). The user: "it feels like an arcade menu where I get to choose which game". Released moshes are two games as one | I designed from the word "mashup" and never looked at what released moshes look like | Before designing a mosh, look at real ones (images, video). Test the design against the definition: one world, both games running in it at once. See INSTRUCTIONS.md §0 |
| 11 | Pokécraft v1 was top-down 2D. The user: "a dumbed down version of the old Pokémon games inside a world with Minecraft textures… in a 2D game you can't see what's a hill, you can't tell if you can walk under something". They wanted the Pixelmon approach, in first person | I picked the cheapest view (reusing the Game Boy look) over the experience the user already knows from the reference mod | When a mosh has a famous reference (Pixelmon, SkyCraft), match its viewpoint and core loop first, and ask what it looks like before choosing a renderer. Minecraft without 3D isn't Minecraft |
| 12 | Pokécraft v2 (first person) looked right, but the user: "much is lacking on the Minecraft side and Pokémon side". There was no inventory, just a hotbar with no item names, and the 3D rewrite had dropped tall-grass encounters, Pokémon's core loop | When I rebuilt the view I rebuilt only what I was focused on (rendering, battles) and let each game's basic loop fall out without noticing | Before shipping a mosh, list each source game's core loops (Pokémon: grass encounters, catching, healing, items; Minecraft: inventory, crafting, tools, survival, night mobs) and check every one still works. A rewrite must not silently drop one |

## 3. Domain knowledge: game mashups

**What a mosh is (corrected 2026-10-04)**
- One game. You play one world in which both games run at once. It is not a hub where you pick which game to play. Game Corner Arcade got this wrong (mistake 10).
- One game owns the world and draws it; the other owns the player or the rules and can run hidden. SkyCraft: Skyrim draws, Minecraft is the player. Pokécraft: Minecraft makes the world, Pokémon runs the player's party, battles and menus.
- The candidate list never settles. New AI rewrites appear every few days (the user, 2026-10-04), so redo a research round before a new mosh rather than trusting an old shortlist.

**What a mashup actually is**
- The reference project (chasmlol/2010-rust-rewrite-mashup) joins three independent Rust rewrites: IW4L (MW2), skate-3-rust-engine and MinecraftOSS.
- No game assets are in the repo. They're read from the user's own install, extracted from their own disc, or downloaded from the official servers.
- "Needs the game installed" means "reads its files". The original game never runs.

**Where the work really is**
- AI agents can rewrite a game in weeks: IW4L took ~3 weeks of public history and Skate 3 ~4 weeks, both credited to Claude.
- But they build on years of human reverse-engineering (the Skate 3 README says so). Access to the files is never the bottleneck; documentation is.

**How hard a game is to rebuild, easiest first**
1. A Rust runtime already exists (Ruffle for Flash, PICO-8 players, Iron Wolf and others).
2. Official source release or full decompilation.
3. Engines that ship readable game code: LÖVE (Lua), PICO-8, C#/XNA/FNA/Unity Mono (decompiles with ILSpy), Godot (GDRE), RPG Maker (Ruby/JS), Ren'Py, Scratch. *(Added in round 2; see `mashup-research/`.)*
4. Well-documented formats with community servers or tools.
5. Raw reverse-engineering. Avoid.

**What makes pieces easy to combine**
- **Same engine version.** IW4L, star-andreas (GTA SA) and Davenstein (Wolf3D) all run on Bevy 0.19 / wgpu 29, so they can be added to one app.
- **Framebuffer games.** Ones that draw to a 320×200 buffer (Iron Wolf, SDLPoP-rs) are trivial to switch between.
- **Same shape.** One game supplies the world, the other the character.

**Phone path**
- Build to wasm and play in the browser.
- Already working there: Iron Wolf, open-pokered (with touch), SDLPoP-rs, Ruffle, chromatron-oxide, Another World Suite.

**Flash**
- Ruffle runs any SWF, so mashing a Flash game in means bridging it, not rebuilding it.
- `ExternalInterface` passes calls between the SWF and your code. JPEXS decompiles SWFs.

**Running readable code from Rust (round 2)**
- Only possible today for PICO-8 (pico-r, wasm, phone-ready), LÖVE (balatro-port-tui, desktop/terminal only; its C Lua blocks wasm) and Flash (Ruffle).
- For Godot, Unity, XNA/FNA, Ren'Py, RPG Maker and Scratch there's no usable Rust runtime. Port their code instead of trying to run it.
- C# games reach the browser through .NET wasm (celeste-wasm, terraria-wasm), not Rust.

**Making candidates, not just finding them**
- vgrichina/re-skill is a Claude Code skill: ROM → annotated disassembly → web port. It produced a Battle City port.
- Small NES, Game Boy and DOS games can be turned into rebuild candidates this way.

**Mobile build facts (from building them, 2026-10-03)**
- **pico-r:** stable Rust, 197 KB gzipped, zero imports, host-driven. Makes a good guest.
- **open-pokered:** use `pokered-runner-web` (host-driven `tick → 160×144 RGBA`, 0.47 ms per tick). `pokered-web` owns a winit loop. Run `scripts/fetch-gfx.sh` before building.
- **Iron Wolf:** nightly only (E0554/E0658 on stable). Owns its own 70 Hz loop, has no touch, and is 270 KB gzipped.
- **SDLPoP-rs:** build the release (2.77 MB raw; the documented build is debug at 25.7 MB). It runs in a Worker with SharedArrayBuffer, so it needs COOP/COEP headers. GitHub Pages and single-file pages are out.
- **chipdx:** rustc ≥ 1.95, and 15 MB gzipped because the music is embedded.
- **Battle City** (re-skill) is JS only.
- **Several wasm games share one page fine** when each is driven by a single `requestAnimationFrame` loop. Pieces that own a winit loop must be separate modules.

**Recompilation (N64Recomp, XenonRecomp)**
- These turn console binaries into machine-generated C/C++. That's useful for running a game natively, but hard to read and port. All are C/C++; none are Rust or wasm so far.

**What makes a true merge (survey of 2026-10-05; details in `mashup-research/MERGE_EXAMPLES.md`, rules in INSTRUCTIONS.md §B8)**
- The user's gold example is the Rocket League car and ball in GTA V. The closest public code is lewistardif/RocketLeagueMinecraft `gta/`, built with Claude in days:
  - RL's physics is a small Rust core, checked 1:1 against RocketSim in `cargo test`.
  - GTA's own physics is switched off on the car and ball.
  - GTA's world is probed into RL collision, with quarter-pipes generated at the foot of walls.
  - RL's demolition maths decides a hit, and GTA's ragdolls and explosions carry it out.
  - The same core plugs into Minecraft, Skyrim and Bevy.
- Its sibling family is libsm64: decompiled SM64 movement as a library, embedded in GMod, Minecraft, Rocket League and GTA SA. Zckyy/mario64-in-minecraft (also built with Claude) is the closest model for Pokécraft:
  - Blocks become SM64 triangles each tick.
  - Stairs become ramps, and lava and water become SM64 surfaces.
  - Mario stomps mobs.
  - The power meter mirrors hearts.
  - Music is chosen by biome.
- Official merges add global rules (Cadence of Hyrule's beat, Don't Starve's hunger and darkness in Terraria), cross-game AI (FFXIV enmity in Monster Hunter) and an economy on foreign terrain (Steve mining the Smash stages).
- The control case is Rocket League's licensed cars: a skin on a standard hitbox. That's an asset swap.

## 4. Technical lessons from building Gloamreach (`src/`)

- **Three.js r186:** set `ColorManagement.enabled = false` first (`src/colorsetup.js`), use Linear output and no tone mapping, and multiply light intensities by π. Otherwise the scene renders far too dark.
- **Rapier:** never mutate bodies inside query callbacks. Collect the hits first, then act.
- **Fixed-step input:** clear `pressed` only when at least one physics step ran, and consume menu keys before stepping. Otherwise inputs get dropped at high frame rates.
- **Streaming:** the title camera and the loader both requesting chunks caused a hang. Have a single owner per system.
- **Headless Chromium (swiftshader) runs at ~4 fps.** Wait on game time (`state.stats.playTime`), not wall time. Write background test runs to log files, because output is lost on timeout.
- **Shell:** `pkill -f <pattern>` can kill its own shell.

**Game Corner Arcade (`gamecorner/`), mosh lessons**
- **Drive guests from the host loop.** Both wasm modules are stepped from one `requestAnimationFrame` loop with accumulators (Pokémon 59.73 Hz, PICO-8 at the cart's rate). Neither owns a loop.
- **One page-owned audio output.** Patch guests so they render samples on request (`render_audio(frames, rate)`) instead of opening their own Web Audio device. Tearing down a device output in open-pokered (`set_muted`) left orphaned callbacks throwing "closure invoked after being dropped". When the loop stops, output silence (a heartbeat check), or the sound chips drone their last note.
- **Read guest state without editing the guest.** pico-r got a `web_get_global("room.x")` export that reads Lua globals, which beats patching carts. Check the cart's draw code for the real display value: Bubblegum prints `score.."0"`, and Ghost Wave stores 16.16 fixed point.
- **Intercept, don't replace.** Poll the host's screen name (`Slots`), close it before it draws (`leave_slots`), and show your own overlay. The original scripts (slot signs, the attendant's PLAY) keep working untouched.
- **Touch input:** latch presses (a tap can start and end between two polls). Carry tap bits until a tick actually runs (30 fps carts, 120 Hz screens). After a screen change, swallow only buttons still physically held.
- **open-pokered gotchas:**
  - `PokemonGame::new` on wasm silently loads `localStorage['pokered.save']`.
  - `export_save` is the last in-game save, not the live state, so the patch adds `export_live_save`.
  - Script `npc = N` is 1-based into `map.json` npcs.
  - The editor-save `currentHp` defaults to 0, which means a fainted mon.
- **claude.ai artifacts:**
  - Publish a fragment (no html/head/body); the host adds viewport and safe-area padding.
  - `confirm()` returns false, so build confirmations into the page (two-tap).
  - 16 MB page limit: the bundle is 12.3 MB with both wasm modules base64-inlined.

## 4b. Technical lessons from Pokécraft (`pokecraft/`)

**MinecraftOSS in a browser**
- The 3 world crates (core, generator, world) build for `wasm32-unknown-unknown` with 4 changes:
  - File reads go through an in-memory VFS (`vfs.rs`). No `std::fs`.
  - ChunkMap runs with 0 workers, so there are no threads.
  - An `Instant` shim, because `std::time::Instant::now` panics on wasm32.
  - A `#[cfg]` around `SystemTime`.
- Its data is the client jar's `data/minecraft/{worldgen,tags,structure,dimension_type,*_variant}` plus the block-state catalog: 3645 files, 3.34 MB gzipped.
- `mcgen.wasm` is 2.6 MB with no imports. Startup takes 0.5–1.1 s.
- A chunk takes 40–65 ms in a Worker on desktop Chromium; the first chunk takes about 500 ms, because it also needs its neighbours.
- `MOTION_BLOCKING_NO_LEAVES` gives walkable ground with trees as walls; `WORLD_SURFACE` above it gives the canopy. Together they make a top-down map with no 3D scanning.
- Without storage, ChunkMap keeps evicted chunks in memory forever. Use `trim()`: a seed regenerates a dropped chunk identically.
- Its `spawn_origin()` (vanilla's climate search) and `biome_at_quart()` are cheap, with no chunk needed.

**Drawing one game on top of another**
- To use a game's UI over a different world, render its frame twice with the world layer cleared to two different colours. Pixels that differ are the world; make them transparent. No knowledge of the game's UI layout is needed.
- Fades come out right for free: a full fade maps both clear colours to the same shade, so the screen goes opaque.
- Only screens that draw over the overworld (overworld, START menu, shop) need the double draw. Full-screen ones (battle, party) are opaque and drawn once, so animations with side effects don't run twice.
- Handing control back and forth: the page owns input while the game's layer is fully transparent and its screen is the overworld. Otherwise the game gets every button. No list of menus is needed.
- Pokémon's player stays parked on Route 1. Any map change (blackout, FLY, DIG, ESCAPE ROPE) is read as "go back to your bed".

**Build gotchas**
- `git apply` run inside a folder that is under another git repo resolves paths against the outer repo and skips the patch without error. Run `git init` in the target folder first.
- In Gen 1 a fast wild Pokémon (Voltorb) can block RUN for many turns. Test flows that run away should use a slow species, or end the battle another way.

**Pokécraft in first person (2026-10-05)**
- `mc_volume` exports each chunk's blocks from 12 below its lowest ocean-floor height up to its highest block. That's usually 20–70 rows, 10–35 KB. Below the volume counts as stone.
- Meshing in the same worker as generation: faces culled, per-vertex AO, a sky-height "shadow" (anything under leaves, overhangs or in caves is darker), and three layers (opaque, cutout with alphaTest, water). It produces 2–3k triangles per chunk in 5–20 ms. A radius-3 view is about 31k triangles in about 30 draw calls.
- Turn off three.js colour management (`ColorManagement.enabled = false`, linear output, `NoColorSpace` textures), or the baked vertex colours get converted twice and wash out.
- A second esbuild bundle for the worker, embedded with `define` as a string and started from a blob URL, keeps the game one file. A fallback runs the same module on the page.
- **Battles in a 3D world: keep the camera at the player's eyes.** Over-the-shoulder cameras clip into trees and hills, and pulling them in makes your Pokémon fill the screen. Pixelmon's own answer (you watch from where you stand, your Pokémon steps out ahead) can't clip. Pick the opponent's spot with a line-of-sight test, and make leaves see-through during the fight.
- A hidden game's battle screen: skip its Pokémon pictures (a static flag in the renderer) and key its white background out. Read which side is showing and its slide or shake offsets from the renderer's own state, to drive the 3D sprites. Put pale panels behind the HUD rows so the text reads over the world.
- Pokémon's black battle wipe drawn inside a part-screen layer looks like a broken black box. Detect "only black, over 30% of pixels" and fade the whole view instead. A lower threshold also swallows the black-text-only intro frames.
- Pokémon must stand on real ground: treat leaves as non-standable for spawns and NPCs, or they appear on tree tops and throw off the battle staging.
- Collision zeroes the velocity, so compare the distance moved with the wanted speed when deciding to auto-step, not with the velocity after the move.
- When picking along a pitched view ray, normalise the horizontal direction first, or the hit point falls short by cos²(pitch).
- Headless Chromium renders WebGL in software (SwiftShader). There the game logic held 56–58 ticks/s even at a 4× CPU throttle, but the frame rate was 27–37 fps, limited by the software renderer. Real-device fps is still unmeasured.

**Pokécraft gameplay pass (2026-10-05)**
- Read a game's data straight from its client jar: `assets/minecraft/lang/en_us.json` for item names, `data/minecraft/recipe/*.json` for every recipe (1268 kept: shaped, shapeless, smelting), `textures/item/*` for icons, `textures/entity/*` for mob skins, `textures/block/destroy_stage_*` for cracks, and each biome's `natural_mob_spawns` for which mobs spawn where.
- Mob skins in 26.x: zombie is 64×64; skeleton, creeper, spider, sheep and chicken keep the classic 64×32 layout; cow and pig moved to `temperate_*` 64×64 skins but use the classic UV layout. Box models built from MC's UV rules work.
- Minecraft's break time is hardness × 1.5 / tool speed with the right tool, × 5 without the needed tier (stone by hand is 7.5 s and drops nothing). Players notice when it's wrong.
- Block light without a lighting engine: in the mesher, flood-fill emitter levels (torch 14, lantern and lava 15) a block at a time across a 14-block margin around the chunk, and pass sky and block light as a per-vertex attribute. A one-line `onBeforeCompile` mixes them with the day level. Remesh the 3×3 chunks around an edit only when the old or new block emits light.
- **A worker's chunk snapshot can overwrite newer edits.** The page edits its copy of a chunk and tells the worker; the worker sends back a full snapshot later. Snapshots that were made before the latest edits replaced them, so a block placed quickly after another vanished, and a test pad of 600 edits reverted in patches for seconds. Fix: every edit carries a sequence number, each snapshot says the last one it includes, and the page re-applies its still-pending edits on top. Coalesce the worker's remeshes (a dirty set, flushed once) instead of remeshing per edit.
- A Pokémon that pops out at your feet (grass) or runs into you fills the screen in a first-person battle. Move any opponent under 3.5 blocks back to about 5 blocks along a clear line of sight.
- Step encounters: count distance walked, roll once per block, and give a few grace steps after each battle. Pokémon Red's tall-grass rate is about 1 in 10 steps, which feels right in 3D too.

**Phones: never let the page zoom (2026-10-05)**
- iOS Safari ignores `user-scalable=no`. Calling `preventDefault` on pointer events doesn't stop its double-tap zoom. Two quick taps on the Game Boy pad zoomed the game in, and `touch-action: none` then blocked pinching back out.
- The fix: cancel `touchstart`/`touchend` themselves (`passive: false`) on the play areas only. Pointer events still fire, and buttons outside those areas still get their clicks. Also cancel `dblclick` and `gesturestart`. As a fallback, when `visualViewport.scale > 1`, rewrite the viewport meta tag, which drops Safari back to 1×.
- Headless Chromium doesn't double-tap-zoom, so check the cancelling (`defaultPrevented` on a dispatched `TouchEvent`) and that pad taps still reach the game. The zoom itself only shows on a real iPhone.

**Pokécraft merge pass (2026-10-05)**
- A hidden game's party can be edited from outside its battles by calling its own functions: `process_level_up`, `check_level_evolution`, `finalize_evolution` (through the game's evolution cutscene state). Then levels, moves and evolutions behave exactly as in a battle. Don't reimplement EXP curves on the page.
- A full-screen cutscene from the hidden game (evolution) can play over the 3D world: key its white backdrop out and put pale panels only behind its text, as with battles.
- The follower must not attack monsters that your perks keep calm. Hitting them makes them angry, and the "calm" perk then looks broken. The headless test caught this.
- A carried light is one uniform (position, strength) in the block shader, with distance falloff mixed into block light. Putting it on the follower, which trails behind you, made it nearly invisible. Put it on the player.

## 5. Ways to work that held up

**Research pipeline**
1. Discover (my own searches, or an agent).
2. Verify (an agent clones every repo).
3. Filter (a second agent ranks the results and re-verifies the top picks).
4. Spot-check surprising claims myself.
5. Write the results to the repo, then merge.

**Recombination (from the user, 2026-10-05)**
- Take random 3–5-word strings from the last 15–20 chat messages, pair strings from different messages, and force each pair into a one- or two-sentence question or statement about the work. Write down what each one raises.
- Why it works: the user noticed a better answer came only after they said one specific, almost accidental phrase, after several research passes. Random seeds make that happen on purpose. They pull in context the careful passes had stopped looking at.
- Run `tools/recombine.py <session.jsonl> --last 20 --seeds 30`. It samples evenly per message, so a long summary doesn't drown out the short ones.
- Expect about a third to be duds. Mark them as duds and keep going; each costs seconds.
- In its first use (`mashup-research/RECOMBINATION_2026-10-05.md`), most non-dud seeds gave ideas missing from a design file written an hour earlier.
- Use it after a research or design pass, before building.

**Verification tools**
- `git ls-remote <url> HEAD` for existence.
- `git clone --bare --filter=blob:none` then `git log` for dates, commit counts and `Co-Authored-By` trailers.
- `gh api` only works for repos in this session's scope.
- If WebFetch gets a 403, try curl.

**Game QA**
- Scripted Playwright suites (smoke, mobile, combat, flow), then one gametest agent doing a full playthrough, then fix everything it finds.

**Deliverables**
- Single-file HTML builds (esbuild with WASM inlined) run anywhere, including claude.ai artifacts.
- Whether WASM runs inside the artifact sandbox on a phone is still unverified.

## 6. Open questions

- Does Gloamreach run at a playable frame rate on the user's actual phone, and does Rapier's WASM load inside the claude.ai artifact on mobile?
- MinecraftOSS has no public repo. Where does it come from (mashup issue #21)?
- Game Corner Arcade is published at https://claude.ai/artifact/4hEicr7gfozQmgeqPj8Jjx.
  - Does WebAssembly run inside the artifact sandbox? Its CSP isn't documented, and the page shows "Couldn't start: …" if it doesn't.
  - What frame rate does it get on the user's phone? Not yet run on a real device.
- pico-r and Iron Wolf have no touch input, so a phone build needs an on-screen overlay.
- Pokécraft (https://claude.ai/artifact/QrvL2FGDYSDADfnMwZaY3K):
  - The artifact page's rules say Workers from `blob:` URLs work, but it's unconfirmed on a phone. If the worker fails, the world runs on the page and stutters on each new chunk.
  - What is the frame rate on the user's phone in first person? Untested on a real GPU.
  - Next ideas: badges and gyms, a PC outside the START menu, riding and surfing on Pokémon, villagers in the houses, farming and chests, sounds for mobs and footsteps.
  - Are the survival numbers right on a phone (hunger rate, night length, mob counts)? Tuned only in headless tests.
  - Pokécraft scores weakly on the merge test: no cross-game AI, no shared health, the host's powers don't apply while using the guest's thing, and two bags. The next merge pass is planned in `pokecraft/GAMEPLAY.md`. Would rebuilding Pokécraft's player movement as a Minecraft-exact core, checked against MinecraftOSS the way the RL core is checked against RocketSim, make "1:1" provable?
- Is the user's RL-in-GTA video a private build of lewistardif/RocketLeagueMinecraft or a different mod? The public code lacks the story-mode ability, the camera toggle and homing missiles.

## 7. Session log

- **2026-09-29 → 30:** wrote GAMEMOSH_BRIEF.md. Mobile mashup discussion; the Infinity Blade route was abandoned. Built Gloamreach (seeded dark-fantasy RPG, mobile, Three.js + Rapier). QA agent playthrough; all findings fixed.
- **2026-10-01:** spent a day running idle PR check-ins (mistake #1). The user stopped it. Merged PR #1.
- **2026-10-03:** read chasmlol/2010-rust-rewrite-mashup. Research round 1 (research agent, then filter agent) produced `mashup-research/` (PR #2, merged). Created this file. Research round 2: I gathered leads with web searches, then a sub-agent verified and filtered them (14 Rust additions, 12 rebuildable games, 5 pairings). Results are in `mashup-research/VERIFIED_ROUND2.md`. My spot checks qualified the vange-rs and Legaia authorship claims.
- **2026-10-03 (later):**
  - Wrote `INSTRUCTIONS.md`, a guide to rewriting and moshing games. Sources: the mashup's code and agent docs (`CONTEXT.md` journal and suffixes, the skate adapter, collision, rails, rig), Legaia's `CLAUDE.md`, re-skill, and the Bun port write-up.
  - A sub-agent built 8 pieces for wasm and ran them in a headless mobile browser. The ranked picks are in `mashup-research/MOBILE_PICKS.md`: (1) Game Corner Arcade, (2) Wolf Arcade, (3) Wolfenstein of Persia. Three games ran together on one page (the screenshot is checked in).
  - Added `CLAUDE.md`.
- **2026-10-03 (Game Corner Arcade):**
  - Built the first mosh: Pokémon Red (open-pokered runner) hosting PICO-8 cabinets (pico-r) in the Celadon Game Corner, with coin payouts, touch pad, autosave and one audio output.
  - Testing: three headless phone suites, plus one playtest sub-agent, which found 7 issues, all fixed.
  - Published as an artifact and merged to `main` under `gamecorner/`.
- **2026-10-04 (Pokécraft):**
  - The user said Game Corner was a menu between two games, not a mosh (mistake 10). Of 3 true-merge options, they picked Pokémon in an endless Minecraft world.
  - Got MinecraftOSS world generation running in wasm (in-memory files, no threads, no clock), in a Web Worker.
  - Patched open-pokered to draw in layers (two clear colours), so its menus, text and shop sit on top of the Minecraft world.
  - Built `pokecraft/`: top-down Minecraft textures; biome encounters; mobs as Pokémon; distance-based levels; day and night with sleep; bells and a Wandering Trader that run a Poké Mart; SURF; B to sprint.
  - `build.sh` reproduces it from scratch, downloading Mojang's client jar. Two headless phone suites pass.
  - Published at https://claude.ai/artifact/QrvL2FGDYSDADfnMwZaY3K and merged to `main`.
- **2026-10-05 (Pokécraft in first person):**
  - The user said v1 was "a dumbed down" 2D Pokémon with Minecraft textures, and asked for the Pixelmon approach in first person (mistake 11).
  - Rebuilt Pokécraft as a first-person voxel world: MinecraftOSS 3D chunk volumes, a mesher in the world worker, three.js.
  - Gameplay:
    - Wild Pokémon live in the world as SGB-coloured sprites, by biome and time of day; some are aggressive.
    - Throw your Pokémon's ball to start a battle on the spot. Pokémon Red's HUD sits over the world, with the two Pokémon standing in it.
    - Roaming trainers with real Gen 1 parties.
    - Your lead Pokémon follows you.
    - A Nurse and a Clerk at village bells, and a travelling merchant.
    - Mining, placing and a hotbar; beds and sleep; swimming; touch, keyboard and gamepad controls.
  - Two headless suites pass. Updated the artifact in place and merged to `main`.
- **2026-10-05 (Pokécraft gameplay pass):**
  - The user: style is down, gameplay is lacking on both sides; no inventory and no item names; no forced Pokémon encounters; cute Pokémon by day; scary, aggressive Pokémon and Minecraft mobs at night (mistake 12).
  - Minecraft side: a 36-slot inventory with names; recipe-book crafting from the jar's recipes; smelting; tool tiers, break times and drops; crack overlay and particles; hearts, hunger, air, fall, lava and drowning; death and respawn; 3D mobs from MC skins (zombie, skeleton, spider, creeper, animals), melee and arrows; block light from torches; sun and moon.
  - Pokémon side: step encounters in grass, snow, water and caves; gentle day roamers and aggressive night ones; fishing; a POKé crafting tab; evolution stones in ores; your Pokémon fights monsters beside you.
  - Fixed a worker race that undid fresh block edits. Four headless suites pass (a new `survive.mjs`). Design notes in `pokecraft/GAMEPLAY.md`. Republished the artifact in place and merged to `main`.
- **2026-10-05 (what a true merge is):**
  - The user showed the RL car and ball in GTA V and asked for a study of true game merges.
  - Two research agents covered the mod and a survey of 23 merges. I verified the key repos myself.
  - Wrote `mashup-research/MERGE_EXAMPLES.md`, INSTRUCTIONS.md §B8 (the merge test) and a Pokécraft score against the test.
  - The user also taught the recombination method: `tools/recombine.py`, and the first pass in `mashup-research/RECOMBINATION_2026-10-05.md`.
- **2026-10-05 (merge pass 1):**
  - The user said to start whatever comes first; I took the top items from the merge test.
  - Your lead Pokémon's types are survival perks: Water breath, Flying glide, Fire light and cooking, Grass sun healing, Electric FLASH, Ice frost-walk, Ghost/Poison/Bug calming mobs, Rock/Ground mining, Fighting melee, Normal hunger, Psychic sense, Dragon armour.
  - The follower takes real party HP from monsters and can faint. Monsters and ore give real EXP through pokered's level-up code, and evolutions play Pokémon Red's own cutscene over the world.
  - New runner calls: `give_exp`, `hurt_party`, `evolving`.
  - New `tests/merge.mjs`. All five suites pass on a clean build. Republished the artifact and merged to `main`.
- **2026-10-05 (pad zoom fix):** The user reported that double-tapping the on-screen pad zoomed the game in and it couldn't zoom back out (iOS Safari). Touches on the play areas are now cancelled, with a reset fallback. Smoke, play and more pass.
