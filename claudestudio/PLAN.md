# Claude Studio

A game studio in the browser, usable from a phone: build a game (parts, characters, scripts, lighting), press Play, share a link. Games are scripted in **Luau** (Roblox's language, open source under MIT) against a Roblox-style API re-implemented from Roblox's public documentation. No Roblox code, assets or branding.

Started 2026-10-07. Built over many sessions, so this file is the map.

## The bar (from the user)

- **What the studio produces must match popular 2026 Roblox games in consistency and finish.** Not their style, and not texture resolution: every asset correct, consistent with the others, and finished before the next one starts.
- **The studio's own UI can look bad.** Effort goes into the games, not the editor chrome.
- My track record (RESEARCH.md §2 #16): cows with udders on their backs, jumbled chickens, weak HUDs. The cause was checking that things run, never that they look right, and moving on too early. Hence the gate below.

## The asset gate (every asset, every time)

An asset (a model, a character, an animation, a material, a sky, a HUD element) is done only when:

1. **Rendered from front, side, back, top and below**, under the same fixed light, at a fixed size, by a script (`tools/turntable`). I look at every image.
2. **Compared with its reference.** Each asset names one (a photo, a CC0 source, a sketch from the user).
3. **Checked in code:**
   - normals face out;
   - feet or base on the ground plane;
   - scale against the reference character (1 stud = 0.28 m; the character is 5 studs tall);
   - no overlapping coplanar faces;
   - the pivot where it should be;
   - animations loop without a pop.
4. **A golden screenshot is saved.** The test suite re-renders it and fails on a visible difference, so a later change can't quietly break it.

Nothing new starts while the current asset fails the gate.

## Graphics baseline (what "Roblox-2026-like" means technically)

- Physically based materials: albedo, normal and roughness maps, in a fixed, consistent material set (plastic, wood, metal, grass, concrete, glass, neon…).
- Real-time shadows from the sun (cascaded on desktop, one cascade on phones).
- A sky with sun position and time of day, atmospheric haze, bloom, and tone mapping and colour grading.
- Characters with a proper skeleton and smooth animation: idle, walk, run, jump, fall, climb, swim.
- A third-person camera and controls that feel like Roblox's: thumbstick and jump button on touch, with camera drag; WASD and mouse on desktop.
- 60 fps on a mid-range phone for a typical scene, measured, not assumed.

Assets come from CC0 sources (Quaternius rigged characters and animations, Poly Haven and ambientCG materials and skies, Kenney) so the look is consistent and nothing is borrowed.

## Architecture

| Layer | What | Notes |
|---|---|---|
| Scripting | Luau compiled to WebAssembly (Emscripten) | One VM per script context, sandboxed; `task.wait`/`spawn`/`delay` on a scheduler |
| DataModel | `Instance` tree: Name, Parent, Children, properties, `Changed`, `ChildAdded`, `Destroy`, `FindFirstChild`… | The API surface follows Roblox's public reference so scripts read the same |
| World | `Workspace`, `Part` (Block, Ball, Cylinder, Wedge), `Model`, `SpawnLocation`, `Material`, `Color3`, `Vector3`, `CFrame` | |
| Physics | A wasm rigid-body engine (Rapier or Havok) | Anchored, CanCollide, Touched, constraints later |
| Characters | `Humanoid` controller: walk, jump, climb, swim, health | One rigged CC0 character, animated |
| Lighting | `Lighting` service: ClockTime, Atmosphere, Sky, Bloom, ColorCorrection | |
| UI | `ScreenGui`, `Frame`, `TextLabel`, `TextButton`, `ImageLabel` | For game HUDs |
| Editor | Explorer, Properties, viewport gizmos (move, rotate, scale), Insert, Play/Stop, save/load | Ugly is fine |
| Places | One JSON file per game | Shareable as a link |
| Later | Prompt to game (Claude writes the place and its scripts), multiplayer (a relay server, replication) | |

## Phases

0. **De-risk:**
   - Luau builds to wasm and runs a script that touches a JS-side `Instance`.
   - Pick the renderer (three.js or Babylon.js) by building the same reference scene in both and measuring them on a phone profile.
   - Set up the turntable and golden-screenshot tooling.
1. **The player:** DataModel, parts, materials, lighting and sky, physics, one character with animations, camera, touch controls, Luau scripts with events. **Gate:** a reference obby (parkour course) that passes the asset gate, part by part.
2. **The editor:** Explorer, Properties, gizmos, Insert, Play/Stop, save and load. It must work by touch.
3. **Prompt to game.**
4. **Multiplayer.**

## Status

### Phase 0, 2026-10-07

- **Luau in WebAssembly: done.** `luau/binding.cpp` and `web/datamodel.js`; `test/luau.test.mjs` passes.
  - Instance properties with Roblox-style type errors, parenting, `GetChildren` as tables, native `Vector3`.
  - Events are deferred, as in Roblox's default SignalBehavior.
  - `task.wait`, `spawn`, `delay`, `Signal:Wait()`.
  - Each script runs in its own sandboxed thread.
- **Renderer: Babylon.js 9 + Havok**, chosen on features. It ships PBR, cascaded shadows, image-based lighting, the default post pipeline, glTF skeletal animation and a character controller. three.js would need those assembled by hand, which is where my finish has been weak. **Phone frame rate is not measured yet:** this container has only software rendering, so it waits for a real phone or a GPU runner.
- **Asset gate tooling: done.** `tools/turntable.mjs <glb>` renders five views (and `--extra` adds an angled underside and a three-quarter view) with the shared look in `web/render.js`. It also prints metrics: height in studs, ground gap, inward faces, and loop pop per clip. `--strip <clip>` gives 6 frames of an animation; `--golden <name>` compares against `goldens/`. The comparison was checked live: a 6% dimmer sun fails it on four of five views.
- **First asset through the gate: `character-a`** (Kenney Blocky Characters, CC0).
  - 5 studs tall, on the ground, no inside-out faces.
  - idle, walk and sprint loop seamlessly.
  - Walk checked frame by frame and compared with Kenney's preview.
  - Goldens saved.
  - The pack has no jump, fall, climb or swim clips. Each will need authoring and its own pass through the gate.

### Phase 1, 2026-10-07: the player (first slice)

`tools/play.mjs [--phone] [--scenario test/scenarios/x.mjs] [--noshots] [--update]` drives `web/play.html`. Scenarios: `move` (numbers and in-game goldens), `feet` (foot slip), `touch` (run with `--phone`), `desktop`, `look`.

- **World:** `web/runtime/world.js` draws Parts from the DataModel with PBR materials (Plastic, SmoothPlastic, Metal, Neon, Baseplate with a 4-stud grid) and gives them Havok bodies. The look (shadows, fog 120–520, sky) was judged from fixed views.
- **Character:** `web/runtime/character.js`. Havok character controller, 5-stud capsule, Roblox numbers. Measured:
  - walk 16.00 studs/s;
  - jump 6.369 studs (theory 6.371);
  - air time 0.58 s;
  - soles exactly on the ground;
  - holding jump re-jumps on landing.
- **Animator:** blends clips from the rest pose every frame (nlerp on the shortest arc) with crossfades.
  - Walk and run rates follow ground speed using the contact-speed rule; foot slip is under 8% of body speed at every stick deflection.
  - Jump and fall are held poses in `web/runtime/poses.js`, shared with the turntable (`--pose jump|fall`). Both passed the gate; goldens are saved.
- **Camera:** `web/runtime/camera.js`. Orbits the head at zoom 12.5 (0.5–128), pitch ±80°, FOV 70°.
  - Pulls in when a part blocks the view (measured 3.46 against a computed 3.46), then eases back out.
  - First person below 1.5 studs.
- **Controls:** `web/runtime/controls.js`. All of these are tested through real events:
  - WASD/arrows and Space;
  - mouse drag turns (right looks right) and the wheel zooms;
  - touch: a thumbstick that appears under the left thumb, a jump button bottom right, drag to look, pinch to zoom.
- **Goldens:** `goldens/play/` holds the idle, run, jump and fall in-game views and the phone HUD. `tools/golden.mjs` is shared with the turntable.

**Not done yet, in order:**
1. A `Color3` value type in the Luau API. Colours are `Vector3` today, which is wrong against Roblox's API.
2. Slopes, stairs (step height 1.1) and moving platforms, measured.
3. The reference obby, part by part through the gate.
4. Climb and swim poses.
5. Phone frame rate on real hardware.
