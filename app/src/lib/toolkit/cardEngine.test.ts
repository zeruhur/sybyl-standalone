import { describe, expect, it, vi } from "vitest";
import { buildStandardDeck, buildTarotDeck, createDeckSession, drawCard, formatDrawLines, formatReshuffleTag } from "./cardEngine";
import { accumulateTags, formatElement } from "../lonelog/tags";
import { isCardToken } from "../lonelog/cardNotation";
import { cutUpText } from "./cutup";

describe("decks", () => {
  it("builds full decks of valid, unique card tokens", () => {
    for (const [deck, size] of [
      [buildStandardDeck(false), 52],
      [buildStandardDeck(true), 54],
      [buildTarotDeck(), 78]
    ] as const) {
      expect(deck).toHaveLength(size);
      expect(new Set(deck).size).toBe(size);
      expect(deck.every(isCardToken)).toBe(true);
    }
  });

  it("moves drawn cards to the discard pile and reshuffles when empty", () => {
    let session = createDeckSession("standard");
    const drawn = new Set<string>();
    for (let i = 0; i < 52; i++) {
      const result = drawCard(session);
      session = result.session;
      drawn.add(result.card!);
    }
    expect(drawn.size).toBe(52);
    expect(session.drawPile).toHaveLength(0);
    expect(session.discardPile).toHaveLength(52);

    const next = drawCard(session);
    expect(next.card).toBeDefined();
    expect(next.session.drawPile).toHaveLength(51);
    expect(next.session.discardPile).toHaveLength(1);
  });

  it("decides Tarot reversal at draw time, never for standard decks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(drawCard(createDeckSession("tarot")).card).toMatch(/r$/);
    expect(drawCard(createDeckSession("standard")).card).not.toMatch(/r$/);
  });

  it("returns no card from an empty session", () => {
    expect(drawCard({ type: "standard", drawPile: [], discardPile: [] }).card).toBeUndefined();
  });
});

describe("cutUpText", () => {
  it("shuffles words without losing any, 8 per line", () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`);
    const lines = cutUpText(words.join(" "), "words")!.split("\n");
    expect(lines.map((l) => l.split(" ").length)).toEqual([8, 8, 4]);
    expect(lines.join(" ").split(" ").sort()).toEqual([...words].sort());
  });

  it("shuffles whole non-empty lines", () => {
    expect(cutUpText("a b\n\n  c d  \ne", "lines")!.split("\n").sort()).toEqual(["a b", "c d", "e"]);
  });

  it("returns undefined for blank input", () => {
    expect(cutUpText("   \n ", "words")).toBeUndefined();
    expect(cutUpText("", "lines")).toBeUndefined();
  });
});

describe("formatDrawLines (cards add-on v1.1)", () => {
  it("writes the draw and the deck's new state", () => {
    const after = { type: "standard" as const, drawPile: Array(51).fill("x"), discardPile: ["Qs"] };
    expect(formatDrawLines("Qs", after, false)).toBe("tbl: draw=Qs\n[Deck:Standard|×51|out:+Qs]");
    expect(formatDrawLines("Qs", after, true)).toBe("tbl: draw=Qs\n[Deck:Standard|×51|out:Qs]");
  });

  it("keeps a reversed Tarot card's identity in the out list, but not a joker's r", () => {
    const tarot = { type: "tarot" as const, drawPile: [], discardPile: [] };
    expect(formatDrawLines("M16r", tarot, false)).toBe("tbl: draw=M16r\n[Deck:Tarot|×0|out:+M16]");
    const jokers = { type: "standard-jokers" as const, drawPile: [], discardPile: [] };
    expect(formatDrawLines("RJkr", jokers, false)).toContain("out:+RJkr]");
  });

  it("resets the deck on a reshuffle, and the tags replay to that state", () => {
    const full = createDeckSession("standard");
    expect(formatReshuffleTag(full)).toBe("[Deck:Standard|×52|out:none]");
    const log = "[Deck:Standard|×51|out:+Qs]\n[Deck:Standard|×50|out:+7h]\n[Deck:Standard|×52|out:none]";
    expect(formatElement(accumulateTags(log).get("Deck:standard")!)).toBe("Standard|×52|out:none");
  });
});
