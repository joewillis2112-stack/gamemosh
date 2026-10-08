# Roblox: Humanoid carried by the floor; TweenService (research 2026-10-08)

_Gathered by a research agent; spot-checked against the creator-docs source (BasePart conveyor quote, TweenInfo Quad default): both match._

Sources key:
- **Docs** = Roblox Creator Docs. Quotes come from the docs' source YAML/MD in `github.com/Roblox/creator-docs` (main branch, fetched 2026-10-08). That repo generates create.roblox.com/docs. The rendered pages load by JS, so WebFetch got no text from them.
- **Staff** = a Roblox engineer posting on the DevForum: Khanovich, kleptonaut, CodeWriter, m0bsterlobster (Avatar Movement Team). Their staff status comes from context: they announce features and ship fixes. The forum JSON doesn't flag it.
- **Community** = ordinary forum users. Treat as anecdote.

Legacy Humanoid and the new Character Controller Library (CCL) behave differently, so each answer below says which one it covers.

---

## 1. Floor velocity inheritance (conveyor)

**VERIFIED: an anchored part with velocity set acts as a conveyor and moves a standing character.**
- Docs, BasePart.Velocity (deprecated): "Setting the Velocity of a part that is `Anchored` will cause it to act like a conveyor belt. Any object that touches the part will begin to move in accordance with the Velocity."
  https://create.roblox.com/docs/reference/engine/classes/BasePart#Velocity
- Docs, BasePart.Anchored: "An anchored part may still be moved by changing its CFrame or Position, and it still may have a nonzero AssemblyLinearVelocity and AssemblyAngularVelocity."
- Staff (kleptonaut, 2020-11-30, New Part Physics API): "you can still set the `AssemblyLinearVelocity` property for conveyor belt behavior." https://devforum.roblox.com/t/activated-new-part-physics-api/897999
- Staff treated characters *not* moving on such parts as a bug. Bug report (2020-11-11): "When you stand on an anchored part with a Velocity > 0, your character should move with it." Khanovich: "Yes its a Roblox issue…". CodeWriter, 2020-11-12: "The fix for this issue has been released." https://devforum.roblox.com/t/parts-velocity-no-longer-moves-the-players-character/866085

**UNSURE: whether the carry velocity is the velocity at the contact point (v + ω×r).** No source says how the Humanoid samples floor velocity.
- What is documented: `BasePart:GetVelocityAtPosition(pos)` gives the assembly's linear velocity at a world point. "If the assembly has no angular velocity, than the linear velocity will always be the same for every position." That implies v + ω×r, but nothing ties it to the Humanoid.
- `Humanoid:GetRelativeVelocityAtFloor()` (Docs): "accounts for moving platforms by subtracting floor velocity from the humanoid's body velocity … When the humanoid is airborne, the floor velocity component uses the last cached value from when it was grounded." This confirms the engine tracks a floor velocity, but not how it is sampled.
  https://create.roblox.com/docs/reference/engine/classes/Humanoid#GetRelativeVelocityAtFloor
- The 2018 "Characters on Moving Platforms" post describes network replication (positions in platform-local coordinates), not local carry physics. Staff (Khanovich, 2019-01-28): "There are limits to how hard a character sticks to a surface in Roblox." https://devforum.roblox.com/t/characters-on-moving-platforms-now-live/183385 (post 65)
- Staff (kleptonaut, 2024-03-07): with the legacy Humanoid on a server-owned platform, the HRP's AssemblyLinearVelocity does *not* include the platform velocity. "This is currently expected with how the Humanoid works… This is solved in the new character controller." https://devforum.roblox.com/t/assemblylinearvelocity-property-of-humanoid-assembly-does-not-inherit-velocity-of-humanoid-platform/1839144

## 2. Anchored part with AssemblyAngularVelocity (rotating conveyor); facing

**UNSURE.** I found no doc, staff post or test of an anchored spinning-velocity part carrying or turning a Humanoid. Related facts:
- Docs, RotVelocity: "The part only rotates if it is not anchored." Unit: radians per second.
- Docs, Anchored: an anchored part "may have a nonzero … AssemblyAngularVelocity".
- Whether the character's facing turns with a spinning floor: **UNSURE** for both the legacy Humanoid and CCL. CCL's AirController has `MaintainAngularMomentum`, so CCL tracks angular momentum. Nothing says the ground controller adopts the floor's yaw rate.

## 3. Anchored part moved by TweenService/CFrame

**VERIFIED: in physics terms the part has no velocity, so it gives the character no momentum.**
- Staff (kleptonaut, FAQ in the physics controller beta post, 2022): "Does the momentum conservation work with CFramed/Tweened Parts? No, since moving parts this way has no velocity, there's no momentum to conserve. There's 2 ways to address this: Move parts physically, so they have velocity (ie PrismaticConstraint, AlignPosition); Set an AssemblyLinearVelocity on the anchored Part you're CFraming/Tweening." https://devforum.roblox.com/t/new-humanoid-physics-controller-beta/1999211
- Staff (Khanovich, 2019-01-28): "This feature only works when objects are moved by physics. If you are CFraming this train, or manually setting velocities yourself you are throwing this feature out a window." This is about platform replication. https://devforum.roblox.com/t/characters-on-moving-platforms-now-live/183385

**VERIFIED (community, consistent over 2020 to 2025): players are not carried and slide off.** Examples:
- https://devforum.roblox.com/t/making-your-character-move-relative-to-the-part-its-standing-on-for-parts-being-moved-with-cframe-and-tweenservice/487078 (2020): ForeverHD assumed it would work, and it didn't. The fixes offered were a per-frame client CFrame carry script and EgoMoose's WallStick.
- https://devforum.roblox.com/t/players-isnt-spinning-with-the-platform/2614564 (2023): a platform spun by a CFrame loop leaves the player behind. The answer offered was to weld the player.
- A third-party module README (IITPP-Roblox/Anchored-Platform-Player-Movement): "Roblox supports this for unanchored parts, but not anchored parts." https://github.com/IITPP-Roblox/Anchored-Platform-Player-Movement

**Has Roblox changed this? UNSURE, probably not.** I found no announcement that CFramed or tweened anchored parts carry characters.
- The CCL full release (2026-04-08, staff m0bsterlobster) says: "Characters now maintain linear and angular momentum when leaving the ground. You no longer have to manually script complex CFrame math to keep players from 'sliding' off moving platforms or vehicles." It does not mention anchored or tweened parts. Read together with kleptonaut's FAQ, it most likely applies to physically moved platforms only. https://devforum.roblox.com/t/full-release-the-future-of-character-movement-character-controller-library/4565267
- CCL is on by default only in the Classic Obby template, and will come to other templates "over the next several months". "We will not change existing experiences." (same post)
- CCL caveat: a 2026-04-08 user reply (post 21) quotes staff saying "we don't yet support platforms for ControllerManagers" for network-replicated platform-relative positions. Users report characters desyncing or floating on moving platforms with physics controllers.

**Common workarounds (community):**
1. Keep the tween and also set `AssemblyLinearVelocity = ΔPos/Δt` each frame, often on PreSimulation or Stepped. This is the officially suggested option (2) above.
2. Use an unanchored platform driven by PrismaticConstraint or AlignPosition.
3. Use a client per-frame carry script (Jailbreak-train style) that applies the platform's CFrame delta to the HRP.
4. Weld the HRP to the platform.

**What popular obbies use: UNSURE.** I found no survey. Roblox's own "Create elevators" tutorial uses an unanchored platform on a **PrismaticConstraint servo** (ActuatorType Servo, ServoMaxForce 10000, limits ±10): https://create.roblox.com/docs/tutorials/use-case-tutorials/physics/create-elevators

## 4. Unanchored platform moved by constraints (Prismatic, AlignPosition, LinearVelocity, Hinge motor)

**VERIFIED that it carries the character (it has real velocity).** kleptonaut FAQ above: "Move parts physically, so they have velocity (ie PrismaticConstraint, AlignPosition)". The official elevator tutorial moves "users" on a PrismaticConstraint platform. The 2018 announcement also says platforms moved by BodyGyro/BodyPosition, or constrained to anchored objects, work with the replication feature, possibly "sub-optimally. You may see characters vibrating a bit."
- Hinge-motor turntables: community threads report mixed results. Causes include low torque, Massless parts and low friction. No staff statement. https://devforum.roblox.com/t/hinge-motor-not-moving-players/2690087
- **Facing rotation with a rotating platform: UNSURE.** No authoritative source either way.

## 5. Jumping off a moving platform: momentum

- **Legacy Humanoid: VERIFIED that it does not conserve momentum.** Staff (Khanovich, 2018-09-27): "I have not adjusted how we conserve momentum (Disclaimer: we don't). So unfortunately you will still lose velocity due to character controller. However, you will still be 'subscribed' to the platform after a jump until you fall for a while, land on another platform, or start swimming." The subscription refers to network replication. Staff (kleptonaut, 2023-09-29, Releasing Character Physics Controllers) lists "Conserves momentum when leaving the ground by default" among behaviours "the Humanoid did not do". https://devforum.roblox.com/t/releasing-character-physics-controllers/2623426
  - Exact legacy air-velocity decay curve: **UNSURE.** A community feature request says "Humanoids dramatically lose momentum while in the air." https://devforum.roblox.com/t/ability-to-preserve-humanoid-momentum/802775
- **CCL / ControllerManager: VERIFIED that it keeps momentum by default.** "Characters now maintain linear and angular momentum when leaving the ground." It can be turned off with `AirController.MaintainLinearMomentum` and `MaintainAngularMomentum`.
  - Docs: MaintainLinearMomentum "Determines whether linear momentum is preserved when input has stopped. If false, the character will apply MoveMaxForce to bring the linear velocity towards 0 when there is no input."
  - Docs: MaintainAngularMomentum is the same rule with TurningMaxTorque and angular velocity.
  - Users report that air input overrides the kept momentum (CCL thread, posts 124 and 160).
- Only real velocity counts. A tweened anchored platform gives no momentum (kleptonaut FAQ, §3).

## 6. Velocity/RotVelocity aliases; units

**VERIFIED.**
- Docs: `BasePart.Velocity` is tagged Hidden and Deprecated: "This property is deprecated. Use `AssemblyLinearVelocity` instead." Unit: "**studs per second**".
- Docs: `BasePart.RotVelocity` is tagged Hidden and Deprecated: "Use `AssemblyAngularVelocity` instead." Unit: "**radians per second**".
- Docs: AssemblyLinearVelocity is "the rate of change in position of AssemblyCenterOfMass in studs per second". AssemblyAngularVelocity is "the rate of change of orientation in radians per second. Angular velocity is the same at every point of the assembly." Both are Vector3 and tagged NotReplicated.
- Staff (kleptonaut, 2020): "`BasePart.Velocity` and `BasePart.RotVelocity` are now deprecated (hidden from Properties window)". Setting AssemblyLinearVelocity "just sets the velocity for that frame, and normal simulation takes over from there."
- Strictly, they are not pure aliases. Velocity is per-part and assembly-unaware: the deprecation cites "multiple issues in their operation when dealing with a part and its assembly". Whether reading `Velocity` today returns exactly AssemblyLinearVelocity, or the velocity at the part's position: **UNSURE.**
- Docs also give: default walk speed 16 studs/s; Workspace.Gravity default 196.2 studs/s².

## 7. TweenService

**VERIFIED (Docs; datatypes/TweenInfo, classes/TweenService, TweenBase, Tween, enums EasingStyle, EasingDirection, PlaybackState):**
- `TweenInfo.new(time=1, easingStyle=Enum.EasingStyle.Quad, easingDirection=Enum.EasingDirection.Out, repeatCount=0, reverses=false, delayTime=0)`. Docs: "`-1` repeats indefinitely." Properties are read-only after creation: Time, EasingStyle, EasingDirection, RepeatCount, Reverses, DelayTime.
- `TweenService:Create(instance, tweenInfo, propertyTable)` returns a Tween. The tween is unique to that instance.
- `TweenService:GetValue(alpha, style, direction)` returns the eased alpha. "The provided `alpha` value will be clamped between `0` and `1`."
- There is also `TweenService:SmoothDamp(current, target, velocity, smoothTime, maxSpeed?, dt?)`, a critically damped spring for number, Vector2, Vector3 and CFrame.
- Tweenable types: number, boolean, CFrame, Rect, Color3, UDim, UDim2, Vector2, Vector2int16, Vector3, EnumItem.
- If two tweens animate the same property, "the initial tween will be cancelled and overwritten by the most recent tween."
- `Play()`: "if playback has already started, calling Play() has no effect unless the tween has finished or is stopped (either by Cancel() or Pause())".
- `Pause()`: keeps progress, and Play resumes from the paused point. Docs: "You can only pause tweens that are in the PlaybackState of Playing". Pausing while Delayed fails, and the tween plays after its delay.
- `Cancel()`: "Halts playback … and resets the tween variables. Only resets the tween variables, not the properties being changed". A later Play takes the full duration from the current values.
- `Completed(playbackState)`: "Fires when the tween finishes playing or when stopped with Cancel()". It passes the PlaybackState. "calling Pause() does not fire the Completed event."
- `PlaybackState` (read-only) has these values: Begin=0, Delayed=1, Playing=2, Paused=3, Completed=4, Cancelled=5. Docs: "a newly created tween begins in `Begin`; calling Play() moves it to `Delayed` (when DelayTime > 0) or directly to `Playing`". Begin is never re-entered.
- EasingStyle values: Linear=0, Sine=1, Back=2, Quad=3, Quart=4, Quint=5, Bounce=6, Elastic=7, Exponential=8, Circular=9, Cubic=10.
- EasingDirection: In=0 ("applied in a forward direction"), Out=1 ("applied in a reverse direction"), InOut=2 ("applied forward for the first half and in reverse for the second half").
- Docs, ui/animation: Linear is not affected by direction.
- **Not documented:** how Reverses and RepeatCount count cycles, for example whether one repeat includes the reverse leg. **UNSURE.**

**Easing formulas: no authoritative source.** Docs give only graphs (In/Out/InOut PNGs at https://create.roblox.com/docs/ui/animation#style). For exact values, the engine's own `TweenService:GetValue` is the oracle.
- Best non-official source: "Custom tweening" by index_self (2025-08-25), https://devforum.roblox.com/t/custom-tweening/3897708. It gives closed forms the author says are fitted against GetValue, with a max delta of about 1e-7 to 5e-7 per style. These are community fits, but useful. Key points that differ from textbook Penner:
  - **Quad/Cubic/Quart/Quint/Sine/Circular:** standard Penner forms. Example: QuadOut = 2t − t². CircularIn = 1 − √(1 − t²).
  - **Exponential:** In = 2^(10t − 10). Out = 1 − 2^(−10t). Note there is no 0/1 endpoint snap in the formula; the author special-cases t=0 for In and t=1 for Out. InOut = 2^(20t − 11) for t < 0.5, else 1 − 2^(9 − 20t).
  - **Back:** In = 2.70158·t³ − 1.70158·t² (s = 1.70158).
  - **Bounce:** standard 7.5625 / 2.75 piecewise (easings.net). A community GetValue print backs this: `GetValue(0.5, Bounce, In)` = 0.234375, which matches Penner inBounce at that point. https://devforum.roblox.com/t/2504163
  - **Elastic (non-Penner):** In = −2^(10t − 10)·sin(6.5πt − 7π). Out = 1 + 2^(−10t)·sin(−6.5πt − π/2). The period is about 0.3077, not Penner's 0.3. InOut uses sin(13πt − 7π) and sin(13πt − 6π) halves.
- **Status: UNSURE** until measured against real GetValue. Treat the forms above as the leading hypothesis.
