/** Lonelog Dice Notation Add-on (v1.0.0): Part I plus the first slice of Part II.
 * Grammar, not engine: this recognizes/highlights dice expressions inside `d:` fields, it does
 * not roll them (toolkit/diceEngine.ts does). Covers NdS / d% / dF, min/max, exploding and
 * compounding (each with an optional compare point), re-roll (`r`/`ro`), keep/drop
 * highest-lowest, dice-pool target success/failure, and a trailing flat modifier. Modifiers may
 * appear in any order, as the spec allows. Not yet: penetrating, unique, critical
 * success/failure, sorting, group rolls, full math with parens/exponents. Deliberately a little
 * looser than the engine (it doesn't reject a repeated modifier), which is fine for highlighting. */

const COMPARE_POINT = "(?:>=|<=|!=|<>|=|<|>)";

const MODIFIER =
  "(?:" +
  [
    "min\\d+",
    "max\\d+",
    `!!?(?:${COMPARE_POINT}\\d+)?`, // exploding / compounding, optional compare point
    `ro?(?:${COMPARE_POINT}\\d+)?`, // re-roll (indefinitely / once), optional compare point
    "(?:kh|kl|dh|dl|k|d)\\d{0,2}", // keep/drop highest-lowest
    `f?${COMPARE_POINT}\\d+` // dice-pool target success / failure
  ].join("|") +
  ")";

const DICE_TOKEN_SOURCE =
  "\\d{0,3}d(?:\\d{1,3}|%|F(?:\\.[12])?)" + // base NdS / d% / dF(.1|.2)
  `${MODIFIER}*` +
  "(?:[+-]\\d+)?"; // flat modifier

export const DICE_TOKEN_REGEX = new RegExp(`\\b${DICE_TOKEN_SOURCE}\\b`, "g");

export function isDiceExpression(token: string): boolean {
  return new RegExp(`^${DICE_TOKEN_SOURCE}$`).test(token.trim());
}
