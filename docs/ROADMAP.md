# Roadmap

Planned changes for the standalone app, as of 2026-09-27. Items 1-3 and 5 were done on 2026-10-05. Recommended next: 4. Pick up the others as needed.

## Engineering health

1. ~~**Test suite (Vitest).**~~ Done 2026-10-05: `npm test` (Vitest) runs `src/**/*.test.ts`, covering the parser, dashboard, dice/card notation, dice/oracle/card engines, cut-up, `compileFrontmatter()` (moved to `lib/frontmatter.ts`), the composer parser, `insertFootnote`/`setHeadingLevel` (jsdom), and the `history.ts` timestamp codec. Still untested: providers, `promptBuilder.ts`, `vault.ts`, and all React components.
2. ~~**CI gate.**~~ Done 2026-10-05: `ci.yml` runs the tests after `tsc`, and `release.yml` has a `verify` job (tsc + tests) that `create-release` depends on. Node bumped 20 → 22 in both, since Vitest 5 requires it.
3. ~~**External-change detection.**~~ Done 2026-10-05, by comparing content rather than modified time. `vault.ts` keeps each note's raw text as of Sybyl's last open or write. `writeVaultFile` re-reads the file first and throws `ExternalChangeError` on a mismatch. `App.tsx` shows `ConflictModal` (keep mine / load the outside version, with the losing side snapshotted first). Opening a note now reads it fresh from disk, where it used to use the copy cached in the sidebar list. Window focus reloads the open note silently when there are no unsaved edits. No live file watcher: an outside edit is noticed on focus or on the next save.

## LLM layer

4. **Streaming responses.** Every provider's `generate()` waits for the full response. Streaming touches all four providers, `GenerationResponse`, `runGeneration`/`runRawGeneration`/`executeGeneration` in `App.tsx`, and the insert helpers, which need incremental insertion. The range tracking used by Regenerate must also update as text streams in.
5. ~~**Anthropic prompt caching.**~~ Done 2026-10-05. There are two `cache_control` breakpoints (5-minute TTL) in `providers/anthropic.ts`: one on the system prompt (rules, Lonelog addendum, `game_context`), one on the last attached source. The varying question comes after both. Also fixed an invalidator: the system prompt used `pcs`, which `compileFrontmatter` rewrites with each PC's current state on every save, so any HP/stress change broke the cache. It now carries PC names only, and the state still goes in the per-request Lonelog context. Cache reads show in the completion status ("N prompt tokens from cache"). Prefixes below the model's minimum (1024 tokens for the default Sonnet 4.5) don't cache, so this pays off once a note has a digested `game_context` or sources.
6. **Token and cost visibility.** Show token usage for each generation in the status bar.

## Play features

7. **Persist the Chaos Factor per note**, for example as a `chaos_factor` frontmatter field. The user sets it manually, as now, but it no longer resets on every launch.
8. **Toolkit roll/draw log.** Keep a scrollable history for the session. Today a result is lost unless it's inserted into a note.
9. **Persist card deck state per note**, so a campaign's shuffled deck survives a restart.
10. **Dice grammar Part II.** Start with reroll, compounding, and min/max.

## Platform

11. **Android folder access (SAF).** Add a custom Kotlin plugin command using `ACTION_OPEN_DOCUMENT_TREE` with a persisted URI permission, and adapt `vault.ts` to work with `content://` URIs. This is a multi-day native job, so do it only if the app sees real Android use.
12. **Confirm the Android API-key persistence fix** (v0.14.1) on a real device.
