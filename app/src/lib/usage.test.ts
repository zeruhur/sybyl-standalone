import { describe, expect, it } from "vitest";
import { formatUsage } from "./usage";

describe("formatUsage", () => {
  it("shows prompt and output tokens", () => {
    expect(formatUsage({ text: "x", inputTokens: 1234, outputTokens: 56 })).toBe("1,234 in · 56 out");
  });

  it("counts cached tokens in the prompt total and breaks them out", () => {
    expect(formatUsage({ text: "x", inputTokens: 212, outputTokens: 180, cacheReadTokens: 5000 })).toBe(
      "5,212 in (5,000 cached) · 180 out"
    );
    expect(formatUsage({ text: "x", inputTokens: 12, outputTokens: 9, cacheWriteTokens: 4000 })).toBe(
      "4,012 in (4,000 cache write) · 9 out"
    );
  });

  it("is empty when the provider reported nothing", () => {
    expect(formatUsage({ text: "x" })).toBe("");
  });
});
