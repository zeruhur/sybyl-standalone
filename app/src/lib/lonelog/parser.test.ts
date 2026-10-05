import { describe, expect, it } from "vitest";
import { parseLonelogContext, serializeContext } from "./parser";

describe("parseLonelogContext", () => {
  it("recognizes a scene header with a description", () => {
    const ctx = parseLonelogContext("### S1 *The docks at night*\n@ Sneak past the guard");
    expect(ctx.lastSceneId).toBe("S1");
    expect(ctx.lastSceneDesc).toBe("The docks at night");
  });

  it("recognizes a scene header with an empty description", () => {
    // Start Scene with a blank description emits `### S2 **`; dropping the asterisks broke this.
    const ctx = parseLonelogContext("### S1 *Docks*\n\n### S2 **");
    expect(ctx.lastSceneId).toBe("S2");
    expect(ctx.lastSceneDesc).toBe("");
  });

  it("does not treat a header without the asterisk pair as a scene", () => {
    const ctx = parseLonelogContext("### S1 *Docks*\n### S2");
    expect(ctx.lastSceneId).toBe("S1");
  });

  it("keeps the thread prefix and accepts headers without a heading marker", () => {
    expect(parseLonelogContext("T2-S3 *Rooftops*").lastSceneId).toBe("T2-S3");
    expect(parseLonelogContext("S4.1 *Cellar*").lastSceneId).toBe("S4.1");
  });

  it("keeps the latest tag for each name", () => {
    const body = [
      "@ Talk to [N:Jonah|wary] at [L:Pier 9|foggy]",
      "-> He scowls. [N:Jonah|hostile]",
      "[Clock:Alarm 2/6]",
      "[Clock:Alarm 3/6]",
      "[Track:Escape 1/4]",
      "[Thread:Find the heir|Open]",
      "[PC:Mara|HP 5]",
      "[PC:Mara|HP 3]"
    ].join("\n");
    const ctx = parseLonelogContext(body);
    expect(ctx.activeNPCs).toEqual(["Jonah|hostile"]);
    expect(ctx.activeLocations).toEqual(["Pier 9|foggy"]);
    expect(ctx.activeClocks).toEqual(["Alarm 3/6"]);
    expect(ctx.activeTracks).toEqual(["Escape 1/4"]);
    expect(ctx.activeThreads).toEqual(["Find the heir|Open"]);
    expect(ctx.pcState).toEqual(["Mara|HP 3"]);
  });

  it("ignores frontmatter", () => {
    const ctx = parseLonelogContext("---\npcs: \"[PC:Ghost|old]\"\n---\n@ Act");
    expect(ctx.pcState).toEqual([]);
    expect(ctx.recentBeats).toEqual(["@ Act"]);
  });

  it("collects beats and prose, skipping headers and tag-only lines, capped at 10", () => {
    const ctx = parseLonelogContext("# Campaign\n### S1 *Docks*\n[N:Jonah]\n@ Act\n? Locked?\n-> No\nThe rain picks up.");
    expect(ctx.recentBeats).toEqual(["@ Act", "? Locked?", "-> No", "The rain picks up."]);

    const many = Array.from({ length: 15 }, (_, i) => `@ beat ${i}`).join("\n");
    const capped = parseLonelogContext(many).recentBeats;
    expect(capped).toHaveLength(10);
    expect(capped[0]).toBe("@ beat 5");
  });

  it("only looks at the last depthLines lines", () => {
    const body = ["### S1 *Old scene*", ...Array.from({ length: 20 }, () => "filler")].join("\n");
    expect(parseLonelogContext(body, 10).lastSceneId).toBe("");
    expect(parseLonelogContext(body, 30).lastSceneId).toBe("S1");
  });

  it("handles CRLF line endings", () => {
    const ctx = parseLonelogContext("### S1 *Docks*\r\n@ Act\r\n");
    expect(ctx.lastSceneId).toBe("S1");
    expect(ctx.recentBeats).toEqual(["@ Act"]);
  });
});

describe("serializeContext", () => {
  it("renders only the sections that have content", () => {
    const ctx = parseLonelogContext("### S1 *Docks*\n@ Meet [N:Jonah|wary]");
    expect(serializeContext(ctx)).toBe(
      ["Current scene: S1 *Docks*", "NPCs: [N:Jonah|wary]", "Recent beats:", "  @ Meet [N:Jonah|wary]"].join("\n")
    );
  });

  it("is empty for an empty note", () => {
    expect(serializeContext(parseLonelogContext(""))).toBe("");
  });
});
