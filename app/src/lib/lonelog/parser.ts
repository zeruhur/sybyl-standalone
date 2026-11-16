import { applyTag, formatElement, scanTags, TagElement } from "./tags";
import { isAsideMetaNote, LINE_START_BEAT, splitCompactBeats } from "./beats";

export interface LonelogContext {
  lastSceneId: string;
  lastSceneDesc: string;
  activeNPCs: string[];
  activeLocations: string[];
  activeThreads: string[];
  activeClocks: string[];
  activeTracks: string[];
  activeTimers: string[];
  /** Every other tag mentioned, add-on types and events included: `[Deck:Main|×50|out:Qs]`. */
  otherTags: string[];
  pcState: string[];
  recentBeats: string[];
}

/** Elements that get their own line in the model's context, by tag type. */
const CONTEXT_TYPES = {
  N: "activeNPCs",
  L: "activeLocations",
  Thread: "activeThreads",
  Clock: "activeClocks",
  Track: "activeTracks",
  Timer: "activeTimers",
  PC: "pcState"
} as const;

/** Builds the Lonelog context sent with each request. Scene and beats come from the last
 * `depthLines` lines. Tags accumulate (Lonelog v1.7 §4.1), so each element's state is replayed
 * from the whole log, but only elements mentioned in those last lines are included. */
export function parseLonelogContext(noteBody: string, depthLines = 60): LonelogContext {
  const bodyWithoutFM = noteBody.replace(/^---[\s\S]*?---\r?\n/, "");
  const lines = bodyWithoutFM.split(/\r?\n/);
  const window = lines.slice(-depthLines);
  const ctx: LonelogContext = {
    lastSceneId: "",
    lastSceneDesc: "",
    activeNPCs: [],
    activeLocations: [],
    activeThreads: [],
    activeClocks: [],
    activeTracks: [],
    activeTimers: [],
    otherTags: [],
    pcState: [],
    recentBeats: []
  };

  const sceneRe = /^(?:#+\s+)?(T\d+-)?S(\d+[\w.]*)\s*\*([^*]*)\*/;
  const beatRe = LINE_START_BEAT;
  // Tag-only lines, plus the continuation and closing lines of a multi-line tag (§4.1.8).
  const skipRe = /^(#|---|>\s*\[|\[#?[A-Z][A-Za-z]*:|\|)|^\]$/;

  for (const rawLine of window) {
    const line = rawLine.trim();
    const sceneMatch = line.match(sceneRe);
    if (sceneMatch) {
      ctx.lastSceneId = `${sceneMatch[1] ?? ""}S${sceneMatch[2]}`;
      ctx.lastSceneDesc = sceneMatch[3].trim();
    }
    if (beatRe.test(line)) {
      ctx.recentBeats.push(...splitCompactBeats(line));
    } else if (line.length > 0 && !skipRe.test(line) && !sceneRe.test(line) && !isAsideMetaNote(line)) {
      ctx.recentBeats.push(line);
    }
  }

  let windowStart = 0;
  for (let i = 0; i < lines.length - window.length; i++) {
    windowStart = bodyWithoutFM.indexOf("\n", windowStart) + 1;
  }
  const state = new Map<string, TagElement>();
  const mentioned = new Set<string>();
  for (const occ of scanTags(bodyWithoutFM)) {
    const key = applyTag(state, occ);
    if (key && occ.index >= windowStart) mentioned.add(key);
  }
  for (const key of mentioned) {
    const el = state.get(key);
    if (!el) continue;
    if (el.type in CONTEXT_TYPES) ctx[CONTEXT_TYPES[el.type as keyof typeof CONTEXT_TYPES]].push(formatElement(el));
    else ctx.otherTags.push(`[${el.type}:${formatElement(el)}]`);
  }

  ctx.recentBeats = ctx.recentBeats.slice(-10);
  return ctx;
}

export function serializeContext(ctx: LonelogContext): string {
  const lines: string[] = [];
  if (ctx.lastSceneId) lines.push(`Current scene: ${ctx.lastSceneId} *${ctx.lastSceneDesc}*`);
  if (ctx.pcState.length) lines.push(`PC: ${ctx.pcState.map((state) => `[PC:${state}]`).join(" ")}`);
  if (ctx.activeNPCs.length) lines.push(`NPCs: ${ctx.activeNPCs.map((state) => `[N:${state}]`).join(" ")}`);
  if (ctx.activeLocations.length) {
    lines.push(`Locations: ${ctx.activeLocations.map((state) => `[L:${state}]`).join(" ")}`);
  }
  if (ctx.activeThreads.length) {
    lines.push(`Threads: ${ctx.activeThreads.map((state) => `[Thread:${state}]`).join(" ")}`);
  }
  if (ctx.activeClocks.length) {
    lines.push(`Clocks: ${ctx.activeClocks.map((state) => `[Clock:${state}]`).join(" ")}`);
  }
  if (ctx.activeTracks.length) {
    lines.push(`Tracks: ${ctx.activeTracks.map((state) => `[Track:${state}]`).join(" ")}`);
  }
  if (ctx.activeTimers.length) {
    lines.push(`Timers: ${ctx.activeTimers.map((state) => `[Timer:${state}]`).join(" ")}`);
  }
  if (ctx.otherTags.length) lines.push(`Other tags: ${ctx.otherTags.join(" ")}`);
  if (ctx.recentBeats.length) {
    lines.push("Recent beats:");
    ctx.recentBeats.forEach((beat) => lines.push(`  ${beat}`));
  }
  return lines.join("\n");
}
