# Handoff (2026-10-11, third session)

For a new session picking up Claude Studio. Read CLAUDE.md and RESEARCH.md first (as always), then this.

## Where things stand

- **Rendering range (task 56):** done. PLAN.md, "Rendering range".
- **Character maker, stage 1 (2D reference → blocky):** done and tested. `web/maker.html`, `web/runtime/charmaker.js`.
- **Character maker, stage 2 (generated model → rigged character):** rigging done and tested; realistic generation works through free Hugging Face Spaces plus a CPU texturer (known defects: blotchy back, hip flaps). `web/runtime/rigmesh.js`, `tools/stage2/` (its README has the routes, setup and how the fit works), PLAN.md "Stage 2 built".
- **Mesh editing ported from Blender (task 57):** designed, half set up, blocked on a permission rule. PLAN.md, "Mesh editing, design".

## Stage 2: what's next

Done this session: the token works (HF user Jwilly21, read); the realistic route runs end to end (`tools/stage2/mesh_hf.py`, README "Routes"); example `tools/stage2/examples/realistic-adventurer.glb`.

1. **Quota.** A free account gets about 4 min of ZeroGPU a day; this session spent it (resets ~24 h after 07:50 UTC, 2026-10-11). One Kontext edit + one Hunyuan shape fit in a day with a retry spare.
2. **Fix the back** (blotchy) and the **hip flap** riding with each hand: ask Kontext for the same person from behind and feed front + back to Hunyuan's multi-view inputs (`mv_image_front`, `mv_image_back`); paint the back from that photo instead of borrowing. Costs one more Kontext call per character.
3. Try the other four fixtures (female-person, robot, zombie, soldier) through the route; the robot will test whether "a real person" is the right prompt for non-humans (likely not: let the prompt depend on the subject).
4. The maker page: offer the realistic route from the phone (it needs the token server-side; or keep it as a CLI and load the `.glb`).
5. LODs.
7. The `gui` (desktop, phone) and `leaderstats` goldens fail in a fresh container on the commit before this session too (0.66% and 0.21% of pixels; text rendering, I think). Not caused by stage 2; not re-saved. Look at the diffs before deciding.
6. `tools/turntable.mjs --zoom` seemed to have no effect on this mesh (frames it whole regardless); not looked into.

## Mesh editing: what's blocking

Unchanged. The auto-mode check refuses to run binaries built from Blender's downloaded source; it needs this in the repo's `.claude/settings.json` (still not there):

```json
{ "permissions": { "allow": ["Bash(bash tools/blender-build.sh:*)", "Bash(bash claudestudio/tools/blender-build.sh:*)"] } }
```

## Setup in a fresh container

- `npm ci` in `claudestudio/` (the repo root has its own `package.json` for Gloamreach, and `npm ci` there too: the tools import `../../node_modules/playwright-core`).
- Stage 2's Python side: `tools/stage2/README.md`, "Setup" (realistic route: a small venv; CPU route: ~7 GB of models in `.cache/hf`).

## The user, lately

- Wants range, not a Roblox clone. Quality control both graphical and mechanical, proved by tests that are themselves mutation-checked.
- Decisions about how to build are mine; don't ask for approval of order or approach.
- No paid services.
- Keep replies short. Long notes go in files.
- Never ask for a token in chat. One was pasted once and the user was told to revoke it.
