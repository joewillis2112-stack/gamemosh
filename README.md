# Gloamreach

A dark-fantasy survival RPG that runs in a phone browser. Every world is generated from a seed: terrain, ruins, roads, guardians and loot all change with it.

**Play:** open `dist/index.html` in any modern browser (phone or desktop). It is one self-contained file with no install and no server.

## What's in it

- **Seeded 2 km world** with six biomes (Ashen Moor, Blackwood, the Mire, Barrow Crags, Frostspine, the Blight), lakes, and a sea at the edge. The same seed always makes the same world.
- **78 generated locations**: 6 large guardian ruins (keeps, a cathedral, necropolises, a hamlet) plus shrines, watchtowers, standing stones, camps, gallows, wrecks, cairns and crypts, joined by old roads.
- **Real physics** (Rapier, a Rust engine compiled to WebAssembly): character controllers, crates and barrels you can knock around, explosive pitch barrels with chain reactions, thrown firebombs, and tumbling ragdoll corpses.
- **Mobile controls**: floating joystick, drag to look, attack (hold for heavy), roll, jump, flask, torch, firebomb. Keyboard, mouse and gamepad work too.
- **Navigable menus** for gear, character, crafting, map, journal and settings, all usable by touch, keyboard or controller.

### Extras beyond the brief
1. **Main quest with six bosses.** Each guardian ruin holds a boss with its own moveset (the Warden, the Blackened Knight, the Ember Witch, the Carrion Hound). Beat it, light its beacon, and when all six burn the Gloam lifts.
2. **Day/night cycle and weather**: rain, storms with lightning, mist, ashfall and snow. Night brings wraiths.
3. **Dread meter.** Darkness, the Blight and wraiths build dread. High dread summons wraiths and eventually wounds you. Torches, fires and shrines calm it.
4. **Soulslike embers.** Enemies drop embers you spend on levels at shrines. Die and your embers stay where you fell until you reach them.
5. **Shrines**: rest to save, refill flasks and respawn enemies. Level up, fast-travel between found shrines, craft, and reforge weapons.
6. **Crafting and harvesting.** Chop dead trees for wood, strike rocks for iron, and loot chests, camps and cairns. Craft torches, firebombs, food and armour at any fire.
7. **Ink-on-parchment world map** with fog of war, a rotating minimap, and a compass that marks your objective. Climbing a watchtower charts the land around it.
8. **Loot and gear**: 8 weapons with different reach and speed, armour, charms, and boss relics. Weapons upgrade to +5.
9. **Procedural lore notes** at ruins and standing stones, collected in the journal.
10. **Synthesised audio**: wind, rain, thunder, combat sounds, a heartbeat at low health, and whispers at high dread. There are no audio files.
11. **Autosave**, plus a continue option on the title screen.
12. **Quality settings** (low/medium/high), look sensitivity, invert look, vibration, and a frame counter.

## Develop

```sh
npm install
npm run build      # writes dist/index.html
node tests/smoke.mjs out/            # boots the game headless and screenshots it
node tests/smoke.mjs out/ --mobile   # same at phone size with touch
node tests/combat.mjs                # scripted melee, damage, death/respawn, explosion checks
```

Source layout: `src/world/` (generation, chunks, structures, sky), `src/entities/` (player, enemies, models), `src/ui.js`, `src/main.js` (game rules and loop). Tuning numbers live in `src/config.js` and `src/items.js`.

`GAMEMOSH_BRIEF.md` is earlier research on the Rust game-mashup trend; it is not used by the game.
