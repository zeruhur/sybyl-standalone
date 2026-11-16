import { accumulateTags, formatElement, threadState } from "./tags";

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

/** A tag of a type the core doesn't define, such as the cards add-on's `[Deck:]` or an
 * inventory add-on's `[Inv:]`, shown with its current state. */
export interface OtherTagState {
  type: string;
  name: string;
  /** The state in tag form: `[Deck:Main|×50|out:Qs,M16]`. */
  text: string;
}

/** Core types (Lonelog v1.7 D.5.6) that aren't dashboard material themselves: characters,
 * places and one-off events. */
const NOT_ON_DASHBOARD = new Set(["PC", "N", "L", "E", "Thread", "Clock", "Track", "Timer"]);

export interface CampaignDashboard {
  threads: ThreadState[];
  clocks: ProgressState[];
  tracks: ProgressState[];
  timers: TimerState[];
  other: OtherTagState[];
}

/** Scans the *entire* note body (unlike parser.ts's parseLonelogContext, which windows to the
 * last N lines for LLM prompt budget) and replays its [Thread:]/[Clock:]/[Track:]/[Timer:] tags
 * with Lonelog v1.7's accumulation rules (`[Clock:Alarm+1]`, `[Thread:Escape|Open>Closed]`; see
 * tags.ts). A clock or track is shown once its size (`X/Y`) is known, a timer once it has a value. */
export function extractDashboard(noteBody: string): CampaignDashboard {
  const bodyWithoutFM = noteBody.replace(/^---[\s\S]*?---\r?\n/, "");
  const dashboard: CampaignDashboard = { threads: [], clocks: [], tracks: [], timers: [], other: [] };

  for (const el of accumulateTags(bodyWithoutFM).values()) {
    const counter = el.counter;
    if (el.type === "Thread") {
      dashboard.threads.push({ name: el.name, state: threadState(el) });
    } else if ((el.type === "Clock" || el.type === "Track") && counter?.current !== undefined && counter.total !== undefined) {
      const progress = { name: el.name, current: counter.current, total: counter.total };
      (el.type === "Clock" ? dashboard.clocks : dashboard.tracks).push(progress);
    } else if (el.type === "Timer" && counter?.current !== undefined) {
      dashboard.timers.push({ name: el.name, current: counter.current });
    } else if (!NOT_ON_DASHBOARD.has(el.type)) {
      dashboard.other.push({ type: el.type, name: el.name, text: `[${el.type}:${formatElement(el)}]` });
    }
  }
  return dashboard;
}
