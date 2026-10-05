# Recombination pass, 2026-10-05

This pass uses the method in RESEARCH.md §5 (Recombination). Random 3–5-word strings came from the last 20 chat messages, sampled evenly per message (the session summary didn't count extra). They were paired across messages with `tools/recombine.py --last 20 --seeds 30 --seed 20261005`. Each pair was then forced into a one- or two-sentence question or statement about this work, and I wrote down what it made me think of.

The pass ran just after the Pokécraft gameplay pass, and just after the user showed the Rocket League-in-GTA V video ("the ball is reactive to everything", "can also use story mode ability"). That's why most of the ideas lean toward systems touching each other.

**Verdict on the method:** about a third of the seeds were duds (marked —). Most of the rest gave ideas I hadn't listed in `pokecraft/GAMEPLAY.md`, even though that file had been written an hour earlier from three careful readings of the user's examples. Seeds 3, 6 and 30 produced the strongest ones. Duds cost a few seconds each.

| # | Seed | Forced into a sentence | What it raised |
|---|---|---|---|
| 1 | "writing a new suite for" + "must cover x" | A merge needs a test suite that must cover every pairing: each system of game A against each object of game B. | **An interaction-matrix test.** List the systems of each game as rows and columns, and assert that each cell does something: a creeper blast hurts a wild Pokémon, Ember burns a zombie. Cells left empty are where the merge is still two games. |
| 2 | "requirements drops including evolution" + "block lookup the" | What if the block you're standing on decided how your Pokémon evolves? | **The world feeds Pokémon progress.** Minecraft's XP orbs (from mining, smelting and kills) become EXP for the lead Pokémon, so one economy drives both games. Evolution conditions could also read the world. |
| 3 | "pops up over the" + "battle screenshot shows no Pokémon" | The battle HUD pops up over the world, but the world doesn't know a battle is happening. | **Battles change the world.** Ember sets grass on fire, Water Gun leaves water, Earthquake, Dig and Rock Slide break and drop blocks, and Thunderbolt can strike a creeper into a charged one. Mobs walk into the fight. This is the "ball reacts to everything" principle applied to moves. |
| 4 | "from ores food and" + "block lookup the" | What does a Geodude eat? | Feed your follower Minecraft food to heal it outside battle, with food that depends on its type. A small idea. |
| 5 | "fields shape top" + "mobs fishing hunger" | Hunger makes you farm the fields; who helps shape them? | **HMs as Minecraft verbs.** Gen 1's field moves map one-to-one onto Minecraft actions: Cut fells trees and leaves, Rock Smash mines, Strength pushes blocks, Surf rides your Pokémon over water, Flash works as a moving light source (the block light from the gameplay pass), and Fly travels between beds and bells. Pokémon that know them do the work. |
| 6 | "survival health hunger" + "the inventory health HTML" | Why are your hearts and your party's HP two systems that never touch? | **One shared health economy.** When your follower fights zombies, the damage comes off its real party HP and the win gives real EXP. A Pokémon that faints stops following. Monsters become a real cost and a real way to train. |
| 7 | "four suites pass Now" + "the inventory health HTML" | — | Dud. |
| 8 | "mobs and survival modules" + "the inventory health" | — | Same as 6. |
| 9 | "mobs fishing hunger" + "writing a new suite for" | Can Minecraft mobs hunt Pokémon? | **Cross-game AI.** Zombies go after wild Pokémon, which flee creepers. Wolves and foxes chase Rattata, Pidgey chases Caterpie. NPCs and traffic react to the RL ball in GTA in the same way. |
| 10 | "in parallel I'll do" + "specific thing did" | Running two games in parallel isn't merging; one specific thing has to belong to both. | **A principle: every object is legible to both rule sets.** A wild Pokémon is also a Minecraft entity with a hitbox, knockback and drops. A zombie is something a Pokémon move can target. |
| 11 | "word-recombination pass myself since" + "gameplay test suite crafting" | Crafting is recombination: two games' items in one recipe. | **Wild Pokémon drop Minecraft materials when beaten.** For example, Shellder's shell becomes a turtle-shell helmet and Ponyta drops blaze powder. Both ways of crafting then mix. |
| 12 | "it as CLAUDE md asks" + "to help you" | — | Dud. |
| 13 | "survival health hunger" + "to help you" | Your party could help you survive. | Folded into 30. |
| 14 | "into the main script reading" + "suites pass Now docs then" | — | Dud. |
| 15 | "so I'm doing it in" + "the worker needs then" | Pokémon could be the workers. | Pixelmon-style jobs, such as Machop mining or Bulbasaur farming. Folded into 5. |
| 16 | "the worker needs then" + "then writing a new suite" | — | Dud. |
| 17 | "specific thing did" + "sleep sleepStep place edit" | What happens while you sleep, or don't? | **Phantoms become ghosts.** Skip sleep for three nights and Gastly and Haunter swarm you, the way Minecraft's Phantoms do. Drowzee (the dream-eater) shows up at your bed. |
| 18 | "so I'm doing it in" + "leave you alone Caterpie Pidgey" | Caterpie and Pidgey leave you alone, but do they leave each other alone? | A food chain among roaming Pokémon. Folded into 9. |
| 19 | "it as CLAUDE md asks" + "to help you" | — | Dud (repeat of 12). |
| 20 | "the world worker's chunk snapshots" + "to the ball and car" | The world should react to the ball. | **The Poké Ball as a physics object.** It bounces off blocks, rolls downhill and sinks in water, so the throw matters: a clean hit on a weakened Pokémon catches better, like Pokémon GO's curveballs. This is the RL ball's lesson that the thrown thing is a real object. |
| 21 | "Writing the design notes file" + "pops up over the" | Notes that pop up in-game: a Pokédex for Minecraft mobs? | A "Mob-dex" page beside the Pokédex, and a ball that bounces off a creeper with a joke line. Small. |
| 22 | "from ores food and" + "four suites pass Now" | — | Dud. |
| 23 | "writing a new suite for" + "now It touches every system" | A merge touches every system. | Confirms 1. |
| 24 | "water caves fishing" + "it as CLAUDE md asks" | Fishing in caves. | Underground water gets its own fishing table (Gen 1 had cave fishing spots). Small. |
| 25 | "four suites pass Now" + "shows no Pokémon or battle" | The tests passed while the screenshot showed no Pokémon. | **A process lesson.** In this session's grass-battle bug, the test checked the screen state ("Battle") but not what was in frame. Assert on-screen framing too: is the sprite in the view, and at a sane size? Then look at the screenshots. |
| 26 | "battle screenshot shows no Pokémon" + "Merging the branch onto main" | — | Same as 3. |
| 27 | "block lookup the" + "then writing a new suite" | — | Dud. |
| 28 | "Pokémon side rewriting" + "the inventory health HTML" | Why are there two bags? | **One inventory.** Poké Balls, Potions and stones become Minecraft items in the hotbar: hold a ball and throw it with USE, or hold a Potion and use it on your follower. The BALL button and the hidden second bag then go away. This is how Pixelmon does it. |
| 29 | "Merging the branch onto" + "the inventory health" | — | Same as 28. |
| 30 | "now It touches every system" + "breath underwater fall damage eating" | Your Pokémon's type could touch every survival system. | **Party abilities as survival perks, the "story mode ability" of this mosh.** A Water-type lead lets you breathe longer underwater, a Flying type slows your fall, a Fire type gives light and warmth (and cooks food in your hand), a Grass type regrows saplings, and a Ghost type keeps zombies off at night. GTA's story abilities still work while you drive the RL car; Pokémon's types still work while you survive Minecraft. |

## Strongest, in the order I'd build them
1. **30, party abilities as survival perks.** It's cheap, it touches every survival system, and it's the clearest parallel to "story mode ability".
2. **6, one health economy** (follower fights use real HP and give real EXP), with **2** (Minecraft XP feeds Pokémon EXP).
3. **3, moves change the world**, and **20, the Poké Ball as a physics object.**
4. **28, one inventory.**
5. **5, HMs as Minecraft verbs.**
6. **9, cross-game AI.**
7. **1, an interaction-matrix test** (process), and **25, framing assertions** (process).
