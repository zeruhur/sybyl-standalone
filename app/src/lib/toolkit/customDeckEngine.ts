/** Custom image-based decks (features.md's solo-toolkit backlog item). A "deck" is a folder
 * of image files under `<vault>/decks/<deckName>/` — no authoring UI, same "user creates the
 * folder themselves" convention as tables.ts. Draws are preview-only (rendered as a data: URI
 * thumbnail in the Toolkit panel); there's no Lonelog notation for an image draw, so unlike
 * cardEngine.ts's text-token decks, nothing here is ever inserted into a note. */

import { exists, readDir, readFile } from "@tauri-apps/plugin-fs";
import { joinPath } from "../vault";
import { arrayBufferToBase64 } from "../sourceUtils";
import { shuffle } from "./cardEngine";

export const DECKS_FOLDER = "decks";
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp)$/i;

export interface DeckFolder {
  name: string;
  path: string;
}

export interface CustomDeckSession {
  name: string;
  drawPile: string[];
  discardPile: string[];
}

export async function listDeckFolders(vaultPath: string): Promise<DeckFolder[]> {
  const dir = joinPath(vaultPath, DECKS_FOLDER);
  if (!(await exists(dir))) return [];
  const entries = await readDir(dir);
  return entries
    .filter((e) => e.isDirectory)
    .map((e) => ({ name: e.name!, path: joinPath(dir, e.name!) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns `undefined` if the folder contains no recognized image files. */
export async function createCustomDeckSession(folder: DeckFolder): Promise<CustomDeckSession | undefined> {
  const entries = await readDir(folder.path);
  const images = entries
    .filter((e) => !e.isDirectory && IMAGE_EXTENSIONS.test(e.name ?? ""))
    .map((e) => joinPath(folder.path, e.name!));
  if (images.length === 0) return undefined;
  return { name: folder.name, drawPile: shuffle(images), discardPile: [] };
}

export function reshuffleCustomDeck(session: CustomDeckSession): CustomDeckSession {
  return { name: session.name, drawPile: shuffle([...session.drawPile, ...session.discardPile]), discardPile: [] };
}

/** Draws one image path, auto-reshuffling the discard pile back in if the draw pile is empty
 * (mirrors cardEngine.ts's drawCard behavior). Returns `card: undefined` only when both piles
 * are empty. */
export function drawCustomCard(session: CustomDeckSession): { session: CustomDeckSession; card: string | undefined } {
  let working = session;
  if (working.drawPile.length === 0) {
    if (working.discardPile.length === 0) return { session: working, card: undefined };
    working = reshuffleCustomDeck(working);
  }
  const [card, ...rest] = working.drawPile;
  return {
    session: { name: working.name, drawPile: rest, discardPile: [...working.discardPile, card] },
    card
  };
}

function extensionOf(path: string): string {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "png";
}

/** Reads an image file and returns a `data:` URI for inline preview — no Tauri asset-protocol
 * config needed, since this stays entirely in-memory. */
export async function imageToDataUri(path: string): Promise<string> {
  const bytes = await readFile(path);
  const ext = extensionOf(path) === "jpg" ? "jpeg" : extensionOf(path);
  return `data:image/${ext};base64,${arrayBufferToBase64(bytes)}`;
}
