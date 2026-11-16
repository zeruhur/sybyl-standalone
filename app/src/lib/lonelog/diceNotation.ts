/** Lonelog Dice Notation Add-on (v1.1.0): Part I and the Appendix grammar.
 * Grammar, not engine: this recognizes/highlights dice expressions on `d:`/`tbl:` lines, it does
 * not roll them (toolkit/diceEngine.ts does). A dice term is NdS / d% / dF(.1|.2) with any of the
 * Appendix modifiers in any order: min/max, exploding/compounding/penetrating (`!`, `!!`, `!p`,
 * `!!p`), re-roll (`r`/`ro`), unique (`u`/`uo`), each with an optional compare point; keep/drop
 * highest-lowest; target success/failure; critical success/failure (`cs`/`cf`); sorting
 * (`s`/`sa`/`sd`); and a trailing flat modifier. A group roll (`{d8!, d6!}kh1`) is matched as one
 * token. Arithmetic with parentheses (`(1d6+2)*3`) isn't one token: its dice terms are highlighted
 * individually. Deliberately a little looser than the engine (it doesn't reject a repeated
 * modifier), which is fine for highlighting. */

const COMPARE_POINT = "(?:>=|<=|!=|<>|=|<|>)";

const MODIFIER =
  "(?:" +
  [
    "min\\d+",
    "max\\d+",
    `!!?p?(?:${COMPARE_POINT}\\d+)?`, // exploding / compounding / penetrating
    `ro?(?:${COMPARE_POINT}\\d+)?`, // re-roll (indefinitely / once)
    `uo?(?:${COMPARE_POINT}\\d+)?`, // unique (indefinitely / once)
    "(?:kh|kl|dh|dl|k|d)\\d{0,2}", // keep/drop highest-lowest
    `c[sf](?:${COMPARE_POINT}\\d+)?`, // critical success / failure
    "s[ad]?", // sort
    `f?${COMPARE_POINT}\\d+` // dice-pool target success / failure
  ].join("|") +
  ")";

const GROUP_MODIFIER = `(?:(?:kh|kl|dh|dl|k|d)\\d{0,2}|s[ad]?|f?${COMPARE_POINT}\\d+)`;

const DICE_TERM_SOURCE =
  "\\d{0,3}d(?:\\d{1,3}|%|F(?:\\.[12])?)" + // base NdS / d% / dF(.1|.2)
  `${MODIFIER}*` +
  "(?:[+-]\\d+)?"; // flat modifier

const GROUP_SOURCE = `\\{[^{}\\n]+\\}${GROUP_MODIFIER}*`;

/** A dice term or a group roll. A term must start at a word boundary; neither may run into a
 * following word character (`2d6!` matches whole, `2d6sword` doesn't match at all). */
export const DICE_TOKEN_REGEX = new RegExp(`(?:${GROUP_SOURCE}|\\b${DICE_TERM_SOURCE})(?!\\w)`, "g");

export function isDiceExpression(token: string): boolean {
  return new RegExp(`^(?:${GROUP_SOURCE}|${DICE_TERM_SOURCE})$`).test(token.trim());
}
