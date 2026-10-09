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
   - Next: **rendering range presets**, flat and blocky through photoreal (soft shadows, SSAO, bloom, tone mapping, reflections). Then the first Blender-class tool, mesh editing ported from Blender's source and checked against Blender.
4. Climb (TrussPart) and swim poses.
5. Phone frame rate on real hardware.
6. Then phase 2 (the editor) and the rest of the creator suite.
