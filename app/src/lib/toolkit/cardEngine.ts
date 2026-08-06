/** Card draw engine for the Lonelog Card Notation Add-on. Produces tokens in exactly
 * `cardNotation.ts`'s shorthand so a drawn result is already valid Lonelog card notation
 * (grammar source: lonelog-cards-addon.md). Standard 52-card deck (+jokers) and full Tarot
 * (Major + Minor Arcana). Custom image-based decks live in customDeckEngine.ts (they reuse
 * this file's `shuffle()` but aren't text-token decks, so they don't share DeckSession). */

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["h", "d", "c", "s"];
const TAROT_MINOR_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Pg", "Kn", "Q", "K"];
const TAROT_SUITS = ["Wa", "Cu", "Sw", "Pe"];
const TAROT_MAJOR_COUNT = 22;

export type DeckType = "standard" | "standard-jokers" | "tarot";

export interface DeckSession {
  type: DeckType;
  drawPile: string[];
  discardPile: string[];
}

export function buildStandardDeck(includeJokers: boolean): string[] {
  const cards = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
  return includeJokers ? [...cards, "RJkr", "BJkr"] : cards;
}

export function buildTarotDeck(): string[] {
  const major = Array.from({ length: TAROT_MAJOR_COUNT }, (_, n) => `M${n}`);
  const minor = TAROT_MINOR_RANKS.flatMap((rank) => TAROT_SUITS.map((suit) => `${rank}${suit}`));
  return [...major, ...minor];
}

export function shuffle<T>(deck: T[]): T[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function baseDeck(type: DeckType): string[] {
  if (type === "tarot") return buildTarotDeck();
  return buildStandardDeck(type === "standard-jokers");
}

export function createDeckSession(type: DeckType): DeckSession {
  return { type, drawPile: shuffle(baseDeck(type)), discardPile: [] };
}

export function reshuffleDeck(session: DeckSession): DeckSession {
  return { type: session.type, drawPile: shuffle([...session.drawPile, ...session.discardPile]), discardPile: [] };
}

/** Reversal (Tarot only) is decided at draw time, not baked into the deck — the same
 * physical card can come up either orientation on different draws. */
function withOrientation(card: string, type: DeckType): string {
  if (type !== "tarot") return card;
  return Math.random() < 0.5 ? `${card}r` : card;
}

/** Draws one card, auto-reshuffling the discard pile back in if the draw pile is empty
 * (mirrors solo-toolkit's "shuffle back in" reshuffle behavior). Returns `card: undefined`
 * only when both piles are empty (a session with zero cards, which shouldn't normally occur). */
export function drawCard(session: DeckSession): { session: DeckSession; card: string | undefined } {
  let working = session;
  if (working.drawPile.length === 0) {
    if (working.discardPile.length === 0) return { session: working, card: undefined };
    working = reshuffleDeck(working);
  }
  const [card, ...rest] = working.drawPile;
  return {
    session: { type: working.type, drawPile: rest, discardPile: [...working.discardPile, card] },
    card: withOrientation(card, working.type)
  };
}
