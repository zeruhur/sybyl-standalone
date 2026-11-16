/** Lonelog v1.7 tag state (§4.1, §4.2, Appendix D.5).
 *
 * Tags accumulate: a later tag for the same element changes the state the earlier ones built,
 * instead of replacing it. This module replays every tag in a log, in order, and returns each
 * element's current state. Rules:
 * - plain values add up; `-value` removes one; `old>new` (or `old→new`) replaces one; a leading
 *   `+` only stresses that a value is new.
 * - `category:a,b` replaces what the category held; `category:+v` / `category:-v` add or remove
 *   one entry.
 * - `Stat N` sets a number, `Stat+N` / `Stat-N` adjusts it (also inside a category such as
 *   `stat:HP 8, Stress 2`).
 * - `×N` sets a count, `×+N` / `×-N` adjusts it.
 * - Clock/Track carry `X/Y` after the name and Timer carries `X`; `Name+N` / `Name-N` adjusts.
 * - a thread holds one state: any new state replaces it.
 * - a multi-line tag restates the element as a full status block, resetting it.
 * - `[#Type:Name]` refers to an element and changes nothing.
 * Legacy forms (Appendix E.3) keep their meaning: `[E:Name X/Y]` is a clock, `[N:Bandits×6]` is a
 * count in the name. */

export type TagEntry =
  | { kind: "plain"; text: string }
  | { kind: "number"; label: string; value?: number; delta: number }
  | { kind: "count"; value?: number; delta: number }
  | { kind: "category"; name: string; items: string[] };

export interface TagCounter {
  current?: number;
  /** Clock/Track only. */
  total?: number;
  /** Adjustments seen before any value was set. */
  delta: number;
}

export interface TagElement {
  type: string;
  name: string;
  entries: Map<string, TagEntry>;
  counter?: TagCounter;
}

export interface TagOccurrence {
  type: string;
  /** The name segment as written, counter included (`Alarm 2/6`, `Alarm+1`). */
  head: string;
  values: string[];
  isReference: boolean;
  /** Multi-line form: a full status block that resets the element. */
  isBlock: boolean;
  /** Offset of the opening `[` in the scanned text. */
  index: number;
}

const COUNTER_TYPES = new Set(["Clock", "Track", "Timer"]);

// Types start with a capital so Markdown links like `[see: here](…)` don't read as tags.
const SINGLE_LINE_TAG = /\[(#?)([A-Z][A-Za-z]*):([^\]\n]+)\]/g;
const MULTI_LINE_TAG = /\[(#?)([A-Z][A-Za-z]*):([^\]|\n]*)\r?\n((?:[ \t]*\|[^\n]*\n)+)[ \t]*\]/g;

export function scanTags(text: string): TagOccurrence[] {
  const found: TagOccurrence[] = [];
  for (const m of text.matchAll(SINGLE_LINE_TAG)) {
    const [head, ...values] = m[3].split("|");
    found.push({ type: m[2], head: head.trim(), values: clean(values), isReference: m[1] === "#", isBlock: false, index: m.index! });
  }
  for (const m of text.matchAll(MULTI_LINE_TAG)) {
    const values = m[4].split(/\r?\n/).flatMap((line) => line.split("|").slice(1));
    found.push({ type: m[2], head: m[3].trim(), values: clean(values), isReference: m[1] === "#", isBlock: true, index: m.index! });
  }
  return found.sort((a, b) => a.index - b.index);
}

function clean(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean);
}

export function elementKey(type: string, name: string): string {
  return `${type}:${name.toLowerCase()}`;
}

/** Splits the counter (or a legacy count) off the name segment. */
function parseHead(type: string, head: string) {
  if (COUNTER_TYPES.has(type)) {
    let m = head.match(/^(.*?)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) return { name: m[1].trim(), set: Number(m[2]), total: Number(m[3]) };
    m = head.match(/^(.*?)\s*([+-])\s*(\d+)$/);
    if (m && m[1].trim()) return { name: m[1].trim(), adjust: Number(m[2] + m[3]) };
    m = head.match(/^(.*?)\s+(\d+)$/);
    if (m) return { name: m[1].trim(), set: Number(m[2]) };
    return { name: head };
  }
  const legacyCount = head.match(/^(.*?)\s*×\s*(\d+)$/);
  if (legacyCount && legacyCount[1].trim()) return { name: legacyCount[1].trim(), count: Number(legacyCount[2]) };
  return { name: head };
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function plainKey(text: string): string {
  return `v:${text.toLowerCase()}`;
}

/** Replaces `oldKey` with a new entry at the same position, or appends it if `oldKey` is absent. */
function replaceEntry(entries: Map<string, TagEntry>, oldKey: string | undefined, newKey: string, entry: TagEntry) {
  if (oldKey === undefined || !entries.has(oldKey)) {
    entries.set(newKey, entry);
    return;
  }
  const rebuilt = [...entries].map(([k, v]): [string, TagEntry] => (k === oldKey ? [newKey, entry] : [k, v]));
  entries.clear();
  for (const [k, v] of rebuilt) if (!entries.has(k)) entries.set(k, v);
}

function adjustNumberInCategories(entries: Map<string, TagEntry>, label: string, delta: number): boolean {
  for (const entry of entries.values()) {
    if (entry.kind !== "category") continue;
    const i = entry.items.findIndex((item) => {
      const m = item.match(/^(.*?)\s+(-?\d+)$/);
      return m !== null && sameText(m[1], label);
    });
    if (i >= 0) {
      const m = entry.items[i].match(/^(.*?)\s+(-?\d+)$/)!;
      entry.items[i] = `${m[1]} ${Number(m[2]) + delta}`;
      return true;
    }
  }
  return false;
}

function applyValue(el: TagElement, raw: string) {
  const entries = el.entries;
  let value = raw.trim();
  if (!value) return;

  if (el.type === "Thread") {
    const change = value.match(/^(.+?)\s*(?:>|→)\s*(.+)$/);
    el.entries.clear();
    el.entries.set("state", { kind: "plain", text: change ? change[2].trim() : value.replace(/^\+/, "") });
    return;
  }

  const count = value.match(/^[×x]\s*([+-]?)\s*(\d+)$/);
  if (count) {
    const n = Number(count[2]);
    const prev = entries.get("count");
    const entry: TagEntry = prev && prev.kind === "count" ? prev : { kind: "count", delta: 0 };
    if (!count[1]) {
      entry.value = n;
      entry.delta = 0;
    } else if (entry.value !== undefined) entry.value += count[1] === "-" ? -n : n;
    else entry.delta += count[1] === "-" ? -n : n;
    entries.set("count", entry);
    return;
  }

  const category = value.match(/^([A-Za-z][\w -]*?)\s*:\s*(.*)$/);
  if (category) {
    const key = `c:${category[1].toLowerCase()}`;
    const rest = category[2].trim();
    const prev = entries.get(key);
    const items = prev && prev.kind === "category" ? prev.items : [];
    const single = rest.match(/^([+-])\s*([^,]+)$/);
    const change = rest.match(/^([^,]+?)\s*(?:>|→)\s*([^,]+)$/);
    let next: string[];
    if (single && single[1] === "+") next = items.some((i) => sameText(i, single[2])) ? items : [...items, single[2].trim()];
    else if (single) next = items.filter((i) => !sameText(i, single[2]));
    else if (change) next = [...items.filter((i) => !sameText(i, change[1])), change[2].trim()];
    // `category:none` empties it (the cards add-on resets a deck with `out:none`).
    else if (/^none$/i.test(rest)) next = [];
    else next = rest.split(",").map((i) => i.trim()).filter(Boolean);
    entries.set(key, { kind: "category", name: category[1], items: next });
    return;
  }

  const change = value.match(/^(.+?)\s*(?:>|→)\s*(.+)$/);
  if (change) {
    const oldKey = [...entries.keys()].find((k) => {
      const e = entries.get(k)!;
      return e.kind === "plain" && sameText(e.text, change[1]);
    });
    replaceEntry(entries, oldKey, plainKey(change[2].trim()), { kind: "plain", text: change[2].trim() });
    return;
  }

  const adjust = value.match(/^(.*?[A-Za-z][^+\-]*?)\s*([+-])\s*(\d+)$/);
  if (adjust) {
    const label = adjust[1].trim();
    const delta = Number(adjust[2] + adjust[3]);
    const key = `n:${label.toLowerCase()}`;
    const prev = entries.get(key);
    if (prev && prev.kind === "number") {
      if (prev.value !== undefined) prev.value += delta;
      else prev.delta += delta;
    } else if (!adjustNumberInCategories(entries, label, delta)) {
      entries.set(key, { kind: "number", label, delta });
    }
    return;
  }

  const set = value.match(/^(.*?[A-Za-z].*?)\s+(-?\d+)$/);
  if (set) {
    const label = set[1].trim();
    entries.set(`n:${label.toLowerCase()}`, { kind: "number", label, value: Number(set[2]), delta: 0 });
    return;
  }

  if (value.startsWith("-")) {
    const target = value.slice(1).trim();
    for (const [k, e] of entries) if (e.kind === "plain" && sameText(e.text, target)) entries.delete(k);
    return;
  }

  value = value.replace(/^\+\s*/, "");
  if (!entries.has(plainKey(value))) entries.set(plainKey(value), { kind: "plain", text: value });
}

/** Applies one tag occurrence to the state map. Returns the element's key, or undefined for a tag
 * with no name. */
export function applyTag(state: Map<string, TagElement>, occ: TagOccurrence): string | undefined {
  let type = occ.type;
  // Legacy: `[E:Name X/Y]` was a counter; read it as a clock.
  if (type === "E" && /\d+\s*\/\s*\d+$/.test(occ.head)) type = "Clock";
  const head = parseHead(type, occ.head);
  if (!head.name) return undefined;
  const key = elementKey(type, head.name);
  if (occ.isReference) return key;

  let el = state.get(key);
  if (!el || occ.isBlock) {
    el = { type, name: head.name, entries: new Map() };
    state.set(key, el);
  }
  if (COUNTER_TYPES.has(type)) {
    const counter = el.counter ?? { delta: 0 };
    if ("set" in head && head.set !== undefined) {
      counter.current = head.set;
      counter.delta = 0;
      if ("total" in head && head.total !== undefined) counter.total = head.total;
    } else if ("adjust" in head && head.adjust !== undefined) {
      if (counter.current !== undefined) counter.current += head.adjust;
      else counter.delta += head.adjust;
    }
    el.counter = counter;
  }
  if ("count" in head && head.count !== undefined) applyValue(el, `×${head.count}`);
  for (const value of occ.values) applyValue(el, value);
  return key;
}

/** Replays every tag in `text` and returns each element's state, in order of first appearance. */
export function accumulateTags(text: string): Map<string, TagElement> {
  const state = new Map<string, TagElement>();
  for (const occ of scanTags(text)) applyTag(state, occ);
  return state;
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function formatEntry(entry: TagEntry): string {
  switch (entry.kind) {
    case "plain":
      return entry.text;
    case "number":
      return entry.value !== undefined ? `${entry.label} ${entry.value}` : `${entry.label}${formatSigned(entry.delta)}`;
    case "count":
      return entry.value !== undefined ? `×${entry.value}` : `×${formatSigned(entry.delta)}`;
    case "category":
      return `${entry.name}:${entry.items.length ? entry.items.join(",") : "none"}`;
  }
}

/** The element's current state in tag-body form, without the `[Type:` wrapper:
 * `Jonah|hostile|status:captured`, `Alarm 3/6`, `Dawn 2`. */
export function formatElement(el: TagElement): string {
  let head = el.name;
  if (el.counter) {
    const { current, total, delta } = el.counter;
    if (current !== undefined) head += total !== undefined ? ` ${current}/${total}` : ` ${current}`;
    else if (delta !== 0) head += formatSigned(delta);
  }
  return [head, ...[...el.entries.values()].map(formatEntry)].join("|");
}

export function threadState(el: TagElement): string {
  const state = el.entries.get("state");
  return state && state.kind === "plain" ? state.text : "Open";
}
