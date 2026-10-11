# Handoff (2026-10-11, second session)

For a new session picking up Claude Studio. Read CLAUDE.md and RESEARCH.md first (as always), then this.

## Where things stand

- **Rendering range (task 56):** done. PLAN.md, "Rendering range".
- **Character maker, stage 1 (2D reference → blocky):** done and tested. `web/maker.html`, `web/runtime/charmaker.js`.
- **Character maker, stage 2 (generated model → rigged character):** rigging done and tested; generation works on CPU (TripoSR) but isn't realistic. `web/runtime/rigmesh.js`, `tools/stage2/` (its README has the routes, setup and how the fit works), PLAN.md "Stage 2 built".
- **Mesh editing ported from Blender (task 57):** designed, half set up, blocked on a permission rule. PLAN.md, "Mesh editing, design".

## Stage 2: what's next

1. **The token.** `HF_TOKEN` is set in the environment but Hugging Face rejects it (`whoami-v2` says "Invalid username or password"; `gradio_client` then falls back to the spent anonymous quota). Likely the revoked one. The user needs to make a new read token and replace it in the environment settings. Check without printing it: `curl -s -H "Authorization: Bearer $HF_TOKEN" https://huggingface.co/api/whoami-v2 | head -c 200`. Note `gradio_client` 2.x takes `token=`, not `hf_token=`.
2. With a working token: FLUX.1 Kontext (`/infer`) to edit the drawing photo-real, then Hunyuan3D-2 (`/generation_all`) for a textured mesh, then `node tools/rigmesh.mjs MESH.glb OUT.glb --reference drawing.png`. Write it as `tools/stage2/mesh_hf.py` emitting the contract (or let `orientMesh` turn it). Judge it with `tools/stage2/view.py` and the turntable before claiming "realistic".
3. Without a token, the user can do step 2 on the Spaces' own websites from their phone and load the `.glb` in the maker page. Not yet tried with a real Hunyuan3D download: the first one will show whether its axes, texture and proportions fit (only a synthetic textured mesh is tested).
4. Then: LODs; proportions that differ from the drawing (realistic edits change them; the cuts come from the drawing's boxes, so they'd need the edited image's boxes instead).

## Mesh editing: what's blocking

Unchanged. The auto-mode check refuses to run binaries built from Blender's downloaded source; it needs this in the repo's `.claude/settings.json` (still not there):

```json
{ "permissions": { "allow": ["Bash(bash tools/blender-build.sh:*)", "Bash(bash claudestudio/tools/blender-build.sh:*)"] } }
```

## Setup in a fresh container

- `npm ci` in `claudestudio/` (the repo root has its own `package.json` for Gloamreach, and `npm ci` there too: the tools import `../../node_modules/playwright-core`).
- Stage 2's Python side: `tools/stage2/README.md`, "Setup" (~7 GB of models in `.cache/hf`).

## The user, lately

- Wants range, not a Roblox clone. Quality control both graphical and mechanical, proved by tests that are themselves mutation-checked.
- Decisions about how to build are mine; don't ask for approval of order or approach.
- No paid services.
- Keep replies short. Long notes go in files.
- Never ask for a token in chat. One was pasted once and the user was told to revoke it.
