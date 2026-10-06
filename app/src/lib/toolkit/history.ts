// The Toolkit's session log: every roll, draw and generated result, so a result isn't lost just
// because it wasn't inserted into a note. Session-only by design (kept in memory, never saved).

export interface ToolkitLogEntry {
  id: number;
  /** Which tool produced it: "Dice", "Oracle", "Cards", ... */
  tool: string;
  /** What was asked, when the result doesn't already say it (a table's name, a word category). */
  detail?: string;
  /** The result as the tool shows it. */
  text: string;
  /** False for results with no text form to put in a note (custom deck images). */
  insertable: boolean;
  at: Date;
}

/** Enough to scroll back through a long session, without growing unbounded. */
export const TOOLKIT_LOG_LIMIT = 200;

let nextId = 1;

/** Returns the log with `entry` added first (newest-first), dropping the oldest past the limit. */
export function addLogEntry(
  log: ToolkitLogEntry[],
  entry: Omit<ToolkitLogEntry, "id" | "at" | "insertable"> & { insertable?: boolean },
  at = new Date()
): ToolkitLogEntry[] {
  const added: ToolkitLogEntry = { insertable: true, ...entry, id: nextId++, at };
  return [added, ...log].slice(0, TOOLKIT_LOG_LIMIT);
}
