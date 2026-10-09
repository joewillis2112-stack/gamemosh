# Roblox lighting, atmosphere, post effects (research 2026-10-09)

_Gathered by a research agent for Claude Studio (Babylon.js), 2026-10-09. Research only; nothing in the engine was changed._

Every claim is tagged **VERIFIED** (with source and quote/code) or **UNSURE**. "I don't know" is used where nothing primary was found.

## Sources key

| Key | Source |
|---|---|
| `RCT` | MaximumADHD/Roblox-Client-Tracker, branch `roblox`, HEAD `41ab074bc29dd2a51a5bb17bc3498e0465842794` (client 0.742.0.7421053, 2026-10-07). Older commits cited by short hash. Raw URL form: `https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/<commit>/<path>` |
| `RCT@0a257e8` | same repo, commit `0a257e8df8fbd8febd8f313dd03f26959aa4ad50` (0.671, 2025-05-01), the last commit before the `ImageProcess*` post shaders were removed from the dump |
| `API` | `RCT:API-Dump.txt` at HEAD |
| `CD` | Roblox/creator-docs `main`, commit `4fc8478587ee7c1a412403d76baff4d0ede578d4` (2026-10-09). Raw form: `https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/<path>` |
| `DF` | DevForum (devforum.roblox.com); staff status noted per post |

Shader caveat: the GLSL in RCT is decompiled from Roblox's shader packs (SPIRV-Cross style: `CB1[n]` constant registers, `f0..fN` temporaries). Constant values set by the C++ engine are **not** in the shaders. The current dump (2026) has the surface shaders (`DefaultUnified*`), sky, bloom, blur, sun-ray and DOF passes, but no longer the tonemap/colour-grade pass (`ImageProcess*`, last at `RCT@0a257e8`) and no GLSL for the Future per-pixel local-light path; older commits are cited where used.

Other sources used (all fetched 2026-10-09):
- DevForum topics by number (`https://devforum.roblox.com/t/<id>`), read through the Discourse JSON API (`/t/<id>.json`, `/t/<id>/posts.json`). "Roblox_Staff" means the post JSON has `primary_group_name: Roblox_Staff`; older staff (e.g. zeuxcg, Qiblox, Homeomorph, vrtblox) are identified by posting in the staff-only Announcements category (id 36) or by the group field. Announcements used: 25023 (post effects, 2016), 182687 / 207935 (FIB Phase 1, 2018), 269370 (Phase 2, 2019), 429543 (Phase 2.5 / PBR + IBL, 2020), 639903 / 878634 (Phase 3 / Future, 2020), 1127446 (Baseplate 2021), 3128560 (Compatibility → Retro, 2024), 3401512 (Unified Lighting, 2025), 3954367 (light range 120, 2025). Others: 296043, 593258 (tonemap, staff replies), 3921848, 507132, 701963, 2580333, 2278243 (community).
- rojo-rbx/rbx-test-files `bb88023a07420390c61bee46b315592c9a5723ab` (baseplate place files saved by Studio).
- Community code (UNSURE tier): Quenty/NevermoreEngine `SunPositionUtils.lua`, MaximumADHD/Roblox-Plugins `CelestialBodyDragger`, TabooHarmony/roblox-headless-renderer `src/rhr/scene/scene.js`, chteau/rbx-native `sun.rs` (all `main`, raw.githubusercontent.com).

---

## Summary for implementers

1. **Sun/moon** (UNSURE, 4 community sources agree, no Roblox source): `a = 2π·ClockTime/24`, `L = rad(GeographicLatitude − 23.5)`, `sun = (cos L·sin a, −cos L·cos a, sin L)`, `moon = (−sun.x, −sun.y, sun.z)`. Rises +X at 06:00, sets −X at 18:00, tilted to +Z. Sun lights the scene while `sun.y > −0.3` (old-engine-derived, UNSURE).
2. **Technology** (VERIFIED): Legacy 0, Voxel 1, Compatibility 2, ShadowMap 3, Future 4, Unified 5. Since 2025-07 it is replaced by `LightingStyle` (Realistic 0 / Soft 1) + `PrioritizeLightingQuality`: Future = Realistic+true, ShadowMap = Soft+true, Voxel = Soft+false; Compatibility = Voxel + `ColorGradingEffect{TonemapperPreset=Retro}`. Voxel: 4-stud voxel light and shadows for everything. ShadowMap: shadow-mapped sun, voxel local lights. Future: per-pixel local lights with shadow maps (spot < surface < point cost) and local-light specular. All three have PBR sun specular and IBL (since 2020).
3. **Shading** (shader code VERIFIED, property→constant mapping inferred): gamma-2.0 colour space (square in, sqrt out), HDR buffer holds `sqrt(linear/4)`. `colour = albedo·(Lamp0·sat(N·L)·shadow + Lamp1·sat(−N·L)·shadow + min(local + Ambient + SkyAmbient·skyVis, cap) + IBL diffuse) + specular`. OutdoorAmbient applies only where the sky is visible, as `max(Outdoor − Ambient, 0)`. Exposure = `2^ExposureCompensation` before the tonemap (doc). Tonemap = `e·x(ax+b)/(x(ax+c)+d)` per channel (code), constants unknown; the shape matches Hejl–Dawson filmic (inference); staff confirm 1.0 does not map to white.
4. **Atmosphere** (shader VERIFIED, mapping UNSURE): geometry fog `vis = clamp(2^(z·d + x) − w, 0, 1)`; with Atmosphere the fog colour is the blurred sky cube in the view direction, otherwise FogColor. Sky = `mix(inscatter + sunGlare, skybox, T(elevation))`. FogStart/FogEnd are hidden (doc) and in effect replaced. Density/Offset/Haze/Glare/Decay → constants: I don't know.
5. **Post** (VERIFIED order and forms): scene → +bloom → +sun rays (HDR) → tonemap → ColorCorrection as one affine 3×4 matrix. Bloom bright pass `c·max(maxc − Threshold, 0)/(maxc + 0.001)·Intensity` (mapping inferred). Blur = separable Gaussian. Sun rays = sky-pixel radial march × Henyey–Greenstein. Effects count only as direct children of Lighting or the CurrentCamera; Blur takes the largest Size; Bloom and ColorCorrection compose; ColorGrading only under Lighting, last parented wins.
6. **New Baseplate** (VERIFIED, Studio 0.727 file): Ambient = OutdoorAmbient = (70,70,70), Brightness 3, EnvDiffuse 1, EnvSpecular 1, GeographicLatitude 0, GlobalShadows true, LightingStyle Soft, PrioritizeLightingQuality true (Technology 3), ShadowSoftness 0.2, TimeOfDay 14:30:00, FogColor (192,192,192), FogEnd 100000. Children: Sky (asset ids in §6), SunRays (0.01, 0.1), Atmosphere (Density 0.3, Offset 0.25, Color 199 grey, Decay (106,112,125), Glare 0, Haze 0), Bloom (1, 24, 2), DepthOfField disabled (Far 0.1, Focus 0.05, Radius 30, Near 0.75).
7. **Local lights** (VERIFIED limits, curve unknown): Range clamped to 120 studs (60 before 2025-09-23); Brightness has no effect on reach; falloff formula is not published and staff have said they are reworking attenuation.

---

## 0. Headline changes to know first (2025-26)

- **VERIFIED** `Lighting.Technology` is no longer scriptable and is superseded. `API`: `Property Lighting.Technology: Enum.Technology {🚧Environment} {🔒RobloxScript}`. `CD/reference/engine/classes/Lighting.yaml`: "This property has been superseded by `LightingStyle` which determines the artistic intent behind lighting, and `PrioritizeLightingQuality` which indicates whether you prefer lighting/shading quality or view distance to scale down first." security read/write: `RobloxScriptSecurity`.
- **VERIFIED** New properties in `API`: `Lighting.LightingStyle: Enum.LightingStyle`, `Lighting.PrioritizeLightingQuality: boolean`, `Lighting.ExtendLightRangeTo120: Enum.RolloutState [NotScriptable]`.
- **VERIFIED** `Enum.LightingStyle` (`API`): `Realistic : 0`, `Soft : 1`. `CD/reference/engine/enums/LightingStyle.yaml`: Realistic = "The most advanced and realistic lighting and shadows Roblox can deliver." Soft = "A flat, retro-Roblox look with softer lights and shadows."
- **VERIFIED** `CD Lighting.yaml` on LightingStyle: "The actual shadowing path also depends on `PrioritizeLightingQuality` (for example, Soft with that property enabled uses shadow maps rather than voxel lighting)."
- **VERIFIED** New post effect `ColorGradingEffect` with one property `TonemapperPreset: Enum.TonemapperPreset` (`API`). Enum: `Default : 0`, `Retro : 1`. `CD/reference/engine/enums/TonemapperPreset.yaml`: Default = "the post‑2019 Roblox appearance which provides vivid colors and high contrasts"; Retro = "imitate the pre‑2019 Roblox appearance. Colors look less saturated and there is less contrast between them."
- **VERIFIED** Light range clamp: `CD Lighting.yaml` (ExtendLightRangeTo120): "The maximum `Range` of `PointLight`, `SpotLight`, and `SurfaceLight` objects is always 120 studs; this property does not change that clamp."

---

## 1. Sun and moon direction (`GetSunDirection`, `GetMoonDirection`)

**Roblox publishes no formula.** No Roblox-authored source was found: `GetSunDirection` appears in RCT only in `QtResources/Platform/Restricted/LegacyDocumentation.json` (GitHub code search `GetSunDirection repo:MaximumADHD/Roblox-Client-Tracker`, 1 hit), not in any CoreScript, plugin or shader. The engine computes it in C++.

What Roblox does document (**VERIFIED**, `CD Lighting.yaml`):
- GeographicLatitude: "The geographic latitude, in degrees, of the scene ... When calculating the position of the sun, the earth's tilt is also taken into account."
- GetSunDirection: "Returns a `Vector3` representing the direction of the sun from the position `(0, 0, 0)`. Note that when the sun has 'set' ... the `Vector3` returned by this method will continue to point towards the sun below the horizon." Same wording for GetMoonDirection.
- GetMoonPhase: "There is no way to change the moon's phase so this will always return `0.75`."
- ClockTime is hours (float); TimeOfDay is the "HH:MM:SS" string; `GetMinutesAfterMidnight` is "nearly identical to ClockTime multiplied by 60". SetMinutesAfterMidnight "allows values greater than 24 hours to be given that correspond to times in the next day" (so time wraps mod 24 h).

### 1a. The formula (UNSURE: community reproductions, but four independent ones agree exactly)

Let `t = ClockTime mod 24`, `a = 2π·t/24`, `L = radians(GeographicLatitude − 23.5)`. Roblox axes (Y up):

```
sun  = ( cos L · sin a,  −cos L · cos a,  sin L )
moon = ( −sun.x, −sun.y, sun.z )        -- mirrored in X and Y, same Z; NOT −sun
```

Equivalent form used by three of the sources: `lon = radians((t − 6)·15)`, `sun = (cos L cos lon, cos L sin lon, sin L)` (algebraically identical: cos(a−π/2)=sin a, sin(a−π/2)=−cos a).

Meaning: the sun rises at +X at 06:00, is highest at 12:00, sets at −X at 18:00; it is tilted toward +Z by `sin(lat − 23.5°)` all day, constant in time. At latitude 23.5 the noon sun is straight up. There is no season: the 23.5° is a fixed offset.

Sources, all community (none Roblox staff):
1. **Sun**, DevForum topic 3921848 post #29 by Chark_Proto (2025-09-17), https://devforum.roblox.com/t/3921848 : `local latRad = math.rad(geographicalLatitude - 23.5)`, `local lonRad = math.rad((t - 6) * 15)`, `x = cos(lat)cos(lon), y = cos(lat)sin(lon), z = sin(lat)`, with a screenshot claiming the formula's vector and `Lighting:GetSunDirection` "are Z-Clashing" (overlap exactly).
2. **Sun and moon**, MaximumADHD/Roblox-Plugins `CelestialBodyDragger/init.server.lua` (main), the inverse used by a long-standing Studio plugin: `local lon = atan2(dir.Y * lf, dir.X * lf)`, `local lat = atan2(dir.Z, sqrt(dir.X^2 + dir.Y^2))`, `Lighting.ClockTime = ((lon / tau) * 24 - 6) % 24`, `Lighting.GeographicLatitude = (lat / tau) * 360 + 23.5`, with `LongitudeFactor = -1` for the Sun and `1` for the Moon. Inverting it gives exactly the sun and moon formulas above (I checked the algebra; the moon's longitude factor flips X and Y but not Z).
3. **Sun and moon**, Quenty/NevermoreEngine `src/sunpositionutils/src/Shared/SunPositionUtils.lua` (main): `sunPosition = Vector3.new(math.sin(sourceAngle), -math.cos(sourceAngle), 0)`; `sunOffset = -EARTHTILT * math.cos(math.pi * (dayOfYearOffset - HALFYEAR) / HALFYEAR) - latRad`; rotate about `ZAXIS:Cross(sunPosition)` by `sunOffset`; moon = same rotation of `(sin(a+π), cos(a+π), 0)` then `* Vector3.new(1, -1, 1)`. I expanded both: they equal the formulas above, except the tilt is multiplied by `cos(π·t/(24·182.6282))`, which moves Z by at most 3.3e-5 (negligible; ignore unless matching to 1e-4). Its docstring says it computes "where Roblox is rendering the sun". It cites `iryl1/RBX_DOCUMENTATIONS lighting.md`, which presents the same maths as C++ (`boost::posix_time`, `Matrix3::fromAxisAngle`). That C++ looks transcribed from old Roblox engine source; provenance unknown, so not treated as a primary source.
4. **Sun**, TabooHarmony/roblox-headless-renderer `src/rhr/scene/scene.js` comment: "Roblox's sun (Lighting:GetSunDirection, sampled in Studio at 6/9/12/14/18h): rises at +X, sets at -X, tilted toward +Z by sin(latitude - 23.5 degrees)", then the same formula. Also chteau/rbx-native `crates/rbx_viewer/src/lighting/sun.rs` uses it, calling it "the community reproduction ... reverse-engineered rather than authoritative".

Reference values at Instance.new defaults (14:00, lat 41.7333), computed from the formula, **not measured by me**:

| ClockTime | sun | moon |
|---|---|---|
| 0 | (0, −0.94979, 0.31289) | (0, 0.94979, 0.31289) |
| 6 | (0.94979, 0, 0.31289) | (−0.94979, 0, 0.31289) |
| 12 | (0, 0.94979, 0.31289) | (0, −0.94979, 0.31289) |
| 14 | (−0.47490, 0.82254, 0.31289) | (0.47490, −0.82254, 0.31289) |
| 18 | (−0.94979, 0, 0.31289) | (0.94979, 0, 0.31289) |

To make this VERIFIED, someone must print `Lighting:GetSunDirection()` / `GetMoonDirection()` in Studio at a few (ClockTime, latitude) pairs. Recommended test pairs: (14, 41.7333), (9, 0), (21, 70).

### 1b. Which body lights the scene (UNSURE)

- Community, EgoMoose, DevForum topic 507132 post #11 (2020-04-05; not staff at the time): "The light source, the sun or moon, is always in the sky. They can't both be below. This is a limitation of Roblox".
- Quenty `SunPositionUtils.getLightSourceType`: sun is the light while `sunPosition.Y > -0.3`, otherwise the moon. Note the threshold is below the horizon (twilight lit by a sun under the horizon). Same provenance caveat as above.
- Quenty also has the time-of-day colour splines for light colour, ambient and sky ambient (`LIGHT_COLOR_SEQUENCE` etc.) and `getLightSourceBrightness = clamp(map(sun.Y, -1, 1, 0.1, 1))` (moon: `map(moon.Y, -1, 1, 0.1, 0.5)`). These are the same old-engine provenance and may be out of date for the 2019+ renderer. **UNSURE**; use only as a starting point.

---

## 2. `Enum.Technology` and its replacement (LightingStyle + PrioritizeLightingQuality)

### 2a. Values (VERIFIED, `API`)

```
Enum Technology
  Legacy : 0 [Deprecated]
  Voxel : 1
  Compatibility : 2
  ShadowMap : 3
  Future : 4
  Unified : 5 [Deprecated]
```

`CD/reference/engine/enums/Technology.yaml` (current): Legacy "is deprecated and cannot be selected in Studio"; Compatibility "Simulates the removed legacy technology and is now deprecated. To achieve a similar look, use `Voxel` Lighting and add a `ColorGradingEffect` post‑processing effect set to the `Retro` preset" and "cannot be selected in Studio"; Unified "deprecated and cannot be selected in Studio". The enum page and `Lighting.yaml` both say Technology "has been superseded by `LightingStyle` ... and `PrioritizeLightingQuality`". Technology read and write security is `RobloxScriptSecurity` (not readable by game scripts).

Older wording of the same file (creator-docs commit `cca2d1a5`, 2023-11-02): Legacy "Lighting technology that predates Future-Is-Bright. It is no longer available."; Voxel "Future-Is-Bright lighting features. Shadows are created using a 4x4x4 voxel map."; Compatibility "An approximation of Legacy rendering using newer Future is Bright technology."; ShadowMap "Features crisp shadows."; Future "Latest Future-Is-Bright lighting features."

### 2b. What each mode renders (VERIFIED from docs where quoted; details below that are UNSURE)

From the creator-docs lighting guide before the LightingStyle rewrite (`CD environment/lighting.md` at creator-docs commit `05835232^`, i.e. before 2025-07-23), section "Technology":
- **Future**: "Extends detailed shadow support to all types of lights, with complex shadow technology for sun shadows and a more realistic lighting and shadow technology for point lights." "the most realistic lighting mode".
- **ShadowMap**: "shadow mapping that produces more realistic and sharper shadows from sunlight or directional light sources. For any other types of light, such as `PointLights`, it uses voxel grids with less precision and performance impact."
- **Voxel**: "Divides the 3D world into a 4×4×4 voxel grid for light and shadow calculation ... Provides less precise lighting and softer shadows compared to more advanced shadow mapping techniques like ShadowMap. Only recommended for low-end devices."
- `CD Lighting.yaml` GlobalShadows (current): "Shadows are calculated using a voxel system and each lighting voxel is 4×4×4 studs. This means objects need to be larger than 4×4×4 studs to display a realistic shadow." (This text predates the shadow-map modes and describes Voxel.)
- The same old guide: ColorShift_Bottom "is particularly subtle. If you cannot see a change in your experience, change the Technology property to **Compatibility** and/or increase the Brightness value."

So, per light type:

| Mode | Sun/moon shadows | Local light (Point/Spot/Surface) shadows | Source |
|---|---|---|---|
| Voxel | voxel (4×4×4 studs, soft, blocky) | voxel | VERIFIED (guide quotes above) |
| ShadowMap | shadow map (crisp; ShadowSoftness applies) | voxel | VERIFIED |
| Future | shadow map | per-light shadow maps ("detailed shadow support to all types of lights") | VERIFIED |
| Compatibility | voxel, plus a pre-2019 tonemap look | voxel | VERIFIED that it is now "Voxel + ColorGradingEffect Retro" (enum doc); UNSURE beyond that |

Specular and image-based lighting (VERIFIED, staff): IBL (EnvironmentDiffuseScale/EnvironmentSpecularScale) arrived with Future Is Bright Phase 2.5 and is not limited to Future. DevForum Announcements topic 429543, "Future Is Bright: Phase 2.5 Released" (Qiblox, Roblox_Staff, 2020-01-10): "we've modified our lighting system to adopt a Physically Based Rendering (PBR) model ... We switched to a new specular BRDF ... The most notable difference, however, will come from Image Based Lighting (IBL) where we use the environment map (skybox) as a source of lighting information." Recommended setup: "using Voxel or Shadowmap mode; setting Ambient and OutdoorAmbient to Color3(0,0,0) or a low value; setting both new properties to 1". So Voxel, ShadowMap and Future all have sun specular and IBL; only Future adds local-light specular (section 7c). Whether Compatibility/Legacy had IBL: I don't know (moot now: Compatibility = Voxel + Retro).

### 2c. Unified Lighting: the current model (VERIFIED, DevForum Announcements)

Source: DevForum Announcements topic 3401512, "Let There Be (Unified) Light! Unified Lighting is Fully Live", https://devforum.roblox.com/t/3401512 . Original post 2025-01-21 (Studio beta); update by m0bsterlobster (group Roblox_Staff in the topic JSON), post #368, 2025-07-23, signed "Roblox Rendering Team":

> "We will automatically map your old Lighting.Technology property to the new ones (Lighting.LightingStyle & Lighting.PrioritizeLightingQuality) to ensure parity with your previous lighting look and feel:
> Future: LightingStyle = Realistic & PrioritizeLightingQuality = Enabled
> ShadowMap: LightingStyle = Soft & PrioritizeLightingQuality = Enabled
> Voxel: LightingStyle = Soft & PrioritizeLightingQuality = Disabled"

> "Realistic: Offers high-fidelity lighting with detailed shadows and shading ... Soft: Provides flatter-looking lighting with diffused shadows and lower contrast between shadowed and lit areas, often with non-directional lighting. This is also the best option for achieving the classic Roblox look."

> PrioritizeLightingQuality "Enabled: ... maintain lighting quality as much as possible while lowering the quality of other aspects first (e.g., draw distance) ... Disabled: ... reduce lighting quality first in order to preserve the quality of other aspects".

> "Note: Neither of these properties are scriptable, similar to the old Technology property." (beta post, 2025-01-21)

Mapping summary for Claude Studio:

| LightingStyle | PrioritizeLightingQuality | Equivalent old mode |
|---|---|---|
| Realistic | true | Future |
| Realistic | false | none (new combination; Future-quality that degrades sooner). UNSURE what it renders at max quality; LightSettingsGuy (staff) post #363, 2025-07-21: "Max QL, both should be the same now as what one would see in Future." (context: replying about two settings looking different; I could not confirm which two) |
| Soft | true | ShadowMap |
| Soft | false | Voxel |
| (old Compatibility) | | Voxel + `ColorGradingEffect{TonemapperPreset=Retro}` (enum doc above) |
| (old Legacy) | | gone; Compatibility imitated it |

- Scriptability: `API` shows LightingStyle and PrioritizeLightingQuality with `{🚧✏️PluginOrOpenCloud}` write capability (so readable by scripts, writable only by plugins/Open Cloud). Community report rojo-rbx/rbx-dom issue #665 says "plugin-writable as of v740"; not checked further.
- ShadowSoftness (VERIFIED, `CD environment/lighting.md` current): "adjusts how blurry shadows are from a value of `0` (hard edges) to `1` (soft edges). This property is only valid when `LightingStyle` is set to `Realistic`." The class page still says "only works when Technology mode is ShadowMap or Future" and "a default of `0.2`" (the rbx-dom Instance.new default is 0.5; the docs value may be stale). Both statements are Roblox's; they disagree for Soft+Prioritize (= old ShadowMap).

---

## 3. How the Lighting properties enter the shading

### 3a. What can and cannot be known

- **VERIFIED**: the shader-side formulas below (decompiled GLSL in RCT).
- **UNSURE / not found**: how the C++ engine turns Lighting properties into the shader constants (`Lamp0Color`, `Lamp1Color`, `AmbientColor`, `SkyAmbient`, `AmbientCube`, `FogParams`, exposure). That code is not public. Where I map a property to a constant, it is an inference from names and docs, marked as such.

### 3b. Constant-buffer layout (VERIFIED)

`RCT:shaders/include/Globals.h` at HEAD is the struct behind `uniform vec4 CB0[61]`. Packing each member into vec4 slots (std140) gives these indices, which I cross-checked against the 2019 layout (RCT commit `9219d8ab9`, where the struct is inlined in `DefaultPlasticFS.frag` and the same members line up with the same uses):

| CB0 | Globals member | Meaning (inferred from use) |
|---|---|---|
| 11 | `CameraPosition[0]` | camera position |
| 13 | `AmbientColor` | flat ambient (with IBL folded in) |
| 14 | `SkyAmbient` | extra ambient scaled by sky visibility |
| 15 | `Lamp0Color` | sun/moon light colour |
| 16 | `Lamp0Dir` | light direction (the shader uses `-Lamp0Dir` as the vector toward the light) |
| 17 | `Lamp1Color` | light applied to faces turned away from Lamp0 |
| 18 | `FogParams` | fog curve constants |
| 19 | `FogColor_GlobalForceFieldTime` | fog colour |
| 20 | `Exposure_DoFDistance` | `.y` multiplies colour before output encoding; `.x` used by DOF passes |
| 21–24 | `LightConfig0..3` | voxel light-grid transform; `LightConfig0.w` = clamp on ambient+local light |
| 28 | `RefractionBias_FadeDistance_GlowFactor_Free` | `.y` = distance fade for normal maps/IBL |
| 29 | `TextureData_ShadowInfo` | `.z/.w` shadow fade constants |
| 30 | `SkyGradientTop_EnvDiffuse` | `.xyz` sky top tint; `.w` env diffuse (name says EnvironmentDiffuseScale) |
| 31 | `SkyGradientBottom_EnvSpec` | `.xyz` sky bottom tint; `.w` env specular (name says EnvironmentSpecularScale) |
| 32 | `AmbientColorNoIBL_CubeBlend` | flat ambient without IBL; `.w` indoor-probe blend |
| 33 | `SkyAmbientNoIBL` | sky ambient without IBL |
| 34–45 | `AmbientCube[12]` | two 6-face ambient cubes (+X,−X,+Y,−Y,+Z,−Z): 34–39 sky-visible part, 40–45 the rest |
| 58–60 | `SkyboxRotation0..2` | Sky.SkyboxOrientation as a 3×3 matrix |

### 3c. Colour space: gamma 2.0, not sRGB (VERIFIED)

Every surface shader decodes colours by squaring and encodes by `sqrt`. `RCT:shaders/shaders_glsl3/DefaultUnifiedPlasticReflectionFS_10000000.frag`: `vec3 f3 = f2 * f2;` (albedo to linear) ... `vec3 f35 = sqrt(clamp(f34.xyz * CB0[20].y, vec3(0.0), vec3(1.0)));` (output). The post passes decode the scene buffer as `(f0 * f0) * 4.0` (e.g. `DownSampleGlowTemporal8x8FS.frag`, `FXCompositingFS.frag`) and re-encode as `sqrt(clamp(x * 0.25, 0, 1))`, so the HDR scene buffer holds `sqrt(linear / 4)`: linear range 0–4. Inference: `CB0[20].y` therefore includes a 1/4 factor (exposure/4); UNSURE.

### 3d. Surface lighting, low/voxel path (VERIFIED code)

`RCT:shaders/shaders_glsl3/DefaultUnifiedPlasticReflectionVS_10000000.vert` (vertex):

```glsl
vec3 v4 = -CB0[16].xyz;                 // toward the light
float v5 = dot(v0, v4);                 // N·L
vec3 v18 = (CB0[15].xyz * clamp(v5,0,1)) + (CB0[17].xyz * clamp(-v5,0,1));   // Lamp0 on lit side, Lamp1 on the back side
v22.w = clamp(v5,0,1) * ((COLOR1.y * 0.055556) * exp2((v16 * dot(v0, normalize(v4 + normalize(v1)))) - v16));  // Blinn-Phong, v16 = COLOR1.y*0.50360
```

`...FS_10000000.frag` (fragment):

```glsl
vec4 f18 = texture(LightMapTexture, f16);            // voxel local light: rgb * a*120
vec4 f19 = texture(LightGridSkylightTexture, f16);   // .x sky visibility, .y sun shadow
vec3 f21 = ((VARYING6.xyz * f19.y)                    // sun diffuse * voxel shadow
          + min(f18.rgb*(f18.a*120.0) + (CB0[13].xyz + CB0[14].xyz*f19.x), vec3(CB0[21].w)))
          * mix(albedo², envReflection * mix(CB0[31].xyz, CB0[30].xyz, clamp(R.y*1.588235,0,1)), reflectance)
        + CB0[15].xyz * (spec * f19.y * 0.1);
```

So, per pixel: `colour = (Lamp0·max(N·L,0)·shadow + Lamp1·max(−N·L,0)·shadow + min(local + Ambient + SkyAmbient·skyVis, clamp)) × albedo + Lamp0·spec·shadow·0.1`.

Inferred property mapping (UNSURE, consistent with docs):
- `Lamp1Color` is ColorShift_Bottom's channel: it lights exactly the faces turned away from the sun/moon, which is the documented behaviour ("hue ... in the opposite surfaces to those facing the sun or moon"). In the HQ shader (3e) it is multiplied by the shadow term, which fits the doc note that its influence "can be very hard to identify when GlobalShadows is enabled".
- `Lamp0Color` carries sun colour × Brightness, tinted by ColorShift_Top. Not verified. Community claim (Aerophagia, topic 2580333 post #18, 2023-10-15, not staff): "colorshift_top controls your Sunlight colour. colorshift_bottom does nothing nowadays." Conflicts with the doc text for ColorShift_Bottom; the shader still has the `Lamp1Color` term, which may simply be fed black. UNSURE.
- Brightness scale, community measurement only (TabooHarmony/roblox-headless-renderer `scene.js`, fitted to Studio captures of particles/beams): the light a `LightInfluence = 1` effect receives is "the larger of Ambient and OutdoorAmbient, squared, plus Lighting.Brightness / 2 while the sun is up (fading in over the 15 minutes after sunrise, and out before sunset)". That suggests sun intensity ≈ Brightness/2 in linear units and ambient colours squared (gamma 2) before use. UNSURE.
- `AmbientColor` = Ambient and `SkyAmbient` = the part of OutdoorAmbient above Ambient, applied only where the sky is visible. This matches the doc rule "The effective OutdoorAmbient value is clamped to be greater than or equal to Ambient in all channels" (i.e. `SkyAmbient = max(OutdoorAmbient − Ambient, 0)`), and "when GlobalShadows is disabled ... OutdoorAmbient will be ignored". Not verified.
- Whether colours are squared (gamma 2 → linear) before upload: UNSURE.

### 3e. Surface lighting, HQ/PBR path (VERIFIED code)

`RCT:shaders/shaders_glsl3/DefaultUnifiedPlasticReflectionFS_20000000.frag` (normal-mapped, shadow-mapped, PBR). Key lines:

```glsl
float f22 = CB0[31].w * clamp(1.0 - (VARYING4.w * CB0[28].y), 0.0, 1.0);   // spec IBL weight = EnvSpec * distance fade
float f23 = 0.089 + (CB2[0].y * 0.911);                                    // roughness remap
vec3  f30 = textureLod(PrefilteredEnvTexture, R, f23*5) * mix(CB0[31].xyz, CB0[30].xyz, clamp(R.y*1.588235,0,1)); // outdoor env
vec3  f32 = textureLod(PrefilteredEnvIndoorTexture, R, f23*5);             // indoor probe (blend target via CB0[32].w)
vec4  f34 = texture(PrecomputedBRDFTexture, vec2(f23, max(1e-4, dot(N, V))));
vec3  f46 = ((0.04 * f34.x) + f34.y) / (f34.x + f34.y);                     // env BRDF, F0 = 0.04, normalised
float f58 = dot(N, -CB0[16].xyz) * ((1.0 - shadowMapTerm) * f40.y);         // N·L * shadow-map * voxel shadow
vec3  f67 = Schlick(L·H) with F0 0.04;
ambient = (1 - f46*f22) * (AmbientCube[40..45]·N² + AmbientCube[34..39]·N² * skyVis)
        + (CB0[32].xyz + CB0[33].xyz * skyVis);                             // AmbientColorNoIBL + SkyAmbientNoIBL*skyVis
diffuse = ambient + (1 - f67*f22) * Lamp0 * sat(f58) + Lamp1 * sat(-f58) + local(voxel)*120;
colour  = diffuse * mix(albedo², envOutdoor, reflectance)
        + mix(envIndoor, envOutdoor, skyVis) * f46 * f22                    // specular IBL
        + f67 * D_approx * sat(f58) * Lamp0;                                // sun specular (GGX-like, see file)
```

Ambient cube weights use the squared normal components split by sign (`f47 = N*N; f49 = (N<0) ? N*N : 0; f50 = f47 - f49`), i.e. `+X·max(N.x,0)² + −X·max(−N.x,0)² + ...`.

Inferred mapping (UNSURE): EnvironmentSpecularScale = `CB0[31].w` (scales specular IBL and also removes that much energy from diffuse via `1 − F·f22`). EnvironmentDiffuseScale likely scales the `AmbientCube` (sky-derived ambient) relative to the flat `...NoIBL` ambient; the doc says to lower Ambient/OutdoorAmbient when raising it. Specular from the sun (GGX lobe) is present whether or not EnvironmentSpecularScale is 0.

What Roblox staff said about the two scales (VERIFIED, topic 429543, Qiblox, 2020-01-10): "Valid values for these properties are [0-1] where 0 represents no IBL contribution, 1 full IBL contribution". "EnvironmentDiffuseScale controls the amount of view independent lighting reflected from the environment, scaled by the objects color. Note that this is added on top of Ambient and OutdoorAmbient and can be used in place of Ambient and OutdoorAmbient." "EnvironmentSpecularScale controls the amount of view dependent lighting reflected from the environment. This gives the 'mirror-like' reflections, dependent on the objects roughness property." "When both properties are set to 0, lighting should appear similar to before FiB 2.5." "we only use the skybox as a source of environment lighting (when outdoors)". The shader matches this: the `AmbientCube` (sky irradiance, scaled by EnvironmentDiffuseScale on the CPU, inferred) is added to the flat `AmbientColorNoIBL + SkyAmbientNoIBL·skyVis`; indoors (`skyVis` → 0) the indoor probe cube and `AmbientCube[40..45]` take over (indoor dynamic environment maps: Announcements topic 1115802, 2021-03-17, not read in detail).

This path has shadow-map sun shadows and voxel local lights. The Future path (per-pixel local lights with shadows: `LightGridCull*CS` compute shaders listed in `RCT:shaders/shaders_d3d11.csv`) has no GLSL3 source in the dump; I could not read it.

### 3f. History: Legacy/Compatibility lit in gamma space (VERIFIED code)

RCT commit `9219d8ab9` (2019-08, client 0.396), `shaders/shaders_glsl/DefaultPlasticFS.frag`, struct member `vec4 Technology_Exposure;` (CB0[15]):

```glsl
vec3 _617 = vec3(CB0[15].x);                               // Technology flag
... * mix(_540, _540 * _540, _617)                         // albedo: gamma-space (0) or squared/linear (1)
... mix(_872.xyz, sqrt(clamp(_872.xyz * CB0[15].z, 0, 1)), _617)   // output: raw (0) or sqrt(exposure*c) (1)
fog = clamp((CB0[13].x * length(VARYING4.xyz)) + CB0[13].y, 0.0, 1.0)  // linear fog
```

So the pre-2019 look lit in gamma space with no exposure/tonemap; "Future Is Bright" technologies light in (gamma-2) linear space.

### 3g. Exposure and tone mapping

- **VERIFIED (doc)** `CD Lighting.yaml` ExposureCompensation: "applies a bias to the exposure level of the scene prior to the tonemap step. Defaults to `0` ... range from `-5` to `5`. A value of `1` indicates twice as much exposure and `-1` means half as much exposure." So the scale is `2^ExposureCompensation`, before the tonemap.
- **VERIFIED (code)** The tonemap + colour-correction pass, last present in the dump at `RCT@0a257e8` (`shaders/shaders_glsl/ImageProcessFS.frag`, 2025-05-01; identical shape back to `b239f6d9d`, 2020-06):

```glsl
vec3 f1 = (f0 * f0) * 4.0;                                                     // decode HDR
vec3 f2 = f1 * CB1[6].x;
vec3 f3 = ((f1 * (f2 + vec3(CB1[6].y))) / ((f1 * (f2 + vec3(CB1[6].z))) + vec3(CB1[6].w))) * CB1[7].x;   // tonemap
gl_FragData[0] = vec4(dot(f3, CB1[2].xyz) + CB1[2].w, dot(f3, CB1[3].xyz) + CB1[3].w, dot(f3, CB1[4].xyz) + CB1[4].w, 1.0);  // 3x4 colour matrix
```

  i.e. `T(x) = e · x(a·x + b) / (x(a·x + c) + d)` per channel, then an affine 3×4 colour matrix, written straight to the display (no `sqrt` afterwards). `ImageProcessBloomFS` / `ImageProcessFXCompositionFS` do the same after adding the bloom (`(bloom²)*4`) and sun-ray (`(rays*CB1[5].w)²`) buffers, so bloom and sun rays are added in HDR **before** the tonemap.
- **UNSURE** The constants a, b, c, d, e are uniforms; their values are not in the shaders. The form, with the same `a` in numerator and denominator and no gamma step after it, is exactly the Hejl/Burgess-Dawson filmic curve `x(6.2x+0.5)/(x(6.2x+1.7)+0.06)`, which outputs display-ready (gamma-baked) values. That is my inference, not verified. If true, the display output needs no further sRGB/gamma encode.
- **VERIFIED (staff)** The Default tonemap does not map 1.0 to white. Homeomorph (Roblox_Staff), DevForum topic 296043 post #7 (2019-11-27): "White Frames in LightInfluence=0 GUIs emit light with a brightness of 1,1,1 which gets tonemapped to a color on your screen that's not pure white. If you set Lighting.Technology to Compatibility, your GUI should get tonemapped to pure white (or something close)." Post #11 (2021-04-21): workaround "disable Bloom and increase Lighting.ExposureCompensation so the guis reach pure white". Topic 593258 post #9 (2021-06-18): "our tonemapper altering the color of everything that gets drawn into the 3D world. ExposureCompensation is expected to affect the perceived brightness of everything in 3D." If the curve is Hejl–Dawson, `T(1) = 6.7/7.96 = 0.842` (≈ 215/255): a cheap test is a white `LightInfluence = 0` SurfaceGui frame in Studio with Bloom off.
- Topic 207935 (2018-12-03): "The entire pipeline is now using HDR as well, with a custom tonemapper that we plan to expose controls for in the future." (Only the Default/Retro preset has been exposed since.)
- **VERIFIED (doc)** `TonemapperPreset.Default` = "post‑2019 Roblox appearance", `Retro` = "imitate the pre‑2019 Roblox appearance" (enum doc). The Retro curve's maths: I don't know. Per the staff quote above, Compatibility (now Retro) maps 1.0 to (near) pure white, so Retro is close to identity/clamp for values ≤ 1.
- Since 0.672 (May 2025) the `ImageProcess*` passes are gone from the GLSL dump; the current `FXCompositingFS.frag` (HEAD) only composites (`sqrt(clamp(((f0²·4) + (f1²·4)) + (f2·w)²) · 0.25, 0, 1))`) and stays in the encoded HDR space, so the tonemap now happens in a pass not present in the dump.
- Community fit (UNSURE): TabooHarmony/roblox-headless-renderer `scene.js` fits a per-channel curve to Studio particle captures; it does not identify Roblox's curve.

---

## 4. Atmosphere and fog

### 4a. What Roblox documents (VERIFIED, `CD`)

- `Atmosphere.yaml`: "Fog properties are hidden when Lighting contains an Atmosphere object." Same note on `Lighting.FogColor/FogStart/FogEnd`: "fog properties are hidden when `Lighting` contains an `Atmosphere` object." ("hidden" in the Properties window; the docs do not literally say "ignored".)
- Density: "the amount of particles in the air ... the more in-game objects/terrain will be obscured ... density does not **directly** affect the skybox".
- Offset: "Controls how light transmits between the camera and the sky background. Increase this value to create a horizon silhouette against the sky or reduce it to blend distant objects into the sky ... A low offset may cause 'ghosting' where the skybox can be seen through objects/terrain."
- Color: "changes the Atmosphere hue ... best combined with increased Haze".
- Decay: "the hue of the Atmosphere away from the sun, gradually falling off from Color towards this value. Must be used with Haze and Glare levels higher than 0".
- Glare: "glow/glare of the Atmosphere around the sun ... Must be used with a Haze level higher than 0".
- Haze: "haziness ... with a visible effect both above the horizon and into the distance".

Whether FogStart/FogEnd are ignored with an Atmosphere present: **UNSURE but strongly indicated**. The shader (4b) has one fog path whose colour switches between `FogColor` and the sky, and the community has asked since 2020 for a FogStart equivalent for Atmosphere because it has none (DevForum feature request topic 701963, "Atmospheric fog needs something like the old FogStart", 2020-08-01, no staff reply). Treat Atmosphere as replacing Fog entirely.

### 4b. Fog in the surface shaders (VERIFIED code, one formula for both kinds)

Every lit surface, particle and trail shader at HEAD uses the same fog (e.g. `DefaultUnifiedPlasticReflectionFS_20000000.frag`, `ParticleCustomFS.frag` line 63, `TrailFS.frag` line 39):

```glsl
float vis = clamp(exp2((CB0[18].z * dist) + CB0[18].x) - CB0[18].w, 0.0, 1.0);    // dist = |camera - point|
vec3  skyFog = textureLod(PrefilteredEnvTexture, -viewDir(rotated by SkyboxRotation), max(CB0[18].y, vis) * 5.0).xyz;
vec3  fogCol = (CB0[18].w != 0.0) ? CB0[19].xyz /* FogColor */ : skyFog;
colour = mix(fogCol, colour, vis);
```

So: with `FogParams.w == 0` (the Atmosphere case, inferred) the fog is pure exponential in distance, `vis = 2^(z·d + x)`, and its colour is the **prefiltered sky cube map in the view direction**, blurred more as visibility falls (mip `max(y, vis)·5`): that is the "aerial perspective" / ghosting the docs describe. A positive `x` would hold `vis` at 1 out to `d = −x/z` (a fog start), but Roblox exposes no such control; how Density and Offset set `x`, `y`, `z` is C++: **I don't know**.

Classic fog (no Atmosphere): `FogParams.w != 0` selects the flat FogColor. In 2019 the fog was linear (`clamp((CB0[13].x * length(VARYING4.xyz)) + CB0[13].y, 0.0, 1.0)`, RCT `9219d8ab9` `DefaultPlasticFS.frag`); since 2020 (RCT `b239f6d9d`) it uses the exp2 form above. One choice of constants that meets FogStart and FogEnd exactly is `w = 1, z = −1/(End−Start), x = End/(End−Start)`, i.e. `vis = 2^((End−d)/(End−Start)) − 1` (1 at FogStart, 0 at FogEnd, about 0.414 midway instead of 0.5). That is my **hypothesis**, not verified. Test: a grey part halfway between FogStart and FogEnd.

### 4c. Atmosphere on the sky (VERIFIED code; property mapping UNSURE)

`RCT:shaders/shaders_glsl3/AdvSkyFS.frag` + `AdvSkyVS.vert` at HEAD, with `Params.h` (`world` CB1[0–3], `viewProjection[2]` CB1[4–11], `color0` 12, `color1` 13, `fogOffset` 14, `glare` 15, `irradiance[6]` 16–21):

```glsl
// VS: sky texture tint, vertical gradient
VARYING2 = mix(CB1[13] /*color1*/, CB1[12] /*color0*/, clamp(worldPos.y * (1/1700), 0, 1));
// FS:
vec3  d   = normalize(worldPos);
float T   = exp2(CB1[14].x / (0.001 + pow(max(d.y, 1e-5), CB1[14].y)));       // transmittance vs elevation ("fogOffset")
vec3  amb = (irr[+X]·max(d.x,0)² + irr[−X]·max(−d.x,0)² + irr[+Y]·... + irr[−Z]·max(−d.z,0)²) * CB0[19].xyz;   // 6-face irradiance x FogColor slot
vec3  glr = CB0[15].xyz /*Lamp0Color*/ * clamp(pow(vec3(0.5 + 0.5*dot(d, -CB0[16].xyz)), CB1[15].xyz) * (1 - T), 0, 1) * CB1[15].w;   // sun glare lobe
sky = mix(amb + glr, skyboxTexel² * VARYING2, clamp(T, 0, 1));
alpha = max(1 - T, step(0.5, min(tex.x, tex.w)));
```

Read: the skybox shows through by a transmittance `T` that depends only on view elevation (thickest at the horizon); the rest is in-scattered light = an ambient term tinted by the fog-colour slot plus a sun-centred glare lobe `pow(half-Lambert(view·sun), exponent per channel) × intensity`. Natural fits to the properties (all **UNSURE**): Haze/Offset → the `fogOffset` pair (how fast `T` falls toward the horizon); Color/Decay → the in-scatter colour (FogColor slot, per-channel glare exponents giving the Color-near-sun to Decay-away-from-sun falloff); Glare → `glare.w`. `AdvSunFS.frag` multiplies the sun texture by `exp2(CB1[14].x)` (dimmed by the same horizon transmittance at zenith).

### 4d. Community measurements (UNSURE)

TabooHarmony/roblox-headless-renderer `src/rhr/scene/scene.js` ("measured in Studio (a Roblox template's lighting; black and white panels 25 to 800 studs from the camera, Density 0.2 / 0.375 / 0.6, Haze 0 / 2 / 5)"): geometry keeps `exp(−(depth/L)^p)` with `L ≈ 7900 studs, p ≈ 1.8` at Density 0.2; `512, 1.6` at 0.375; `77, 1.25` at 0.6; "Haze hardly changes it"; "Haze veils the sky: below the horizon it is the fog colour once Haze reaches 1, above it a band about 1.5 × Haze degrees high blends in, and from Haze 5 the whole sky is fog-coloured"; "The fog colour lies between Color and Decay, nearer Decay." Note the conflict: the shader fog is a pure exponential in distance (p = 1); their p > 1 may come from measuring after the tonemap. Use the shader form, and their L values only as a rough Density calibration.

---

## 5. Post effects

### 5a. Parenting, combining, quality (VERIFIED)

- `CD PostEffect.yaml`: "Objects of this kind should be parented to the `Lighting` or the `Workspace.CurrentCamera` in order to work." "They do not affect `GuiObjects`." Some effects "will work differently or **not at all**" at low QualityLevel.
- DevForum Announcements topic 25023, "Post-processing effects" (zeuxcg, Roblox rendering engineer at the time; 2016-05-12): "Rendering engine searches for these objects in two places: Children of Lighting (not descendants); Children of Camera (not descendants). Then picks the ones that are enabled, combines the values in somewhat intuitive ways (e.g. if you have five BlurEffects we'll use the strongest of them; if you have one ColorCorrection effect that desaturates the image and another one that makes it brighter we'll apply both)". Same post: "ColorCorrection is enabled regardless of the user's quality settings"; Blur and Bloom from quality level 6; SunRays from 8 (2016 numbers; may have changed).
- `CD post-processing-effects.md`: effects in Lighting "display to **all players**"; in Camera "only display to a **specific player**".
- Per-class rules from `CD`: BloomEffect "Multiple BloomEffect objects can be applied at once and they will compose their effects together." BlurEffect "Only one BlurEffect can be applied at once (the instance with the greatest Size takes priority)." ColorCorrectionEffect "Multiple ... can be applied at the same time and they will compose their effects together." ColorGradingEffect "is expected to be parented to `Lighting` and will be ignored if parented elsewhere. Multiple instances cannot be combined and only the most recently parented instance to Lighting will be applied."
- Neon and bloom are one system since Future Is Bright Phase 1. DevForum Announcements topic 207935 (zeuxcg, 2018-12-03): "We have reimplemented neon/bloom pipeline using techniques inspired by games such as recent Call Of Duty and INSIDE; this results in a nicer bloom and unifies neon/bloom - neon parts are very bright but so are some other parts if you have a very bright light source next to them." Same post, migration advice: "increasing the Lighting.Brightness value from 1 to 2, or changing Bloom.Threshold ... to some value between 1.5 and 2.5". Topic 25023: "BloomEffect.Size controls the halo size of both bloom and neon".

### 5b. Order of application (VERIFIED from shader data flow; partly inferred)

From the passes in `RCT@0a257e8` and HEAD: the scene is rendered to an HDR buffer (`sqrt(linear·exposure/4)`); bloom and sun rays are computed from it and **added in HDR**; then the tonemap; then the ColorCorrection 3×4 matrix in display space (`ImageProcessFXCompositionFS.frag`: `f3 = (scene² · 4) + (bloom² · 4) + (rays · CB1[5].w)²` → tonemap → matrix). So: **[scene × 2^ExposureCompensation] → +bloom → +sun rays → tonemap (Default or Retro) → ColorCorrection (all instances composed)**. Where DepthOfField and Blur sit: the DOF passes read and write the encoded HDR buffer (`DOFResolveNearFS`: `sqrt(clamp(... * CB0[20].y, 0, 1))`), so DOF runs before the tonemap (VERIFIED it is in HDR space; exact position relative to bloom UNSURE). BlurEffect: I don't know its position.

### 5c. BloomEffect

- **VERIFIED code**, bright pass (`RCT HEAD:shaders/shaders_glsl3/DownSampleGjoelFS.frag`, 9-tap downsample, and `DownSampleGlowTemporal8x8FS.frag`, its temporally-stabilised variant):

```glsl
vec3 c = average_of_9_taps(sceneLinear);          // sceneLinear = enc² * 4
float m = max(max(c.x, c.y), c.z);
vec3 bright = c * (max(m - CB1[11].y, 0.0) / (m + 0.001)) * CB1[11].x;
out = sqrt(clamp(bright * 0.25, 0, 1));
```

  Then a chain of downsamples and tent upsamples (`UpSampleTentFS.frag`: 3×3 tent `[1 2 1; 2 4 2; 1 2 1]/16 · CB1[3].x`), added to the scene before the tonemap.
- **Inferred mapping (UNSURE)**: `CB1[11].y` = Threshold (subtracted from the brightest channel of the linear HDR colour; so Threshold 1 means "brighter than 1.0 linear", and the template's Threshold 2 only blooms values above 2), `CB1[11].x` = Intensity (multiplies the extracted colour). Size → the number of mip levels / upsample radius; doc: "radius of the bloom effect in pixels in a similar manner to BlurEffect.Size ... a value of 0 will disable the bleed (but not the color adjustment)". Exact Size→pyramid mapping: I don't know.
- Doc semantics (`CD BloomEffect.yaml`): Threshold "If set to 1, only pure white colors will bloom. If set to 0, all colors will bloom." Intensity: "how intensely the colors that bloom ... will additively blend".

### 5d. ColorCorrectionEffect

- **VERIFIED code**: applied as one affine 3×4 matrix after the tonemap (`ImageProcessFS.frag` at `RCT@0a257e8`: `vec4(dot(f3, CB1[2].xyz) + CB1[2].w, dot(f3, CB1[3].xyz) + CB1[3].w, dot(f3, CB1[4].xyz) + CB1[4].w, 1.0)`). So Brightness, Contrast, Saturation and TintColor of every enabled ColorCorrectionEffect are folded on the CPU into one matrix `M` and offset `b`: `out = M·c + b`, in display (post-tonemap) space. Any formula you implement must be affine in colour.
- **VERIFIED doc** (`CD ColorCorrectionEffect.yaml`): Brightness "-1 will cause all pixels to be completely black while a value of 1 will cause them to be white" (so it is an additive offset: `+Brightness`); Contrast "Values less than 0 have reduced contrast while values greater than 0 have increased contrast"; Saturation "Values above 1 [sic] will cause colors to be more vivid while values below 0 will make colors more dull, eventually reaching full desaturation at -1" (so `lerp(grey, c, 1 + Saturation)`); TintColor "The effect is multiplicative, so changing this to [255, 0, 0] (red) would cause the green and blue channels to be multiplied by 0."
- **UNSURE**: contrast pivot (0.5 is usual), contrast scale (`1 + Contrast` is usual), luminance weights for saturation, and the order in which the four are composed. Not found in any primary source. A Studio capture of a grey ramp at a few settings would pin these down.

### 5e. BlurEffect

- **VERIFIED doc**: "applies a Gaussian blur to the entire rendered game world"; Size "controls the blur radius, measured in pixels".
- **VERIFIED code** (`RCT HEAD:shaders/shaders_glsl3/Blur3FS.frag`; Blur1/5/7 are the same with fewer/more taps): separable Gaussian with weights `exp(-x²/(2σ²))`, `σ = CB1[2].z`, using paired-tap linear filtering:

```glsl
float f0 = (2.0 * CB1[2].z) * CB1[2].z;          // 2σ²
// pair (1,2): weight w12 = exp(-1/2σ²)+exp(-4/2σ²), offset 1 + exp(-4/2σ²)/w12  (texels along CB1[2].xy)
// pair (3,4), pair (5,6) likewise; centre weight 1; normalised by 1 + 2·Σw
```

- **UNSURE**: the relation between Size and σ and how many passes/downsamples are used at large sizes. 2016 note (topic 25023 post #63): fixed "Blur/Bloom footprint becoming square for large sizes", which implies multi-pass/downsampled blur at large Size.

### 5f. SunRaysEffect

- **VERIFIED doc**: "renders a halo of light around sun. The halo is shaped/blocked by world objects between the CurrentCamera and the sun." Intensity "opacity of the sun rays"; Spread "how wide ... should be set between 0 and 1".
- **VERIFIED code** (`RCT HEAD:shaders/shaders_glsl3/SunRays6FS.frag`, 9- and 12-tap variants; then `RadialBlur*FS.frag`):

```glsl
// march from this pixel toward the sun's screen position CB1[2].xy, jittered by a noise texture
count = Σ_taps float(depth(tap) >= 0.999)      // sky pixels only: LinearizeDepthAAFS writes 1.0 for the sky
float f = inversesqrt(clamp((1.0 + CB1[3].z) - (2.0 * CB1[3].y) * dot(viewRay, sunDir), 0.01, 1.0));
rays = CB1[4].xyz * (count * 2.0 * CB1[3].x) * ((1.0 - CB1[3].z) * f*f*f);
```

  The angular term is the Henyey–Greenstein phase function `(1−g²)/(1+g²−2g·cosθ)^{3/2}` with `g = CB1[3].y`, `g² = CB1[3].z`. Then 2–3 radial-blur passes (6/12 taps, averaging toward the sun) and composite: added in HDR before the tonemap (`FXCompositingFS`: `+ (rays · CB1[5].w)²`).
- **Inferred (UNSURE)**: Intensity → `CB1[3].x` (and/or the composite weight `CB1[5].w`); Spread → `g` (lower g = wider halo); `CB1[4].xyz` = sun colour.

### 5g. DepthOfFieldEffect

- **VERIFIED doc**: FocusDistance "distance away from the camera (in studs) where objects are in focus"; InFocusRadius "distance away from the FocusDistance (on both sides) where no blur is applied. Measured in studs."; FarIntensity "Intensity of the far field blur, moving out in distance from the FocusDistance point plus InFocusRadius"; NearIntensity "between the camera and the FocusDistance point minus InFocusRadius". The class page includes a diagram (`assets/engine-api/classes/DepthOfFieldEffect/Depth-Of-Field-Diagram.svg`).
- **VERIFIED code**: bokeh gather with a 45-sample disc (rings of 5, 10, 13 and 17 samples at radii 0.278, 0.54, ~0.788, 1.0) in `BokehFarCoCFS.frag` / `BokehNearCoCFS.frag` (27 samples in `CheapBokehFS.frag`); the sample radius is `CoC² · CB1[2].y · 0.014` in UV units (aspect-corrected), CoC stored in alpha; near field is dilated (`DOFDownSampleCoCMax4xFS`) and blended with `clamp(max(1, coc)*1.5)`.
- **I don't know**: the CoC-from-depth formula (where FocusDistance/InFocusRadius/intensities enter). It is not in any GLSL in the dump. A reasonable implementation: `coc_far = FarIntensity · saturate((d − (Focus + R)) / something)`, but the ramp length is unknown.

### 5h. ColorGradingEffect (VERIFIED doc; maths unknown)

TonemapperPreset Default/Retro (section 0). DevForum Announcements topic 3128560, "Compatibility Lighting becomes Retro Tone Mapping [Sunset + Migration]" (LightBeamRays, 2024-08-21): "Default is the current Tone Mapping we use with Future, ShadowMap or Voxel Lighting. Retro is the Tone Mapping we use for Compatibility Lighting"; "All values of ToneMapperPreset can be used with any lighting technology"; "Voxel is the same code path as Compatibility Lighting and offers the same performance, but it treats light brightness differently ... In Compatibility, local lights with a brightness > 1.0 are using a brightness of 1.0, but display a larger light radius."

---

## 6. Default lighting of a new Studio Baseplate (VERIFIED from Roblox's own saved file)

Source: rojo-rbx/rbx-test-files, commit `bb88023a07420390c61bee46b315592c9a5723ab`, `places/baseplate-727-with-tags/xml.rbxlx`. README: "A place file created when pressing File -> New in Roblox Studio" on "Roblox Studio version: 0.727.0.7271199" (mid-2026), with only tags added. Raw: `https://raw.githubusercontent.com/rojo-rbx/rbx-test-files/bb88023a07420390c61bee46b315592c9a5723ab/places/baseplate-727-with-tags/xml.rbxlx`. Extracted with an XML parser (script in my scratchpad). The 0.566 baseplate in the same repo (`places/baseplate-566/xml.rbxlx`, 2023) has identical lighting values; 0.727 adds the Unified Lighting properties.

**Lighting** (colours shown as 0–255; the file stores floats, e.g. `0.274509817` = 70/255):

| Property | Baseplate value | (Instance.new default, from rbx-dom, for contrast) |
|---|---|---|
| Ambient | (70, 70, 70) | 0.5 grey |
| Brightness | 3 | 1.98 per your note |
| ColorShift_Bottom | (0, 0, 0) | |
| ColorShift_Top | (0, 0, 0) | |
| EnvironmentDiffuseScale | 1 | 0 |
| EnvironmentSpecularScale | 1 | 0 |
| ExposureCompensation | 0 | 0 |
| ExtendLightRangeTo120 | 0 (Default) | |
| FogColor | (192, 192, 192) | |
| FogEnd | 100000 | 100000 |
| FogStart | 0 | |
| GeographicLatitude | 0 | 41.7333 |
| GlobalShadows | true | false |
| LightingStyle | 1 (Soft) | |
| OutdoorAmbient | (70, 70, 70) | |
| Outlines | false | |
| PrioritizeLightingQuality | true | |
| ShadowSoftness | 0.2 | 0.5 |
| Technology | 3 (ShadowMap) | 1 |
| TimeOfDay | "14:30:00" (ClockTime 14.5; ClockTime itself is not saved) | 14:00:00 |
| Attributes | `RBX_LightingTechnologyUnifiedMigration = true`, `RBX_OriginalTechnologyOnFileLoad = 3` (decoded from `AttributesSerialize`) | |

So the default place is **Soft + PrioritizeLightingQuality = ShadowMap-equivalent**, not Realistic/Future. Consistent with staff: RBLXImagineer (Roblox_Staff), DevForum topic 1127446 post #157 (2021-03-24): "we didn't set this template to 'Future' ... Future lighting technology mainly benefits local lights and the template doesn't start with any."

**Children of Lighting**, in file order:

| Class (Name) | Properties |
|---|---|
| Sky ("Sky") | CelestialBodiesShown true; MoonAngularSize 11; MoonTextureId rbxassetid://6444320592; SkyboxBk/Ft/Lf/Rt rbxassetid://6444884337; SkyboxDn rbxassetid://6444884785; SkyboxUp rbxassetid://6412503613; SkyboxOrientation (0,0,0); StarCount 3000; SunAngularSize 11; SunTextureId rbxassetid://6196665106; SourceAssetId 332039975 |
| SunRaysEffect ("SunRays") | Enabled true; Intensity 0.01; Spread 0.1 |
| Atmosphere ("Atmosphere") | Color (199,199,199); Decay (106,112,125); Density 0.3; Glare 0; Haze 0; Offset 0.25 |
| BloomEffect ("Bloom") | Enabled true; Intensity 1; Size 24; Threshold 2 |
| DepthOfFieldEffect ("DepthOfField") | Enabled **false**; FarIntensity 0.1; FocusDistance 0.05; InFocusRadius 30; NearIntensity 0.75 |

No ColorCorrectionEffect, ColorGradingEffect, BlurEffect or Clouds in the template. The template's lineage is "Baseplate 2021": DevForum Announcements topic 1127446 (2021-03-24, Rototally) lists "Updated lighting that is better suited for PBR", "Neutral Skybox", and "Sky, Atmosphere, BloomEffect, SunRaysEffect, DepthOfFieldEffect (disabled by default)".

---

## 7. Local lights (PointLight, SpotLight, SurfaceLight)

### 7a. Range and Brightness (VERIFIED)

- Range clamp **120 studs** (was 60). DevForum Announcements topic 3954367, "Extended Light Ranges: Doubling the Limit to 120" (m0bsterlobster, Roblox_Staff, 2025-09-23): "We are doubling the range limit for all local lights — PointLight, SpotLight, and SurfaceLight— from 60 to 120." "Previously, any light range set above 60 in a script was automatically clamped down to 60. With the new limit, that clamp has moved to 120." `CD Lighting.yaml` (ExtendLightRangeTo120): "always 120 studs".
- `CD effects/light-sources.md`: Brightness "sets the light's brightness with maximum effect at the center of the light. Note that Brightness is still limited to the light's defined range, so a higher Brightness value doesn't light up a larger region around the light." `CD Light.yaml`: Brightness "defaults to 1".
- Since Future Is Bright Phase 1 (Voxel, HDR), brightness above 1 matters: topic 182687 (zeuxcg, 2018-10-03): "mostly unclamped lighting values in internal computations which leads to overly-bright light sources behaving differently from dim light sources (unlike before where the difference between Brightness 10 and Brightness 2 was insignificant)". Topic 207935: "all light intensity values can now go far beyond 1 and still have a visible impact."
- Compatibility (now Voxel + Retro), topic 3128560: "In Compatibility, local lights with a brightness > 1.0 are using a brightness of 1.0, but display a larger light radius. This is not achievable in Voxel Lighting."
- Geometry (VERIFIED doc): SpotLight Angle "maximum value is 180 which illuminates a full half sphere from the apex"; SurfaceLight Angle "0 means that light travels directly outward from the surface while an angle of 180 means light travels outward perpendicular to the surface" and "light emits from the entire surface, not just a point". Lights must be **direct** children of a BasePart or Attachment in Workspace. PointLight in a part emanates from `BasePart.Position`, in an attachment from `WorldPosition`. SpotLight in an Attachment: "Face property determines the axis of the attachment from which light emanates; -Z is front, +X is right, +Y is top". SurfaceLight "parented to an attachment ... is equivalent to a SpotLight".

### 7b. Falloff curve: I don't know (no primary source)

- No Roblox doc, shader or staff post gives the attenuation formula. The voxel path computes light on the CPU and splats it into the 4-stud grid (`LightGridPointSplatFS.frag` just writes the vertex colour); the surface shader then reads `LightMap.rgb * (LightMap.a * 120.0)` (VERIFIED code, section 3d), so the curve is baked before the GPU sees it. The Future per-pixel path is in shaders not present in the GLSL dump.
- Staff, topic 639903 ("Future Is Bright: Phase 3 - Studio Beta", vrtblox, 2020-07-09 update): "we're also looking into changing the falloff of lights and also trying to better match overall shape and brightness of voxel and fib3 lights." Topic 3954367 (2025-09-23): "we are also working to improve light attenuation to give you more realistic and nuanced falloff control. We hope to deliver this in the next couple of months". I found no later announcement that it shipped (searched DevForum Announcements for "attenuation", 2026-10-09).
- Community (UNSURE): falloff reaches exactly zero at Range with a visible edge ("Lights just don't form such a visible circle in real life", topic 2580333 post #2, 2023; feature request "Allow developers to customize light attenuation", topic 2278243, 2023, "the engine has a fixed roll-off distance"). Post #91 of 2580333 (2026-10-04): "with SurfaceLights ... when you make a part wider, the attenuation changes."
- Recommendation for Claude Studio: a windowed curve that hits 0 at Range (e.g. `(1 − (d/Range)²)²`-style smooth window, optionally times inverse-square) is consistent with every statement above, but it is **not** Roblox's verified curve. Calibrate against a Studio capture if exactness matters.

### 7c. Which modes shade and shadow local lights (VERIFIED, staff announcements)

| Mode (old name / Unified) | Local-light shading | Local-light shadows | Local-light specular |
|---|---|---|---|
| Voxel / Soft + not prioritised | 4-stud voxel grid; ignores surface normal ("Future lights account for normal when calculating lighting and Voxel don't", topic 878634, vrtblox, 2020-11-19) | voxel occlusion | no |
| ShadowMap / Soft + prioritised | voxel ("For any other types of light, such as PointLights, it uses voxel grids", old lighting guide) | voxel | no |
| Future / Realistic + prioritised | per-pixel PBR ("We evaluate physically based lighting introduced by Phase 2.5 per-pixel for each local light including shadows if they are active", topic 878634) | shadow maps when `Light.Shadows = true`: "Spot shadows are the cheapest ... then comes surface light shadows ... the most expensive (by a margin) are point shadows" | yes: "Unlike other lighting modes Future does proper specular highlights for local lights" |

Also from 878634: "The number of per-pixel lights as well as number of shadowed lights is limited in each particular frame"; "per-pixel lighting distance depends on the current quality level and on platforms/devices that don't support it would fallback to ShadowMap (or Voxel if ShadowMap is not supported)". Phase 1 plan (topic 182687): "we will still use the voxel engine on low quality, and use the other engine on high quality, with some blend in the middle - on some quality levels we might use voxel engine for more distant parts of the scene."

Sun shadows (for completeness, VERIFIED): ShadowMap introduced "detailed shadows from the sun from every single object in the scene" with "A Shadow Softness property" and `BasePart.CastShadow` (topic 269370, NeoBuilder101, 2019-04-18); "for extremely low-quality levels we will fall back to voxel shadows".

---

## 8. Open questions and cheap Studio tests that would settle them

| Question | Test |
|---|---|
| Sun/moon formula exact? | `print(Lighting:GetSunDirection(), Lighting:GetMoonDirection())` at (14, 41.7333), (9, 0), (21, 70); compare with §1a. |
| Default tonemap constants | White `LightInfluence = 0` SurfaceGui frame, Bloom off, ExposureCompensation −2…+2 in 0.5 steps; read pixels. Hejl–Dawson predicts 215/255 at EC 0. |
| ColorCorrection pivot, weights, order | Grey ramp + saturated swatches under single-property changes; fit the affine matrix. |
| Classic fog curve | Grey part at FogStart, midpoint, FogEnd (no Atmosphere); linear predicts 50% at midpoint, my exp2 hypothesis 58.6% fog. |
| Atmosphere Density/Offset → fog | Panels at 25…800 studs (as roblox-headless-renderer did), but read linear values before the tonemap is applied (e.g. invert the measured tonemap). |
| Local light falloff | Flat floor, PointLight Range 20/60/120, Brightness 1/5, sample along a line, each Technology. |
| Brightness → sun intensity | Lit white plate facing the sun at noon, latitude 23.5, Ambient 0, IBL 0: vary Brightness. |
