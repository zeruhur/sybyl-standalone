import { describe, expect, it, vi } from "vitest";

// history.ts only needs these for its file operations; the timestamp codec is pure.
vi.mock("@tauri-apps/plugin-fs", () => ({}));
vi.mock("./vault", () => ({ joinPath: (a: string, b: string) => `${a}/${b}`, stringifyNote: () => "" }));

const { encodeTimestamp, decodeTimestamp } = await import("./history");

describe("snapshot timestamps", () => {
  it("encodes to a Windows-safe filename", () => {
    const encoded = encodeTimestamp(new Date("2026-10-05T14:03:09.123Z"));
    expect(encoded).toBe("2026-10-05T14-03-09.123Z");
    expect(encoded).not.toMatch(/[:<>"/\\|?*]/);
  });

  it("round-trips", () => {
    const date = new Date("2026-01-31T23:59:59.999Z");
    expect(decodeTimestamp(encodeTimestamp(date)).getTime()).toBe(date.getTime());
  });

  it("decodes anything else to an invalid date", () => {
    for (const name of ["notes", "2026-10-05", "2026-10-05T14:03:09.123Z", "2026-10-05T14-03-09Z"]) {
      expect(Number.isNaN(decodeTimestamp(name).getTime())).toBe(true);
    }
  });
});
