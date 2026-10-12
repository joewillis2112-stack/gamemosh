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
| Character posing (joints) | ArtCraft `FKHelper` (rotate gizmo per bone) | MIT | Next, with IK |
| IK (limbs) | Babylon's `BoneIKController` (in our engine) | Apache-2.0 | Next, with posing |
| Animation timeline, keyframes | ArtCraft `TimelineController` and `timeline/` (interpolation); [animation-timeline-control](https://github.com/ievgennaida/animation-timeline-control) (canvas keyframe UI, no dependencies) | MIT, MIT | Next |
| Terrain (Roblox's smooth voxel terrain) | [terrain-editor-js](https://github.com/deep110/terrain-editor-js) (marching cubes field + raise/lower brushes); SculptGL's `SurfaceNets.js`/`MarchingCubes.js` | MIT, MIT | Next; Roblox's terrain materials (grass, rock...) built on top |
| Water | Babylon `WaterMaterial` (`@babylonjs/materials`) | Apache-2.0 | Next |
| LODs, mesh simplification | [meshoptimizer](https://github.com/zeux/meshoptimizer) JS simplifier (`js/meshopt_simplifier.js`); 3DOO's `remesh/simplify.ts` | MIT, MIT | Next |
| UV unwrapping | [xatlas](https://github.com/jpcy/xatlas) (C++, MIT) | MIT | Needs a wasm build (we have emsdk); the npm wrappers' licences weren't verifiable |
| Particles (Roblox ParticleEmitter, Beam, Trail) | Babylon `ParticleSystem` (in our engine) | Apache-2.0 | To build on it |
| Gaussian splats | Babylon `GaussianSplattingMesh` (in our engine) | Apache-2.0 | To build on it |
| Custom skyboxes (Sky's SkyboxBk/Dn/Ft/Lf/Rt/Up) | Babylon `CubeTexture` (in our engine) | Apache-2.0 | To build on it |
| MeshPart raycasts by triangle | Babylon's picking (in our engine) | Apache-2.0 | To build on it (the hook exists: `dm.hooks.meshRaycast`) |

## Not found (as of 2026-10-12)

- **Texture painting on a 3D model, with a licence.** The two browser projects
  that do it ([chameleon.js](https://github.com/tomtung/chameleon.js),
  [WebGL3DPainter](https://github.com/franjaviersans/WebGL3DPainter)) have no
  licence file. Interim: SculptGL's vertex painting (MIT); later, PhotoCraft's
  brush engine (MIT, Rust, other session's notes in ARTCRAFT.md) painting into a
  texture through the mesh's UVs.
- **A JavaScript UV unwrapper with a verified licence.** xatlas itself is MIT;
  compiling it to wasm here is the route.
- **Blender's whole UI or node systems (geometry nodes, shader nodes) as a
  reusable library.** [blender-web](https://github.com/everybodysim/blender-web)
  runs the real Blender in a browser (WebGPU, desktop Chrome only, ~10 to 25 s to
  start), which is a separate app, not something to build into the studio.
