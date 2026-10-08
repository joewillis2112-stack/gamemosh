# Roblox default player behavior: verified reference (2026-10-08)

For Claude Studio's clean-room rebuild of the default player. Every fact cites a source. Most come from Roblox's own default scripts, read in full, not from summaries.

Sources used:
- **RCT** is MaximumADHD/Roblox-Client-Tracker, branch `roblox`, commit `41ab074`, client 0.742.0.7421053 (2026-10-07). It holds Roblox's shipped Lua for the default character and player scripts. Base: `https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/`
- **PM** is the classic PlayerModule at `RCT/scripts/PlayerScripts/StarterPlayerScripts/PlayerModule.module/`. RCT also carries a newer InputAction-based copy at `scripts/PlayerScripts/StarterPlayer/PlayerModule/`. Where I compared them (ZoomController, TouchJump sizes, DynamicThumbstick sizes, Follow camera constants, touch default), the numbers match.
- **DOCS** is create.roblox.com. I read the same text from the Roblox/creator-docs repo (commit `9dc22ac`).
- **DUMP** is `RCT/Full-API-Dump.json`, the engine's reflected property defaults.

---

## 1. Character sounds (RbxCharacterSounds)
Source: RCT `scripts/PlayerScripts/StarterPlayerScriptsCommon/RbxCharacterSounds.lua`, https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/scripts/PlayerScripts/StarterPlayerScriptsCommon/RbxCharacterSounds.lua

- The script creates nine sounds, all parented to HumanoidRootPart. Defaults for each: `Volume = 0.65`, `RollOffMinDistance = 5`, `RollOffMaxDistance = 150`. In the newer AudioPlayer path, attenuation is a curve of `5/d` from 5 to 150 studs and 0 at 150.

| Sound | Asset (file name) | Looped | Pitch / PlaybackSpeed | Trigger |
|---|---|---|---|---|
| Running | `action_footsteps_plastic.mp3` | yes | **1.85** | Entering `Running` (RunningNoPhysics is treated as Running). Every Stepped frame, it plays only while `velocity.Magnitude > 0.5 and humanoid.MoveDirection.Magnitude > 0.5` |
| Climbing | `action_footsteps_plastic.mp3` (same file) | yes | 1.0 | Entering `Climbing`. Plays only while `velocity.Magnitude > 0.1` (relative to the surface's velocity under a newer flag) |
| Jumping | `action_jump.mp3` | no | 1.0 | Entering `Jumping`. Stops all looped sounds first |
| FreeFalling | `action_falling.ogg` | yes, LoopRegion **2–9 s** | 1.0 | Entering `Freefall`. Volume starts at 0. Each frame, if `|velocity| > 75` then `Volume += 0.9*dt` (capped at 1), otherwise Volume = 0 |
| Landing | `action_jump_land.mp3` | no | 1.0 | Entering `Landed`. Plays **only if `|vel.Y| > 75`**, at `Volume = clamp(map(vY, 50→100, 0→1))`, so 0.5 at 75 and 1.0 at 100 or more. Normal jumps are silent on landing |
| Splash | `impact_water.mp3` | no | 1.0 | Entering `Swimming` with `|vel.Y| > 0.1`. `Volume = clamp(map(vY, 100→350, 0.28→1))` |
| Swimming | `action_swim.mp3` | yes | **1.6** | Entering `Swimming` |
| GettingUp | `action_get_up.mp3` | no | 1.0 | Entering `GettingUp` |
| Died | `uuhhh.mp3` | no | 1.0 | Entering `Dead` |

- **Footstep speed does not depend on WalkSpeed or velocity.** PlaybackSpeed is fixed at 1.85, and velocity only gates the sound on or off. Source: same file, `SOUND_DATA.Running` and `loopedSoundUpdaters`.
- Only one looped sound plays at a time. Every state transition stops the other looped sounds. `FallingDown`, `Seated` and `Dead` stop all loops. Source: same file, `stopPlayingLoopedSounds`.
- Looped sounds keep their position when re-entered (`playSound(sound, true)`). One-shot sounds restart from 0.
- What the sounds are like:
  - From file names only: plastic footsteps (a fast tapping loop at 1.85×); a jump one-shot; a landing one-shot; a falling loop (wind is likely but I haven't heard it); a water-impact splash; a swim-stroke loop at 1.6×; a get-up one-shot.
  - "uuhhh" is the classic "oof" (the file name is verified).
  - Fan wiki, unverified by me: the oof was replaced in July 2022 (by "ouch.ogg") and came back on 2025-07-18. https://roblox.fandom.com/wiki/Roblox_death_sound. The current script's `uuhhh.mp3` is consistent with its return.

## 2. Health regeneration
- Yes, characters regenerate by default. The docs say "a passive health regeneration script is automatically inserted into humanoids… non-dead player characters … regenerate 1% of MaxHealth each second". To disable it, put an empty Script named **Health** in StarterCharacterScripts. https://create.roblox.com/docs/reference/engine/classes/Humanoid#Health
- Exact script: RCT `avatar/scripts/humanoidHealthRegenScript.server.lua`, https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/avatar/scripts/humanoidHealthRegenScript.server.lua
  - `REGEN_RATE = 1/100` of MaxHealth per second and `REGEN_STEP = 1` s.
  - Loop: while `Health < MaxHealth`, it calls `dt = wait(1)` then `Health = min(Health + dt*0.01*MaxHealth, MaxHealth)`. When full, it waits on `HealthChanged`.
  - There is **no delay after taking damage**. The default gain is about +1 HP per second (MaxHealth 100).
- Defaults are `MaxHealth = 100` and `Health = 100`. DUMP.

## 3. Spawn ForceField
- A ForceField is created when a character spawns on a SpawnLocation whose `Duration > 0`. With `Duration = 0` none is created. https://create.roblox.com/docs/reference/engine/classes/ForceField and https://create.roblox.com/docs/reference/engine/classes/SpawnLocation#Duration
- **`SpawnLocation.Duration` defaults to 10 s.** Sources: same docs page ("This default value of this property is 10 seconds") and DUMP (`SpawnLocation.Duration 10`).
- What it looks like: a particle effect. On R15 it is emitted from **UpperTorso** (Torso on R6). `ForceField.Visible` defaults to true. https://create.roblox.com/docs/reference/engine/classes/ForceField
  - The docs' alt text calls the default "a blue sparkling orb around the player" and the "default sparkling force field". https://create.roblox.com/docs/tutorials/curriculums/gameplay-scripting/spawn-respawn
- What it protects against: only `Humanoid:TakeDamage()` and explosion joint-breaking. Setting `Health` directly bypasses it. Source: ForceField docs.
- I didn't find whether a ForceField is given when there is no SpawnLocation at all.

## 4. Default Animate (R15)
Source: RCT `avatar/scripts/humanoidAnimateR15.lua`, https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/avatar/scripts/humanoidAnimateR15.lua. The Moods, CharacterController and SAuth variants in the same folder use the same constants.

- **Animation sets** (weights):
  - idle: three variants with weights **1, 1, 9**. Asset ids 507766666, 507766951, 507766388; the last one (weight 9) plays 9/11 of the time.
  - walk 507777826, run 507767714, swim 507784897, swimidle 507785072, jump 507765000, fall 507767968, climb 507765644, sit 2506281703, toolnone 507768375, toolslash 522635514, toollunge 522638767.
  - Emotes: wave, point, laugh and cheer play once. dance, dance2 and dance3 loop, with three variants each.
- **Selection:** a weighted random roll each time an animation is (re)started. When a non-walk track reaches its "End" keyframe, it is replayed with a **fresh roll and fade 0.15**, so idle variants change between loops. One-shot emotes return to idle.
- **All movement tracks use Priority `Core`.** toolnone uses `Idle` priority with fade 0.1. toolslash and toollunge use `Action` priority with fade 0, held for 0.3 s.
- **Fade (transition) times:**
  - idle ↔ walk: **0.2**
  - jump: **0.1**
  - fall: **0.2** (`fallTransitionTime`)
  - climb: 0.1
  - swim and swimidle: 0.4
  - sit: 0.5
  - emotes: 0.1
  - initial idle: 0.1
- **Jump → fall:**
  - `onJumping` plays jump (fade 0.1) and sets `jumpAnimTime = jumpAnimDuration = 0.31` s.
  - `onFreeFall` plays fall only if `jumpAnimTime <= 0`.
  - A polling loop (`wait(0.1)`, `stepAnimate`) counts jumpAnimTime down and switches to fall (fade 0.2) once it runs out. So fall begins about 0.31–0.4 s after takeoff.
  - On landing, `Humanoid.Running` fires and goes to walk or idle with fade 0.2.
- **Idle vs walk:** walk starts when the `Humanoid.Running` speed is `> 0.75 * heightScale`, otherwise idle.
- **Walk/run blend** (`onRunning` → `setAnimationSpeed(speed/16)` → `setRunSpeed`):
  - `runSpeed = (speed/16) * 1.25 / heightScale`
  - `runSpeed <= 0.5` (speed ≤ **6.4** studs/s): walk only, at playback rate `runSpeed/0.5`.
  - `0.5 < runSpeed < 1` (6.4–12.8 studs/s): crossfade, run weight `(runSpeed-0.5)/0.5`, both at rate 1.
  - `runSpeed >= 1` (≥ **12.8** studs/s): run only, at rate `runSpeed`.
  - **So at default WalkSpeed 16, the character plays the *run* animation at 1.25× speed.** Weights are never exactly 0 (they use 0.0001).
- **heightScale** is `Humanoid.HipHeight / 2` (the nominal R15 HipHeight is 2), or `Character:GetScale()` when AutomaticScalingEnabled is off. An optional `ScaleDampeningPercent` child changes it to `1 + (HipHeight-2)*pct/2`.
- **Climb:** rate = `(speed/heightScale)/5`.
- **Swim:** swims if `speed/heightScale > 1`, at rate `speed/10`; otherwise swimidle.
- **Poses that stop all animations:** Dead, GettingUp, FallingDown, PlatformStanding. Seated plays sit.
- **Emotes:** played only while pose == "Standing". Triggered by the `/e <name>` or `/emote <name>` chat hook (removed under a newer flag) or the `PlayEmote` BindableFunction.

## 5. Default camera
Sources:
- PM `CameraModule/BaseCamera.lua`, `ClassicCamera.lua`, `CameraInput.lua`, `CameraUtils.lua`, `ZoomController.lua`, `TransparencyController.lua`. Base: https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/scripts/PlayerScripts/StarterPlayerScripts/PlayerModule.module/CameraModule/

Facts:
- **Zoom defaults:**
  - Start distance is **12.5** studs (`DEFAULT_DISTANCE`, `ZOOM_DEFAULT`).
  - `StarterPlayer.CameraMinZoomDistance` = **0.5**, `CameraMaxZoomDistance` = **400**. Source: DUMP.
  - Zoom is not reset when the character respawns (only the angle is). This comes from reading the code; I haven't watched it in game.
- **FOV** = **70**, clamped to 1–120. https://create.roblox.com/docs/reference/engine/classes/Camera#FieldOfView
- **Pitch limits** are **±80°** (`MIN_Y/MAX_Y = rad(∓80)`).
- **Initial and respawn angle:** behind the HumanoidRootPart, pitched **−15°** (`INITIAL_CAMERA_ANGLE`). It is reset on CharacterAdded.
- **Focus point:**
  - R15: root + (0, **1.5**, 0), plus `(rootSize.Y/2 − 1)`, plus `Humanoid.CameraOffset`.
  - R15 without auto-scaling: (0, 2, 0). R6: (0, 1.5, 0).
  - When dead, the camera follows the **Head** with no offset.
- **Zoom stepping:**
  - Zooming out: `z + dz*(1 + 0.5z)`. Zooming in: `(z + dz)/(1 − 0.5dz)`.
  - dz is 1 per wheel click, 0.04 per pinch DIP%, and 0.1/s for keys I/O.
  - The camera follows the target zoom on a **critically damped spring at 4.5 Hz**.
  - Below **1** stud it snaps to first person (distance 0.5).
- **Rotation speeds** (classic CameraInput):
  - Mouse: **0.5° per pixel**, Y scaled ×0.77, times `UserGameSettings.MouseSensitivity` (range 0–4, per https://create.roblox.com/docs/reference/engine/classes/UserGameSettings#MouseSensitivity).
  - Touch: **1° per pixel**, Y scaled ×0.66. Pitch sensitivity eases to 25% when swiping further toward ±90°: `curve = 1 − (2|pitch|/π)^0.75`.
  - Left/right arrow keys: 120°/s.
  - Gamepad: 240°/s with Y ×0.77, deadzone 0.1, curvature 2.
  - Mouse panning is tied to RMB (CameraInput handles MouseButton2 down and up). I haven't traced the exact gating for mouse lock and first person.
- **Mobile auto-rotate: yes.** `TouchCameraMovementMode.Default` maps to **Follow**, while `ComputerCameraMovementMode.Default` maps to **Classic** (`CameraUtils.ConvertCameraModeEnumToStandard`).
  - In Follow mode, each frame the camera yaws to keep looking at the subject from its previous position, so it gradually swings behind a character that walks sideways.
  - It is suppressed while the user pans, for **2 s after the last pan** (`TIME_BEFORE_AUTO_ROTATE`), and in first person.
  - Dead zone: it only applies when the angle is more than `0.4*dt` rad.
  - Docs wording: Follow "may rotate slightly to face the player's character if they're moving in any direction that isn't parallel to the camera's facing direction". https://create.roblox.com/docs/workspace/camera
- **Occlusion:** the default "Zoom" mode (Popper) pulls the camera in when the view is blocked by parts with Transparency < 0.25. Source: same camera docs page.
- **Self-fade:** the character turns transparent when the camera is within 2 studs of the focus. Transparency = `1 − (d − 0.5)/1.5`, ignored below 0.5, and rate-limited (TransparencyController).
- **StarterPlayer defaults:** `CameraMode = Classic`, `DevComputer/DevTouchCameraMovementMode = UserChoice`, `EnableMouseLockOption = true`. Source: DUMP.

## 6. Default touch controls
Sources:
- PM `ControlModule.lua`, `ControlModule/DynamicThumbstick.lua`, `ControlModule/TouchJump.lua`. Base: https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/scripts/PlayerScripts/StarterPlayerScripts/PlayerModule.module/

Facts:
- **The default is DynamicThumbstick:** `[Enum.TouchMovementMode.Default] = DynamicThumbstick -- Current default`. `StarterPlayer.DevTouchMovementMode` = UserChoice (DUMP).
- **The thumbstick appears where you touch.**
  - The touch must begin inside the thumbstick zone. In landscape that is the left **40%** of the width and the bottom **2/3** of the height; in portrait it is the full width and the bottom **40%**.
  - The ring is placed at the touch-down point on the first move. A trail of middle dots runs from the start to the finger.
  - Before the first touch, a static hint ring sits bottom-left, then shrinks away over 0.5 s.
  - It fades in and out (max background alpha 0.35, tween 0.15 s).
- **Thumbstick response:**
  - Dead zone **2 px**, full speed at **20 px** from the start, linear in between (both ×2 when the screen's shorter side is > 500 px).
  - It is analog: the move vector magnitude is `dist/20`, capped at 1.
  - Sizes: thumb 45, outer ring 74 (×2 on big screens).
- **Jump button** (`ResizeJumpButton`, AnchorPoint left at its default of 0,0):
  - Small screen (shorter side ≤ 500 px): **70×70** px at `UDim2(1, −95, 1, −90)`.
  - Otherwise: **120×120** px at `UDim2(1, −170, 1, −210)`, i.e. `(1, −(size*1.5−10), 1, −size*1.75)`.
  - With the AvatarAbilities flag on: 72/120 px with insets 64/100 (X) and 64/112 (Y) from the bottom-right.
- **Auto-jump:** `StarterPlayer.AutoJumpEnabled` and `Humanoid.AutoJumpEnabled` default to true (DUMP). The docs say it jumps automatically "when they hit an obstacle as a player on a mobile device". https://create.roblox.com/docs/reference/engine/classes/Humanoid#AutoJumpEnabled

## 7. Respawn and death
- **`Players.RespawnTime` = 5.0 s** (used when CharacterAutoLoads is true). https://create.roblox.com/docs/reference/engine/classes/Players#RespawnTime
- **`Humanoid.BreakJointsOnDeath` = true** and `StarterPlayer.CharacterBreakJointsOnDeath` = true, so the character falls apart into loose parts. https://create.roblox.com/docs/reference/engine/classes/Humanoid#BreakJointsOnDeath and DUMP.
- `Humanoid.RequiresNeck` = true (DUMP): losing the neck joint kills the character.
- **At death:**
  - Health is locked to 0 and the state becomes `Dead` (Humanoid docs).
  - The "uuhhh" (oof) Died sound plays (§1).
  - Animate stops all animations (§4).
  - Looped sounds stop.
- **Camera at death:** it keeps its zoom and angle and tracks the **Head** part (no height offset) as it tumbles (BaseCamera `GetSubjectPosition`). On respawn it resets behind the new character at −15° pitch (§5). I found no other death effect such as a fade or tilt.

## 8. Other per-frame defaults
- Humanoid defaults (DUMP):
  - `WalkSpeed 16`
  - `JumpPower 50`, `JumpHeight 7.2`, `UseJumpPower = true`, `StarterPlayer.CharacterUseJumpPower = true`. The docs say CharacterUseJumpPower "Defaults to `true`".
  - `MaxSlopeAngle 89`
  - `AutoRotate true`
  - `HipHeight 0` (class default; R6). Docs: "For R15 rigs, a suitable hip height is preset". Height = `0.5*RootPart.Size.Y + HipHeight` (R15), or `LeftLeg.Size.Y + 0.5*RootPart.Size.Y + HipHeight` (R6). The Animate script uses **2** as the nominal R15 HipHeight. https://create.roblox.com/docs/reference/engine/classes/Humanoid#HipHeight
  - `HealthDisplayDistance 100`, `NameDisplayDistance 100`
- **AutoRotate:** the character "will gradually turn to face their movement direction". In first person or shift-lock (RotationType CameraRelative) it faces the camera direction. https://create.roblox.com/docs/reference/engine/classes/Humanoid#AutoRotate. The turn rate is **not documented** (see below).
- **Air control:** a feature-request thread says "Humanoid air control is constant and non-configurable" and "Absolute": while airborne the humanoid drives toward its move direction at WalkSpeed. https://devforum.roblox.com/t/humanoids-are-limited-and-could-do-with-a-wider-range-of-physics-configuration-itt-air-control-accelleration-humanoidstatetypes/613483. This is a community statement, not staff.
- **Ground acceleration:** DevForum threads describe effectively instant acceleration and stops ("change velocity on a dime"). Examples: https://devforum.roblox.com/t/how-to-make-humanoid-accelerate/1341360 and https://devforum.roblox.com/t/slowly-accererating-walkspeed/641104. These are community posts, not documented numbers.
- **ControllerManager defaults** (the physics-based replacement, *not* the Humanoid itself; useful only as Roblox's own parameterisation):
  - `BaseMoveSpeed 16`, **`BaseTurnSpeed 8`**
  - GroundController: `AccelerationTime 0`, `DecelerationTime 0`, `Friction 2`, `GroundOffset 1`
  - AirController: `MoveMaxForce 1000`, `MaintainLinearMomentum true`
  - Source: DUMP. https://create.roblox.com/docs/reference/engine/classes/ControllerManager
- `Workspace.Gravity`: the DUMP has no value for it ("class not creatable"). The project's earlier jump measurement (6.369 studs with JumpPower 50) is consistent with 196.2, since 50²/(2·196.2) = 6.37.

---

## Unverified / not found
- **Humanoid turn rate** for AutoRotate: not documented anywhere I found. (ControllerManager's BaseTurnSpeed = 8 is a different system.)
- **Humanoid ground acceleration and deceleration, friction and air-control numbers:** not documented. Only community descriptions exist ("instant", "absolute").
- **Default value of UserGameSettings.MouseSensitivity:** not found (the DUMP skips UserGameSettings). The docs give only the range 0–4.
- **What the sounds actually sound like** (jump, land, falling loop): I described them from file names only and haven't listened to them.
- **The oof's 2022 removal and 2025 return:** fan wiki only. The current script loading `uuhhh.mp3` is verified.
- **Gravity 196.2:** not confirmed from the DUMP. It matches the earlier measurement.
- **Whether new Studio templates override `CharacterUseJumpPower`** (class default is true): not checked.
- **Whether a ForceField appears when a character spawns without any SpawnLocation:** not found.
- **Which PlayerModule copy ships live:** both copies in RCT have identical values for everything cited here. The newer one routes mouse and touch rotation scales through InputBindings, whose default scale values I didn't find.
