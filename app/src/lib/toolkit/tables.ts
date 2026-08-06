/** Custom random tables (features.md's solo-toolkit backlog item). Tables are plain-text
 * files in `<vault>/tables/`, one entry per line, with an optional trailing `^N` weight
 * (default 1). No table-authoring UI in this phase — users create files with their own
 * editor or Import Note. Deliberately scoped down from solo-toolkit's full table system:
 * no bell-curve distributions, no `{note/section}` cross-reference templates — neither has
 * a Lonelog spec basis to anchor a notation-compatible implementation. Cut-up mode lives in
 * cutup.ts; its "load from table" option reuses `readTableFile` from here. */

import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { joinPath } from "../vault";

export const TABLES_FOLDER = "tables";

export interface TableEntry {
  text: string;
  weight: number;
}

export interface TableFile {
  name: string;
  path: string;
}

const WEIGHT_SUFFIX = /\s*\^(\d+)\s*$/;

export function parseTableEntries(content: string): TableEntry[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const match = WEIGHT_SUFFIX.exec(line);
      if (!match) return { text: line, weight: 1 };
      return { text: line.slice(0, match.index).trim(), weight: parseInt(match[1], 10) || 1 };
    });
}

export function rollTable(entries: TableEntry[]): string | undefined {
  if (entries.length === 0) return undefined;
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.text;
  }
  return entries[entries.length - 1].text;
}

export async function listTableFiles(vaultPath: string): Promise<TableFile[]> {
  const dir = joinPath(vaultPath, TABLES_FOLDER);
  if (!(await exists(dir))) return [];
  const entries = await readDir(dir);
  return entries
    .filter((e) => !e.isDirectory && /\.(md|markdown|txt)$/i.test(e.name ?? ""))
    .map((e) => ({ name: e.name!, path: joinPath(dir, e.name!) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readTableFile(path: string): Promise<string> {
  return readTextFile(path);
}
