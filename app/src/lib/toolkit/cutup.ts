/** The Burroughs cut-up technique (features.md's solo-toolkit backlog item) as a story-idea
 * generator: shuffle a block of source text's words or lines and present the recombination.
 * No Lonelog notation spec anchors this (unlike dice/cards), so output is just plain shuffled
 * text, inserted as-is like any other Toolkit result. */

import { shuffle } from "./cardEngine";

export type CutUpMode = "words" | "lines";

const WORDS_PER_LINE = 8;

/** Returns `undefined` if `text` has no usable tokens for the given mode. */
export function cutUpText(text: string, mode: CutUpMode): string | undefined {
  if (mode === "lines") {
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) return undefined;
    return shuffle(lines).join("\n");
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return undefined;
  const shuffled = shuffle(words);
  const chunks: string[] = [];
  for (let i = 0; i < shuffled.length; i += WORDS_PER_LINE) {
    chunks.push(shuffled.slice(i, i + WORDS_PER_LINE).join(" "));
  }
  return chunks.join("\n");
}
