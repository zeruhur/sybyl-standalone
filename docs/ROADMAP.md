# Roadmap

Planned changes for the standalone app, as of 2026-09-27. Items 1-7 were done on 2026-10-05/06. Pick up the rest as needed.

## Engineering health

1. ~~**Test suite (Vitest).**~~ Done 2026-10-05: `npm test` (Vitest) runs `src/**/*.test.ts`, covering the parser, dashboard, dice/card notation, dice/oracle/card engines, cut-up, `compileFrontmatter()` (moved to `lib/frontmatter.ts`), the composer parser, `insertFootnote`/`setHeadingLevel` (jsdom), and the `history.ts` timestamp codec. Still untested: providers, `promptBuilder.ts`, `vault.ts`, and all React components.
2. ~~**CI gate.**~~ Done 2026-10-05: `ci.yml` runs the tests after `tsc`, and `release.yml` has a `verify` job (tsc + tests) that `create-release` depends on. Node bumped 20 → 22 in both, since Vitest 5 requires it.
3. ~~**External-change detection.**~~ Done 2026-10-05, by comparing content rather than modified time. `vault.ts` keeps each note's raw text as of Sybyl's last open or write. `writeVaultFile` re-reads the file first and throws `ExternalChangeError` on a mismatch. `App.tsx` shows `ConflictModal` (keep mine / load the outside version, with the losing side snapshotted first). Opening a note now reads it fresh from disk, where it used to use the copy cached in the sidebar list. Window focus reloads the open note silently when there are no unsaved edits. No live file watcher: an outside edit is noticed on focus or on the next save.

## LLM layer

4. ~~**Streaming responses.**~~ Done 2026-10-06. `generate(request, signal, onText)` streams on all four providers through `providers/stream.ts`: SSE for Anthropic/OpenAI/Gemini, NDJSON for Ollama, plus a JSON fallback for OpenAI-compatible servers that ignore `stream`. `lib/liveOutput.ts` writes the output into the editor as it arrives. Each update re-formats the whole text so far and replaces its own span. A CM6 state field maps the span through the user's edits. Updates stay out of undo history and out of autosave (`docWithoutLiveOutput`). The final text is committed as one undoable insert, and Regenerate streams over the old output. Raw commands (Digest Source etc.) show a character count in the status line.
5. ~~**Anthropic prompt caching.**~~ Done 2026-10-05. There are two `cache_control` breakpoints (5-minute TTL) in `providers/anthropic.ts`: one on the system prompt (rules, Lonelog addendum, `game_context`), one on the last attached source. The varying question comes after both. Also fixed an invalidator: the system prompt used `pcs`, which `compileFrontmatter` rewrites with each PC's current state on every save, so any HP/stress change broke the cache. It now carries PC names only, and the state still goes in the per-request Lonelog context. Cache reads show in the completion status ("N prompt tokens from cache"). Prefixes below the model's minimum (1024 tokens for the default Sonnet 4.5) don't cache, so this pays off once a note has a digested `game_context` or sources.
6. ~~**Token and cost visibility.**~~ Done 2026-10-06, tokens only. The done status reads `Tokens: N in (M cached) · K out` (`lib/usage.ts`). Providers now normalize usage to one meaning: `inputTokens` excludes cached tokens, which OpenAI and Gemini count inside their prompt totals, and `outputTokens` includes thinking, which Gemini reports separately. No prices: per-model price tables go stale, and a wrong cost figure is worse than none. If wanted later, a user-entered price per model in Settings would avoid the staleness problem.

## Play features

7. ~~**Persist the Chaos Factor per note.**~~ Done 2026-10-06 as the `chaos_factor` frontmatter field. It's read through `normalizeChaosFactor()` (oracleEngine.ts: rounds and clamps to 1-9, defaults to 5) and written by the Toolkit's CF input via `updateActiveFrontmatter`. Campaign Info shows it. With no note open, the value is session-only as before. It still changes only when the user changes it. This also fixed a race that came before this item: overlapping writes to one note could report Sybyl's own write as an outside change. `writeVaultFile` now queues writes per path.
8. **Toolkit roll/draw log.** Keep a scrollable history for the session. Today a result is lost unless it's inserted into a note.
9. **Persist card deck state per note**, so a campaign's shuffled deck survives a restart.
10. **Dice grammar Part II.** Start with reroll, compounding, and min/max.

## Platform

11. **Android folder access (SAF).** Add a custom Kotlin plugin command using `ACTION_OPEN_DOCUMENT_TREE` with a persisted URI permission, and adapt `vault.ts` to work with `content://` URIs. This is a multi-day native job, so do it only if the app sees real Android use.
12. **Confirm the Android API-key persistence fix** (v0.14.1) on a real device.
