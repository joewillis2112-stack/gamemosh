# Pokécraft playtest: the Minecraft side (2026-10-06)

Lens: is Minecraft itself present and alive, with Pokémon as native citizens, or is this a Pokémon mod bolted onto a Minecraft-looking world?

Tags: **OBSERVED** = seen in play (screenshot in `test-output/playtest-minecraft/` or log). **FROM CODE** = read in `pokecraft/web/`.

Build tested: `pokecraft/dist/index.html` as found on 2026-10-06. Driven with Playwright in a phone context (390×844, touch, headed under xvfb), SwiftShader GL; keyboard events used in the same page for walking/sprinting. Setup (teleporting, setting the time, giving items, spawning one test mob or Pokémon) used `__pc`/`__pcTest` hooks; the actions themselves (mining, placing, crafting, smelting, attacking, tapping to battle, walking) used real touch or key input.

Screenshots: `test-output/playtest-minecraft/`. Driver scripts: session scratchpad (not in the repo).

## 1. Bugs

### B1. The underground doesn't exist: no diamonds, gold, redstone, deepslate, bedrock or deep caves (severity: critical)
- FROM CODE: `mcgen/src/lib.rs` `mc_volume` only hands over each chunk from 12 blocks (`DIG_DEPTH`) below its lowest ocean floor up to the surface. `web/gen.js` `block()` and `web/worker.js` return plain `stone` for anything below that, down forever.
- OBSERVED: seed `playtest`, sampled 4 regions (spawn birch forest, cold ocean at x=600, spruce taiga at z=900, river at −1500,−700), 49 chunks each. Lowest volume floor anywhere: y=29. Counted every block: coal, copper, iron, lapis, and some lava in one region. **Zero** diamond, gold, redstone, emerald ore, deepslate, bedrock, amethyst, spawners or dungeon chests. A column at spawn reads `stone` at every y from −64 to 64.
- Consequence: Minecraft's progression stops at iron. And the Pokémon hooks that depend on it are unreachable in practice: Moon Stone (diamond ore), Fire Stone (redstone ore), RARE CANDY (diamond), ULTRA BALL (gold ingots), PARLYZ HEAL (redstone), diamond/netherite tools. The README promises all of these.
- Repro: new world, any seed; `__pcTest.blockAt(x, -40, z)` anywhere returns `stone`; mine down: only stone.

### B2. Wooden stairs and slabs need a pickaxe; glowstone drops nothing by hand (severity: medium)
- OBSERVED (touch hold on the right side, empty hand, block 3 m away on a stone pad; times ±0.1 s):

  | Block | Pokécraft | Minecraft |
  |---|---|---|
  | oak_stairs | 7.2 s, **no drop** | 3.0 s, drops |
  | oak_slab | 7.3 s, **no drop** | 3.0 s, drops |
  | glowstone | 1.4 s, **no drop** | 0.45 s, 2–4 dust |
  | cobweb (wooden sword) | 1.3 s, no drop | 0.4 s, string |
- FROM CODE: `items.js` `wants()` sends every `_stairs`/`_slab`/`_wall` to the pickaxe unless the name has `_log`, `_planks` or `wood`, so `oak_stairs`/`spruce_slab` count as stone. `glowstone` matches the `stone` substring. Villages are built from wooden stairs and slabs, so taking a village apart by hand yields nothing.
- Repro: place `oak_stairs`, hold on it with an empty hand.

### B3. Tools never wear out (severity: medium for the Minecraft loop)
- OBSERVED: one wooden pickaxe mined 75 stone (Minecraft: 59 uses) and was still in hand. `09-durability.png`.
- FROM CODE: inventory slots are `{id, n}`: there's no damage field anywhere. No durability bar, no breaking, no repairing, no reason to craft a second pickaxe.

### B4. Leaves never drop saplings (severity: medium: no tree farming, no renewable wood)
- OBSERVED: broke 200 oak leaves by hand: 9 apples, 14 sticks, **0 saplings**. Minecraft's 5% would give about 10.
- FROM CODE: `items.js drops()` rolls a sapling, then filters the drops through `this.W.icons[i]`. No sapling has an icon in the asset bundle (`oak_sapling`…`mangrove_propagule`, `bamboo_sapling` all missing), so they're always removed.

### B5. Smelting fuel can go negative, and the furnace burns your tools' materials first (severity: low)
- OBSERVED: with 1 coal, 1 stick and 1 birch plank in the bag, smelting 2 raw iron burned the stick, then the plank. The coal stayed. One stick (0.5 items of fuel) smelted a whole ingot.
- FROM CODE: `inventory.js smelt()` adds the fuel, then always subtracts 1, so `fuel` can reach −0.5. It picks the cheapest fuel in the bag automatically, without asking.

### B6. Mob spawning ignores light (severity: high for the Minecraft loop; maybe intended)
- See §2 "Light". Torches every 4 blocks don't stop spawns; mobs spawned on torch tiles.

### B7. Death screen shows full hearts and the crosshair hint (severity: low)
- OBSERVED: died from a fall (my teleport put me 40 blocks up). The death screen shows a full row of hearts at hp=0, and "HOLD: MINE" over it. `04-pad.png`.

## 2. Minecraft pieces missing or approximated

### Mining and tools: close to real
- OBSERVED break times match Minecraft's formula (hardness × 1.5 or × 5, ÷ tool speed): dirt by hand 0.6 s, log by hand 2.9 s, stone by hand 7.5 s with no drop and a "You need a better pickaxe" toast, stone with a wooden pickaxe ~1.0 s, iron ore with a wooden pickaxe 7.4 s with no drop, iron ore with a stone pickaxe 1.1 s (raw iron), log with a wooden axe 1.3 s, dirt with a wooden shovel 0.3 s. The crack overlay shows (`02-mining-log.png`).
- Approximated: blocks don't drop as item entities. The item goes straight into your bag (`+1 Cobblestone` feed line). There's nothing to pick up and nothing to lose. A full bag says "No room" and the item is gone (FROM CODE `gain()`). No Fortune or Silk Touch, no enchanting.
- Mining doesn't refresh the world (FROM CODE): no sand or gravel gravity, no water or lava flow, no leaf decay. The game has no block-update system at all. Checked in play below.

### The world is static: no block updates at all
- OBSERVED: sand with gravel on top stays floating after I mine the dirt under it (`12-floating-sand.png`). A water block next to an air gap doesn't flow, after 120 frames. Lava placed next to water: no cobblestone or obsidian.
- FROM CODE: there is no tick or block-update system in `main.js` or `worker.js`. So: no leaf decay, no crop or sapling growth, no grass spreading, no fire, no redstone, no snow or ice forming (except the Ice-type perk), and no water source mechanics.

### Smelting: instant, and the fuel lives in your pocket
- OBSERVED: placed a furnace, tapped it (`TAP: SMELT`), tapped "Iron Ingot" twice: 2 ingots in 30 frames (0.5 s). Minecraft takes 10 s per item. `10-furnace.png`.
- OBSERVED: I carried 1 coal. The game burned my last stick and my last birch plank instead ("cheapest fuel first"), without asking. One stick (0.5 items of fuel) smelted a whole ingot: the code lets `fuel` go negative (FROM CODE `inventory.js smelt()`).
- FROM CODE: fuel is `Inventory.fuel`, saved with the player. The furnace block holds nothing. Leaving the furnace isn't a thing: you stand next to it and smelting is a button.

### Chests, doors, levers: decoration
- OBSERVED: placed a chest; tapping it with dirt in hand placed dirt (`TAP: PLACE DIRT`). There's no chest screen. The same for `oak_door` and `lever`: no open or toggle.
- So there's no storage outside your 36 slots, no base-building loop, and no village-chest loot.

### Farming: absent
- OBSERVED: a wooden hoe on grass does nothing (no tap action). Wheat seeds, carrots, potatoes and bone meal have no tap action ("HOLD: MINE" only). A bucket aimed at water does nothing.
- OBSERVED/FROM CODE: saplings have no item icon (`oak_sapling`…`bamboo_sapling` all have none in `world.icons`), and `items.js` drops only items with icons, so **leaves never drop saplings**. A sapling given by hook places, but bone meal does nothing and it never grows (no tick system).
- The README lists "Grass: bigger harvests from crops" as a perk. With no planting, the only crops are the ones already in village farms.

### Health, damage, hunger: present, close, simplified
- Fall damage, OBSERVED (dropped onto stone): 3 blocks 0, 4 blocks 0, 5 blocks 1, 10 blocks 6, 15 blocks 11 half-hearts. Minecraft gives 0/1/2/7/12, so it's one half-heart short at every height. Landing in water from 20 blocks: no damage (correct).
- Drowning, OBSERVED: air ran out after 45.0 s and the first damage came at 46.1 s, with a Water-type lead (×3 breath). That's Minecraft's 15 s × 3, correct. But there's no underwater tint or fog: under water looks like dry land (`14-underwater.png`; FROM CODE: nothing in `view.js` reacts to the head being in water).
- Lava, OBSERVED: 20 → 5 hp in about 2 s standing in lava. You sink through it at full gravity and walk on the floor normally (FROM CODE: lava isn't treated as a fluid in `player.js`; only water is). No afterburn when you step out, and no fire anywhere.
- Hunger, FROM CODE (`survival.js`): no saturation, and no hunger difficulty settings. You lose a food point every 333 s standing still, which Minecraft doesn't do at all. Healing costs 0.6 exhaustion per half-heart; Minecraft's is 6.0, so healing is 10× cheaper in food. Starving stops at 1 heart. Sprinting is blocked at ≤3 drumsticks (correct).
- No armour (no wearable slots at all; iron_helmet etc. aren't usable), no shield, no potions or status effects.

### Night, hostile mobs, combat: present, but the rules aren't Minecraft's
- OBSERVED: set time to 13200 (dusk) on an open 31×31 grass field, didn't move. Within 14 game-seconds there were 8 hostiles (zombie, 2 spiders, 2 skeletons, 3 creepers) and 7 aggressive night Pokémon around me. I was dead from 20 hp ("slain by a SPIDER") 15 s after dusk. `16-night.png`.
- OBSERVED: a single zombie against a wooden sword, held attack: the zombie died in ~2 s game time and never touched me. Each hit knocks it back about 4 blocks, so holding attack is a stun-lock. Drops +2 rotten flesh straight into the bag, +¥30 Pokémon money, +26 EXP to Squirtle (feed line). No XP orbs. `17-zombie-fight.png`.
- OBSERVED: a zombie in daylight burns (hp 20→10 over ~4 s).
- FROM CODE (`mobs.js`):
  - Spawning ignores light. Hostiles spawn only between 13000 and 23000, only on the top block of a column 18–36 blocks out, capped at 8. So torches don't stop spawns, caves are safe at noon, and on a roof mobs spawn on the roof.
  - The mob roster: zombie, husk, drowned, skeleton, stray, spider, creeper; cow, pig, sheep, chicken. No endermen, witches, slimes, bats, wolves, horses, fish, villagers, iron golems or wandering traders.
  - No attack cooldown by weapon (a fixed 0.55 s), no crits, no sweep. Axes deal 3–7 (by tier) instead of Minecraft's 7–10.
  - Passive animals: no breeding, no following wheat, no shearing (sheep drop wool only when killed), no milk, no eggs.
  - Creepers blow a sphere out of anything but bedrock. No blast resistance (obsidian goes too) and no block drops.
- No first-person hand or held item (OBSERVED in every screenshot; FROM CODE: `view.js` draws none). You can't see your sword.

### Light: torches light, but don't make you safe
- OBSERVED: placed 143 torches on a 4-block grid over a 49×49 area at night, then let spawning run for 10 s. 17 hostiles spawned, most within 1–3 blocks of a torch, one standing on a torch tile. In Minecraft (1.18+) that grid allows zero spawns. `20-torches-night.png`.
- So the Minecraft night loop of lighting up your base to make it safe doesn't exist. The only safety is the clock.

### Movement: close
- OBSERVED (keyboard, flat ground): walk 4.3 m/s (Minecraft 4.317), sprint 6.2 (Minecraft 5.612, so 10% fast), sneak 1.3 (1.295), jump 1.29 blocks (1.25). Auto-step up one block is always on (Bedrock's auto-jump, not optional). Ladders, sneak edge guard and sprint-swim exist (README, tested in `tests/move.mjs`; I didn't re-test them).

### Day/night: Minecraft's clock, but it stops for Pokémon
- OBSERVED: the clock is Minecraft's 24000-tick, 20-minute day. But during a wild battle the Minecraft world freezes: game time went 14004 → 14007 over about 10 s of battle, and an angry zombie 13 m away didn't move. `19-battle.png`. Every battle, menu and shop pauses Minecraft entirely (FROM CODE: `frozen = S.mode !== 'world'` stops mobs, entities and `worldStep`, which advances the clock).
- No weather (FROM CODE: no rain, snow, thunder or clouds in `view.js`). No moon phases.

### Sound: none of Minecraft's
- OBSERVED: Pokémon's audio output is non-silent while walking the world (peak 0.25–0.43 from `runner.render_audio`) and in battle.
- FROM CODE: `audio` in `main.js` has a single source, `S.runner.render_audio`. It's Pokémon Red's sound, presumably the Route 1 music, since Pokémon's player is parked on Route 1. I didn't listen, so I don't know which track. No block, step, mining, mob, hurt or eating sounds, and no C418 music. The world is scored by Pokémon.

### Worldgen: real on top, missing below
- OBSERVED: the surface is MinecraftOSS's real generator. Over ~90 sampled points: birch forest, old-growth birch, taiga, old-growth pine/spruce taiga, plains, sunflower plains, flower forest, forest, river, beach, cold ocean, with real trees and flowers and a generated camp-like structure (dirt path, straw beds, barrels, a chest, an oxidized copper chest) at −322,72,−180 (`23-structure.png`).
- Missing: everything more than 12 blocks below a chunk's lowest ocean floor (B1). A 50-block shaft dug at spawn was solid stone from y 71 to 29. The cave encounter rule (`y < 60` and no sky) still fires in what's left.
- Villages: I didn't find one. A ring scan (48 points out to 660 blocks) plus a dense 6×7 grid over the plains around (−550, 0) found no bell. The structure code exists in MinecraftOSS (`generator/src/structure/jigsaw.rs`). I don't know whether villages generate on this seed or at all. No test in `tests/` uses a real village: the Nurse is created by hook in `play.mjs`.
- Generated chests have no loot. OBSERVED: mining the structure's chest gave `chest:1` and nothing else. FROM CODE: `mc_volume` exports block ids only, so no block-entity data.
- Render distance on a phone is 3 chunks with fog from about 30 blocks (FROM CODE `RADIUS`, `view.js` fog). Distant terrain is never visible (`18-sword-vs-pidgey.png`).

### Inventory: the shape is right, the rules are thin
- OBSERVED: 27 + 9 slots, Minecraft-grey, named items (`26-bag.png`). There are no armour slots, no offhand, and no player model.
- OBSERVED: DROP deletes ("Dropped 9 Dirt."), with no item in the world. Death keeps everything (by design, per the README).
- No XP: no bar, no orbs, no enchanting or anvil. Kills and ore give the follower Pokémon EXP and ¥ instead (OBSERVED feed: `+26 EXP SQUIRTLE (ZOMBIE)  +¥30`).
- Beds are one block, not two (OBSERVED: placed a red bed; one cell set). Sleep works: at night, refused near monsters, skips to morning and sets the spawn (OBSERVED: time 18014 → 56, "You slept until morning…").

### Crafting: real recipes, recipe-book only
- OBSERVED: logs → planks → crafting table → sticks, then a wooden pickaxe and sword at a placed table, all by tapping rows (`06-craft-tab.png`, `08-table-craft.png`). The 2×2 / 3×3 gate is real ("Needs a CRAFTING TABLE"), and the recipes are the client jar's.
- Approximated: there's no grid. It's a list of what you could make, so you never lay out a recipe. Fine for a phone, but the list is cluttered: the first screen with 3 logs shows 24 dim rows like "White Bed: 1 White Dye + 1 Orange Bed" and "Black Wool: 1 Black Dye + 1 White Wool".

## 3. Where it reads as "a Pokémon mod for Minecraft"

### Wild Pokémon aren't in Minecraft's physics or combat; they're a separate sprite layer
- OBSERVED: a zombie (spawned by hook, set angry) 3 blocks from a wild PIDGEY (also by hook) walked straight past it toward me 14 blocks away. The distance between them grew 2.5 → 7.3 m. `18a-zombie-ignores-pidgey.png`.
- OBSERVED: standing next to a wild PIDGEY with a wooden sword, the hint reads `TAP: BATTLE PIDGEY · HOLD: MINE`. Holding attack on it for 2.5 s did nothing: no hit, no knockback, no HP change. `18-sword-vs-pidgey.png`. The only verb Minecraft has for a Pokémon is "open Pokémon's battle screen".
- FROM CODE (`entities.js`): wild Pokémon are flat Game Boy sprites moved by their own `walk()`, which snaps them to the ground. They have no box, no gravity, no HP in the world, can't drown, burn, fall, take arrows or be pushed, and mobs never target them. The one exception is the creeper blast, which deletes nearby wild Pokémon ("fled from the blast").
- FROM CODE: the follower "fights" by having `mobs.js followerHelps()` subtract HP from the nearest monster every 1.4 s with a coloured particle burst. It doesn't move to the mob, and no move is used.

### Battles are a mode switch that pauses Minecraft
- OBSERVED: tapping the PIDGEY starts Pokémon Red's battle, staged in the 3D world (`19-battle.png`). That's good. But the Minecraft world stops: the clock, the mobs, hunger, spawning. An angry zombie 13 m away stood still for the whole battle. Nothing from Minecraft can reach into a battle (no creeper going off mid-fight, no arrow, no nightfall), and the terrain doesn't affect the battle (GAMEPLAY.md's own merge table says "Battles ignore the terrain").

### Pokémon live by their own spawn rules, not Minecraft's
- FROM CODE: wild Pokémon come from `encounters.js` tables (biome group × day/night) via `entities.js spawnWild()`, with their own cap (9 by day, 7 at night), own radius and own fade-out. Minecraft's mobs come from the biome's `natural_mob_spawns` via `mobs.js`. They're two populations with two caps, and neither sees the other. Pokémon don't appear in Minecraft's spawn lists, don't care about light, and don't have the creature/monster split. "Aggressive" night Pokémon don't attack you: they walk into you and start a battle.

### Two economies joined by converters, not one
- OBSERVED: Poké Balls (10) and Potions (5) live in Pokémon's bag (`runner.item_count`), not the Minecraft inventory. BALL is a button, not a hotbar item. Money is ¥ in Pokémon's save; Minecraft has no currency. The POKé crafting tab and mob ¥ are bridges between two separate stores. GAMEPLAY.md lists "One inventory: No" as open.

### What does work as a merge (credit where due)
- OBSERVED: the follower takes real party HP from monsters (Squirtle's HP bar went yellow during the night fight, `20-torches-night.png`). Killing a zombie gave Squirtle real EXP (`+26 EXP SQUIRTLE (ZOMBIE)`). Night changes which Pokémon roam (OBSERVED Gastly, Zubat, Drowzee, Gloom, Beedrill, Scyther around me at 13200). A Water lead triples breath (OBSERVED 45 s).
- FROM CODE: a creeper blast removes wild Pokémon; ores drop evolution stones (but see B1: most of those ores don't exist); Minecraft items (SHEARS, WHEAT, BONE, RAW COD) show up in Pokémon's battle ITEM list.
- These are all edges where two layers touch. The layers themselves (Pokémon bodies vs Minecraft bodies, Pokémon time vs Minecraft time, Pokémon sound vs no Minecraft sound) stay separate.

### Verdict on the lens
On the Minecraft side this is a Minecraft-looking world with a Minecraft-shaped HUD: real terrain, textures, recipes, break times and day length. Most of Minecraft's simulation is missing: block updates, fluids, light-based spawning, durability, farming, storage, XP, sound, and everything underground. The Pokémon are an overlay that pauses that world to run its own game. It's closer to "a Pokémon mod" than to "Pokémon living in Minecraft". And unlike a real mod such as Pixelmon, which runs inside the full game, here the host itself is only partly there.

## 4. Top 5 recommendations

Ranked by how far each moves Pokécraft toward one game in which both rule sets run. Effort is a rough guess for an agent working in this repo.

1. **Make Pokémon Minecraft entities.** Give wild Pokémon and the follower the mob body (`Player` physics, gravity, collision, knockback), a world HP derived from their Pokémon stats, and Minecraft's damage sources: fall, lava, drowning, arrows, explosions, sun for Ghost types. Let zombies and skeletons target Pokémon, Pokémon flee creepers, and the follower actually walk to a mob and use a move. Spawn wild Pokémon from the biome's `natural_mob_spawns` (add them as entries), with Minecraft's light rule deciding gentle vs scary. Fixes §3's core finding. Effort: large (several days); `mobs.js` already has the body and AI to reuse.
2. **Restore the world below the surface.** Export full chunk height (`DIG_DEPTH` → `chunk.min_y()`), or generate deeper sections lazily when you dig below `lo`. That brings back caves, deepslate, diamonds, gold, redstone, lava lakes, dungeons and bedrock, and it makes the existing Pokémon hooks real: Moon and Fire Stones, RARE CANDY, ULTRA BALL, and cave encounters in real caves. Effort: small to medium (memory and meshing cost to check on a phone).
3. **Add a block-tick layer, and use it for light and for Pokémon moves.** Gravity blocks, water/lava flow, crop and sapling growth, leaf decay, fire; mob spawning by block light; then let moves act through it (Ember lights grass, Water Gun places water, Dig/Rock Smash break blocks, Flash raises light, Cut clears leaves). That's merge cell 5/7 ("guest rule, host consequence"), and it's what makes the world feel alive. Effort: medium to large.
4. **Give the survival loop its teeth.** Tool durability, real furnace timing with the fuel in the block, chests that store and generated loot, item entities you pick up, XP (or Pokémon EXP shown as Minecraft's XP bar), farming (hoe, seeds, bucket), Minecraft's sounds. Fix B2, B4, B5 on the way. Effort: medium, many small pieces.
5. **Stop pausing Minecraft for battles.** Keep the clock and mobs running during a wild battle (at least outside Pokémon's own menus), let a creeper or skeleton interrupt or hit the battling Pokémon, and let the block under each battler matter (water, grass, cave, lava). That's the "battles ignore the terrain" gap GAMEPLAY.md already names. Effort: medium; needs care with Pokémon's turn-based menus on a phone.
