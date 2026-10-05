import { describe, expect, it, vi } from "vitest";
import { formatRollResult, rollExpression } from "./diceEngine";
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
