# Mobile picks: moshes that run on a phone

Done 2026-10-03. Every piece below was cloned with `git clone --depth 1`, built here for `wasm32-unknown-unknown`, and run in headless Playwright Chromium (build 1194, swiftshader) with mobile emulation (390×844, touch). No real phone was used. The test pages and screenshots are listed at the bottom.

## 1. Verdict

| Rank | Mosh | One line |
|---|---|---|
| **1 (build first)** | **Game Corner Arcade**: open-pokered + pico-r (new; replaces P2's Ruffle) | Both expose `tick → pixels`. They ran together on one page at full rate, both on stable Rust. The slot machine is detectable (`screen_name()=="Slots"`). A coin payout needs about 10 lines of Rust. |
| 2 | **Wolf Arcade** (P9): Iron Wolf + pico-r | Both built and ran together on one page at full rate. Iron Wolf needs nightly Rust, owns its own loop, and has no touch or pause API, so it needs a small Rust patch. |
| 3 | **Wolfenstein of Persia** (P1): Iron Wolf + SDLPoP-rs | Both built and ran together on one page. SDLPoP needs a Worker plus SharedArrayBuffer, so it only works on hosts that send COOP/COEP headers. Biggest integration job of the three. |

Runner-up: **Taipan Vangers** (P11). It's one Rust crate, already has touch, and the Taipan engine extracts cleanly. It placed 4th only because phone GPU speed is unknown and each level is a 3–30 MB data download.

---

## 2. Build results per piece

Sizes: *raw* is cargo's .wasm, *bg* is after wasm-bindgen, *gz* is `gzip -9` of the shipped file. wasm-opt was not run.

| Piece | Builds for wasm? | Toolchain / gotcha | Raw | bg | gz | C deps in wasm | Data | Touch | Tick | Output |
|---|---|---|---|---|---|---|---|---|---|---|
| **pico-r** (mnmlyw) | **yes**, 17 s | stable | 523 KB | n/a (no bindgen) | 197 KB | none; **0 imports** | carts from BBS (Celeste 35 KB, fetched fine) | **none** (touch only resumes audio) | 30 or 60 (`web_get_fps`; Celeste = 30) | FB 128×128 ARGB via `web_get_pixel_buffer` |
| **Iron Wolf** (Ragnaroek) | **yes, on nightly only** | stable 1.94 fails (see below); nightly 1.101 OK, 45 s | 1.51 MB | 720 KB | 270 KB | none | shareware **in repo** (`web/shareware`, 1.3 MB); full game = upload your files | **none** (keydown/keyup on `#vga` only) | 70 Hz (`TICK_BASE`) | FB 320×200 VGA → 2D canvas `#vga` 640×400, `putImageData` |
| **SDLPoP-rs** (krepl) | **yes**, 43 s release (documented build is debug: 25.7 MB raw) | stable; needs `wasm-bindgen-cli 0.2.127` + libclang on build host | 2.77 MB | 1.76 MB | 703 KB | none (`cc`/`bindgen`/`clang-sys` are host build-deps reading C headers) | **in repo** (`data/`, 4.3 MB, ~1000 files via `data_manifest.txt`) | **none** (keyboard → SAB key-state; mouse) | 60 Hz timer; game frame every 5 ticks = 12 fps (fights 6 → 10 fps) | FB 320×200 → canvas 640×400; frames posted from a **Worker** |
| **open-pokered** `pokered-web` | **yes**, after `scripts/fetch-gfx.sh` (first try failed) | stable, 1m10s | 13.7 MB | 11.8 MB | 3.50 MB | none | pret gfx (2.9 MB, public GitHub) **baked into wasm** at build | yes in Vue frontend (JS pad dispatches KeyboardEvents); plain `web/index.html` has none | ~59.7 Hz GB frame | pixels 0.15 / wgpu 0.19 WebGL + **winit 0.30** loop |
| **open-pokered** `pokered-runner-web` | **yes**, 1m45s | stable | 10.7 MB | 9.0 MB | 2.58 MB | none | same, baked in | n/a (bitmask input) | host-driven; measured **0.47 ms/tick** | `tick(u8) → Vec<u8>` 160×144 RGBA. **No winit** |
| **chipdx** `chipwasm` (CasualX) | **yes, needs rustc ≥ 1.95** | stable 1.94 fails (`urandom@1.0.0-alpha.3 requires rustc 1.95`); nightly OK, 37 s | 16.4 MB | n/a (raw C ABI + `shade.js`) | **15.3 MB** (12 MB music + levelsets embedded) | none; imports 78 `webgl.*` + 10 `env.*` | CCLP1–5 levelsets **in repo** | **yes** (drag pad, A/B/Start/Select; auto-detected) | think 60 Hz (HUD: "think 60hz") | WebGL via own `shade.js`; host calls `drawPlayInstance(w,h)` |
| **Battle City** (vgrichina, JS) | n/a, **not Rust** (4,337 lines JS) | nothing to build | n/a | n/a | n/a | n/a | tiles **in repo** (`web/tiles`), no ROM needed | **yes** (D-pad, FIRE, START) | rAF | 2D canvas |
| **riparion-retro** `taipan` (Dioxus app) | **yes**, 66 s | stable | 2.03 MB (no dx bundle) | not run | n/a | none | none needed | n/a (DOM buttons) | turn-based | DOM |
| Taipan `engine/` extracted (my crate) | **yes**, 25 s; **31/31 tests pass** | 3 path edits: `retro_kit::rng`/`format` → copies of `retro-core`'s; `crate::engine::` → `crate::` | 473 KB (exports nothing; size not meaningful) | n/a | n/a | none | n/a | n/a | turn-based | none (pure logic) |
| **vange-rs** (kvark) `--bin web` | **yes**, 2m18s | stable; `wasm-bindgen-cli 0.2.117` | 11.3 MB | 9.34 MB | 3.42 MB | none | `common.zip` 1.15 MB + one level zip (khox 2.1 MB, fostral 29.2 MB) fetched from `vange.rs/data-0` | **yes** (touch stick when coarse pointer or narrow touch screen; seen on screen) | rAF variable dt; logic in 50 ms quanta (`MAIN_LOOP_TIME`) | wgpu 29 WebGL2 + **winit 0.30** + egui 0.34 |
| Ruffle | **not built** | wgpu 30, large | n/a | n/a | n/a | n/a | SWFs | n/a | n/a | n/a |

**Exact failures**
- Iron Wolf on stable 1.94.1: `error[E0554]: #![feature] may not be used on the stable release channel` (`ascii_char`, `ascii_char_variants`, `duration_millis_float`). With `RUSTC_BOOTSTRAP=1` it still fails with `error[E0658]: use of unstable library feature atomic_try_update` (`src/user.rs:42`). Builds on nightly.
- open-pokered before fetching gfx: `error: couldn't read crates/pokered-data/src/../../../gfx/blocksets/overworld.bst`. Its CLAUDE.md says to run `scripts/fetch-gfx.sh` first. Round 1's "assets in repo" claim is wrong: the gfx are fetched from pret/pokered at build time.
- chipdx on stable 1.94.1: `rustc 1.94.1 is not supported by the following packages: urandom@1.0.0-alpha.3 requires rustc 1.95` (pinned in its Cargo.lock).

**Ran from my own build in headless mobile Chromium (screenshots in this folder)**
- Iron Wolf: shareware E1M1 reached using only JS-dispatched `KeyboardEvent`s on `#vga` (`iw1.png`).
- SDLPoP: Level 1 reached; held keys needed because input is polled (`pop3.png`).
- pokered-web: title → NEW GAME menu (`pk1.png`). pokered-runner-web: `map=PalletTown pos=5,5 screen=Overworld ms/tick=0.47`, then `start_wild_battle` → `screen=Battle` (`pkr.png`).
- pico-r: Celeste Classic level 1 in node and in Chromium (`pico_frame.png`).
- chipdx: touch pad and level-pack menu (`chip2.png`).
- vange-rs: khox level with touch stick (`vange1.png`).
- Battle City JS: stage 1 (`bc1.png`).

**Live web builds (HTTP status, wasm URL)**

| Site | Page | wasm |
|---|---|---|
| wolf.ironmule.dev | 200 | `/iron-wolf-webplayer-c35e2c535b51d248_bg.wasm` 200, 11.0 MB. A different, larger player than the repo's 720 KB build; its JS mentions touches. Not tested |
| mnmlyw.github.io/pico-r/ | 200 | `pico-r.wasm` 200, 452 KB |
| liuyanghejerry.github.io/open-pokered/ | 200 | `assets/pokered_web_bg-Cgw6i31D.wasm` 200, 12.4 MB |
| casualhacks.net/chipdx/index.html | 200 | `chipwasm.wasm` 200, 16.4 MB |
| vange.rs/mesh/ | 200 | `/web_bg.wasm` 200, 10.0 MB. `data-0/common.zip` and `fostral.zip` answer range requests (206) |
| battle-city.berrry.app | 200 | n/a (JS; `game.js` 138 KB) |
| ruffle.rs/demo/ | 200 | `ruffle_web_bg-Dzsm323U.wasm` 200, 14.3 MB |
| stared.github.io/chromatron-oxide/ | 200 | wasm URL not found in the HTML. Not followed |

---

## 3. Can the pieces share one page? (measured)

The test page is `out/mosh/mosh.html`, served from one origin with COOP/COEP. It runs one rAF loop with accumulators. Rates were measured over 8 s in game, after `reset()`.

| Combination | Result |
|---|---|
| Iron Wolf + pico-r + PokeredRunner, all at once | `{"draw:vga":"68.6","tick:pk":"59.7","draw:pk":"59.7","raf":"59.9","tick:pico":"29.9","draw:pico":"29.9"}`, errors `[]`. Pokémon input moved the player `5,5 → 5,8` (`m_wolf_pico_pk.png`) |
| Iron Wolf + SDLPoP (iframe → Worker + SAB) | `{"draw:vga":"69.1","raf":"59.9"}`, `crossOriginIsolated=true`, errors `[]`. PoP played its intro while Wolf ran (`m_wolf_pop.png`) |

Integration surface, read from the entry points:

| Piece | Step function the host can drive? | Pixels out / input in | Global-state conflicts |
|---|---|---|---|
| pico-r | **yes**: `web_update()` | `web_get_pixel_buffer()`; `web_set_buttons(p,bits)`; `web_debug_peek(addr)` for reading cart RAM | none: 0 imports, own memory. Any number of instances |
| PokeredRunner | **yes**: `tick(bitmask)` | returns RGBA; also `warp_to`, `start_wild_battle`, `start_trainer_battle`, `current_map`, `player_position`, `screen_name`, `set_muted` | none (no winit). `pokered-web` *does* own a winit loop, so use the runner |
| Iron Wolf | **no**. `iw_init(upload_id)` spawns a self-paced async loop (setTimeout to mid-tick, 70 Hz) | paints `#vga` (hard-coded id); input = KeyboardEvents on `#vga` (synthetic ones work) | one Wolf per page (fixed canvas id, `static` state). No pause/give/event exports. Busy-wait `wait_for_tic` is used only in the death spin |
| SDLPoP-rs | **no**. A blocking `run_game()` runs in a Worker and never returns; restarts are a thrown JS `Error('SDLPOP_RESTART')` | frames `postMessage`d to the page; input = SharedArrayBuffer key-state array | isolated in its own Worker. **Needs COOP/COEP**; its `sw.js` is an offline cache, not a COI shim |
| chipdx | **yes**: `thinkPlayInstance(inst, buttons)` / `drawPlayInstance(inst,t,w,h)` | draws itself through WebGL imports; buttons as a `u8` | shares the page's WebGL context via `shade.js` |
| vange-rs | no (winit `EventLoop` owns the canvas) | n/a | single winit app. Guests must be compiled into the same crate (Taipan engine is pure logic, so it fits) |

---

## 4. The picks in detail

### Pick 1: Game Corner Arcade (open-pokered + pico-r). Build this first.

**Who supplies what**
- Pokémon Red is the host. It supplies the world, NPCs, coins and the Celadon Game Corner.
- PICO-8 is the guest. Each slot machine becomes a cabinet running a BBS cart (Celeste Classic and others).
- Beating or scoring in the cart pays out Game Corner coins.

**Pattern:** framebuffer swap (B3). Two wasm modules sit on one page, and JS owns the single tick.

**Why first**
- The cheapest pick: both pieces build on stable Rust and are already host-driven `tick → pixels` modules.
- The hook already exists (`screen_name()` returns `Slots`).
- One GB-style pad maps 1:1 onto PICO-8 buttons.
- It needs no Wolf nightly patches and no SharedArrayBuffer.

**Build plan**

| Part | Plan |
|---|---|
| Crates | `pokered-runner-web`: fork and add ~10 lines: `add_coins(n)` / `coins()` on live state, and `leave_slots()` to close the Slots screen. `pico-r`: unchanged |
| Why the patch | `export_save` is **not live**. Verified: after `warp_to('GameCorner')`, `export_save → set player_coins=500 → import_save` rebooted the game to `PalletTown 5,5`. JS-only payout doesn't work |
| Glue (JS, ~200 lines) | One rAF loop with accumulators: pokered at 59.73 Hz, pico at `web_get_fps()`. Each frame, poll `screen_name()`. On `Slots`: `set_muted(true)`, call `leave_slots()`, show the cabinet picker, swap the canvas to pico. Read the cart score with `web_debug_peek` (per-cart address) or `dset` cartdata. On exit, call `add_coins`, unmute and swap back |
| Touch layout | One overlay: D-pad, A, B, Start, Select. GB bitmask is A0 B1 Sel2 Start3 R4 L5 U6 D7. PICO bits are L0 R1 U2 D3 O4 X5. Map A→O and B→X. Start opens the cabinet menu or quits the cart |
| Data | Pokémon gfx are baked into the wasm (run `fetch-gfx.sh` in the build). Inline 3–5 carts as base64 (~35 KB each). Total ≈ 9.5 MB wasm (≈ 2.8 MB gz) before wasm-opt |
| Audio | pokered uses a ScriptProcessorNode. Pico gives `web_generate_audio(n)` at 22,050 Hz, which needs a small resampler (pico-r's `web/index.html` has one) |

**Effort:** 1–2 agent-sessions.

**Risks**
- pokered's 9 MB wasm load time on a phone.
- "Win" detection is per cart: either peek addresses or carts that use cartdata.
- Mixing the two audio sources.
- The runner crate is editor-facing, so its API could change upstream.

**Evidence**
- `pokered_runner_web.wasm 10661056` (raw) → `pokered_runner_web_bg.wasm 9022199` (bg) → `2583626` (gz)
- `map=PalletTown pos=5,5 screen=Overworld ms/tick=0.47` and `after battle start: screen=Battle`
- `after warp: map=GameCorner pos=15,17 screen=Overworld` / `coins field: ["game_data.player_coins",0]` / `after import: map=PalletTown pos=5,5`
- `pico_r.wasm size 523051 imports 0 exports 21`; Celeste `init 0 fps 30`, `ms/frame 1.148` (node)
- One page: `"tick:pk":"59.7"`, `"tick:pico":"29.9"`, `"raf":"59.9"`, errors `[]`

### Pick 2: Wolf Arcade (P9: Iron Wolf + pico-r)

**Who supplies what**
- Wolf3D is the host. It supplies the maze, guards and guns.
- PICO-8 cabinets sit behind secret pushwalls.
- Clearing a cart pays out ammo or treasure.

**Pattern:** framebuffer swap. Two modules share one page. Wolf keeps its own 70 Hz loop and the page's rAF ticks pico only while a cabinet is open, so only one side runs at a time.

**Build plan**

| Part | Plan |
|---|---|
| Crates | `iron-wolf` fork (nightly). Export `iw_set_paused(bool)`, checked in the play loop (await sleep while paused), and `iw_give(kind, n)`. Add a JS import `onSecret()` fired when a pushwall activates. `pico-r` unchanged |
| Glue | Host page with `#vga` plus an overlaid pico canvas. Reuse Pick 1's pico driver |
| Touch layout | Wolf: virtual stick (Up/Down/Left/Right), FIRE (Control), USE (Space), STRAFE (Alt), weapon 1–4, MENU (Escape). Send them as KeyboardEvents to `#vga` (proven). Cabinet mode: the same pad maps to PICO bits |
| Data | Shareware 1.3 MB in repo. It's fetched from `shareware/` relative to the page, so for single-file builds, intercept `fetch` or build the `Loader` from embedded bytes. Carts as in Pick 1 |

**Effort:** 2–3 agent-sessions.

**Risks**
- Nightly-only build: three `#![feature]`s plus `atomic_try_update`.
- No step export, so Wolf can't share a single tick owner without the pause patch.
- The canvas id is hard-coded.
- Playing an FPS with touch controls is the UX risk.
- The fork has to track upstream.

**Evidence**
- Stable 1.94.1: `error[E0554] #![feature] may not be used on the stable release channel` and `error[E0658] atomic_try_update`. Nightly: `iw.wasm 1514045` → `iw_bg.wasm 719891` → `270453` (gz).
- E1M1 reached by synthetic keys.
- One page: `"draw:vga":"68.6"` with `"tick:pico":"29.9"`, errors `[]`.

### Pick 3: Wolfenstein of Persia (P1: Iron Wolf + SDLPoP-rs)

**Who supplies what**
- Wolf3D supplies the maze.
- Certain doors drop you into a PoP room or duel.
- Winning returns you to Wolf with a reward.

**Pattern:** browser bridge. Wolf runs on the page, PoP runs in a Worker, and JS switches between them.

**Build plan**

| Part | Plan |
|---|---|
| Crates | `iron-wolf` fork: Pick 2's patches plus a door-trigger event. `SDLPoP-rs` fork: a `run_game_at(level)` entry, and an outcome message (win/death/time-up) sent through the existing post-to-JS path. Terminate and respawn the Worker per duel (1.76 MB bg wasm) instead of pausing it |
| Glue | Port SDLPoP's `index.html` main-thread code: SAB key-state writer, frame painter, audio player. Wolf as in Pick 2 |
| Touch layout | Shared stick. PoP needs arrows plus SHIFT (sword/pick-up). Write them into the SAB `keyState` |
| Data | Wolf shareware 1.3 MB plus PoP `data/` 4.3 MB (~1000 small files). Pack them into one archive |
| Hosting | **Must** serve COOP/COEP (SharedArrayBuffer). GitHub Pages can't set headers, so add a coi-serviceworker shim or use a host that sets them. Single-file HTML or a claude.ai artifact is unlikely to work |

**Effort:** 3–4 agent-sessions.

**Risks**
- The SharedArrayBuffer and cross-origin-isolation requirement.
- PoP's never-returning loop, with exception-based restarts.
- Two forks to maintain.
- PoP data is many small files.

**Evidence**
- `prince.wasm 2768593` → `sdlpop_bg.wasm 1755682` → `703026` (gz).
- Level 1 gameplay reached (`pop3.png`).
- One page with Wolf: `"draw:vga":"69.1"`, `crossOriginIsolated=true`, errors `[]`.

---

## 5. Pairings rejected, and why

| Pairing | Status here | Why not top 3 |
|---|---|---|
| **P11 Taipan Vangers** (vange-rs + Taipan engine) | both build; engine extracted, 31 tests pass; vange runs with touch stick | **Runner-up.** Single crate, so one winit loop, and vange already has an escave `Shop` with fixed `buy_price`/`sell_price` for Taipan's `prices.rs` to drive. Held back by unknown phone GPU speed (wgpu WebGL2 terrain), 9.3 MB wasm plus a 3.3–30 MB level download, and a 49k-LOC host. 2–4 sessions |
| **P3 Pokémon × Wolf encounters** | both build; ran together on one page | The Pokémon side is ready (`start_wild_battle`, `current_map`, `player_position`). Wolf needs a new API to load a generated 64×64 map from route tiles and report the result. That's a deep patch to its map loader. Natural follow-up once Pick 2's Wolf patches exist |
| **P10 Battle Chip** (chipdx + Battle City) | chipdx builds (rustc ≥ 1.95), touch works, host-drivable `think/draw`; Battle City is JS only | The mosh means porting 4.3k lines of JS into `chipcore` entities (the 17 entity modules total ~1.7k LOC, and chipcore already has a `tank` monster). That's 3–5 sessions. chipdx's wasm is 16.4 MB / 15.3 MB gz because of embedded music; drop the music for a phone build |
| **P2 Pokémon Game Corner + Ruffle** | Ruffle not built; live demo 200, 14.3 MB wasm | Superseded by Pick 1. pico-r is 0.5 MB, has zero imports, and its RAM can be read for scores. Ruffle needs SWF patching (JPEXS) to get scores out, and AS3 support is partial |
| **P4 Rooftop Rider** (Canabalt + Line Rider) | nothing to build: no Rust version exists (Obj-C / JS sources) | Pure rebuild. Can't be checked for wasm until written |
| **P8 SimWolf** (Micropolis + Iron Wolf) | nothing to build: Micropolis is C/C++ | Rebuild plus Wolf map injection (same as P3's Wolf patch) |
| **P12 Four Dragons Balatro, P13 Line-clear killstreaks** | not built | Desktop only (Bevy 0.19 / star-andreas; vendored C Lua blocks wasm32-unknown-unknown) |

---

## 6. What wasn't tested

- **A real phone.** All runs used headless Chromium with swiftshader and mobile emulation. Frame rate on the user's phone is unknown.
- **Audio** in any piece.
- **wasm-opt**: sizes are before wasm-opt.
- **Packaging**: single-file HTML and loading inside a claude.ai artifact.
- **Pieces not built:** Ruffle and chromatron-oxide. The live wolf.ironmule.dev "webplayer" (11 MB) isn't in the Iron Wolf repo and wasn't tested.
- **open-pokered:** the Vue/Vite frontend (`npm`), which has the touch pad, wasn't built. Only the plain `web/index.html` and my own pages were used.
- **Proposed patches not written:** `add_coins`, `leave_slots`, `iw_set_paused`, `iw_give`, `onSecret`, and SDLPoP's `run_game_at`.
- **Cart scores:** which PICO-8 carts expose a score through RAM or cartdata.
- **chipdx:** not tested alongside another module on one page, and no build without music.
- **vange-rs:** multiplayer, the voxel and ray renderers, the fostral level (29 MB), and touch driving. The stick rendered but wasn't driven.
- **Iron Wolf:** the full-version upload path. The death-spin busy-wait wasn't measured.
- **SDLPoP:** touch input (it has none).

---

## Files

The build logs, built wasm bundles and cloned repos lived in a temporary session folder and were not kept. Rebuild them by following §2. These files are in [`mobile-proto/`](mobile-proto/):
- `m_wolf_pico_pk.png`: Iron Wolf, pico-r (Celeste Classic) and open-pokered running together on one 390×844 page.
- `m_wolf_pop.png`: Iron Wolf with SDLPoP-rs running in a Worker.
- `gc.png`: the Game Corner warp test.
- `mosh.html`, `gc.html`, `common.js`: the one-page test harnesses. They expect the built bundles under `iw/`, `pico/`, `pk/` and `pop/` beside them.
- `serve.js`: a static server that sends the COOP/COEP headers SDLPoP needs. `probe.js`: the Playwright mobile probe.
