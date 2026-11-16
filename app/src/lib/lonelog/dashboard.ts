import { accumulateTags, threadState } from "./tags";

export interface ThreadState {
  name: string;
  state: string;
}

export interface ProgressState {
  name: string;
  current: number;
  total: number;
}

export interface TimerState {
  name: string;
  current: number;
}

export interface CampaignDashboard {
  threads: ThreadState[];
  clocks: ProgressState[];
  tracks: ProgressState[];
  timers: TimerState[];
}

/** Scans the *entire* note body (unlike parser.ts's parseLonelogContext, which windows to the
 * last N lines for LLM prompt budget) and replays its [Thread:]/[Clock:]/[Track:]/[Timer:] tags
 * with Lonelog v1.7's accumulation rules (`[Clock:Alarm+1]`, `[Thread:Escape|Open>Closed]`; see
 * tags.ts). A clock or track is shown once its size (`X/Y`) is known, a timer once it has a value. */
export function extractDashboard(noteBody: string): CampaignDashboard {
  const bodyWithoutFM = noteBody.replace(/^---[\s\S]*?---\r?\n/, "");
  const dashboard: CampaignDashboard = { threads: [], clocks: [], tracks: [], timers: [] };

  for (const el of accumulateTags(bodyWithoutFM).values()) {
    const counter = el.counter;
    if (el.type === "Thread") {
      dashboard.threads.push({ name: el.name, state: threadState(el) });
    } else if ((el.type === "Clock" || el.type === "Track") && counter?.current !== undefined && counter.total !== undefined) {
      const progress = { name: el.name, current: counter.current, total: counter.total };
      (el.type === "Clock" ? dashboard.clocks : dashboard.tracks).push(progress);
    } else if (el.type === "Timer" && counter?.current !== undefined) {
      dashboard.timers.push({ name: el.name, current: counter.current });
    }
  }
  return dashboard;
}
