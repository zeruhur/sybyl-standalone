# Changelog

All notable changes to Sybyl, newest first. Each released version's section becomes the description
of its GitHub release (see "Releasing" in `docs/BUILDING.md`). Changes not yet released go under
**Unreleased**.

## Unreleased

### Added
- The Toolkit oracle's Chaos Factor is saved with each note (as `chaos_factor` in its frontmatter),
  so every campaign keeps its own across restarts. Change it from the Toolkit's Oracle tab or in
  Edit Campaign Info. Campaign Info shows it. With no note open, it applies to the current session
  only, as before.
- A **History** tab in the Toolkit lists every roll, draw and result from the session, newest
  first, each with an Insert button, so a result isn't lost just because you didn't insert it
  right away. It keeps the last 200 and is cleared when you close the app (or with Clear).

### Changed
- The side panel no longer shows horizontal scrollbars. The Toolkit's tools wrap onto a second row
  as chips, so every tool stays visible, on a phone too. The panel's Campaign Info tab is now
  called **Info**, matching its header button.
- Scrollbars and drop-down menus follow the light/dark theme, and scrollbars are thinner.

### Fixed
- Two saves to the same note in quick succession (for example, clicking the Chaos Factor arrows
  quickly) could wrongly report the note as "changed outside Sybyl". Saves to a note now run one
  after another.

## v0.16.0 - 2026-10-06

### Added
- **Responses stream in.** Generated text appears in the note while it's being written, and you can
  keep typing elsewhere meanwhile. The text is provisional until it finishes: it isn't saved, and
  cancelling removes it. The finished result is one change that a single Ctrl+Z undoes. Works with
  Anthropic, OpenAI, Gemini and Ollama.
- **Token usage** for each generation in the status message, e.g. `Tokens: 5,212 in (5,000 cached)
  · 180 out`.
- **Notes edited outside Sybyl** (in Obsidian, another editor, or by a sync tool) are no longer
  silently overwritten. Opening a note reads it fresh from disk. Switching back to Sybyl reloads a
  changed note, and if you had unsaved edits, Sybyl asks which version to keep. The other version
  is saved to Version history either way.
- **Anthropic prompt caching**: the rules, game context and attached sources are cached between
  requests, which cuts cost and latency once a note has a digested game context or sources.

### Fixed
- Newer Claude models (Opus 4.7 and later, Sonnet 5 and later, Fable) failed on every request
  because Sybyl sent a temperature, which they don't accept. It's now left out for those models.
- When a model runs out of output tokens while thinking, or declines a request, the error now says
  so instead of "Provider returned an empty response".

### Internal
- An automated test suite, run in CI and before every release build.

## v0.15.0 - 2026-09-29

### Added
- **Play composer** under the editor: type `? question`, `@ action` or `-> result` (or pick a mode
  chip) to ask the oracle, declare an action or interpret a result without opening a dialog.
  One-click Expand / What now? / What can I do?. Ctrl+J focuses it.
- **Side drawer** with the Toolkit, Dashboard and Campaign Info as tabs beside the editor (a bottom
  sheet on narrow screens).
- **Note menu** in the header (Edit info, Snapshot, History, Export, Delete).
- **Selection bubble** for inline formatting. The full formatting toolbar is now optional (the Aa
  button). Heading picker, plus Ctrl+1-6 / Ctrl+0 for headings.

### Changed
- Status messages appear as a floating toast instead of a strip that shifted the layout.
- New icons throughout. Scene headers and beat lines get whole-line styling in the log.

## v0.14.1 - 2026-09-27

### Fixed
- Undo could carry text from a previously open note into the current one.
- Ctrl+I didn't italicize.
- Edits made just before switching notes could be lost.
- A generation could land in the wrong note if you switched notes while it ran. It's now discarded.
- A failed or cancelled Start Scene no longer uses up a scene number.
- API keys weren't saved on Android.
- OpenAI reasoning models (gpt-5, o-series) and Gemini 2.5 Pro requests failed. Digest Source with
  OpenAI only saw the first page or two of a source.
- Per-note `provider:` and `model:` overrides in the frontmatter now take effect.

## Earlier versions

See the [GitHub releases](https://github.com/zeruhur/sybyl-standalone/releases) for v0.14.0 and earlier.
