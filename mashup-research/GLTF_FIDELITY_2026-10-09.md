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

## Results (2026-10-09, Babylon 9.29, SwiftShader)

The harness is `tools/fetch-fidelity.sh`, then `tools/fidelity.mjs`, with the baseline in `test/fidelity-baseline.json`. It runs in `test-play.sh` when the fixtures are fetched. We fetched 13 models, giving 14 scenarios.

- **Our right-handed import equals the harness's left-handed setup exactly** (identical numbers). In a right-handed scene the camera is `alpha = 90° − θ` with the target as given, and the environment keeps the 90° rotation. No mirroring is needed.
- **Babylon 9 has changed since the goldens were made.** Its default `brdf.mixIblRadianceWithIrradiance = true` lightens rough surfaces. Mean distance to the Sample Viewer (ground truth), over 13 scenarios:

  | sRGB textures | mixing | vs Sample Viewer | vs Babylon golden |
  |---|---|---|---|
  | on | on (Babylon 9 defaults) | 9.20 | 5.10 |
  | **on** | **off** (shipped) | **7.07** | **1.11** |
  | off | on | 9.61 | 4.70 |
  | off | off | 7.52 | 0.39 |

  `runtime/gltf.js` turns mixing off on imported materials. The diffuse model (Lambert, legacy or E-Oren-Nayar) makes no difference at the glTF default diffuse roughness of 0.
- With the shipped settings, every scenario is within 2.1/255 of Babylon's golden except **BoxTextured (9.3, open)**:
  - The texture decodes correctly, including every mip level read back.
  - The material is right, and handedness, sampling mode, the sRGB path and the environment orientation are ruled out.
  - Its twin BoxTexturedNonPowerOfTwo, with the same palette PNG at 211 px, matches at 1.1.
  - The cause is unknown. Ours is lighter on coloured texels only.
- The distance to the Sample Viewer (about 4 to 11 /255) is Babylon's own gap from ground truth, the same as its golden's. Closing it is renderer work, which comes after this task.
- Tolerance is 0.5/255 of mean regression per scenario. Mutation check: restoring Babylon 9's mixing default fails 8 of 14 scenarios.
