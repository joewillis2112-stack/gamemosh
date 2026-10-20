# Character maker, stage 2: a generated model, rigged

Stage 1 turns a drawing into the blocky character's skin. Stage 2 takes a 3D
model generated from the same drawing and rigs it to the same blocky rig, so it
plays with the same clips, physics and scripts.

The split is deliberate. **Generating** the model needs a big model and ideally
a GPU, so it happens outside the studio: in a Python tool here, or on any
image-to-3D website. **Rigging** is plain JS (`web/runtime/rigmesh.js`), runs
in the browser in well under a second, and is fully tested. Any generator that
outputs a `.glb` plugs in.

## The mesh contract

What the rigger expects (`orientMesh` produces it from any axes):

- Y up, facing +Z, feet at y = 0, centred on x and z; any scale.
- Vertex colours as sRGB (as trimesh and TripoSR write them), or uvs and a
  base-colour texture.
- One character standing roughly as drawn: front view, arms down.

## Routes

| Route | Where | Quality | Status |
|---|---|---|---|
| **Realistic, free (`mesh_hf.py`)**: FLUX.1 Kontext (photo of a real person), rembg cutout, Hunyuan3D-2 shape, `paint_cpu.py` texture | Hugging Face ZeroGPU Spaces with `HF_TOKEN` (free read token), the rest on CPU | a real person's face and clothes on the front; the back borrows the nearest seen colour (even, a little blotchy) | **working** (2026-10-11): `examples/realistic-adventurer.glb` |
| TripoSR on CPU (`mesh_cpu.py`) | this container, ~40 s | the drawing's style in 3D, vertex colours, guessed depth | working, tested |
| Any image-to-3D website, then the maker page's "Load model (.glb)" | the user's phone, their own Hugging Face login | Hunyuan3D-2 on its site textures too | page path tested with the TripoSR fixture only |
| Hunyuan's own texturing from here | — | — | **not usable on a free account**: Hunyuan3D-2's `/generation_all` fails in the Space (`NameError`); Hunyuan3D-2.1's asks for 270 s of GPU, more than a free day's quota |
| SD-Turbo img2img restyle (`restyle_cpu.py`) | CPU | — | tried, rejected: the cartoon stays a cartoon |

Kontext needs a firm prompt. "Turn this into a photorealistic person, same
outfit" gave a vinyl toy with the drawing's big head; asking for "a real
photograph of a real adult man… normal adult body proportions (head about one
seventh of his height)… not a toy, not a cartoon" gave a real person. That
changes the proportions, so rig against the **cutout**, not the drawing
(stage 1's `findParts` handles both since 2026-10-11).

Free quota: about 4 minutes of ZeroGPU a day. One Kontext edit and one shape
fit in it, with room for a retry.

## Tools

- `make.sh drawing.png out.glb [triangles]`: the CPU route end to end.
- `mesh_cpu.py IN.png OUT.glb [res]`: TripoSR, output in the contract.
- `budget.py IN.glb OUT.glb [triangles] [smooth]`: Taubin smoothing (removes
  marching-cubes terraces), quadric decimation to a phone budget (12k
  default), colours carried over.
- `mesh_hf.py drawing.png OUTDIR`: the realistic route (Kontext, rembg,
  Hunyuan3D-2 shape, `paint_cpu.py`). Then
  `node tools/rigmesh.mjs OUTDIR/mesh.glb out.glb --reference OUTDIR/cutout.png`.
- `paint_cpu.py SHAPE.glb CUTOUT.png OUT.glb [triangles]`: textures an
  untextured mesh from the photo it was made from: front faces get the photo
  projected; hidden ones the colour of the nearest seen point along the
  surface (sampled 12 px inside the silhouette, from a blurred copy beside the
  photo in the texture); the back of the head takes the crown's hair. Drops
  Hunyuan's degenerate faces (a third of them) before decimating.
- `view.py MESH.glb OUT.png [size] [--crop y0 y1]`: front, left, back and top
  close-ups (orthographic, CPU, textures sampled per pixel), for judging a mesh
  or a rig's parts; `--crop 0.82 1` for the head.
- `node tools/rigmesh.mjs MESH.glb OUT.glb --reference drawing.png [--parts]`:
  rig a contract mesh; `--parts` paints each body part one colour.
- `shim/torchmcubes.py`: scikit-image stand-in for TripoSR's CUDA/C++
  marching-cubes extension.

## Setup (once per container)

Realistic route only (small): `uv venv -p python3.11 .cache/hf-venv && uv pip
install -p .cache/hf-venv/bin/python gradio_client trimesh pillow numpy scipy
fast-simplification "rembg[cpu]"` (rembg fetches its 180 MB model on first use).

CPU route:

```sh
cd /home/user/gamemosh
uv venv -p python3.11 .cache/gen-venv
uv pip install -p .cache/gen-venv/bin/python --index-url https://download.pytorch.org/whl/cpu torch torchvision
uv pip install -p .cache/gen-venv/bin/python diffusers "accelerate==0.24.1" safetensors omegaconf einops trimesh pillow scikit-image huggingface_hub scipy fast-simplification "rembg[cpu]" "transformers==4.35.0"
git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git .cache/TripoSR
HF_HOME=.cache/hf .cache/gen-venv/bin/python -c "from huggingface_hub import snapshot_download as d; d('stabilityai/TripoSR', token=False); d('facebook/dino-vitb16', token=False, allow_patterns=['*.json','*.safetensors','*.txt'])"
```

`transformers` must be 4.35: newer versions renamed the ViT weights TripoSR's
checkpoint uses, and loading fails with missing keys.

## How the rig is fitted (`web/runtime/rigmesh.js`)

1. **Orient**: the 24 unmirrored axis rotations, each scored by its front view
   against the drawing (silhouette IoU, less colour difference so front and
   back differ). The fixture: 0.87 for the right one, 0.71 for its back.
2. **Cut**: stage 1's part boxes for the drawing (creator-correctable) laid
   over the mesh's front view. The mesh's own silhouette is the fallback; it
   fails where a generator fills gaps (TripoSR filled the one between the
   legs).
3. **Joints**: each at the same place relative to its part as the blocky
   rig's joint (Kenney's hip at the top centre of the leg, the shoulder at the
   arm's inner top), measured across the part's slice at the joint (a hip sits
   over the thigh, not halfway to the toes). Proportions follow the mesh.
4. **Weights**: rigid per part, smoothed across each limb's seam with the
   torso only near that limb's joint.
5. **Fusions**: a generator welds a hand to the thigh it rests on (Hunyuan
   did; so did TripoSR). Faces joining an arm to a leg, or to the torso below
   the arm's upper third, are severed, and each hole's boundary loop (traced by
   position, across texture seams) is capped with a fan. Without this a walk
   stretches skin from hand to hip.
6. **File**: the blocky rig's nodes and clips; translation keys moved with
   their joints; one skinned body; each joint carries its part's box (soles,
   footprints). Passes Khronos's validator with nothing to report.

## Tests

- `test/rigmesh.test.mjs`: mannequin with known boxes (joints by rule within
  2 px, every vertex on its part), skinning maths, retargeted keys, the
  fixture against the drawing (cuts on stage 1's judged rows, silhouette IoU
  0.92, every part's colour after one fitted gain), orientation from six
  turns, a textured mesh, determinism, the validator.
- `test/scenarios/charmaker2.mjs` (desktop, phone): 191-frame trace equal to
  the blocky character's; Babylon's own skinned vertices follow their joints
  mid-walk; death footprint; golden.
- `test/scenarios/feet.mjs --character`: no foot slip on the rigged body.
- `test/maker.test.mjs`: the page loads a model, rigs, previews, plays.

## Known defects (realistic route, 2026-10-11)

- Fixed by the multi-view run: the back of the shirt had darker blotches
  (hidden areas borrowed from the nearest seen point).
- Fixed: a flap of hip surface rode with each hand (the hand overlaps the thigh
  in the front view, so the box cut can't tell them apart). Now arm-column
  vertices below the crotch go to the nearer of arm and leg along the surface.
  Cost: where a hand is fused to the thigh, a thin ring at the hand's bottom
  goes with the leg. (Charging for steps between columns kept the ring but
  brought the flap back: on this mesh the flap reaches the hand inside the
  arm's columns.)
- A small skin-coloured patch on the hip where the photo's hand covered the
  thigh.
- **Multi-view run (2026-10-20): the back is fixed.** One Kontext call ("this exact same person from directly behind") gave the same man, same outfit, straight on; Hunyuan3D-2mv meshed front + back; 89% of faces now come straight from a photo (front 49%, back 40%; was 46% from the front alone). `examples/realistic-adventurer.glb` is this one. Left: a visible join down the sides where the two photos meet (a side view would fix it, one more Kontext call), and skin flecks at the hips where the hands were fused. Built: `mesh_hf.py --views back[,left,right]` has Kontext make each view from the front photo, Hunyuan3D-2mv takes them together, and `paint_cpu.py --back/--left/--right` paints each face from the photo that faces it most squarely (`test/paint_cpu.test.py`: a box and four two-colour photos, every face in its view's colour on the correct side, mutation-checked against a mirrored back and swapped sides). The old note: only one view went in (the front). A back view from Kontext ("the same person
  from behind") into Hunyuan's multi-view inputs would fix both, at the cost of
  quota.
