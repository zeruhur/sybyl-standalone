import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import Editor from "./components/Editor";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import PromptModal, { PromptField } from "./components/PromptModal";
import CommandPalette, { CommandItem } from "./components/CommandPalette";
import FileSwitcher from "./components/FileSwitcher";
import ListPickerModal, { ListPickerItem } from "./components/ListPickerModal";
import SourceManagerModal from "./components/SourceManagerModal";
import { createVaultFile, getSavedVaultPath, importSourceFile, listVaultFiles, loadSetting, pickVaultFolder, saveSetting, writeVaultFile } from "./lib/vault";
import { keychainGet, keychainSet } from "./lib/keychain";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/settings";
import { GenerationRequest, NoteFrontMatter, SessionType, SourceRef, SybylSettings, VaultFile } from "./lib/types";
import { buildRequest, buildSystemPrompt } from "./lib/promptBuilder";
import { getProvider } from "./lib/providers";
import { parseLonelogContext, serializeContext } from "./lib/lonelog/parser";
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
import { appendToNote, getSelection, insertAtCursor, insertBelowSelection, isInsideCodeBlock } from "./lib/editorUtils";
import "./App.css";

const NEW_NOTE_FIELDS: PromptField[] = [
  { key: "pc_name", label: "Character name", optional: true },
  { key: "ruleset", label: "Ruleset", optional: true, placeholder: "Ironsworn" },
  { key: "session_type", label: "Type (campaign / one_shot)", defaultValue: "campaign" },
  { key: "game_context", label: "Game context", optional: true }
];

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [activeListPicker, setActiveListPicker] = useState<ActiveListPicker | null>(null);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
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

  useEffect(() => {
    (async () => {
      const savedSettings = await loadSetting<SybylSettings>("sybylSettings");
      const normalized = normalizeSettings(savedSettings);
      for (const id of KEYCHAIN_PROVIDERS) {
        normalized.providers[id].apiKey = await migrateAndLoadApiKey(id, normalized.providers[id].apiKey);
      }
      setSettings(normalized);

      const saved = await getSavedVaultPath();
      if (saved) {
        setVaultPath(saved);
        await refreshFiles(saved);
      }
    })();
    getVersion().then(setVersion).catch(() => {});
  }, [refreshFiles]);

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
      await writeVaultFile(path, file.fm, nextBody);
    }, 500);
  }, []);

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
    const fm = {
      pc_name: values.pc_name?.trim(),
      ruleset: values.ruleset?.trim(),
      session_type: sessionType,
      game_context: values.game_context?.trim() ?? "",
      oracle_mode: "yes-no" as const,
      scene_counter: 1,
      session_number: 1
    };
    const file = await createVaultFile(vaultPath, fm, "");
    const updated = await refreshFiles(vaultPath);
    const match = updated.find((f) => f.path === file.path) ?? file;
    selectFile(match);
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
      [{ key: "sceneDesc", label: "Scene description", placeholder: "Dark alley, midnight" }],
      async (values) => {
        const sceneDesc = values.sceneDesc?.trim();
        if (!sceneDesc) return;
        closeModal();
        const counter = activeFileRef.current?.fm.scene_counter ?? 1;
        await runGeneration({
          userMessage: `START SCENE. Generate only: 2-3 lines of third-person past-tense prose describing the atmosphere and setting of: "${sceneDesc}". No dialogue. No PC actions. No additional commentary.`,
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
      [{ key: "action", label: "Action" }, { key: "roll", label: "Roll result" }],
      async (values) => {
        if (!values.action || !values.roll) return;
        closeModal();
        await runGeneration({
          userMessage: `PC action: ${values.action}\nRoll result: ${values.roll}\nDescribe only the consequences and world reaction. Do not describe the PC's action.`,
          format: (text, insideCodeBlock) => formatDeclareAction(values.action, values.roll, text, lonelogOpts(insideCodeBlock))
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

  async function cmdUpdateSceneContext() {
    const file = activeFileRef.current;
    if (!file) return;
    const currentBody = editorViewRef.current?.state.doc.toString() ?? body;
    const parsed = parseLonelogContext(currentBody, settings.lonelogContextDepth);
    await updateActiveFrontmatter({ scene_context: serializeContext(parsed) });
    flashStatus("Scene context updated from log.");
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

  function cmdAskTheRules() {
    pickSourceThen("No sources attached to this note. Use Add Source File first.", (ref) => {
      openModal("Ask the Rules", [{ key: "question", label: "Question", placeholder: "How does Momentum work?" }], async (values) => {
        const question = values.question?.trim();
        if (!question) return;
        closeModal();
        let resolvedSources;
        try {
          resolvedSources = await resolveSourcesForRequest([ref], settings.activeProvider);
        } catch (error) {
          flashStatus(`Cannot read source: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const ruleset = activeFileRef.current?.fm.ruleset ?? "the game";
        const prompt = `You are a rules reference for "${ruleset}".
Answer the following question using only the provided source material.
Be precise and cite the relevant rule or page section if possible.

Question: ${question}`;
        await runRawGeneration({
          userMessage: prompt,
          maxOutputTokens: 1000,
          resolvedSources,
          onResult: (text) => insertFormatted(`> [Rules] ${text.trim().replace(/\n/g, "\n> ")}`, "cursor")
        });
      });
    });
  }

  function cmdGenerateCharacter() {
    pickSourceThen("No sources attached to this note. Add a rulebook first via Add Source File.", (ref) => {
      openModal(
        "Generate Character",
        [{ key: "concept", label: "Character concept", optional: true, placeholder: "Leave blank for a random character." }],
        async (values) => {
          closeModal();
          const concept = values.concept?.trim();
          let resolvedSources;
          try {
            resolvedSources = await resolveSourcesForRequest([ref], settings.activeProvider);
          } catch (error) {
            flashStatus(`Cannot read source: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
          const ruleset = activeFileRef.current?.fm.ruleset ?? "the game";
          const formatInstruction = `Format the output as a Lonelog PC tag. Use the multi-line form for complex characters:
[PC:Name
  | stat: HP X, Stress Y
  | gear: item1, item2
  | trait: value1, value2
]
Include all stats and fields exactly as defined by the rules. Output the tag only — no extra commentary.`;
          const prompt = `Using ONLY the character creation rules in the provided source material, generate a character for "${ruleset}".

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

  const commands: CommandItem[] = [
    { id: "ask-oracle", label: "Ask Oracle", run: cmdAskOracle },
    { id: "start-scene", label: "Start Scene", run: cmdStartScene },
    { id: "declare-action", label: "Declare Action", run: cmdDeclareAction },
    { id: "interpret-oracle", label: "Interpret Oracle Roll", run: cmdInterpretOracle },
    { id: "expand-scene", label: "Expand Scene", run: cmdExpandScene },
    { id: "adventure-seed", label: "Adventure Seed", run: cmdAdventureSeed },
    { id: "what-now", label: "What Now", run: cmdWhatNow },
    { id: "what-can-i-do", label: "What Can I Do", run: cmdWhatCanIDo },
    { id: "update-scene-context", label: "Update Scene Context", run: cmdUpdateSceneContext },
    { id: "new-session-header", label: "New Session Header", run: cmdNewSessionHeader },
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
        vaultPath={vaultPath}
        version={version}
      />
      <main className="main-pane">
        <div className="command-bar">
          <span className="active-file-name">{activeFile ? activeFile.name : "No file open"}</span>
          <div className="command-bar-actions">
            <button disabled={!vaultPath} onClick={() => setSwitcherOpen(true)}>
              Switch <span className="kbd-hint">Ctrl+O</span>
            </button>
            <button disabled={!activeFile || loading} onClick={() => setPaletteOpen(true)}>
              Commands <span className="kbd-hint">Ctrl+K</span>
            </button>
            <button onClick={() => setSettingsOpen(true)}>Settings</button>
          </div>
        </div>
        {status && (
          <div className="status-bar">
            <span>{status}</span>
            {loading && (
              <button className="cancel-button" onClick={cancelGeneration}>Cancel</button>
            )}
          </div>
        )}
        {activeFile ? (
          <Editor value={body} onChange={handleBodyChange} editorRef={editorViewRef} />
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
    </div>
  );
}
