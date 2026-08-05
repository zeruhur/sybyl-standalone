# Sybyl Standalone

Sybyl is a solo-TTRPG arbiter tool: a neutral, third-person-only assistant that tracks dice and scenes using the Lonelog notation. This repo is mid-migration from an Obsidian plugin to a standalone desktop app.

## Repo layout

- `src/` — the **original Obsidian plugin** (commands.ts, promptBuilder.ts, providers/, lonelog/parser+formatter, modals.ts, settings.ts). Left untouched as a porting reference. Do not edit unless explicitly asked to change the Obsidian plugin itself.
- `app/` — the **new standalone app**: Tauri + React + TypeScript + CodeMirror 6. This is where active development happens.
- `sybyl-plugin-spec-lonelog.md`, `lonelog.md` — spec docs for the Lonelog notation itself (parsing must stay 100% compatible with `src/lonelog/`).

## Standalone app architecture (`app/`)

- `app/src-tauri/` — Rust/Tauri shell. Plugins enabled: `fs`, `dialog`, `store`, `opener`.
- `app/src/lib/` — ported, provider-agnostic game logic (no React, no Tauri APIs except where noted):
  - `types.ts` — `NoteFrontMatter`, `SybylSettings`, provider configs. Extended from the original plugin with `pc_name` and `session_type` (campaign/one_shot) per the standalone spec.
  - `promptBuilder.ts` — builds the system prompt + request from frontmatter and log body. Ported verbatim (Lonelog mode is always-on here, unlike the original plugin's optional mode).
  - `lonelog/parser.ts`, `lonelog/formatter.ts` — ported verbatim, zero changes.
  - `lonelogHighlight.ts` — CM6 `MatchDecorator`/`ViewPlugin` extension highlighting scene headers, `[N:]`/`[L:]`/`[PC:]`/`[Thread:]`/`[Clock:]`/`[Track:]` tags, and beat-prefix lines (`@`, `?`, `d:`, `->`, `=>`). Layered on top of `markdown()`, not a replacement language.
  - `editorUtils.ts` — CM6 `EditorView` equivalents of the original plugin's `src/editor.ts` (Obsidian `Editor` API): `insertAtCursor`, `appendToNote`, `getSelection`, `insertBelowSelection`, `isInsideCodeBlock`.
  - `providers/` — `anthropic.ts`, `openai.ts`, `gemini.ts`, `ollama.ts` + `base.ts`/`index.ts` factory. Same request/response shapes as the original plugin, with Obsidian's `requestUrl` swapped for `fetch`. **Anthropic requires the `anthropic-dangerous-direct-browser-access: true` header** since Tauri's webview enforces CORS like a real browser.
  - `vault.ts` — vault folder picker + persistence (`@tauri-apps/plugin-store`), list/read/write `.md` files via `gray-matter`. **Requires a `Buffer` polyfill** — see Gotchas below.
  - `settings.ts` — default settings + normalization.
- `app/src/components/` — `Sidebar.tsx`, `Editor.tsx` (CodeMirror 6 wrapper), `SettingsModal.tsx`, `PromptModal.tsx` (generic form modal reused for every command's input dialog), `CommandPalette.tsx` (Ctrl+K list of all commands, keyboard nav).
- `app/src/App.tsx` — orchestration: vault state, active file, settings, a generic `runGeneration()` pipeline shared by every LLM-backed command (mirrors `src/commands.ts`'s `runGeneration` helper), and all command definitions (`cmdAskOracle`, `cmdStartScene`, etc.).

## Current status (as of 2026-08-05)

**Phase 1 and Phase 2 are both complete and verified working.** See `C:\Users\utente\.claude\plans\proud-dancing-barto.md` for the Phase 2 plan (Phase 1's plan was overwritten by it — check the `project-standalone-rebuild` memory for Phase 1's original details if needed).

Working end-to-end: vault folder picker, New Note creation, sidebar listing grouped by `session_type`, CodeMirror editor with Lonelog syntax highlighting, Settings modal for all 4 providers, a Ctrl+K command palette, and **all 10 Sybyl commands that don't require source files**: Ask Oracle, Start Scene, Declare Action, Interpret Oracle Roll, Expand Scene, Adventure Seed, What Now, What Can I Do, Update Scene Context (local-only), New Session Header (local-only). Every LLM-backed command follows the same pipeline: frontmatter+body → `buildRequest` → `provider.generate()` → `format*` → insert into editor at the right placement (cursor/below-selection/end-of-note) → persist to disk.

Not yet built (deferred): fuzzy switcher, OS keychain for API keys (currently uses `tauri-plugin-store` plaintext), source file upload/digest (Ask the Rules, Generate Character, Digest Source — need `sourceUtils.ts` porting), app icons/installer polish, a user-facing max-tokens setting, request cancellation/queueing (see Gotchas — starting a new command while one is in flight can race).

Full details, the bugs found/fixed, and porting notes are in the `project-standalone-rebuild` memory (`/memory`, or ask to recall it).

## Gotchas specific to this codebase

- **`gray-matter` needs a `Buffer` polyfill.** It unconditionally calls `Buffer.isBuffer`/`Buffer.from`, which don't exist in the Tauri webview. `app/src/lib/vault.ts` imports the `buffer` npm package and assigns it to `globalThis.Buffer` before gray-matter is used. If file reads start silently failing (sidebar shows "no files" with no console error), check this first — errors here get swallowed by a per-file `try/catch` in `listVaultFiles`.
- **`matter.stringify()` throws on `undefined` frontmatter values** (YAMLException). `vault.ts` filters them out via `withoutUndefined()` before serializing — don't remove that.
- **Local reasoning models (e.g. Ollama `qwen3.5:9b`) can return an empty response** if `maxOutputTokens` is too small — they spend tokens on hidden "thinking" before the visible answer. This surfaces as `Error: Provider returned an empty response.` It's a token-budget/model-choice issue, not a code defect.
- **MSVC Build Tools**: if `cargo build`/`tauri dev` can't find `cl.exe`, don't trust `vswhere -requires VC.Tools.x86.x64` alone — check for `cl.exe` directly under `...BuildTools\VC\Tools\MSVC\<version>\bin\Hostx64\x64`. The winget install of `Microsoft.VisualStudio.2022.BuildTools` can silently skip the actual compiler package even when the VCTools workload is requested; a follow-up `vs_installer.exe modify --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64` fixes it.
- **No request cancellation between commands.** `runGeneration()` in `App.tsx` doesn't use an `AbortController`, and nothing stops a second command from starting while a slow first one (e.g. a local Ollama reasoning model still "thinking") is still in flight — both write to the same `status`/`loading` state and both will try to insert into the editor whenever they resolve, which can look like a stuck/hung UI when really two requests are racing. `runCommand()` in `App.tsx` guards against starting a *new* command while `loading` is true, but it can't cancel one already running. If a generation looks stuck, reload the webview (Ctrl+R in `tauri dev`) to clear it rather than assuming the pipeline is broken.
- **SendKeys + Windows text-suggestion popups**: if automating this app's UI, a hardware-keyboard predictive-text overlay can steal keystrokes mid-string (observed dropping `[`/`]` characters while typing a Lonelog tag). Not an app bug — verify with a screenshot before concluding the editor/highlighting is wrong.

## Verifying changes

- Typecheck: `cd app && npx tsc --noEmit`
- Build frontend only: `cd app && npm run build`
- Full build (needs Rust + MSVC toolchain): `cd app && npm run tauri build`
- Run dev with hot reload + devtools: `cd app && npm run tauri dev`
