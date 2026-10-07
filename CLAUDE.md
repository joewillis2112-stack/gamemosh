# CLAUDE.md

**Before starting any task in this repo, read [RESEARCH.md](RESEARCH.md).** It's the working log, covering:
- the working agreement with the user
- past mistakes and how to avoid them
- what has been learned about game mashups
- technical lessons from building Gloamreach
- ways of working that held up
- open questions and a session log

When a task goes sideways, check RESEARCH.md for a lesson that already covers it. At the end of a task, add what you learned there, plus a line to the session log.

The rules that matter most (details in RESEARCH.md §1):
- Put deliverables on `main`. If you're unsure whether to commit to `main` or to a branch, ask once at the start. When the user says "merge", merge.
- Don't watch PRs or schedule check-ins unless asked. If an auto-subscription appears, unsubscribe.
- Write notes, findings and long summaries to files. Keep chat replies short.
- No legal caveats. These are personal, never-distributed projects.
- Be terse, say "I don't know" rather than guess, and verify agent claims before reporting them.

Layout:
- `src/`: the Gloamreach game
- `tests/`: Playwright suites
- `tools/build.mjs`: single-file HTML build
- `gamecorner/`: Game Corner Arcade, the first attempt, a game-in-game rather than a true mosh (Pokémon Red + PICO-8 cabinets). See its README; build with `gamecorner/build.sh`
- `pokecraft/`: Pokécraft, Pokémon Red in an endless first-person Minecraft world, Pixelmon-style (MinecraftOSS worldgen + open-pokered + three.js). See its README; build with `pokecraft/build.sh`
- `dukecraft/`: Dukecraft, Duke Nukem 3D in Minecraft (Duke's own CON scripts run its aliens in Pokécraft's Minecraft world). See its README and PLAN.md; build with `dukecraft/build.sh`
- `dukequake/`: Duke × Quake, one engine running both games' own rules. Phase 1 done: id's Quake server ported to Rust, bit-exact against id's C (`dukequake/oracle/run.sh`). See its README and PLAN.md
- `mashup-research/`: verified game and rewrite research, in rounds
- `GAMEMOSH_BRIEF.md`: early research
