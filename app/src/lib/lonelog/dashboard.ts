export interface ThreadState {
  name: string;
  state: string;
}

export interface ProgressState {
  name: string;
  current: number;
  total: number;
}

export interface CampaignDashboard {
  threads: ThreadState[];
  clocks: ProgressState[];
  tracks: ProgressState[];
}

const THREAD_RE = /\[Thread:([^\]]+)\]/g;
const CLOCK_RE = /\[Clock:([^\]]+)\]/g;
const TRACK_RE = /\[Track:([^\]]+)\]/g;

function parseProgress(raw: string): ProgressState | null {
  const match = raw.match(/^(.*?)\s+(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return null;
  return { name: match[1].trim(), current: Number(match[2]), total: Number(match[3]) };
}

/** Scans the *entire* note body (unlike parser.ts's parseLonelogContext, which windows to the
 * last N lines for LLM prompt budget) for [Thread:]/[Clock:]/[Track:] tags, keeping the last
 * occurrence of each name as its current state — matches the notation's own "latest tag wins"
 * convention used when re-declaring a thread/clock/track's progress. */
export function extractDashboard(noteBody: string): CampaignDashboard {
  const bodyWithoutFM = noteBody.replace(/^---[\s\S]*?---\r?\n/, "");
  const threadMap = new Map<string, string>();
  const clockMap = new Map<string, ProgressState>();
  const trackMap = new Map<string, ProgressState>();

  for (const match of bodyWithoutFM.matchAll(THREAD_RE)) {
    const [name, ...rest] = match[1].split("|");
    threadMap.set(name.trim(), rest.join("|").trim() || "Open");
  }
  for (const match of bodyWithoutFM.matchAll(CLOCK_RE)) {
    const progress = parseProgress(match[1]);
    if (progress) clockMap.set(progress.name, progress);
  }
  for (const match of bodyWithoutFM.matchAll(TRACK_RE)) {
    const progress = parseProgress(match[1]);
    if (progress) trackMap.set(progress.name, progress);
  }

  return {
    threads: [...threadMap.entries()].map(([name, state]) => ({ name, state })),
    clocks: [...clockMap.values()],
    tracks: [...trackMap.values()]
  };
}
