// Streams a generation's output into the editor as it arrives. The streamed text is provisional:
// none of its updates enter the undo history, autosave never sees it (docWithoutLiveOutput), and
// the finished output is committed as one ordinary undoable insert, exactly as a non-streamed
// result would have been. Cancelling or failing removes it again.

import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { InsertedRange, InsertionFrame, insertInFrame, insertionFrame, Placement } from "./editorUtils";

/** The span a streaming generation occupies, and the text it covered before streaming began (empty
 * for a fresh insert, the previous output for a regenerate). `id` ties it to one LiveOutput. */
interface LiveSpan {
  id: number;
  from: number;
  to: number;
  original: string;
}

const setLiveSpan = StateEffect.define<LiveSpan | null>();

/** Tracks the live span through every edit, so it stays put while the user types elsewhere. A fresh
 * EditorState (switching notes, a theme remount) starts without one, which is how a LiveOutput
 * finds out its span is gone. */
export const liveSpanField = StateField.define<LiveSpan | null>({
  create: () => null,
  update(span, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLiveSpan)) return effect.value;
    }
    if (!span || !tr.docChanged) return span;
    // Typing right at either edge lands outside the span.
    const from = tr.changes.mapPos(span.from, 1);
    return { ...span, from, to: Math.max(from, tr.changes.mapPos(span.to, -1)) };
  }
});

/** The note as it would be without any in-progress streamed output. This is what autosave writes and
 * what the rest of the app treats as the note's content, so half-finished output never reaches disk,
 * even if the user switches notes mid-stream and the output is discarded. */
export function docWithoutLiveOutput(state: EditorState): string {
  const doc = state.doc.toString();
  const span = state.field(liveSpanField, false);
  if (!span) return doc;
  return doc.slice(0, span.from) + span.original + doc.slice(span.to);
}

/** Whether a transaction moved the note's content, ignoring changes to streamed output. */
export function contentChanged(startState: EditorState, state: EditorState): boolean {
  if (!startState.field(liveSpanField, false) && !state.field(liveSpanField, false)) return true;
  return docWithoutLiveOutput(startState) !== docWithoutLiveOutput(state);
}

const untracked = Transaction.addToHistory.of(false);
let nextId = 1;

export class LiveOutput {
  private readonly id = nextId++;

  private constructor(
    private readonly frame: InsertionFrame,
    private readonly original: string
  ) {}

  /** Starts streaming at `placement`, positioned exactly where a one-shot insert would go. */
  static insert(view: EditorView, placement: Placement, text: string): LiveOutput {
    const live = new LiveOutput(insertionFrame(view, placement), "");
    live.place(view, live.frame.at, live.frame.at, text);
    return live;
  }

  /** Starts streaming over `range` (a regenerate), which comes back if the stream is cancelled. */
  static replace(view: EditorView, range: InsertedRange, text: string): LiveOutput {
    const frame: InsertionFrame = { at: range.from, before: "", after: "", scroll: false };
    const live = new LiveOutput(frame, view.state.sliceDoc(range.from, range.to));
    live.place(view, range.from, range.to, text);
    return live;
  }

  /** Shows `text` as the output so far. False if the span is gone (the note was switched away). */
  write(view: EditorView, text: string): boolean {
    const span = this.span(view);
    if (!span) return false;
    this.place(view, span.from, span.to, text);
    return true;
  }

  /** Replaces the streamed text with the final `text` as a single undoable change. Returns null if
   * the span is gone, so the caller can fall back to a plain insert. */
  commit(view: EditorView, text: string): InsertedRange | null {
    const at = this.restore(view);
    if (at === null) return null;
    if (!this.original) {
      return insertInFrame(view, { ...this.frame, at }, text);
    }
    view.dispatch({ changes: { from: at, to: at + this.original.length, insert: text } });
    view.focus();
    return { from: at, to: at + text.length };
  }

  /** Removes the streamed text, putting back whatever it covered. */
  cancel(view: EditorView): void {
    this.restore(view);
  }

  private span(view: EditorView): LiveSpan | null {
    const span = view.state.field(liveSpanField, false);
    return span && span.id === this.id ? span : null;
  }

  private place(view: EditorView, from: number, to: number, text: string): void {
    const insert = `${this.frame.before}${text}${this.frame.after}`;
    const end = from + insert.length;
    view.dispatch({
      changes: { from, to, insert },
      effects: [
        setLiveSpan.of({ id: this.id, from, to: end, original: this.original }),
        EditorView.scrollIntoView(end, { y: "nearest" })
      ],
      annotations: untracked
    });
  }

  /** Puts the original text back without recording it, returning where the span started. */
  private restore(view: EditorView): number | null {
    const span = this.span(view);
    if (!span) return null;
    view.dispatch({
      changes: { from: span.from, to: span.to, insert: this.original },
      effects: setLiveSpan.of(null),
      annotations: untracked
    });
    return span.from;
  }
}
