import { describe, expect, it, vi } from "vitest";
import { askOracle, formatOracleResult } from "./oracleEngine";

/** Makes the oracle's 1d100 land on `roll`; later Math.random calls get `fallback`. */
function rollD100(roll: number, fallback = 0) {
  vi.spyOn(Math, "random").mockReturnValue(fallback).mockReturnValueOnce((roll - 0.5) / 100);
}

describe("askOracle", () => {
  it("returns undefined for an unknown likelihood", () => {
    expect(askOracle("maybe", 5)).toBeUndefined();
  });

  it("shifts the threshold by 5 per chaos step and clamps it", () => {
    rollD100(1);
    expect(askOracle("fifty_fifty", 5)!.threshold).toBe(50);
    rollD100(1);
    expect(askOracle("fifty_fifty", 9)!.threshold).toBe(70);
    rollD100(1);
    expect(askOracle("fifty_fifty", 1)!.threshold).toBe(30);
    rollD100(1);
    expect(askOracle("certain", 9)!.threshold).toBe(97);
    rollD100(1);
    expect(askOracle("impossible", 1)!.threshold).toBe(3);
  });

  it("clamps the chaos factor to 1-9", () => {
    rollD100(1);
    expect(askOracle("fifty_fifty", 12)!.chaosFactor).toBe(9);
  });

  it("answers yes at or under the threshold, no above it", () => {
    rollD100(50);
    expect(askOracle("fifty_fifty", 5)!.answer).toBe("yes");
    rollD100(51);
    expect(askOracle("fifty_fifty", 5)!.answer).toBe("no");
  });

  it("flags exceptional results in the outer 10% of each side", () => {
    rollD100(5);
    expect(askOracle("fifty_fifty", 5)).toMatchObject({ answer: "yes", exceptional: true, modifier: "and" });
    rollD100(6);
    expect(askOracle("fifty_fifty", 5)!.exceptional).toBe(false);
    rollD100(95);
    expect(askOracle("fifty_fifty", 5)).toMatchObject({ answer: "no", exceptional: true });
  });

  it("picks and/but by which half of the answer's range the roll fell in", () => {
    rollD100(40);
    expect(askOracle("fifty_fifty", 5)!.modifier).toBe("but");
    rollD100(60);
    expect(askOracle("fifty_fifty", 5)!.modifier).toBe("but");
    rollD100(80);
    expect(askOracle("fifty_fifty", 5)!.modifier).toBe("and");
  });

  it("triggers a random event on doubles no higher than the chaos factor", () => {
    rollD100(55);
    expect(askOracle("fifty_fifty", 5)!.randomEvent).toBe(true);
    rollD100(66);
    expect(askOracle("fifty_fifty", 5)!.randomEvent).toBe(false);
    rollD100(66);
    expect(askOracle("fifty_fifty", 6)!.randomEvent).toBe(true);
    rollD100(100);
    expect(askOracle("fifty_fifty", 9)!.randomEvent).toBe(false);
  });
});

describe("formatOracleResult", () => {
  it("matches the lonelog worked-example style", () => {
    rollD100(40);
    expect(formatOracleResult(askOracle("fifty_fifty", 4)!)).toBe("Yes, but... (CF=4)");
    rollD100(99);
    expect(formatOracleResult(askOracle("fifty_fifty", 7)!)).toBe("Exceptional No (CF=7)");
  });

  it("appends a random event line when triggered", () => {
    rollD100(33);
    const text = formatOracleResult(askOracle("fifty_fifty", 5)!);
    expect(text.split("\n")[1]).toMatch(/^Random Event: Event Focus: .+ — Subject: .+$/);
  });
});
