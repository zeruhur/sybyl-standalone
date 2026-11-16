// Saves a note's Toolkit card deck (draw pile and discard pile) so a campaign's shuffled deck
// survives a restart. Kept in a small hidden file per note, `<vault>/.deck-state/<note>.json`, the
// same way snapshots live in `.history/`, rather than in the frontmatter, where up to 78 card
// tokens would clutter the YAML a user sees in any other editor.

import { exists, mkdir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { baseDeck, DeckSession, DeckType } from "./cardEngine";
import { CustomDeckSession, DeckFolder, listDeckImages } from "./customDeckEngine";

const DECK_TYPES: DeckType[] = ["standard", "standard-jokers", "tarot"];
const STATE_DIR = ".deck-state";

function join(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export function deckStatePath(vaultPath: string, noteName: string): string {
  return join(join(vaultPath, STATE_DIR), `${noteName.replace(/\.md$/i, "")}.json`);
}

export function serializeDeck(session: DeckSession): string {
  return JSON.stringify({ type: session.type, drawPile: session.drawPile, discardPile: session.discardPile }, null, 2);
}

/** Parses a saved deck, or returns null if it isn't a complete, valid one: an unknown type, or
 * piles that aren't exactly that deck's cards (a hand-edited or damaged file). A null means the
 * note starts a fresh deck instead of drawing from a broken one. */
export function parseDeck(raw: string): DeckSession | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { type, drawPile, discardPile } = data as Record<string, unknown>;
  if (!DECK_TYPES.includes(type as DeckType)) return null;
  const isCards = (pile: unknown): pile is string[] => Array.isArray(pile) && pile.every((c) => typeof c === "string");
  if (!isCards(drawPile) || !isCards(discardPile)) return null;
  const expected = [...baseDeck(type as DeckType)].sort();
  const actual = [...drawPile, ...discardPile].sort();
  if (actual.length !== expected.length || actual.some((card, i) => card !== expected[i])) return null;
  return { type: type as DeckType, drawPile, discardPile };
}

/** The note's saved deck, or null if it has none (or an unusable one). */
export async function loadDeckState(vaultPath: string, noteName: string): Promise<DeckSession | null> {
  const path = deckStatePath(vaultPath, noteName);
  try {
    if (!(await exists(path))) return null;
    return parseDeck(await readTextFile(path));
  } catch {
    return null;
  }
}

// Saves to one file run in order, so quick successive draws can't land on disk out of order.
const saveQueue = new Map<string, Promise<void>>();

export function saveDeckState(vaultPath: string, noteName: string, session: DeckSession): Promise<void> {
  const path = deckStatePath(vaultPath, noteName);
  const previous = saveQueue.get(path) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const dir = join(vaultPath, STATE_DIR);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeTextFile(path, serializeDeck(session));
  });
  saveQueue.set(path, next);
  return next;
}

/** Removes a note's saved deck, when the note itself is deleted. */
export async function deleteDeckState(vaultPath: string, noteName: string): Promise<void> {
  for (const path of [deckStatePath(vaultPath, noteName), customDeckStatePath(vaultPath, noteName)]) {
    if (await exists(path)) await remove(path);
  }
}

// Custom image decks (customDeckEngine.ts) are saved the same way, in `<note>.custom.json`. Cards
// are stored by file name, so the state survives the vault moving; on load they're matched back to
// the deck folder's images, and a folder whose images changed starts a fresh deck instead.

export function customDeckStatePath(vaultPath: string, noteName: string): string {
  return join(join(vaultPath, STATE_DIR), `${noteName.replace(/\.md$/i, "")}.custom.json`);
}

const fileName = (path: string) => path.split(/[\/]/).pop() ?? path;

export function serializeCustomDeck(session: CustomDeckSession): string {
  return JSON.stringify(
    { deck: session.name, drawPile: session.drawPile.map(fileName), discardPile: session.discardPile.map(fileName) },
    null,
    2
  );
}

/** The saved deck matched against `folder`'s current images (full paths), or null if it isn't for
 * that folder or its cards aren't exactly those images. */
export function parseCustomDeck(raw: string, folder: DeckFolder, images: string[]): CustomDeckSession | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { deck, drawPile, discardPile } = data as Record<string, unknown>;
  const isNames = (pile: unknown): pile is string[] => Array.isArray(pile) && pile.every((c) => typeof c === "string");
  if (deck !== folder.name || !isNames(drawPile) || !isNames(discardPile)) return null;
  const byName = new Map(images.map((path) => [fileName(path), path]));
  const saved = [...drawPile, ...discardPile];
  if (saved.length !== byName.size || new Set(saved).size !== saved.length || saved.some((n) => !byName.has(n))) return null;
  return { name: folder.name, drawPile: drawPile.map((n) => byName.get(n)!), discardPile: discardPile.map((n) => byName.get(n)!) };
}

/** The note's saved custom deck, if its folder still exists with the same images. */
export async function loadCustomDeckState(vaultPath: string, noteName: string, folders: DeckFolder[]): Promise<CustomDeckSession | null> {
  const path = customDeckStatePath(vaultPath, noteName);
  try {
    if (!(await exists(path))) return null;
    const raw = await readTextFile(path);
    const name = (JSON.parse(raw) as { deck?: unknown }).deck;
    const folder = folders.find((f) => f.name === name);
    if (!folder) return null;
    return parseCustomDeck(raw, folder, await listDeckImages(folder));
  } catch {
    return null;
  }
}

export function saveCustomDeckState(vaultPath: string, noteName: string, session: CustomDeckSession | null): Promise<void> {
  const path = customDeckStatePath(vaultPath, noteName);
  const previous = saveQueue.get(path) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!session) {
      if (await exists(path)) await remove(path);
      return;
    }
    const dir = join(vaultPath, STATE_DIR);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeTextFile(path, serializeCustomDeck(session));
  });
  saveQueue.set(path, next);
  return next;
}
