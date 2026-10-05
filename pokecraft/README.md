# Pokécraft

Pokémon Red in an endless, first-person Minecraft world, in the spirit of Pixelmon. Minecraft's own world generator builds the land from a seed: plains, forests, deserts, mountains, oceans, villages. You walk it in first person, the blocks drawn with Minecraft's textures. Pokémon Red runs underneath.

- **Wild Pokémon live in the world.** You can see them wander and hop about. Which ones you meet depends on the biome and the time of day: Caterpie and Pikachu in forests, Sandshrew in deserts, Geodude on mountains, Tentacool at sea, Gastly at night. Each is the Game Boy picture coloured with its Super Game Boy palette, and sized from its Pokédex height. Some are aggressive and come at you.
- **Battles happen where you meet.** Aim at a wild Pokémon and press BALL to throw your Pokémon's ball (or walk into it, or press USE on it). The opponent steps up a few blocks away, your Pokémon comes out in front of you, and Pokémon Red's own battle plays out: HUD, menus, text, moves, catching, evolving, all drawn over the world.
- **Trainers roam.** Every couple of minutes one walks into view: a Youngster, a Hiker, a Lass, a Cooltrainer. If it spots you, it walks up and challenges you with its real Gen 1 party, picked to match how far out you are.
- **Your lead Pokémon follows you.** Turn around and it's there.
- **Distance is difficulty.** Wild levels rise about one every 40 blocks from where the world began. The top bar shows the level around you.
- **Villages.** Every village bell has a NURSE, who heals your party and sets where you wake up, and a CLERK, who runs a Poké Mart. A travelling MERCHANT also wanders by in daylight. Better stock appears the farther out you are.
- **It's Minecraft.** Hold MINE to break blocks; they go into your hotbar. USE places them. You start with a bed: put it down and sleep in it at night to heal and skip to morning. Swim and sprint (push the stick all the way, or hold Shift).
- **Day and night** follow Minecraft's 20-minute day.
- **START (MENU)** opens Pokémon's own menu over the world: Pokédex, party, bag, save.

It runs in a phone browser, portrait or landscape. `dist/index.html` is the whole game in one file.

## Controls

| | Phone | Keyboard / mouse |
|---|---|---|
| Walk | left thumb, anywhere on the left | WASD (Shift sprints) |
| Look | drag on the right | mouse (click to capture it) |
| Use / talk / place | USE, or tap the right side | right-click, E or F |
| Mine | hold MINE | hold left-click (or X) |
| Throw your Pokémon's ball | BALL | Q or R |
| Jump / swim up | JUMP | Space |
| Menu | MENU | Enter or Esc |
| Hotbar | tap a slot | 1–9, mouse wheel |

In Pokémon's screens (battles, menus, text), the pad turns into a Game Boy pad: d-pad, A, B, START, SELECT. On a keyboard use the arrows, Z = A, X = B, Enter = START. A gamepad works too.

The game autosaves every 30 s, after battles and sleeping, and when you leave the tab: position, party, bag, hotbar and every block you changed. The same seed always makes the same world.

## How it's moshed

Two Rust rewrites run in one page. One builds the world and the page draws it; the other runs hidden and owns the Pokémon (the pattern in [INSTRUCTIONS.md](../INSTRUCTIONS.md) §0):

| Piece | What it is | What we changed |
|---|---|---|
| MinecraftOSS (`core`, `generator`, `world` crates) from [chasmlol/2010-rust-rewrite-mashup](https://github.com/chasmlol/2010-rust-rewrite-mashup) @ `f608f85` | Rust rewrite of Minecraft 26.3's world generation | `patches/minecraftoss.patch`, plus the `mcgen/` crate |
| [open-pokered](https://github.com/liuyanghejerry/open-pokered) @ `cb131bb` | Rust rewrite of Pokémon Red | `patches/open-pokered.patch` |

**Minecraft (`mcgen.wasm`, in a Web Worker).** The patch makes MinecraftOSS run in a browser:
- In-memory files, filled from one gzipped bundle of the client jar's worldgen data (`tools/mkbundle.py`).
- No threads.
- No clock.
- `ChunkMap::trim` drops chunks far from the player; the seed regenerates them identically.

`mc_volume` hands over each chunk's blocks, from a little below its lowest ground to its highest block. In the same worker, `web/mesher.js` turns a chunk into triangles: only visible faces, with Minecraft-style shading (darker sides, ambient occlusion in corners, shadow wherever the sky is blocked). The page draws them with three.js.

**Pokémon (`pokered-runner-web`, hidden).** Pokémon's own player stands still on Route 1 the whole time. The page walks you around the 3D world and calls into Pokémon for everything Pokémon:
- `tick_layers` draws the overworld screens twice, clearing the map to white and then to black. Pixels that differ are see-through, so the START menu, text boxes and shops sit on top of the 3D world.
- In battles, the Pokémon pictures aren't drawn and the white background is see-through, so only the HUD, text and menus are left.
- `battle_view` tells the page which Pokémon are out, whether each is showing (hits blink it, fainting hides it), and how far it's sliding or shaking. The page moves the 3D sprites to match.
- `start_wild_battle`, `start_trainer_battle`, `take_battle_outcome`, `open_shop`, `heal_party` and `party_summary` cover battles, shops, healing and the party.
- When Pokémon's player is moved off Route 1, by a blackout, FLY, DIG, TELEPORT or an ESCAPE ROPE, you wake at your bed.

**The page (`web/`):**

| File | What it does |
|---|---|
| `main.js` | The 59.73 Hz loop, input modes, battles staged in the world, mining and placing, sleep, HUD and saves |
| `view.js` | three.js scene, materials, sky and day/night, sprites |
| `player.js` | Walking physics: collision, auto-step, swimming, the block ray |
| `controls.js` | Touch thumbstick and look, Game Boy pad, keyboard, mouse, gamepad |
| `entities.js` | Wild Pokémon, the follower, Nurse, Clerk, merchant and trainers |
| `encounters.js` | Biome → Pokémon tables |
| `gen.js`, `worker.js`, `mesher.js` | The world worker and its page side |

`tools/mkassets.py` builds the art:
- Block face textures from the client jar.
- Biome colours from Minecraft's colour maps.
- Every Pokémon's front and back picture, coloured with the SGB palettes from open-pokered's transcription of the ROM.
- The NPCs.
- The trainer parties.

## Rebuild

```sh
npm install                       # at the repo root, for esbuild, three and playwright-core
pokecraft/build.sh                # clones both sources at the pinned commits, patches,
                                  # downloads Minecraft 26.3's client jar from Mojang,
                                  # builds both wasm modules, bundles dist/index.html
node pokecraft/tests/play.mjs     # headless phone: walk, START menu, mine and place, wild + trainer battles, Nurse, save/continue
node pokecraft/tests/more.mjs     # steps and walls, swimming, bed and sleep, merchant shop, waking at your bed, landscape
```

You need Rust 1.94+ with the `wasm32-unknown-unknown` target, git, curl, Node 20+ and Python 3 with Pillow. The build also fetches Pokémon's graphics from pret/pokered and installs `wasm-bindgen-cli 0.2.128` into `.work/`.

## Not yet

- Badges and gyms.
- A PC you can reach outside the START menu. Pokémon caught with a full party go to the box, as in the original.
- Riding or surfing on your Pokémon.
- Torches lighting the night.
- Village houses get NPCs only at the bell; the generator places no villagers.
