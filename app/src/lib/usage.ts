import { GenerationResponse } from "./types";

const n = (value: number) => value.toLocaleString("en-US");

/** A one-line token summary for a finished generation, e.g. "5,212 in (4,000 cached) · 180 out".
 * "in" is the whole prompt; the cached share (read from or newly written to the provider's prompt
 * cache) is broken out because it's billed differently. Empty when the provider reported nothing,
 * as some OpenAI-compatible servers don't. Token counts only, no prices: those differ per model
 * and change over time, and a stale figure would mislead more than it helps. */
export function formatUsage(response: GenerationResponse): string {
  const { inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0 } = response;
  const parts: string[] = [];
  if (inputTokens !== undefined || cacheReadTokens || cacheWriteTokens) {
    const prompt = (inputTokens ?? 0) + cacheReadTokens + cacheWriteTokens;
    const cacheNotes = [
      cacheReadTokens ? `${n(cacheReadTokens)} cached` : "",
      cacheWriteTokens ? `${n(cacheWriteTokens)} cache write` : ""
    ].filter(Boolean);
    parts.push(cacheNotes.length ? `${n(prompt)} in (${cacheNotes.join(", ")})` : `${n(prompt)} in`);
  }
  if (outputTokens !== undefined) parts.push(`${n(outputTokens)} out`);
  return parts.join(" · ");
}
