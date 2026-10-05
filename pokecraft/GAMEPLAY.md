# Pokécraft gameplay pass: design notes

The user's examples were a starting point, not a spec:
1. No Minecraft inventory, just a hotbar without item names.
2. No forced Pokémon encounters. By day, only grass, snow piles and swimming should force one, and roaming Pokémon should be cute (Caterpie, Tauros, "that sheep Pokémon"). At night, scary Pokémon roam anywhere and are aggressive, alongside Minecraft's hostile mobs.

The question I worked from: what does each game's core loop need that v2 dropped, and where can the two loops feed each other?

## Ideas that came out of the examples

**From "no inventory / no names" to everything a Minecraft inventory implies:**
- An inventory needs things worth carrying, so crafting from Minecraft's own recipe files, shown as a recipe book because a 3×3 grid is fiddly on a phone.
- Crafting needs tools to matter, so Minecraft's real break times and harvest tiers. Stone by hand takes 7.5 s and gives nothing.
- Smelting, because iron is the gate to everything good, including POKé BALLs.
- Item names in three places: the inventory, a hotbar popup when you switch, and a pickup feed.

**From "night mobs attack" to survival as a whole:**
- If mobs attack you, you need health. Health needs food to come back, and food needs animals and fishing.
- Falling, drowning and lava give the terrain teeth, which the first-person view was for in the first place.
- Death sends you to your bed but keeps your things: a phone game shouldn't wipe a bag.
- A night that's actually dark gives torches a purpose: block light in the mesher.
- Mobs as real 3D box models in Minecraft's own skins, not sprites, so they read as Minecraft next to the Game Boy Pokémon.
- Creepers blow holes in the world, skeletons shoot arcing arrows, and the undead burn at sunrise.

**From "forced encounters in grass, snow, water" to the hiding places Pokémon has always had:**
- Tall grass, ferns and bushes; snow layers and powder snow; swimming; and dark caves (a fourth, from Pokémon's own caves). Each has its own table: water gives water types, snow gives ice types, caves give Zubat, Geodude, Onix.
- An encounter rolls once per block walked, with a few grace steps after a battle, so it feels like the Game Boy: you can push through grass, but not for free.
- The Pokémon visibly bursts out of the block (particles, then the battle), so it reads as part of the world, not a menu.

**From "cute by day, scary by night":**
- Day and night are separate tables per biome group. The day has Caterpie, Pidgey, Jigglypuff, Clefairy, Tauros, Ponyta, Eevee, Pikachu, Nidoran. The night has Gastly and Haunter, Zubat, Drowzee, Ekans, Mankey, Grimer, Koffing, Cubone. There's no Mareep: Gen 1 only. Jigglypuff and Clefairy fill the fluffy role.
- Night Pokémon are aggressive: they spot you from 16 blocks and charge.
- The day/night turnover fades the old roamers out, so the cast visibly changes at dusk.
- Night encounters run about 2 levels higher. Sleeping is refused with monsters or aggressive Pokémon nearby, as in Minecraft.

**Where the two games feed each other (my additions):**
- Your lead Pokémon fights Minecraft monsters beside you. It's the Pixelmon fantasy, and a reason to keep a strong lead.
- Minecraft materials make Pokémon items (POKé crafting tab): iron + red dye + a button make POKé BALLs, and bottles plus plants make medicine.
- Evolution stones hidden in ores, matched by colour and feel (Thunder in copper, Moon in diamond, Leaf in emerald, Water in lapis, Fire in redstone), so mining feeds the Pokédex.
- Fishing with a Minecraft rod catches Pokémon most of the time, otherwise Minecraft fish and junk.
- Killing hostile mobs pays Pokémon money, so the night is also how you afford the Mart.
- The NURSE heals you as well as your party.

## Left for later
- Shearing sheep, farming, chests, armour.
- Mob and footstep sounds.
- Weather (rain could bring water types onto land).
- Gyms built from village structures.
- Riding and surfing on your Pokémon.
- Tuning hunger rate, night length and mob caps on a real phone.

## Pokécraft against the merge test (2026-10-05)

Scored after the gameplay pass against `mashup-research/MERGE_EXAMPLES.md` §3. The recombination ideas are in `mashup-research/RECOMBINATION_2026-10-05.md`.

| # | Question | Now | Gap, and the fix that would close it |
|---|---|---|---|
| 1 | Rules 1:1 | Battles, party, items and evolution are Pokémon Red itself. Worldgen is Minecraft's own | Player and mob movement only approximate Minecraft |
| 2 | Host world feeds the guest's rules | Biome and grass/snow/water/cave blocks pick encounters; day and night pick the tables | **Battles ignore the terrain** |
| 3 | Geometry translated | The opponent's battle spot uses a line-of-sight check | None needed |
| 4 | A's AI notices B | No. Zombies ignore Pokémon and Pokémon ignore creepers | **Cross-game AI:** mobs hunt wild Pokémon, Pokémon flee creepers |
| 5 | B's verb on A's actors | Partly: the follower hits Minecraft monsters | **Moves edit the world** (Ember burns grass, Dig and Rock Smash break blocks, Flash lights the dark). **HMs as Minecraft verbs** |
| 6 | One owner per body | Yes: the page owns the world and bodies; Pokémon owns battle state | None needed |
| 7 | Guest rule, host consequence | Pokémon decides battles and the world removes or keeps the Pokémon | Moves' effects carried out as block edits, fire and knockback |
| 8 | Economies cross | Yes: POKé crafting, evolution stones from ores, mob money | **Minecraft XP becomes Pokémon EXP. Wild Pokémon drop Minecraft materials** |
| 9 | Health bridged | No: hearts and party HP never touch | **Follower fights use real party HP and give real EXP** |
| 10 | A's powers while using B | No | **Lead Pokémon's type as survival perks** (Water: breath; Flying: slow fall; Fire: light and cooking) |
| 11 | Global rule | Yes: day and night decide which Pokémon roam and whether they attack | None needed |
| 12 | Something neither game could do | Weak | Follows from 4, 5 and 9 (a creeper blast catching a wild Pokémon) |
| 13 | Presentation reacts | The Pokémon HUD sits over the world | Music by biome and time (Pokémon tracks chosen by Minecraft biome) |
| 14 | Real state | Yes: saves hold both games | None needed |
| — | One inventory | No: two bags | **Poké Balls and Potions as Minecraft hotbar items** |

**Done in the first merge pass (2026-10-05):**
- Party abilities as survival perks (10 → yes).
- Follower fights use real party HP; monsters and ore give real EXP, with level-ups, moves and the real evolution cutscene played over the world (8 and 9 → yes).
- A creeper blast scatters wild Pokémon (12, a start).
- `tests/merge.mjs` tests each of these cells.

**Next merge pass, in order:**
1. Moves that edit the world, and the Poké Ball as a physics object.
2. One inventory.
3. HMs as Minecraft verbs.
4. Cross-game AI (mobs hunt wild Pokémon; Pokémon flee creepers).

Then write the interaction-matrix test.

## Movement, food and partners pass (2026-10-05)

The user gave examples to think from, not a checklist: swimming in deep water, crouching, sprinting, ladders; food and hunger, with fainted Pokémon dropping the food that fits them; partner boosts (swim and breath for water types, hunting and farming for land types, walking through grass without forced battles, mining for ground types); and riding the right Pokémon (TAUROS on land, swimmers on water, fliers in the air).

**Done:**
- **Movement:**
  - Sneak: slower, lower view, edge guard, dive in water, half the grass encounter rate.
  - Ladders and vines climb. The game has no block facing, so a ladder is a see-through block you stand in.
  - Sprint-swim underwater, along where you look.
  - The field of view widens a little when you go fast.
- **Food:**
  - Fainted wild Pokémon drop items by species (`drops.js`, about 110 Gen 1 species). A Normal partner adds a food item; level 30+ Pokémon drop one more.
  - Battles cost hunger.
  - Feeding your partner heals it through Pokémon's own party (`heal_mon`). Berries and fruit heal twice as much.
- **Partner perks:**
  - Normal: hunting bonus, also on Minecraft animals.
  - Grass: bigger harvests from crops.
  - Grass and Bug: the Repel rule while sneaking.
- **Mounts** (`MOUNTS` in `perks.js`):
  - Land: speed ×1.5–2.4 and a higher jump. They don't swim; you slide off in water.
  - Surf: the water's surface carries you. You step off on land.
  - Fly: no gravity; JUMP climbs, sneak descends, no fall damage.
  - The partner's back shows at the bottom of your view.

**Found by the tests:**
- Two perks cancelled out. LAPRAS (Water/Ice) froze its own water when you surfed on it, and then dropped you for being "on land". The interaction matrix needs perk×perk cells too, not just game×game.
- Repel as an always-on Grass perk removed grass encounters for a third of starters (Bulbasaur), which breaks Pokémon's core loop. It became a choice: sneak to avoid, walk to meet them.

**Later:**
- Shearing (wool from fluffy Pokémon without fainting them).
- Farmland and planting.
- Riding animations.
- Fly to your bed or a village (Gen 1's FLY), and DIG/TELEPORT to your bed.
- Rain bringing water types onto land.
- Crawling through one-block gaps.

## Minecraft items in Pokémon battles (2026-10-05)

The user asked: "When in battle with a sheep type Pokémon do the shears appear in your item list? This is some of the types of true mixing we should see."

They didn't, until now.
- **The items:** SHEARS, WHEAT, BONE and RAW COD are now real Pokémon items: they're in pokered's item list, have item data, and have effects in its battle code.
- **Lending:** when a wild battle starts, the page lends the ones you carry that fit the opponent into Pokémon's bag. Afterwards it takes out what you used.
- **Effects:**
  - Each one does to the Pokémon what it does to the Minecraft animal.
  - SHEARS shear the fluffy ones (Gen 1 has no sheep; JIGGLYPUFF and CLEFAIRY stand in): wool, and DEFENSE −1.
  - WHEAT calms cattle-like ones, BONE dog-like ones, RAW COD cats: ATTACK falls.
  - On anything else: "OAK: This isn't the time to use that!"

Open: more items could follow the same pattern without new code paths. Examples: a BUCKET on water types, a LEAD to make a weakened Pokémon follow you home, a SADDLE on rideable ones.

