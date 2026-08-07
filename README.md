# Sybyl

![cover](/cover.png)

[![GitHub tag (Latest by date)](https://img.shields.io/github/v/tag/zeruhur/sybyl-standalone)](https://github.com/zeruhur/sybyl-standalone/releases) ![GitHub all releases](https://img.shields.io/github/downloads/zeruhur/sybyl-standalone/total)

Sybyl is a standalone desktop app for solo tabletop play with provider-backed AI assistance and
Lonelog-aware note formatting, built on Tauri + React + CodeMirror 6.

It enforces a strict neutral, third-person, non-directive AI persona: it never narrates the
player character, never uses second person, never invents lore. It is a referee tool, not a
storyteller.

## Features

- A vault of plain Markdown notes with Lonelog frontmatter and syntax highlighting (scene
  headers, tags, dice/card notation)
- Full GFM editing (strikethrough, tables, task lists, footnotes) via a formatting toolbar
- An in-app solo toolkit: dice roller, card decks (standard + Tarot), custom image decks, a
  Yes/No oracle with Chaos Factor, random tables, word generators, and a cut-up text tool
- Provider API keys stored in the OS keychain, never in plaintext settings
- Light and dark themes
- Full-text search across the vault (Ctrl+O) — searches note bodies, not just filenames
- One-click Regenerate for the last AI generation, replacing its output in place

## Commands

- **Start Scene** — generates a scene opening
- **Declare Action** — interprets a declared action and dice outcome
- **Ask Oracle** — interprets oracle answers (LLM-driven; distinct from the in-app deterministic
  Oracle tool in the Toolkit panel)
- **Interpret Oracle Roll** — narrates the meaning of a dice result
- **What Now** — suggests complications or consequences
- **What Can I Do** — lists available moves/actions given the current scene
- **Expand Scene** — expands the current scene into prose
- **Insert Campaign Header** — scaffolds the campaign title + first session/scene skeleton
- **New Session Header** — inserts a Lonelog session break
- **Edit Campaign Info** — edits a note's campaign frontmatter fields
- **Insert Scene Template** — inserts a bare scene skeleton for manual, non-AI play
- **Add Source File** / **Manage Sources** — attaches and manages source files on a note
- **Ask the Rules** — queries the active ruleset for rules clarifications
- **Generate Character** — generates a character concept
- **Digest Source into Game Context** — distils source documents into a compact `game_context`
  stored in frontmatter

Import Note, Export Note, and the Toolkit panel live outside the command palette (Ctrl+K) since
they aren't tied to a single active note.

## Supported Providers

- Anthropic (Claude)
- OpenAI
- Gemini
- Ollama (local)

## How It Works

Sybyl works inside the active note. Each request is stateless and built from:

- note frontmatter (`ruleset`, `pc_name`, `game_context`, etc.)
- the current scene context, parsed live from the note body on every request — there's no
  separate cached copy to keep in sync
- the command-specific prompt

Source files are distilled once into a compact `game_context` block via the **Digest Source into
Game Context** command, then reused on every subsequent request without per-request file
overhead.

## Development

```bash
cd app
npm install
npm run tauri dev
```

- `npx tsc --noEmit` — type-check
- `npm run build` — type-check + build the frontend
- `npm run tauri build` — full desktop build (needs Rust + a platform toolchain)
- `cd src-tauri && cargo check` — fast Rust-only check

## Releases

Pushing a tag (e.g. `v0.11.0`) triggers `.github/workflows/release.yml`, which builds installers
for Windows, macOS, and Linux, plus Android and iOS packages, and attaches them to a GitHub
Release. See that workflow for exact artifact names and signing requirements, or
[`docs/BUILDING.md`](docs/BUILDING.md) for how to build each target locally.

## Lonelog Notation

[`docs/lonelog.md`](docs/lonelog.md) and its dice/card notation addons
([`docs/lonelog-dice-notation-addon.md`](docs/lonelog-dice-notation-addon.md),
[`docs/lonelog-cards-addon.md`](docs/lonelog-cards-addon.md)) define the note format Sybyl reads
and writes. Parsing/formatting in `app/src/lib/lonelog/` must stay compatible with it.
