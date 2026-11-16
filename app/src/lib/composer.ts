// Parsing for the play composer (PlayComposer.tsx): a single input line under the editor whose
// leading Lonelog symbol picks the play action, so `? Is the guard asleep?` asks the oracle and
// `@ Pick the lock` declares an action without going through the command palette and a modal.

import { DICE_TOKEN_REGEX } from "./lonelog/diceNotation";
import { formatRollResult, rollExpression } from "./toolkit/diceEngine";

/** oracle/action/scene/interpret call the AI. roll (`d:`), table (`tbl:`) and consequence (`=>`)
 * only log the line, so a player can record their own beats without leaving the composer. */
export type ComposerMode = "oracle" | "action" | "scene" | "interpret" | "roll" | "table" | "consequence";

const LOG_PREFIX: Partial<Record<ComposerMode, string>> = { roll: "d:", table: "tbl:", consequence: "=>" };

export function isLogMode(mode: ComposerMode): boolean {
  return mode in LOG_PREFIX;
}

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
  { prefix: "tbl:", mode: "table" },
  { prefix: "->", mode: "interpret" },
  { prefix: "=>", mode: "consequence" },
  { prefix: "d:", mode: "roll" },
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
/** Rolls the first dice expression on a `d:`/`tbl:` line that has no result yet, writing the total
 * in place: `Strike 2d6+2 vs 8` becomes `Strike 2d6+2=9 vs 8` (`5d10>=7 =3` for a pool, per the
 * dice add-on's spacing rule). A line that already records a result is left alone. */
export function rollLogText(text: string): string {
  const regex = new RegExp(DICE_TOKEN_REGEX.source, "g");
  const match = regex.exec(text);
  if (!match) return text;
  const after = text.slice(match.index + match[0].length);
  if (/^\s*(?:\[[^\]]*\])?\s*=/.test(after)) return text;
  const result = rollExpression(match[0]);
  if (!result) return text;
  return text.slice(0, match.index) + formatRollResult(result) + after;
}

/** The Lonelog line a log-mode intent records. */
export function buildLogLine(intent: ComposerIntent): string {
  const prefix = LOG_PREFIX[intent.mode] ?? "";
  const text = intent.mode === "consequence" ? intent.text : rollLogText(intent.text);
  return `${prefix} ${text}`;
}

/** Where to put a logged line at the end of the note. If the note ends inside a fenced code block
 * (the default way Sybyl writes notation), the line joins that block instead of opening a new one
 * per line; otherwise it gets its own block when `wrapInCodeBlock` is on. */
export function appendLogLine(doc: string, line: string, wrapInCodeBlock: boolean): { from: number; to: number; insert: string } {
  const closing = /(^|\n)```[ \t]*\s*$/.exec(doc);
  const fences = (doc.match(/^```/gm) ?? []).length;
  if (closing && fences % 2 === 0) {
    const at = closing.index + closing[1].length;
    return { from: at, to: at, insert: `${line}\n` };
  }
  const sep = doc === "" || doc.endsWith("\n\n") ? "" : doc.endsWith("\n") ? "\n" : "\n\n";
  const block = wrapInCodeBlock ? `\`\`\`\n${line}\n\`\`\`\n` : `${line}\n`;
  return { from: doc.length, to: doc.length, insert: sep + block };
}

export function composerIntentReady(intent: ComposerIntent, hasSelection: boolean): boolean {
  if (intent.mode === "scene") return true;
  if (intent.mode === "interpret") return intent.text !== "" || hasSelection;
  return intent.text !== "";
}
