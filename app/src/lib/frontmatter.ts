import { parseLonelogContext } from "./lonelog/parser";
import { NoteFrontMatter } from "./types";

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Auto-compiles the Lonelog standard campaign-header fields (lonelog.md §5.1) that can be
 * derived from the log body: last_update always refreshes, pcs is re-derived from the most
 * recent [PC:...] tag(s) found in the log. */
export function compileFrontmatter(body: string, contextDepth: number): Partial<NoteFrontMatter> {
  const ctx = parseLonelogContext(body, contextDepth);
  const derivedPcs = ctx.pcState.length
    ? ctx.pcState.map((state) => `${state.split("|")[0].trim()} [PC:${state}]`).join(", ")
    : undefined;
  return {
    last_update: todayIsoDate(),
    ...(derivedPcs ? { pcs: derivedPcs } : {})
  };
}
