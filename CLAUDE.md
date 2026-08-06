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
- `app/src/lib/sourceUtils.ts` — reads text/binary source files and resolves them into `ResolvedSource[]` for a given provider (base64 for Anthropic/Gemini-PDF, plain text otherwise). Port of `src/sourceUtils.ts`, simplified: no vault-relative path resolution, since standalone `SourceRef.vault_path` is always an absolute path.
- `app/src/lib/keychain.ts` — thin `invoke()` wrappers around three custom Tauri commands (`keychain_set/get/delete`, defined in `app/src-tauri/src/lib.rs`) backed by the Rust `keyring` crate. See Gotchas — the crate needs an explicit backend feature or it silently no-ops.
- `app/src/components/` — `Sidebar.tsx`, `Editor.tsx` (CodeMirror 6 wrapper), `SettingsModal.tsx`, `PromptModal.tsx` (generic form modal reused for every command's input dialog), `CommandPalette.tsx` (Ctrl+K list of all commands, keyboard nav), `FileSwitcher.tsx` (Ctrl+O fuzzy file switcher), `ListPickerModal.tsx` (generic click/arrow-key list picker, used for "choose a source" flows), `SourceManagerModal.tsx`.
- `app/src/App.tsx` — orchestration: vault state, active file, settings (now keychain-aware), a generic `runGeneration()` pipeline shared by every LLM-backed command (mirrors `src/commands.ts`'s `runGeneration` helper) plus a `runRawGeneration()` sibling for source-grounded commands that skip Lonelog note-context injection, all command definitions (`cmdAskOracle`, `cmdStartScene`, ..., `cmdAskTheRules`, `cmdGenerateCharacter`, `cmdDigestSource`), and per-generation `AbortController` cancellation.

## Current status (as of 2026-08-06)

**Phases 1, 2, and 3 are all complete.** See `C:\Users\utente\.claude\plans\proud-dancing-barto.md` for the Phase 3 plan (each phase's plan overwrote the previous one — check the `project-standalone-rebuild` memory for earlier phases' details if needed).

Working end-to-end: vault folder picker, New Note creation, sidebar listing grouped by `session_type`, CodeMirror editor with Lonelog syntax highlighting, Settings modal for all 4 providers (API keys in the OS keychain, not plaintext) plus a default-max-tokens setting, a Ctrl+K command palette, a Ctrl+O fuzzy file switcher, per-generation Cancel button, and **all 15 Sybyl commands** — the 10 from Phase 2 plus source-grounded ones added in Phase 3: Add Source File, Manage Sources, Ask the Rules, Generate Character, Digest Source into Game Context. Every LLM-backed command follows the same pipeline: frontmatter+body (or resolved sources, for source-grounded ones) → provider → formatter → insert/persist.

Not yet built (deferred, in `features.md` and the remaining backlog): import/export markdown, text formatting bar, solo-toolkit dice/card/random-table integration, Full Lonelog dice/card notation support, app installer graphics polish beyond icon/productName/identifier.

Full details, the bugs found/fixed, and porting notes are in the `project-standalone-rebuild` memory (`/memory`, or ask to recall it).

## Gotchas specific to this codebase

- **`gray-matter` needs a `Buffer` polyfill.** It unconditionally calls `Buffer.isBuffer`/`Buffer.from`, which don't exist in the Tauri webview. `app/src/lib/vault.ts` imports the `buffer` npm package and assigns it to `globalThis.Buffer` before gray-matter is used. If file reads start silently failing (sidebar shows "no files" with no console error), check this first — errors here get swallowed by a per-file `try/catch` in `listVaultFiles`.
- **`matter.stringify()` throws on `undefined` frontmatter values** (YAMLException). `vault.ts` filters them out via `withoutUndefined()` before serializing — don't remove that.
- **Local reasoning models (e.g. Ollama `qwen3.5:9b`) can return an empty response** if `maxOutputTokens` is too small — they spend tokens on hidden "thinking" before the visible answer. This surfaces as `Error: Provider returned an empty response.` It's a token-budget/model-choice issue, not a code defect.
- **MSVC Build Tools**: if `cargo build`/`tauri dev` can't find `cl.exe`, don't trust `vswhere -requires VC.Tools.x86.x64` alone — check for `cl.exe` directly under `...BuildTools\VC\Tools\MSVC\<version>\bin\Hostx64\x64`. The winget install of `Microsoft.VisualStudio.2022.BuildTools` can silently skip the actual compiler package even when the VCTools workload is requested; a follow-up `vs_installer.exe modify --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64` fixes it.
- **Request cancellation (fixed in Phase 3)**: `runGeneration()`/`runRawGeneration()` in `App.tsx` now use an `AbortController` stored in `abortControllerRef`, and there's a Cancel button in the status bar while `loading`. `runCommand()` also refuses to start a new command while one is already in flight. If you still see two generations racing, check that both call sites are going through these helpers rather than calling `provider.generate()` directly.
- **The `keyring` crate needs an explicit backend feature or it silently no-ops.** `keyring = "3"` with no `features` compiles fine and every call *succeeds* (`set_password` returns `Ok`), but it's using the crate's internal mock/no-op store — nothing is ever written to the real OS credential store, and a `get_password` right after a `set_password` in the same process returns `NoEntry`. `Cargo.toml` must specify `features = ["windows-native", "apple-native", "linux-native-sync-persistent"]` (or the subset you actually ship for). If keychain behavior ever looks like "writes succeed but reads never find anything," check this first — it's silent, not an error.
- **SendKeys + Windows text-suggestion popups**: if automating this app's UI, a hardware-keyboard predictive-text overlay can steal keystrokes mid-string (observed dropping `[`/`]` characters while typing a Lonelog tag). Not an app bug — verify with a screenshot before concluding the editor/highlighting is wrong.
- **Clipboard-based devtools automation is dangerous — prefer SendKeys typing, or better, avoid the GUI entirely.** Pasting a JS snippet into the devtools console via `Set-Clipboard` + Ctrl+V has a real failure mode: if the `Set-Clipboard` call is part of a tool invocation that gets rejected/interrupted before running, the paste silently uses whatever was *already* on the user's clipboard instead — which once was a real Anthropic API key, briefly exposed on-screen and in a screenshot. If you must type into devtools, escape and use `SendKeys` directly (regex `([+^%~(){}])` → `{$1}` handles Windows SendKeys escaping) rather than clipboard paste.
- **Prefer a throwaway Rust example over GUI screenshots for backend-only verification.** The keyring bug above was found and fixed almost entirely via `cargo run --example <name>` (create a temp file under `app/src-tauri/examples/`, run it, delete it) — no screenshots, no window-focus juggling, orders of magnitude cheaper than driving the live app for something that doesn't actually touch the UI. Reserve live `tauri dev` + screenshot verification for things that can *only* be observed in the running webview (rendering, layout, actual click flows).
- **Window-focus is genuinely unreliable when the user is also active on the machine** — VS Code, browser tabs, etc. can steal foreground focus between one PowerShell tool call and the next (they're separate processes; nothing holds focus for you in between). Always re-find-and-focus the target window and verify `GetForegroundWindow()` immediately before sending input, ideally in the same script as the input itself, and abort that step (don't click blind) if the check fails.

## Verifying changes

- Typecheck: `cd app && npx tsc --noEmit`
- Build frontend only: `cd app && npm run build`
- Rust-only check (fast): `cd app/src-tauri && cargo check`
- Full build (needs Rust + MSVC toolchain): `cd app && npm run tauri build`
- Run dev with hot reload + devtools: `cd app && npm run tauri dev`
- For backend/Rust-only logic (e.g. keychain), write a throwaway `app/src-tauri/examples/*.rs` and `cargo run --example <name>` instead of driving the GUI.
