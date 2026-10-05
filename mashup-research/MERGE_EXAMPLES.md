# True game merges: what they do and how they're built

Gathered 2026-10-05 by two research agents. I spot-checked the main claims myself. Tags:
- **V**: verified against a page or the source.
- **V\***: I re-checked it in the source myself.
- **I**: inferred.
- **unknown**: couldn't be found.

The user's question: what separates a true merge (two games as one) from dropping one game's assets into another? The answer is in the checklist and techniques at the bottom. INSTRUCTIONS.md §B8 has the short version.

## 1. The gold example: the Rocket League car and ball in GTA V

The user showed a short video:
- Captions: "Added rocket league car & ball 1:1 into gta V", "Clean mechanics & can even pinch/hit it into vehicles", "Toggle rl or gta v styled ball cam", "Can also use story mode ability".
- Also in it: a weapons mode with turrets and targeted missiles, NPCs that react, a ball that reacts to the environment, and wall driving.

**Source of the clip: unknown.** The clip itself wasn't found.

**Closest public match (V\*): "RL Car for GTA V"**
- Lives in `gta/` of [lewistardif/RocketLeagueMinecraft](https://github.com/lewistardif/RocketLeagueMinecraft). MIT licence, created 2026-10-02.
- The GTA port is by Dabeer-a1, merged in PR #3 on 2026-10-03.
- 45 of its 60 commits carry a Claude co-author trailer (V\*). It was made the way this repo is made, in days.
- The public code has: the car, ball cam, wall driving, guns and missiles, and bumps and demolitions of GTA cars and peds.
- The public code lacks (V): story-mode abilities, a GTA-style camera toggle, homing missiles, and the ball moving NPCs. So the video is a later or private build, or a different mod.

**How it works (V\* in source unless marked):**

| Piece | How |
|---|---|
| Rocket League rules | `crates/rl_car_core`: a zero-dependency Rust `step(car, controls, collision_world, dt)` covering driving, powerslide, the wall and ceiling sticky force, boost, jumps, dodges, aerials and the 6 hitboxes. The ball is RocketSim's soccar ball, stepped in the same solve |
| Proof it's 1:1 | Checked tick by tick against [RocketSim](https://github.com/ZealanL/RocketSim) (MIT): 53 car scenarios within 0.028 uu, 13 ball scenarios within 0.03 uu (one at 0.4). `cargo test` enforces the tolerances |
| One owner per body | GTA physics is off for the car and ball (frozen, no collision, no gravity). Each frame the Rust sim teleports them to a pose interpolated from a fixed 120 Hz step. The GTA vehicle is a puppet; its velocity is set only so engine audio and wheels look right |
| The host world as the guest's level | GTA shape-test ray probes (one per wheel, plus probes around the body and ball) become cached contact planes. `ProbeFlags = 19` (I: map, vehicles and objects), which is why the ball pinches against parked cars |
| Translating geometry | Invisible procedural quarter-pipes where floor meets steep wall (`WallRamps`, radius 150), so RL's curved arena walls exist on every building. That's what lets the car keep wall-driving |
| Guest rule, host consequence | The core's RL bump and demolition maths sets the outcome. GTA verbs carry it out: `SET_ENTITY_VELOCITY`, `SET_PED_TO_RAGDOLL`, `EXPLODE_VEHICLE` at supersonic speed |
| Reusing the host's systems | Guns and missiles are GTA's own vehicle weapons, fired from car offsets. The boost flame is a GTA particle. NPC and police reactions come from GTA's own AI (I) |
| Models | Optional real Octane and ball meshes from the user's own RL install, drawn with GTA's `DRAW_POLY` |
| Same core, other hosts | A Minecraft Fabric mod (blocks become collision), a Skyrim SKSE plugin (Havok shapes become collision; the Dragonborn rides hidden under the car so cells keep loading; demolitions carry Skyrim's murder bounty), and Bevy |

**Related:**
- Dryxio's Rocket League ported to GTA San Andreas, "authentic RL physics", 2026-09 ([video](https://www.youtube.com/watch?v=PtjzS45Jl0w), V). Source not found.
- "Monster League" for GTA V (2017, [gta5-mods](https://www.gta5-mods.com/scripts/monster-league)) is car soccer on GTA's own physics. It is not 1:1, and it is the asset-swap counterexample.

## 2. Other true merges

| Example | Year | What crosses over | Merge? | Built with |
|---|---|---|---|---|
| [libsm64](https://github.com/libsm64/libsm64) family | 2022+ (I) | SM64's decompiled movement as a C library. The host feeds it collision triangles each tick; Mario's art comes from the user's own ROM | Yes, physics-exact | C, with Rust, C#, Unity, Godot and UE5 bindings |
| [mario64-in-minecraft](https://github.com/Zckyy/mario64-in-minecraft) | 2026-10 | Blocks become SM64 triangles each tick. Stairs become 45° ramps, lava becomes SM64's burning surface, MC water sets SM64's water level. Punches and ground pounds hurt mobs, and landing on a mob stomps it. The power meter mirrors hearts. SM64 music is picked by biome | **Yes. The best model for Pokécraft.** Written with Claude (V\*) | Fabric + JNA. SM64 ticks at 30 Hz inside MC's loop |
| [G64](https://github.com/ckosmic/g64) (Garry's Mod) | ~2022 (I) | 1:1 SM64 moves, caps, coins. Mario picks up GMod props and drives vehicles. GMod materials map to SM64 surface types | Yes | GMod binary module + Lua |
| [Retro64](https://retro64mod.github.io/) (Minecraft) | 2021 | SM64 health refilled by **MC XP orbs**. The M key toggles MC mode and Retro64 mode | Yes | Mod |
| [Supersonic Mario](https://github.com/Serialbocks/SupersonicMarioPlugin) (Rocket League) | ? | Mario inside RL. Whether he can touch the ball is unknown | ? | BakkesMod |
| [SM64 San Andreas](https://github.com/headshot2017/sm64-san-andreas), [GZDoom-SM64](https://github.com/headshot2017/gzdoom-sm64) | ? | WIP. Ped-task code (I: peds treat Mario as a ped) | ? | ASI plugin / engine fork |
| Super Mario 64 Odyssey (Kaze Emanuar) | 2017 | Cappy captures SM64's own enemies and gives you their abilities | Yes: a new verb acts on the old game's actors | ROM hack |
| [Mari0](https://stabyourself.net/mari0/) | 2012 | SMB1 rewritten with a portal gun. Portals carry Mario, enemies and objects with their momentum | Yes: both games rewritten in one engine | LÖVE |
| Super Mario Bros. Crossover | 2010 | SMB1 levels played as Mega Man, Link, Samus and others, each with their own game's physics. Power-ups translate per character | Yes | Flash |
| Cadence of Hyrule | 2019, official | NecroDancer's beat rule governs all of Zelda: movement, combat, item use, enemy patterns | Yes: a global rule | — |
| Steve in Smash Ultimate | 2020, official | Steve mines the *Smash stage*: the material depends on the surface, he crafts tool tiers, and placed blocks decay | Yes: a resource economy on foreign terrain | — |
| MH: World × FFXIV Behemoth | 2018, official | FFXIV's enmity/tank aggro and raid mechanics run on MHW combat | Yes: one game's AI rules | — |
| Terraria × Don't Starve ("The Constant") | 2021, official | DST hunger and killing darkness as a whole Terraria world rule, plus DST items. Terraria bosses go into DST | Yes: a ruleset seed, both ways | — |
| Pokémon Conquest | 2012, official | Nobunaga conquest and Pokémon types. Each kingdom has a type; link % triggers evolution | Yes: coupled progression | — |
| Spider-Man for GTA V (JulioNIB) | 2019 | Web swinging needs real nearby buildings. Web rodeo on peds and cars, and throws use GTA ragdolls | Yes: a verb set on the host's systems | ScriptHookV(.NET) |
| [Portal Gun for Minecraft](https://ichun.me/mods/portalgun/info/) (iChun) | 2010s (I) | Portals on blocks carry players, mobs, arrows, XP, sand and **primed TNT** with momentum | Yes | Forge mod |
| Fortnite building in GMod TTT | ~2018 | Fortnite building inside TTT's rules. Pieces not connected to the ground collapse | Yes | Workshop addon |
| Rocket Racing in Fortnite | 2023, official | RL driving (walls, flips, boost) as a mode; RL car bodies carry over | Partly: a separate mode | — |
| Pokérim (Skyrim) | 2024 | Ball capture stores NPCs; a green ball makes the NPC fight for you, **through Skyrim's faction system**; captured dragons can be ridden | Partly: capture only, no battles | Skyrim mod |
| Pokémon GO in GTA V | 2016 | PokéStops in Los Santos. The ball is GTA's baseball and any hit catches | Partly: trivial capture | Script |
| Rocket League licensed cars (Batmobile, DeLorean) | — | A body on a standard hitbox, no abilities | **No: an asset swap** (the control case) | — |

## 3. The merge test

A true merge answers yes to most of these. An asset swap answers yes to almost none.

1. **Rules, not looks:** does game B's thing obey B's *original* physics, timing or rules 1:1? (RL core vs RocketSim; libsm64; pokered running for real)
2. **The host world feeds the guest's rules:** do A's geometry and materials become B's level data? (GTA probes become RL planes; blocks become SM64 triangles; the Smash stage decides Steve's ore)
3. **The host translates into the guest's geometry language:** do A's shapes get converted into what B's moves need? (quarter-pipes on buildings; stairs as 45° ramps)
4. **A's AI notices B:** do A's NPCs, mobs and factions react to B's objects? (GTA ragdolls and police; MHW enmity; Skyrim factions in Pokérim)
5. **B's signature verb acts on A's actors:** (Cappy captures SM64 enemies; portals carry TNT; Steve mines the Smash stage)
6. **One owner per body:** is every object simulated by exactly one game, with the other only drawing it or reacting to it? (GTA physics off on the RL car)
7. **Guest rule, host consequence:** does B decide an outcome and A carry it out with its own verbs? (RL demolition maths, then `EXPLODE_VEHICLE`)
8. **The economies cross:** does at least one resource flow between the two games? (XP orbs heal Mario; MC iron makes Poké Balls)
9. **Health is bridged:** does damage from either side count on one meter, or on two meters that are linked? (SM64 power meter mirrors hearts)
10. **A's powers still work while using B's thing:** (GTA story abilities in the RL car)
11. **A global rule from one game governs all the other's content:** (beat in Cadence; DST hunger and darkness; day and night governing which Pokémon appear)
12. **Something happens that neither game could produce alone:** (TNT through a portal; pinching an RL ball against a GTA bus)
13. **Presentation reacts:** does music, camera or UI follow the merged context? Can you switch between the two games' feels? (SM64 music by biome; RL vs GTA ball cam; Retro64's M key)
14. **It's real state:** does it survive a save, or multiplayer?

## 4. Recurring techniques

- **Engine-agnostic guest core plus thin host adapters.** One guest library (a RocketSim-checked RL core, libsm64) with a C ABI. Each host only supplies collision, rendering, input and entity effects. The same core then plugs into GTA, Minecraft, Skyrim, Bevy, GMod and others.
- **An oracle for fidelity.** "1:1" is a test, not a vibe: compare against a reference implementation tick by tick (RocketSim, the SM64 decomp, a real ROM).
- **A fixed-step guest inside a variable-rate host,** with interpolated poses: RL at 120 Hz in GTA, SM64 at 30 Hz in Minecraft, Pokémon at 59.73 Hz in Pokécraft.
- **Sampling the host world into the guest's collision:** ray probes into cached planes (GTA), blocks into triangles each tick (Minecraft), Havok shapes copied out (Skyrim).
- **Material and surface translation:** host materials map to guest surface types (lava burns, water sets the water level, stairs become ramps).
- **Making the guest legible to the host:** the guest becomes a ped, mob or faction member, so the host's AI, ragdolls and law apply for free.
- **Reusing the host's systems** (weapons, particles, police, factions) rather than rebuilding them in the guest.
- **A hidden anchor:** the host's player rides hidden under the guest so the host's world keeps streaming (Skyrim RL; in Pokécraft, Pokémon's player stays parked on Route 1).
- **Bridging the economies and health.**
- **Porting one signature verb,** or **imposing one global rule.**
- **Mode and feel toggles,** such as the camera style or Retro64's M key.
- **Assets from the user's own copy at runtime** (RL install, SM64 ROM, client jar). Nothing from the games ships.
