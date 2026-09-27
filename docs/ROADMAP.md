# Roadmap

Planned changes for the standalone app, as of 2026-09-27. Nothing here has been started yet. Recommended order: 1 and 2, then 3, then 5, then 4. Pick up the rest as needed.

## Engineering health

1. **Test suite (Vitest).** The repo has no tests or lint script. Start with the pure-logic modules: `lonelog/parser.ts`, `toolkit/diceEngine.ts`, `toolkit/oracleEngine.ts`, `lonelog/dashboard.ts`, `compileFrontmatter()`, `insertFootnote`, and the snapshot timestamp encoding in `history.ts`. A single parser test would have caught the `*...*` scene-header regression.
2. **CI gate.** Run the tests and `tsc --noEmit` in the workflow. Release builds currently don't check correctness first.
3. **External-change detection.** Notes are plain `.md` files that users may also edit in Obsidian, VS Code, or through a sync tool. Autosave currently overwrites those edits without warning. At minimum, compare the file's modified time before writing and warn on a conflict.

## LLM layer

4. **Streaming responses.** Every provider's `generate()` waits for the full response. Streaming touches all four providers, `GenerationResponse`, `runGeneration`/`runRawGeneration`/`executeGeneration` in `App.tsx`, and the insert helpers, which need incremental insertion. The range tracking used by Regenerate must also update as text streams in.
5. **Anthropic prompt caching.** `game_context` and digested sources are resent unchanged on every request. Adding `cache_control` to the system prompt in `providers/anthropic.ts` would cut cost and latency.
6. **Token and cost visibility.** Show token usage for each generation in the status bar.

## Play features

7. **Persist the Chaos Factor per note**, for example as a `chaos_factor` frontmatter field. The user sets it manually, as now, but it no longer resets on every launch.
8. **Toolkit roll/draw log.** Keep a scrollable history for the session. Today a result is lost unless it's inserted into a note.
9. **Persist card deck state per note**, so a campaign's shuffled deck survives a restart.
10. **Dice grammar Part II.** Start with reroll, compounding, and min/max.

## Platform

11. **Android folder access (SAF).** Add a custom Kotlin plugin command using `ACTION_OPEN_DOCUMENT_TREE` with a persisted URI permission, and adapt `vault.ts` to work with `content://` URIs. This is a multi-day native job, so do it only if the app sees real Android use.
12. **Confirm the Android API-key persistence fix** (v0.14.1) on a real device.
