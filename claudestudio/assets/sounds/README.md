# Character sounds

Our own CC0 stand-ins for the slots in Roblox's default `RbxCharacterSounds`. None of these are Roblox files. Every licence below was checked on its source page on 2026-10-08.

| File | Slot | Duration | Format | Source | License | Original filename |
|---|---|---|---|---|---|---|
| footstep_1.mp3 | Running footstep (variant 1) | 0.10 s | Vorbis 44.1 kHz stereo | Kenney, Impact Sounds: https://kenney.nl/assets/impact-sounds | CC0 1.0 | `Audio/footstep_concrete_000.mp3` |
| footstep_2.mp3 | Running footstep (variant 2) | 0.11 s | Vorbis 44.1 kHz stereo | same | CC0 1.0 | `Audio/footstep_concrete_003.mp3` |
| footstep_3.mp3 | Running footstep (variant 3) | 0.11 s | Vorbis 44.1 kHz stereo | same | CC0 1.0 | `Audio/footstep_concrete_004.mp3` |
| footstep_4.mp3 | Running footstep (variant 4, brighter) | 0.10 s | Vorbis 44.1 kHz stereo | same | CC0 1.0 | `Audio/footstep_concrete_001.mp3` |
| land.mp3 | Hard landing thud | 0.53 s (audible ~0.28 s) | Vorbis 44.1 kHz stereo | same | CC0 1.0 | `Audio/impactSoft_heavy_000.mp3` |
| jump.mp3 | Jump | 0.37 s | Vorbis 44.1 kHz stereo | Kenney, Digital Audio: https://kenney.nl/assets/digital-audio | CC0 1.0 | `Audio/phaseJump1.mp3` (first 0.095 s of silence trimmed, re-encoded with libvorbis q5) |
| spawn.mp3 | Respawn shimmer | 0.42 s | Vorbis 44.1 kHz mono | Kenney, Interface Sounds: https://kenney.nl/assets/interface-sounds | CC0 1.0 | `Audio/maximize_004.mp3` |
| checkpoint.mp3 | Checkpoint chime | 0.29 s | Vorbis 44.1 kHz mono | same | CC0 1.0 | `Audio/confirmation_001.mp3` |
| fall_wind.mp3 | Falling wind loop | 5.96 s | Vorbis 48 kHz stereo | SketchMan3, "Wind Whoosh Loop": https://opengameart.org/content/wind-whoosh-loop | CC0 | `wind woosh loop.mp3` |
| death.mp3 | Death grunt | 0.26 s (container says 0.31) | MP3 44.1 kHz stereo | EZduzziteh, "Hurt Sound Effects": https://opengameart.org/content/hurt-sound-effects | CC0 | `hurt_01_0.mp3` |

Total: about 330 KB. `fall_wind.mp3` is 250 KB of that.

Licence texts: `LICENSE-kenney-impact-sounds.txt`, `LICENSE-kenney-digital-audio.txt` and `LICENSE-kenney-interface-sounds.txt` are copied from the pack zips. The OpenGameArt items have no licence file; the CC0 tag is on each item's page (linked above). The wind loop is SketchMan3's edit of JaggedStone's "Loopable Dungeon Ambience" (https://opengameart.org/content/loopable-dungeon-ambience), which is also CC0.

## How they were checked

There is no ffprobe here. Format and duration come from ffmpeg (the imageio-ffmpeg build) plus a numpy pass over the decoded audio, which gave peak, RMS, audible span, spectral centroid and a pitch track. **Nobody has listened to these yet.** Each choice was made from its filename, its source description and the numbers.

- **Footsteps:** dry single steps, with the hit in the first 10 ms. Roblox plays one loop at pitch 1.85. Here, play a random variant per stride instead, timed to the walk cycle.
- **jump.mp3:** a synth hop that wobbles around 345–410 Hz. It may sound more "retro game" than Roblox's soft hop.
- **land.mp3:** low and dull (centroid about 90 Hz). Kenney's `impactSoft_medium_00x` is a shorter, lighter alternative if this one is too heavy.
- **spawn.mp3:** a rising high sparkle that swells to its peak at 0.37 s.
- **checkpoint.mp3:** a rising four-note arpeggio, about G4 → D5 → G5 → D6.
- **fall_wind.mp3:** it is seamless. Both ends sit at the same level (about −32 dBFS RMS over the first and last 100 ms), and the jump from the last sample to the first is about 4e-5, with no click energy at the seam. It is **quiet**: peak about −15 dBFS and RMS about −28 to −31 dBFS (depending on the downmix), against roughly −12 to −18 dBFS RMS for the one-shots. Give it a higher Volume, about +10 to 12 dB. To loop it without a gap, use Web Audio `AudioBufferSourceNode.loop`. An `<audio loop>` element can leave a gap.
- **death.mp3:** a short, punchy male hurt vocal from a game-jam set. The original MP3 is kept rather than transcoded, and it carries the usual ~25 ms encoder delay. Whether it reads as "comedic" is unverified. The same page has five alternatives (`hurt_02`–`hurt_06`, 0.2–0.4 s; `hurt_05` is the longest).
- Kenney's Vorbis files decode with peaks slightly over 0 dBFS (+2 dB), probably decoder overshoot. Keep master gain below 1 or add a limiter.

## Caveats

- **Safari/iOS and Ogg Vorbis:** I don't know whether the user's iOS version decodes `.mp3` through `decodeAudioData`. If it doesn't, transcode to `.m4a` or `.mp3` at build time.
- No CC0 "oof"-style cartoon death grunt turned up in the Kenney packs (the voiceover packs are announcer lines only), so the death sound comes from OpenGameArt.
