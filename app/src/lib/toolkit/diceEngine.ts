/** Dice roll engine for the Lonelog Dice Notation Add-on (v1.1.0): Part I and the Appendix grammar.
 *
 * A single dice term (`4d6dl1`, `2d6!>4`, `5d10>=7f<2`) is parsed by `parseDiceExpression()`. Its
 * modifiers may be written in any order and run in the spec's fixed order (Appendix A.2): min,
 * max, explode/compound/penetrate, re-roll, unique, keep, drop, target success/failure, critical
 * success/failure, sort, with a flat modifier last. `rollExpression()` also handles arithmetic
 * around dice terms (`(1d6+2)*3`, `2d10/d20`, `3d(2*6)`, `^`/`**`, `%`) and group rolls
 * (`{4d6, 2d8}k1`, `{d8!, d6!}kh1`, `{3d20+5}>40`). Recognized for highlighting by
 * `diceNotation.ts`, which must accept the same single-term grammar (diceEngine.test.ts checks).
 *
 * Not supported: keep/drop on a group with a single sub-roll (`{4d10*(2+5d6)}k2`), which would
 * mean recomputing the arithmetic without the dropped dice; such an expression is rejected. */

const COMPARE_POINT = "(>=|<=|!=|<>|=|<|>)";

/** One modifier per alternative, tried in this order at each position. A compare point directly
 * after `!`, `!!`, `r`, `u`, `cs` or `cf` belongs to that modifier; one standing alone is a
 * success target (so `2d6!>3` explodes above 3, while `2d6>3!` counts >3 as a success and
 * explodes on 6). */
const MODIFIERS = {
  min: /min(\d+)/y,
  max: /max(\d+)/y,
  explode: new RegExp(`(!!?)(p?)(?:${COMPARE_POINT}(\\d+))?`, "y"),
  reroll: new RegExp(`(ro?)(?:${COMPARE_POINT}(\\d+))?`, "y"),
  unique: new RegExp(`(uo?)(?:${COMPARE_POINT}(\\d+))?`, "y"),
  keep: /(kh|kl|dh|dl|k|d)(\d{0,2})/y,
  critical: new RegExp(`(cs|cf)(?:${COMPARE_POINT}(\\d+))?`, "y"),
  sort: /s([ad]?)/y,
  failure: new RegExp(`f${COMPARE_POINT}(\\d+)`, "y"),
  success: new RegExp(`${COMPARE_POINT}(\\d+)`, "y"),
  flat: /([+-])(\d+)$/y
};

type ModifierName = keyof typeof MODIFIERS;

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
  explode?: { compound: boolean; penetrate: boolean; at?: Compare };
  reroll?: { once: boolean; at?: Compare };
  unique?: { once: boolean; at?: Compare };
  keep?: { op: "kh" | "kl"; n: number };
  drop?: { dh?: number; dl?: number };
  success?: Compare;
  failure?: Compare;
  critSuccess?: { at?: Compare };
  critFailure?: { at?: Compare };
  sort?: "asc" | "desc";
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
  /** Dice marked by `cs`/`cf` (aesthetic in the spec: they don't change the result). */
  criticalSuccesses?: number;
  criticalFailures?: number;
  isPool: boolean;
}

function compare(op?: string, target?: string): Compare | undefined {
  return op !== undefined && target !== undefined ? { op, target: parseInt(target, 10) } : undefined;
}

/** Reads modifiers from `pos` into `spec`. Returns the position after them, or undefined on an
 * error (a modifier given twice, `f` not right after a success target). With `toEnd`, everything
 * up to the end of `text` must be a modifier (a flat `+N`/`-N` allowed last); otherwise reading
 * stops at the first thing that isn't one, and arithmetic is left to the caller. */
function readModifiers(text: string, pos: number, spec: DiceSpec, toEnd: boolean): number | undefined {
  let previous: ModifierName | null = null;
  while (pos < text.length) {
    let matched: ModifierName | null = null;
    let m: RegExpExecArray | null = null;
    for (const name of Object.keys(MODIFIERS) as ModifierName[]) {
      if (name === "flat" && !toEnd) continue;
      const re = MODIFIERS[name];
      re.lastIndex = pos;
      m = re.exec(text);
      if (m) {
        matched = name;
        break;
      }
    }
    if (!matched || !m) return toEnd ? undefined : pos;

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
        spec.explode = { compound: m[1] === "!!", penetrate: m[2] === "p", at: compare(m[3], m[4]) };
        break;
      case "reroll":
        if (spec.reroll) return undefined;
        spec.reroll = { once: m[1] === "ro", at: compare(m[2], m[3]) };
        break;
      case "unique":
        if (spec.unique) return undefined;
        spec.unique = { once: m[1] === "uo", at: compare(m[2], m[3]) };
        break;
      case "keep": {
        const n = m[2] ? parseInt(m[2], 10) : 1;
        // `k` alone keeps the highest, `d` alone drops the lowest. One keep, and one drop per
        // direction: `4d10dh1dl2` drops the highest and the lowest two.
        const op = m[1] === "k" ? "kh" : m[1] === "d" ? "dl" : m[1];
        if (op === "kh" || op === "kl") {
          if (spec.keep) return undefined;
          spec.keep = { op, n };
        } else {
          const drop = spec.drop ?? {};
          if (drop[op as "dh" | "dl"] !== undefined) return undefined;
          drop[op as "dh" | "dl"] = n;
          spec.drop = drop;
        }
        break;
      }
      case "critical": {
        const key = m[1] === "cs" ? "critSuccess" : "critFailure";
        if (spec[key]) return undefined;
        spec[key] = { at: compare(m[2], m[3]) };
        break;
      }
      case "sort":
        if (spec.sort) return undefined;
        spec.sort = m[1] === "d" ? "desc" : "asc";
        break;
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
  return pos;
}

function parseSides(raw: string): Sides | undefined {
  if (raw === "%") return 100;
  if (raw === "F" || raw === "F.2") return "fudge2";
  if (raw === "F.1") return "fudge1";
  const n = parseInt(raw, 10);
  return n >= 1 ? n : undefined;
}

/** Parses a single dice term, or returns undefined if it isn't one this engine supports (unknown
 * modifiers, a modifier given twice, `f` not right after a success target, ...). */
export function parseDiceExpression(expr: string): DiceSpec | undefined {
  const text = expr.trim();
  const base = BASE.exec(text);
  if (!base) return undefined;
  const count = base[1] ? parseInt(base[1], 10) : 1;
  if (count < 1 || count > 999) return undefined;
  const sides = parseSides(base[2]);
  if (sides === undefined) return undefined;
  const spec: DiceSpec = { count, sides, modifier: 0 };
  return readModifiers(text, base[0].length, spec, true) === undefined ? undefined : spec;
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

/** Indices of the `n` highest or lowest values; ties go to the earlier die. */
function pick(values: number[], n: number, highest: boolean): Set<number> {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const chosen = highest ? order.slice(Math.max(0, order.length - n)) : order.slice(0, n);
  return new Set(chosen.map((c) => c.index));
}

/** Indices dropped by keep and drop. Each looks at the full pool, including dice the other already
 * dropped (Appendix A.2, Drop): `3d10k1dh1` can drop everything. */
function droppedIndices(values: number[], spec: Pick<DiceSpec, "keep" | "drop">): Set<number> {
  const dropped = new Set<number>();
  if (spec.keep) {
    const kept = pick(values, spec.keep.n, spec.keep.op === "kh");
    values.forEach((_, i) => !kept.has(i) && dropped.add(i));
  }
  if (spec.drop?.dh !== undefined) pick(values, spec.drop.dh, true).forEach((i) => dropped.add(i));
  if (spec.drop?.dl !== undefined) pick(values, spec.drop.dl, false).forEach((i) => dropped.add(i));
  return dropped;
}

function sortValues(values: number[], order: "asc" | "desc" | undefined): number[] {
  if (!order) return values;
  return [...values].sort((a, b) => (order === "asc" ? a - b : b - a));
}

/** Rolls a spec, applying modifiers in the spec's order. */
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
  // Penetrating subtracts 1 from each re-roll, but whether it explodes again is decided on the
  // die as rolled (the spec's `2d6!p`: actual rolls 6, 6, 6, 4 count as 6, 5, 5, 3).
  if (spec.explode) {
    const { compound, penetrate, at } = spec.explode;
    const triggers = (value: number) => (at ? compareValue(value, at) : value === highestFace(spec.sides));
    const exploded: number[] = [];
    for (const first of rolls) {
      let raw = first;
      let sum = first;
      if (!compound) exploded.push(first);
      for (let i = 0; i < MAX_ITERATIONS && triggers(raw); i++) {
        raw = rollDie();
        const value = penetrate ? raw - 1 : raw;
        if (compound) sum += value;
        else exploded.push(value);
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

  // Order 5: unique re-rolls a die that repeats an earlier one (only values matching the compare
  // point, when there is one), indefinitely or once.
  if (spec.unique) {
    const { once, at } = spec.unique;
    for (let i = 1; i < rolls.length; i++) {
      for (let n = 0; n < (once ? 1 : MAX_ITERATIONS); n++) {
        const value = rolls[i];
        if (!rolls.slice(0, i).includes(value) || (at && !compareValue(value, at))) break;
        rolls[i] = rollDie();
      }
    }
  }

  // Orders 6-7: keep and drop, keeping the dice in rolled order.
  const dropSet = droppedIndices(rolls, spec);
  const kept = rolls.filter((_, i) => !dropSet.has(i));
  const dropped = rolls.filter((_, i) => dropSet.has(i));

  // Orders 9-10: critical success/failure only mark dice; the result doesn't change.
  const criticals = (mark: { at?: Compare } | undefined, face: number) =>
    mark ? kept.filter((v) => (mark.at ? compareValue(v, mark.at) : v === face)).length : undefined;
  const criticalSuccesses = criticals(spec.critSuccess, highestFace(spec.sides));
  const criticalFailures = criticals(spec.critFailure, lowestFace(spec.sides));

  // Order 11: sorting only changes how the dice are listed.
  const shown = { rolls: sortValues(rolls, spec.sort), kept: sortValues(kept, spec.sort), dropped: sortValues(dropped, spec.sort) };

  // Order 8: a target turns the roll into a dice pool counting successes (minus failures).
  if (spec.success) {
    const successes = kept.filter((value) => compareValue(value, spec.success!)).length;
    const failures = spec.failure ? kept.filter((value) => compareValue(value, spec.failure!)).length : 0;
    return {
      expression,
      ...shown,
      successes: successes - failures + spec.modifier,
      failures: spec.failure ? failures : undefined,
      criticalSuccesses,
      criticalFailures,
      isPool: true
    };
  }

  const total = kept.reduce((sum, value) => sum + value, 0) + spec.modifier;
  return { expression, ...shown, total, criticalSuccesses, criticalFailures, isPool: false };
}

/** A rolled part of an arithmetic expression. */
interface Term {
  value: number;
  rolls: number[];
  kept: number[];
  dropped: number[];
  isPool: boolean;
  /** Whether any dice were rolled in it. */
  hasDice: boolean;
}

const constant = (value: number): Term => ({ value, rolls: [], kept: [], dropped: [], isPool: false, hasDice: false });

function combine(a: Term, b: Term, value: number): Term {
  return {
    value,
    rolls: [...a.rolls, ...b.rolls],
    kept: [...a.kept, ...b.kept],
    dropped: [...a.dropped, ...b.dropped],
    isPool: false,
    hasDice: a.hasDice || b.hasDice
  };
}

const GROUP_MODIFIERS = {
  keep: /(kh|kl|dh|dl|k|d)(\d{0,2})/y,
  sort: /s([ad]?)/y,
  failure: new RegExp(`f${COMPARE_POINT}(\\d+)`, "y"),
  success: new RegExp(`${COMPARE_POINT}(\\d+)`, "y")
};

/** Recursive-descent parser for the add-on's math (Appendix A.5) and group rolls (A.3). Rolls as
 * it parses; any syntax it doesn't understand makes the whole expression undefined. */
class MathRoller {
  private pos = 0;

  constructor(private readonly text: string) {}

  roll(): Term | undefined {
    const term = this.expression();
    this.skipSpace();
    return term && this.pos === this.text.length && term.hasDice && Number.isFinite(term.value) ? term : undefined;
  }

  private skipSpace() {
    while (this.text[this.pos] === " ") this.pos++;
  }

  private at(s: string): boolean {
    return this.text.startsWith(s, this.pos);
  }

  // expression := product (('+' | '-') product)*
  private expression(): Term | undefined {
    let left = this.product();
    while (left) {
      this.skipSpace();
      const op = this.text[this.pos];
      if (op !== "+" && op !== "-") return left;
      this.pos++;
      const right = this.product();
      if (!right) return undefined;
      left = combine(left, right, op === "+" ? left.value + right.value : left.value - right.value);
    }
    return undefined;
  }

  // product := power (('*' | '/' | '%') power)*
  private product(): Term | undefined {
    let left = this.power();
    while (left) {
      this.skipSpace();
      const op = this.text[this.pos];
      if (!((op === "*" && !this.at("**")) || op === "/" || op === "%")) return left;
      this.pos++;
      const right = this.power();
      if (!right) return undefined;
      const value = op === "*" ? left.value * right.value : op === "/" ? left.value / right.value : left.value % right.value;
      left = combine(left, right, value);
    }
    return undefined;
  }

  // power := unary (('^' | '**') power)?   (right-associative)
  private power(): Term | undefined {
    const base = this.unary();
    if (!base) return undefined;
    this.skipSpace();
    const op = this.at("**") ? "**" : this.at("^") ? "^" : null;
    if (!op) return base;
    this.pos += op.length;
    const exponent = this.power();
    return exponent && combine(base, exponent, base.value ** exponent.value);
  }

  private unary(): Term | undefined {
    this.skipSpace();
    if (this.at("-")) {
      this.pos++;
      const inner = this.unary();
      return inner && { ...inner, value: -inner.value, isPool: false };
    }
    return this.primary();
  }

  private primary(): Term | undefined {
    this.skipSpace();
    if (this.at("{")) return this.group();
    if (this.at("(")) {
      this.pos++;
      const inner = this.expression();
      this.skipSpace();
      if (!inner || !this.at(")")) return undefined;
      this.pos++;
      return this.at("d") ? this.dice(inner) : inner;
    }
    const number = /\d+/y;
    number.lastIndex = this.pos;
    const n = number.exec(this.text);
    if (n) {
      this.pos += n[0].length;
      const count = constant(parseInt(n[0], 10));
      return this.at("d") ? this.dice(count) : count;
    }
    if (this.at("d")) return this.dice(constant(1));
    return undefined;
  }

  /** A dice term: `d` and its sides at `pos`, then its modifiers. The count was read already. */
  private dice(count: Term): Term | undefined {
    const start = this.pos;
    this.pos++; // the `d`
    let sides: Sides | undefined;
    let sidesTerm: Term | undefined;
    const literal = /(\d{1,3}|%|F(?:\.[12])?)/y;
    literal.lastIndex = this.pos;
    const m = literal.exec(this.text);
    if (m) {
      this.pos += m[0].length;
      sides = parseSides(m[0]);
    } else if (this.at("(")) {
      this.pos++;
      sidesTerm = this.expression();
      this.skipSpace();
      if (!sidesTerm || !this.at(")")) return undefined;
      this.pos++;
      sides = Number.isInteger(sidesTerm.value) && sidesTerm.value >= 1 ? sidesTerm.value : undefined;
    }
    if (sides === undefined) return undefined;
    if (!Number.isInteger(count.value) || count.value < 1 || count.value > 999) return undefined;

    const spec: DiceSpec = { count: count.value, sides, modifier: 0 };
    const end = readModifiers(this.text, this.pos, spec, false);
    if (end === undefined) return undefined;
    this.pos = end;
    const result = rollDiceSpec(spec, this.text.slice(start, end));
    const inner = [count, ...(sidesTerm ? [sidesTerm] : [])];
    return {
      value: result.isPool ? result.successes! : result.total!,
      rolls: [...inner.flatMap((t) => t.rolls), ...result.rolls],
      kept: [...inner.flatMap((t) => t.kept), ...result.kept],
      dropped: [...inner.flatMap((t) => t.dropped), ...result.dropped],
      isPool: result.isPool,
      hasDice: true
    };
  }

  /** `{a, b, ...}` plus group modifiers: keep/drop whole sub-rolls by total, a target counting the
   * sub-rolls that meet it, and sorting (display only). */
  private group(): Term | undefined {
    this.pos++; // `{`
    const subs: Term[] = [];
    for (;;) {
      const sub = this.expression();
      if (!sub) return undefined;
      subs.push(sub);
      this.skipSpace();
      if (this.at(",")) {
        this.pos++;
        continue;
      }
      if (this.at("}")) {
        this.pos++;
        break;
      }
      return undefined;
    }

    const spec: Pick<DiceSpec, "keep" | "drop" | "success" | "failure" | "sort"> = {};
    let previous: keyof typeof GROUP_MODIFIERS | null = null;
    for (;;) {
      let matched: keyof typeof GROUP_MODIFIERS | null = null;
      let m: RegExpExecArray | null = null;
      for (const name of Object.keys(GROUP_MODIFIERS) as (keyof typeof GROUP_MODIFIERS)[]) {
        const re = GROUP_MODIFIERS[name];
        re.lastIndex = this.pos;
        m = re.exec(this.text);
        if (m) {
          matched = name;
          break;
        }
      }
      if (!matched || !m) break;
      if (matched === "keep") {
        const n = m[2] ? parseInt(m[2], 10) : 1;
        const op = m[1] === "k" ? "kh" : m[1] === "d" ? "dl" : m[1];
        if (op === "kh" || op === "kl") {
          if (spec.keep) return undefined;
          spec.keep = { op, n };
        } else {
          const drop = spec.drop ?? {};
          if (drop[op as "dh" | "dl"] !== undefined) return undefined;
          drop[op as "dh" | "dl"] = n;
          spec.drop = drop;
        }
      } else if (matched === "sort") {
        if (spec.sort) return undefined;
        spec.sort = m[1] === "d" ? "desc" : "asc";
      } else if (matched === "failure") {
        if (previous !== "success" || spec.failure) return undefined;
        spec.failure = compare(m[1], m[2]);
      } else {
        if (spec.success) return undefined;
        spec.success = compare(m[1], m[2]);
      }
      previous = matched;
      this.pos += m[0].length;
    }

    // Keep/drop on a single sub-roll means "these dice within it", which would need the
    // arithmetic recomputed without the dropped dice. Not supported: reject rather than guess.
    if ((spec.keep || spec.drop) && subs.length === 1) return undefined;

    const dropSet = droppedIndices(subs.map((s) => s.value), spec);
    const keptSubs = subs.filter((_, i) => !dropSet.has(i));
    const droppedSubs = subs.filter((_, i) => dropSet.has(i));
    const all = (key: "rolls" | "kept") => subs.flatMap((s) => s[key]);
    const base = {
      rolls: all("rolls"),
      kept: keptSubs.flatMap((s) => s.kept),
      dropped: [...keptSubs.flatMap((s) => s.dropped), ...droppedSubs.flatMap((s) => s.rolls)],
      hasDice: subs.some((s) => s.hasDice)
    };
    if (spec.success) {
      const successes = keptSubs.filter((s) => compareValue(s.value, spec.success!)).length;
      const failures = spec.failure ? keptSubs.filter((s) => compareValue(s.value, spec.failure!)).length : 0;
      return { ...base, value: successes - failures, isPool: true };
    }
    return { ...base, value: keptSubs.reduce((sum, s) => sum + s.value, 0), isPool: false };
  }
}

/** Parses and rolls a dice expression: a single dice term, or arithmetic and group rolls around
 * dice terms. Returns `undefined` if it isn't one this engine supports, or has no dice in it. */
export function rollExpression(expr: string): DiceRollResult | undefined {
  const spec = parseDiceExpression(expr);
  if (spec) return rollDiceSpec(spec, expr);
  const term = new MathRoller(expr.trim()).roll();
  if (!term) return undefined;
  const base = { expression: expr.trim(), rolls: term.rolls, kept: term.kept, dropped: term.dropped };
  return term.isPool ? { ...base, successes: term.value, isPool: true } : { ...base, total: term.value, isPool: false };
}

/** Dice add-on v1.1: write a space before the result's `=` whenever the expression contains a
 * compare point or ends with a modifier that accepts one, so the result can't be read as part of
 * the expression (`2d6!=13` would mean "explode on not-13", `5d10>=7=3` is ambiguous). */
export function needsSpaceBeforeResult(expression: string): boolean {
  return /[!<>=]/.test(expression) || /(?:ro?|uo?|cs|cf)$/.test(expression);
}

/** Totals from division can be fractional; show at most two decimals. */
function formatValue(value: number | undefined): string {
  if (value === undefined) return "";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Renders a roll result using the add-on's `expr=total` convention (`expr =total` where the
 * spacing rule above asks for it). */
export function formatRollResult(result: DiceRollResult): string {
  const value = result.isPool ? result.successes : result.total;
  const sep = needsSpaceBeforeResult(result.expression) ? " =" : "=";
  return `${result.expression}${sep}${formatValue(value)}`;
}
