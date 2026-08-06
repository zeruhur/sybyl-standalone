/** Lonelog Card Notation Add-on (v1.0.0) — full grammar (it's compact).
 * Recognizes/highlights card identities inside `d:` fields: standard 52-card deck
 * (+jokers, color shorthand), Tarot Major Arcana (M0-M21, reversed), and Tarot Minor
 * Arcana ({rank}{Wa|Cu|Sw|Pe}, reversed). Oracle-deck free-text names have no fixed
 * grammar per the spec and are intentionally not matched here. */

const STANDARD_CARD = "(?:10|[2-9]|[AJQK])[hdcs]";
const JOKER = "(?:R|B)?Jkr";
const COLOR_SHORTHAND = "[RB]";
const TAROT_MAJOR = "M(?:[0-9]|1[0-9]|2[01])r?";
const TAROT_MINOR = "(?:10|[2-9]|[AKQ]|Pg|Kn)(?:Wa|Cu|Sw|Pe)r?";

const CARD_TOKEN_SOURCE = `(?:${STANDARD_CARD}|${JOKER}|${TAROT_MAJOR}|${TAROT_MINOR}|${COLOR_SHORTHAND})`;

export const CARD_TOKEN_REGEX = new RegExp(`\\b${CARD_TOKEN_SOURCE}\\b`, "g");

export function isCardToken(token: string): boolean {
  return new RegExp(`^${CARD_TOKEN_SOURCE}$`).test(token.trim());
}
