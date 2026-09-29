// Parsing for the play composer (PlayComposer.tsx): a single input line under the editor whose
// leading Lonelog symbol picks the play action, so `? Is the guard asleep?` asks the oracle and
// `@ Pick the lock` declares an action without going through the command palette and a modal.

export type ComposerMode = "oracle" | "action" | "scene" | "interpret";

export interface ComposerIntent {
  mode: ComposerMode;
  /** The oracle question, the action, the scene description, or the oracle result to interpret. */
  text: string;
  /** Oracle: a result the player already rolled (`? question -> result`). Action: a roll result
   * (`@ action d: 2d6=8`). Empty when not given. */
  detail: string;
}

/** Leading symbols, longest first so `->` wins over any shorter prefix. `?` and `@` are the
 * Lonelog question/action beats; `->` is the oracle-result beat, so it means "interpret this". */
const PREFIXES: { prefix: string; mode: ComposerMode }[] = [
  { prefix: "->", mode: "interpret" },
  { prefix: "?", mode: "oracle" },
  { prefix: "@", mode: "action" }
];

/** The mode a leading prefix selects, or null if the text has none (the chip-selected mode applies). */
export function detectPrefixMode(raw: string): ComposerMode | null {
  const trimmed = raw.trimStart();
  return PREFIXES.find(({ prefix }) => trimmed.startsWith(prefix))?.mode ?? null;
}

function stripPrefix(raw: string): string {
  const trimmed = raw.trimStart();
  const match = PREFIXES.find(({ prefix }) => trimmed.startsWith(prefix));
  return (match ? trimmed.slice(match.prefix.length) : trimmed).trim();
}

/** Splits `left <sep> right` on the first separator; right is "" when the separator is absent. */
function splitOn(text: string, separator: RegExp): [string, string] {
  const match = separator.exec(text);
  if (!match) return [text.trim(), ""];
  return [text.slice(0, match.index).trim(), text.slice(match.index + match[0].length).trim()];
}

export function parseComposerInput(raw: string, fallbackMode: ComposerMode): ComposerIntent {
  const mode = detectPrefixMode(raw) ?? fallbackMode;
  const body = stripPrefix(raw);
  if (mode === "oracle") {
    const [question, result] = splitOn(body, /\s*->\s*/);
    return { mode, text: question, detail: result };
  }
  if (mode === "action") {
    const [action, roll] = splitOn(body, /\s+d:(?=[\s\d])\s*/);
    return { mode, text: action, detail: roll };
  }
  return { mode, text: body, detail: "" };
}

/** Whether an intent has enough to send. A scene may be blank (Sybyl picks the setting); an
 * interpretation may be blank if there's an editor selection to interpret instead. */
export function composerIntentReady(intent: ComposerIntent, hasSelection: boolean): boolean {
  if (intent.mode === "scene") return true;
  if (intent.mode === "interpret") return intent.text !== "" || hasSelection;
  return intent.text !== "";
}
