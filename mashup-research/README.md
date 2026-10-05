# Mashup research

This folder lists games for Rust game mashups, in the style of
[chasmlol/2010-rust-rewrite-mashup](https://github.com/chasmlol/2010-rust-rewrite-mashup)
(MW2 + Skate 3 + Minecraft). Everything was checked on 2026-10-03: each repo
was cloned or its page fetched, and the top picks were checked a second time.

| File | What's in it |
|---|---|
| [SHORTLIST.md](SHORTLIST.md) | The ranked top picks, 8 mashup pairings, and a cut list. |
| [MOBILE_PICKS.md](MOBILE_PICKS.md) | **Start here for building.** The 2–3 moshes proven to run on a phone. Each piece was built for wasm and they were run together on one page; screenshots and test pages are in `mobile-proto/`. |
| [VERIFIED_ROUND2.md](VERIFIED_ROUND2.md) | **Round 2.**
  - 14 more Rust rewrites (A58–A71), 12 more rebuildable games, and 5 new pairings (P9–P13).
  - A table of engines that ship readable game code (LÖVE, PICO-8, C#, Godot, RPG Maker…). |
| [MERGE_EXAMPLES.md](MERGE_EXAMPLES.md) | **What makes a true merge** (2026-10-05). The RL car + ball in GTA V taken apart from its source, 23 other merges (libsm64, mario64-in-minecraft, Mari0, Cadence of Hyrule…), the 14-question merge test, and recurring techniques. |
| [RECOMBINATION_2026-10-05.md](RECOMBINATION_2026-10-05.md) | The first word-recombination pass (method in RESEARCH.md §5): 30 random seeds from the chat, and the ideas they raised for Pokécraft. |
| [VERIFIED.md](VERIFIED.md) | The full verified list. **Section A:** 57 games already rebuilt in Rust. **Section B:** 80 games that could be rebuilt, split into source releases, decompilations, documented reimplementations, and browser games. |

## Headline findings (round 1)

- **AI-written rewrites are now common.** IW4L (MW2), skate-3-rust-engine, star-andreas (GTA SA), VERA20k (Red Alert 2), SDLPoP-rs (Prince of Persia), pokemon-showdown-rs and others say outright that they were written with Claude, Codex or Cursor. Most of them build on years of earlier human reverse-engineering of the same game.
- **The easiest pieces to combine share an engine.** IW4L, star-andreas and Davenstein (Wolf3D) all run on Bevy 0.19 / wgpu 29, so they can be added to the same app.
- **Already playable in a phone browser:** Iron Wolf (Wolf3D), open-pokered (Pokémon Red, with touch controls), SDLPoP-rs (Prince of Persia), Ruffle (every Flash game), chromatron-oxide and Another World Suite.
- **Flash is the cheapest browser source.** Ruffle already runs any Flash game, so mashing one in means bridging it, not rebuilding it.
- **MinecraftOSS has no public repository.** It only exists as the 5 crates copied into the reference mashup.
- **No Rust port exists yet** for Super Mario 64, Commander Keen, Diablo, StarCraft, Sonic or Club Penguin. Their source code or decompilations are listed in Section B.

## Headline findings (round 2)

- **pico-r** is a complete PICO-8 runtime in one 360 KB wasm file, written with Claude. It plays Celeste Classic and the free cart library in a phone browser, and it's easy to embed in other framebuffer games.
- **vange-rs** (Vangers) is on wgpu 29, the same as the engine cluster, and is already live in the browser.
- **Legend of Legaia** is the largest AI-written rewrite found, at about 775k lines. It plays in the browser from your own disc image.
- **Chip's Challenge DX** has a pure-logic core library and a live web build with touch controls.
- **Readable code can only be run from Rust for PICO-8, LÖVE (desktop only) and Flash.** No Rust runtime exists for Godot, Unity, XNA/FNA, Ren'Py, Scratch or RPG Maker games, so their code is something to port from, not something you can run.
- **vgrichina/re-skill** is a Claude Code skill that turns a ROM into a web port. Agents can use it to create new rebuild candidates instead of only finding them.
- **Static recompilations** (N64Recomp, XenonRecomp) are for running games, not porting them.
