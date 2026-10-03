# Mashup research

This folder lists games for Rust game mashups, in the style of
[chasmlol/2010-rust-rewrite-mashup](https://github.com/chasmlol/2010-rust-rewrite-mashup)
(MW2 + Skate 3 + Minecraft). Everything was checked on 2026-10-03: each repo
was cloned or its page fetched, and the top picks were checked a second time.

| File | What's in it |
|---|---|
| [SHORTLIST.md](SHORTLIST.md) | **Start here.** The ranked top picks, 8 mashup pairings, and a cut list. |
| [VERIFIED.md](VERIFIED.md) | The full verified list. **Section A:** 57 games already rebuilt in Rust. **Section B:** 80 games that could be rebuilt, split into source releases, decompilations, documented reimplementations, and browser games. |

## Headline findings

- **AI-written rewrites are now common.** IW4L (MW2), skate-3-rust-engine, star-andreas (GTA SA), VERA20k (Red Alert 2), SDLPoP-rs (Prince of Persia), pokemon-showdown-rs and others say outright that they were written with Claude, Codex or Cursor. Most of them build on years of earlier human reverse-engineering of the same game.
- **The easiest pieces to combine share an engine.** IW4L, star-andreas and Davenstein (Wolf3D) all run on Bevy 0.19 / wgpu 29, so they can be added to the same app.
- **Already playable in a phone browser:** Iron Wolf (Wolf3D), open-pokered (Pokémon Red, with touch controls), SDLPoP-rs (Prince of Persia), Ruffle (every Flash game), chromatron-oxide and Another World Suite.
- **Flash is the cheapest browser source.** Ruffle already runs any Flash game, so mashing one in means bridging it, not rebuilding it.
- **MinecraftOSS has no public repository.** It only exists as the 5 crates copied into the reference mashup.
- **No Rust port exists yet** for Super Mario 64, Commander Keen, Diablo, StarCraft, Sonic or Club Penguin. Their source code or decompilations are listed in Section B.
