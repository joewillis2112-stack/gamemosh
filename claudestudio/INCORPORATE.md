# Systems to incorporate, and where each comes from (2026-10-12)

Rule (user, 2026-10-12): for every system the studio lacks, find an open rebuild
first and incorporate it into Claude Studio (on its own engine, not replacing
anything); port from the original only when nothing exists; report what can't
be found. Licences below were read from each repo's own LICENSE file, not from
search snippets. Clones live in `../.cache/ext/` (gitignored).

| System | Source found | Licence | Status |
|---|---|---|---|
| Polygon modelling (Blender's edit mode) | [3DOO](https://github.com/renatolinsdigital/3doo) kernel, TypeScript rebuild of Blender's BMesh | MIT | **Incorporated** 2026-10-12: `web/modeling/`, the editor's Edit Mode |
| Booleans (Roblox's Union/Negate), modifiers (mirror, array, solidify, bevel, subdivision surface, lattice), remesh, knife | Same 3DOO kernel (already vendored) | MIT | In the code, tested (kernel tests); not yet in the editor's UI |
| Sculpting | [SculptGL](https://github.com/stephomi/sculptgl) (brushes, dynamic topology, multires, remesh, surface nets) | MIT | Next |
| Character posing (joints) | ArtCraft `FKHelper` (rotate gizmo per bone), rebuilt on Babylon | MIT | **Incorporated** 2026-10-12: the editor's Animate mode (`web/editor/animate.js`) |
| IK (limbs) | Babylon's `BoneIKController` (in our engine) | Apache-2.0 | Next (our rig's limbs are nodes, not skinned bones: a two-joint solver on nodes, or the controller on a skinned rig) |
| Animation timeline, keyframes | ArtCraft `TimelineController` and `timeline/` (interpolation); [animation-timeline-control](https://github.com/ievgennaida/animation-timeline-control) (canvas keyframe UI, no dependencies) | MIT, MIT | **Incorporated** 2026-10-12: the control vendored (`web/vendor/animation-timeline/`); data is Roblox's own (KeyframeSequence, Keyframe, Pose), played by Animator/AnimationTrack (`web/animation.js`) |
| Terrain (Roblox's smooth voxel terrain) | SculptGL's `SurfaceNets.js` (vendored unchanged, `web/vendor/sculptgl/`); terrain-editor-js read for the brush idea | MIT | **Incorporated** 2026-10-12: `web/terrain/` (voxels, mesher, brushes), `runtime/terrain.js`, the editor's Terrain tools. Not yet: textured materials, terrain in `workspace:Raycast`, swimming, Region3 API |
| Texture painting (brushes on a texture, on the model through its UVs) | PhotoCraft's brush engine (`crates/paint`, Rust, MIT/Apache), ported to JS: tip, spacing, pressure, flow/opacity build-up; bit-exact against the Rust crate built here | MIT/Apache | **Incorporated** 2026-10-22: `web/paint/brush.js`, the editor's Paint tool (`web/editor/paint.js`): Decals on part faces, MeshParts through their UVs. PLAN.md, "Paint" |
| Water | Babylon `WaterMaterial` (`@babylonjs/materials`) | Apache-2.0 | Next |
| LODs, mesh simplification | [meshoptimizer](https://github.com/zeux/meshoptimizer) JS simplifier (`js/meshopt_simplifier.js`); 3DOO's `remesh/simplify.ts` | MIT, MIT | Next |
| UV unwrapping | [xatlas](https://github.com/jpcy/xatlas) (C++, MIT) | MIT | Needs a wasm build (we have emsdk); the npm wrappers' licences weren't verifiable |
| Particles (Roblox ParticleEmitter, Beam, Trail) | Babylon `ParticleSystem` (in our engine) | Apache-2.0 | To build on it |
| Gaussian splats | Babylon `GaussianSplattingMesh` (in our engine) | Apache-2.0 | To build on it |
| Custom skyboxes (Sky's SkyboxBk/Dn/Ft/Lf/Rt/Up) | Babylon `CubeTexture` (in our engine) | Apache-2.0 | To build on it |
| MeshPart raycasts by triangle | Babylon's picking (in our engine) | Apache-2.0 | To build on it (the hook exists: `dm.hooks.meshRaycast`) |

## Not found (as of 2026-10-12)

- ~~Texture painting on a 3D model~~: found and done, 2026-10-22 (PhotoCraft's
  brush engine, above). Editable meshes get Cube Projection UVs meanwhile
  (`runtime/cubeuv.js`); a real unwrap is still xatlas (below).
- **A JavaScript UV unwrapper with a verified licence.** xatlas itself is MIT;
  compiling it to wasm here is the route.
- **Blender's whole UI or node systems (geometry nodes, shader nodes) as a
  reusable library.** [blender-web](https://github.com/everybodysim/blender-web)
  runs the real Blender in a browser (WebGPU, desktop Chrome only, ~10 to 25 s to
  start), which is a separate app, not something to build into the studio.
