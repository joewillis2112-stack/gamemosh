# Reverse-engineering tools

For 1:1 ports of content from games with no source: decompile the game's own code to get its exact behaviour (speeds, timers, damage, physics), then port that and check it against the original, as `dukequake/oracle` does for Quake.

| Tool | For | Here |
|---|---|---|
| [bethington/ghidra-mcp](https://github.com/bethington/ghidra-mcp) | Ghidra decompiler as a REST/MCP server: import a binary, list and decompile functions, rename and type things, P-code emulation | `tools/re/ghidra.sh` installs Ghidra 12.1.3 and builds the headless server into `~/.cache/re`, then starts it on `127.0.0.1:8089`. First run downloads ~500 MB and builds with Maven. The container is rebuilt between sessions, so run it again in a new session |
| [morluto/rea](https://github.com/morluto/rea) | "Reverse engineer anything": one CLI/MCP over Ghidra/Hopper/IDA for native code, plus JavaScript/Electron, .NET, APK, firmware, websites; answers come with evidence | `npx -y rea-agents@latest <command>` (Node 22 is in the image). Skill: `.claude/skills/reverse-engineer-anything` |
| [rehan-remade/universal-modder](https://github.com/rehan-remade/universal-modder) | Modding installed PC games: recon, loaders, mashup patterns, asset pipelines, a knowledge base of field notes | Skills in `.claude/skills/` (`mod-any-game`, `mashup-mods`, `reverse-engineering`, ...). Its `um` CLI and Windows game-driving parts need a PC with the game installed |

Skills are copies, taken 2026-10-07: universal-modder @ 6c02e77, rea @ bc2cd8b. Update by copying `skills/*` from the repos again.

## Ghidra server, by hand

```sh
tools/re/ghidra.sh                                   # install (first time) and start
curl -X POST -H 'Content-Type: application/json' -d '{"file_path": "/abs/path/game.exe"}' http://127.0.0.1:8089/import_file
curl "http://127.0.0.1:8089/get_function_count"
curl "http://127.0.0.1:8089/force_decompile?name=SV_FlyMove"     # JSON; the C is in .decompiled
tools/re/ghidra.sh stop
```

For it to show up as MCP tools instead of curl, the bridge (`uv run bridge-mcp-ghidra` in the ghidra-mcp checkout) has to be registered before the session starts, which needs Ghidra installed by the environment's setup script. Curl works without that.

## Verified here (2026-10-07)

- `tools/re/ghidra.sh` from scratch: download, Maven build, server up in about 5 minutes. It imported the oracle's 32-bit Quake server ELF (574 functions, auto-analysed) and decompiled `SV_FlyMove`; id's 0.7 floor-slope constant is visible in the output. Endpoint names differ from older docs: use `force_decompile`, not `decompile_function`.
- REA's CLI runs (`npx rea-agents`), but its native analysis refuses Ghidra 12.1.3: it requires exactly 12.1.4. I couldn't find the 12.1.4 download name from here (GitHub's release pages return 403 through this proxy), so native REA is not set up. Its JavaScript, web, .NET and APK analysis don't need Ghidra.
