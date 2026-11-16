import { describe, expect, it } from "vitest";
import { appendLogLine, buildLogLine, composerIntentReady, detectPrefixMode, parseComposerInput, rollLogText } from "./composer";
import { queueDice } from "../test/random";

describe("parseComposerInput", () => {
  it("splits an oracle question from a pre-rolled result", () => {
    expect(parseComposerInput("? Is the door locked? -> Yes, but", "scene")).toEqual({
      mode: "oracle",
      text: "Is the door locked?",
      detail: "Yes, but"
    });
  });

  it("splits an action from its roll", () => {
    expect(parseComposerInput("  @ Pick the lock d: 2d6=8", "scene")).toEqual({
      mode: "action",
      text: "Pick the lock",
      detail: "2d6=8"
    });
    expect(parseComposerInput("@ Pick the lock d:2d6", "scene").detail).toBe("2d6");
  });

  it("does not split on d: inside a word", () => {
    expect(parseComposerInput("@ Read the odd:ities", "scene")).toMatchObject({ text: "Read the odd:ities", detail: "" });
  });

  it("treats -> as interpret, not as an oracle", () => {
    expect(detectPrefixMode("-> Yes, and")).toBe("interpret");
    expect(parseComposerInput("-> Yes, and", "oracle")).toEqual({ mode: "interpret", text: "Yes, and", detail: "" });
  });

  it("falls back to the chip-selected mode without a prefix", () => {
    expect(detectPrefixMode("A rainy harbor")).toBeNull();
    expect(parseComposerInput("A rainy harbor", "scene")).toEqual({ mode: "scene", text: "A rainy harbor", detail: "" });
  });
});

describe("composerIntentReady", () => {
  it("allows a blank scene and a blank interpret with a selection only", () => {
    expect(composerIntentReady({ mode: "scene", text: "", detail: "" }, false)).toBe(true);
    expect(composerIntentReady({ mode: "interpret", text: "", detail: "" }, true)).toBe(true);
    expect(composerIntentReady({ mode: "interpret", text: "", detail: "" }, false)).toBe(false);
    expect(composerIntentReady({ mode: "oracle", text: "", detail: "" }, true)).toBe(false);
  });
});

describe("log-only lines (d:, tbl:, =>)", () => {
  it("detects the log prefixes", () => {
    expect(parseComposerInput("d: Strike 2d6+2", "oracle")).toEqual({ mode: "roll", text: "Strike 2d6+2", detail: "" });
    expect(detectPrefixMode("tbl: Loot -> A sword")).toBe("table");
    expect(detectPrefixMode("=> The door gives")).toBe("consequence");
    expect(detectPrefixMode("-> Yes")).toBe("interpret");
  });

  it("rolls a dice expression that has no result yet", () => {
    queueDice(6, [4, 3]);
    expect(buildLogLine(parseComposerInput("d: Strike 2d6+2 vs 8", "oracle"))).toBe("d: Strike 2d6+2=9 vs 8");
    queueDice(100, [42]);
    expect(buildLogLine(parseComposerInput("tbl: Loot d100", "oracle"))).toBe("tbl: Loot d100=42");
  });

  it("uses the add-on's spacing for a pool result", () => {
    queueDice(10, [7, 2, 9]);
    expect(rollLogText("Attack 3d10>=7")).toBe("Attack 3d10>=7 =2");
  });

  it("leaves a line that already has a result alone", () => {
    expect(rollLogText("Strike 2d6+2=9 -> Hit")).toBe("Strike 2d6+2=9 -> Hit");
    expect(rollLogText("Strike 2d6+2[4, 3]=9")).toBe("Strike 2d6+2[4, 3]=9");
    expect(rollLogText("Attack 5d10>=7 =3")).toBe("Attack 5d10>=7 =3");
    expect(rollLogText("Loot -> A sword")).toBe("Loot -> A sword");
    expect(buildLogLine(parseComposerInput("=> The 2d6 guards scatter", "oracle"))).toBe("=> The 2d6 guards scatter");
  });

  it("needs some text", () => {
    expect(composerIntentReady(parseComposerInput("=>", "oracle"), true)).toBe(false);
  });
});

describe("appendLogLine", () => {
  it("joins the note's last code block", () => {
    const doc = "### S1 *Docks*\n\n```\n@ Sneak\n```\n";
    const change = appendLogLine(doc, "=> Seen", true);
    const next = doc.slice(0, change.from) + change.insert + doc.slice(change.to);
    expect(next).toBe("### S1 *Docks*\n\n```\n@ Sneak\n=> Seen\n```\n");
  });

  it("opens a block after prose, or adds a plain line when wrapping is off", () => {
    expect(appendLogLine("Rain.", "=> Seen", true).insert).toBe("\n\n```\n=> Seen\n```\n");
    expect(appendLogLine("Rain.\n", "=> Seen", false).insert).toBe("\n=> Seen\n");
  });

  it("doesn't treat an opening fence as the end of a block", () => {
    expect(appendLogLine("```\n@ Sneak", "=> Seen", true).insert).toBe("\n\n```\n=> Seen\n```\n");
  });
});
