# rehan-remade/universal-modder (read 2026-10-07)

The user asked me to read it. It's a Claude Code plugin (also Codex, Gemini CLI, Cursor, Copilot, OpenCode): 11 skills, a `um` CLI, a fal MCP server for generated art, and a knowledge base of field notes that agents write for other agents (55 game notes, 15 technique notes). MIT. Read at HEAD of `main`, shallow clone.

## What's relevant to us

- **`skills/mashup-mods`** names five patterns. Ours are its pattern 4 ("reimplement, then fuse") and pattern 5 ("reimplement the guest's rules headless, keep the host as the view").
  - Pattern 4 describes the Skate × MW2 × Minecraft build the user cited: IW4L (a Rust MW2 runtime reading MW2's own files), a Skate 3 Rust engine built against a static recomp as its oracle, and a Minecraft Rust rewrite, fused in one process. The skate sim takes over the MW2 soldier; MW2's collision feeds the skate world; grind rails come from walkable collision edges; Skate's bones are retargeted onto MW2's skeleton.
  - Pattern 5's rules match what we do: the guest's sim is the source of truth at its own step rate and units; one frame-mapping function; host features feed the sim, never bypass it; a headless bench first.
- **`knowledge/techniques/oracles-how-agents-know-a-mod-works.md`**: the same idea as our RocketSim and id's-C oracles. Two rules worth keeping: prove the oracle is live before trusting it (we did: friction perturbation), and write down what the oracle doesn't cover.
- **Its trace-replay oracle** (Terraria: real frame-t state + action into the sim, compare t+1 per variable) is a lighter alternative to running the whole original when the original can't be built headless.

## What isn't

Most of it targets modding installed PC games on Windows: Steam scans, loaders (BepInEx, UE4SS, SKSE, Fabric), screen capture and input driving, fal-generated art. We rewrite games for the browser on a phone, with the original's own data, so `um win`, `um fal` and the loader playbooks don't apply. Its "never ship game files" rule matches how we fetch shareware at build time.
