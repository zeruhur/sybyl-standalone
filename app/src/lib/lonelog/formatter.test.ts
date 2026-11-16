import { describe, expect, it } from "vitest";
import { formatAdventureSeed } from "./formatter";

describe("formatAdventureSeed", () => {
  it("writes a Lonelog v1.7 tbl: result block, not gen:", () => {
    const out = formatAdventureSeed("- Premise: A town floods.\n- Hook: d6=4 -> A bell rings\nloose line", {
      wrapInCodeBlock: false
    });
    expect(out).toBe("tbl: Adventure Seed\n  Premise: -> A town floods.\n  Hook: d6=4 -> A bell rings\n  -> loose line");
  });
});
