# Roblox particles: ParticleEmitter and its datatypes (2026-11-13)

[Studio] Gathered for Claude Studio's ParticleEmitter. Sources:
- **DUMP** = `Full-API-Dump.json`, MaximumADHD/Roblox-Client-Tracker, branch `roblox`, client 0.747.0.7471481 (fetched 2026-11-13): names, types, defaults (`Default` field, a creatable class's own members).
- **DOCS** = Roblox/creator-docs `content/en-us/reference/engine/classes/ParticleEmitter.yaml` and `datatypes/{NumberRange,NumberSequence,NumberSequenceKeypoint,ColorSequence,ColorSequenceKeypoint}.yaml` (main, fetched 2026-11-13): behaviour and units.
- **FORUM** = DevForum threads on quality throttling (cited inline). Community reports, not Roblox's documentation.
Anything marked OURS is a decision where neither source says.

## ParticleEmitter (DUMP; superclass Instance)

| Property | Type | Default | Behaviour (DOCS) |
|---|---|---|---|
| Acceleration | Vector3 | 0,0,0 | world-axis acceleration, studs/s², on all live particles |
| Brightness | float | 1 | scales emitted light when LightInfluence is 0 |
| Color | ColorSequence | white to white | over each particle's life, linear in RGB; multiplies the texture |
| Drag | float | 0 | seconds for a particle to lose half its speed (exponential); negative grows it |
| EmissionDirection | NormalId | Top | face of the parent the particles leave from; an Attachment parent uses its own orientation instead |
| Enabled | bool | true | false stops new particles; live ones finish |
| FlipbookBlendFrames | bool | true | crossfade between frames |
| FlipbookFramerate | NumberRange | 1 1 | frames/s, random in range, at most 30 |
| FlipbookLayout | ParticleFlipbookLayout | None | None, Grid2x2, Grid4x4, Grid8x8, Custom (FlipbookSizeX/Y) |
| FlipbookMode | ParticleFlipbookMode | Loop | Loop, OneShot (frames spread over the lifetime; framerate ignored), PingPong, Random |
| FlipbookSizeX, FlipbookSizeY | int | 1, 1 | custom grid |
| FlipbookStartRandom | bool | false | random first frame per particle |
| Lifetime | NumberRange | 5 10 | seconds, random per particle; 0 emits nothing |
| LightEmission | float | 0 | 0 normal blending, 1 additive. Does **not** light the surroundings (use a PointLight) |
| LightInfluence | float | 0 | 0 full brightness, 1 lit by the environment. 0 from Instance.new, 1 when inserted with Studio's tools |
| LockedToPart | bool | false | live particles move with the parent |
| Orientation | ParticleOrientation | FacingCamera | FacingCamera, FacingCameraWorldUp (rotates about world Y only), VelocityParallel, VelocityPerpendicular |
| Rate | float | 20 | particles per second while Enabled |
| Rotation | NumberRange | 0 0 | degrees at spawn, clockwise positive |
| RotSpeed | NumberRange | 0 0 | degrees/s, chosen at spawn |
| Shape | ParticleEmitterShape | Box | Box, Sphere, Cylinder, Disc (the parent's size) |
| ShapeInOut | ParticleEmitterShapeInOut | Outward | Outward, Inward, InAndOut |
| ShapePartial | float | 1 | cylinder: top radius share (0 = cone); disc: inner radius share; sphere: hemispherical angle share |
| ShapeStyle | ParticleEmitterShapeStyle | Volume | Volume or Surface |
| Size | NumberSequence | 1 to 1 | world size (studs) of the square over each particle's life |
| Speed | NumberRange | 5 5 | studs/s at spawn, along EmissionDirection; negative reverses |
| SpreadAngle | Vector2 | 0, 0 | degrees of random spread on the two axes across the emission direction; 360 on one = a circle, both = a sphere |
| Squash | NumberSequence | 0 to 0 | >0 narrower and taller, <0 wider and shorter, over life |
| Texture | ContentId | rbxasset://textures/particles/sparkles_main.dds | the image |
| TimeScale | float | 1 | 0..1, slows the whole effect; 0 freezes it |
| Transparency | NumberSequence | 0 to 0 | over life; 1 not rendered |
| VelocityInheritance | float | 0 | share of the parent part's velocity given at spawn |
| WindAffectsDrag | bool | false | follow Workspace.GlobalWind (only when Drag > 0) |
| ZOffset | float | 0 | studs toward the camera, without changing screen size |
| (VelocitySpread) | float | 0 | deprecated |

Methods: `Clear()`, `Emit(particleCount: int)`, `FastForward(numFrames: int)`. (`LocalTransparencyModifier` is hidden; `TextureContent` is the Content form of Texture.)

Enums (DUMP): ParticleOrientation FacingCamera 0, FacingCameraWorldUp 1, VelocityParallel 2, VelocityPerpendicular 3; ParticleEmitterShape Box 0, Sphere 1, Cylinder 2, Disc 3; ParticleEmitterShapeInOut Outward 0, Inward 1, InAndOut 2; ParticleEmitterShapeStyle Volume 0, Surface 1; ParticleFlipbookLayout None 0, Grid2x2 1, Grid4x4 2, Grid8x8 3, Custom 4; ParticleFlipbookMode Loop 0, OneShot 1, PingPong 2, Random 3.

## Datatypes (DOCS)

- **NumberRange**: Min, Max as float32. `new(value)` sets both; `new(min, max)` needs min <= max.
- **NumberSequenceKeypoint**: Time (0..1), Value, Envelope (>= 0, default 0). The value used is random within [value - envelope, value + envelope]. OURS: drawn once per particle per keypoint at spawn.
- **NumberSequence**: `new(n)`, `new(n0, n1)`, or `new{keypoints}`: at least two, non-descending time, first at 0 and last at 1. `.Keypoints`. Equal only if keypoints are equal. Evaluated by linear interpolation between neighbouring keypoints on the particle's age / lifetime.
- **ColorSequenceKeypoint**: Time, Value (Color3). **ColorSequence**: the same constructors and rules; linear in RGB.
- Serialised form (DUMP defaults): NumberSequence `time value envelope` triples, ColorSequence `time r g b 0` groups, NumberRange `min max`, each value followed by a space.

## Quality throttling (FORUM)

Roblox lowers the visible emission of `Rate` with the player's graphics level (reported as Rate x level / 10) without changing the property; low-rate effects can vanish below level 4; `Emit()` is reported to bypass it in some cases and not others. Developers report broken gameplay visuals and ask to opt out: [1](https://devforum.roblox.com/t/graphics-quality-lowering-particle-emission-rates/1241979), [2](https://devforum.roblox.com/t/particlefix-steady-particle-emission-rate/339946), [3](https://devforum.roblox.com/t/particle-emitter-limit-on-low-graphics-is-impacting-my-game/2159584), [4](https://devforum.roblox.com/t/allow-us-to-disable-vfx-scaling-with-graphics-level/2301568). Claude Studio's decision (user discussion, 2026-11-12): quality tiers may cut only extras (secondary particles, collisions, cast light), never what the creator authored.
