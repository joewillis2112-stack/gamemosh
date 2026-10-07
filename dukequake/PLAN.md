# Duke × Quake: one engine, both games' real rules

Started 2026-10-06. The user, after Dukecraft read as a mod: "lose minecraft and perhaps look at rewriting some mobile games ourselves… consider what I'm actually trying to do here."

## What the user is trying to do

- **Real games, rewritten by us, faithfully.** Like the AI-written rewrites this repo began from (IW4L, star-andreas, the Rust rewrite mashup), and like the RL core: checked 1:1 against the original. Not "inspired by" remakes.
- **Merged at the rules level,** with no host game. Each game's logic runs and acts on the other's things. Remove either and the result stops working.
- **Playable on a phone.**

## Why Duke Nukem 3D × Quake

| Need | Quake (1996) | Duke Nukem 3D (1996) |
|---|---|---|
| Oracle to check a rewrite against | id's GPL source (`id-Software/Quake`: WinQuake, QW) | 3D Realms' GPL source (JFDuke3D) |
| Free data | shareware PAK0.PAK (18.7 MB): start + E1M1–E1M8, archive.org `quakeshareware/QUAKE_SW.zip` | shareware DUKE3D.GRP (11 MB): episode 1, archive.org `3dduke13` |
| Game logic shipped as data | **QuakeC** bytecode: `progs.dat` in PAK0 runs every monster, weapon, door and item | **CON** scripts: `GAME.CON` in the GRP runs every actor (our VM already compiles and runs it) |
| Dimension | true 3D | 2.5D maps, but its rules use 3D: jetpack, vertical aim, swimming |
| Phone cost | 1996 PC engines: light | light |

Both games are script VMs over an engine. One engine can run both VMs over one shared world. That's the merge: not one game hosting the other, but two rulebooks executing side by side on the same entities.

## Architecture (write once, extend)

One Rust crate built to wasm, with the page doing input, rendering and audio:

- **World:** Quake's BSP and Quake's own collision (`world.c` / `SV_Move` hull traces, ported). Duke's Build maps are converted to the same brush/hull form later.
- **Rulebooks:**
  - **QuakeC VM** (`pr_exec.c` + builtins, ported) runs `progs.dat`.
  - **CON VM** (`dukecraft/con` + `move()`/`alterang()`) runs `GAME.CON`.
  - Each rulebook sees one entity table and asks the world the same questions: trace, visible, floor.
- **Physics:** Quake's `sv_phys.c` (player and monster movement, gravity, step), ported.
- **Oracle tests:** id's C code compiled natively and run headless, compared tick by tick with the Rust port on the same inputs, as the RL core was checked against RocketSim. Tolerances live in `cargo test`.

## The user's clarification (2026-10-07)

> "Obviously its not ALL of rocket league in gta, but the assets added are 1:1, they are not just mods. Skate and mw2 in minecraft added the guns, minimap, movement, and hud from mw2 as well as the character model, this was alongside the skate physics engine when on the skateboard."

So a host world is fine. What makes it a merge is that the guest arrives **1:1 and whole**: its real models, weapons, HUD, minimap, movement and physics, running as the original, not imitations of them. For this project that means **the player's whole kit comes across**: play as Duke with Duke's own weapons (his CON and `player.c` rules), Duke's HUD drawn from his ART, Duke's movement and jetpack, inside Quake's maps, against Quake's monsters running on `progs.dat`. Then the other way round in Duke's maps.

## Merge points (the merge test)

- **Q4, AI that notices the other game:** Quake's infighting rule (monsters hit by another monster turn on it) applies across games: a Shambler and a Pig Cop fight.
- **Q5, guest verbs on host actors:** Duke's shrinker on an Ogre (shrink, then stomp); the freezer on a Fiend; a Quake rocket jump on Duke's jetpack fuel; the nailgun on Duke's breakables.
- **Q8, economies:** one arsenal (Duke's pistol, shotgun, RPG and pipebombs next to Quake's nailguns and lightning gun). One health/armour model, mapped from both games' numbers. Ammo pickups from both.
- **Q11, global rules:** Quake's power-ups (quad, pentagram, ring) apply to Duke's weapons and Duke's enemies. Duke's steroids and jetpack work in Quake's maps.
- **One campaign:** Quake's E1 and Duke's E1 maps linked by slipgates, with both games' monsters in both games' maps.

## Phases

1. **Quake core, headless:** PAK/BSP, hull traces, QuakeC VM running `progs.dat`, server physics. Monsters think on E1M1. Oracle test against id's C. **Done 2026-10-07: 72/72 oracle runs match bit for bit (see README).**
2. **Playable Quake on a phone:** WebGL2 BSP with lightmaps, MDL models, touch controls.
3. **Duke's kit, 1:1, in Quake:** play as Duke: his weapons, HUD, movement and jetpack from his own data and rules. Then Duke's CON actors in Quake's world, drawn from Duke's ART.
4. **Duke's maps:** Build sectors converted to brushes and hulls.
5. **The merge cells** from the list above, each with a test.
