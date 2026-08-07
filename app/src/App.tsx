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
import { createVaultFile, deleteVaultFile, exportNoteTo, getSavedVaultPath, importNoteFile, importSourceFile, initAndroidVault, isAndroid, listVaultFiles, loadSetting, pickVaultFolder, saveSetting, writeVaultFile } from "./lib/vault";
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
import { GenerationRequest, NoteFrontMatter, SessionType, SourceRef, SybylSettings, VaultFile } from "./lib/types";
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
import { appendToNote, getSelection, insertAtCursor, insertBelowSelection, insertFootnote, isInsideCodeBlock, setHeadingLevel, togglePrefixLine, wrapSelection } from "./lib/editorUtils";
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
  { key: "session_type", label: "Type (campaign / one_shot)", defaultValue: "campaign" },
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [activeListPicker, setActiveListPicker] = useState<ActiveListPicker | null>(null);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VaultFile | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [deckSession, setDeckSession] = useState<DeckSession | null>(null);
  const [tableFiles, setTableFiles] = useState<TableFile[]>([]);
  const [oracleChaosFactor, setOracleChaosFactor] = useState(5);
  const [deckFolders, setDeckFolders] = useState<DeckFolder[]>([]);
  const [customDeckSession, setCustomDeckSession] = useState<CustomDeckSession | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("");

  const editorViewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
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
        setPaletteOpen((open) => !open);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setSwitcherOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleChangeVault() {
    const picked = await pickVaultFolder();
    if (!picked) return;
    setVaultPath(picked);
    setActiveFile(null);
    setBody("");
    await refreshFiles(picked);
    await refreshTableFiles(picked);
    await refreshDeckFolders(picked);
  }

  function selectFile(file: VaultFile) {
    setActiveFile(file);
    setBody(file.body);
  }

  const persistBody = useCallback((path: string, nextBody: string) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const file = activeFileRef.current;
      if (!file || file.path !== path) return;
      const nextFm: NoteFrontMatter = { ...file.fm, ...compileFrontmatter(nextBody, settings.lonelogContextDepth) };
      await writeVaultFile(path, nextFm, nextBody);
      const updated: VaultFile = { ...file, fm: nextFm, body: nextBody };
      setActiveFile(updated);
      activeFileRef.current = updated;
      setFiles((prev) => prev.map((f) => (f.path === updated.path ? updated : f)));
    }, 500);
  }, [settings.lonelogContextDepth]);

  function handleBodyChange(next: string) {
    setBody(next);
    if (activeFile) {
      persistBody(activeFile.path, next);
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
    try {
      await deleteVaultFile(target.path);
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

  function insertFormatted(formatted: string, placement: Placement) {
    const file = activeFileRef.current;
    const view = editorViewRef.current;
    if (view) {
      if (placement === "below-selection") insertBelowSelection(view, formatted);
      else if (placement === "end-of-note") appendToNote(view, formatted);
      else insertAtCursor(view, formatted);
      const nextBody = view.state.doc.toString();
      setBody(nextBody);
      if (file) persistBody(file.path, nextBody);
    } else if (file) {
      const nextBody = `${body}\n${formatted}\n`;
      setBody(nextBody);
      persistBody(file.path, nextBody);
    }
  }

  function flashStatus(text: string, ms = 4000) {
    setStatus(text);
    window.setTimeout(() => setStatus(""), ms);
  }

  /** Core pipeline shared by every LLM-backed command: frontmatter+body -> provider -> formatter -> insert. */
  async function runGeneration(options: {
    userMessage: string;
    format: (text: string, insideCodeBlock: boolean) => string;
    maxOutputTokens?: number;
    placement?: Placement;
  }) {
    const file = activeFileRef.current;
    if (!file) return;
    const { userMessage, format, maxOutputTokens = settings.defaultMaxOutputTokens, placement = "cursor" } = options;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setStatus("Sybyl: generating...");
    try {
      const provider = getProvider(settings);
      const view = editorViewRef.current;
      const currentBody = view?.state.doc.toString() ?? body;
      const insideCodeBlock = view ? isInsideCodeBlock(view) : false;
      const request = buildRequest(file.fm, userMessage, settings, maxOutputTokens, currentBody);
      const response = await provider.generate(request, controller.signal);
      const formatted = format(response.text, insideCodeBlock);
      insertFormatted(formatted, placement);
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
    setStatus("Sybyl: generating...");
    try {
      const provider = getProvider(settings);
      const request: GenerationRequest = {
        systemPrompt: buildSystemPrompt(file.fm),
        userMessage: options.userMessage,
        resolvedSources: options.resolvedSources,
        temperature: file.fm.temperature ?? settings.defaultTemperature,
        maxOutputTokens: options.maxOutputTokens
      };
      const response = await provider.generate(request, controller.signal);
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

  function cmdAskOracle() {
    openModal("Ask Oracle", ASK_ORACLE_FIELDS, async (values) => {
      closeModal();
      const question = values.question?.trim();
      if (!question) return;
      const oracleResult = values.result?.trim();
      const file = activeFileRef.current;
      const message = oracleResult
        ? `Oracle question: ${question}\nOracle result: ${oracleResult}\nInterpret this result in the context of the scene. Third person, neutral, 2-3 lines.`
        : `Oracle question: ${question}\nOracle mode: ${file?.fm.oracle_mode ?? "yes-no"}\nRun the oracle and give the result plus a 1-2 line neutral interpretation.`;
      await runGeneration({
        userMessage: message,
        format: (text, insideCodeBlock) => {
          if (oracleResult) {
            return formatAskOracle(question, oracleResult, text, lonelogOpts(insideCodeBlock));
          }
          const parsed = parseLonelogOracleResponse(text);
          return formatAskOracle(question, parsed.result, parsed.interpretation, lonelogOpts(insideCodeBlock));
        }
      });
    });
  }

  function cmdStartScene() {
    openModal(
      "Start Scene",
      [{ key: "sceneDesc", label: "Scene description", optional: true, placeholder: "Leave blank to let Sybyl set the scene." }],
      async (values) => {
        closeModal();
        const sceneDesc = values.sceneDesc?.trim() ?? "";
        const counter = activeFileRef.current?.fm.scene_counter ?? 1;
        const anchor = sceneDesc
          ? `the atmosphere and setting of: "${sceneDesc}"`
          : "a fitting location and atmosphere for the story so far, choosing one that makes sense given the established scene context";
        await runGeneration({
          userMessage: `START SCENE. Generate only: 2-3 lines of third-person past-tense prose describing ${anchor}. No dialogue. No PC actions. No additional commentary.`,
          format: (text) => formatStartScene(text, `S${counter}`, sceneDesc, lonelogOpts())
        });
        if (settings.lonelogAutoIncScene) {
          await updateActiveFrontmatter({ scene_counter: counter + 1 });
        }
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
        const roll = values.roll?.trim() ?? "";
        const rollLine = roll ? `\nRoll result: ${roll}` : "";
        await runGeneration({
          userMessage: `PC action: ${values.action}${rollLine}\nDescribe only the consequences and world reaction. Do not describe the PC's action.`,
          format: (text, insideCodeBlock) => formatDeclareAction(values.action, roll, text, lonelogOpts(insideCodeBlock))
        });
      }
    );
  }

  async function cmdInterpretOracle() {
    const view = editorViewRef.current;
    const selected = view ? getSelection(view) : "";
    if (selected) {
      await runGeneration({
        userMessage: `Interpret this oracle result in the context of the current scene: "${selected}"\nNeutral, third-person, 2-3 lines. No dramatic language.`,
        format: (text, insideCodeBlock) => formatInterpretOracle(text, lonelogOpts(insideCodeBlock)),
        placement: "below-selection"
      });
      return;
    }
    openModal("Interpret Oracle Result", [{ key: "oracle", label: "Oracle result" }], async (values) => {
      const oracle = values.oracle?.trim();
      if (!oracle) return;
      closeModal();
      await runGeneration({
        userMessage: `Interpret this oracle result in the context of the current scene: "${oracle}"\nNeutral, third-person, 2-3 lines. No dramatic language.`,
        format: (text, insideCodeBlock) => formatInterpretOracle(text, lonelogOpts(insideCodeBlock)),
        placement: "below-selection"
      });
    });
  }

  async function cmdExpandScene() {
    await runGeneration({
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

  async function cmdWhatNow() {
    await runGeneration({
      userMessage: "Based on the current scene context, suggest 1-2 possible consequences or complications. Present them as neutral options, not as narrative outcomes. Do not choose between them.",
      format: (text, insideCodeBlock) => formatSuggestConsequence(text, lonelogOpts(insideCodeBlock))
    });
  }

  async function cmdWhatCanIDo() {
    await runGeneration({
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
      { key: "notes", label: "Notes", optional: true, defaultValue: fm.notes }
    ];
    openModal("Edit Campaign Info", fields, async (values) => {
      closeModal();
      const patch: Partial<NoteFrontMatter> = {};
      for (const key of CAMPAIGN_INFO_KEYS) {
        patch[key] = values[key]?.trim();
      }
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
          onResult: (text) => insertFormatted(`> [Rules] ${text.trim().replace(/\n/g, "\n> ")}`, "cursor")
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
          resolvedSources = await resolveSourcesForRequest([ref], settings.activeProvider);
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
            onResult: (text) => insertFormatted(text.trim(), "cursor")
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
          resolvedSources = await resolveSourcesForRequest([ref], settings.activeProvider);
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
        resolvedSources = await resolveSourcesForRequest([ref], settings.activeProvider);
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
    return { path: card, dataUri: await imageToDataUri(card) };
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

  const commands: CommandItem[] = [
    { id: "ask-oracle", label: "Ask Oracle", run: cmdAskOracle },
    { id: "start-scene", label: "Start Scene", run: cmdStartScene },
    { id: "declare-action", label: "Declare Action", run: cmdDeclareAction },
    { id: "interpret-oracle", label: "Interpret Oracle Roll", run: cmdInterpretOracle },
    { id: "expand-scene", label: "Expand Scene", run: cmdExpandScene },
    { id: "adventure-seed", label: "Adventure Seed", run: cmdAdventureSeed },
    { id: "what-now", label: "What Now", run: cmdWhatNow },
    { id: "what-can-i-do", label: "What Can I Do", run: cmdWhatCanIDo },
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
          <div className="command-bar-actions">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {settings.theme === "dark" ? "☀" : "☾"}
            </button>
            <button disabled={!vaultPath} onClick={() => setSwitcherOpen(true)}>
              Switch <span className="kbd-hint">Ctrl+O</span>
            </button>
            <button disabled={!activeFile || loading} onClick={() => setPaletteOpen(true)}>
              Commands <span className="kbd-hint">Ctrl+K</span>
            </button>
            <button disabled={!vaultPath} onClick={() => setToolkitOpen((v) => !v)}>Toolkit</button>
            <button onClick={() => setSettingsOpen(true)}>Settings</button>
          </div>
        </div>
        {toolkitOpen && vaultPath && (
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
        )}
        {status && (
          <div className="status-bar">
            <span>{status}</span>
            {loading && (
              <button className="cancel-button" onClick={cancelGeneration}>Cancel</button>
            )}
          </div>
        )}
        {activeFile ? (
          <>
            <CampaignInfoPanel fm={activeFile.fm} />
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
          </>
        ) : (
          <div className="empty-state">
            {vaultPath ? "Select a file from the sidebar to begin." : "Choose a vault folder to get started."}
          </div>
        )}
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
