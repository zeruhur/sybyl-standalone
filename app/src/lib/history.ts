import { readDir, exists, mkdir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { joinPath, stringifyNote } from "./vault";
import { VaultFile } from "./types";

export interface Snapshot {
  path: string;
  date: Date;
}

const MAX_SNAPSHOTS_PER_NOTE = 40;
const AUTO_SNAPSHOT_MIN_GAP_MS = 10 * 60 * 1000;

function noteFolderName(noteName: string): string {
  return noteName.replace(/\.md$/i, "");
}

function historyDirFor(vaultPath: string, noteName: string): string {
  return joinPath(joinPath(vaultPath, ".history"), noteFolderName(noteName));
}

// ISO timestamps contain colons, which Windows filenames disallow. Encoding always produces the
// fixed shape "YYYY-MM-DDTHH-MM-SS.sssZ" (only the two time-of-day colons are swapped for
// hyphens), so decoding can reverse it with one anchored regex rather than guessing.
export function encodeTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-");
}

export function decodeTimestamp(encoded: string): Date {
  const match = encoded.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}\.\d{3}Z)$/);
  if (!match) return new Date(NaN);
  return new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}`);
}

/** Newest-first list of snapshots stored for a given note. */
export async function listSnapshots(vaultPath: string, noteName: string): Promise<Snapshot[]> {
  const dir = historyDirFor(vaultPath, noteName);
  if (!(await exists(dir))) return [];
  const entries = await readDir(dir);
  const snapshots = entries
    .filter((e) => !e.isDirectory && e.name?.toLowerCase().endsWith(".md"))
    .map((e) => ({ path: joinPath(dir, e.name!), date: decodeTimestamp(e.name!.replace(/\.md$/i, "")) }))
    .filter((s) => !Number.isNaN(s.date.getTime()));
  return snapshots.sort((a, b) => b.date.getTime() - a.date.getTime());
}

async function pruneSnapshots(vaultPath: string, noteName: string): Promise<void> {
  const snapshots = await listSnapshots(vaultPath, noteName);
  const overflow = snapshots.slice(MAX_SNAPSHOTS_PER_NOTE);
  await Promise.all(overflow.map((s) => remove(s.path).catch(() => {})));
}

/** Writes the given note state as a new snapshot, then prunes the oldest ones past
 * MAX_SNAPSHOTS_PER_NOTE so history can't grow unbounded. */
export async function saveSnapshot(vaultPath: string, file: VaultFile): Promise<void> {
  const dir = historyDirFor(vaultPath, file.name);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const path = joinPath(dir, `${encodeTimestamp(new Date())}.md`);
  await writeTextFile(path, stringifyNote(file.fm, file.body));
  await pruneSnapshots(vaultPath, file.name);
}

/** Auto-snapshot on note open, throttled so re-opening the same note repeatedly doesn't spam
 * near-identical snapshots — only takes one if the most recent is older than the throttle gap. */
export async function maybeAutoSnapshot(vaultPath: string, file: VaultFile): Promise<void> {
  const snapshots = await listSnapshots(vaultPath, file.name);
  const latest = snapshots[0];
  if (latest && Date.now() - latest.date.getTime() < AUTO_SNAPSHOT_MIN_GAP_MS) return;
  await saveSnapshot(vaultPath, file);
}

/** Removes all stored snapshots for a note — called when the note itself is deleted, so history
 * doesn't accumulate orphaned folders. */
export async function deleteSnapshots(vaultPath: string, noteName: string): Promise<void> {
  const dir = historyDirFor(vaultPath, noteName);
  if (await exists(dir)) {
    await remove(dir, { recursive: true });
  }
}
