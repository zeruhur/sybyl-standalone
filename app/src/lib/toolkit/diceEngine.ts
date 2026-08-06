/** Dice roll engine for the Lonelog Dice Notation Add-on (Part I practical subset).
 * Executes exactly the expression shape `diceNotation.ts` recognizes — same written-order
 * assumption (keep/drop before exploding before success/failure before flat modifier).
 * Grammar source: lonelog-dice-notation-addon.md Part I. Not the full Part II grammar
 * (min/max, compounding/penetrating, reroll, unique, critical success/failure, sorting,
 * group rolls, parenthesized math) — diceNotation.ts doesn't recognize those either. */

const COMPARE_POINT = "(?:>=|<=|!=|<>|=|<|>)";

const EXPRESSION_REGEX = new RegExp(
  "^(?<count>\\d{0,3})d(?<sides>\\d{1,3}|%|F(?:\\.[12])?)" +
    `(?:(?<kdOp>kh|kl|dh|dl|k|d)(?<kdNum>\\d{0,2}))?` +
    `(?:(?<explode>!)(?:(?<explodeOp>${COMPARE_POINT})(?<explodeNum>\\d+))?)?` +
    `(?:(?<successOp>${COMPARE_POINT})(?<successNum>\\d+))?` +
    `(?:f(?<failOp>${COMPARE_POINT})(?<failNum>\\d+))?` +
    `(?:(?<modSign>[+-])(?<modNum>\\d+))?$`
);

const MAX_EXPLODE_ITERATIONS = 1000;

export interface DiceRollResult {
  expression: string;
  rolls: number[];
  kept: number[];
  dropped: number[];
  total?: number;
  successes?: number;
  failures?: number;
  isPool: boolean;
}

function compare(value: number, op: string, target: number): boolean {
  switch (op) {
    case "=":
      return value === target;
    case "!=":
    case "<>":
      return value !== target;
    case "<":
      return value < target;
    case ">":
      return value > target;
    case "<=":
      return value <= target;
    case ">=":
      return value >= target;
    default:
      return false;
  }
}

function rollFudgeDie(variant: "1" | "2"): number {
  const roll = Math.random();
  if (variant === "1") {
    if (roll < 1 / 6) return -1;
    if (roll < 2 / 6) return 1;
    return 0;
  }
  if (roll < 1 / 3) return -1;
  if (roll < 2 / 3) return 0;
  return 1;
}

function rollDie(sides: number | "fudge1" | "fudge2"): number {
  if (sides === "fudge1") return rollFudgeDie("1");
  if (sides === "fudge2") return rollFudgeDie("2");
  return 1 + Math.floor(Math.random() * sides);
}

function maxFaceValue(sides: number | "fudge1" | "fudge2"): number {
  if (sides === "fudge1" || sides === "fudge2") return 1;
  return sides;
}

/** Parses and rolls a Part-I dice expression (no leading/trailing whitespace). Returns
 * `undefined` if the expression doesn't match the supported grammar. */
export function rollExpression(expr: string): DiceRollResult | undefined {
  const match = EXPRESSION_REGEX.exec(expr.trim());
  if (!match || !match.groups) return undefined;
  const g = match.groups;

  const count = g.count ? parseInt(g.count, 10) : 1;
  const sides: number | "fudge1" | "fudge2" =
    g.sides === "%" ? 100 : g.sides === "F" || g.sides === "F.2" ? "fudge2" : g.sides === "F.1" ? "fudge1" : parseInt(g.sides, 10);
  if (count < 1 || count > 999) return undefined;

  let rolls = Array.from({ length: count }, () => rollDie(sides));

  if (g.explode) {
    const explodeOp = g.explodeOp;
    const explodeTarget = g.explodeNum ? parseInt(g.explodeNum, 10) : maxFaceValue(sides);
    const triggers = (value: number) => (explodeOp ? compare(value, explodeOp, explodeTarget) : value === explodeTarget);
    const exploded: number[] = [];
    for (const value of rolls) {
      exploded.push(value);
      let current = value;
      let iterations = 0;
      while (triggers(current) && iterations < MAX_EXPLODE_ITERATIONS) {
        current = rollDie(sides);
        exploded.push(current);
        iterations += 1;
      }
    }
    rolls = exploded;
  }

  let kept = rolls;
  let dropped: number[] = [];
  if (g.kdOp) {
    const n = g.kdNum ? parseInt(g.kdNum, 10) : 1;
    const sorted = [...rolls].map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const isKeep = g.kdOp === "k" || g.kdOp === "kh" || g.kdOp === "kl";
    const isHigh = g.kdOp === "kh" || g.kdOp === "k" || g.kdOp === "dh";
    let keepIndices: Set<number>;
    if (isKeep) {
      const selected = isHigh ? sorted.slice(-n) : sorted.slice(0, n);
      keepIndices = new Set(selected.map((s) => s.index));
    } else {
      const dropSelected = isHigh ? sorted.slice(-n) : sorted.slice(0, n);
      const dropIndices = new Set(dropSelected.map((s) => s.index));
      keepIndices = new Set(rolls.map((_, index) => index).filter((index) => !dropIndices.has(index)));
    }
    kept = rolls.filter((_, index) => keepIndices.has(index));
    dropped = rolls.filter((_, index) => !keepIndices.has(index));
  }

  const modifier = g.modSign && g.modNum ? parseInt(`${g.modSign}${g.modNum}`, 10) : 0;

  if (g.successOp) {
    const successTarget = parseInt(g.successNum, 10);
    const successes = kept.filter((value) => compare(value, g.successOp!, successTarget)).length;
    let failures = 0;
    if (g.failOp) {
      const failTarget = parseInt(g.failNum, 10);
      failures = kept.filter((value) => compare(value, g.failOp!, failTarget)).length;
    }
    return {
      expression: expr,
      rolls,
      kept,
      dropped,
      successes: successes - failures + modifier,
      failures: g.failOp ? failures : undefined,
      isPool: true
    };
  }

  const total = kept.reduce((sum, value) => sum + value, 0) + modifier;
  return { expression: expr, rolls, kept, dropped, total, isPool: false };
}

/** Renders a roll result using the addon's `expr=total` convention (lonelog-dice-notation-addon.md
 * Part I), inserting a space before `=` whenever the expression contains `!` — the addon's own
 * documented ambiguity case (`2d6!=13` parses as a compare point, `2d6! =13` records a result). */
export function formatRollResult(result: DiceRollResult): string {
  const value = result.isPool ? result.successes : result.total;
  const sep = result.expression.includes("!") ? " =" : "=";
  return `${result.expression}${sep}${value}`;
}
