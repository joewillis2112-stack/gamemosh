# Gamemosh brief

Research date: 2026-09-30. Two parts: **Part A** is written to be handed to Opus 5.5 as-is. **Part B** is what the human has to prepare. Part C lists what I could not verify.

---

## Part A — Brief for Opus 5.5: "gamemoshing" in Rust

### A0. What this is (and isn't)
"Merging games" (people also call it "gamemoshing"; same thing) = one Rust engine hosts content and mechanics from several games at once. The reference project is **chasmlol/2010-rust-rewrite-mashup** (MW2 + Skate 3 + Minecraft in one game). Its README and v0.1.0 release credit Claude Opus 5.5 as co-author.

It is **not** file-swapping between original binaries. It works because:
1. Someone already rewrote each game's runtime in Rust (open code, no assets).
2. The rewrites load data from a copy of the game the user owns.
3. A glue layer connects them.

If a Rust rewrite of a target game doesn't exist, that game's cost jumps by orders of magnitude (full reverse engineering). Check this first (A2).

### A1. Reference project — verified facts
Source: repo README, releases v0.1.0 / v0.3.0, makeuseof article. Repo: `github.com/chasmlol/2010-rust-rewrite-mashup` (default branch `main`, Apache-2.0).

- **Host engine:** IW4L — MW2 runtime written from scratch in Rust on **Bevy + wgpu** (`github.com/vladtrc/iw4L`, Apache-2.0, by vladtrc). Loads FastFiles, IWi textures, xmodel geometry, BSP maps, GSC scripts. Retail D3D9 SM3 shader tokens are translated to WGSL (no DirectX at runtime). MW3/Black Ops data converts into a shared `asset_iw4` intermediate representation. Sim uses a fixed 17 ms timestep with the pipeline `TickInput → sim::step → Snapshot`, reused for server, prediction, and replay. P2P UDP netcode, IW4L clients only.
- **Skate 3 layer:** based on **SK8-ENGINE/skate-3-rust-engine** (Rust + Bevy, reverse-engineered; Windows + MSVC + LLVM to build; needs XInput controller; tricks, grinds, offboard movement, `.skate` maps). Mashup pins a specific commit (cb79689 at v0.1.0). Uses "Skate 3's own physics, animation and grind code", not a reimplementation of the feel. Lives in `skate/` in the mashup repo.
  - Asset step: user points at Skate 3 **Xbox 360** `default.xex` (or ISO) with its data folder; a **custom converter extracts only skating-related data**. No game files ship.
  - Toggle: J key / click both sticks. Grind rails are **generated from map collision**.
- **Minecraft layer:** **MinecraftOSS** vendored at `third_party/minecraftoss/` (Rust). Generates a real endless world for Minecraft "26.3". Files (~125 MB textures/sounds/world data) are **downloaded from Mojang's official servers on first launch**, same as the launcher does. Nothing redistributed.
- **Glue behaviors (this is the actual "merge"):**
  - Minecraft block collision works under Skate 3 physics.
  - Block destruction damage is scaled from MW2 gun stats.
  - Minecraft lighting affects MW2 gun models; minimap shows MC terrain.
  - Minecraft inventory is restyled as MW2 UI.
  - One unified input layer: rebindable, 5 MW2 layouts, controller aim assist, vibration, response curves.
- **Layout:** Cargo workspace: `crates/`, `xtask/`, `skate/`, `third_party/minecraftoss/`, `docs/` (BUILD.md, SKATE.md, WINDOWS.md), `scripts/`, `Makefile`, `rust-toolchain.toml` (pinned), `.env.example`, `NOTICE`, `clippy.toml`, `rustfmt.toml`, `AGENT.md`, `CONTEXT.md`.
- **Build (Linux/mac per docs/BUILD.md):** rustup (toolchain pinned by `rust-toolchain.toml`) + C toolchain + Bevy system libs (X11, Wayland, ALSA, udev, xkbcommon on Debian: `g++ pkg-config libx11-dev libasound2-dev libudev-dev libwayland-dev libxkbcommon-dev`). Copy `.env.example`, set `IW4L_GAMES` to the game data dir, run `make map mp_boneyard`. MW2 data = Windows Steam depot, e.g. `steamcmd +@sSteamCmdForcePlatformType windows +force_install_dir ~/Games/MW2 +login <user> +app_update 10190 +quit`.
- **Known bugs the author shipped with:** bodies pile up if you die in skate mode; skateboard invisible on some maps; MC block edges lacked grind rails (a fork PR "block edges become grind rails" exists).
- **Author's stated limit:** AI "couldn't really judge whether the gameplay and visuals felt right." Feel, visuals, and game-feel were judged by the human.

### A2. Pipeline pattern to copy
1. **Pick a host engine** with the most complete open Rust runtime and a clean sim/render split. Everything else plugs into it.
2. **Per guest game, prefer an existing Rust reimplementation.** Vendor it (pin the commit) instead of forking freely. Candidates seen: IW4L, SK8-ENGINE/skate-3-rust-engine, MinecraftOSS. Other Rust Minecraft projects seen in search (not evaluated): FerrumC, Feather, Oxide.
3. **Asset intake = first-run extractor, never bundled.** Ask the user for their game folder/ISO, run a converter that outputs only what's needed, into a local cache. Auto-download only where the vendor serves the files publicly (Minecraft via Mojang). Add the cache dir and all game data to `.gitignore`.
4. **Normalize into one intermediate representation** (IW4L's `asset_iw4` is the precedent) so meshes/textures/anims/collision from different games render in one pass.
5. **Glue layer = bridges, each with one job:** input, camera, character controller/physics ownership, collision-world sharing, damage/stat translation, lighting/render sharing, UI skin, audio mixing. Build one bridge at a time, gate each behind a mode/flag so it can't break the host.
6. **Mode switching over hard fusion.** Skate mode is a toggle on the MW2 player, not a rewrite of the MW2 player.
7. **Keep sim deterministic** (fixed timestep) so a foreign physics system can be stepped inside the host tick.
8. **Unit-scale, coordinate-handedness, and axis conventions** differ per game. Write these conversions once in a shared crate and test them; this is the most common source of "everything is sideways/giant/mirrored".

### A3. Workflow rules worth copying (from the repo's AGENT.md / CONTEXT.md)
- Cross-session memory lives in files: `context/` folder with `artifacts/` (dated task journals `YYYY-MM-DD-<slug>`, numbered iterations), `externals/` (reference clones), agent clones. "Knowledge that is not in an artifact does not exist for the next agent."
- Iteration suffixes say whose move it is: `-FINAL` (done), `-PART` (agent should continue), `-READY` (waiting on human decision).
- Delete probe code/debug/temporary tests before shipping; keep the *evidence* (logs, measurements) in the artifact.
- Public-repo hygiene: no research bases, DB dumps, third-party checkouts, or work journals in published history. No retail offsets/hardcoded addresses in code. No decompiler placeholder names (`FUN_…`, `DAT_…`). `make publish-check` greps for these shapes.
- Credits and reverse-engineering acknowledgments go in `README.md` and `NOTICE`.

### A4. Suggested plan for Opus (my recommendation, not sourced)
1. Confirm the chosen game pair and that each has a Rust runtime; if not, stop and report cost.
2. Clone hosts into `context/externals/`; read their build docs; get each **building and running standalone** before touching integration.
3. Write `AGENT.md`, `CONTEXT.md`, `.env.example`, `.gitignore` (game data, caches), `NOTICE`, `Makefile` targets, `publish-check` first.
4. Build the extractor/first-run flow for guest game #1; verify by rendering one mesh in the host.
5. Add the bridges one at a time (input → camera/controller → collision → render/lighting → UI → damage/stats). After each, write a `-READY` artifact describing exactly what the human should playtest.
6. Keep a "human playtest" gate: Opus cannot judge feel or visuals. Ask for screenshots/clips/feedback; don't self-certify visuals.
7. Log known bugs in the README like the reference project does.

### A5. Environment constraints Opus should assume
- Windows-tested upstreams (skate engine needs MSVC + LLVM); Linux/macOS support exists but is experimental for skate.
- Rendering needs a GPU. A headless cloud container can compile and run unit tests but cannot verify visuals or gameplay. Do the run/verify loop on the user's machine.
- No game data in the repo or container unless the user places it there.

---

## Part B — What the human needs to prepare

**Decisions (only you can make these):**
- [ ] Which games? (Each needs a Rust runtime; check A2. If you want games beyond MW2/Skate 3/Minecraft, say which and I/Opus can check whether one exists.)
- [ ] Which one is the host?
- [ ] What "merge" means to you: assets only (models/maps swapped), mechanics (one game's movement in another's world), or both.
- [ ] Private toy or public release? This changes the legal posture (below).

**Game copies (must be yours):**
- [ ] MW2 via Steam (the depot the reference project tested; app id 10190). Needs a Steam account that owns it + `steamcmd`.
- [ ] Skate 3 as an **Xbox 360 ISO or extracted folder containing `default.xex`** from your own disc. Ripping a 360 disc generally needs a modded console/drive; legality varies by country. Not legal advice.
- [ ] Minecraft: nothing to buy for the reference approach; it downloads from Mojang. Whether that fits Mojang's terms for your use is your call.
- [ ] Any other game: know its file format situation before committing.

**Hardware / machine:**
- [ ] A **Windows** PC with a real GPU (the reference is Windows-tested; Skate engine builds on Windows).
- [ ] An **XInput controller** (Skate engine needs one; the mashup has keyboard fallback for skate mode, but controller is the intended feel).
- [ ] Free disk: unknown exact total; MC alone is ~125 MB, plus MW2 depot and Skate 3 ISO (multi-GB). Budget tens of GB.

**Software:**
- [ ] Git, `rustup` (version is pinned by the repo's `rust-toolchain.toml`).
- [ ] Windows: Visual Studio Build Tools (MSVC) + **LLVM in its default install path**.
- [ ] `make` (or run the `xtask` equivalents), `steamcmd`, `curl`.
- [ ] Linux/mac alternative: system libs listed in A1.

**Does it have to be desktop?** Split it in two:
- *Writing code / planning / docs:* no. Claude Code on the web (or phone) can do this from anywhere.
- *Building, running, verifying:* yes, some real machine. Needs a GPU, your game files, and (for the Skate 3 side) Windows + MSVC + LLVM. Phones/tablets can't run it. Options: your own PC; a rented Windows GPU cloud PC you remote into from any device (you'd have to upload game files there); IW4L alone also builds on Linux/macOS, and skate-3-rust-engine has experimental Linux/macOS support via PRs, so a non-Windows box may work but is less proven. A cloud Claude container has no GPU and no game files; software rendering might get screenshots but I haven't tested it and it would be slow.
- Practical hybrid: Opus works from the cloud or phone, you run/playtest on the PC and paste back results.

**Where to run Claude Code:**
- [ ] Run it **locally on the PC with the games**, not in this cloud container. The container has no GPU and no game files, so Opus can't verify anything visual there. Cloud is fine for writing code and docs.

**Repo setup:**
- [ ] Fork/vendor the upstreams so their commits are pinned (IW4L, skate-3-rust-engine, MinecraftOSS).
- [ ] Make sure `IW4L_GAMES` (or your equivalent) points at the game dir; keep game data **outside** the repo.
- [ ] `.gitignore` for game data and caches from day one.

**Because of your memory/executive-function setup:**
- [ ] Use the file-based memory system in A3 (`context/` artifacts + suffixes). Your job then is just to read the newest `-READY` file and answer it. That matches how the reference project keeps agents from losing state.
- [ ] Set up one short "how to run the game" note so you can restart the loop after a break.

**Legal / risk (not legal advice):**
- Reference project avoids shipping any game assets and only reads the user's own copies. That is the pattern to copy; it reduces but does not eliminate risk.
- Don't put trademarked names in your product name if it's public.
- Related: Facepunch's COO publicly demanded that Delta Force's devs remove a plastic-explosive model that appeared to come from Rust (the game). That's asset copying, not this method, but it shows studios do watch and respond publicly.

**Budget:**
- Expect heavy token use. Opus-class work on multi-crate Rust plus reverse engineering burns through usage quickly; check your plan limits before starting.

---

## Part C — What I couldn't verify
- I found **one** prominent project (plus forks: vmpprotect, johnseth97, MayKosiba, whosstyler, etc.) and a single press article calling it a trend. Forks aren't proof of a broad movement; "gamemosh" is just the community's nickname for it and doesn't surface as a term in search.
- I did not read the crate source or `SKATE.md`. Opus should read `SKATE.md`, `BUILD.md`, and the code directly from the upstream rebuilds (IW4L, skate-3-rust-engine, MinecraftOSS) after cloning them, rather than trusting this brief's second-hand summary. Details of how Skate 3 data is converted and how the physics hooks into the IW4L player are inferred from release notes only.
- Exact Xbox 360 formats parsed, exact crate names, and total disk footprint are unknown.
- The "Minecraft 26.3" version naming is quoted from the README; I didn't check it against Mojang's current numbering.
- The X post by Aakash Gupta returned HTTP 402; not read.
- Legal status with EA / Activision / Microsoft: no information found either way.

## Sources
- https://github.com/chasmlol/2010-rust-rewrite-mashup
- https://github.com/chasmlol/2010-rust-rewrite-mashup/releases/tag/v0.3.0
- https://github.com/chasmlol/iw4l-skate/releases/tag/v0.1.0
- https://github.com/vladtrc/iw4L
- https://github.com/SK8-ENGINE/skate-3-rust-engine
- https://www.makeuseof.com/rust-game-mashup-brings-mw2-gunplay-into-minecraft-while-doing-skate-3-tricks/
- https://raw.githubusercontent.com/chasmlol/2010-rust-rewrite-mashup/main/AGENT.md
- https://raw.githubusercontent.com/chasmlol/2010-rust-rewrite-mashup/main/CONTEXT.md
- https://raw.githubusercontent.com/chasmlol/2010-rust-rewrite-mashup/main/docs/BUILD.md
- https://www.pcgamer.com/games/fps/delta-force-devs-apologise-after-facepunch-studios-exec-accuses-them-of-stealing-assets-from-rust-if-you-wanted-to-collab-you-should-have-reached-out/
