# Claude Studio

A game studio in the browser, usable from a phone: build a game (parts, characters, scripts, lighting), press Play, share a link. Games are scripted in **Luau** (Roblox's language, open source under MIT) against a Roblox-style API re-implemented from Roblox's public documentation. No Roblox code, assets or branding.

Started 2026-10-07. Built over many sessions, so this file is the map.

## What it is (from the user, 2026-10-09)

**A framework for making anything, not a Roblox replica.** It must range from blocky, Roblox-style games to realistic ones, with creator tools in the spirit of Blender and Adobe's suite (model, sculpt, paint, animate, vector, motion, sound) to make either.

- The Roblox-style Luau API is the **baseline**, so scripts and know-how carry over. It is **not a ceiling**:
  - where Roblox has a limitation or a wart, we can do better, and should when it helps creators (example: platforms moved by a tween carry the player here);
  - "differs from Roblox" is a note, not a defect.
- Every system is built for the full range:
  - materials and lighting go from flat plastic to photoreal PBR;
  - characters can be blocky rigs or realistic skinned meshes;
  - UI goes from a simple label to a styled HUD.
- **Roblox's own UI and look are not targets.** Its player list, top bar and menus are Roblox's product, not the framework's. Anything like them is an optional template that creators switch on, never a default in every project.
- **The tools we borrow from can be studied exactly**, as the games are (user, 2026-10-09). Blender is open source, so its algorithms (subdivision, bevel, modifiers, sculpt brushes, the node system) can be read directly. Adobe's tools can be reverse-engineered, or matched through open equivalents that copy them (Krita and GIMP for raster, Inkscape for vector). Aim for "behaves like Blender", checked against Blender, not "inspired by".
- Quality before quantity still holds. Range comes from each piece being general and finished, not from many half-done pieces.

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

Reference for the editor (Phase 2), posing and motion (Phase 5): ArtCraft, an open-source (MIT/Apache) AI staging app with a three.js scene editor. What to port and what not to: `ARTCRAFT.md`.

0. **De-risk:**
   - Luau builds to wasm and runs a script that touches a JS-side `Instance`.
   - Pick the renderer (three.js or Babylon.js) by building the same reference scene in both and measuring them on a phone profile.
   - Set up the turntable and golden-screenshot tooling.
1. **The player:** DataModel, parts, materials, lighting and sky, physics, one character with animations, camera, touch controls, Luau scripts with events. **Gate:** a reference obby (parkour course) that passes the asset gate, part by part.
2. **The editor:** Explorer, Properties, gizmos, Insert, Play/Stop, save and load. It must work by touch.
3. **The creator suite** (from the user, 2026-10-08: "don't just stop at Roblox Studio"). These are tools inside the studio, rebuilt from how the professional tools behave, each producing assets the game uses directly. Every tool's output still goes through the asset gate. Build order, by what games need most:
   1. **Animate** (the animation editors of Blender, Maya and Roblox's Moon Animator): a timeline, keyframes per joint, curves (linear, bezier, ease), onion skin, IK for limbs, and clips that the runtime animator plays. It starts on the character rig we already have, and its first job is to replace the jump and fall poses I wrote in code.
   2. **Model** (Blender's mesh editing): vertex, edge and face selection; extrude, inset, bevel and loop cut; mirror; UV unwrap; rigging (bones, weights). Exports glTF. Sculpting comes later.
   3. **Paint** (Photoshop and Substance Painter): layers, blend modes, brushes, masks and fills, painting straight onto a model's UVs, plus PBR channels (albedo, roughness, metal, normal). The output is a material for the game's material set.
   4. **Vector** (Illustrator): paths, shapes and text for HUDs, icons and logos, exported as UI assets for `ScreenGui`.
   5. **Motion** (After Effects and Premiere): a timeline for cutscenes and UI animation, with camera moves, tweens and effects, played in game.
   6. **Sound:** a sound-effect designer and a simple mixer.

   Each tool gets the same treatment as the player: a reference for how the real tool behaves, measured behaviour, and goldens of what it produces. One tool at a time, finished before the next starts.
4. **Prompt to game.**
5. **Multiplayer.**

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
    - Corrected 2026-10-08: that 8% was a mean over steps, and alternate steps cancelled. Per step, feet skated ±25% of body speed. These clips' legs mirror each other, so the planted sweep is slow on one step and fast on the next (6 vs 13.5 studs/s in walk), and no single rate fits both. Now the clip's rate varies through the cycle: while a sole is on the ground, the clip advances so the sweeping sole moves at exactly the body's speed (walked through a 240 Hz table of the measured sole speed, since it jumps between keyframes); in the air it plays at the mean rate. `feet.mjs` checks every step: the worst is 0.01 studs/s at all stick deflections. Walk vs run is Roblox's choice (run from 9.6 studs/s, the middle of Animate's 6.4–12.8 crossfade band).
    - Fixed (2026-10-09): stripes at the hip when running. I first blamed the arm passing through the hip, and that was wrong. Hiding parts one by one showed the cause: each leg's outer face lies in the torso's side plane, and a swinging leg keeps it there, so the two z-fight wherever they overlap. The legs are now 2% narrower and the arms 0.01 stud further out, both invisible. `test/scenarios/rig.mjs` checks that no two body parts share a visible face plane in idle, walk or sprint.
  - Jump and fall are held poses in `web/runtime/poses.js`, shared with the turntable (`--pose jump|fall`). Both passed the gate; goldens are saved.
- **Camera:** `web/runtime/camera.js`. Orbits the head at zoom 12.5 (0.5–128), pitch ±80°, FOV 70°.
  - Pulls in when a part blocks the view (measured 3.46 against a computed 3.46), then eases back out.
  - First person below 1.5 studs.
- **Controls:** `web/runtime/controls.js`. All of these are tested through real events:
  - WASD/arrows and Space;
  - mouse drag turns (right looks right) and the wheel zooms;
  - touch: a thumbstick that appears under the left thumb, a jump button bottom right, drag to look, pinch to zoom.
- **Goldens:** `goldens/play/` holds the idle, run, jump and fall in-game views and the phone HUD. `tools/golden.mjs` is shared with the turntable.

**2026-10-08 additions:**
- **`Color3`** is a real Luau type, not a vector:
  - `new`, `fromRGB`, `fromHSV` and `fromHex`;
  - `R`, `G` and `B`;
  - `Lerp`, `ToHSV` and `ToHex`;
  - equality and tostring;
  - read-only components;
  - `Part.Color` rejects a `Vector3`, as Roblox does.

  Tested in `test/luau.test.mjs`. The in-game goldens were unchanged by the switch.
- **The hover controller (Roblox's way).** The collision capsule starts `StepUp` (0.8) above the feet. Physics floor rays and a spring hold the body there, with slope feed-forward so horizontal speed stays at WalkSpeed on ramps. `places/movement-lab.luau` with `test/scenarios/slopes.mjs` measured:
  - ramps from 15° to 75° are 100% grounded up and down, with no fall flicker (`MaxSlopeAngle` 89°, Roblox's documented default);
  - steps of 0.5–0.8 are seamless, 1.0 runs at 93% speed (the "slight hop" Roblox players describe), 1.2 at 63%, and 1.5 and above block.

  Roblox doesn't document a step height. Its forum says about 0.8 is seamless and 1 gives a slight hop, which matches what we measured.
- **Auto-jump on touch** (`AutoJumpEnabled`, touch only, as documented by Roblox). `test/scenarios/autojump.mjs`:
  - a 2-stud flight on the thumbstick is hopped up automatically;
  - the keyboard stays blocked;
  - a 10-stud wall never triggers it.

**2026-10-08, later:**
- **Right-handed, like Roblox.** The scene used Babylon's default left-handed system, which mirrored every place: looking down -Z, +X was on the left. Physics and data were unaffected, because the math is the same and only the view mirrored. Now:
  - the scene is right-handed;
  - camera-relative right is forward × up;
  - dragging right looks right (the test checks what "right" means on screen, not a sign);
  - `Orientation.Y = 0` means facing -Z, as in Roblox;
  - the camera snaps behind the character on spawn.

  Every golden was re-judged and re-saved. The turntable's side view is labelled for what it actually shows: the character's left, seen from +X.
- **`Enum`.** `Enum.Material.*`, `Enum.PartType.*` and `Enum.NormalId.*` use Roblox's documented values. EnumItems are cached, so `==` works, and they expose `Name`, `Value`, `EnumType` and `:GetEnumItems()`. Enum properties accept an item, its name or its number, and reject anything else with Roblox-style errors.
- **`Decal` and `Texture`** on any face, drawn as an overlay with a depth offset. A Texture tiles in studs. The baseplate is now Roblox-shaped: Plastic with a `studio://grid` Texture on top. My invented "Baseplate" material is gone.
  - Plastic's roughness went to 0.75 (matte, as Roblox's reads), which restores the judged look; the goldens differ by 1.7%, from grid-line antialiasing only.
  - The grid's alpha is 0.21, because blending happens in linear light.
- **Players, Player, character Model, Humanoid, HumanoidRootPart** (`web/runtime/players.js`). `places/players-lab.luau` with `test/scenarios/players.mjs` runs obby scripts written the Roblox way. Covered:
  - PlayerAdded, then CharacterAdded a frame later (so handlers connect in time);
  - Touched and TouchEnded from exact oriented-box tests;
  - a live speed pad (31 studs/s measured at WalkSpeed 32);
  - a checkpoint (`RespawnLocation`);
  - a kill brick: Died and the die clip, then respawn after `RespawnTime` at the checkpoint with a new character;
  - a teleporter (`HumanoidRootPart.Position`), `Humanoid.Jump` set from scripts, `TakeDamage`, `FallenPartsDestroyHeight`.

  The dead body is placed so its measured lying footprint doesn't cut into parts.
- **`WedgePart`** (and `Part.Shape = Wedge`): the slope faces front (-Z) as in Roblox, flat-shaded, with a convex-hull collider. `places/parts-lab.luau` with `test/scenarios/parts.mjs` shows every shape from the front, the side, behind and above, with goldens.
- **`tools/test-play.sh`** runs every scenario and fails on any golden mismatch (`npm run test:play`).

- **The reference obby: `places/obby.luau`.** Six stages over dark lava with a checkpoint after each:
  1. stepping stones;
  2. offset beams beside a neon kill strip;
  3. a wedge climb to a ledge, then a jump down;
  4. upright cylinder pillars;
  5. platforms that vanish 0.6 s after you touch them and return 3 s later;
  6. 3-stud jump stairs to a neon finish.

  It's built only from parts that passed the gate, and its scripts are written the way Roblox creators write them.
  - `test/scenarios/obby.mjs` is a playtest bot. It steers to each platform and jumps when the ground ends or a step is too tall, through real physics, and **finishes in 15.9 s with no deaths**. The checkpoint and finish scripts fire.
  - `obby-look.mjs` shoots each stage; the overview and wedge shots are goldens.
  - The floor was chosen by comparison. Bright lava swamped every frame. A sky void gave no shadows to judge landings by, and showed the HDR's streaky lower half. Dark lava (120, 28, 12) won.

**Known gaps:**
- ~~Places with no ground show the HDR sky's mirrored lower half.~~ Fixed (2026-10-08): a skybox material plugin fades the sky below the horizon to the haze colour, deepening to a bluer haze further down. A flat haze disc had looked worse.
- A soft line remains where fully fogged ground meets the sky's horizon band, which is lighter than the haze colour. Roblox's Atmosphere matches haze to the sky; ours should sample the sky's horizon colour per direction.

**2026-10-08, polish pass ("quality before quantity"):**
- **Roblox's defaults, from its shipped scripts** (`mashup-research/ROBLOX_DEFAULTS_2026-10-08.md`, spot-checked against the Animate script):
  - Camera:
    - 15° pitch on spawn;
    - zoom 0.5–400 with Roblox's step formula and a 4.5 Hz spring;
    - first person below 1 stud, with the character fading as the camera closes in;
    - mouse 0.5°/px (vertical ×0.77), touch 1°/px (vertical ×0.66);
    - arrow keys turn the view 120°/s;
    - Follow mode on touch, held off for 2 s after a drag.
  - Touch:
    - stick zones (portrait: bottom 40%; landscape: left 40%, bottom 2/3);
    - 2 px dead zone, full speed at 20 px (both ×2 on big screens);
    - ring 74 px, thumb 45 px, a dot trail, and a hint ring before the first touch;
    - jump button 70 px at (1,−95,1,−90), or 120 px on big screens.
  - Animate: jump fades in over 0.1 s and holds 0.31 s, then fall over 0.2 s; walk and idle over 0.2 s. The fall pose sways.
  - Health regenerates 1%/s.
- **Sound** (CC0: Kenney and OpenGameArt, `assets/sounds/README.md`), following RbxCharacterSounds:
  - volume 0.65 with a 5/d roll-off;
  - jump on takeoff;
  - landing only above 75 studs/s;
  - fall wind fading in at 0.9/s;
  - death on Died.
  - Footsteps play on the animation's actual foot contacts (3.5 steps/s and a 4.6-stud stride when running), where Roblox loops one blind clip.
  - Loops are made seamless at load (MP3 padding trimmed, 50 ms equal-power crossfade).
  - Nobody has listened to them yet: a human should.
- **Independent review** (`REVIEW_2026-10-08.md`): 4 high and 12 medium findings, nearly all fixed with tests (see its Status table):
  - inside-out wedges (with a mesh check added to the gate);
  - Touched on walls and ceilings, with exact shapes;
  - the dead body's footprint, and the body resting on the floor;
  - events running after Disconnect;
  - cylinder colliders;
  - property-change rebuilds and the material leak;
  - Changed semantics, WaitForChild, locked metatables, and Vector3 typeof and methods.
  - Low findings after that: walk/sprint hysteresis, `Workspace.FallenPartsDestroyHeight` (fallen parts destroyed), Humanoid `Running`/`Jumping`/`FreeFalling` as Roblox fires them, slope decals on wedges, non-colliding unanchored parts that still fall. Tested by `humanoid-events.mjs` and the parts goldens.

- **Scripting API gaps, found by reading what real Roblox scripts touch first:**
  - `CFrame` (done): a C++ userdata in the binding with Roblox's constructors (`new` in all its forms, `lookAt`, `Angles`, `fromEulerAnglesYXZ`, `fromOrientation`, `fromAxisAngle`, `fromMatrix`, `identity`), operators, vectors, object/world-space methods, Euler and axis-angle readback, `Lerp` (slerp). Parts store a CFrame; `Position` and `Orientation` are views of it, each firing its own `Changed`. Setting `HumanoidRootPart.CFrame` teleports and turns the character. `PivotTo`/`GetPivot` on parts and models. Tests: `test/luau.test.mjs` (expectations from Roblox's documented behaviour) and `test/scenarios/cframe.mjs` (in-engine, mutation-checked). Unknown: Roblox's `lookAt` result when looking straight along the up vector.
  - Scripts as instances (done, 2026-10-09): a `Script` runs under Workspace or ServerScriptService; a `LocalScript` under PlayerGui, Backpack, PlayerScripts or the player's character. Each starts once, deferred to the next resumption point, and a disabled one starts when enabled. `require(ModuleScript)` runs a module once and caches it, with Roblox's errors (one return value; recursion). `Instance:Clone()` copies Archivable descendants and remaps references inside the copy. Spawning copies StarterPlayerScripts once, and StarterCharacterScripts, StarterGui (honouring ResetOnSpawn) and StarterPack on every spawn. Tests: `luau.test.mjs` and `scripts.mjs`, mutation-checked. Not yet: stopping a destroyed script's threads; modules that yield.
  - `RunService` (done): each frame fires PreAnimation, PreSimulation/Stepped, then physics (Havok, then the character), PostSimulation/Heartbeat, then `task.wait` threads resume, then PreRender/RenderStepped and the camera, as Roblox's docs order them. Also `time()`, `tick()`, writable shared `_G` and `shared` (the sandbox had frozen `_G`), and the container services (ReplicatedStorage, ServerScriptService, …). Test: `test/scenarios/runservice.mjs` (order, deltaTime, a Heartbeat spinner turning exactly 180°; mutation-checked). Not yet: `BindToRenderStep` (needs functions passed to the engine).

- **Loose parts and materials, after a self-review asked "is it up to standard?" (2026-10-09). A probe found three physics faults no test covered, and materials that were mostly fake:**
  - Physics now steps at 240 Hz, Roblox's rate. At 60 Hz, a stack of 5 boxes sank 0.17 studs and wobbled at 1–2 studs/s; now it rests (0.007).
  - Roblox's per-material physics comes from the creator docs' table (`web/runtime/physprops.js`, all 43 materials): mass = density × the shape's real volume, and friction and elasticity per material, so plastic bounces (4.48 studs from a 19-stud drop, theory 4.75) and wood less.
    - Deviation: Roblox combines two parts' values with weights; Havok can't, so we take the plain mean. This is exact for weight-1 pairs and not for Ice, Sand, Rubber, Brick, Concrete and some others (ice under plastic: µ 0.16 here, 0.09 in Roblox).
  - The character shoves loose parts. Babylon's controller pushed with ~0.5 impulses; ours pushes toward walking speed with at most 10,000 units of force (our number; Roblox doesn't document its own), so a 4-stud plastic crate slides and a 4-stud metal block holds.
  - Textured materials, 14 of them (Wood, WoodPlanks, Brick, Cobblestone, Concrete, Grass, Sand, Granite, Marble, DiamondPlate, CorrodedMetal, Fabric, Pebble, Ice):
    - CC0 from ambientCG, baked by `tools/bake-materials.py` (greyscale albedo tinted by the part's Color as Roblox does, normal map, AO/roughness/metal), box-projected UVs in studs;
    - tiles judged in `places/materials-lab.luau` (brick courses meet at corners, mortar recessed on every face).
    - The rest of Roblox's list still renders as Plastic, but now has the right physics.
  - Tests: `physics.mjs` (7 checks) and `materials.mjs` (4 checks plus 2 goldens), mutation-checked.

**Not done yet, in order:**
1. Moving and spinning parts.
   - Done: any moving floor carries the character (2026-10-09, past Roblox).
     - Each anchored part's motion is measured every frame (`World.trackMotion`), so platforms moved by a tween, by CFrame in a script, or spinning, all carry. In Roblox they don't, and creators must work around it; the workaround (also setting the velocity) still works and isn't counted twice.
     - Conveyors (an anchored part with `AssemblyLinearVelocity` set) and physics-moved parts carry too, at the contact point (linear + angular × r). A spinning floor turns the character with it.
     - Leaving a moving floor keeps its motion through the air, as Roblox's newer controller does, so a jump on a moving platform lands back on the same spot. A platform that teleports (more than 300 studs/s or 1 rad in a frame) carries no one.
     - `test/scenarios/platforms.mjs`: 11 checks, mutation-checked.
   - Done: TweenService (`web/tween.js`, `TweenService`/`Tween` in `web/datamodel.js`, `TweenInfo` userdata in the binding, which can now also pass Luau tables to the engine).
     - Follows the docs: `TweenInfo.new` defaults (1, Quad, Out, 0, false, 0); Play starts from current values; a newer tween on the same property cancels the older; Pause keeps progress (Playing only); Cancel resets progress but leaves the properties; `Completed(PlaybackState)` on finish or Cancel, not Pause; PlaybackState Begin/Delayed/Playing/Paused/Completed/Cancelled; numbers, bools, enums, Vector3, Color3 and CFrame (slerp) tween; mismatched types error.
     - Easing: Penner curves, with Back and Elastic in the forms a DevForum author fitted to Roblox's `GetValue`. Only `GetValue(0.5, Bounce, In) = 0.234375` is checked against a printed Roblox value; the rest needs Roblox itself to confirm.
     - Ours where Roblox is silent: the delay is waited once; a reversing cycle is there and back; tweens step just before physics.
     - Tests: `test/tween.test.mjs` (mutation-checked) and a tween in `platforms.mjs`.
   - Later: constraints (Prismatic, Hinge motors, AlignPosition).
2. HUD.
   - Done (2026-10-09): the GUI system, from `mashup-research/ROBLOX_GUI_2026-10-09.md` (defaults and rules from the creator docs).
     - Datatypes `UDim`, `UDim2`, `Vector2` (C++ userdata in `luau/gui_types.h`: constructors, arithmetic, `Lerp`, Roblox's `tostring`).
     - Classes: `ScreenGui`, `Frame`, `TextLabel`, `TextButton`, `ImageLabel`, `ImageButton`, and the modifiers `UICorner`, `UIStroke`, `UIPadding`, `UIListLayout`, `UIAspectRatioConstraint`, `UITextSizeConstraint`. `PlayerGui` gets a copy of `StarterGui` on each spawn (honouring `ResetOnSpawn`).
     - A DOM renderer (`web/runtime/gui.js`): Roblox's layout rules (UDim2 against the parent, `AnchorPoint`, the 58 px top inset unless `IgnoreGuiInset`, `DisplayOrder`, sibling `ZIndex`), `AbsolutePosition`/`AbsoluteSize` written back for scripts, `TextScaled` (largest size at which the wrapped text fits), `RichText` (b, i, u, s, font color/size/face, br), `TextWrapped`, alignment, `TextStrokeTransparency`.
     - Buttons: `MouseButton1Down/Up/Click`, `Activated` and `MouseEnter/Leave`; a click fires only when the release is inside the button, as in Roblox. Input on a button never reaches the camera, so dragging off a button on a phone doesn't turn the view.
     - Fonts: OFL stand-ins for Roblox's `Enum.Font` (Gotham → Montserrat, FredokaOne → Fredoka, SourceSans, Arcade → Press Start 2P, and others), in `assets/fonts/`.
     - `places/gui-lab.luau` with `test/scenarios/gui.mjs`: 7 checks on desktop, 9 on a phone, plus 2 goldens, mutation-checked (inset, release check, TextScaled).
     - Not yet: `ImageColor3` tint, `ZIndexBehavior.Global` (drawn as Sibling), `UIGridLayout`, `UIGradient`, `UISizeConstraint`, `ScrollingFrame`, `TextBox`, `ViewportFrame`, `BillboardGui`/`SurfaceGui`. `AutoButtonColor`'s tint amounts are ours.
   - Done (2026-10-09): leaderstats and the player list (`web/runtime/playerlist.js`), ported from Roblox's own legacy PlayerList CoreScripts (v0.719; `mashup-research/ROBLOX_GUI_2026-10-09.md` §7b).
     - Columns: IsPrimary first, then Priority, then creation order, at most 4. Rows: highest first stat first, ties by name, players without the stat last. Numbers get thousands separators.
     - The look: top right under the top bar, a black panel at 0.3 transparency with 4 px rounded caps, a 20 px header and 40 px rows, Builder Sans sizes (Nunito stands in), the local player in white.
     - Tab toggles it; `StarterGui:SetCoreGuiEnabled`/`GetCoreGuiEnabled` with `Enum.CoreGuiType` (All included).
     - **Opt-in (2026-10-09):** off unless the project calls `StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, true)`. Roblox's own UI isn't a default here (see "What it is").
     - Ours: the abbreviation format for numbers of 7+ characters (three significant digits, truncated, K/M/B/T; Roblox's is unpublished); no status icons or player dropdown; on a phone, the desktop panel with one column instead of Roblox's separate small-screen layout.
     - `places/leaderstats-lab.luau` with `test/scenarios/leaderstats.mjs`: 10 checks on desktop, 6 on a phone, 2 goldens, mutation-checked (sort direction, IsPrimary, abbreviation length, top bar offset, SetCoreGuiEnabled).
3. **Range: real models and realism** (re-ranked 2026-10-09 after the user restated the direction).
   - Done: **glTF import, measured against Khronos** (`runtime/gltf.js`; `mashup-research/GLTF_FIDELITY_2026-10-09.md`).
     - `tools/fetch-fidelity.sh` and `tools/fidelity.mjs` render Khronos Render Fidelity scenarios through our import path and diff them against Babylon's golden and the glTF Sample Viewer's (ground truth).
     - We turn off Babylon 9's radiance/irradiance mixing for imported materials, measured closest to ground truth. 13 of 14 scenarios are within 2.1/255 of Babylon's golden; BoxTextured is an open outlier.
     - A baseline (`test/fidelity-baseline.json`) runs in `test-play.sh` when the fixtures are fetched, mutation-checked.
   - Done: **MeshPart** (Roblox's names: MeshId, TextureID, DoubleSided, RenderFidelity, CollisionFidelity, read-only MeshSize; `AssetService:CreateMeshPartAsync`).
     - Each file loads once and is instanced per part. Materials are cloned per part, so DoubleSided and TextureID can differ.
     - `Size` stretches the mesh's box. glTF metres become studs at 0.28 m.
     - Colliders: Box, Hull, or for Default and Precise the exact triangles when anchored (Roblox decomposes) and the hull when loose.
     - Mass is density times the mesh's own enclosed volume.
     - Beyond Roblox: scripts can set `MeshId` at run time, `MeshId` takes a URL to a .glb/.gltf, and the file's own PBR materials (and KHR extensions) are kept without a SurfaceAppearance.
     - Engine calls can now yield: a method returns a `Yield`, the binding suspends the script on a one-shot event, and `dm.async(promise)` resumes it with the results. A failed load warns and returns nothing; Roblox would raise.
     - `places/mesh-lab.luau` with `test/scenarios/meshes-gltf.mjs`: 8 checks and 2 goldens (wide, and a close-up of the helmet), mutation-checked (centring, units, colliders, volume, script Size, Transparency).
   - Not yet:
     - whole-scene import as a Model of MeshParts (`InsertService:LoadAsset`-style), keeping the hierarchy;
     - playing a file's animations and skins from scripts;
     - SurfaceAppearance;
     - decals on MeshParts;
     - Color tinting a file's materials;
     - a raised error on a failed load.
   - **Rendering range: the Lighting service and a time-of-day sky (2026-10-09).**
     - Semantics from `mashup-research/ROBLOX_LIGHTING_2026-10-09.md`. A new place gets a Baseplate's Lighting values and children: Sky, SunRays, Atmosphere, Bloom, DepthOfField.
     - Sun and moon from ClockTime and GeographicLatitude; `GetSunDirection`/`GetMoonDirection`; TimeOfDay and ClockTime kept as one value; `SetMinutesAfterMidnight`.
     - Exposure in stops; GlobalShadows; environment diffuse and specular scaled separately; Atmosphere fog (else FogStart/FogEnd); Bloom; ColorCorrection contrast and saturation.
     - LightingStyle Realistic adds SSAO, seeded so renders are deterministic, tuned against Blender Cycles: strength 2, radius 0.5 m. 1 m scored slightly better on the tuning scenes but left halos in the world.
     - Sky (`web/runtime/sky.js`): a photo with its baked sun removed. It is graded per texel on the CPU by the sun's position (sunset band and glow, night, stars, sun and moon discs), then prefiltered and given harmonics like a loaded HDR. With grading off it equals the static environment (fidelity check). The photo turns so its lit clouds face the sun.
     - `places/lighting-lab.luau` with `test/scenarios/lighting.mjs`: 12 checks, 5 goldens (default, Realistic, sunset, night, flat), desktop and phone, mutation-checked (sky mapping, skybox texture sharing, SSAO, diffuse scale).
   - **Local lights (2026-10-10):** PointLight, SpotLight and SurfaceLight (`web/runtime/locallights.js`), per research section 7.
     - Defaults come from rbx-dom; Range is clamped to 120 and Angle to [0, 180]. A light is drawn only as a direct child of a part, and follows it.
     - Falloff is linear to zero at Range (ours; Roblox's curve isn't published). Brightness scales the light, not its reach.
     - SurfaceLight is a spot set back behind its face so its cone spans the face (ours).
     - Soft: no local specular and no local shadows. Realistic: both, with Shadows on up to 4 lights (2 on phone). A light's own part is left out of its shadow casters.
     - Light budget: a mesh shades at most 8 local lights (4 on phone), the ones nearest the camera, re-chosen every 10 frames and at once when a light turns on or off. Babylon's own first-come choice made a big floor flicker.
     - `places/lights-lab.luau` with `test/scenarios/lights.mjs`: 18 checks and 2 goldens, desktop and phone, mutation-checked (falloff edge, face direction, specular in Soft, the budget).
     - Not yet: lights under Attachments (no Attachment class yet) and in character parts; more lights per mesh than the budget (Babylon's clustered lighting supports only its default falloff and no shadows, so it's for later).
   - **Post effects (2026-10-11):** `web/runtime/posteffects.js`, per research section 5. Each pass exists only while its effect does, and all run after Babylon's tonemap, kept last when the pipeline rebuilds.
     - ColorCorrection: every enabled instance composes into one affine transform (Brightness adds, TintColor multiplies, Saturation lerps from grey, Contrast about 0.5, which is our pivot). It replaces the old partial mapping.
     - Blur: the largest Size wins.
     - DepthOfField: sharp within FocusDistance ± InFocusRadius studs, ramping over the radius (ours) to Far/NearIntensity. The blur weights each tap by its own blur amount, so in-focus things don't halo; the size scales with resolution.
     - SunRays: a march toward the sun counting sky pixels, Henyey-Greenstein shaped. Spread maps to g, and the post-tonemap screen-blend scale is ours. Off on phones, as Roblox gates it by quality.
     - Found on the way: removing an effect never dirtied the lighting (the change watcher checked the new parent, nil), so destroyed effects lingered.
     - `test/scenarios/posteffects.mjs`: 16 checks, 3 goldens, desktop and phone, mutation-checked.
     - ColorGradingEffect (2026-10-11): TonemapperPreset Default is the filmic curve we already used (ACES); Retro, "less saturated, less contrast" per Roblox's docs, is Babylon's exponential curve at contrast 1 (ours: Roblox doesn't publish its curve). Only under Lighting; the most recently parented one counts, and a disabled one means Default (UNSURE: whether Roblox then falls back to an older one). Checked by contrast and saturation over the screen, desktop and phone; golden post-retro; mutation-checked.
     - Not yet: Clouds. (Effects under the CurrentCamera count, now that it exists.)
   - **ShadowSoftness (2026-10-11):** Realistic only, as Roblox documents. It sets the light size of contact-hardening sun shadows (scale ours: 0.3 at softness 1; 0.5 all but erased a wall's shadow). Checked by the penumbra width across a wall's shadow edge, desktop and phone, mutation-checked.
   - **Raycasting (2026-10-11):** `workspace:Raycast(origin, direction, params)`, `Ray`, `RaycastParams`, `RaycastResult`.
     - The datatypes are Luau (`luau/lib_raycast.h`), and `typeof` names them. The geometry is exact JS (`web/raycast.js`): boxes and rotated boxes, spheres, cylinders, wedge slopes.
     - Roblox's rules: the nearest part the ray enters (not one it starts inside), CanQuery, RespectCanCollide, Exclude/Include filters over descendants, a copied filter list, read-only results.
     - `test/raycast.test.mjs`: 22 checks against hand-worked answers, mutation-checked.
     - Not yet: MeshParts (they cast as their box until the renderer's triangles are hooked in), character body parts beyond HumanoidRootPart, collision groups, terrain and water, Shapecast/Blockcast/Spherecast, GetPartBoundsInBox and the other spatial queries.
   - **Camera (2026-10-11):** `workspace.CurrentCamera`, a Camera child of the Workspace as in Roblox.
     - Custom: the engine writes CFrame, Focus and ViewportSize (canvas CSS pixels) each frame, before RenderStepped, as Roblox's camera scripts run at render priority Camera. A RenderStepped handler that moves it (camera shake) is drawn that frame and doesn't accumulate.
     - Scriptable: the engine leaves it; the script's CFrame is drawn, roll included. FieldOfView (vertical, clamped to [1, 120]) applies in both.
     - CameraSubject: the Humanoid on spawn; a part makes the camera follow that part, and the part doesn't block its own view (it did, at first: the golden showed the camera inside the block).
     - `WorldToViewportPoint`, `WorldToScreenPoint` (less the 58 px GUI inset), `ViewportPointToRay`, `ScreenPointToRay`.
     - `test/camera.test.mjs` (19 checks, hand-worked) and `test/scenarios/camera.mjs` (13 checks, desktop and phone): the projection lands on the pixels the part is drawn at, with roll and at FieldOfView 20. Mutation-checked.
     - Not yet: the other CameraTypes (Fixed, Attach, Watch, Track, Follow, Orbital behave as Custom), `Camera:Interpolate`, `GetPartsObscuringTarget`, `ZoomToExtents`, `BindToRenderStep`, the player's camera settings (`CameraMaxZoomDistance`, `CameraMode` LockFirstPerson), mouse lock.
   - Not yet: Sky skybox faces (custom skies), sky visibility for OutdoorAmbient (indoors vs outdoors), reflections beyond the sky (SSR or probes). SSAO halos remain on phone (half resolution): a better AO (GTAO, or thickness-aware) is the fix, not more tuning.
   - Next: the first Blender-class tool, mesh editing ported from Blender's source and checked against Blender.
   - **Character pipeline: 2D reference → blocky 3D → realistic 3D (from the user, 2026-10-10).** Send the studio a 2D character image; get a low-res character (Minecraft/Roblox-like) that plays in the studio; then turn that into a high-res, realistic model.
     - **Stage 1, image to blocky (deterministic, in the browser, no service):**
       - Find the body in the reference with a pose model (MediaPipe Pose, runs in the browser): head, shoulders, hips, knees, and so on.
       - Fit the studio's R6-style rig to those landmarks: part proportions within limits, so it still plays with the existing animations.
       - Project the reference's pixels onto each part's front faces at a chosen resolution (8 px per stud, Minecraft-like, up to Roblox-like). Fill the backs and sides from the edge colours, and the hidden faces from the palette. Hair and accessories become extra blocks where the silhouette sticks out past the rig.
       - Result: a Model with textured parts, editable like any other, and a Humanoid so it plays.
     - **Stage 2, blocky to realistic (generative; needs a model service):**
       - The blocky character alone has too little information, so the original reference goes in as well.
       - Render the blocky character from 4 views (front, back, sides) with depth and normals. An image model, conditioned on those maps (ControlNet-style) and styled by the reference, paints realistic views that keep the blocky character's pose and proportions.
       - Multi-view to 3D gives a detailed textured mesh.
       - Rig it by carrying over the blocky rig's joint positions, so the realistic model plays with the same animations and scripts.
       - Remesh to a budget for phones, with LODs.
     - Stage 2 can't run deterministically in this container (no GPU). Its checks: silhouette and colour match against the reference, joint positions within tolerance of the blocky rig, and the asset gate on the result.
     - **No paid service (the user, 2026-10-10).** The free route is Hugging Face Spaces on free ZeroGPU hardware, called with `gradio_client` (`.cache/hf-venv`). Checked running on 2026-10-10:
       - `black-forest-labs/FLUX.1-Kontext-Dev`, `/infer`: edit the reference into a realistic version, same outfit and pose.
       - `tencent/Hunyuan3D-2`, `/generation_all`: image to textured mesh. It also takes front/back/left/right views, so the realistic edits of several blocky renders can go in together.
       - Anonymous calls failed at once ("exceeded your ZeroGPU runs limit"): this container shares its IP. A free Hugging Face account token (read-only) gives a daily quota. It goes in the environment's settings as `HF_TOKEN`, never in chat.
       - Offline fallback to evaluate: CPU-only models (SD-Turbo img2img for the restyle, TripoSR or Hunyuan3D-2mini shape on CPU). Slower and plainer, but unlimited.
     - Order: stage 1 first (testable here, end to end, against the reference image), then stage 2 once a model service is available.
     - **Stage 1 built (2026-10-10):** `web/runtime/charmaker.js`, the page `web/maker.html`, and `tools/charmaker.mjs` (CLI: outlined parts, face nets, skin).
       - The rig and animations stay the studio's own blocky character; only its skin texture is new, painted through the model's own UVs. So a made character moves exactly like the default one, and that's tested.
       - Parts from the silhouette: legs where it splits at the bottom; neck as the deepest narrowing below the head's widest row; arms as runs separated from the body below the neck (else the rig's proportion). A creator drags any box edge to correct it.
       - Pixels: a median-cut palette (cuts moved to colour boundaries, so flat art keeps exact colours). Each cell is one palette colour, chosen by a vote weighted by contrast with the part's main colour. Small high-contrast blobs (eyes, teeth, buttons) are stamped into the cell under their centre, so faces survive at 8 px.
       - Hidden faces: a head or torso back takes each row's edge colour (hair, shirt, no face); limbs mirror their front; sides carry the edge columns; the head's top is the hair colour.
       - Detail: 8 (Minecraft-like), 16 (default) or 32 cells across the head.
       - Tests:
         - `test/charmaker.test.mjs`: 5 CC0 references against judged neck and crotch rows; a synthetic test card with known boxes and an asymmetric mark (left/right/up land on the right faces); every covered texel painted, plus a 2 px bleed; an inverted box handled; deterministic output.
         - `test/scenarios/charmaker.mjs`: a 191-frame walk, jump and turn trace with a made skin equals the default skin's frame for frame; the test card's arm colours on the correct sides on screen; a golden.
         - `test/maker.test.mjs`: the page on desktop and phone (touch drag), through to playing as the character.
         - All mutation-checked.
       - Not yet: hair and accessories as extra blocks (anything outside the head box is cut); body proportions from the reference (the rig is fixed); side and back views as optional extra references; non-front poses; photos (works only where the background is plain or transparent).
     - **Stage 2 built (2026-10-11):** `web/runtime/rigmesh.js` rigs any generated model to the blocky rig; `tools/stage2/` generates one on CPU (TripoSR). Details, routes and setup in `tools/stage2/README.md`.
       - Split: generating needs a big model, so it happens outside (a Python tool here, or any image-to-3D website on the creator's phone); rigging is plain JS in the browser (<1 s) and is what's tested. Any `.glb` plugs in.
       - Orient (24 unmirrored rotations scored against the drawing), cut (stage 1's boxes laid over the mesh), joints at the same place relative to each part as the rig's, weights rigid plus smoothed seams, the rig's clips with translation keys moved. Proportions follow the mesh.
       - The maker page has a "Realistic: rig a generated model" panel: load a `.glb`, preview, play, download.
       - Proved: physics identical to the blocky character for 191 frames; Babylon's own skinned vertices follow their joints mid-walk (5e-4 studs); no foot slip; the fixture's silhouette matches the drawing (IoU 0.92) and every part's colour does after one gain; orientation recovered from six turns; Khronos's validator reports nothing. Mutation-checked (8 mutations).
       - **Not realistic yet.** The CPU route gives the drawing's own style in 3D. SD-Turbo img2img can't make a cartoon realistic (tried to strength 0.9). Realistic needs FLUX.1 Kontext then Hunyuan3D-2 on ZeroGPU, and the `HF_TOKEN` in this environment is rejected by Hugging Face ("Invalid username or password"). The design above (blocky renders + ControlNet) is not built; with Kontext editing the drawing directly it may not be needed.
       - **Realistic route working (2026-10-11):** with the new token, FLUX.1 Kontext (a firm prompt: "a real photograph of a real adult man… not a toy, not a cartoon") makes a photo of a real person from the drawing; rembg cuts it out; Hunyuan3D-2 makes the shape; `tools/stage2/paint_cpu.py` textures it from the photo on CPU (Hunyuan's own texturing is out of free reach); `rigmesh` rigs it against the cutout. Example: `tools/stage2/examples/realistic-adventurer.glb` (and `.png`). Asset gate: front and head looked at, back looked at (blotchy), normals checked by ray casts (0 of 20000 inverted; the turntable's centroid metric false-flags concave bodies), validator clean, walk looked at.
         - Stage 1's `findParts` now handles a real person's proportions: the neck searched from 8% of the height if not seen from 20%, and an arm ends below its hand rather than at the feet standing in its columns. Judged on the photo cutout (`test/fixtures/characters/realistic-person.png`); the five cartoon fixtures unchanged.
         - The rigger severs fusions (arm to leg, arm to torso below the armpit) and caps the holes; on the TripoSR fixture too (241 faces), which removed skin stretched from hand to leg in its walk golden (re-saved after looking).
         - Hip flap fixed (fourth session): arm-column vertices below the crotch go to the nearer of arm and leg along the surface; tested on a wide-hipped mannequin with hands below the crotch, mutation-checked; walk golden re-saved (the swinging hand is whole now).
         - Multi-view built (CPU side tested, not yet run on real photos): extra Kontext views of the same person into Hunyuan3D-2mv, painted per face from the photo facing it. `test/paint_cpu.test.py` (Python, hf-venv).
         - Known defects: blotchy back; a thin ring at the bottom of a hand fused to the thigh moves with the leg. See the stage-2 README.
       - Not yet: a real Hunyuan3D-2 download through the page; textured meshes are tested only with a synthetic mannequin; proportions far from the drawing's (the cuts come from the drawing); T-poses; LODs.
   - **Mesh editing, done another way (2026-10-12):** the user pointed out that Blender's tools had surely been rebuilt in the open already, and they had: 3DOO (`renatolinsdigital/3doo`, MIT), a TypeScript rebuild of Blender's BMesh and its edit operations. Its kernel is incorporated as `web/modeling/kernel` (518 of its own tests pass here), bridged by `web/modeling/editable.js`, edited in the editor's Edit Mode (`web/editor/editmode.js`). The plan below (compiling Blender's own C, blocked by the permission rule) is dropped; nothing needs Blender's code to run.
     - MeshPart.MeshData (the studio's; Roblox's nearest is EditableMesh) holds the kernel's mesh in studs. World draws it with the part's Color and Material, two-sided (bent faces), collides with its triangles, and saves it in place files.
     - Edit Mode: Tab (a Part becomes a MeshPart first); 1/2/3 vertex/edge/face; click or tap to pick, Shift to add, A all; E extrude, I inset, Ctrl+B bevel, Ctrl+R loop cut, X delete, M merge, F fill, Subdivide; G/R/S with X/Y/Z and typed amounts; move arrows by touch; a "last operation" panel re-runs the step with new amounts. Every change is one undoable step; geometry that wasn't touched stays exactly where it was in the world (the part's CFrame follows the mesh's extent).
     - Insert any of the kernel's primitives (cube, spheres, cylinder, cone, torus, capsule, plane, grid, circle) as an editable MeshPart.
     - Tests: the kernel's 518, `test/modeling.test.mjs` (10, vitest: conversion, operators as commands, untouched geometry fixed in the world on a turned part, undo/redo exact, winding against Babylon's front faces, place files), `test/scenarios/editor-mesh.mjs` (desktop: keys and clicks through extrude, adjust, undo/redo, bevel, G X 2, Tab out, and a ball resting on the mesh in Play; phone: taps, the edit bar and a finger on the arrows). Mutation-checked.
     - Found: the kernel winds triangles three.js's way; Babylon's front faces wind the other way (already in RESEARCH §4e, missed at first: the mesh drew inside-out).
     - Next from the kernel, not yet exposed in the editor: knife, booleans (Roblox's Union/Negate), modifiers (mirror, array, solidify, bevel, subdivision surface, lattice), remesh, merge by distance, bridge, dissolve, loop and ring select, proportional editing, UV editing.
   - **Mesh editing, design (2026-10-09, superseded 2026-10-12 above):**
     - Compile Blender's own BMesh (v4.2.0, `source/blender/bmesh`, ~37k lines of core and operators) to wasm with emscripten, as Luau was, rather than hand-port it. Results then match Blender exactly: wasm floats are strict IEEE, like x86 SSE without FMA.
     - Oracle: Blender 4.2 as a Python module (the `bpy` 4.2.0 wheel, cp311, in `.cache/bpy-venv`). `bmesh.ops` runs Blender's C operators headless (`bpy.ops` needs UI context). Same inputs into both; compare vertex coordinates bit for bit, and topology in element order.
     - Done so far (in `.cache/`, not committed):
       - a sparse clone of Blender at v4.2.0;
       - all of BMesh, blenlib, guardedalloc and rangetree compile natively with g++ against Blender's own headers;
       - the linker's list of what's missing: CustomData (`blenkernel/intern/customdata.cc`, which needs makesdna's generated `dna_type_offsets.h`), custom-normal spaces (`BKE_lnor_*`), curve profile and bezier helpers (bevel), multires/MDisps, mesh conversion, BVH.
     - A strict-flags pragma needs a shim header, and `string_utf8.cc` has an inline `#pragma GCC diagnostic error` (compile a copy without it).
     - Every step that compiles or runs Blender's code is in `tools/blender-build.sh` (fetch, dna, native, probe, oracle), so one narrow permission rule covers it: `Bash(bash tools/blender-build.sh:*)` in the repo's `.claude/settings.json`, added by the user (a permission given in chat doesn't satisfy the auto-mode check).
     - **Blocked (2026-10-09):** the auto-mode classifier refused to run the makesdna binary built from Blender's downloaded source ("Code from External"). The plan runs Blender's code throughout (makesdna, the native probe, the wasm build in the browser), so this needs the user's permission rule.
     - First slice after that: CustomData (real, for UVs), stubs that abort for custom normals, multires and mesh conversion; a JS binding (build a mesh, run `create_cube`, `extrude_face_region`, `inset_individual`, `inset_region`, `subdivide_edges`, `bevel`, read the mesh back). Then the oracle comparison, then an edit mode in the studio that makes MeshParts.
4. Climb (TrussPart) and swim poses.
5. Phone frame rate on real hardware.
6. Then phase 2 (the editor) and the rest of the creator suite.

### Phase 2, 2026-10-12: the editor (first slice)

`web/editor.html` (`web/editor.js`, `web/editor/`), built after ArtCraft's scene editor (ARTCRAFT.md), ported onto our renderer and DataModel rather than embedded.
- The place is drawn exactly as the player draws it (same World, lighting, sky, post), with physics paused.
- **Commands and undo** (`editor/commands.js`, `editor/history.js`): every action is a named command (the Craft apps' rule), run as one undoable step. A Transaction records each property change and reparent with its before and after, so undo and redo replay the same ops. Delete parents to nil (as Studio does), so undo restores the instance whole. Commands: undo, redo, select, insert, delete, duplicate, group, ungroup, setProperty, move, rotate, commitDrag.
- **Selection:** a click selects the part under the pointer, or its topmost Model under Workspace (Alt: the part); Locked parts can't be clicked (new BasePart.Locked). Shift/Ctrl adds. A blue box marks each selection.
- **Tools** (Studio's Ctrl+1-4): Move (world arrows, 1 stud snaps), Rotate (world rings, 15° snaps), Scale (a handle per face; only that face moves, in whole studs). A drag changes the DataModel live and is recorded once at its end.
- **Explorer and Properties:** the instance tree (Studio's services, in its order) and the selection's typed properties, grouped by class; every edit is a command.
- **Camera:** right-drag looks, middle-drag pans, the wheel moves toward the cursor, WASDQE fly, F frames the selection. Touch: one finger orbits the point it started on, two fingers pan and pinch. A tap selects.
- **Insert** puts a part against the face the view hits (flush along the normal, snapped across it). UNSURE: whether Studio anchors inserted parts (ours does).
- Tests: `test/editor-commands.test.mjs` (22 checks: undo all returns exactly to the start, redo exactly to the end) and `test/scenarios/editor.mjs` with real mouse, keyboard and touch input (22 desktop, 21 phone, golden editor-move). Mutation-checked.
- Found on the way: Babylon's line shader isn't pulled in by the mesh builder (the selection box never drew), and line meshes made per frame never finish compiling (now pooled); Babylon's pick takes CSS pixels (scaling by the pixel ratio first broke every pick on phones).
- **Place files and Play/Stop (slice 2):** `web/placefile.js` saves the DataModel as JSON (Studio's saved services; per instance its class, the properties that differ from the class's defaults, its children; references as ids inside the file; engine-written and derived properties left out). All 13 places in `places/` round-trip exactly: build, save, load, save again is identical and every property matches (`test/placefile.test.mjs`). The editor's Save downloads it, Open loads one, Play hands the place to the player (sessionStorage) and the player's Stop comes back with the place as it was before Play (Studio's loop). The play page loads `.json` places too. Edit mode runs no scripts and no physics (`startLuau(..., { runScripts: false })`). `test/scenarios/editor-play.mjs`.
- **Modal transforms (slice 3, first half):** Blender's G/R/S (`web/editor/modal.js`, after ArtCraft's ModalTransformController, which only grabs): X/Y/Z constrain, Shift+X/Y/Z exclude, typed amounts, Enter/click confirm, Esc/right-click cancel, snapped unless Shift is held while moving. To free S, the camera now flies with WASD only while the right button is held (Unity/Unreal's convention; Studio flies without it). `test/scenarios/editor-modal.mjs`.
- **Animate (2026-10-12), done:** Roblox's animation API and Animation Editor, built the way ArtCraft builds posing (FKHelper) and its timeline (TimelineController), with animation-timeline-control (MIT, vendored) as the keyframe strip.
  - Data and runtime (`web/animation.js`, DataModel): KeyframeSequence, Keyframe, KeyframeMarker, Pose (nested by joint, weight 0 for unkeyed parents), Animation, Animator, AnimationTrack (Play/Stop/AdjustSpeed/AdjustWeight, TimePosition seeks, Looped, Priority, Length, IsPlaying, Weight*, GetTimeOfKeyframe; KeyframeReached, DidLoop, Stopped, Ended), Humanoid:LoadAnimation, KeyframeSequenceProvider:RegisterKeyframeSequence (ids `rbxtemp://n`), and `studio://<full name>` ids. Poses ease from the earlier pose (PoseEasingStyle/Direction); per joint the highest priority wins and same priorities blend by weight.
  - Rigs (`web/runtime/rigs.js`): any Model with a Humanoid and a HumanoidRootPart draws as the blocky character standing on its root part (NPCs and Rig Builder's dummy), posed by its Animator's tracks. The player's character takes its tracks over its own clips.
  - Joint frame: Pose CFrames are in the character's Roblox frame (+X its right, it faces -Z): `CFrame.Angles(rad(90), 0, 0)` on Right Arm raises it forward. R6 names map to our nodes (Torso, Head, Left/Right Arm/Leg). Where R6 differs: our legs hang from the root, so a Torso pose turns only the upper body.
  - Editor (`web/editor/animate.js`): Rig inserts a dummy; Animate opens the timeline; click or tap a limb (or its handle) to pick the joint; turning its ring keys it at the playhead (auto-key). The ruler moves the playhead; keys drag to retime, Delete removes, easing menus set style and direction, Loop, Space plays. Saved where Roblox's editor saves: ServerStorage.RBX_ANIMSAVES.<rig>.Animation. Every edit is one undo step; Play then runs it by script.
  - Tests: `test/animation.test.mjs` (sampling, easing, priorities, weights, frame conversion, the track clock and events), `test/scenarios/animation.mjs` (play: a rig and the player's character, by script), `test/scenarios/editor-animate.mjs` (desktop and phone, through to Play). Mutation-checked.
  - Not yet: IK, the root joint (our root pivots at the feet), onion skin, curves editor, KeyframeMarker signals (GetMarkerReachedSignal), the glb's own clips as Animations, and replacing the jump and fall poses written in code with sequences.
- **Terrain (2026-10-12), done:** Roblox's smooth terrain on SculptGL's SurfaceNets (MIT, vendored unchanged).
  - Data (`web/terrain/voxels.js`): 4-stud cells (cell 0 spans world 0..4), occupancy in 8 bits and one of Roblox's 22 terrain materials, sparse 16-cell chunks. Fills set occupancy from the shape's signed distance at each cell centre (the share of the cell a plane would fill), so meshing at 0.5 puts the surface where the shape is. Saved in place files on the Terrain node, run-length and base64.
  - API on `workspace.Terrain` (always there, as in Roblox): FillBlock, FillBall, FillCylinder (along the CFrame's Y), FillWedge (as a WedgePart), Clear, CountCells, WorldToCell(+PreferSolid/Empty), CellCenterToWorld, CellCornerToWorld, Get/SetMaterialColor; Water* properties. Air carves.
  - Mesher (`web/terrain/mesher.js`): per chunk, with a margin so neighbours agree; faces kept only by the chunk that owns their edge; vertices recomputed in doubles from the cube's crossings; occupancy turned into a distance (exact in partly filled cells, extended one step into full/empty ones). Normals from the field's gradient, colours from the material colours. Water meshed apart.
  - Drawn and solid (`runtime/terrain.js`, owned by World, so the editor and the player both have it): vertex-coloured ground with a static Havok mesh collider, see-through water with no collider; changed chunks remesh before the next physics step or frame.
  - Editor (`web/editor/terrain.js`): Studio's Add, Subtract, Paint, Smooth, Flatten (`web/terrain/brush.js`), size, strength, material; a stroke is one undo step (History's `custom` op restores the cells).
  - Tests: `test/terrain.test.mjs` (watertight across chunk corners, surfaces where the shapes are, winding, volumes, shape orientation by cell, water, save/load, dirty chunks, every brush, stroke undo/redo), `test/scenarios/terrain.mjs` (play, by script: drawn, a ball rests on it, the character stands on it, Air carves and the ball falls through), `test/scenarios/editor-terrain.mjs` (desktop and phone, through to Play). Mutation-checked.
  - Known: at 4-stud cells edges bevel by about a cell and small round shapes come out a little small (a radius-14 ball ~9% under in volume, radius 40 ~1%); surface nets can pinch two sheets at one edge (closed, not manifold). Roblox's own mesher isn't public, so its exact shapes aren't matched.
  - Not yet: textured terrain materials (triplanar), terrain hits in `workspace:Raycast`, swimming in water, Region3 and ReadVoxels/WriteVoxels, Grow/Erode/Sea Level/Generate tools.
- **Paint (2026-10-22), done:** texture painting, from PhotoCraft's brush engine (storytold/photocraft `crates/paint`, MIT/Apache), the first tool taken from the Craft apps.
  - Engine (`web/paint/brush.js`): PhotoCraft's points → dabs → coverage → composite, in JS. Kept: round tips (hardness, roundness, angle), small-tip 4x4 sampling, spacing, the Pencil's pixel grid, pressure for size and opacity, size/angle/roundness and opacity/flow jitter (its seeded RNG), Flow building up to Opacity within a stroke, the eraser, Normal blending. Dropped for now: sampled tips, texture, dual brush, scattering, colour dynamics, smoothing, airbrush, wet edges, noise, other blend modes.
  - Checked bit for bit against the Rust crate built here: `tools/paint-oracle/run.sh` renders `test/fixtures/paint/cases.json` (16 strokes) with PhotoCraft's own code; `test/paint.test.mjs` requires every dab and every pixel to match (worst difference 0). Mutation-checked (8 mutations).
  - Editor (`web/editor/paint.js`, the Paint button): Brush, Pencil, Eraser, colour, size, hardness, opacity, flow; a pen's pressure sizes the brush. On a Part (block) it paints the face under the pointer into a Decal on that face, added by the first stroke; on a MeshPart, through its UVs into TextureID. The image is a PNG data URL in the property (saves with the place, goes to Play); a stroke (and the Decal it added) is one undo step. Strokes cross UV seams as new pieces of the same step.
  - Renderer changes it needed (`runtime/world.js`): a Decal's Texture may be an image URL (only the built-in grid drew before); an editable mesh with a TextureID shows it; an editable mesh with no UVs (the kernel's primitives have none) gets Blender's Cube Projection per triangle (`runtime/cubeuv.js`), until a real unwrap (xatlas).
  - Tests: `test/scenarios/editor-paint.mjs`, desktop and phone (touch): paint shows where it was dragged (rendered pixels at projected points, above-centre strokes so a flip shows), Decal added and removed with undo, redo exact, second stroke reuses the Decal, eraser, editable mesh, Play keeps it. Mutation-checked (5). Goldens looked at.
  - Not yet: painting glTF MeshParts is in the code but untested (no UV'd MeshPart in the test places); Unions; wedges, cylinders and balls (blocks only); layers; colour picking from the model; brush presets; a texture-size setting (Decals 512², meshes 1024²).
- Next: IK on the rig, the remaining INCORPORATE.md systems (terrain, sculpting, water, LOD, particles, UV unwrap), a script editor. Then box select, copy/paste, the local-space toggle, and Studio's collision/join options.
