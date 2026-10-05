import { describe, expect, it } from "vitest";
import { extractDashboard } from "./dashboard";

describe("extractDashboard", () => {
  it("keeps the latest state of each thread, defaulting to Open", () => {
    const dash = extractDashboard("[Thread:Find the heir]\n[Thread:Pay the debt|Open]\n[Thread:Find the heir|Closed]");
    expect(dash.threads).toEqual([
      { name: "Find the heir", state: "Closed" },
      { name: "Pay the debt", state: "Open" }
    ]);
  });

  it("parses clock and track progress, latest wins", () => {
    const dash = extractDashboard("[Clock:Alarm 2/6] then [Clock:Alarm 3 / 6]\n[Track:Escape 1/4]");
    expect(dash.clocks).toEqual([{ name: "Alarm", current: 3, total: 6 }]);
    expect(dash.tracks).toEqual([{ name: "Escape", current: 1, total: 4 }]);
  });

  it("skips progress tags without an N/M value", () => {
    expect(extractDashboard("[Clock:Alarm]\n[Track:Escape half]").clocks).toEqual([]);
  });

  it("scans the whole body but not the frontmatter", () => {
    const body = "---\nnotes: \"[Thread:Ghost]\"\n---\n" + "filler\n".repeat(500) + "[Thread:Deep]";
    expect(extractDashboard(body).threads).toEqual([{ name: "Deep", state: "Open" }]);
  });
});
