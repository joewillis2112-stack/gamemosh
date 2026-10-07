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
