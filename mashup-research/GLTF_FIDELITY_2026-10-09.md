# glTF import: the exactness reference (2026-10-09)

For Claude Studio's model import (task: glTF + full PBR). The goal is the glTF spec rendered correctly, checked against Khronos's own references rather than judged by eye.

## The reference: Khronos glTF Render Fidelity

- Site: https://github.khronos.org/glTF-Render-Fidelity/ ([about](https://github.khronos.org/glTF-Render-Fidelity/about), [Khronos blog](https://www.khronos.org/blog/khronos-upgrades-gltf-sample-assets-and-render-fidelity-comparison-websites)).
  - It compares how renderers draw the Khronos sample models: Babylon.js, three.js via model-viewer, Filament, Khronos's glTF Sample Viewer, and path tracers (Blender Cycles, V-Ray, STELLAR, three-gpu-pathtracer).
- Ground truth is **the glTF Sample Viewer**, Khronos's reference renderer. The Viewer Certification program compares vendors' images to it before tone mapping, within tolerances.
- Repos (read with a blobless clone, `git clone --filter=blob:none --no-checkout`, then `git show <commit>:<path>`):
  - `KhronosGroup/glTF-Render-Fidelity` (the site) holds only thumbnails, in `public/thumbnails/goldens/<scenario>/<renderer>-golden.thumb.webp`.
  - `KhronosGroup/glTF-Render-Fidelity-Generator` is a submodule of the site, pinned at `deaaba0b6c87b2a8627eb1ff809eedac6b11a5be`. It holds:
    - **full-size goldens** at `test/goldens/<scenario>/<renderer>-golden.png` (696 files);
    - `test/config.json`, with 87 scenarios, each giving model, orbit (theta, phi, radius), target, verticalFoV, lighting HDR, dimensions and renderSkybox (defaults are in `src/config-reader.ts`);
    - `environments/*.hdr`, the lighting;
    - each renderer's exact setup in `src/components/renderers/*.ts`.
- The scenarios cover the whole spec:
  - core PBR (MetalRoughSpheres, DamagedHelmet, FlightHelmet, Sponza);
  - alpha modes, texture transforms, texture encodings, vertex colours, multi-UV;
  - normal and tangent tests, negative scale, unlit;
  - the KHR material extensions (transmission, volume/attenuation, clearcoat, sheen, iridescence, anisotropy, specular, emissive strength) and materials variants;
  - punctual lights;
  - skins, morph targets and animations (CesiumMan, Fox, BrainStem, RecursiveSkeletons, MorphStressTest);
  - KTX textures.

## Babylon in the harness (`babylon-viewer.ts`)

This is our renderer, so it's the setup to match first:
- tone mapping ACES, with `exposure = 1 / 0.6` (the factor that makes Babylon's ACES match three.js's);
- clear colour transparent;
- `ArcRotateCamera(alpha = theta + 90°, beta = phi, radius)` with `target = (-x, y, z)`, because Babylon's x is opposite to model-viewer's; `fov` is vertical;
- glTF loader `transparencyAsCoverage = true`, for spec conformance;
- `minZ = farClip / 1000`, where `farClip = 2 × max(model size, orbit radius)`;
- animations stopped;
- environment `HDRCubeTexture(hdr, 256, noMipmap = false, generateHarmonics = true, gammaSpace = false, prefilter = !realtime)`:
  - real-time filtering, quality HIGH, for `spruit_sunrise_1k_HDR` and `spot1Lux`; prefiltered otherwise;
  - the environment is rotated 90° about Y (`setReflectionTextureMatrix`), the skybox 270°.

## How we use it

1. **Harness:** a page that loads a scenario's model through the studio's own import path, sets the camera and environment exactly as above, renders at the scenario's dimensions, and diffs the result against `babylon-golden.png` and `gltf-sample-viewer-golden.png`.
2. **Pass bar:**
   - match Babylon's golden closely (same engine, so differences mean our import or material setup is wrong);
   - report the distance to the Sample Viewer golden.
   - Where Babylon itself is off from ground truth, we may beat it (the framework direction: Roblox, and here Babylon, are the baseline, not the ceiling).
3. **Inside the studio,** imported models must also work as game objects:
   - placed and scaled by CFrame/Size;
   - physics colliders (box, hull or exact mesh);
   - scripts can find their parts;
   - animations can be played;
   - skins work.
