# Dukecraft: Duke Nukem 3D in Minecraft

Started 2026-10-06. The user: Pokémon (2D) and Minecraft (3D) didn't fit; pick a 3D game that runs on a phone. Then: "Your game your choice." The research is in `mashup-research/3D_PICKS_2026-10-06.md`.

## The decision

- **Minecraft is the host world, in full 3D.** We keep Pokécraft's Minecraft half: MinecraftOSS worldgen in wasm, the three.js renderer, the player, survival, items, crafting and the touch controls.
- **Duke Nukem 3D is the guest, by its rules, not its maps or renderer.**
  - Its enemies and items run on **Duke's own 1996 CON scripts** (`GAME.CON`, `DEFS.CON` and `USER.CON` from the free shareware GRP), executed by a CON VM.
  - The **host answers the VM's questions from Minecraft blocks**: can it see the player, how far is the player, is it near a wall, is a bullet near.
  - The **host carries out the VM's orders in Minecraft**: move, shoot, spawn, `hitradius` explosions, sounds.
- **Duke's actors are drawn as Duke drew them in 1996:** sprites that always face the camera, using the GRP's own art and rotation frames, standing in a 3D block world. It's the authentic look, and it's cheap on phones.

This is the libsm64 / RL-core pattern from MERGE_EXAMPLES.md: the guest's real rules, with the host providing geometry queries.

## Pieces

| Piece | Source | State |
|---|---|---|
| CON VM | DukeNukemRust @ b4811d6, `src/scripting/{lexer,compiler,vm,physics,types}.rs` plus `net/rng.rs`, lifted into a standalone crate (`con/`) with no Bevy. It needed only its Bevy imports dropped | **Done (scratch):** builds native and for wasm32. Compiles the real shareware GAME.CON: 10,765 words, 119 scripted actors, 153 actions, 61 moves, 68 ais. LIZTROOP, PIGCOP, LIZMAN, OCTABRAIN, COMMANDER, DRONE, BOSS1 and EGG all have scripts. GREENSLIME and RECON have none, as in the original, where they're C code |
| Duke data | shareware `3dduke13.zip` from archive.org: `DUKE3D.GRP` (11 MB, with TILES*.ART, PALETTE.DAT and the sounds) | Fetched at build time |
| Art | TILES*.ART plus PALETTE.DAT → a sprite atlas of the tiles we use (enemies with their 5 or 8 rotations, items, the HUD weapons) | To do |
| Minecraft half | `pokecraft/web` modules, imported, not copied | To do |
| Weapons | The player's weapons live in Duke's C code, not CON. Pistol first, then the shotgun and pipebomb, with real damage values from the CON defines | To do |

## Merge points (the merge test)

- **Q2, host feeds guest:** CON's `ifcansee` is a voxel ray through Minecraft blocks, so enemies can't see you through stone. `ifawayfromwall` and floor and ceiling come from blocks.
- **Q4, AI notices the other game:** Duke's aliens and Minecraft's monsters are both hostile. Zombies don't attack aliens and aliens don't attack zombies at first; maybe later they fight.
- **Q5/Q7, guest verbs, host consequences:** `hitradius` (RPG, pipebomb, exploding barrels) breaks blocks by blast strength, as creepers do. Freezer and shrinker work on Minecraft mobs.
- **Q8, economies:** Duke pickups (ammo, medkits, armour) drop from aliens as the CON scripts say. Ammo is craftable from Minecraft materials (gunpowder + iron → pistol clips).
- **Q11, global rule:** aliens land at night, as Minecraft's monsters spawn at night.

## First slice

1. Bundle the CON VM as wasm with a tiny API: `spawn(picnum, x, y, z)`, `tick(sensing[]) → actors[] + events[]`.
2. A Trooper (LIZTROOP) and a Pig Cop in the Minecraft world: Duke sprites, running the CON AI, shooting, dying, and dropping what the CON says.
3. A pistol with Duke's HUD art.
4. A phone test, published so the user can check frame rate.
