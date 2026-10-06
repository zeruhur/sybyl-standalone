import { describe, expect, it, vi } from "vitest";
import { formatRollResult, parseDiceExpression, rollExpression } from "./diceEngine";
import { isDiceExpression } from "../lonelog/diceNotation";
import { queueDice } from "../../test/random";

describe("rollExpression", () => {
  it("rejects expressions outside the Part I grammar", () => {
    expect(rollExpression("hello")).toBeUndefined();
    expect(rollExpression("0d6")).toBeUndefined();
    expect(rollExpression("2d6r1")).toBeUndefined();
  });

  it("sums dice plus a flat modifier", () => {
    queueDice(6, [4, 5]);
    const result = rollExpression("2d6+3")!;
    expect(result.rolls).toEqual([4, 5]);
    expect(result.total).toBe(12);
    expect(formatRollResult(result)).toBe("2d6+3=12");
  });

  it("defaults the count to 1 and handles negative modifiers", () => {
    queueDice(20, [7]);
    expect(rollExpression("d20-2")!.total).toBe(5);
  });

  it("treats d% as a d100", () => {
    queueDice(100, [87]);
    expect(rollExpression("d%")!.total).toBe(87);
  });

  it("keeps the highest dice, preserving roll order", () => {
    queueDice(6, [1, 6, 4, 5]);
    const result = rollExpression("4d6kh3")!;
    expect(result.kept).toEqual([6, 4, 5]);
    expect(result.dropped).toEqual([1]);
    expect(result.total).toBe(15);
  });

  it("supports keep-lowest and drop-lowest", () => {
    queueDice(20, [12, 3]);
    expect(rollExpression("2d20kl1")!.total).toBe(3);
    queueDice(6, [2, 2, 5, 6]);
    expect(rollExpression("4d6dl1")!.kept).toEqual([2, 5, 6]);
  });

  it("explodes on the max face and formats with a space before =", () => {
    queueDice(6, [6, 2]);
    const result = rollExpression("1d6!")!;
    expect(result.rolls).toEqual([6, 2]);
    expect(formatRollResult(result)).toBe("1d6! =8");
  });

  it("explodes on a compare point", () => {
    queueDice(6, [5, 3]);
    expect(rollExpression("1d6!>=5")!.rolls).toEqual([5, 3]);
  });

  it("caps runaway explosions", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(rollExpression("1d6!")!.rolls).toHaveLength(1001);
  });

  it("counts pool successes minus failures", () => {
    queueDice(10, [7, 3, 10, 1, 8]);
    const result = rollExpression("5d10>=7f=1")!;
    expect(result.isPool).toBe(true);
    expect(result.successes).toBe(2);
    expect(result.failures).toBe(1);
    expect(formatRollResult(result)).toBe("5d10>=7f=1=2");
  });

  it("keeps Fudge dice within -1..1", () => {
    for (const r of [0, 0.34, 0.99]) {
      vi.spyOn(Math, "random").mockReturnValue(r);
      expect(rollExpression("dF")!.total).toBe(r < 1 / 3 ? -1 : r < 2 / 3 ? 0 : 1);
    }
  });
});

describe("Part II: min and max", () => {
  it("raises rolls below the minimum (spec: 4d6min3 = 13)", () => {
    queueDice(6, [1, 4, 2, 3]);
    const result = rollExpression("4d6min3")!;
    expect(result.rolls).toEqual([3, 4, 3, 3]);
    expect(result.total).toBe(13);
  });

  it("lowers rolls above the maximum (spec: 4d6max3 = 11)", () => {
    queueDice(6, [5, 6, 3, 2]);
    expect(rollExpression("4d6max3")!.total).toBe(11);
  });
});

describe("Part II: compounding", () => {
  it("adds re-rolls onto the same die (spec: 2d6!! = [4, 14] = 18)", () => {
    queueDice(6, [4, 6, 6, 2]);
    const result = rollExpression("2d6!!")!;
    expect(result.rolls).toEqual([4, 14]);
    expect(formatRollResult(result)).toBe("2d6!! =18");
  });

  it("compounds on a compare point", () => {
    queueDice(6, [4, 4, 1]);
    expect(rollExpression("1d6!!=4")!.rolls).toEqual([9]);
  });

  it("caps runaway compounding", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(rollExpression("1d6!!")!.total).toBe(6 * 1001);
  });
});

describe("Part II: re-roll", () => {
  it("re-rolls 1s until something else comes up", () => {
    queueDice(6, [1, 1, 5]);
    expect(rollExpression("d6r")!.rolls).toEqual([5]);
  });

  it("re-rolls only once with ro, even onto another 1", () => {
    queueDice(6, [1, 1]);
    expect(rollExpression("d6ro")!.rolls).toEqual([1]);
  });

  it("re-rolls dice matching a compare point", () => {
    queueDice(6, [5, 3, 2]);
    expect(rollExpression("2d6r=5")!.rolls).toEqual([2, 3]);
    queueDice(10, [2, 9, 3, 1, 7, 8]);
    expect(rollExpression("2d10r<=3")!.rolls).toEqual([7, 9]);
  });
});

describe("Part II: modifier order", () => {
  it("runs modifiers in the spec's order whatever order they're written in", () => {
    // Explode first (order 3), then keep the highest 2 (order 6), however it's written.
    for (const expr of ["3d6!k2", "3d6k2!"]) {
      queueDice(6, [6, 2, 3, 5]);
      const result = rollExpression(expr)!;
      expect(result.rolls).toEqual([6, 5, 2, 3]);
      expect(result.kept).toEqual([6, 5]);
    }
  });

  it("binds a compare point after ! to the explosion, and one before it to the success target", () => {
    expect(parseDiceExpression("2d6!>3")).toMatchObject({ explode: { compound: false, at: { op: ">", target: 3 } } });
    expect(parseDiceExpression("2d6!>3")!.success).toBeUndefined();
    expect(parseDiceExpression("2d6>3!")).toMatchObject({ success: { op: ">", target: 3 }, explode: { compound: false } });
    expect(parseDiceExpression("2d6>3!")!.explode!.at).toBeUndefined();
  });

  it("reads !! with != as compound-on, as the spec warns", () => {
    expect(parseDiceExpression("2d6!!=4")).toMatchObject({ explode: { compound: true, at: { op: "=", target: 4 } } });
  });

  it("rejects a repeated modifier and a failure target not right after a success target", () => {
    for (const expr of ["4d6kh1kl1", "d6!!!", "d6rr", "4d6min2min3", "4d6f<3", "4d6f<3>4", "4d6>4kh3f<3", "d6+1kh1"]) {
      expect(parseDiceExpression(expr), expr).toBeUndefined();
    }
  });
});

describe("engine and highlighter agree", () => {
  it.each([
    "d6", "2d6+3", "d%", "4dF", "4d6kh3", "4d6dl1", "2d20kl1", "3d6!", "5d10!>=8", "5d10>=7f=1",
    "4d6min3", "4d6max3", "2d6!!", "2d6!!=4", "d6r", "d6ro", "2d6r=5", "4d10r<=3",
    "5d10!k2", "5d10k2!", "2d6>3!", "4d6min2kh3+1"
  ])("%s is both rollable and highlighted", (expr) => {
    expect(parseDiceExpression(expr)).toBeDefined();
    expect(isDiceExpression(expr)).toBe(true);
  });
});
