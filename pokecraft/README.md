# Pokécraft

Pokémon Red in an endless, first-person Minecraft world, in the spirit of Pixelmon. Minecraft's own world generator builds the land from a seed: plains, forests, deserts, mountains, oceans, villages. You walk it in first person, the blocks drawn with Minecraft's textures. Pokémon Red runs underneath.

- **Pokémon hide where Pokémon always hide.** Walk through tall grass, ferns or bushes, wade through snow, swim, or go down into a dark cave, and every step can make a wild Pokémon jump out at you, as in the Game Boy games. Off those, by day, nothing jumps you.
- **By day the world is gentle.** Cute Pokémon roam in plain sight and leave you alone: Caterpie, Pidgey, Jigglypuff, Clefairy, Tauros, Ponyta, Eevee, Pikachu, Nidoran, depending on the biome. Throw your ball at one if you want it.
- **At night the scary ones come out.** Gastly and Haunter, Zubat, Drowzee, Ekans, Mankey, Grimer, Koffing, Cubone roam anywhere, grass or not, and they come for you. Each Pokémon is the Game Boy picture coloured with its Super Game Boy palette, and sized from its Pokédex height.
- **Battles happen where you meet.** Aim at a wild Pokémon and press BALL to throw your Pokémon's ball (or walk into it, or press USE on it). The opponent steps up a few blocks away, your Pokémon comes out in front of you, and Pokémon Red's own battle plays out: HUD, menus, text, moves, catching, evolving, all drawn over the world.
- **Trainers roam.** Every couple of minutes one walks into view: a Youngster, a Hiker, a Lass, a Cooltrainer. If it spots you, it walks up and challenges you with its real Gen 1 party, picked to match how far out you are.
- **Your lead Pokémon follows you.** Turn around and it's there.
- **Distance is difficulty.** Wild levels rise about one every 40 blocks from where the world began. The top bar shows the level around you.
- **Villages.** Every village bell has a NURSE, who heals your party and sets where you wake up, and a CLERK, who runs a Poké Mart. A travelling MERCHANT also wanders by in daylight. Better stock appears the farther out you are.
- **It's Minecraft survival.**
  - A real inventory (36 slots, the bottom row is the hotbar) with item names, and Minecraft's own recipes in a recipe-book CRAFT tab: small recipes anywhere, tools and the rest at a crafting table, smelting at a furnace with fuel.
  - Tools matter, with Minecraft's break times and drops: stone by hand breaks slowly and gives nothing; ores need the right pickaxe.
  - Ten hearts and ten drumsticks. Falling, drowning, lava, starving and monsters hurt; a full belly heals. Hold USE with food to eat. If you die you wake at your bed and keep your things.
  - Minecraft's night monsters, as 3D models in Minecraft's skins: zombies, husks, drowned, skeletons that shoot, spiders, and creepers that blow holes in the ground. Undead burn at sunrise. Cows, pigs, sheep and chickens graze by day for food and wool. Hit things with MINE (swords hit harder); your lead Pokémon joins in against monsters, and monsters drop Pokémon money.
  - Torches, lanterns, glowstone and lava light the dark around them.
- **Your lead Pokémon changes how you survive.** The lead is the first Pokémon in your party that hasn't fainted, and its types show under your party:
  - Water: you breathe 3× longer and swim faster.
  - Flying: hold JUMP to glide, and you take no fall damage.
  - Fire: lights the dark around you, cooks raw food as you eat it, and lava hurts less.
  - Grass: sunlight heals you.
  - Electric: FLASH, so the night is never pitch black.
  - Ice: water freezes under your feet.
  - Ghost: the undead leave you alone. Poison and Bug: spiders do too.
  - Rock and Ground: you mine faster.
  - Fighting: your hits are harder.
  - Normal: you get hungry more slowly.
  - Psychic: it senses monsters coming.
  - Dragon: you take less damage.
- **One Pokémon, both games.**
  - Your follower fights Minecraft monsters beside you, and their hits come off its real HP; it can faint.
  - Beating monsters with it out, and mining ore, gives it real EXP. Pokémon Red levels it up and teaches it moves, and when it's time it evolves out in the world with Pokémon Red's own cutscene.
  - A creeper's blast scatters wild Pokémon.
- **Both at once.**
  - A POKé crafting tab turns Minecraft materials into Pokémon items: iron, red dye and a button make POKé BALLs; a bottle and berries make a POTION; spider eye an ANTIDOTE, golden apple a REVIVE, diamond and sugar a RARE CANDY, and more.
  - Ores sometimes hold evolution stones: Thunder Stone in copper, Moon Stone in diamond, Leaf Stone in emerald, Water Stone in lapis, Fire Stone in redstone.
  - Craft a fishing rod and cast at water. When the bobber dips, press USE: mostly Pokémon, otherwise cod, salmon or junk.
  - A bed: put it down and sleep in it at night (not with monsters near) to heal you and your party and skip to morning. Swim and sprint (push the stick all the way, or hold Shift).
- **Day and night** follow Minecraft's 20-minute day.
- **START (MENU)** opens Pokémon's own menu over the world: Pokédex, party, bag, save.

It runs in a phone browser, portrait or landscape. `dist/index.html` is the whole game in one file.

## Controls

| | Phone | Keyboard / mouse |
|---|---|---|
| Walk | left thumb, anywhere on the left | WASD (Shift sprints) |
| Look | drag on the right | mouse (click to capture it) |
| Use / talk / place / eat (hold) | USE, or tap the right side | right-click or F |
| Mine / attack | hold MINE | hold left-click (or X) |
| Inventory and crafting | BAG | E or I |
| Throw your Pokémon's ball | BALL | Q or R |
| Jump / swim up | JUMP | Space |
| Menu | MENU | Enter or Esc |
| Hotbar | tap a slot | 1–9, mouse wheel |

In Pokémon's screens (battles, menus, text) there's no pad on a phone:
- **Tap an option** to choose it. The page finds Pokémon's ▶ cursor and steers it there, then presses A.
- **Tap anywhere** else to move the text on.
- **Drag** to scroll a list.
- **Long-press** for SELECT.
- **BACK** is B.

On a keyboard use the arrows, Z = A, X = B, Enter = START. A gamepad works too.

The game autosaves every 30 s, after battles and sleeping, and when you leave the tab: position, party, both bags, hearts and hunger, and every block you changed. The same seed always makes the same world.

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
- `give_exp` levels a party Pokémon up outside battle with Pokémon's own code (stats, moves) and queues its real evolution cutscene; `evolving` tells the page to show that cutscene over the world. `hurt_party` takes HP off a party Pokémon that fought a Minecraft monster.
- When Pokémon's player is moved off Route 1, by a blackout, FLY, DIG, TELEPORT or an ESCAPE ROPE, you wake at your bed.

**The page (`web/`):**

| File | What it does |
|---|---|
| `main.js` | The 59.73 Hz loop, input modes, battles staged in the world, mining, placing, eating, fishing, step encounters, sleep, death, HUD and saves |
| `items.js` | Item names, stack sizes, tools, break times, drops, food, fuel; the POKé recipes |
| `inventory.js` | The 36-slot inventory and its screen: bag, crafting, furnace, POKé tabs |
| `survival.js` | Hearts, hunger, breath, fall damage |
| `perks.js` | What each Pokémon type does for you in the Minecraft world |
| `mobs.js` | Minecraft's mobs as box models in their own skins: spawning from the biome's lists, AI, arrows, creepers, the follower fighting |
| `view.js` | three.js scene, materials, sky and day/night, sprites |
| `player.js` | Walking physics: collision, auto-step, swimming, the block ray |
| `controls.js` | Touch thumbstick and look, taps and swipes on Pokémon's screens, keyboard, mouse, gamepad |
| `touchgb.js` | Finds Pokémon's ▶ cursor in its frame and steers it to a tapped option |
| `entities.js` | Wild Pokémon, the follower, Nurse, Clerk, merchant and trainers |
| `encounters.js` | Pokémon tables: day (gentle) and night (scary) roamers per biome group; grass, snow, water and cave hiders; fishing |
| `gen.js`, `worker.js`, `mesher.js` | The world worker and its page side |

`tools/mkassets.py` builds the art:
- Block face textures from the client jar.
- Biome colours from Minecraft's colour maps.
- Every Pokémon's front and back picture, coloured with the SGB palettes from open-pokered's transcription of the ROM.
- The NPCs.
- The trainer parties.
- Item icons, English names, every crafting and smelting recipe, the mob skins, the break-crack stages, the sun and the moon, and each biome's mob spawn lists, all from the client jar.

## Rebuild

```sh
npm install                       # at the repo root, for esbuild, three and playwright-core
pokecraft/build.sh                # clones both sources at the pinned commits, patches,
                                  # downloads Minecraft 26.3's client jar from Mojang,
                                  # builds both wasm modules, bundles dist/index.html
node pokecraft/tests/play.mjs     # headless phone: walk, START menu, mine and place, wild + trainer battles, Nurse, save/continue
node pokecraft/tests/more.mjs     # steps and walls, swimming, bed and sleep, merchant shop, waking at your bed, landscape
node pokecraft/tests/touch.mjs    # Pokémon's menus and a whole battle by touchscreen taps, no pad
node pokecraft/tests/merge.mjs    # the merge test: type perks, EXP from ore and monsters, evolving, follower fainting, creeper vs wild Pokémon
node pokecraft/tests/survive.mjs  # inventory and crafting, tool tiers, POKé crafting, grass encounters, day/night roamers,
                                  # a zombie fight, eating, fishing, falling, death and respawn, torches, save/continue
```

You need Rust 1.94+ with the `wasm32-unknown-unknown` target, git, curl, Node 20+ and Python 3 with Pillow. The build also fetches Pokémon's graphics from pret/pokered and installs `wasm-bindgen-cli 0.2.128` into `.work/`.

## Not yet

- Badges and gyms.
- A PC you can reach outside the START menu. Pokémon caught with a full party go to the box, as in the original.
- Riding or surfing on your Pokémon.
- Farming, chests, armour, beds you can craft from wool you shear (beds craft; sheep only drop wool when killed).
- Mob sounds and footsteps.
- Village houses get NPCs only at the bell; the generator places no villagers.
