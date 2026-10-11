# ArtCraft: what it is, and what Claude Studio takes from it (2026-10-11)

ArtCraft ([github.com/storytold/artcraft](https://github.com/storytold/artcraft), "the IDE for
artists") is an open-source desktop app for AI image and video work. You compose in 2D, stage a
scene in 3D (characters, props, camera), then generate a picture or video that follows the
staging. The user pointed at it as close to what they asked Claude Studio for. It overlaps in two
places: the character pipeline (image to 3D mesh, character posing) and the editor (Phase 2: a 3D
scene editor with gizmos, posing, a timeline).

Read at commit `d4e4ac69bbd93d237eaf5d0260bc6a5ff3a5e373` (2026-10-11). `tools/fetch-artcraft.sh`
checks that commit out into `../.cache/ext/artcraft` (gitignored).

## The facts that decide how we use it

- **Licence:** MIT or Apache-2.0, at our choice (LICENSE-MIT, LICENSE-APACHE). Code can be copied
  or ported with the copyright notice kept. Not covered: the ArtCraft name and logos, and the
  third-party files NOTICE lists (Nintendo sound effects, memes, two skyboxes, an MMD motion file,
  Mixamo renders). Never copy those.
- **The app is free, but its AI isn't.** Every generation goes through a paid provider: ArtCraft's
  own service (credits), fal (also used for background removal), Grok, Midjourney, Sora,
  World Labs. The user ruled out paid services, so we don't use its generation. Our free route
  (Hugging Face Spaces: FLUX.1 Kontext, Hunyuan3D-2; TripoSR on CPU) stays the route.
  - Its model catalog (README) is still a useful map of what's current for image-to-3D:
    Hunyuan 3D 2.0 to 3.1 (incl. "Part" and "Smart Topology"), Tripo3D H3.1, Meshy 6, Rodin 2.5.
    Where one of those has a free Space or open weights, it's a candidate for stage 2.
- **Its 3D characters aren't in the repo.** The scene fetches them from ArtCraft's server by media
  id (`pagescene/src/lib/actions/addCharacter.ts`), and posing expects Mixamo bone names. We use
  our own rig (the blocky character and stage 2's rigged meshes).
- **It's three.js (^0.171), React, Zustand and Nx; the desktop shell is Tauri (Rust).** Claude
  Studio is Babylon 9. Its code ports to ours as logic and UX, not as a drop-in: pulling in its
  components would mean a second renderer and React. Port, don't embed.

## Where things are (paths under `frontend/libs/components/`)

| Module         | Lines  | What it is                                                                                     | Use for us                                                    |
|----------------|--------|------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `pagescene`    | 22,400 | The 3D scene editor: `engine/editor.ts` (1,170), `engine/editor/` (Camera, Gizmo, History, ModalTransform, Selection, SkeletonHelper, Timeline, Viewport controllers), `engine/KinHelpers/FKHelper.ts` (bone posing with rotate gizmos), `animation/CharacterAnimationManager.ts`, `save_manager.ts`, `recording/`, `timeline/` (keyframes, interpolation) | Phase 2 editor and Phase 5 motion: the reference design |
| `pagedraw`     | 8,350  | 2D canvas: layers, drawing, masks, background removal (calls fal)                              | Image tools (Adobe-class 2D), the maker's reference cleanup   |
| `video-editor` | 71,100 | A full video timeline editor                                                                   | Phase 5 (Motion: cutscenes, trailers)                         |
| `viewer-3d`    | 1,040  | A model viewer                                                                                  | Little: our turntable covers it                               |
| `vfx`          | 1,530  | Effects                                                                                        | Look later                                                    |

Also `engine/TransformControls.js` (three.js's gizmo, modified), `engine/keymap.ts` and
`keybinds_controls.ts` (editor shortcuts), `engine/chromakey.js`.

## What to take, in order

1. **Editor (Phase 2), when it starts:** the controller split in `pagescene/src/lib/engine/editor/`
   is a good shape for ours: one controller each for camera, gizmo, history (undo/redo as recorded
   actions: `editor/actions/`, e.g. `CreateAction`), selection and outliner, modal transforms
   (Blender-style: G grabs, X/Y/Z constrain; its v1 does translate only), viewport. Port the behaviour onto Babylon's gizmos and our DataModel
   (where an action is a property change on an Instance, which we already watch).
2. **Posing:** `FKHelper.ts` puts a rotate gizmo on each bone, picked by a sphere at the joint,
   with a filter list of bones not to pose (`FKBoneFilter.ts`). Our rig's joints are named; port
   it for posing characters in the editor and in the character maker (posing a mannequin to guide
   an image edit is ArtCraft's "Character Identity Transfer").
3. **Timeline (Phase 5):** `engine/timeline/` (types, interpolation) and `TimelineController.ts`
   for keyframed camera and object motion; `video-editor` for cutting.
4. **2D tools:** `pagedraw` for layers, masks and drawing, with a free background remover
   swapped in for fal (e.g. an open model run locally or on a Space).

Every port goes through our usual bar: tests that check behaviour (and are mutation-checked),
goldens looked at, desktop and phone.

## What not to do

- Don't run its app or build in the cloud container. It's a Tauri desktop app, and its
  generation needs paid accounts.
- Don't copy the NOTICE-listed third-party files, or its name and logos.
- Don't add its providers to our pipeline: they all cost money.

## For the user

ArtCraft itself runs on Windows and macOS (getartcraft.com) and is worth trying for staging
shots. Generating in it costs credits or a subscription.

## The Craft apps: the Adobe (and Office) suite, separate repos (added 2026-10-11, second session)

The press story (PetaPixel, Ars, 2026-10-07) is not the `artcraft` repo above but a family of
sibling repos in the same org: clean-room Rust remakes of Adobe and Microsoft apps. Read at the
commits below (shallow clones in `/home/user/ext/`, not kept in the repo).

| Repo | Target | Rust lines | `#[test]` files | Own parity claim ("ready for real work") |
|---|---|---|---|---|
| photocraft `f9e94aa` | Photoshop | 452k | 806 | ~45%, alpha |
| vectorcraft `2ac3ba2` | Illustrator | 381k | 762 | ~62%, alpha |
| filmcraft `0800a8b` | Premiere | 360k | 532 | ~56%, alpha |
| effectcraft `67434e9` | After Effects | 338k | 451 | ~47% (mainstream user), alpha |
| printcraft `3d2bdfe` | Acrobat | 342k | 319 | ~49%, alpha |
| lightcraft `76b5377` | Lightroom (CC) | 234k | 408 | ~77% breadth, alpha |
| designcraft `ca343e8` | InDesign | 128k | 186 | ~47%, pre-alpha |

Not cloned, same org: wordcraft (Word), gridcraft (Excel), deckcraft (PowerPoint), soundcraft
(Pro Tools), cadcraft (CAD), pdfcraft, craft-libs (shared crates), spark (a three.js Gaussian
splat renderer). **No 3D modeller (no Blender equivalent)**, so our BMesh port has no shortcut here.

How they were built (checked in git, not taken from the press): photocraft, vectorcraft and
filmcraft all start on **2026-09-30**, 12 days before this note, with 1,382 to 2,063 commits each;
most commits carry a `Co-Authored-By: Claude` trailer (photocraft: 1,591 trailers over 1,524
commits, so several per commit). The press quotes the founder as saying they were built with
Claude Opus 5.5. Each repo has an AGENTS.md/CLAUDE.md written for agents.

Licence: MIT or Apache-2.0, as above. Not covered: the ArtCraft name and logos (`docs/brand/`),
and third-party fonts, icons and word lists listed in each NOTICE/ATTRIBUTION.md (keep their own
licences). Free, no account needed; every app ships a self-hostable WebAssembly build
(`photocraft-web-<ver>.zip` on the GitHub release; not hosted publicly).

### What they do that we should copy (method, not code)

Their working method matches ours (oracles, parity numbers, agents first) and goes further in
places:

- **Everything is a command.** One registry (500+ in photocraft) behind every menu item, the CLI,
  a JSON control channel and an MCP server, so an agent can do anything a user can. Claude
  Studio's editor should start this way: each editor action a named command over the DataModel,
  which also gives undo and scripting from one place.
- **A CPU reference renderer checked against the GPU one** (photocraft's compositor oracle), and
  against Photoshop's own merged image in PSDs. Ours: Babylon against Blender Cycles (bpy is set up).
- **Parity as measured numbers with evidence and hour estimates** (`ROADMAP.md`,
  `docs/target-app-parity.md`, a generated menu checklist, `scorecard/*.toml`). Our PLAN.md has
  per-feature status but no single parity measure against Roblox Studio or Blender; worth adding.
- **A "never panic on input" rule, enforced by clippy, with a test that fuzzes every command with
  hostile parameters** (`panic_hunt`). Our Luau API could get the same: fuzz every exposed method.
- **Layering enforced by a build check** (`cargo xtask layers`).

### What we could use directly (code, all MIT/Apache)

All of it compiles to wasm, as the apps' own web builds show; Claude Studio is JS + Babylon,
so a Rust crate comes in the way Luau did (compiled to wasm, behind a small binding).

- **`photocraft-psd`**: a standalone crate (deps: thiserror, flate2), round-trips 307 of 309
  psd-tools corpus files by their own test. Import a creator's layered PSD as textures or GUI.
- **photocraft `paint`** (brush engine) and **vectorcraft**'s vector crates: candidates for
  texture painting on our models and for vector GUI art, the "paint" and "vector" tools PLAN.md
  lists. Not yet read closely; check their wasm size before choosing them.
- **The apps themselves** as companion tools: a creator edits a texture in PhotoCraft and the
  studio imports the PSD/PNG. The cheapest route to Adobe-class 2D tools, and needs nothing from
  us but import.

### Cautions

- Alpha by their own numbers (45–62% "ready for real work"), 12 days old, moving fast (hundreds
  of commits a day). Pin a commit for anything we port.
- Their parity percentages are self-assessed estimates, not independent measurements.
- For a phone-first studio, check wasm size and WebGL2 fallback before embedding anything
  (their web builds use WebGPU and fall back to WebGL2).
