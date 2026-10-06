# Rewriting mobile games ourselves, to merge them (2026-10-06)

The user, after Dukecraft: "It still just reads as a mod not a merge. Lets lose minecraft and perhaps looks at rewriting some mobile games ourselves."

## Why Pokécraft and Dukecraft read as mods

In both, one game was the world and its loop ran the show. You mine, craft and survive, and the other game only added things into that loop: Pokémon to battle, aliens to shoot. Take the guest away and the host still plays the same. That is exactly what a mod is.

A merge needs **each game's core loop to need the other's**. If you remove either game, the other stops working. The merges in MERGE_EXAMPLES.md that pass this test were built with both games' rules in **one codebase**: Mari0 (SMB1 and Portal rewritten together), Super Mario Bros. Crossover, Cadence of Hyrule. Rewriting both games ourselves gives us that, with no host engine in the way.

## What makes a good pair

1. **Phone-native:** touch was the original control, so no virtual pad.
2. **Small, well-known rules** we can rewrite faithfully in days, not months.
3. **One shared board or world.** Both games' objects live in the same space.
4. **Each core verb acts on the other game's objects,** and each game's economy feeds the other's.
5. **2D, or both the same dimension.** The lesson from Pokécraft: don't mix a 2D game with a 3D one.

## Shortlist

| Pair | The merge (one board, both loops) | Fit | Effort |
|---|---|---|---|
| **Plants vs. Zombies × Candy Crush** | The lawn is the match-3 board. Plants are the tiles. Swapping makes matches, and a match of three merges plants into a stronger one (3 Peashooters make a Repeater) or cashes them in for sun. Zombies walk down the rows and block the cells they stand on, so the board changes under you. Special candies are plant powers: a striped match fires down a lane, a wrapped one is a Cherry Bomb. You can't defend without matching, and you can't match freely because of the zombies | Strongest. Both are grid games, touch-native, and each loop is useless without the other | Small to medium. No physics engine |
| **Angry Birds × Cut the Rope** | One physics scene. Candy hangs on ropes over pig fortresses. Birds from the slingshot cut ropes as they fly through them, and a swinging candy knocks blocks onto pigs. Om Nom has to be fed for the level to end, and the pigs have to be cleared too. Bubbles and air cushions lift birds as well as candy | Strong. Both are physics puzzles on Box2D-style rules (Angry Birds used Box2D; planck.js is a JS Box2D port) | Medium. Needs physics and level design |
| **Fruit Ninja × Angry Birds** | Pigs' fortress blocks and birds are launched across the screen like fruit. Swipes slice blocks in half (real physics fragments), so the structure collapses onto pigs. Birds you don't slice hit the fortress. Combos come from slicing, scores from toppling | Good. Slicing changes the physics world | Medium. Polygon slicing in a physics engine |
| **Doodle Jump × Jetpack Joyride** | One vertical endless world. Jetpack fuel comes from Doodle's springs and monsters, and Joyride's zappers and missiles fill the gaps between platforms. Tilt steers both | Good, but both are endless runners, so the merge is shallower | Small |

## Recommendation

**Plants vs. Zombies × Candy Crush.**
- It's the deepest merge on the list: the board is one thing that both games' rules act on all the time.
- It's the cheapest to build: a grid, sprites and touch swaps, with no physics.
- Both games are phone-native, and both rule sets are widely documented: PvZ's plant and zombie stats, and Candy Crush's special-candy rules.

## How we'd rewrite them

- **One engine, one rules core**, in TypeScript or Rust to wasm. The rules core is pure (state in, state out) and headless-testable, the way the RL core was.
- **Rules faithful where they're the game:** PvZ's per-plant damage, rate of fire and zombie health and speed; Candy Crush's special candies (striped, wrapped, colour bomb) and their combinations.
- **New art made for the game,** in one style, so it reads as one game, not two pasted together.
- **The merge test (MERGE_EXAMPLES.md §3) as the spec,** checked by tests: each cell of the interaction matrix (plant × match, zombie × board, sun × moves) gets a test.
