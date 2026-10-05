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
