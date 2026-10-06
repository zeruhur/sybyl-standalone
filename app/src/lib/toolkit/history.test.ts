import { describe, expect, it } from "vitest";
import { addLogEntry, TOOLKIT_LOG_LIMIT, ToolkitLogEntry } from "./history";

describe("addLogEntry", () => {
  it("puts the newest entry first, insertable unless told otherwise", () => {
    let log: ToolkitLogEntry[] = [];
    log = addLogEntry(log, { tool: "Dice", text: "2d6=7" });
    log = addLogEntry(log, { tool: "Custom Deck", text: "dragon.png", insertable: false });
    expect(log.map((e) => [e.tool, e.text, e.insertable])).toEqual([
      ["Custom Deck", "dragon.png", false],
      ["Dice", "2d6=7", true]
    ]);
    expect(log[0].id).not.toBe(log[1].id);
  });

  it("drops the oldest entries past the limit", () => {
    let log: ToolkitLogEntry[] = [];
    for (let i = 0; i < TOOLKIT_LOG_LIMIT + 5; i++) log = addLogEntry(log, { tool: "Dice", text: `roll ${i}` });
    expect(log).toHaveLength(TOOLKIT_LOG_LIMIT);
    expect(log[0].text).toBe(`roll ${TOOLKIT_LOG_LIMIT + 4}`);
    expect(log[log.length - 1].text).toBe("roll 5");
  });
});
