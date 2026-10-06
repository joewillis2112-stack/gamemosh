# Dukecraft

Duke Nukem 3D in an endless Minecraft world, in a phone browser. `dist/index.html` is the whole game in one file (12.8 MB).

- **Minecraft is the world.** Minecraft's own generator (MinecraftOSS) makes the land; you mine, craft, build, eat and sleep by Minecraft's rules, and Minecraft's monsters come out at night. This half is Pokécraft's, imported from `pokecraft/web`.
- **Duke Nukem 3D's aliens land in it at night**, run by **Duke's own 1996 CON scripts**: the shareware `GAME.CON`, `DEFS.CON` and `USER.CON`, executed by a CON VM, with Duke's own `move()` and `alterang()` ported from the original C.
  - Assault Troopers, Pig Cops, Enforcers and Octabrains walk, seek you, back off when close, shoot, take hits, die and gib exactly as their scripts say.
  - They're drawn as Duke drew them: sprites from Duke's own ART files, picked from 5 view angles, with Duke's palette swaps (troopers' green armour is palette 22).
  - Duke's sounds play from Duke's own VOC files.
- **Where the two games meet:**
  - The scripts' questions are answered from Minecraft's blocks. *Can I see the player?* is a ray through blocks, so stone hides you and glass doesn't. *How far to the wall ahead?* and *where are the floor and ceiling?* come from blocks too.
  - Duke's damage hits your Minecraft hearts (Duke's 100 HP is 20 half-hearts). Duke's medkits heal them.
  - Duke's pistol, ammo and medkits are items in your Minecraft inventory and hotbar. Pistol rounds are crafted from 1 iron ingot + 1 gunpowder. Ammo boxes the scripts hand out land in your bag.
  - Duke's explosions (`hitradius`: RPGs, pipebombs, barrels) break blocks, like a creeper. Pistol bullets shatter glass.
  - Duke's bullets hurt Minecraft's monsters, and Minecraft swords hurt Duke's aliens.

## Controls

| | Phone | Keyboard / mouse |
|---|---|---|
| Walk | left thumb | WASD (Shift sprints) |
| Look | drag on the right | mouse |
| Fire (pistol in hand) | tap or hold on the right | click |
| Use / place / craft at a table | tap on the right | right-click or F |
| Mine / attack / eat | hold on the right | hold click |
| Bag and crafting | BAG, or ••• on the hotbar | E |
| Hotbar | tap a slot | 1–9, wheel |
| Jump / sneak | JUMP / SNEAK | Space / C |

## Build

```sh
npm install                        # at the repo root
dukecraft/build.sh                 # builds the Minecraft half (pokecraft/build.sh) if needed,
                                   # fetches the 1996 shareware from archive.org, builds the
                                   # CON VM (Rust → wasm), bundles dist/index.html
node dukecraft/tests/smoke.mjs     # headless phone: world, aliens on their scripts, the pistol
                                   # kills one, a blast breaks blocks, aliens land at night
```

## Files

| Path | What |
|---|---|
| `con/` | Duke's CON VM (lexer, compiler, interpreter), lifted from [DukeNukemRust](https://github.com/NicholasMeacoe/DukeNukemRust) @ b4811d6 with no engine |
| `conwasm/` | The VM behind a small C ABI for the page (`con_spawn`, `con_sense`, `con_damage`, `con_tick`, `con_actors`, `con_events`), plus Duke's `move()`/`alterang()` ported from the 1996 source (JFDuke3D `gamedef.c`). One import: `host_hits` (Build's `hits()`, answered from blocks) |
| `web/duke.js` | The host: sensing from blocks, block collision, enemy fire, blasts, drawing actors with Duke's view angles |
| `web/art.js`, `web/sound.js` | GRP, ART, PALETTE.DAT, LOOKUP.DAT and VOC readers |
| `web/main.js` | The game: Pokécraft's Minecraft half without the Pokémon, plus Duke's weapons and night landings |
| `tools/dukepak.mjs` | Packs the art, scripts and sounds from DUKE3D.GRP into a smaller gzipped GRP |
| `PLAN.md` | The design and the merge points |
