/** Lonelog v1.7 core elements (Appendix D.1) and meta notes (D.7).
 *
 * In standard form each element starts a line. In compact form several share one line, each symbol
 * preceded by whitespace (the space after a symbol is optional):
 * `@ Sneak past d: 2d6=8 -> Fail => The guard turns`. Mid-line symbols only count on a line that
 * already starts with one, so prose like "a ? b" isn't split. */

export const BEAT_SYMBOL_SOURCE = "@|\\?|->|=>|d:|tbl:";

/** A beat symbol at the start of a line. */
export const LINE_START_BEAT = new RegExp(`^(${BEAT_SYMBOL_SOURCE})`);

/** For highlighting: a beat symbol at the start of a line (group 1), or a compact-form one later in
 * a line that starts with a beat (group 2). Per-line, so `^` is the line start. */
export const BEAT_SYMBOL_REGEX = new RegExp(
  `^(${BEAT_SYMBOL_SOURCE})|(?<=^(?:${BEAT_SYMBOL_SOURCE})[^\\n]*\\s)(${BEAT_SYMBOL_SOURCE})`,
  "gm"
);

const MID_LINE_BEAT = new RegExp(`\\s+(?=(?:${BEAT_SYMBOL_SOURCE}))`, "g");

/** Splits a compact-form line into standard-form beats. An outcome (`->`) stays on its `d:` or
 * `tbl:` line, where standard form puts it (D.3.1); after `?` it becomes its own line. A line that
 * doesn't start with a beat comes back unchanged. */
export function splitCompactBeats(line: string): string[] {
  const trimmed = line.trim();
  if (!LINE_START_BEAT.test(trimmed)) return [trimmed];
  const beats: string[] = [];
  for (const part of trimmed.split(MID_LINE_BEAT)) {
    const prev = beats[beats.length - 1];
    if (part.startsWith("->") && prev !== undefined && /^(?:d:|tbl:)/.test(prev) && !prev.includes("->")) {
      beats[beats.length - 1] = `${prev} ${part}`;
    } else {
      beats.push(part);
    }
  }
  return beats;
}

/** A meta note `(label: text)` anywhere in a line, or a line that is only a bare `(text)` note.
 * Labels are lowercase words (§4.5); `(http://…)` and roll references like `(d6=3)` don't match. */
export const META_NOTE_REGEX = /\([a-z][a-z ]{0,19}:(?!\/)[^)\n]*\)|^\([^)\n]*\)\s*$/gm;

const WHOLE_LINE_META = /^\((?:([a-z][a-z ]{0,19}):(?!\/))?[^)]*\)$/;

/** Labels whose notes still matter to the story, so the AI keeps seeing them: a retcon corrects
 * something already logged, and `interp:` records how the player read an oracle or table. */
const STORY_META_LABELS = new Set(["retcon", "interp"]);

/** Whether a line is an out-of-character meta note the AI doesn't need (§4.5). */
export function isAsideMetaNote(line: string): boolean {
  const match = WHOLE_LINE_META.exec(line.trim());
  return match !== null && !STORY_META_LABELS.has((match[1] ?? "").trim());
}
