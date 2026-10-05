import { describe, expect, it } from "vitest";
import { composerIntentReady, detectPrefixMode, parseComposerInput } from "./composer";

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
