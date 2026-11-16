/** Tables defined inside a log (Lonelog v1.7 §4.3.1 inline definitions, §4.3.2 filtered option
 * sets), so the Toolkit can roll on them:
 *
 *   tbl: Forest Encounter (d6)          tbl: Mood [Tense, Hopeful, Uncanny]
 *     1-2: Nothing — eerie silence      tbl: NPC Role (d6) [Guard, Merchant, Scholar, ...]
 *     3: Animal tracks, fresh
 *
 * A `tbl:` line with `->` is a result, not a definition, and a block whose indented lines aren't
 * numbered entries (the `Axis: -> result` lines of a multi-line result, §4.3.3) isn't a table.
 * Pure: no I/O, so it can run on the editor's text on every change. */

import { DICE_TOKEN_REGEX } from "./diceNotation";
import { formatRollResult, rollExpression } from "../toolkit/diceEngine";

export interface InlineTableEntry {
  from: number;
  to: number;
  text: string;
}

export interface InlineTable {
  name: string;
  /** The die named in the definition (`d6`, `2d6`, `d66`), if any. */
  die?: string;
  /** Numbered entries; for a filtered set, numbered 1, 2, 3… in the order written. */
  entries: InlineTableEntry[];
  /** A filtered option set (`[A, B, C]`) rather than a numbered table. */
  isList: boolean;
}

const HEADER = /^tbl:\s*(.+?)\s*(?:\(([^)]*)\))?\s*(?:\[([^\]]*)\])?\s*$/;
const ENTRY = /^\s+(\d+)(?:\s*[-–]\s*(\d+))?\s*:\s*(.+?)\s*$/;

function dieIn(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = new RegExp(DICE_TOKEN_REGEX.source).exec(text);
  return match?.[0];
}

/** Every table defined in `body`, by name; a later definition replaces an earlier one. */
export function parseInlineTables(body: string): InlineTable[] {
  const lines = body.split(/\r?\n/);
  const tables = new Map<string, InlineTable>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("tbl:") || line.includes("->")) continue;
    const header = HEADER.exec(line);
    if (!header) continue;
    const name = header[1].trim();
    const die = dieIn(header[2]);
    if (header[3] !== undefined) {
      const options = header[3].split(",").map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) continue;
      const entries = options.map((text, n) => ({ from: n + 1, to: n + 1, text }));
      tables.set(name.toLowerCase(), { name, die, entries, isList: true });
      continue;
    }
    const entries: InlineTableEntry[] = [];
    while (i + 1 < lines.length) {
      const entry = ENTRY.exec(lines[i + 1]);
      if (!entry) break;
      const from = Number(entry[1]);
      entries.push({ from, to: entry[2] ? Number(entry[2]) : from, text: entry[3] });
      i++;
    }
    if (entries.length > 0) tables.set(name.toLowerCase(), { name, die, entries, isList: false });
  }
  return [...tables.values()];
}

/** Rolls a table's die, returning the total and how it's written (`d6=5`, `d66=34`). */
function rollDie(die: string): { value: number; text: string } | undefined {
  if (die.toLowerCase() === "d66") {
    // A d66 is two d6 read as tens and units, not a 66-sided die.
    const tens = 1 + Math.floor(Math.random() * 6);
    const units = 1 + Math.floor(Math.random() * 6);
    const value = tens * 10 + units;
    return { value, text: `d66=${value}` };
  }
  const result = rollExpression(die);
  if (!result || result.isPool || result.total === undefined) return undefined;
  return { value: result.total, text: formatRollResult(result) };
}

export interface InlineTableRoll {
  /** The roll as written, absent when the pick wasn't made with a die. */
  roll?: string;
  /** The entry, or undefined when the roll landed on a number no entry covers. */
  result?: string;
  /** The finished Lonelog line: `tbl: Forest Encounter d6=5 -> Traveler on the road`. */
  line?: string;
  value?: number;
}

/** Rolls on a table: with its die if it names one, otherwise picking an entry at random. */
export function rollInlineTable(table: InlineTable): InlineTableRoll {
  if (table.die) {
    const rolled = rollDie(table.die);
    if (rolled) {
      const entry = table.entries.find((e) => rolled.value >= e.from && rolled.value <= e.to);
      if (!entry) return { roll: rolled.text, value: rolled.value };
      return { roll: rolled.text, value: rolled.value, result: entry.text, line: `tbl: ${table.name} ${rolled.text} -> ${entry.text}` };
    }
  }
  const entry = table.entries[Math.floor(Math.random() * table.entries.length)];
  return { result: entry.text, line: `tbl: ${table.name} -> ${entry.text}` };
}

/** A vault table file's name as a table name: `forest_encounters.md` → `forest encounters`. */
export function tableDisplayName(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt)$/i, "").replace(/[_]+/g, " ").trim();
}
