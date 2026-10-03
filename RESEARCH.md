# RESEARCH

A working log for this repo. It records common themes, what has been learned, mistakes and corrections, and ways of working that have held up.

**Read this before starting a task here.** When a task goes sideways, come back and check whether a lesson below already covered it. Add new entries under the right heading, and add a line to the session log at the bottom.

---

## 1. Working agreement with the user

- **Style:** terse. No padding, hedging or performative summaries. Say "I don't know" rather than guess. Call out mistakes, including the user's, but check facts before correcting.
- **The user can't code.** They work entirely through agents. Deliverables must land somewhere they can see, which means `main` on GitHub, not a side branch.
- **Branches and PRs:** this environment creates a `claude/...` branch, opens a draft PR and auto-subscribes to PR activity. The user doesn't want PRs watched or hourly check-ins. If an auto-subscription appears, unsubscribe and don't schedule `send_later`. When the user says "merge", merge it. If unsure whether work should go straight to `main`, ask once at the start.
- **Notes go in files, not chat.** Put findings, notes and long summaries in repo files (this one, `mashup-research/`). Keep chat replies to what changed and where.
- **No legal caveats.** These are personal, never-distributed projects. Only mention licences where they change how files are obtained (for example, "needs your own copy").
- **Sub-agents:** use them when asked, and match the shape asked for (for example, one to find and verify, one to filter). Don't spawn them otherwise.
- **Phone matters.** The user plays on mobile. Prefer WebAssembly/browser builds and touch controls.
- **Write-once, extend-forever.** Prefer structures that grow, such as numbered rounds and appendable files, over rebuilds.

## 2. Mistakes and corrections (don't repeat these)

| # | What happened | Why it was wrong | Do instead |
|---|---|---|---|
| 1 | After the game shipped, I ran ~30 hourly "check the PR" turns over a day with nothing changing | The user never asked for it. It was an environment default I followed without saying so, and it burned usage | State the default up front, and stop after the first idle check. Now: never watch PRs unless asked |
| 2 | The game existed only on `claude/...`, so the user saw an empty `main` and thought nothing was done | I didn't explain where the work lived | Say where deliverables are in plain words, and offer to merge |
| 3 | I kept adding legal caveats after the user said they didn't matter | Ignored stated context | Drop the topic the first time the user waves it off |
| 4 | Infinity Blade IPA extraction plan: started down a path the user then abandoned as "gonna spiral" | Didn't flag the walls before starting | For open-ended asset or RE work, name the likely blockers before doing anything |
| 5 | Round 1 research agent: listed Iron Doom as a full port and DukeNukemRust as complete, and missed skate-3-rust-engine | Agents over-trust READMEs | Always run a second filter/verify pass, and spot-check surprising claims myself (commit counts, dates, co-author trailers) |
| 6 | Round 2 agent marked vange-rs "AI-written: yes" from 133 Claude-authored commits, but the project is from 2016 | "Has AI commits" is not "AI-written" | Report the AI share and the project start date. Count commits, not trailers (one commit can carry several) |

## 3. Domain knowledge: game mashups

**What a mashup actually is**
- The reference project (chasmlol/2010-rust-rewrite-mashup) joins three independent Rust rewrites: IW4L (MW2), skate-3-rust-engine and MinecraftOSS.
- No game assets are in the repo. They're read from the user's own install, extracted from their own disc, or downloaded from the official servers.
- "Needs the game installed" means "reads its files". The original game never runs.

**Where the work really is**
- AI agents can rewrite a game in weeks: IW4L took ~3 weeks of public history and Skate 3 ~4 weeks, both credited to Claude.
- But they build on years of human reverse-engineering (the Skate 3 README says so). Access to the files is never the bottleneck; documentation is.

**How hard a game is to rebuild, easiest first**
1. A Rust runtime already exists (Ruffle for Flash, PICO-8 players, Iron Wolf and others).
2. Official source release or full decompilation.
3. Engines that ship readable game code: LÖVE (Lua), PICO-8, C#/XNA/FNA/Unity Mono (decompiles with ILSpy), Godot (GDRE), RPG Maker (Ruby/JS), Ren'Py, Scratch. *(Added in round 2; see `mashup-research/`.)*
4. Well-documented formats with community servers or tools.
5. Raw reverse-engineering. Avoid.

**What makes pieces easy to combine**
- **Same engine version.** IW4L, star-andreas (GTA SA) and Davenstein (Wolf3D) all run on Bevy 0.19 / wgpu 29, so they can be added to one app.
- **Framebuffer games.** Ones that draw to a 320×200 buffer (Iron Wolf, SDLPoP-rs) are trivial to switch between.
- **Same shape.** One game supplies the world, the other the character.

**Phone path**
- Build to wasm and play in the browser.
- Already working there: Iron Wolf, open-pokered (with touch), SDLPoP-rs, Ruffle, chromatron-oxide, Another World Suite.

**Flash**
- Ruffle runs any SWF, so mashing a Flash game in means bridging it, not rebuilding it.
- `ExternalInterface` passes calls between the SWF and your code. JPEXS decompiles SWFs.

**Running readable code from Rust (round 2)**
- Only possible today for PICO-8 (pico-r, wasm, phone-ready), LÖVE (balatro-port-tui, desktop/terminal only; its C Lua blocks wasm) and Flash (Ruffle).
- For Godot, Unity, XNA/FNA, Ren'Py, RPG Maker and Scratch there's no usable Rust runtime. Port their code instead of trying to run it.
- C# games reach the browser through .NET wasm (celeste-wasm, terraria-wasm), not Rust.

**Making candidates, not just finding them**
- vgrichina/re-skill is a Claude Code skill: ROM → annotated disassembly → web port. It produced a Battle City port.
- Small NES, Game Boy and DOS games can be turned into rebuild candidates this way.

**Recompilation (N64Recomp, XenonRecomp)**
- These turn console binaries into machine-generated C/C++. That's useful for running a game natively, but hard to read and port. All are C/C++; none are Rust or wasm so far.

## 4. Technical lessons from building Gloamreach (`src/`)

- **Three.js r186:** set `ColorManagement.enabled = false` first (`src/colorsetup.js`), use Linear output and no tone mapping, and multiply light intensities by π. Otherwise the scene renders far too dark.
- **Rapier:** never mutate bodies inside query callbacks. Collect the hits first, then act.
- **Fixed-step input:** clear `pressed` only when at least one physics step ran, and consume menu keys before stepping. Otherwise inputs get dropped at high frame rates.
- **Streaming:** the title camera and the loader both requesting chunks caused a hang. Have a single owner per system.
- **Headless Chromium (swiftshader) runs at ~4 fps.** Wait on game time (`state.stats.playTime`), not wall time. Write background test runs to log files, because output is lost on timeout.
- **Shell:** `pkill -f <pattern>` can kill its own shell.

## 5. Ways to work that held up

**Research pipeline**
1. Discover (my own searches, or an agent).
2. Verify (an agent clones every repo).
3. Filter (a second agent ranks the results and re-verifies the top picks).
4. Spot-check surprising claims myself.
5. Write the results to the repo, then merge.

**Verification tools**
- `git ls-remote <url> HEAD` for existence.
- `git clone --bare --filter=blob:none` then `git log` for dates, commit counts and `Co-Authored-By` trailers.
- `gh api` only works for repos in this session's scope.
- If WebFetch gets a 403, try curl.

**Game QA**
- Scripted Playwright suites (smoke, mobile, combat, flow), then one gametest agent doing a full playthrough, then fix everything it finds.

**Deliverables**
- Single-file HTML builds (esbuild with WASM inlined) run anywhere, including claude.ai artifacts.
- Whether WASM runs inside the artifact sandbox on a phone is still unverified.

## 6. Open questions

- Does Gloamreach run at a playable frame rate on the user's actual phone, and does Rapier's WASM load inside the claude.ai artifact on mobile?
- MinecraftOSS has no public repo. Where does it come from (mashup issue #21)?
- Which pairing, if any, should be built first? The cheapest phone-ready options are P9 (Wolf Arcade: Iron Wolf + pico-r), P10 (Battle Chip) and round 1's P2 (Pokémon Game Corner + Ruffle).
- pico-r has no touch pad. A phone build needs an on-screen d-pad overlay.

## 7. Session log

- **2026-09-29 → 30:** wrote GAMEMOSH_BRIEF.md. Mobile mashup discussion; the Infinity Blade route was abandoned. Built Gloamreach (seeded dark-fantasy RPG, mobile, Three.js + Rapier). QA agent playthrough; all findings fixed.
- **2026-10-01:** spent a day running idle PR check-ins (mistake #1). The user stopped it. Merged PR #1.
- **2026-10-03:** read chasmlol/2010-rust-rewrite-mashup. Research round 1 (research agent, then filter agent) produced `mashup-research/` (PR #2, merged). Created this file. Research round 2: I gathered leads with web searches, then a sub-agent verified and filtered them (14 Rust additions, 12 rebuildable games, 5 pairings). Results are in `mashup-research/VERIFIED_ROUND2.md`. My spot checks qualified the vange-rs and Legaia authorship claims.
