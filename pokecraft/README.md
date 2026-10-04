# Pokécraft

Pokémon Red, played in an endless Minecraft world. Minecraft's own world generator makes the land from a seed: plains, forests, deserts, mountains, oceans, villages. You walk it as RED, seen from above like a Pokémon route, drawn with Minecraft's block textures.

- **Tall grass** hides wild Pokémon. Which ones depends on the biome (Caterpie and Pikachu in forests, Sandshrew in deserts, Geodude on mountains, Tentacool at sea). Sand, snow and stone have a few too.
- **Minecraft's mobs are Pokémon in disguise.** Each biome spawns the mobs Minecraft spawns there. Touch one and it's a battle: a creeper is a Voltorb, a zombie a Gastly, a skeleton a Cubone, an enderman an Abra, a slime a Ditto, a cow a Tauros, and so on. At night the monsters come out and chase you. Beaten monsters drop money.
- **Distance is difficulty.** Wild Pokémon get about one level stronger every 40 blocks from where the world began, and evolve as they do. The HUD shows the level around you.
- **Day and night** follow Minecraft's 20-minute day. Press SELECT at night to sleep: your Pokémon are healed and you'll wake up there if you black out (or FLY, DIG, TELEPORT or use an ESCAPE ROPE).
- **Shops:** ring a village **bell** (A) to heal and shop, or find a **Wandering Trader**, who turns up now and then by day. Both run a Poké Mart; better items appear the farther out you are.
- **SURF** on any water with a Water-type Pokémon in your party (A, facing the water). Squirtle can from the start.
- **START** opens Pokémon's own menu over the world: Pokédex, party, bag, save.

It runs in a phone browser. `dist/index.html` is the whole game in one file.

**Controls:** the on-screen pad. A: talk, ring, SURF. B: sprint (hold while walking). SELECT: sleep. START: menu. On a keyboard: arrows/WASD, Z = A, X = B, Enter = START, Shift = SELECT. A gamepad works too.

The game autosaves every 30 s, after battles and sleeping, and when you leave the tab. CONTINUE picks up where you were; NEW WORLD asks for a second tap if there's a save to erase. The same seed always makes the same world.

## How it's moshed

Two Rust rewrites run side by side in the page, one drawn and one hidden (the SkyCraft pattern from [INSTRUCTIONS.md](../INSTRUCTIONS.md)):

| Piece | What it is | What we changed |
|---|---|---|
| MinecraftOSS (`core`, `generator`, `world` crates) from [chasmlol/2010-rust-rewrite-mashup](https://github.com/chasmlol/2010-rust-rewrite-mashup) @ `f608f85` | Rust rewrite of Minecraft 26.3's world generation | `patches/minecraftoss.patch`, plus the `mcgen/` crate |
| [open-pokered](https://github.com/liuyanghejerry/open-pokered) @ `cb131bb` | Rust rewrite of Pokémon Red | `patches/open-pokered.patch` |

**Minecraft (`mcgen.wasm`, run in a Web Worker).** The patch makes MinecraftOSS run in a browser:
- File reads go through an in-memory file system, which `mcgen` fills from one gzipped bundle (`tools/mkbundle.py`: the worldgen data, tags and structures from Mojang's client jar, plus MinecraftOSS's block catalog).
- No threads: chunks generate one at a time on the calling thread.
- No clock: `Instant` is a stub on wasm.
- `ChunkMap::trim` forgets chunks far from the player, since a browser has nowhere to save them and the seed regenerates them identically.

`mcgen` hands the page, for each column of a chunk, the ground block and its height, what grows on it, any tree canopy above it, and the biome.

**Pokémon (`pokered-runner-web`, hidden).** Pokémon's own player stands still on Route 1 the whole time. The page walks Red over the Minecraft world itself and calls into Pokémon for everything else:
- `tick_layers` draws each frame twice, with the overworld map cleared to white and then to black. Pixels that differ are the map and come out transparent. What's left is Pokémon's START menu, text boxes and shop, drawn on top of the Minecraft world.
- `start_wild_battle` starts the battles, both for grass and for mobs.
- `take_battle_outcome` says how a battle ended (win, caught, ran).
- `open_shop`, `heal_party`, `add_money` and `party_summary` cover the shop, healing, money and the party.
- When Pokémon's player is moved off Route 1, the page takes it as a blackout or a FLY/DIG/ESCAPE ROPE and sends you back to your bed.

**The page (`web/`):**
- `main.js` runs one loop at the Game Boy's 59.73 Hz: walking, ledges (a drop of 2–4 blocks is a one-way hop), SURF, encounters, mobs, the day clock, saving and the touch pad.
- `gen.js` talks to the worldgen worker. If the browser won't start a worker, it runs on the page instead.
- `world.js` decides what each block means and tints Minecraft's textures by biome.
- `encounters.js` holds the biome → Pokémon tables and the mob → Pokémon list.

`tools/mkassets.py` builds the texture atlas from the client jar: block textures, biome colours from Minecraft's colour maps, each mob's face, and Red's sprites from Pokémon's graphics.

## Rebuild

```sh
npm install                       # at the repo root, for esbuild + playwright-core
pokecraft/build.sh                # clones both sources at the pinned commits, patches,
                                  # downloads Minecraft 26.3's client jar from Mojang,
                                  # builds both wasm modules, bundles dist/index.html
node pokecraft/tests/play.mjs     # headless phone: new world, walk, START menu, wild + mob battles, save/continue
node pokecraft/tests/more.mjs     # step rules, SURF, the trader's shop, sleeping, waking at your bed
```

You need Rust 1.94+ with the `wasm32-unknown-unknown` target, git, curl, Node 20+ and Python 3 with Pillow. The build also fetches Pokémon's graphics from pret/pokered and installs `wasm-bindgen-cli 0.2.128` into `.work/`.
