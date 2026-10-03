# CLAUDE.md

**Before starting any task in this repo, read [RESEARCH.md](RESEARCH.md).** It's the working log, covering:
- the working agreement with the user
- past mistakes and how to avoid them
- what has been learned about game mashups
- technical lessons from building Gloamreach
- ways of working that held up
- open questions and a session log

When a task goes sideways, check RESEARCH.md for a lesson that already covers it. At the end of a task, add what you learned there, plus a line to the session log.

The rules that matter most (details in RESEARCH.md §1):
- Put deliverables on `main`. If you're unsure whether to commit to `main` or to a branch, ask once at the start. When the user says "merge", merge.
- Don't watch PRs or schedule check-ins unless asked. If an auto-subscription appears, unsubscribe.
- Write notes, findings and long summaries to files. Keep chat replies short.
- No legal caveats. These are personal, never-distributed projects.
- Be terse, say "I don't know" rather than guess, and verify agent claims before reporting them.

Layout:
- `src/`: the Gloamreach game
- `tests/`: Playwright suites
- `tools/build.mjs`: single-file HTML build
- `mashup-research/`: verified game and rewrite research, in rounds
- `GAMEMOSH_BRIEF.md`: early research
