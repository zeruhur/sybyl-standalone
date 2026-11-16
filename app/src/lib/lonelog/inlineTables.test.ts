import { describe, expect, it } from "vitest";
import { parseInlineTables, rollInlineTable, tableDisplayName } from "./inlineTables";
import { queueDice } from "../../test/random";

const LOG = [
  "tbl: Forest Encounter (d6)",
  "  1-2: Nothing — eerie silence",
  "  3: Animal tracks, fresh",
  "  4: Abandoned campsite",
  "  5: Traveler on the road",
  "  6: Something is following you",
  "",
  "tbl: Forest Encounter d6=5 -> Traveler on the road",
  "tbl: Mood [Tense, Melancholic, Hopeful, Uncanny]",
  "tbl: NPC Role (d6) [Guard, Merchant, Scholar, Beggar, Noble, Priest]",
  "tbl: NPC (custom)",
  "  Role: d6=3 -> Merchant",
  "tbl: Loner (d66)",
  "  11-36: Calm",
  "  41-66: Storm"
].join("\n");

describe("parseInlineTables (Lonelog v1.7 §4.3.1-4.3.2)", () => {
  it("finds numbered tables and filtered sets, not results or multi-line result blocks", () => {
    const tables = parseInlineTables(LOG);
    expect(tables.map((t) => t.name)).toEqual(["Forest Encounter", "Mood", "NPC Role", "Loner"]);
    expect(tables[0]).toMatchObject({ die: "d6", isList: false });
    expect(tables[0].entries[0]).toEqual({ from: 1, to: 2, text: "Nothing — eerie silence" });
    expect(tables[1]).toMatchObject({ die: undefined, isList: true });
    expect(tables[2].entries[1]).toEqual({ from: 2, to: 2, text: "Merchant" });
  });
});

describe("rollInlineTable", () => {
  const [forest, mood, role, loner] = parseInlineTables(LOG);

  it("rolls the table's die and writes the spec's result line", () => {
    queueDice(6, [2]);
    expect(rollInlineTable(forest).line).toBe("tbl: Forest Encounter d6=2 -> Nothing — eerie silence");
    queueDice(6, [2]);
    expect(rollInlineTable(role).line).toBe("tbl: NPC Role d6=2 -> Merchant");
  });

  it("picks from a set with no die, leaving the roll out", () => {
    queueDice(4, [4]);
    expect(rollInlineTable(mood).line).toBe("tbl: Mood -> Uncanny");
  });

  it("reads a d66 as tens and units", () => {
    queueDice(6, [3, 4]);
    expect(rollInlineTable(loner).line).toBe("tbl: Loner d66=34 -> Calm");
  });

  it("reports a roll no entry covers", () => {
    const gap = parseInlineTables("tbl: Gap (d6)\n  1: One")[0];
    queueDice(6, [5]);
    expect(rollInlineTable(gap)).toEqual({ roll: "d6=5", value: 5 });
  });
});

it("turns a table file name into a table name", () => {
  expect(tableDisplayName("forest_encounters.md")).toBe("forest encounters");
});
