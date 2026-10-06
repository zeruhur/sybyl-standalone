/** Deterministic Yes/No oracle for quick procedural answers during solo play, in the same
 * spirit as the classic "likelihood + chaos factor" oracle mechanic referenced by lonelog.md
 * §9.2.1's own worked example (`-> No, but... (CF=4)`). This is an ORIGINAL probability formula,
 * not a port of any published product's fate-chart table (those numbers are proprietary) —
 * same approach as wordGenerators.ts's curated lists: consulted the shape of existing tools,
 * wrote new content/logic. Distinct from the LLM-driven `cmdAskOracle` command elsewhere in the
 * app; this one never calls a provider, it's an instant local roll. */

import { generateWord } from "./wordGenerators";

export interface OracleLikelihood {
  id: string;
  label: string;
  probability: number;
}

export const ORACLE_LIKELIHOODS: OracleLikelihood[] = [
  { id: "impossible", label: "Impossible", probability: 5 },
  { id: "nearly_impossible", label: "Nearly Impossible", probability: 15 },
  { id: "very_unlikely", label: "Very Unlikely", probability: 25 },
  { id: "unlikely", label: "Unlikely", probability: 35 },
  { id: "fifty_fifty", label: "50/50", probability: 50 },
  { id: "likely", label: "Likely", probability: 65 },
  { id: "very_likely", label: "Very Likely", probability: 75 },
  { id: "nearly_certain", label: "Nearly Certain", probability: 85 },
  { id: "certain", label: "Certain", probability: 95 }
];

const EVENT_FOCUS_TABLE = [
  "NPC Action",
  "PC Positive",
  "PC Negative",
  "NPC Positive",
  "NPC Negative",
  "Move Toward a Thread",
  "Move Away from a Thread",
  "Close a Thread",
  "Introduce a New NPC",
  "New Location",
  "Ambiguous Event",
  "Complicate the Situation"
];

export interface OracleResult {
  likelihoodLabel: string;
  chaosFactor: number;
  roll: number;
  threshold: number;
  answer: "yes" | "no";
  exceptional: boolean;
  modifier: "and" | "but";
  randomEvent: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const DEFAULT_CHAOS_FACTOR = 5;

/** A usable Chaos Factor from a stored value: a note's `chaos_factor` may be missing or hand-edited
 * into anything (a string, a decimal, out of range). Numbers are rounded and clamped to 1-9;
 * anything else gives the default. */
export function normalizeChaosFactor(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_CHAOS_FACTOR;
  return clamp(Math.round(n), 1, 9);
}

/** Rolls a Yes/No oracle answer for the given likelihood, shifted by the chaos factor (1-9,
 * higher = more volatile/random). Returns `undefined` if `likelihoodId` isn't recognized. */
export function askOracle(likelihoodId: string, chaosFactor: number): OracleResult | undefined {
  const likelihood = ORACLE_LIKELIHOODS.find((l) => l.id === likelihoodId);
  if (!likelihood) return undefined;

  const cf = clamp(Math.round(chaosFactor), 1, 9);
  const threshold = clamp(likelihood.probability + (cf - 5) * 5, 3, 97);
  const roll = 1 + Math.floor(Math.random() * 100);
  const answer: "yes" | "no" = roll <= threshold ? "yes" : "no";

  const exceptionalYesCutoff = Math.max(1, Math.round(threshold * 0.1));
  const exceptionalNoCutoff = Math.min(100, 100 - Math.round((100 - threshold) * 0.1));
  const exceptional = answer === "yes" ? roll <= exceptionalYesCutoff : roll >= exceptionalNoCutoff;

  let modifier: "and" | "but";
  if (answer === "yes") {
    const midpoint = threshold / 2;
    modifier = roll <= midpoint ? "and" : "but";
  } else {
    const midpoint = threshold + (100 - threshold) / 2;
    modifier = roll >= midpoint ? "and" : "but";
  }

  const digit = Math.floor(roll / 11);
  const isDouble = roll % 11 === 0 && roll >= 11 && roll <= 99;
  const randomEvent = isDouble && digit <= cf;

  return { likelihoodLabel: likelihood.label, chaosFactor: cf, roll, threshold, answer, exceptional, modifier, randomEvent };
}

/** Picks a random event focus + subject, e.g. "Event Focus: Move Toward a Thread — Subject: lantern". */
export function rollRandomEvent(): string {
  const focus = EVENT_FOCUS_TABLE[Math.floor(Math.random() * EVENT_FOCUS_TABLE.length)];
  const subject = generateWord("noun") ?? "something";
  return `Event Focus: ${focus} — Subject: ${subject}`;
}

/** Renders an oracle result matching lonelog.md's own worked example style
 * (`Yes, but... (CF=4)` / `Exceptional No (CF=7)`), with a random-event line appended when triggered. */
export function formatOracleResult(result: OracleResult): string {
  const answerText = result.answer === "yes" ? "Yes" : "No";
  const line = result.exceptional
    ? `Exceptional ${answerText} (CF=${result.chaosFactor})`
    : `${answerText}, ${result.modifier}... (CF=${result.chaosFactor})`;
  return result.randomEvent ? `${line}\nRandom Event: ${rollRandomEvent()}` : line;
}
