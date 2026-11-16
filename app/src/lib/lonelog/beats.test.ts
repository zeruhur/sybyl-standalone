import { describe, expect, it } from "vitest";
import { BEAT_SYMBOL_REGEX, isAsideMetaNote, META_NOTE_REGEX, splitCompactBeats } from "./beats";
import { parseLonelogContext } from "./parser";

const symbolsIn = (line: string) => [...line.matchAll(BEAT_SYMBOL_REGEX)].map((m) => m[1] ?? m[2]);
const metaIn = (line: string) => [...line.matchAll(META_NOTE_REGEX)].map((m) => m[0]);

describe("compact form (Lonelog v1.7 D.1.3)", () => {
  it("splits a compact line into standard-form beats", () => {
    expect(splitCompactBeats("@ Sneak past d: 2d6=8 vs 9 -> Fail => The guard turns")).toEqual([
      "@ Sneak past",
      "d: 2d6=8 vs 9 -> Fail",
      "=> The guard turns"
    ]);
  });

  it("puts an oracle answer on its own line and allows no space after a symbol", () => {
    expect(splitCompactBeats("? Is it locked? (50/50) ->No =>I need another way")).toEqual([
      "? Is it locked? (50/50)",
      "->No",
      "=>I need another way"
    ]);
  });

  it("leaves standard lines and prose alone", () => {
    expect(splitCompactBeats("d: Strike 2d6+2=9 -> Hit")).toEqual(["d: Strike 2d6+2=9 -> Hit"]);
    expect(splitCompactBeats("@(Kael > Mira) Lift the gate")).toEqual(["@(Kael > Mira) Lift the gate"]);
    expect(splitCompactBeats("She asks ? and @ nobody")).toEqual(["She asks ? and @ nobody"]);
  });

  it("highlights mid-line symbols only on beat lines", () => {
    expect(symbolsIn("@ Sneak d: 2d6=8 -> Fail => Seen")).toEqual(["@", "d:", "->", "=>"]);
    expect(symbolsIn("tbl: Loot d100=42 -> A sword")).toEqual(["tbl:", "->"]);
    expect(symbolsIn("She asks ? and -> nobody")).toEqual([]);
    expect(symbolsIn("d: 5d10>=7 =3 -> Hit")).toEqual(["d:", "->"]);
  });

  it("gives the AI the split beats", () => {
    expect(parseLonelogContext("@ Sneak d: 2d6=8 -> Fail => Seen").recentBeats).toEqual(["@ Sneak", "d: 2d6=8 -> Fail", "=> Seen"]);
  });
});

describe("meta notes (§4.5, D.7)", () => {
  it("finds labelled notes anywhere and bare notes on their own line", () => {
    expect(metaIn("=> I slip past. (note: alt stealth rule)")).toEqual(["(note: alt stealth rule)"]);
    expect(metaIn("(felt tense)")).toEqual(["(felt tense)"]);
  });

  it("ignores roll references, likelihoods and links", () => {
    expect(metaIn("-> No, but... (d6=3)")).toEqual([]);
    expect(metaIn("? Is it guarded? (50/50)")).toEqual([]);
    expect(metaIn("see [map](http://x.y)")).toEqual([]);
  });

  it("keeps asides out of the AI's beats, but not retcons or interpretations", () => {
    expect(isAsideMetaNote("(todo: revisit the letter)")).toBe(true);
    expect(isAsideMetaNote("(felt tense)")).toBe(true);
    expect(isAsideMetaNote("(retcon: actually a Success)")).toBe(false);
    expect(isAsideMetaNote("=> Fine (note: x)")).toBe(false);
    const ctx = parseLonelogContext("@ Act\n(break: 20 min)\n(retcon: forgot +1, Success)\n(interp: honest, but hiding something)");
    expect(ctx.recentBeats).toEqual(["@ Act", "(retcon: forgot +1, Success)", "(interp: honest, but hiding something)"]);
  });
});
