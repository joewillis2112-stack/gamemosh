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
| TripoSR on CPU (`mesh_cpu.py`) | this container, ~40 s | the drawing's style in 3D, vertex colours, guessed depth | **working, tested** |
| Any image-to-3D website (Hunyuan3D-2, TripoSR, TRELLIS Spaces on Hugging Face), then the maker page's "Load model (.glb)" | the user's phone or browser, their own free Hugging Face login | Hunyuan3D-2: textured, much better depth | the page path is tested with the TripoSR fixture; **not yet tried with a real Hunyuan3D download** |
| Hugging Face Spaces from here (`gradio_client`, `HF_TOKEN`) | this container | as above | **blocked**: Hugging Face rejects the `HF_TOKEN` in the environment ("Invalid username or password"), and anonymous ZeroGPU quota from this shared IP is spent |
| SD-Turbo img2img restyle to "realistic" (`restyle_cpu.py`) | CPU | — | **tried, rejected**: even at strength 0.9 the cartoon stays a cartoon |

"Realistic" needs a real image model in front of the mesh step (FLUX.1 Kontext
edits the drawing into a photo-real one; then Hunyuan3D-2). Neither runs on
this container's 4 CPUs in useful time; both run on ZeroGPU Spaces with a
valid token. The rigger doesn't care which mesh it gets.

## Tools

- `make.sh drawing.png out.glb [triangles]`: the CPU route end to end.
- `mesh_cpu.py IN.png OUT.glb [res]`: TripoSR, output in the contract.
- `budget.py IN.glb OUT.glb [triangles] [smooth]`: Taubin smoothing (removes
  marching-cubes terraces), quadric decimation to a phone budget (12k
  default), colours carried over.
- `view.py MESH.glb OUT.png [size]`: front, left, back and top close-ups
  (orthographic, CPU), for judging a mesh or a rig's parts.
- `node tools/rigmesh.mjs MESH.glb OUT.glb --reference drawing.png [--parts]`:
  rig a contract mesh; `--parts` paints each body part one colour.
- `shim/torchmcubes.py`: scikit-image stand-in for TripoSR's CUDA/C++
  marching-cubes extension.

## Setup (once per container)

```sh
cd /home/user/gamemosh
uv venv -p python3.11 .cache/gen-venv
uv pip install -p .cache/gen-venv/bin/python --index-url https://download.pytorch.org/whl/cpu torch torchvision
uv pip install -p .cache/gen-venv/bin/python diffusers accelerate safetensors omegaconf einops trimesh pillow scikit-image huggingface_hub scipy fast-simplification "transformers==4.35.0"
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
5. **File**: the blocky rig's nodes and clips; translation keys moved with
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
