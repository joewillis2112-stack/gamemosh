# Rendering reference

[Studio] Screenshots from games of every tier and style, kept as a reference for Claude Studio's renderer (user, 2026-11-11): the engine should be able to render many qualities and styles, and features from high-end games carry down to simpler ones. Each image is the game's own store media (Steam's store screenshots; Roblox's game thumbnails), resized to 960 px; `manifest.json` records every image's source, and `tools/fetch-render-refs.py` fetches the set again (Roblox's thumbnail links expire after 180 days, so its Roblox images may need picking afresh). Roblox images marked *promo* are promotional renders, not in-game; they show the style the game aims for. Private reference, not for distribution.

Games were picked from published lists (Digital Foundry's, DSOGaming's and GamingBolt's best-looking games of 2025; lists of the best-looking and most realistic Roblox games; lists of cel-shaded and painterly games) plus well-known examples of each tier.

## Features, where they appear, and Claude Studio

Status as of 2026-11-11 (`web/render.js`, `web/runtime/lighting.js`, `posteffects.js`). *Low end* says why the feature matters below AAA.

| Feature | Seen in | Studio | Low end |
|---|---|---|---|
| PBR materials, environment (IBL) lighting | nearly all | **has** | the base everything else sits on |
| Sun shadows (cascaded) | nearly all | **has** | |
| Shadows from lamps, flashlights | DOORS, Lethal Company, R.E.P.O., Cronos, Frontlines | **has** (point, spot) | horror and night scenes are built from these |
| Ambient occlusion | most AAA, Frontlines | **has** (SSAO, Realistic style) | grounds simple geometry |
| Bloom, emissive glow | Deep Rock Galactic, Ori, Cyberpunk, Slime Rancher 2 | **has** | neon and crystals make a cheap scene glow |
| Tone mapping, colour grading | all | **has** | the single biggest lever on mood |
| Distance fog, atmospheric haze | Firewatch, PEAK, Valheim, AC Shadows | **has** (Atmosphere) | Firewatch is mostly fog and gradients |
| Depth of field | It Takes Two, DOOM | **has** | miniature and cinematic shots |
| Volumetric fog, light shafts in 3D | Wukong, RDR2, Forza, Subnautica, Valheim | partial (screen-space sun rays only) | mood at any tier |
| Particles (sparks, smoke, fire, debris, dust) | DOOM, Cyberpunk, Jailbreak, Valheim, Ori | **missing** | every tier uses them |
| Reflections (screen-space, planar), wet surfaces | Cyberpunk, Forza, Driving Empire | missing (environment map only) | cars, floors, water |
| Global illumination (bounced light) | AC Shadows, Wukong | missing | baked or probe GI is affordable |
| Water (waves, foam, underwater fog, caustics) | Raft, Subnautica, RDR2 | **missing** | Raft's whole look is its water |
| Foliage (instanced grass and trees, wind, translucency) | Wukong, AC Shadows, Firewatch, PEAK, Greenville | missing | outdoor scenes at any tier |
| Weather (rain, snow, lightning, wetness) | Forza, RDR2 | missing | |
| Toon / cel shading (stepped light ramp) | Hi-Fi Rush, Guilty Gear Strive | **missing** | cheap, readable, stylish |
| Outlines, ink lines | Hi-Fi Rush, Sable, Borderlands 3, Okami | **missing** | transforms simple geometry |
| Paper, brush or flat-colour treatments | Okami, Sable, Firewatch | missing | |
| Low-resolution render, pixelation, dither | Lethal Company, A Short Hike, Valheim | missing | a style and a performance win |
| Vignette, film grain, chromatic aberration, letterbox | Hellblade II, R.E.P.O. | missing | |
| Motion blur | Forza, Cyberpunk | missing | |
| Subsurface scattering (skin, leaves) | RDR2, Hellblade II, Ori | missing | |
| Sky effects (auroras, stars, clouds) | Valheim, Forza | partial (time-of-day sky) | |
| Stepped (limited) animation | Guilty Gear Strive | missing (an animation option) | anime looks |

**What the set shows:** below AAA, the look comes mostly from lighting, atmosphere and grading, not asset detail. Valheim, Lethal Company, DOORS, Firewatch and PEAK are simple geometry made distinctive by fog, local lights and colour. Stylised games (Sable, Hi-Fi Rush) get their identity from a few cheap techniques (outlines, toon shading, flat colour). So the highest-value additions are the cheap, every-tier ones: particles, outlines and toon shading, volumetric fog, water, and a low-resolution/pixel mode.

## AAA, renowned graphics

### [Cyberpunk 2077](https://store.steampowered.com/app/1091500)

Night city: emissive signs and neon carrying the lighting, wet ground reflecting them (ray-traced reflections), smoke and debris particles, motion blur in the chase, dense detail everywhere.

<img src="aaa/cyberpunk-2077-1.jpg" width="300"> <img src="aaa/cyberpunk-2077-2.jpg" width="300"> <img src="aaa/cyberpunk-2077-3.jpg" width="300">

### [Red Dead Redemption 2](https://store.steampowered.com/app/1174180)

Moonlit fog lying on water with lantern light glowing in it (volumetric fog lit by local lights); muzzle flash and smoke; overcast snow with soft light. Cloth, skin and weather sell it as much as geometry.

<img src="aaa/red-dead-redemption-2-1.jpg" width="300"> <img src="aaa/red-dead-redemption-2-2.jpg" width="300"> <img src="aaa/red-dead-redemption-2-3.jpg" width="300">

### [DOOM: The Dark Ages](https://store.steampowered.com/app/3017860)

Hell-orange key light, heavy spark and ember particles, emissive weapons and demons, strong contrast; shot 2 uses cinematic depth of field.

<img src="aaa/doom-the-dark-ages-1.jpg" width="300"> <img src="aaa/doom-the-dark-ages-2.jpg" width="300"> <img src="aaa/doom-the-dark-ages-3.jpg" width="300">

### [Assassin’s Creed Shadows](https://store.steampowered.com/app/3159330)

Interior lit by sun bouncing through foliage (global illumination, dappled shadows); a sunset castle silhouette in red haze: atmosphere and grading doing the work.

<img src="aaa/assassin-s-creed-shadows-1.jpg" width="300"> <img src="aaa/assassin-s-creed-shadows-3.jpg" width="300">

### [Black Myth: Wukong](https://store.steampowered.com/app/2358720)

God rays through a forest canopy (volumetric light), dense autumn foliage, fog, fire. Photogrammetry-detailed ground.

<img src="aaa/black-myth-wukong-1.jpg" width="300"> <img src="aaa/black-myth-wukong-2.jpg" width="300"> <img src="aaa/black-myth-wukong-3.jpg" width="300">

### [Hellblade II: Senua’s Saga](https://store.steampowered.com/app/2461850)

Letterboxed and graded like film; very dark, fog, firelight, wet stone; a sunset with real sky scattering. Mood from darkness and a few light sources.

<img src="aaa/senua-s-saga-hellblade-ii-1.jpg" width="300"> <img src="aaa/senua-s-saga-hellblade-ii-2.jpg" width="300"> <img src="aaa/senua-s-saga-hellblade-ii-3.jpg" width="300">

### [Forza Horizon 5](https://store.steampowered.com/app/1551360)

Clear-coat car paint; light shafts through a dusty garage; rain, lightning and wet surfaces; motion blur. Weather is a whole system.

<img src="aaa/forza-horizon-5-1.jpg" width="300"> <img src="aaa/forza-horizon-5-2.jpg" width="300"> <img src="aaa/forza-horizon-5-3.jpg" width="300">

### [Cronos: The New Dawn](https://store.steampowered.com/app/2101960)

Sci-fi horror: rim lights, warm local lights in darkness, worn metal, heat glow from fire, filmic grading.

<img src="aaa/cronos-the-new-dawn-1.jpg" width="300"> <img src="aaa/cronos-the-new-dawn-2.jpg" width="300"> <img src="aaa/cronos-the-new-dawn-3.jpg" width="300">

## Stylised (cel-shaded, painterly, ink)

### [Hi-Fi RUSH](https://store.steampowered.com/app/1817230)

Cel shading with ink outlines and flat colour, comic-book VFX and on-screen lettering: proof stylised beats realistic for readability.

<img src="stylized/hi-fi-rush-1.jpg" width="300"> <img src="stylized/hi-fi-rush-2.jpg" width="300">

### [Sable](https://store.steampowered.com/app/757310)

Moebius-style: flat colour, thin outlines on everything, almost no shading, pastel palette. Very cheap to render, very distinctive.

<img src="stylized/sable-1.jpg" width="300"> <img src="stylized/sable-2.jpg" width="300"> <img src="stylized/sable-3.jpg" width="300">

### [Okami HD](https://store.steampowered.com/app/587620)

Sumi-e ink: brush-stroke outlines, a paper texture over the whole frame, painted colour.

<img src="stylized/okami-hd-1.jpg" width="300"> <img src="stylized/okami-hd-2.jpg" width="300"> <img src="stylized/okami-hd-3.jpg" width="300">

### [GUILTY GEAR -STRIVE-](https://store.steampowered.com/app/1384160)

3D made to look hand-drawn anime: cel shading with hand-authored normals, stepped (limited) animation, huge hit effects.

<img src="stylized/guilty-gear-strive-1.jpg" width="300"> <img src="stylized/guilty-gear-strive-2.jpg" width="300"> <img src="stylized/guilty-gear-strive-3.jpg" width="300">

### [Borderlands 3](https://store.steampowered.com/app/397540)

Thick black outlines and hand-painted, hatched textures on top of otherwise normal lighting.

<img src="stylized/borderlands-3-1.jpg" width="300"> <img src="stylized/borderlands-3-3.jpg" width="300">

### [It Takes Two](https://store.steampowered.com/app/1426210)

Pixar-like stylised PBR: saturated warm grading, strong depth of field for a miniature feel, bloom.

<img src="stylized/it-takes-two-1.jpg" width="300"> <img src="stylized/it-takes-two-2.jpg" width="300"> <img src="stylized/it-takes-two-3.jpg" width="300">

### [Ori and the Will of the Wisps](https://store.steampowered.com/app/1057090)

Painterly 2.5D: backlit foliage, layered depth fog, glow everywhere, drifting particles.

<img src="stylized/ori-and-the-will-of-the-wisps-1.jpg" width="300"> <img src="stylized/ori-and-the-will-of-the-wisps-2.jpg" width="300">

## Medium-quality Steam games

### [Valheim](https://store.steampowered.com/app/892970)

Low-poly, low-resolution textures under modern lighting: auroras, fog, firelight, strong grading. Atmosphere over asset fidelity.

<img src="steam-mid/valheim-1.jpg" width="300"> <img src="steam-mid/valheim-2.jpg" width="300"> <img src="steam-mid/valheim-3.jpg" width="300">

### [Lethal Company](https://store.steampowered.com/app/1966720)

Deliberately low resolution and dark: a flashlight-only world, fog, a helmet HUD. Cheap, and scarier for it.

<img src="steam-mid/lethal-company-1.jpg" width="300"> <img src="steam-mid/lethal-company-2.jpg" width="300"> <img src="steam-mid/lethal-company-3.jpg" width="300">

### [Deep Rock Galactic](https://store.steampowered.com/app/548430)

Faceted low-poly rock lit by emissive crystals and lava and coloured local lights in darkness, with glow.

<img src="steam-mid/deep-rock-galactic-1.jpg" width="300"> <img src="steam-mid/deep-rock-galactic-2.jpg" width="300"> <img src="steam-mid/deep-rock-galactic-3.jpg" width="300">

### [Subnautica](https://store.steampowered.com/app/264710)

Underwater: distance fog that absorbs colour, bioluminescent emissives, light shafts, a mask overlay.

<img src="steam-mid/subnautica-1.jpg" width="300"> <img src="steam-mid/subnautica-2.jpg" width="300"> <img src="steam-mid/subnautica-3.jpg" width="300">

### [A Short Hike](https://store.steampowered.com/app/1055540)

Rendered at low resolution and scaled up (pixelated), simple lighting, warm palette, tilted overhead camera.

<img src="steam-mid/a-short-hike-1.jpg" width="300"> <img src="steam-mid/a-short-hike-2.jpg" width="300"> <img src="steam-mid/a-short-hike-3.jpg" width="300">

### [Firewatch](https://store.steampowered.com/app/383870)

Flat-colour stylisation: colour-banded atmospheric fog, minimal texture, painted skies. Mostly fog and gradients.

<img src="steam-mid/firewatch-1.jpg" width="300"> <img src="steam-mid/firewatch-2.jpg" width="300"> <img src="steam-mid/firewatch-3.jpg" width="300">

### [Slime Rancher 2](https://store.steampowered.com/app/1657630)

Bright, soft, saturated toon-ish PBR with big bloom: friendly and readable.

<img src="steam-mid/slime-rancher-2-1.jpg" width="300"> <img src="steam-mid/slime-rancher-2-2.jpg" width="300"> <img src="steam-mid/slime-rancher-2-3.jpg" width="300">

### [R.E.P.O.](https://store.steampowered.com/app/3241660)

Dark interiors, flashlight, emissive eyes, bloom, red/orange grading on simple physics props.

<img src="steam-mid/r-e-p-o-1.jpg" width="300"> <img src="steam-mid/r-e-p-o-2.jpg" width="300"> <img src="steam-mid/r-e-p-o-3.jpg" width="300">

### [PEAK](https://store.steampowered.com/app/3527290)

Stylised low poly with heavy fog and aerial perspective, purple grading, lush jungle.

<img src="steam-mid/peak-1.jpg" width="300"> <img src="steam-mid/peak-2.jpg" width="300"> <img src="steam-mid/peak-3.jpg" width="300">

### [Raft](https://store.steampowered.com/app/648800)

Bright stylised ocean (waves, foam), clear sky, simple shading. Water carries the game's look.

<img src="steam-mid/raft-1.jpg" width="300"> <img src="steam-mid/raft-2.jpg" width="300"> <img src="steam-mid/raft-3.jpg" width="300">

## Roblox, across styles

### [FRONTLINES](https://www.roblox.com/games/5938036553)

Near-AAA on Roblox: PBR, dark interiors cut by spot lights, dust in the air, detailed weapon models.

<img src="roblox/frontlines-1.jpg" width="300"> <img src="roblox/frontlines-3.jpg" width="300"> <img src="roblox/frontlines-5.jpg" width="300">

### [Phantom Forces](https://www.roblox.com/games/292439477) *(promo)*

Promo render (not in-game): blocky avatars with realistic weapons, a common Roblox mix of styles.

<img src="roblox/phantom-forces-3.jpg" width="300">

### [Driving Empire [🏁NASCAR Championship Weekend🏁]](https://www.roblox.com/games/3351674303)

Bright realistic cars with glossy paint reflecting the sky, Roblox's Future lighting.

<img src="roblox/driving-empire-5.jpg" width="300"> <img src="roblox/driving-empire-6.jpg" width="300"> <img src="roblox/driving-empire-8.jpg" width="300">

### [The Wild West 🎃](https://www.roblox.com/games/2317712696) *(promo)*

Promo art (not in-game): stylised western; the game itself is a mid-detail open world.

<img src="roblox/the-wild-west-5.jpg" width="300">

### [Livetopia 🏡 RP](https://www.roblox.com/games/6737970321)

Clean, bright, stylised city: soft shadows, simple materials, lots of colour. Typical modern Roblox roleplay.

<img src="roblox/livetopia-5.jpg" width="300"> <img src="roblox/livetopia-6.jpg" width="300"> <img src="roblox/livetopia-7.jpg" width="300">

### [World // Zero ⚔️ Anime RPG](https://www.roblox.com/games/2727067538) *(promo)*

Promo art (not in-game): stylised anime RPG.

<img src="roblox/world-zero-2.jpg" width="300">

### [[⚡] Adopt Me!](https://www.roblox.com/games/920587237) *(promo)*

Promo art (not in-game): illustrated; the game is soft, bright and cute.

<img src="roblox/adopt-me-2.jpg" width="300">

### [Natural Disaster Survival](https://www.roblox.com/games/189707)

Classic Roblox: plastic parts, flat lighting, low detail. The baseline every Roblox player knows.

<img src="roblox/natural-disaster-survival-5.jpg" width="300"> <img src="roblox/natural-disaster-survival-8.jpg" width="300"> <img src="roblox/natural-disaster-survival-10.jpg" width="300">

### [Tower of Hell](https://www.roblox.com/games/1962086868)

Flat colours, simple geometry, plain lighting: gameplay first.

<img src="roblox/tower-of-hell-3.jpg" width="300">

### [Brookhaven 🏡RP](https://www.roblox.com/games/4924922222)

Simple bright city, classic avatars, smooth plastic (store shots are framed).

<img src="roblox/brookhaven-rp-3.jpg" width="300"> <img src="roblox/brookhaven-rp-6.jpg" width="300">

### [DOORS 👁️](https://www.roblox.com/games/6516141723)

Horror on Roblox from lighting alone: dark rooms, warm lamps, shadows, fog, red flashes on simple geometry.

<img src="roblox/doors-1.jpg" width="300"> <img src="roblox/doors-4.jpg" width="300"> <img src="roblox/doors-7.jpg" width="300"> <img src="roblox/doors-8.jpg" width="300">

### [[🎃] Blox Fruits](https://www.roblox.com/games/2753915549) *(promo)*

Promo art (not in-game): anime illustration; in-game it is a bright, low-detail anime world with big effects.

<img src="roblox/blox-fruits-4.jpg" width="300">

### [Jailbreak 🍁🍁](https://www.roblox.com/games/606849621)

Mid-tier Roblox city: explosions and particles, neon, night lighting, vehicles.

<img src="roblox/jailbreak-3.jpg" width="300"> <img src="roblox/jailbreak-4.jpg" width="300"> <img src="roblox/jailbreak-5.jpg" width="300"> <img src="roblox/jailbreak-6.jpg" width="300">

### [[🐪] Grow a Garden 🌶️](https://www.roblox.com/games/126884695634066)

Very simple, flat, bright and blocky: the lowest-detail style that still reads well.

<img src="roblox/grow-a-garden-5.jpg" width="300">

### [[🎃] Dress To Impress](https://www.roblox.com/games/15101393044) *(promo)*

Promo render (not in-game): stylised avatar beauty shots; the game is about avatars and outfits.

<img src="roblox/dress-to-impress-4.jpg" width="300">

### [Greenville RP](https://www.roblox.com/games/891852901)

Realistic driving on Roblox: car paint, realistic trees and terrain, haze, sunrise bloom.

<img src="roblox/greenville-rp-4.jpg" width="300"> <img src="roblox/greenville-rp-5.jpg" width="300"> <img src="roblox/greenville-rp-7.jpg" width="300"> <img src="roblox/greenville-rp-10.jpg" width="300">

