import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeckSession, drawCard } from "./cardEngine";

const disk = new Map<string, string>();
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (path: string) => disk.has(path) || [...disk.keys()].some((k) => k.startsWith(`${path}/`)),
  mkdir: async () => undefined,
  readTextFile: async (path: string) => disk.get(path) ?? "",
  writeTextFile: async (path: string, raw: string) => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
    disk.set(path, raw);
  },
  remove: async (path: string) => void disk.delete(path)
}));

const { customDeckStatePath, deckStatePath, deleteDeckState, loadDeckState, parseCustomDeck, parseDeck, saveCustomDeckState, saveDeckState, serializeCustomDeck, serializeDeck } =
  await import("./deckState");

beforeEach(() => disk.clear());

describe("parseDeck", () => {
  it("round-trips a deck mid-game", () => {
    let session = createDeckSession("tarot");
    for (let i = 0; i < 5; i++) session = drawCard(session).session;
    expect(parseDeck(serializeDeck(session))).toEqual(session);
  });

  it("rejects anything that isn't exactly the deck's cards", () => {
    const session = createDeckSession("standard");
    const tamper = (change: (d: { type: string; drawPile: string[]; discardPile: string[] }) => void) => {
      const data = JSON.parse(serializeDeck(session));
      change(data);
      return parseDeck(JSON.stringify(data));
    };
    expect(tamper((d) => d.drawPile.pop())).toBeNull(); // a card missing
    expect(tamper((d) => d.discardPile.push("Ah"))).toBeNull(); // a card twice
    expect(tamper((d) => (d.type = "uno"))).toBeNull(); // unknown deck
    expect(tamper((d) => (d.type = "tarot"))).toBeNull(); // wrong cards for the type
    expect(parseDeck("not json")).toBeNull();
  });
});

describe("saved decks", () => {
  it("saves next to the vault and loads back", async () => {
    const session = drawCard(createDeckSession("standard-jokers")).session;
    await saveDeckState("/vault", "mara.md", session);
    expect(deckStatePath("/vault", "mara.md")).toBe("/vault/.deck-state/mara.json");
    expect(await loadDeckState("/vault", "mara.md")).toEqual(session);
    expect(await loadDeckState("/vault", "other.md")).toBeNull();
  });

  it("keeps quick successive saves in order", async () => {
    let session = createDeckSession("standard");
    const saves: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      session = drawCard(session).session;
      saves.push(saveDeckState("/vault", "mara.md", session));
    }
    await Promise.all(saves);
    expect((await loadDeckState("/vault", "mara.md"))!.discardPile).toHaveLength(10);
  });

  it("is removed with the note", async () => {
    await saveDeckState("/vault", "mara.md", createDeckSession("standard"));
    await deleteDeckState("/vault", "mara.md");
    expect(await loadDeckState("/vault", "mara.md")).toBeNull();
  });
});

describe("custom image decks", () => {
  const folder = { name: "omens", path: "/vault/decks/omens" };
  const images = ["/vault/decks/omens/a.png", "/vault/decks/omens/b.png", "/vault/decks/omens/c.png"];
  const session = { name: "omens", drawPile: [images[2], images[0]], discardPile: [images[1]] };

  it("round-trips a deck by file name", () => {
    expect(serializeCustomDeck(session)).not.toContain("/vault");
    expect(parseCustomDeck(serializeCustomDeck(session), folder, images)).toEqual(session);
  });

  it("starts fresh when the folder's images changed or it's another deck", () => {
    const raw = serializeCustomDeck(session);
    expect(parseCustomDeck(raw, folder, [...images, "/vault/decks/omens/d.png"])).toBeNull();
    expect(parseCustomDeck(raw, folder, images.slice(1))).toBeNull();
    expect(parseCustomDeck(raw, { ...folder, name: "other" }, images)).toBeNull();
    expect(parseCustomDeck("nope", folder, images)).toBeNull();
  });

  it("is saved, cleared, and deleted with the note", async () => {
    await saveCustomDeckState("/vault", "Campaign.md", session);
    expect(disk.has(customDeckStatePath("/vault", "Campaign.md"))).toBe(true);
    await saveCustomDeckState("/vault", "Campaign.md", null);
    expect(disk.has(customDeckStatePath("/vault", "Campaign.md"))).toBe(false);
    await saveCustomDeckState("/vault", "Campaign.md", session);
    await deleteDeckState("/vault", "Campaign.md");
    expect(disk.size).toBe(0);
  });
});
