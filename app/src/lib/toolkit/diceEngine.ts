/** Dice roll engine for the Lonelog Dice Notation Add-on: Part I plus the first slice of Part II
 * (min/max, compounding, re-roll). Modifiers may be written in any order and run in the spec's
 * fixed order (lonelog-dice-notation-addon.md Part II §2): min, max, explode/compound, re-roll,
 * keep/drop, then target success/failure, with a flat modifier last. Recognized for highlighting
 * by `diceNotation.ts`, which must accept the same grammar (diceEngine.test.ts checks this).
 * Not yet supported: penetrating, unique, critical success/failure, sorting, group rolls, and
 * parenthesized math. */

const COMPARE_POINT = "(>=|<=|!=|<>|=|<|>)";

/** One modifier per alternative, tried in this order at each position. A compare point directly
 * after `!`, `!!`, `r` or `ro` belongs to that modifier; one standing alone is a success target
 * (so `2d6!>3` explodes above 3, while `2d6>3!` counts >3 as a success and explodes on 6). */
const MODIFIERS = {
  min: /min(\d+)/y,
  max: /max(\d+)/y,
  explode: new RegExp(`(!!?)(?:${COMPARE_POINT}(\\d+))?`, "y"),
  reroll: new RegExp(`(ro?)(?:${COMPARE_POINT}(\\d+))?`, "y"),
  keep: /(kh|kl|dh|dl|k|d)(\d{0,2})/y,
  failure: new RegExp(`f${COMPARE_POINT}(\\d+)`, "y"),
  success: new RegExp(`${COMPARE_POINT}(\\d+)`, "y"),
  flat: /([+-])(\d+)$/y
};

const BASE = /^(\d{0,3})d(\d{1,3}|%|F(?:\.[12])?)/;

const MAX_ITERATIONS = 1000;

type Sides = number | "fudge1" | "fudge2";

interface Compare {
  op: string;
  target: number;
}

export interface DiceSpec {
  count: number;
  sides: Sides;
  min?: number;
  max?: number;
  explode?: { compound: boolean; at?: Compare };
  reroll?: { once: boolean; at?: Compare };
  keep?: { op: "kh" | "kl" | "dh" | "dl"; n: number };
  success?: Compare;
  failure?: Compare;
  modifier: number;
}

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

/** Parses a dice expression, or returns undefined if it isn't one this engine supports (unknown
 * modifiers, a modifier given twice, `f` not right after a success target, ...). */
export function parseDiceExpression(expr: string): DiceSpec | undefined {
  const text = expr.trim();
  const base = BASE.exec(text);
  if (!base) return undefined;
  const count = base[1] ? parseInt(base[1], 10) : 1;
  if (count < 1 || count > 999) return undefined;
  const rawSides = base[2];
  const sides: Sides =
    rawSides === "%" ? 100 : rawSides === "F" || rawSides === "F.2" ? "fudge2" : rawSides === "F.1" ? "fudge1" : parseInt(rawSides, 10);
  if (typeof sides === "number" && sides < 1) return undefined;

  const spec: DiceSpec = { count, sides, modifier: 0 };
  const compare = (op?: string, target?: string): Compare | undefined =>
    op !== undefined && target !== undefined ? { op, target: parseInt(target, 10) } : undefined;

  let pos = base[0].length;
  let previous: keyof typeof MODIFIERS | null = null;
  while (pos < text.length) {
    let matched: keyof typeof MODIFIERS | null = null;
    let m: RegExpExecArray | null = null;
    for (const name of Object.keys(MODIFIERS) as (keyof typeof MODIFIERS)[]) {
      const re = MODIFIERS[name];
      re.lastIndex = pos;
      m = re.exec(text);
      if (m) {
        matched = name;
        break;
      }
    }
    if (!matched || !m) return undefined;

    switch (matched) {
      case "min":
        if (spec.min !== undefined) return undefined;
        spec.min = parseInt(m[1], 10);
        break;
      case "max":
        if (spec.max !== undefined) return undefined;
        spec.max = parseInt(m[1], 10);
        break;
      case "explode":
        if (spec.explode) return undefined;
        spec.explode = { compound: m[1] === "!!", at: compare(m[2], m[3]) };
        break;
      case "reroll":
        if (spec.reroll) return undefined;
        spec.reroll = { once: m[1] === "ro", at: compare(m[2], m[3]) };
        break;
      case "keep": {
        if (spec.keep) return undefined;
        const op = m[1] === "k" ? "kh" : m[1] === "d" ? "dl" : (m[1] as "kh" | "kl" | "dh" | "dl");
        spec.keep = { op, n: m[2] ? parseInt(m[2], 10) : 1 };
        break;
      }
      case "failure":
        // The spec: target failure must directly follow a target success.
        if (previous !== "success" || spec.failure) return undefined;
        spec.failure = compare(m[1], m[2]);
        break;
      case "success":
        if (spec.success) return undefined;
        spec.success = compare(m[1], m[2]);
        break;
      case "flat":
        spec.modifier = parseInt(`${m[1]}${m[2]}`, 10);
        break;
    }
    previous = matched;
    pos += m[0].length;
  }
  return spec;
}

function compareValue(value: number, { op, target }: Compare): boolean {
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

function rollFace(sides: Sides): number {
  if (sides === "fudge1") return rollFudgeDie("1");
  if (sides === "fudge2") return rollFudgeDie("2");
  return 1 + Math.floor(Math.random() * sides);
}

const highestFace = (sides: Sides) => (typeof sides === "number" ? sides : 1);
const lowestFace = (sides: Sides) => (typeof sides === "number" ? 1 : -1);

/** Rolls a spec, applying modifiers in the spec's order: min, max, explode/compound, re-roll,
 * keep/drop, target success/failure, flat modifier. */
export function rollDiceSpec(spec: DiceSpec, expression: string): DiceRollResult {
  // Min and max (orders 1-2) apply to every die rolled, re-rolls and explosions included.
  const rollDie = () => {
    let value = rollFace(spec.sides);
    if (spec.min !== undefined) value = Math.max(value, spec.min);
    if (spec.max !== undefined) value = Math.min(value, spec.max);
    return value;
  };

  let rolls = Array.from({ length: spec.count }, rollDie);

  // Order 3: exploding adds each re-roll as a new die; compounding adds it onto the same die.
  if (spec.explode) {
    const { compound, at } = spec.explode;
    const triggers = (value: number) => (at ? compareValue(value, at) : value === highestFace(spec.sides));
    const exploded: number[] = [];
    for (const first of rolls) {
      let current = first;
      let sum = first;
      if (!compound) exploded.push(first);
      for (let i = 0; i < MAX_ITERATIONS && triggers(current); i++) {
        current = rollDie();
        if (compound) sum += current;
        else exploded.push(current);
      }
      if (compound) exploded.push(sum);
    }
    rolls = exploded;
  }

  // Order 4: re-roll replaces a die (by default one showing the lowest face), indefinitely or once.
  if (spec.reroll) {
    const { once, at } = spec.reroll;
    const matches = (value: number) => (at ? compareValue(value, at) : value === lowestFace(spec.sides));
    rolls = rolls.map((first) => {
      let value = first;
      for (let i = 0; i < (once ? 1 : MAX_ITERATIONS) && matches(value); i++) value = rollDie();
      return value;
    });
  }

  // Orders 6-7: keep or drop, keeping the dice in rolled order.
  let kept = rolls;
  let dropped: number[] = [];
  if (spec.keep) {
    const { op, n } = spec.keep;
    const ascending = rolls.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const highest = (k: number) => ascending.slice(Math.max(0, ascending.length - k));
    const lowest = (k: number) => ascending.slice(0, k);
    const selected = op === "kh" ? highest(n) : op === "kl" ? lowest(n) : op === "dh" ? highest(n) : lowest(n);
    const selectedIndices = new Set(selected.map((s) => s.index));
    const isKeep = op === "kh" || op === "kl";
    kept = rolls.filter((_, i) => selectedIndices.has(i) === isKeep);
    dropped = rolls.filter((_, i) => selectedIndices.has(i) !== isKeep);
  }

  // Order 8: a target turns the roll into a dice pool counting successes (minus failures).
  if (spec.success) {
    const successes = kept.filter((value) => compareValue(value, spec.success!)).length;
    const failures = spec.failure ? kept.filter((value) => compareValue(value, spec.failure!)).length : 0;
    return {
      expression,
      rolls,
      kept,
      dropped,
      successes: successes - failures + spec.modifier,
      failures: spec.failure ? failures : undefined,
      isPool: true
    };
  }

  const total = kept.reduce((sum, value) => sum + value, 0) + spec.modifier;
  return { expression, rolls, kept, dropped, total, isPool: false };
}

/** Parses and rolls a dice expression. Returns `undefined` if it isn't one this engine supports. */
export function rollExpression(expr: string): DiceRollResult | undefined {
  const spec = parseDiceExpression(expr);
  return spec ? rollDiceSpec(spec, expr) : undefined;
}

/** Renders a roll result using the addon's `expr=total` convention (lonelog-dice-notation-addon.md
 * Part I), inserting a space before `=` whenever the expression contains `!` — the addon's own
 * documented ambiguity case (`2d6!=13` parses as a compare point, `2d6! =13` records a result). */
export function formatRollResult(result: DiceRollResult): string {
  const value = result.isPool ? result.successes : result.total;
  const sep = result.expression.includes("!") ? " =" : "=";
  return `${result.expression}${sep}${value}`;
}
