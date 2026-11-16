# Changelog

All notable changes to Sybyl, newest first. Each released version's section becomes the description
of its GitHub release (see "Releasing" in `docs/BUILDING.md`). Changes not yet released go under
**Unreleased**.

## Unreleased

### Added
- The dice roller covers the whole Dice Notation add-on: penetrating dice (`2d6!p`), unique
  results (`2d10u`), critical marks (`cs`/`cf`), sorting (`s`/`sd`), dropping both ends at once
  (`4d10dh1dl2`), arithmetic with brackets and `* / % ^`, and group rolls such as the Savage Worlds
  `{d8!, d6!}kh1`. The editor highlights them all, and a group roll or a bracketed expression
  typed in the composer (`d: Damage (1d6+2)*3`) is rolled as a whole. `d%` is now highlighted and
  rolled from a log line too; it wasn't before.
- The Toolkit's Tables tab rolls on tables written in the note itself: `tbl: Name (d6)` with
  numbered entries (ranges like `1-2:` and `d66` work), or a list such as
  `tbl: Mood [Tense, Hopeful, Uncanny]`. The result is a Lonelog line,
  `tbl: Forest Encounter d6=5 -> Traveler on the road`.
- Card draws record the deck's state as the Cards add-on's `[Deck:]` tag
  (`[Deck:Standard|×51|out:+Qs]`), and Reshuffle gives an insertable `[Deck:Standard|×52|out:none]`.
- Tags from add-ons (`[Deck:]`, `[Inv:]`, `[Wealth:]`…) and events (`[E:]`) are now passed to the
  AI with the rest of the scene, and add-on tags get an "Other tags" section on the Dashboard.
- The composer logs your own beats without calling the AI: start a line with `d:`, `tbl:` or `=>`.
  A `d:` or `tbl:` line with a dice expression but no result is rolled for you
  (`d: Strike 2d6+2 vs 8` becomes `d: Strike 2d6+2=9 vs 8`). Logged lines join the code block
  the log ends in instead of opening a new one each time.
- Compact Lonelog lines, where several beats share one line
  (`@ Sneak d: 2d6=8 -> Fail => Seen`), have every symbol highlighted, and the AI reads them as
  separate beats.
- Meta notes such as `(note: …)`, `(todo: …)` and `(retcon: …)` are shown dimmed. Asides are no
  longer sent to the AI as part of the story; `(retcon: …)` and `(interp: …)` still are.

- In parallel storylines, the AI is told whose storyline it is: the POV character declared on the
  storyline's first scene line (`T2-S1 *City archives* @(Jordan)`), so it knows who a bare `@` means.
- The Custom Deck is saved with each note like the card deck, so its shuffle survives a restart. If
  the deck folder's images have changed since, the note starts a fresh shuffle.

### Changed
- The AI's notation instructions follow Lonelog v1.7. It's told that `->` marks outcomes only, and
  not to write `d:`/`tbl:` lines or meta notes. It's also told how to read the log: tags show
  current state, `d:` gives verdicts and `tbl:` gives content, and `(retcon: …)`/`(interp: …)`
  notes take precedence. This changes the system prompt, so the first request on each note
  rebuilds the Anthropic prompt cache once.
- Toolkit results insert as full Lonelog v1.7 lines instead of bare values:
  - Dice: `d: 2d6+3=12`.
  - Tables: `tbl: Loot -> A broken sword`.
  - Words: `tbl: Noun -> lantern`.
  - Cards: `tbl: draw=Qs`.
  - Oracle: the full answer form, `d: Oracle (50/50, CF 4) d100=40 vs 45 -> Yes, but...`. A random
    event follows as a `tbl: Random Event` block with Focus and Subject lines.
- Insert Scene Template follows Lonelog v1.7: the `d:` line has a slot for its outcome
  (`d:  -> `), there's a `tbl:` line, and the beats sit in a code block when code-block wrapping
  is on.
- Tags now follow Lonelog v1.7's update rules, so a later tag changes the earlier state instead
  of replacing it. `[PC:Alex|HP-2]` lowers HP and keeps the PC's other stats. `[N:Jonah|-injured]`,
  `[N:Jonah|friendly>hostile]`, `status:captured`, `×4` and `[Clock:Alarm+1]` all work, and so do
  tags split across several lines. This applies to what the AI is told about the scene, the
  Dashboard and the PCs in Campaign Info. A PC's or NPC's state now carries over from earlier in
  the log, not only from the last lines.
- The Dashboard shows `[Thread:Escape|Open>Closed]` as Closed, and lists `[Timer:]` tags.
- `[Timer:]`, `[E:]` and `[#N:Name]` reference tags are highlighted. An old `[E:Name 2/6]` is read
  as a clock.
- Updated for Lonelog v1.7 and the v1.1 Dice and Cards add-ons:
  - Inserting a Toolkit card draw writes `draw=Qs` instead of a bare `Qs`, since a card now
    always follows `=`. Cards and dice are highlighted on `tbl:` lines too (most draws are `tbl:`
    now), and a word like "As" on a `d:` line is no longer mistaken for a card.
  - Generate Adventure Seed writes a `tbl:` block (`gen:` was folded into `tbl:` in v1.7). Each
    line reads `Premise: -> …`, which marks it as a result rather than a table entry.
  - `tbl:` lines are highlighted in the editor like the other beat lines, and the AI sees them as
    recent beats.
  - Toolkit dice results put a space before `=` whenever the expression has a compare point or
    ends in a re-roll, as the add-on now requires: `5d10>=7 =3`, not `5d10>=7=3`.

## v0.17.0 - 2026-10-06

### Added
- The Toolkit oracle's Chaos Factor is saved with each note (as `chaos_factor` in its frontmatter),
  so every campaign keeps its own across restarts. Change it from the Toolkit's Oracle tab or in
  Edit Campaign Info. Campaign Info shows it. With no note open, it applies to the current session
  only, as before.
- A **History** tab in the Toolkit lists every roll, draw and result from the session, newest
  first, each with an Insert button, so a result isn't lost just because you didn't insert it
  right away. It keeps the last 200 and is cleared when you close the app (or with Clear).
- Each note keeps its own **card deck**: the Toolkit's draw and discard piles are saved with the
  note (in a hidden `.deck-state/` folder in the vault), so a campaign's shuffle survives a
  restart.
- More **dice notation**: minimum and maximum per die (`4d6min3`, `4d6max3`), compounding
  explosions (`2d6!!`), and re-rolls (`d6r`, `d6ro`, `4d10r<=3`). Modifiers can now be written in
  any order (`5d10!k2` and `5d10k2!` both work), and they're highlighted on `d:` lines.

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
