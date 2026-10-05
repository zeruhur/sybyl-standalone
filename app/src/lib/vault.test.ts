import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the Tauri fs plugin: just the calls the note read/write path makes.
const disk = new Map<string, string>();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: async (path: string) => {
    const raw = disk.get(path);
    if (raw === undefined) throw new Error(`ENOENT: ${path}`);
    return raw;
  },
  writeTextFile: async (path: string, raw: string) => void disk.set(path, raw),
  exists: async (path: string) => disk.has(path),
  remove: async (path: string) => void disk.delete(path)
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({}));
vi.mock("@tauri-apps/plugin-store", () => ({}));
vi.mock("@tauri-apps/api/path", () => ({}));

const { checkExternalChange, createVaultFile, deleteVaultFile, ExternalChangeError, openVaultFile, writeVaultFile } =
  await import("./vault");

const PATH = "/vault/mara.md";

/** Simulates another program (Obsidian, a text editor) editing the file. */
function editOutside(raw: string) {
  disk.set(PATH, raw);
}

beforeEach(async () => {
  disk.clear();
  disk.set(PATH, "---\npc_name: Mara\n---\n@ Original beat\n");
  await openVaultFile(PATH);
});

describe("external-change detection", () => {
  it("writes normally when nothing changed outside", async () => {
    await writeVaultFile(PATH, { pc_name: "Mara" }, "@ Mine\n");
    expect(disk.get(PATH)).toContain("@ Mine");
    // Sybyl's own write becomes the new baseline, so the next save goes through too.
    await writeVaultFile(PATH, { pc_name: "Mara" }, "@ Mine again\n");
    expect(disk.get(PATH)).toContain("@ Mine again");
  });

  it("refuses to overwrite an outside edit and reports the disk version", async () => {
    editOutside("---\npc_name: Mara\n---\n@ Edited in Obsidian\n");
    const error = await writeVaultFile(PATH, { pc_name: "Mara" }, "@ Mine\n").catch((e) => e);
    expect(error).toBeInstanceOf(ExternalChangeError);
    expect(error.disk.body).toBe("@ Edited in Obsidian\n");
    expect(disk.get(PATH)).toContain("@ Edited in Obsidian");
  });

  it("reports an outside delete without recreating the file", async () => {
    disk.delete(PATH);
    const error = await writeVaultFile(PATH, {}, "@ Mine\n").catch((e) => e);
    expect(error).toBeInstanceOf(ExternalChangeError);
    expect(error.disk).toBeNull();
    expect(disk.has(PATH)).toBe(false);
  });

  it("overwrites when forced", async () => {
    editOutside("@ Edited in Obsidian\n");
    await writeVaultFile(PATH, {}, "@ Mine\n", { force: true });
    expect(disk.get(PATH)).toContain("@ Mine");
    expect(await checkExternalChange(PATH)).toEqual({ kind: "unchanged" });
  });

  it("re-opening makes the disk version the baseline", async () => {
    editOutside("@ Edited in Obsidian\n");
    expect((await checkExternalChange(PATH)).kind).toBe("modified");
    await openVaultFile(PATH);
    expect(await checkExternalChange(PATH)).toEqual({ kind: "unchanged" });
    await writeVaultFile(PATH, {}, "@ Mine\n");
    expect(disk.get(PATH)).toContain("@ Mine");
  });

  it("does not block a new note that reuses a deleted note's name", async () => {
    await deleteVaultFile(PATH);
    const created = await createVaultFile("/vault", { pc_name: "Mara" }, "");
    expect(created.path).toBe(PATH);
  });

  it("does not block creating a note whose old namesake was deleted outside Sybyl", async () => {
    disk.delete(PATH);
    const created = await createVaultFile("/vault", { pc_name: "Mara" }, "");
    expect(created.path).toBe(PATH);
  });
});
