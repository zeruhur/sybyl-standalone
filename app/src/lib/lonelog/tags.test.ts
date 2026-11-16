import { describe, expect, it } from "vitest";
import { accumulateTags, formatElement, scanTags } from "./tags";
import { parseLonelogContext } from "./parser";
import { extractDashboard } from "./dashboard";
import { compileFrontmatter } from "../frontmatter";

/** The current state of one element after replaying `log`, in tag-body form. */
function stateOf(log: string, key: string): string | undefined {
  const el = accumulateTags(log).get(key);
  return el && formatElement(el);
}

describe("tag accumulation (Lonelog v1.7 §4.1)", () => {
  it("adds plain values, removes with -value, replaces with old>new", () => {
    const log = "[N:Jonah|friendly|injured]\n[N:Jonah|captured]\n[N:Jonah|-injured]\n[N:Jonah|friendly>hostile]";
    expect(stateOf(log, "N:jonah")).toBe("Jonah|hostile|captured");
  });

  it("accepts → for a change and a leading + for an addition", () => {
    expect(stateOf("[N:Jonah|calm]\n[N:Jonah|calm→angry|+armed]", "N:jonah")).toBe("Jonah|angry|armed");
  });

  it("lets a category hold one state", () => {
    expect(stateOf("[N:Guard|status:alert]\n[N:Guard|status:unconscious]", "N:guard")).toBe("Guard|status:unconscious");
  });

  it("adds and removes single category entries", () => {
    const log = "[PC:Jonah|trait:friendly,curious]\n[PC:Jonah|trait:+reckless]\n[PC:Jonah|trait:-curious]";
    expect(stateOf(log, "PC:jonah")).toBe("Jonah|trait:friendly,reckless");
  });

  it("sets and adjusts numbers", () => {
    const log = "[PC:Alex|HP 8|Stress 0|Gold 10]\n[PC:Alex|HP-2|Gold-5]\n[PC:Alex|HP+3|Stress+1]";
    expect(stateOf(log, "PC:alex")).toBe("Alex|HP 9|Stress 1|Gold 5");
  });

  it("adjusts a number held in a category", () => {
    expect(stateOf("[PC:Jonah|stat:HP 8, Stress 2]\n[PC:Jonah|HP-3]", "PC:jonah")).toBe("Jonah|stat:HP 5,Stress 2");
  });

  it("keeps an adjustment to a number it never saw set", () => {
    expect(stateOf("[PC:Alex|HP-2]", "PC:alex")).toBe("Alex|HP-2");
  });

  it("sets and adjusts counts, reading a legacy count in the name", () => {
    expect(stateOf("[N:Bandits|×6]\n[N:Bandits|×4]\n[N:Bandits|×-1]", "N:bandits")).toBe("Bandits|×3");
    expect(stateOf("[N:Bandits×6]\n[N:Bandits|×-2]", "N:bandits")).toBe("Bandits|×4");
  });

  it("advances clocks, tracks and timers", () => {
    const log = "[Clock:Suspicion 3/6]\n[Clock:Suspicion+1]\n[Track:Escape 3/8]\n[Track:Escape+2]\n[Timer:Dawn 3]\n[Timer:Dawn-1]";
    expect(stateOf(log, "Clock:suspicion")).toBe("Suspicion 4/6");
    expect(stateOf(log, "Track:escape")).toBe("Escape 5/8");
    expect(stateOf(log, "Timer:dawn")).toBe("Dawn 2");
  });

  it("gives a thread one state", () => {
    expect(stateOf("[Thread:Escape|Open]\n[Thread:Escape|Open>Closed]", "Thread:escape")).toBe("Escape|Closed");
    // Legacy: a thread restated with a new state.
    expect(stateOf("[Thread:Escape|Open]\n[Thread:Escape|Closed]", "Thread:escape")).toBe("Escape|Closed");
  });

  it("reads a legacy [E:Name X/Y] as a clock", () => {
    expect(stateOf("[E:Alarm 2/6]\n[Clock:Alarm+1]", "Clock:alarm")).toBe("Alarm 3/6");
  });

  it("lets a reference tag change nothing", () => {
    expect(stateOf("[N:Jonah|friendly]\n[#N:Jonah]", "N:jonah")).toBe("Jonah|friendly");
  });

  it("reads a multi-line tag as a full status block that resets the element", () => {
    const log = [
      "[PC:Jonah|old news]",
      "[PC:Jonah",
      "  | trait: friendly, curious",
      "  | status: wounded",
      "]",
      "[PC:Jonah|status:healed]"
    ].join("\r\n");
    expect(stateOf(log, "PC:jonah")).toBe("Jonah|trait:friendly,curious|status:healed");
  });

  it("ignores Markdown links and bracketed dice results", () => {
    expect(scanTags("[see: here](x) d: 2d6+2[4, 3]=9 +[flanking]")).toEqual([]);
  });

  it("keeps add-on tags such as the cards add-on's deck", () => {
    expect(stateOf("[Deck:Main|×52]\n[Deck:Main|×-1|out:+Qs]\n[Deck:Main|×-1|out:+M16]", "Deck:main")).toBe(
      "Main|×50|out:Qs,M16"
    );
  });
});

describe("accumulated tags in the app", () => {
  it("give the model the full PC state, replayed from before the context window", () => {
    const body = ["[PC:Mara|HP 8|Stress 0]", ...Array.from({ length: 20 }, () => "filler"), "@ Fall [PC:Mara|HP-2]"].join("\n");
    expect(parseLonelogContext(body, 5).pcState).toEqual(["Mara|HP 6|Stress 0"]);
    expect(compileFrontmatter(body, 5).pcs).toBe("Mara [PC:Mara|HP 6|Stress 0]");
  });

  it("leave out elements not mentioned in the window", () => {
    const body = ["[N:Old friend|gone]", ...Array.from({ length: 20 }, () => "filler"), "[#N:Jonah]"].join("\n");
    expect(parseLonelogContext(`[N:Jonah|wary]\n${body}`, 5).activeNPCs).toEqual(["Jonah|wary"]);
  });

  it("drive the dashboard", () => {
    const dash = extractDashboard("[Clock:Alarm 2/6]\n[Clock:Alarm+1]\n[Thread:Escape|Open>Closed]\n[Timer:Dawn 3]\n[Timer:Dawn-1]");
    expect(dash.clocks).toEqual([{ name: "Alarm", current: 3, total: 6 }]);
    expect(dash.threads).toEqual([{ name: "Escape", state: "Closed" }]);
    expect(dash.timers).toEqual([{ name: "Dawn", current: 2 }]);
  });
});
