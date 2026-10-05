import { afterEach, describe, expect, it, vi } from "vitest";
import { compileFrontmatter } from "./frontmatter";

describe("compileFrontmatter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("always refreshes last_update to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    expect(compileFrontmatter("", 60)).toEqual({ last_update: "2026-10-05" });
  });

  it("derives pcs from the latest [PC:] tag of each character", () => {
    const body = "[PC:Mara|HP 5]\n@ Fight\n[PC:Mara|HP 3]\n[PC:Ilo|Stress 2]";
    expect(compileFrontmatter(body, 60).pcs).toBe("Mara [PC:Mara|HP 3], Ilo [PC:Ilo|Stress 2]");
  });

  it("leaves pcs alone when no PC tag is in the context window", () => {
    const body = "[PC:Mara|HP 5]\n" + "filler\n".repeat(20);
    expect(compileFrontmatter(body, 5)).not.toHaveProperty("pcs");
  });
});
