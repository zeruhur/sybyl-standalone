import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readDir, exists, readFile, writeFile, mkdir, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { load, Store } from "@tauri-apps/plugin-store";
import { Buffer } from "buffer";
import { NoteFrontMatter, VaultFile } from "./types";

// The dialog plugin's Android backend has no folder-picker implementation at all
// (only single/multi file pickers) — `open({ directory: true })` can never resolve
// there. Android vaults auto-initialize in the app's own data directory instead;
// see initAndroidVault() / isAndroid() below.
export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

// gray-matter unconditionally references the Node.js Buffer global, which doesn't
// exist in the Tauri webview. Polyfill it with the standard browser shim.
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

import matter from "gray-matter";

const STORE_FILE = "sybyl-settings.json";
let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE, { autoSave: true });
  }
  return storeInstance;
}

export async function pickVaultFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title: "Choose your Sybyl vault folder" });
  if (!selected || Array.isArray(selected)) return null;
  const store = await getStore();
  await store.set("vaultPath", selected);
  return selected;
}

export async function getSavedVaultPath(): Promise<string | null> {
  const store = await getStore();
  const path = await store.get<string>("vaultPath");
  if (path && (await exists(path))) {
    return path;
  }
  return null;
}

// Auto-initializes (or reopens) an app-private vault folder on Android, since there's no
// working folder picker on that platform (see isAndroid() above). Idempotent — safe to call
// on every launch.
export async function initAndroidVault(): Promise<string> {
  const vaultPath = await join(await appDataDir(), "vault");
  if (!(await exists(vaultPath))) {
    await mkdir(vaultPath, { recursive: true });
  }
  const store = await getStore();
  await store.set("vaultPath", vaultPath);
  return vaultPath;
}

export async function loadSetting<T>(key: string): Promise<T | undefined> {
  const store = await getStore();
  return store.get<T>(key);
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export async function listVaultFiles(vaultPath: string): Promise<VaultFile[]> {
  const entries = await readDir(vaultPath);
  const mdEntries = entries.filter((e) => !e.isDirectory && e.name?.toLowerCase().endsWith(".md"));
  const files: VaultFile[] = [];
  for (const entry of mdEntries) {
    const path = joinPath(vaultPath, entry.name!);
    try {
      const file = await readVaultFile(path);
      files.push(file);
    } catch {
      // skip unreadable file
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readVaultFile(path: string): Promise<VaultFile> {
  const raw = await readTextFile(path);
  const parsed = matter(raw);
  const name = path.split(/[\\/]/).pop() ?? path;
  return {
    path,
    name,
    fm: (parsed.data as NoteFrontMatter) ?? {},
    body: parsed.content
  };
}

function withoutUndefined(fm: NoteFrontMatter): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fm).filter(([, value]) => value !== undefined));
}

export function stringifyNote(fm: NoteFrontMatter, body: string): string {
  return matter.stringify(body, withoutUndefined(fm));
}

export async function writeVaultFile(path: string, fm: NoteFrontMatter, body: string): Promise<void> {
  await writeTextFile(path, stringifyNote(fm, body));
}

export async function deleteVaultFile(path: string): Promise<void> {
  await remove(path);
}

/** Writes the given frontmatter+body to an arbitrary path outside the vault. */
export async function exportNoteTo(path: string, fm: NoteFrontMatter, body: string): Promise<void> {
  await writeTextFile(path, stringifyNote(fm, body));
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "session";
}

export async function createVaultFile(
  vaultPath: string,
  fm: NoteFrontMatter,
  body: string
): Promise<VaultFile> {
  const base = slugify(fm.pc_name || "session");
  let path = joinPath(vaultPath, `${base}.md`);
  let suffix = 2;
  while (await exists(path)) {
    path = joinPath(vaultPath, `${base}-${suffix}.md`);
    suffix += 1;
  }
  await writeVaultFile(path, fm, body);
  return readVaultFile(path);
}

/** Copies an externally-picked file into <vaultPath>/sources/ and returns its new absolute path. */
export async function importSourceFile(vaultPath: string, pickedPath: string): Promise<string> {
  const sourcesDir = joinPath(vaultPath, "sources");
  if (!(await exists(sourcesDir))) {
    await mkdir(sourcesDir, { recursive: true });
  }
  const fileName = pickedPath.split(/[\\/]/).pop() ?? pickedPath;
  let destPath = joinPath(sourcesDir, fileName);
  if (await exists(destPath)) {
    const dotIndex = fileName.lastIndexOf(".");
    const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
    let suffix = 2;
    do {
      destPath = joinPath(sourcesDir, `${base}-${suffix}${extension}`);
      suffix += 1;
    } while (await exists(destPath));
  }
  const bytes = await readFile(pickedPath);
  await writeFile(destPath, bytes);
  return destPath;
}

/** Copies an externally-picked .md file into the vault root as a new note, avoiding name collisions. */
export async function importNoteFile(vaultPath: string, pickedPath: string): Promise<VaultFile> {
  const fileName = pickedPath.split(/[\\/]/).pop() ?? pickedPath;
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  let destPath = joinPath(vaultPath, `${base}.md`);
  let suffix = 2;
  while (await exists(destPath)) {
    destPath = joinPath(vaultPath, `${base}-${suffix}.md`);
    suffix += 1;
  }
  const raw = await readTextFile(pickedPath);
  const parsed = matter(raw);
  const fm: NoteFrontMatter = {
    session_type: "campaign",
    ...(parsed.data as NoteFrontMatter)
  };
  await writeVaultFile(destPath, fm, parsed.content);
  return readVaultFile(destPath);
}
