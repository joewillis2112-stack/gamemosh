# Game Corner Arcade

Pokémon Red, except the slot machines in Celadon City's GAME CORNER are PICO-8 arcade cabinets. Score in a cabinet, cash out, and your Pokémon game gets the coins. Spend them at the prize counter next door.

It runs in a phone browser. `dist/index.html` is the whole game in one file.

## Play

- **GO TO THE GAME CORNER:** start inside the Game Corner with a PIKACHU Lv20, a COIN CASE and ¥5000.
- **NEW ADVENTURE:** the normal game, starting in your bedroom in Pallet Town.
- **CONTINUE:** resume your last session. The game autosaves every 30 s, after every cash-out and when you leave the tab.

Walk up to a slot machine and press A, or talk to the woman tending them and pick PLAY. The cabinet picker opens instead of the slots.

| Cabinet | By | Pays |
|---|---|---|
| Celeste Classic | Maddy Thorson & Noel Berry | 10 coins per screen climbed, +200 for the summit |
| Bubblegum Spin | Bee_Randon | 1 coin per 100 points |
| Ghost Wave | Conor | 1 coin per 10 points |

In a cabinet, **START** (or the CASH OUT button) ends the run and pays out your best result. **B** at the prompt keeps playing.

**Controls:** the on-screen pad (d-pad, A, B, START, SELECT). On a keyboard: arrows/WASD, Z = A, X = B, Enter = START, Shift = SELECT. A gamepad also works. In a cabinet, A = PICO-8 🅾️ and B = ❎.

## How it's moshed

| Piece | What it is | What we changed |
|---|---|---|
| [open-pokered](https://github.com/liuyanghejerry/open-pokered) @ `cb131bb` | Rust rewrite of Pokémon Red. `pokered-runner-web` drives it one frame at a time from JS | `patches/open-pokered.patch` |
| [pico-r](https://github.com/mnmlyw/pico-r) @ `0de0ef9` | Pure-wasm PICO-8 emulator in Rust, written with Claude | `patches/pico-r.patch` |

**The open-pokered patch adds runner calls:**
- `coins()` and `add_coins(n)`, which change the live balance.
- `leave_slots()`, which closes the slot screen before it's drawn.
- `has_item` and `give_item`, so a COIN CASE can be handed out on first play.
- `export_live_save()`, the current map and position for autosave.
- `render_audio(frames, rate)`, so the page owns a single audio output. The game no longer opens its own.

**The pico-r patch** adds `web_get_global("room.x")`, which reads a cart's Lua variables. That's how scores and progress are read without editing the carts.

**What the page (`web/gc.js`) does:**
- Runs both wasm modules from one `requestAnimationFrame` loop: Pokémon at 59.73 Hz, PICO-8 at the cart's 30 or 60 fps.
- Watches for the `Slots` screen, swaps in the cabinet picker, and swaps the canvas between 160×144 and 128×128.
- Mixes one audio stream: Pokémon's 44.1 kHz stereo, or PICO-8's 22 kHz mono, resampled.

## Rebuild

```sh
npm install                 # at the repo root, for esbuild + playwright-core
gamecorner/build.sh         # clones both repos at the pinned commits, patches, builds wasm, bundles dist/index.html
node gamecorner/tests/play.mjs   # headless phone: quick start → slot → cabinet → cash out → reload → continue
node gamecorner/tests/extra.mjs  # every cabinet runs, new adventure, audio, landscape layout
```

You need Rust 1.94+ with the `wasm32-unknown-unknown` target, git and Node 20+. The build fetches Pokémon's graphics from pret/pokered and installs `wasm-bindgen-cli 0.2.128` into `.work/`.

The carts in `carts/` came from the Lexaloffle BBS: Celeste (tid 2145), Bubblegum Spin (tid 140885) and Ghost Wave (tid 142306).
