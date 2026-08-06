/** Lonelog Dice Notation Add-on (v1.0.0) — Part I practical subset.
 * Grammar, not engine: this recognizes/highlights dice expressions inside `d:` fields,
 * it does not roll them. Covers NdS / d% / dF, flat modifiers, keep/drop highest-lowest,
 * exploding with an optional compare point, and dice-pool target success/failure —
 * not the full Part II grammar (min/max, compounding/penetrating, reroll, unique,
 * critical success/failure, sorting, group rolls, full math with parens/exponents). */

const COMPARE_POINT = "(?:>=|<=|!=|<>|=|<|>)";

const DICE_TOKEN_SOURCE =
  "\\d{0,3}d(?:\\d{1,3}|%|F(?:\\.[12])?)" + // base NdS / d% / dF(.1|.2)
  "(?:(?:kh|kl|dh|dl|k|d)\\d{0,2})?" + // keep/drop highest-lowest
  `(?:!(?:${COMPARE_POINT}\\d+)?)?` + // exploding, optional compare point
  `(?:${COMPARE_POINT}\\d+)?` + // dice-pool target success
  `(?:f${COMPARE_POINT}\\d+)?` + // dice-pool target failure
  "(?:[+-]\\d+)?"; // flat modifier

export const DICE_TOKEN_REGEX = new RegExp(`\\b${DICE_TOKEN_SOURCE}\\b`, "g");

export function isDiceExpression(token: string): boolean {
  return new RegExp(`^${DICE_TOKEN_SOURCE}$`).test(token.trim());
}
