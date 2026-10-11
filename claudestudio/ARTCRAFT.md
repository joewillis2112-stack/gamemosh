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
