# Handoff (2026-10-11, fourth session)

For a new session picking up Claude Studio. Read CLAUDE.md and RESEARCH.md first (as always), then this.

## Where things stand

- **The editor (Phase 2) is being built by the other session (session_01UMTQXhLsBemuvNJgbY5PGW), 2026-10-12.** `web/editor.html`, `web/editor/`, PLAN.md "Phase 2, 2026-10-12". Pull before touching those files.

- **Rendering range (task 56):** done. PLAN.md, "Rendering range".
- **Character maker, stage 1 (2D reference → blocky):** done and tested. `web/maker.html`, `web/runtime/charmaker.js`.
- **Character maker, stage 2 (generated model → rigged character):** rigging done and tested; realistic generation works through free Hugging Face Spaces plus a CPU texturer (known defects: blotchy back, hip flaps). `web/runtime/rigmesh.js`, `tools/stage2/` (its README has the routes, setup and how the fit works), PLAN.md "Stage 2 built".
- **Terrain (Roblox's smooth terrain, its Fill API, the Terrain Editor's brushes):** done 2026-10-12. PLAN.md, "Terrain (2026-10-12)".
- **Animation (Animate mode, Roblox's animation API, rigs):** done 2026-10-12. PLAN.md, "Animate (2026-10-12)"; sources in INCORPORATE.md.
- **Mesh editing (task 57):** done another way, 2026-10-12: 3DOO's open rebuild of Blender's BMesh kernel incorporated (`web/modeling/`), with the editor's Edit Mode. No permission rule needed. PLAN.md, "Mesh editing, done another way".

## Stage 2: what's next

Done this session: the token works (HF user Jwilly21, read); the realistic route runs end to end (`tools/stage2/mesh_hf.py`, README "Routes"); example `tools/stage2/examples/realistic-adventurer.glb`.

1. **Quota.** A free account gets about 4 min of ZeroGPU a day; this session spent it (resets ~24 h after 07:50 UTC, 2026-10-11). One Kontext edit + one Hunyuan shape fit in a day with a retry spare.
2. **Multi-view run: done (2026-10-20).** Back fixed; the example is the new mesh. Left: a join down the sides (try `--views back,left,right`, two more Kontext calls) and skin flecks at the hips.  The hip flap is fixed on CPU (2026-10-11, fourth session): below the crotch, arm-column vertices go to whichever of arm or leg is nearer along the surface. It costs a thin ring at the bottom of a hand fused to the thigh, which now moves with the leg. A back view also helps both: ask Kontext for the same person from behind and feed front + back to Hunyuan's multi-view inputs (`mv_image_front`, `mv_image_back`); paint the back from that photo instead of borrowing. Costs one more Kontext call per character.
3. Try the other four fixtures (female-person, robot, zombie, soldier) through the route; the robot will test whether "a real person" is the right prompt for non-humans (likely not: let the prompt depend on the subject).
4. The maker page: offer the realistic route from the phone (it needs the token server-side; or keep it as a CLI and load the `.glb`).
5. LODs.
7. The `gui` (desktop, phone) and `leaderstats` goldens fail in a fresh container on the commit before this session too (0.66% and 0.21% of pixels; text rendering, I think). Not caused by stage 2; not re-saved. Look at the diffs before deciding.
6. `tools/turntable.mjs --zoom` seemed to have no effect on this mesh (frames it whole regardless); not looked into.

## Tools: checked 2026-10-11 (fourth session)

All verified working in this container:

| Tool | Status |
|---|---|
| rehan-remade/universal-modder | public: the git proxy serves it with no attach (`add_repo` says so). Clone at `/home/user/rehan-remade/universal-modder`; `bin/um --help` works (uv makes its venv). Its skills are already in `.claude/skills`. |
| `npm ci` (root and `claudestudio/`) | ok; preinstalled Chromium at `/opt/pw-browsers/chromium` |
| emsdk + Luau wasm (`luau/build.sh`) | ok, emsdk cached in `build/emsdk`. The rebuilt `web/luau.mjs` differs from the committed one (newer emscripten): the committed file was kept. Rebuild only when the binding changes, and run `npm test` after. |
| `.cache/hf-venv` (gradio_client, pillow, trimesh, rembg) | ok; `HF_TOKEN` valid (read) |
| bpy 4.2.0 | ok: `bash tools/blender-build.sh oracle` prints Blender 4.2.0; a Cycles CPU render works. The venv lives at the repo root's `.cache/bpy-venv`; `claudestudio/.cache/bpy-venv` is a symlink to it (the script expects the latter). |
| Stage 2 CPU setup (TripoSR) | ok after two README fixes: `rembg[cpu]` was missing (TripoSR imports it), and `accelerate` must be 0.24.1 (`transformers` 4.35's `tokenizers` caps huggingface-hub at 0.17). `make.sh` runs end to end. |
| Roblox docs as Markdown | ok (`.../classes/PointLight.md`, `.../enums/Material.md`) |
| rbx-dom | ok: `raw.githubusercontent.com/rojo-rbx/rbx-dom/master/rbx_reflection_database/database.msgpack` |
| Khronos fidelity (`tools/fetch-fidelity.sh`) | ok: 84 models, goldens |
| Blender source (`tools/blender-build.sh fetch`) | ok: v4.2.0 in `claudestudio/.cache/blender-src`. The `dna`/`native` steps are still blocked on the permission rule below. |
| Harness | `tools/play.mjs`, goldens, `tools/test-play.sh`: ok. `gui` and `leaderstats` goldens fail on a fresh container (item 7 below). |
| WebSearch, WebFetch, Google Drive | ok |
| ZeroGPU quota | spent for today; resets about 07:50 UTC on 2026-10-12 |

## Mesh editing

No longer blocked: the compile-Blender plan was dropped for 3DOO's kernel (see PLAN.md). `tools/blender-build.sh` stays only as a way to check against real Blender, and isn't needed.

## Setup in a fresh container

- `npm ci` in `claudestudio/` (the repo root has its own `package.json` for Gloamreach, and `npm ci` there too: the tools import `../../node_modules/playwright-core`).
- Stage 2's Python side: `tools/stage2/README.md`, "Setup" (realistic route: a small venv; CPU route: ~7 GB of models in `.cache/hf`).

## The user, lately

- Wants range, not a Roblox clone. Quality control both graphical and mechanical, proved by tests that are themselves mutation-checked.
- Decisions about how to build are mine; don't ask for approval of order or approach.
- No paid services.
- Keep replies short. Long notes go in files.
- Never ask for a token in chat. One was pasted once and the user was told to revoke it.
