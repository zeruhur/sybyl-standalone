import { describe, expect, it } from "vitest";
import { buildRequest, buildSystemPrompt } from "./promptBuilder";
import { DEFAULT_SETTINGS } from "./settings";

describe("buildSystemPrompt", () => {
  it("stays byte-identical when only a PC's state changes, so the prompt cache survives", () => {
    const base = { ruleset: "Ironsworn", game_context: "Momentum burns on a 10." };
    const before = buildSystemPrompt({ ...base, pcs: "Mara [PC:Mara|HP 5], Ilo [PC:Ilo|Stress 2]" });
    const after = buildSystemPrompt({ ...base, pcs: "Mara [PC:Mara|HP 3], Ilo [PC:Ilo|Stress 4]" });
    expect(after).toBe(before);
    expect(before).toContain("Player character: Mara, Ilo");
    expect(before).not.toContain("HP");
  });

  it("keeps a hand-written pcs value, and falls back to pc_name", () => {
    expect(buildSystemPrompt({ pcs: "Mara the thief" })).toContain("Player character: Mara the thief");
    expect(buildSystemPrompt({ pc_name: "Mara" })).toContain("Player character: Mara");
  });

  it("appends the digested game context", () => {
    expect(buildSystemPrompt({ game_context: "  Momentum burns on a 10.  " })).toMatch(/GAME CONTEXT:\nMomentum burns on a 10\.$/);
  });
});

describe("buildRequest", () => {
  it("sends the PC's current state in the per-request context instead", () => {
    const request = buildRequest({ pcs: "Mara [PC:Mara|HP 3]" }, "? Is it safe?", DEFAULT_SETTINGS, 512, "[PC:Mara|HP 3]\n@ Rest");
    expect(request.userMessage).toContain("PC: [PC:Mara|HP 3]");
    expect(request.userMessage.endsWith("? Is it safe?")).toBe(true);
    expect(request.systemPrompt).not.toContain("HP 3");
  });
});
