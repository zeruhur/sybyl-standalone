# Sybyl User Guide

Sybyl is a neutral, third-person referee for solo tabletop RPGs. It never narrates your
character, never speaks as "you", and never invents lore — it interprets rolls, sets scenes, and
tracks state, and leaves the storytelling to you. This guide covers everything you can do in the
app. For the underlying note format, see [`lonelog.md`](lonelog.md); for building the app itself,
see [`BUILDING.md`](BUILDING.md).

## Contents

- [Getting started](#getting-started)
- [Notes and campaigns](#notes-and-campaigns)
- [The editor](#the-editor)
- [Playing: the composer](#playing-the-composer)
- [The side panel](#the-side-panel)
- [Campaign Info panel](#campaign-info-panel)
- [Dashboard: threads, clocks, tracks](#dashboard-threads-clocks-tracks)
- [Version history](#version-history)
- [Commands](#commands)
- [The Toolkit](#the-toolkit)
- [Sources and rules grounding](#sources-and-rules-grounding)
- [Search and navigation](#search-and-navigation)
- [Settings and providers](#settings-and-providers)
- [Import and export](#import-and-export)
- [Themes](#themes)
- [Mobile (Android)](#mobile-android)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

## Getting started

On first launch, Sybyl asks you to **choose a vault folder** — a plain folder on disk where your
notes live as `.md` files. Nothing is uploaded anywhere except the text you explicitly send to an
AI provider when running a command.

1. Pick or create a folder for your vault.
2. Click **+ New Note** in the sidebar, fill in whatever campaign fields you know (all optional
   except type), and save.
3. Open **Settings** and add an API key for at least one provider (see
   [Settings and providers](#settings-and-providers)) if you want AI-backed commands. Everything
   under [The Toolkit](#the-toolkit) works with no API key at all.

Sybyl never picks a provider or model for you implicitly — whatever is set as the **Active
provider** in Settings is what every command uses.

## Notes and campaigns

Each `.md` file in your vault is one campaign or one-shot — not one scene, not one session. The
sidebar splits your vault into two collapsible sections, **Campagne in corso** (ongoing
campaigns) and **One-shot**, based on the note's `session_type`. Click a section's header to
collapse or expand it.

A note has two parts:

- **Frontmatter** — YAML metadata (title, ruleset, player, tone, etc.) that Sybyl reads to build
  every AI prompt. It's never shown in the editor itself; use the
  [Campaign Info panel](#campaign-info-panel) to see it, and **Edit Campaign Info** to change it.
- **Body** — the actual play log, written in [Lonelog notation](lonelog.md): scene headers,
  `[N:]`/`[L:]`/`[PC:]`/`[Thread:]`/`[Clock:]`/`[Track:]` tags, and beat-prefixed lines (`@` for
  actions, `d:` for rolls, `->`/`=>` for results and consequences).

You don't have to write Lonelog by hand — most commands insert correctly-tagged text for you.

## The editor

The main pane is a CodeMirror editor with full GFM support (tables, task lists, strikethrough,
autolinks) plus Lonelog-aware syntax highlighting for scene headers, tags, and dice/card notation
on `d:` lines. Changes autosave about half a second after you stop typing.

The **formatting toolbar** above the editor has five buttons inline (Bold, Italic, Code, Heading,
Link) plus a **More ⋯** popover for the rest (Strikethrough, Code block, Blockquote, Bullet list,
Numbered list, Task list, Image, Table, Horizontal rule, Footnote). Only Bold/Italic/Code have
keyboard shortcuts (Ctrl+B/I/E) — everything else is toolbar-only.

## Playing: the composer

The input line under the editor is the fastest way to play. Its first character picks what happens,
following Lonelog's own beat symbols, and Enter sends it:

| Type | What happens |
|---|---|
| `? Is the guard asleep?` | Ask Oracle — Sybyl rolls and interprets |
| `? Is the guard asleep? -> Yes, but` | Ask Oracle with a result you already rolled |
| `@ Pick the lock` | Declare Action — Sybyl narrates the consequences |
| `@ Pick the lock d: 2d6=8` | Declare Action with a roll result |
| `-> Yes, and` | Interpret an oracle result |

The chips above the input (**? Oracle**, **@ Action**, **S Scene**, **-> Interpret**) do the same
without typing a symbol: pick one, then type plain text. **Scene** can be sent blank to let Sybyl
choose the setting, and **Interpret** can be sent blank to interpret whatever text you've selected
in the editor. **Expand**, **What now?** and **What can I do?** run immediately, and **More…** opens
the full command palette.

Everything sent from the composer is appended to the **end** of the log, where play continues. The
command palette (Ctrl+K) still inserts at the cursor, for when you want output somewhere else.
Ctrl+J jumps to the composer from anywhere. The input is only cleared once the result has landed,
so a failed or cancelled request doesn't lose what you typed.

## The side panel

**Toolkit**, **Dashboard** and **Info** in the command bar open one panel beside the editor, with a
tab for each. Clicking the button for the tab that's already showing closes the panel. Switching
tabs doesn't reset anything: a Toolkit roll result is still there when you come back from the
Dashboard. On narrow screens the panel slides up from the bottom instead, and tapping outside it
closes it.

## Campaign Info panel

The **Campaign Info** tab of the side panel (the **Info** button) shows every campaign
frontmatter field at a glance: title, type, player, ruleset, genre, PCs, dates, tools, themes,
tone, notes, and the digested game context. Since the editor never renders frontmatter directly,
this is the only place to confirm a frontmatter edit actually landed. Its **Edit campaign info**
button runs the Edit Campaign Info command.

## Dashboard: threads, clocks, tracks

Click **Dashboard** in the command bar (needs an open note) to open the side panel's Dashboard
tab, showing every `[Thread:]`, `[Clock:]`,
and `[Track:]` tag in the current note, aggregated live as you type:

- **Threads** — open ones are listed directly; closed ones collapse behind a "N closed" toggle.
- **Clocks** and **Tracks** — each renders as a labeled progress bar (`current/total`).

Only the *last* occurrence of a given name counts as its current state — re-declaring
`[Clock:Ritual 8/12]` later in the log overrides an earlier `[Clock:Ritual 5/12]`, exactly like
Lonelog's own convention. The dashboard reads the whole note, not just recent lines, so nothing
scrolls out of view.

## Version history

Two independent safety nets protect a note beyond CodeMirror's in-session undo:

- **Snapshot** (sidebar button) — saves the note's current state on demand.
- **History** (sidebar button) — opens a list of every saved snapshot for the current note,
  newest first, each with a **Restore** button.

Sybyl also snapshots a note automatically when you open it, throttled to at most once every 10
minutes per note so reopening the same note repeatedly doesn't spam near-duplicates. Snapshots
live in a hidden `.history/<note-name>/` folder inside your vault and are pruned to the 40 most
recent per note.

Restoring is itself reversible: before overwriting anything, Sybyl saves one more snapshot of
whatever was on screen, so you can always step back from a restore too. Deleting a note also
deletes its snapshot history.

## Commands

Open the palette with **Commands** (Ctrl+K) — it needs an active note. Type to filter the list,
then pick a command with the arrow keys and Enter, or with the mouse.

AI-backed commands:

| Command | What it does |
|---|---|
| Start Scene | Generates a scene opening (optionally from a description you give it) |
| Declare Action | Narrates consequences for a declared PC action and optional roll result |
| Ask Oracle | Interprets an oracle question/result in scene context (LLM-driven — distinct from the deterministic Oracle tool in the Toolkit) |
| Interpret Oracle Roll | Narrates the meaning of a raw dice result, using your current selection if you have one |
| Expand Scene | Expands the current scene into a longer prose passage |
| Adventure Seed | Generates a premise/conflict/hook/tone seed, optionally from a theme |
| What Now | Suggests 1-2 neutral complications, without choosing one |
| What Can I Do | Lists exactly 3 concrete next actions, without recommending one |
| Ask the Rules | Answers a rules question, grounded in the note's digested game context or an attached source |
| Generate Character | Generates a character per the ruleset's own creation procedure |
| Digest Source into Game Context | Distills an attached source file into a compact, reusable `game_context` |

Structural / non-AI commands:

| Command | What it does |
|---|---|
| Insert Campaign Header | Scaffolds `# Title` + first Session + first Scene |
| New Session Header | Inserts a new `## Session N` break with date/duration/recap |
| Edit Campaign Info | Edits a note's campaign frontmatter fields, including Campaign/One-shot type |
| Insert Scene Template | Inserts a bare scene skeleton for manual, non-AI play |
| Add Source File | Attaches a PDF/text/markdown source to the note |
| Manage Sources | Lists and removes attached sources |

Every AI-backed command can be **cancelled** mid-flight (Cancel button in the status bar) and the
most recent one can be **regenerated** — re-run with the identical request, swapping its output
in place — as long as the note hasn't changed at that spot since.

**Ask the Rules** and **Generate Character** prefer an already-digested `game_context` over
re-reading a raw file: run **Digest Source into Game Context** once per source, and every
subsequent request reuses that instead of re-uploading the file.

**Import Note**, **Export Note**, **Save Snapshot**, and **Version History** live in the sidebar,
not the command palette, since they aren't about generating text into the current cursor
position. The **Toolkit**, **Dashboard** and **Info** panels live in the
[side panel](#the-side-panel) for the same reason. The most common play commands are also one
keystroke away in the [composer](#playing-the-composer).

## The Toolkit

Click **Toolkit** in the command bar (no note required) to open the side panel's Toolkit tab: a
set of offline, deterministic tools — none of them call an AI provider:

- **Dice** — full expression roller (`2d6+2`, `4d6kh3`, exploding `d6!`, dice-pool
  successes/failures) plus one-tap quick buttons for d4–d20/d%.
- **Oracle** — a deterministic Yes/No oracle: pick a likelihood (Impossible…Certain) and a
  1–9 Chaos Factor, and it rolls 1d100 against a computed threshold, flagging exceptional results
  and random events.
- **Cards** — standard 52-card or full Tarot deck with a draw/discard pile that auto-reshuffles
  when empty; Tarot reversals are decided per draw.
- **Custom Deck** — draws images from `<vault>/decks/<name>/` (any folder of image files you add
  yourself). Preview-only — there's no Lonelog notation for an image, so draws can't be inserted.
- **Words** — 8 categories of curated word generators (noun, verb, adjective, job, town name,
  etc.) for quick naming.
- **Cut-up** — the Burroughs cut-up technique: shuffles a block of text word-by-word or
  line-by-line. Text can be typed directly or loaded from an existing table file.
- **Tables** — rolls on custom random tables you author yourself as plain `.md`/`.txt` files in
  `<vault>/tables/`, one entry per line (optionally weighted with a trailing `^N`).

Every result has its own **Insert** button, which inserts at the editor cursor and is disabled
(not hidden) when no note is open.

## Sources and rules grounding

If your ruleset or setting lives in a PDF or text file:

1. **Add Source File** attaches it to the current note.
2. **Digest Source into Game Context** distills it once into a compact reference stored in the
   note's frontmatter — reused on every future request without re-reading the file.
3. **Ask the Rules** and **Generate Character** ground their answers in that digest (falling back
   to the raw attached source if nothing's been digested yet).
4. **Manage Sources** lists and removes attached files at any point.

## Search and navigation

- **Search** (Ctrl+O) opens a full-text switcher across the whole vault — it matches filename and
  PC name first, then falls back to the note body, then the digested game context, showing a
  highlighted snippet for body/context matches.
- **Commands** (Ctrl+K) opens the command palette described above.

## Settings and providers

Settings holds the active provider, a default max-output-tokens cap, and per-provider
configuration for Claude (Anthropic), OpenAI, Gemini, and Ollama:

- Each provider has a **Get API key ↗** link straight to its console/dashboard (Ollama links to
  its website instead, since it has no key page).
- **API keys are stored in the OS keychain** (Windows Credential Manager / macOS Keychain / Linux
  Secret Service) — never in plain text settings.
- **Refresh** next to each Model field fetches that provider's currently available models; the
  model you have configured is always kept selectable even before refreshing, or if it's since
  fallen out of the provider's list.
- Ollama only needs a base URL (defaults to a local install) — no key.
- On Android there's no OS keychain backend, so keys are kept in the app's private settings
  storage instead.

**Per-note overrides.** A note's YAML frontmatter can override the Settings defaults for that note
only: `provider:` (`anthropic`, `openai`, `gemini`, or `ollama`), `model:`, `temperature:`, and
`language:` (the response language). Edit the `.md` file in another editor to set them, since the
in-app editor doesn't show frontmatter.

## Import and export

**Import Note** (sidebar) copies an external `.md` file into the vault as a new note. **Export
Note** (sidebar, needs an active note) writes the current note out to any location you pick,
frontmatter included.

## Themes

The sun/moon button in the command bar toggles between dark and light. Both keep the same violet
accent identity; only the background/border/text neutrals change.

## Mobile (Android)

Sybyl runs on Android with a few differences from desktop:

- There's no vault folder picker on Android (the underlying dialog plugin has no folder-picker
  implementation there at all) — the vault auto-initializes inside the app's own private storage
  on first launch, and the "Change vault" button is hidden.
- On narrow screens, the sidebar becomes an off-canvas panel (hamburger button, top-left) and the
  command-bar actions collapse behind a **⋯** button that opens a button-board menu instead of
  wrapping onto extra rows. The side panel becomes a bottom sheet.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+K | Open Command Palette |
| Ctrl+O | Open Search (full-text file switcher) |
| Ctrl+J | Jump to the play composer |
| Ctrl+B | Bold selection |
| Ctrl+I | Italic selection |
| Ctrl+E | Code selection |

## Troubleshooting

- **"Provider returned an empty response."** — usually a local reasoning model (e.g. an Ollama
  model like `qwen3.5`) spending its whole output-token budget on hidden "thinking" before the
  visible answer. Raise **Default max output tokens** in Settings.
- **A frontmatter edit doesn't seem to have saved.** — the editor deliberately never renders
  frontmatter. Check the [Campaign Info panel](#campaign-info-panel) rather than the note body.
- **Ask the Rules / Generate Character keep asking to pick a source.** — run **Digest Source into
  Game Context** once first; both commands prefer the digest and only fall back to a raw source
  pick when nothing's been digested yet.
- **"You switched notes while generating, so the result was discarded."** — a generation's
  output only ever goes into the note it was started from. If you open a different note while it's
  still running, the result is dropped rather than inserted into the wrong note; switch back and
  run the command again.
