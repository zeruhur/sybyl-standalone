# Repository Guidelines

Sybyl is a standalone desktop (and, going forward, mobile) app: a neutral, third-person-only
arbiter for solo tabletop RPGs, built on Tauri + React + TypeScript + CodeMirror 6. All active
development happens under [`app/`](/app).

The former Obsidian plugin implementation has been retired; consult git history before this
cleanup if you need it as a porting reference.

## Project Structure & Module Organization

- `app/src/lib/` — provider-agnostic game logic (Lonelog parser/formatter, prompt builder,
  provider adapters, solo-toolkit engines, vault access)
- `app/src/components/` — React UI components
- `app/src-tauri/` — Rust/Tauri shell (commands, plugin config, mobile `gen/` targets)
- `lonelog.md`, `lonelog-dice-notation-addon.md`, `lonelog-cards-addon.md` — the Lonelog notation
  spec; parsing/formatting in `app/src/lib/lonelog/` must stay compatible with it
- `CLAUDE.md` — detailed, living architecture notes for this repo; read it before making
  non-trivial changes

## Build, Test, and Development Commands

Run all commands from `app/`:

- `npm install` — install dependencies
- `npm run tauri dev` — run the desktop app with hot reload
- `npx tsc --noEmit` — type-check
- `npm run build` — type-check + build the frontend
- `npm run tauri build` — full desktop build (needs Rust + platform toolchain)
- `cd src-tauri && cargo check` — fast Rust-only check

## Coding Style & Naming Conventions

TypeScript in strict mode, ES module syntax, 2-space indentation, semicolons, double quotes,
small focused modules. `PascalCase` for classes/interfaces/React components, `camelCase` for
functions and variables.

## Testing Guidelines

No automated test runner is committed yet. At minimum, run `npx tsc --noEmit` and
`npm run build` (from `app/`) before opening a PR; run `cargo check` (from `app/src-tauri/`) for
Rust-side changes.

## Commit & Pull Request Guidelines

Keep commits focused with short imperative subjects (e.g. `Add Android release workflow`). PRs
should include a short summary, affected files/commands, linked issues if any, and screenshots
for UI changes.

## Security & Configuration Tips

Do not commit API keys or vault contents. Provider API keys are stored in the OS keychain via
`app/src/lib/keychain.ts`, never in plaintext settings files. When changing provider behavior or
the Lonelog frontmatter schema, update the relevant spec doc in the same PR.
