# Handoff (2026-10-10)

For a new session picking up Claude Studio. Read CLAUDE.md and RESEARCH.md first (as always), then this.

## Where things stand

- **Rendering range (task 56):** done. Lighting service, time-of-day sky, SSAO for Realistic. PLAN.md, "Rendering range".
- **Character maker, stage 1 (2D reference → blocky character):** done and tested. `web/maker.html`, `web/runtime/charmaker.js`; PLAN.md, "Character pipeline".
- **Character maker, stage 2 (blocky → realistic):** next. Not started beyond checking the route.
- **Mesh editing ported from Blender (task 57):** designed, half set up, blocked on a permission rule. PLAN.md, "Mesh editing, design".

## Stage 2: what to do first

1. Check the token without printing it: `[ -n "$HF_TOKEN" ] && echo set`. Then `curl -s -H "Authorization: Bearer $HF_TOKEN" https://huggingface.co/api/whoami-v2` should name the user's account.
2. The free route (the user ruled out paid services such as fal.ai): Hugging Face Spaces on ZeroGPU through `gradio_client`. Recreate the venv if it's missing: `uv venv -p python3.11 .cache/hf-venv && uv pip install -p .cache/hf-venv/bin/python gradio_client pillow`. Pass `hf_token=os.environ["HF_TOKEN"]` to `Client(...)`.
   - `black-forest-labs/FLUX.1-Kontext-Dev`, `/infer(input_image, prompt, seed, randomize_seed, guidance_scale, steps)`: the realistic edit of the reference.
   - `tencent/Hunyuan3D-2`, `/generation_all(caption, image, mv_image_front, mv_image_back, mv_image_left, mv_image_right, steps, guidance_scale, seed, octree_resolution, check_box_rembg, num_chunks, randomize_seed)`: textured mesh, optionally from 4 views.
   - Test input: `test/fixtures/characters/male-adventurer.png` (CC0). `build/stage2/input.png` is it on white, 1024².
3. Then: rig the mesh with the blocky rig's joints so it plays with the same animations; checks as listed in PLAN.md (silhouette and colour against the reference, joint positions, the asset gate, and the same mechanical trace test stage 1 uses).
4. A CPU-only fallback (no account, unlimited, plainer) is worth evaluating: SD-Turbo img2img for the edit, TripoSR or Hunyuan3D-2mini shape on CPU.

## Mesh editing: what's blocking

The auto-mode check refuses to run binaries built from Blender's downloaded source. A permission given in chat doesn't satisfy it. Every such step is in `tools/blender-build.sh`. The user has been asked to add this to the repo's `.claude/settings.json` (no such file existed yet):

```json
{ "permissions": { "allow": ["Bash(bash tools/blender-build.sh:*)", "Bash(bash claudestudio/tools/blender-build.sh:*)"] } }
```

If it's there, run from `claudestudio/`: `bash tools/blender-build.sh fetch dna native probe oracle`, then continue with PLAN.md's "First slice after that".

## The user, lately

- Wants range, not a Roblox clone. Quality control both graphical and mechanical, proved by tests that are themselves mutation-checked.
- Decisions about how to build are mine; don't ask for approval of order or approach.
- No paid services.
- Keep replies short. Long notes go in files.
- Never ask for a token in chat. One was pasted once and the user was told to revoke it.
