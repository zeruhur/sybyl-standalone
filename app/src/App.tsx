import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import Editor from "./components/Editor";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import PromptModal, { PromptField } from "./components/PromptModal";
import CommandPalette, { CommandItem } from "./components/CommandPalette";
import FileSwitcher from "./components/FileSwitcher";
import ListPickerModal, { ListPickerItem } from "./components/ListPickerModal";
import SourceManagerModal from "./components/SourceManagerModal";
import FormatToolbar from "./components/FormatToolbar";
import CampaignInfoPanel from "./components/CampaignInfoPanel";
import ConfirmModal from "./components/ConfirmModal";
import ToolkitPanel from "./components/ToolkitPanel";
import DashboardPanel from "./components/DashboardPanel";
import VersionHistoryModal from "./components/VersionHistoryModal";
import UserGuideModal from "./components/UserGuideModal";
import PlayComposer, { PlayComposerHandle } from "./components/PlayComposer";
import SideDrawer, { DrawerTab } from "./components/SideDrawer";
import { ComposerIntent } from "./lib/composer";
import { createVaultFile, deleteVaultFile, exportNoteTo, getSavedVaultPath, importNoteFile, importSourceFile, initAndroidVault, isAndroid, listVaultFiles, loadSetting, pickVaultFolder, readVaultFile, saveSetting, writeVaultFile } from "./lib/vault";
import { deleteSnapshots, listSnapshots, maybeAutoSnapshot, saveSnapshot, Snapshot } from "./lib/history";
import { formatRollResult, rollExpression } from "./lib/toolkit/diceEngine";
import { createDeckSession, DeckSession, DeckType, drawCard, reshuffleDeck } from "./lib/toolkit/cardEngine";
import { generateWord } from "./lib/toolkit/wordGenerators";
import { listTableFiles, parseTableEntries, readTableFile, rollTable, TableFile } from "./lib/toolkit/tables";
import { askOracle, formatOracleResult } from "./lib/toolkit/oracleEngine";
import {
  createCustomDeckSession,
  CustomDeckSession,
  DeckFolder,
  drawCustomCard,
  imageToDataUri,
  listDeckFolders,
  reshuffleCustomDeck
} from "./lib/toolkit/customDeckEngine";
import { cutUpText, CutUpMode } from "./lib/toolkit/cutup";
import { keychainGet, keychainSet } from "./lib/keychain";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/settings";
import { GenerationRequest, NoteFrontMatter, ProviderID, SessionType, SourceRef, SybylSettings, VaultFile } from "./lib/types";
import { buildRequest, buildSystemPrompt } from "./lib/promptBuilder";
import { getProvider } from "./lib/providers";
import { parseLonelogContext } from "./lib/lonelog/parser";
import { inferMimeType, resolveSourcesForRequest } from "./lib/sourceUtils";
import {
  formatAdventureSeed,
  formatAskOracle,
  formatDeclareAction,
  formatExpandScene,
  formatInterpretOracle,
  formatStartScene,
  formatSuggestConsequence,
  LonelogFormatOptions
} from "./lib/lonelog/formatter";
import { appendToNote, getSelection, insertAtCursor, insertBelowSelection, insertFootnote, InsertedRange, isInsideCodeBlock, setHeadingLevel, togglePrefixLine, wrapSelection } from "./lib/editorUtils";
import "./App.css";

const NEW_NOTE_FIELDS: PromptField[] = [
  { key: "title", label: "Campaign title", optional: true },
  { key: "pc_name", label: "Character name", optional: true },
  { key: "player", label: "Player", optional: true },
  { key: "ruleset", label: "Ruleset", optional: true, placeholder: "Ironsworn" },
  { key: "genre", label: "Genre", optional: true },
  { key: "tools", label: "Tools", optional: true },
  { key: "themes", label: "Themes", optional: true },
  { key: "tone", label: "Tone", optional: true },
  { key: "notes", label: "Notes", optional: true },
  {
    key: "session_type",
    label: "Type",
    defaultValue: "campaign",
    options: [
      { value: "campaign", label: "Campaign" },
      { value: "one_shot", label: "One-shot" }
    ]
  },
  { key: "game_context", label: "Game context", optional: true }
];

const CAMPAIGN_INFO_KEYS = ["title", "player", "ruleset", "genre", "start_date", "tools", "themes", "tone", "notes"] as const;

const ASK_ORACLE_FIELDS: PromptField[] = [
  { key: "question", label: "Question" },
  { key: "result", label: "Oracle result", optional: true }
];

function parseLonelogOracleResponse(text: string): { result: string; interpretation: string } {
  const lines = text
    .replace(/^>\s*/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const result = lines.find((line) => line.startsWith("->"))?.replace(/^->\s*/, "") ?? "Unclear";
  const interpretation = lines.filter((line) => !line.startsWith("->")).join("\n");
  return { result, interpretation };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Auto-compiles the Lonelog standard campaign-header fields (lonelog.md §5.1) that can be
 * derived from the log body: last_update always refreshes, pcs is re-derived from the most
 * recent [PC:...] tag(s) found in the log. */
function compileFrontmatter(body: string, contextDepth: number): Partial<NoteFrontMatter> {
  const ctx = parseLonelogContext(body, contextDepth);
  const derivedPcs = ctx.pcState.length
    ? ctx.pcState.map((state) => `${state.split("|")[0].trim()} [PC:${state}]`).join(", ")
    : undefined;
  return {
    last_update: todayIsoDate(),
    ...(derivedPcs ? { pcs: derivedPcs } : {})
  };
}

const KEYCHAIN_PROVIDERS = ["anthropic", "openai", "gemini"] as const;

/** Reads a provider's API key from the OS keychain, falling back to (and migrating in) a
 * legacy plaintext value that may still be sitting in the settings store from before Phase 3. */
async function migrateAndLoadApiKey(account: string, legacyKey: string): Promise<string> {
  try {
    const stored = await keychainGet(account);
    if (stored) return stored;
    if (legacyKey) {
      await keychainSet(account, legacyKey).catch(() => {});
    }
    return legacyKey;
  } catch {
    return legacyKey;
  }
}

type Placement = "cursor" | "below-selection" | "end-of-note";

interface LastGeneration {
  filePath: string;
  userMessage: string;
  format: (text: string, insideCodeBlock: boolean) => string;
  maxOutputTokens: number;
  placement: Placement;
  insertedText: string;
  range: InsertedRange | null;
}

interface ActiveModal {
  title: string;
  fields: PromptField[];
  onSubmit: (values: Record<string, string>) => void;
}

interface ActiveListPicker {
  title: string;
  items: ListPickerItem[];
  onPick: (id: string) => void;
}

export default function App() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [activeFile, setActiveFile] = useState<VaultFile | null>(null);
  const [body, setBody] = useState("");
  const [settings, setSettings] = useState<SybylSettings>(DEFAULT_SETTINGS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [activeListPicker, setActiveListPicker] = useState<ActiveListPicker | null>(null);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VaultFile | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("toolkit");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userGuideOpen, setUserGuideOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [deckSession, setDeckSession] = useState<DeckSession | null>(null);
  const [tableFiles, setTableFiles] = useState<TableFile[]>([]);
  const [oracleChaosFactor, setOracleChaosFactor] = useState(5);
  const [deckFolders, setDeckFolders] = useState<DeckFolder[]>([]);
  const [customDeckSession, setCustomDeckSession] = useState<CustomDeckSession | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastGeneration, setLastGeneration] = useState<LastGeneration | null>(null);
  const [version, setVersion] = useState("");

  const editorViewRef = useRef<EditorView | null>(null);
  const composerRef = useRef<PlayComposerHandle | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<{ file: VaultFile; body: string } | null>(null);
  const statusTimer = useRef<number | undefined>(undefined);
  const activeFileRef = useRef<VaultFile | null>(null);
  activeFileRef.current = activeFile;
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshFiles = useCallback(async (path: string) => {
    const list = await listVaultFiles(path);
    setFiles(list);
    return list;
  }, []);

  const refreshTableFiles = useCallback(async (path: string) => {
    const list = await listTableFiles(path);
    setTableFiles(list);
    return list;
  }, []);

  const refreshDeckFolders = useCallback(async (path: string) => {
    const list = await listDeckFolders(path);
    setDeckFolders(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      const savedSettings = await loadSetting<SybylSettings>("sybylSettings");
      const normalized = normalizeSettings(savedSettings);
      for (const id of KEYCHAIN_PROVIDERS) {
        normalized.providers[id].apiKey = await migrateAndLoadApiKey(id, normalized.providers[id].apiKey);
      }
      setSettings(normalized);

      const saved = (await getSavedVaultPath()) ?? (isAndroid() ? await initAndroidVault() : null);
      if (saved) {
        setVaultPath(saved);
        await refreshFiles(saved);
        await refreshTableFiles(saved);
        await refreshDeckFolders(saved);
      }
    })();
    getVersion().then(setVersion).catch(() => {});
  }, [refreshFiles, refreshTableFiles, refreshDeckFolders]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Mirrors the Commands button's disabled state: every palette command needs an open note.
        if (activeFileRef.current) setPaletteOpen((open) => !open);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setSwitcherOpen((open) => !open);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        composerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleChangeVault() {
    const picked = await pickVaultFolder();
    if (!picked) return;
    await flushPendingSave();
    setVaultPath(picked);
    setActiveFile(null);
    activeFileRef.current = null;
    setBody("");
    // The custom deck session holds image paths inside the old vault.
    setCustomDeckSession(null);
    await refreshFiles(picked);
    await refreshTableFiles(picked);
    await refreshDeckFolders(picked);
  }

  function selectFile(file: VaultFile) {
    setSidebarOpen(false);
    if (file.path === activeFileRef.current?.path) return;
    void flushPendingSave();
    setActiveFile(file);
    setBody(file.body);
    setLastGeneration(null);
    if (vaultPath) {
      void maybeAutoSnapshot(vaultPath, file);
    }
  }

  /** Writes the pending debounced body save (if any) right now. Called by the debounce timer and
   * before switching notes, so an edit made less than 500ms before a switch isn't dropped. */
  const flushPendingSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;
    // Prefer the live in-memory file while it's still active — its frontmatter may have been
    // patched since the save was scheduled (e.g. a scene_counter bump) — and fall back to the
    // copy captured at schedule time once the user has moved on to another note.
    const live = activeFileRef.current;
    const base = live && live.path === pending.file.path ? live : pending.file;
    const nextFm: NoteFrontMatter = { ...base.fm, ...compileFrontmatter(pending.body, settings.lonelogContextDepth) };
    await writeVaultFile(base.path, nextFm, pending.body);
    const updated: VaultFile = { ...base, fm: nextFm, body: pending.body };
    if (activeFileRef.current?.path === updated.path) {
      setActiveFile(updated);
      activeFileRef.current = updated;
    }
    setFiles((prev) => prev.map((f) => (f.path === updated.path ? updated : f)));
  }, [settings.lonelogContextDepth]);

  const persistBody = useCallback((file: VaultFile, nextBody: string) => {
    if (pendingSaveRef.current && pendingSaveRef.current.file.path !== file.path) {
      void flushPendingSave();
    }
    pendingSaveRef.current = { file, body: nextBody };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushPendingSave(), 500);
  }, [flushPendingSave]);

  /** Drops a pending save for `path` without writing it — for when the note is about to be
   * deleted or overwritten, where a late write would resurrect or clobber it. */
  function discardPendingSave(path: string) {
    if (pendingSaveRef.current?.file.path !== path) return;
    window.clearTimeout(saveTimer.current);
    pendingSaveRef.current = null;
  }

  function handleBodyChange(next: string) {
    setBody(next);
    const file = activeFileRef.current;
    if (file) {
      persistBody(file, next);
    }
  }

  async function runNewNote(values: Record<string, string>) {
    setNewNoteOpen(false);
    if (!vaultPath) return;
    const sessionType: SessionType = values.session_type?.trim() === "one_shot" ? "one_shot" : "campaign";
    const today = todayIsoDate();
    const fm = {
      title: values.title?.trim(),
      pc_name: values.pc_name?.trim(),
      player: values.player?.trim(),
      ruleset: values.ruleset?.trim(),
      genre: values.genre?.trim(),
      tools: values.tools?.trim(),
      themes: values.themes?.trim(),
      tone: values.tone?.trim(),
      notes: values.notes?.trim(),
      session_type: sessionType,
      game_context: values.game_context?.trim() ?? "",
      oracle_mode: "yes-no" as const,
      scene_counter: 1,
      session_number: 1,
      start_date: today,
      last_update: today
    };
    const file = await createVaultFile(vaultPath, fm, "");
    const updated = await refreshFiles(vaultPath);
    const match = updated.find((f) => f.path === file.path) ?? file;
    selectFile(match);
  }

  async function runImportNote() {
    if (!vaultPath) return;
    const picked = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const imported = await importNoteFile(vaultPath, picked);
      const updated = await refreshFiles(vaultPath);
      const match = updated.find((f) => f.path === imported.path) ?? imported;
      selectFile(match);
      flashStatus(`Imported: ${match.name}`);
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function confirmDeleteNote() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target || !vaultPath) return;
    discardPendingSave(target.path);
    try {
      await deleteVaultFile(target.path);
      await deleteSnapshots(vaultPath, target.name).catch(() => {});
      if (activeFileRef.current?.path === target.path) {
        setActiveFile(null);
        activeFileRef.current = null;
        setBody("");
      }
      await refreshFiles(vaultPath);
      flashStatus(`Deleted: ${target.name}`);
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function cmdExportNote() {
    const file = activeFileRef.current;
    if (!file) return;
    const target = await save({
      defaultPath: file.name,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
    });
    if (!target) return;
    try {
      const currentBody = editorViewRef.current?.state.doc.toString() ?? body;
      await exportNoteTo(target, file.fm, currentBody);
      flashStatus(`Exported to ${target}`);
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function formatBold() {
    const view = editorViewRef.current;
    if (view) wrapSelection(view, "**", "**");
  }

  function formatItalic() {
    const view = editorViewRef.current;
    if (view) wrapSelection(view, "*", "*");
  }

  function formatCode() {
    const view = editorViewRef.current;
    if (view) wrapSelection(view, "`", "`");
  }

  function formatHeading(level: number) {
    const view = editorViewRef.current;
    if (view) setHeadingLevel(view, level);
  }

  function formatLink() {
    const view = editorViewRef.current;
    if (!view) return;
    openModal("Insert Link", [{ key: "url", label: "URL", placeholder: "https://..." }], (values) => {
      closeModal();
      const url = values.url?.trim();
      if (!url) return;
      wrapSelection(view, "[", `](${url})`);
    });
  }

  function formatStrikethrough() {
    const view = editorViewRef.current;
    if (view) wrapSelection(view, "~~", "~~");
  }

  function formatBlockquote() {
    const view = editorViewRef.current;
    if (view) togglePrefixLine(view, "> ");
  }

  function formatBulletList() {
    const view = editorViewRef.current;
    if (view) togglePrefixLine(view, "- ");
  }

  function formatNumberedList() {
    const view = editorViewRef.current;
    if (view) togglePrefixLine(view, "1. ");
  }

  function formatTaskList() {
    const view = editorViewRef.current;
    if (view) togglePrefixLine(view, "- [ ] ");
  }

  function formatImage() {
    const view = editorViewRef.current;
    if (!view) return;
    openModal("Insert Image", [{ key: "url", label: "Image URL", placeholder: "https://..." }], (values) => {
      closeModal();
      const url = values.url?.trim();
      if (!url) return;
      wrapSelection(view, "![", `](${url})`);
    });
  }

  function formatTable() {
    const view = editorViewRef.current;
    if (view) insertAtCursor(view, "| Header | Header |\n| --- | --- |\n| Cell | Cell |");
  }

  function formatHorizontalRule() {
    const view = editorViewRef.current;
    if (view) insertAtCursor(view, "---");
  }

  function formatFootnote() {
    const view = editorViewRef.current;
    if (view) insertFootnote(view);
  }

  function formatCodeBlock() {
    const view = editorViewRef.current;
    if (view) wrapSelection(view, "```\n", "\n```");
  }

  async function saveSettings(next: SybylSettings) {
    setSettings(next);
    // The keyring crate has no Android backend (it silently falls back to a no-op mock store),
    // so on Android the keys stay in the app-private settings store. Blanking them there, as on
    // desktop, would lose every API key on the next launch.
    if (isAndroid()) {
      await saveSetting("sybylSettings", next);
      return;
    }
    const toStore: SybylSettings = {
      ...next,
      providers: {
        ...next.providers,
        anthropic: { ...next.providers.anthropic, apiKey: "" },
        openai: { ...next.providers.openai, apiKey: "" },
        gemini: { ...next.providers.gemini, apiKey: "" }
      }
    };
    await saveSetting("sybylSettings", toStore);
    await Promise.all(
      KEYCHAIN_PROVIDERS.map((id) => keychainSet(id, next.providers[id].apiKey).catch(() => {}))
    );
  }

  function toggleTheme() {
    saveSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" });
  }

  function lonelogOpts(noWrap = false): LonelogFormatOptions {
    return { wrapInCodeBlock: !noWrap && (settings.lonelogWrapCodeBlock ?? true) };
  }

  /** Writes a frontmatter patch for the active file to disk and updates in-memory state. */
  async function updateActiveFrontmatter(patch: Partial<NoteFrontMatter>) {
    const file = activeFileRef.current;
    if (!file) return;
    const nextFm = { ...file.fm, ...patch };
    const currentBody = editorViewRef.current?.state.doc.toString() ?? body;
    await writeVaultFile(file.path, nextFm, currentBody);
    const updated: VaultFile = { ...file, fm: nextFm, body: currentBody };
    setActiveFile(updated);
    activeFileRef.current = updated;
    setFiles((prev) => prev.map((f) => (f.path === updated.path ? updated : f)));
  }

  function insertFormatted(formatted: string, placement: Placement): InsertedRange | null {
    const file = activeFileRef.current;
    const view = editorViewRef.current;
    if (view) {
      const range =
        placement === "below-selection"
          ? insertBelowSelection(view, formatted)
          : placement === "end-of-note"
          ? appendToNote(view, formatted)
          : insertAtCursor(view, formatted);
      const nextBody = view.state.doc.toString();
      setBody(nextBody);
      if (file) persistBody(file, nextBody);
      return range;
    } else if (file) {
      const nextBody = `${body}\n${formatted}\n`;
      setBody(nextBody);
      persistBody(file, nextBody);
    }
    return null;
  }

  /** Replaces a previously-inserted range in place (used by regenerateLast). Returns the new
   * range so a further regenerate can chain off of it. */
  function replaceFormatted(formatted: string, range: InsertedRange): InsertedRange | null {
    const file = activeFileRef.current;
    const view = editorViewRef.current;
    if (!view) return null;
    view.dispatch({ changes: { from: range.from, to: range.to, insert: formatted } });
    view.focus();
    const nextBody = view.state.doc.toString();
    setBody(nextBody);
    if (file) persistBody(file, nextBody);
    return { from: range.from, to: range.from + formatted.length };
  }

  /** Shows a status message until something replaces it (e.g. "generating..."). Also cancels any
   * pending flashStatus auto-clear, which would otherwise blank this message — and hide the
   * Cancel button with it — partway through a long generation. */
  function showStatus(text: string) {
    window.clearTimeout(statusTimer.current);
    setStatus(text);
  }

  function flashStatus(text: string, ms = 4000) {
    showStatus(text);
    statusTimer.current = window.setTimeout(() => setStatus(""), ms);
  }

  /** A note's own `provider:` frontmatter overrides the active provider from Settings (and its
   * `model:` overrides the model — see executeGeneration/runRawGeneration). */
  function providerIdFor(fm: NoteFrontMatter): ProviderID {
    return fm.provider ?? settings.activeProvider;
  }

  /** Generation is async and the user can switch notes while waiting; this keeps a result from
   * landing in whichever note happens to be open when it arrives. */
  function stillActive(file: VaultFile): boolean {
    if (activeFileRef.current?.path === file.path) return true;
    flashStatus(`Sybyl: you switched notes while generating, so the result for ${file.name} was discarded.`, 6000);
    return false;
  }

  /** Core pipeline shared by every LLM-backed command: frontmatter+body -> provider -> formatter ->
   * insert (or, for a regenerate, replace the previous output in place). */
  async function executeGeneration(args: {
    file: VaultFile;
    userMessage: string;
    format: (text: string, insideCodeBlock: boolean) => string;
    maxOutputTokens: number;
    placement: Placement;
    replaceRange: InsertedRange | null;
  }) {
    const { file, userMessage, format, maxOutputTokens, placement, replaceRange } = args;
    let succeeded = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    showStatus("Sybyl: generating...");
    try {
      const provider = getProvider(settings, providerIdFor(file.fm));
      const currentBody = editorViewRef.current?.state.doc.toString() ?? body;
      const request: GenerationRequest = {
        ...buildRequest(file.fm, userMessage, settings, maxOutputTokens, currentBody),
        model: file.fm.model
      };
      const response = await provider.generate(request, controller.signal);
      if (!stillActive(file)) return false;
      // Read after the await: the cursor may have moved while the request was in flight.
      const view = editorViewRef.current;
      const insideCodeBlock = view ? isInsideCodeBlock(view) : false;
      const formatted = format(response.text, insideCodeBlock);
      const range = replaceRange ? replaceFormatted(formatted, replaceRange) : insertFormatted(formatted, placement);
      setLastGeneration({ filePath: file.path, userMessage, format, maxOutputTokens, placement, insertedText: formatted, range });
      flashStatus("Sybyl: done.");
      succeeded = true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        flashStatus("Sybyl: cancelled.");
      } else {
        flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
    return succeeded;
  }

  /** Resolves true only if the generation completed and its output was inserted. */
  async function runGeneration(options: {
    userMessage: string;
    format: (text: string, insideCodeBlock: boolean) => string;
    maxOutputTokens?: number;
    placement?: Placement;
  }): Promise<boolean> {
    const file = activeFileRef.current;
    if (!file) return false;
    const { userMessage, format, maxOutputTokens = settings.defaultMaxOutputTokens, placement = "cursor" } = options;
    return executeGeneration({ file, userMessage, format, maxOutputTokens, placement, replaceRange: null });
  }

  /** Re-sends the last LLM-backed generation's exact request and swaps its output in place for a
   * fresh one — for when the result wasn't what you wanted. Falls back to inserting fresh (rather
   * than replacing) if the note has changed since, so it can never clobber unrelated edits: it
   * only replaces in place when the text at the tracked range still matches exactly what was
   * inserted last time. */
  function regenerateLast() {
    const file = activeFileRef.current;
    const last = lastGeneration;
    if (!file || !last || loading || last.filePath !== file.path) return;
    const view = editorViewRef.current;
    const replaceRange =
      last.range && view && view.state.sliceDoc(last.range.from, last.range.to) === last.insertedText
        ? last.range
        : null;
    void executeGeneration({
      file,
      userMessage: last.userMessage,
      format: last.format,
      maxOutputTokens: last.maxOutputTokens,
      placement: last.placement,
      replaceRange
    });
  }

  function cancelGeneration() {
    abortControllerRef.current?.abort();
  }

  /** Sibling to runGeneration for source-grounded commands: skips the Lonelog note-context injection
   * that buildRequest performs, but still resolves the system prompt and attaches resolvedSources. */
  async function runRawGeneration(options: {
    userMessage: string;
    maxOutputTokens: number;
    resolvedSources: GenerationRequest["resolvedSources"];
    onResult: (text: string) => Promise<void> | void;
  }) {
    const file = activeFileRef.current;
    if (!file) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    showStatus("Sybyl: generating...");
    try {
      const provider = getProvider(settings, providerIdFor(file.fm));
      const request: GenerationRequest = {
        systemPrompt: buildSystemPrompt(file.fm),
        userMessage: options.userMessage,
        resolvedSources: options.resolvedSources,
        temperature: file.fm.temperature ?? settings.defaultTemperature,
        maxOutputTokens: options.maxOutputTokens,
        model: file.fm.model
      };
      const response = await provider.generate(request, controller.signal);
      if (!stillActive(file)) return;
      await options.onResult(response.text);
      flashStatus("Sybyl: done.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        flashStatus("Sybyl: cancelled.");
      } else {
        flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function openModal(title: string, fields: PromptField[], onSubmit: (values: Record<string, string>) => void) {
    setActiveModal({ title, fields, onSubmit });
  }

  function openListPicker(title: string, items: ListPickerItem[], onPick: (id: string) => void) {
    setActiveListPicker({ title, items, onPick });
  }

  function closeListPicker() {
    setActiveListPicker(null);
  }

  function closeModal() {
    setActiveModal(null);
  }

  // ---- Commands ----

  // The play actions below are shared by the command-palette modals and the play composer. The
  // composer appends to the end of the log; the palette keeps inserting at the cursor.

  async function playAskOracle(question: string, oracleResult: string, placement: Placement = "cursor"): Promise<boolean> {
    const file = activeFileRef.current;
    const message = oracleResult
      ? `Oracle question: ${question}
Oracle result: ${oracleResult}
Interpret this result in the context of the scene. Third person, neutral, 2-3 lines.`
      : `Oracle question: ${question}
Oracle mode: ${file?.fm.oracle_mode ?? "yes-no"}
Run the oracle and give the result plus a 1-2 line neutral interpretation.`;
    return runGeneration({
      userMessage: message,
      placement,
      format: (text, insideCodeBlock) => {
        if (oracleResult) {
          return formatAskOracle(question, oracleResult, text, lonelogOpts(insideCodeBlock));
        }
        const parsed = parseLonelogOracleResponse(text);
        return formatAskOracle(question, parsed.result, parsed.interpretation, lonelogOpts(insideCodeBlock));
      }
    });
  }

  async function playStartScene(sceneDesc: string, placement: Placement = "cursor"): Promise<boolean> {
    const counter = activeFileRef.current?.fm.scene_counter ?? 1;
    const anchor = sceneDesc
      ? `the atmosphere and setting of: "${sceneDesc}"`
      : "a fitting location and atmosphere for the story so far, choosing one that makes sense given the established scene context";
    const inserted = await runGeneration({
      userMessage: `START SCENE. Generate only: 2-3 lines of third-person past-tense prose describing ${anchor}. No dialogue. No PC actions. No additional commentary.`,
      placement,
      format: (text) => formatStartScene(text, `S${counter}`, sceneDesc, lonelogOpts())
    });
    // A failed or cancelled generation inserted no scene header, so don't burn the number.
    if (inserted && settings.lonelogAutoIncScene) {
      await updateActiveFrontmatter({ scene_counter: counter + 1 });
    }
    return inserted;
  }

  async function playDeclareAction(action: string, roll: string, placement: Placement = "cursor"): Promise<boolean> {
    const rollLine = roll ? `
Roll result: ${roll}` : "";
    return runGeneration({
      userMessage: `PC action: ${action}${rollLine}
Describe only the consequences and world reaction. Do not describe the PC's action.`,
      placement,
      format: (text, insideCodeBlock) => formatDeclareAction(action, roll, text, lonelogOpts(insideCodeBlock))
    });
  }

  async function playInterpretOracle(oracle: string, placement: Placement = "below-selection"): Promise<boolean> {
    return runGeneration({
      userMessage: `Interpret this oracle result in the context of the current scene: "${oracle}"
Neutral, third-person, 2-3 lines. No dramatic language.`,
      format: (text, insideCodeBlock) => formatInterpretOracle(text, lonelogOpts(insideCodeBlock)),
      placement
    });
  }

  function cmdAskOracle() {
    openModal("Ask Oracle", ASK_ORACLE_FIELDS, async (values) => {
      closeModal();
      const question = values.question?.trim();
      if (!question) return;
      await playAskOracle(question, values.result?.trim() ?? "");
    });
  }

  function cmdStartScene() {
    openModal(
      "Start Scene",
      [{ key: "sceneDesc", label: "Scene description", optional: true, placeholder: "Leave blank to let Sybyl set the scene." }],
      async (values) => {
        closeModal();
        await playStartScene(values.sceneDesc?.trim() ?? "");
      }
    );
  }

  function cmdDeclareAction() {
    openModal(
      "Declare Action",
      [
        { key: "action", label: "Action" },
        { key: "roll", label: "Roll result", optional: true, placeholder: "Leave blank if there's no roll to report." }
      ],
      async (values) => {
        if (!values.action) return;
        closeModal();
        await playDeclareAction(values.action, values.roll?.trim() ?? "");
      }
    );
  }

  async function cmdInterpretOracle() {
    const view = editorViewRef.current;
    const selected = view ? getSelection(view) : "";
    if (selected) {
      await playInterpretOracle(selected);
      return;
    }
    openModal("Interpret Oracle Result", [{ key: "oracle", label: "Oracle result" }], async (values) => {
      const oracle = values.oracle?.trim();
      if (!oracle) return;
      closeModal();
      await playInterpretOracle(oracle);
    });
  }

  async function cmdExpandScene(placement: Placement = "cursor") {
    return runGeneration({
      placement,
      userMessage: "Expand the current scene into a prose passage. Third person, past tense, 100-150 words. No dialogue. Do not describe the PC's internal thoughts or decisions. Stay strictly within the established scene context.",
      format: (text) => formatExpandScene(text, lonelogOpts()),
      maxOutputTokens: 600
    });
  }

  function cmdAdventureSeed() {
    openModal(
      "Adventure Seed",
      [{ key: "concept", label: "Theme or concept", optional: true, placeholder: "Leave blank for a random seed." }],
      async (values) => {
        closeModal();
        const concept = values.concept?.trim();
        const prompt = `Generate an adventure seed for the current game.

Structure the output as:
- Premise: one sentence describing the situation
- Conflict: the central tension or threat
- Hook: the specific event that pulls the PC in
- Tone: the intended atmosphere

${concept ? `Theme/concept: ${concept}` : "Make it evocative and immediately playable."}
Keep it concise — 4 bullet points, one short sentence each.`;
        await runGeneration({
          userMessage: prompt,
          format: (text, insideCodeBlock) => formatAdventureSeed(text, lonelogOpts(insideCodeBlock)),
          maxOutputTokens: 800
        });
      }
    );
  }

  async function cmdWhatNow(placement: Placement = "cursor") {
    return runGeneration({
      placement,
      userMessage: "Based on the current scene context, suggest 1-2 possible consequences or complications. Present them as neutral options, not as narrative outcomes. Do not choose between them.",
      format: (text, insideCodeBlock) => formatSuggestConsequence(text, lonelogOpts(insideCodeBlock))
    });
  }

  async function cmdWhatCanIDo(placement: Placement = "cursor") {
    return runGeneration({
      placement,
      userMessage: "The player is stuck. Based on the current scene context, suggest exactly 3 concrete actions the PC could take next. Present them as neutral options numbered 1–3. Do not resolve or narrate any outcome. Do not recommend one over another.",
      format: (text, insideCodeBlock) => formatSuggestConsequence(text, lonelogOpts(insideCodeBlock))
    });
  }

  function cmdInsertCampaignHeader() {
    const fm = activeFileRef.current?.fm;
    if (!fm) return;
    const title = fm.title?.trim() || "Untitled Campaign";
    const block = `# ${title}\n\n## Session 1\n*Date: ${todayIsoDate()} | Duration: *\n\n### S1 *Starting scene*\n\n`;
    insertFormatted(block, "cursor");
  }

  function cmdNewSessionHeader() {
    openModal(
      "New Session Header",
      [
        { key: "date", label: "Date", defaultValue: todayIsoDate() },
        { key: "duration", label: "Duration", placeholder: "1h30" },
        { key: "recap", label: "Recap", optional: true }
      ],
      async (values) => {
        if (!values.date) return;
        closeModal();
        const sessionNumber = activeFileRef.current?.fm.session_number ?? 1;
        const block = `## Session ${sessionNumber}\n*Date: ${values.date} | Duration: ${values.duration || "-"}*\n\n${values.recap ? `**Recap:** ${values.recap}\n\n` : ""}`;
        insertFormatted(block, "cursor");
        await updateActiveFrontmatter({ session_number: sessionNumber + 1 });
      }
    );
  }

  function cmdEditCampaignInfo() {
    const fm = activeFileRef.current?.fm;
    if (!fm) return;
    const fields: PromptField[] = [
      { key: "title", label: "Campaign title", optional: true, defaultValue: fm.title },
      { key: "player", label: "Player", optional: true, defaultValue: fm.player },
      { key: "ruleset", label: "Ruleset", optional: true, placeholder: "Ironsworn", defaultValue: fm.ruleset },
      { key: "genre", label: "Genre", optional: true, defaultValue: fm.genre },
      { key: "start_date", label: "Start date", optional: true, defaultValue: fm.start_date },
      { key: "tools", label: "Tools", optional: true, defaultValue: fm.tools },
      { key: "themes", label: "Themes", optional: true, defaultValue: fm.themes },
      { key: "tone", label: "Tone", optional: true, defaultValue: fm.tone },
      { key: "notes", label: "Notes", optional: true, defaultValue: fm.notes },
      {
        key: "session_type",
        label: "Type",
        defaultValue: fm.session_type ?? "campaign",
        options: [
          { value: "campaign", label: "Campaign" },
          { value: "one_shot", label: "One-shot" }
        ]
      }
    ];
    openModal("Edit Campaign Info", fields, async (values) => {
      closeModal();
      const patch: Partial<NoteFrontMatter> = {};
      for (const key of CAMPAIGN_INFO_KEYS) {
        patch[key] = values[key]?.trim();
      }
      patch.session_type = values.session_type === "one_shot" ? "one_shot" : "campaign";
      await updateActiveFrontmatter(patch);
      flashStatus("Campaign info updated.");
    });
  }

  function cmdInsertQuickScene() {
    openModal(
      "Insert Scene Template",
      [{ key: "sceneDesc", label: "Scene description", optional: true, placeholder: "Dark alley, midnight" }],
      async (values) => {
        closeModal();
        const sceneDesc = values.sceneDesc?.trim() ?? "";
        const counter = activeFileRef.current?.fm.scene_counter ?? 1;
        // Scene titles are always Heading 3, and the trailing *...* is required by the scene
        // parser/highlighter's regex even with no description to show.
        const header = `### S${counter} *${sceneDesc}*`;
        const block = `${header}\n\n@ \nd: \n=> \n\n? \n-> \n=> \n`;
        insertFormatted(block, "cursor");
        if (settings.lonelogAutoIncScene) {
          await updateActiveFrontmatter({ scene_counter: counter + 1 });
        }
      }
    );
  }

  async function cmdAddSourceFile() {
    if (!vaultPath || !activeFileRef.current) return;
    const picked = await open({
      multiple: false,
      filters: [{ name: "Source", extensions: ["pdf", "txt", "md", "markdown"] }]
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const destPath = await importSourceFile(vaultPath, picked);
      const fileName = destPath.split(/[\\/]/).pop() ?? destPath;
      const ref: SourceRef = {
        label: fileName.replace(/\.[^.]+$/, ""),
        mime_type: inferMimeType(fileName),
        vault_path: destPath
      };
      const current = activeFileRef.current.fm.sources ?? [];
      const next = [...current.filter((s) => s.vault_path !== ref.vault_path), ref];
      await updateActiveFrontmatter({ sources: next });
      flashStatus(`Source added: ${ref.label}`);
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function cmdManageSources() {
    setSourceManagerOpen(true);
  }

  async function removeSource(ref: SourceRef) {
    const file = activeFileRef.current;
    if (!file) return;
    const next = (file.fm.sources ?? []).filter((s) => s.vault_path !== ref.vault_path);
    await updateActiveFrontmatter({ sources: next });
  }

  function pickSourceThen(noSourcesMessage: string, onPicked: (ref: SourceRef) => void) {
    const sources = activeFileRef.current?.fm.sources ?? [];
    if (!sources.length) {
      flashStatus(noSourcesMessage);
      return;
    }
    if (sources.length === 1) {
      onPicked(sources[0]);
      return;
    }
    openListPicker(
      "Choose a source",
      sources.map((s) => ({ id: s.vault_path, label: s.label, description: s.mime_type })),
      (id) => {
        closeListPicker();
        const ref = sources.find((s) => s.vault_path === id);
        if (ref) onPicked(ref);
      }
    );
  }

  // Both commands below prefer the already-digested `game_context` (fast, no per-request file
  // re-read — see cmdDigestSource) and only fall back to requiring a raw attached source when no
  // digest exists yet. `buildSystemPrompt` (used by runRawGeneration) already injects
  // `game_context` into every request automatically, so the game-context branch just needs to
  // skip the source picker rather than pass anything extra.

  function cmdAskTheRules() {
    const gameContext = activeFileRef.current?.fm.game_context?.trim();

    const ask = (resolvedSources: GenerationRequest["resolvedSources"]) => {
      openModal("Ask the Rules", [{ key: "question", label: "Question", placeholder: "How does Momentum work?" }], async (values) => {
        const question = values.question?.trim();
        if (!question) return;
        closeModal();
        const ruleset = activeFileRef.current?.fm.ruleset ?? "the game";
        const groundingInstruction = gameContext
          ? "using the game context and any provided source material"
          : "using only the provided source material";
        const prompt = `You are a rules reference for "${ruleset}".
Answer the following question ${groundingInstruction}.
Be precise and cite the relevant rule or page section if possible.

Question: ${question}`;
        await runRawGeneration({
          userMessage: prompt,
          maxOutputTokens: 1000,
          resolvedSources,
          onResult: (text) => { insertFormatted(`> [Rules] ${text.trim().replace(/\n/g, "\n> ")}`, "cursor"); }
        });
      });
    };

    if (gameContext) {
      ask([]);
      return;
    }
    pickSourceThen("No digested game context or sources attached. Use Digest Source into Game Context or Add Source File first.", (ref) => {
      (async () => {
        let resolvedSources;
        try {
          resolvedSources = await resolveSourcesForRequest([ref], providerIdFor(activeFileRef.current?.fm ?? {}));
        } catch (error) {
          flashStatus(`Cannot read source: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        ask(resolvedSources);
      })();
    });
  }

  function cmdGenerateCharacter() {
    const gameContext = activeFileRef.current?.fm.game_context?.trim();

    const generate = (resolvedSources: GenerationRequest["resolvedSources"]) => {
      openModal(
        "Generate Character",
        [{ key: "concept", label: "Character concept", optional: true, placeholder: "Leave blank for a random character." }],
        async (values) => {
          closeModal();
          const concept = values.concept?.trim();
          const ruleset = activeFileRef.current?.fm.ruleset ?? "the game";
          const formatInstruction = `Format the output as a Lonelog PC tag. Use the multi-line form for complex characters:
[PC:Name
  | stat: HP X, Stress Y
  | gear: item1, item2
  | trait: value1, value2
]
Include all stats and fields exactly as defined by the rules. Output the tag only — no extra commentary.`;
          const groundingInstruction = gameContext
            ? "Using the game context and any provided source material,"
            : "Using ONLY the character creation rules in the provided source material,";
          const prompt = `${groundingInstruction} generate a character for "${ruleset}".

Follow the exact character creation procedure described in the rules. Do not invent mechanics not present in the source.

${concept ? `Character concept: ${concept}` : "Generate a random character."}

${formatInstruction}`;
          await runRawGeneration({
            userMessage: prompt,
            maxOutputTokens: 1500,
            resolvedSources,
            onResult: (text) => { insertFormatted(text.trim(), "cursor"); }
          });
        }
      );
    };

    if (gameContext) {
      generate([]);
      return;
    }
    pickSourceThen("No digested game context or sources attached. Use Digest Source into Game Context or Add Source File first.", (ref) => {
      (async () => {
        let resolvedSources;
        try {
          resolvedSources = await resolveSourcesForRequest([ref], providerIdFor(activeFileRef.current?.fm ?? {}));
        } catch (error) {
          flashStatus(`Cannot read source: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        generate(resolvedSources);
      })();
    });
  }

  function cmdDigestSource() {
    pickSourceThen("No sources attached to this note. Use Add Source File first.", async (ref) => {
      let resolvedSources;
      try {
        resolvedSources = await resolveSourcesForRequest([ref], providerIdFor(activeFileRef.current?.fm ?? {}));
      } catch (error) {
        flashStatus(`Cannot read source: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      const ruleset = activeFileRef.current?.fm.ruleset ?? "the game";
      const digestPrompt = `Distill the following source material for use in a solo tabletop RPG session of "${ruleset}".

Extract and condense into a compact reference:
- Core rules and mechanics relevant to play
- Key factions, locations, characters, and world facts
- Tone, genre, and setting conventions
- Any tables, move lists, or random generators

Be concise and specific. Preserve game-mechanical details. Omit flavor prose and examples.`;
      await runRawGeneration({
        userMessage: digestPrompt,
        maxOutputTokens: 2000,
        resolvedSources,
        onResult: async (text) => updateActiveFrontmatter({ game_context: text })
      });
    });
  }

  async function cmdSaveSnapshot() {
    const file = activeFileRef.current;
    if (!vaultPath || !file) return;
    const currentBody = editorViewRef.current?.state.doc.toString() ?? body;
    await saveSnapshot(vaultPath, { ...file, body: currentBody });
    flashStatus("Snapshot saved.");
  }

  async function cmdVersionHistory() {
    const file = activeFileRef.current;
    if (!vaultPath || !file) return;
    const list = await listSnapshots(vaultPath, file.name);
    setSnapshots(list);
    setHistoryOpen(true);
  }

  /** Restores a snapshot's content into the active note. The note's own current state is saved
   * as a fresh snapshot first, so a restore is itself reversible from the same history list. */
  async function restoreSnapshot(snapshot: Snapshot) {
    const file = activeFileRef.current;
    if (!vaultPath || !file) return;
    setHistoryOpen(false);
    discardPendingSave(file.path);
    try {
      const currentBody = editorViewRef.current?.state.doc.toString() ?? body;
      await saveSnapshot(vaultPath, { ...file, body: currentBody });
      const restored = await readVaultFile(snapshot.path);
      const nextFm: NoteFrontMatter = { ...file.fm, ...restored.fm };
      await writeVaultFile(file.path, nextFm, restored.body);
      const updated: VaultFile = { ...file, fm: nextFm, body: restored.body };
      setActiveFile(updated);
      activeFileRef.current = updated;
      setBody(restored.body);
      setFiles((prev) => prev.map((f) => (f.path === updated.path ? updated : f)));
      flashStatus("Restored previous version.");
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function toolkitRollDice(expr: string): string | undefined {
    const result = rollExpression(expr);
    if (!result) {
      flashStatus(`Sybyl: couldn't parse dice expression "${expr}".`);
      return undefined;
    }
    return formatRollResult(result);
  }

  function toolkitDrawCard(): string | undefined {
    const session = deckSession ?? createDeckSession("standard");
    const { session: nextSession, card } = drawCard(session);
    setDeckSession(nextSession);
    return card;
  }

  function toolkitReshuffleDeck() {
    if (!deckSession) return;
    setDeckSession(reshuffleDeck(deckSession));
  }

  function toolkitSetDeckType(type: DeckType) {
    setDeckSession(createDeckSession(type));
  }

  function toolkitGenerateWord(categoryId: string): string | undefined {
    return generateWord(categoryId);
  }

  async function toolkitRollTable(path: string): Promise<string | undefined> {
    try {
      const content = await readTableFile(path);
      return rollTable(parseTableEntries(content));
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  function toolkitInsert(text: string) {
    if (!activeFileRef.current) return;
    insertFormatted(text, "cursor");
  }

  function toolkitAskOracle(likelihoodId: string): string | undefined {
    const result = askOracle(likelihoodId, oracleChaosFactor);
    if (!result) {
      flashStatus(`Sybyl: unknown oracle likelihood "${likelihoodId}".`);
      return undefined;
    }
    return formatOracleResult(result);
  }

  function toolkitSetCustomDeck(folder: DeckFolder) {
    (async () => {
      const session = await createCustomDeckSession(folder);
      if (!session) {
        flashStatus(`Sybyl: no images found in deck "${folder.name}".`);
        setCustomDeckSession(null);
        return;
      }
      setCustomDeckSession(session);
    })();
  }

  async function toolkitDrawCustomCard(): Promise<{ path: string; dataUri: string } | undefined> {
    if (!customDeckSession) return undefined;
    const { session, card } = drawCustomCard(customDeckSession);
    setCustomDeckSession(session);
    if (!card) return undefined;
    try {
      return { path: card, dataUri: await imageToDataUri(card) };
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  function toolkitReshuffleCustomDeck() {
    if (!customDeckSession) return;
    setCustomDeckSession(reshuffleCustomDeck(customDeckSession));
  }

  function toolkitCutUp(text: string, mode: CutUpMode): string | undefined {
    return cutUpText(text, mode);
  }

  async function toolkitLoadTableText(path: string): Promise<string | undefined> {
    try {
      return await readTableFile(path);
    } catch (error) {
      flashStatus(`Sybyl error: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /** The play composer appends to the end of the log (it's the "next line" of play); only a blank
   * Interpret works on the editor selection, and so inserts below it like the palette command. */
  async function handleComposerSubmit(intent: ComposerIntent): Promise<boolean> {
    if (!activeFileRef.current || loading) return false;
    switch (intent.mode) {
      case "oracle":
        return playAskOracle(intent.text, intent.detail, "end-of-note");
      case "action":
        return playDeclareAction(intent.text, intent.detail, "end-of-note");
      case "scene":
        return playStartScene(intent.text, "end-of-note");
      case "interpret": {
        if (intent.text) return playInterpretOracle(intent.text, "end-of-note");
        const view = editorViewRef.current;
        const selected = view ? getSelection(view) : "";
        return selected ? playInterpretOracle(selected) : false;
      }
    }
  }

  function editorHasSelection(): boolean {
    const view = editorViewRef.current;
    return !!view && getSelection(view) !== "";
  }

  /** Opens the side drawer on `tab`, or closes it if it's already showing that tab. */
  function toggleDrawer(tab: DrawerTab) {
    if (drawerOpen && drawerTab === tab) {
      setDrawerOpen(false);
    } else {
      setDrawerTab(tab);
      setDrawerOpen(true);
    }
  }

  const commands: CommandItem[] = [
    { id: "ask-oracle", label: "Ask Oracle", run: cmdAskOracle },
    { id: "start-scene", label: "Start Scene", run: cmdStartScene },
    { id: "declare-action", label: "Declare Action", run: cmdDeclareAction },
    { id: "interpret-oracle", label: "Interpret Oracle Roll", run: cmdInterpretOracle },
    { id: "expand-scene", label: "Expand Scene", run: () => void cmdExpandScene() },
    { id: "adventure-seed", label: "Adventure Seed", run: cmdAdventureSeed },
    { id: "what-now", label: "What Now", run: () => void cmdWhatNow() },
    { id: "what-can-i-do", label: "What Can I Do", run: () => void cmdWhatCanIDo() },
    { id: "insert-campaign-header", label: "Insert Campaign Header", run: cmdInsertCampaignHeader },
    { id: "new-session-header", label: "New Session Header", run: cmdNewSessionHeader },
    { id: "edit-campaign-info", label: "Edit Campaign Info", run: cmdEditCampaignInfo },
    { id: "insert-quick-scene", label: "Insert Scene Template", run: cmdInsertQuickScene },
    { id: "add-source-file", label: "Add Source File", run: cmdAddSourceFile },
    { id: "manage-sources", label: "Manage Sources", run: cmdManageSources },
    { id: "ask-the-rules", label: "Ask the Rules", run: cmdAskTheRules },
    { id: "generate-character", label: "Generate Character", run: cmdGenerateCharacter },
    { id: "digest-source", label: "Digest Source into Game Context", run: cmdDigestSource }
  ];

  function runCommand(cmd: CommandItem) {
    setPaletteOpen(false);
    if (!activeFile || loading) return;
    cmd.run();
  }

  return (
    <div className="app-shell">
      <Sidebar
        files={files}
        activePath={activeFile?.path ?? null}
        onSelect={selectFile}
        onChangeVault={handleChangeVault}
        onNewNote={() => setNewNoteOpen(true)}
        onImportNote={runImportNote}
        onExportNote={cmdExportNote}
        onSaveSnapshot={cmdSaveSnapshot}
        onVersionHistory={cmdVersionHistory}
        onDeleteNote={setDeleteTarget}
        vaultPath={vaultPath}
        version={version}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main-pane">
        <div className="command-bar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} title="Toggle vault sidebar">
            ☰
          </button>
          <span className="active-file-name">{activeFile ? activeFile.name : "No file open"}</span>
          <button
            className="command-menu-toggle"
            onClick={() => setCommandMenuOpen((v) => !v)}
            title="More actions"
          >
            ⋯
          </button>
          <div className={`command-bar-actions${commandMenuOpen ? " command-bar-actions-open" : ""}`}>
            <button
              className="theme-toggle"
              onClick={() => { toggleTheme(); setCommandMenuOpen(false); }}
              title={settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {settings.theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              disabled={!vaultPath}
              onClick={() => { setSwitcherOpen(true); setCommandMenuOpen(false); }}
              title="Search notes by name or content"
            >
              Search <span className="kbd-hint">Ctrl+O</span>
            </button>
            <button
              disabled={!activeFile || loading}
              onClick={() => { setPaletteOpen(true); setCommandMenuOpen(false); }}
            >
              Commands <span className="kbd-hint">Ctrl+K</span>
            </button>
            <button
              disabled={!vaultPath}
              className={drawerOpen && drawerTab === "toolkit" ? "active" : undefined}
              onClick={() => { toggleDrawer("toolkit"); setCommandMenuOpen(false); }}
            >
              Toolkit
            </button>
            <button
              disabled={!activeFile}
              className={drawerOpen && drawerTab === "dashboard" ? "active" : undefined}
              onClick={() => { toggleDrawer("dashboard"); setCommandMenuOpen(false); }}
              title="Open threads, clocks, and tracks for this campaign"
            >
              Dashboard
            </button>
            <button
              disabled={!activeFile}
              className={drawerOpen && drawerTab === "info" ? "active" : undefined}
              onClick={() => { toggleDrawer("info"); setCommandMenuOpen(false); }}
              title="Campaign info for this note"
            >
              Info
            </button>
            <button onClick={() => { setSettingsOpen(true); setCommandMenuOpen(false); }}>Settings</button>
            <button onClick={() => { setUserGuideOpen(true); setCommandMenuOpen(false); }} title="Open the User Guide">
              Help
            </button>
          </div>
        </div>
        {status && (
          <div className="status-bar">
            <span>{status}</span>
            {loading && (
              <button className="cancel-button" onClick={cancelGeneration}>Cancel</button>
            )}
            {!loading && lastGeneration && lastGeneration.filePath === activeFile?.path && (
              <button className="regenerate-button" onClick={regenerateLast} title="Re-run the last generation and replace its output">
                Regenerate
              </button>
            )}
          </div>
        )}
        <div className="workspace">
          <div className="editor-column">
            {activeFile ? (
              <>
                <FormatToolbar
                  onBold={formatBold}
                  onItalic={formatItalic}
                  onStrikethrough={formatStrikethrough}
                  onCode={formatCode}
                  onCodeBlock={formatCodeBlock}
                  onHeading={formatHeading}
                  onBlockquote={formatBlockquote}
                  onBulletList={formatBulletList}
                  onNumberedList={formatNumberedList}
                  onTaskList={formatTaskList}
                  onLink={formatLink}
                  onImage={formatImage}
                  onTable={formatTable}
                  onHorizontalRule={formatHorizontalRule}
                  onFootnote={formatFootnote}
                />
                <Editor value={body} onChange={handleBodyChange} theme={settings.theme} editorRef={editorViewRef} />
                <PlayComposer
                  ref={composerRef}
                  disabled={!activeFile}
                  loading={loading}
                  hasSelection={editorHasSelection}
                  onSubmit={handleComposerSubmit}
                  onExpandScene={() => void cmdExpandScene("end-of-note")}
                  onWhatNow={() => void cmdWhatNow("end-of-note")}
                  onWhatCanIDo={() => void cmdWhatCanIDo("end-of-note")}
                  onMoreCommands={() => setPaletteOpen(true)}
                />
              </>
            ) : (
              <div className="empty-state">
                {vaultPath ? "Select a file from the sidebar to begin." : "Choose a vault folder to get started."}
              </div>
            )}
          </div>
          <SideDrawer
            open={drawerOpen}
            tab={drawerTab}
            onTabChange={setDrawerTab}
            onClose={() => setDrawerOpen(false)}
            panes={[
              {
                id: "toolkit",
                label: "Toolkit",
                content: vaultPath ? (
                  <ToolkitPanel
                    deckSession={deckSession}
                    tableFiles={tableFiles}
                    canInsert={!!activeFile}
                    onRollDice={toolkitRollDice}
                    onDrawCard={toolkitDrawCard}
                    onReshuffleDeck={toolkitReshuffleDeck}
                    onSetDeckType={toolkitSetDeckType}
                    onGenerateWord={toolkitGenerateWord}
                    onRollTable={toolkitRollTable}
                    onRefreshTables={() => vaultPath && refreshTableFiles(vaultPath)}
                    onInsert={toolkitInsert}
                    chaosFactor={oracleChaosFactor}
                    onSetChaosFactor={setOracleChaosFactor}
                    onAskOracle={toolkitAskOracle}
                    deckFolders={deckFolders}
                    customDeckSession={customDeckSession}
                    onRefreshDeckFolders={() => vaultPath && refreshDeckFolders(vaultPath)}
                    onSetCustomDeck={toolkitSetCustomDeck}
                    onDrawCustomCard={toolkitDrawCustomCard}
                    onReshuffleCustomDeck={toolkitReshuffleCustomDeck}
                    onCutUp={toolkitCutUp}
                    onLoadTableText={toolkitLoadTableText}
                  />
                ) : null
              },
              { id: "dashboard", label: "Dashboard", content: activeFile ? <DashboardPanel body={body} /> : null },
              {
                id: "info",
                label: "Campaign Info",
                content: activeFile ? <CampaignInfoPanel fm={activeFile.fm} onEdit={cmdEditCampaignInfo} /> : null
              }
            ]}
          />
        </div>
      </main>

      {settingsOpen && (
        <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {newNoteOpen && (
        <PromptModal title="New Note" fields={NEW_NOTE_FIELDS} onSubmit={runNewNote} onCancel={() => setNewNoteOpen(false)} />
      )}
      {activeModal && (
        <PromptModal
          title={activeModal.title}
          fields={activeModal.fields}
          onSubmit={activeModal.onSubmit}
          onCancel={closeModal}
        />
      )}
      {paletteOpen && (
        <CommandPalette commands={commands} onRun={runCommand} onClose={() => setPaletteOpen(false)} />
      )}
      {switcherOpen && (
        <FileSwitcher
          files={files}
          onPick={(file) => {
            setSwitcherOpen(false);
            selectFile(file);
          }}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
      {activeListPicker && (
        <ListPickerModal
          title={activeListPicker.title}
          items={activeListPicker.items}
          onPick={activeListPicker.onPick}
          onClose={closeListPicker}
        />
      )}
      {sourceManagerOpen && (
        <SourceManagerModal
          sources={activeFile?.fm.sources ?? []}
          onRemove={removeSource}
          onClose={() => setSourceManagerOpen(false)}
        />
      )}
      {historyOpen && activeFile && (
        <VersionHistoryModal
          noteName={activeFile.name}
          snapshots={snapshots}
          onRestore={restoreSnapshot}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {userGuideOpen && <UserGuideModal onClose={() => setUserGuideOpen(false)} />}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Note"
          message={`Permanently delete "${deleteTarget.fm.pc_name || deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteNote}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
