// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { contentChanged, docWithoutLiveOutput, liveSpanField, LiveOutput } from "./liveOutput";

let view: EditorView;

function makeView(doc: string, cursor = doc.length) {
  view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [history(), liveSpanField] }),
    parent: document.body
  });
  return view;
}

const text = () => view.state.doc.toString();

/** Simulates the user typing `insert` at `pos` (a normal, undoable change). */
function type(pos: number, insert: string) {
  view.dispatch({ changes: { from: pos, insert } });
}

afterEach(() => view?.destroy());

describe("LiveOutput", () => {
  it("streams at the placement and commits as a single undo step", () => {
    makeView("@ Pick the lock");
    const live = LiveOutput.insert(view, "end-of-note", "=> The");
    live.write(view, "=> The tumblers");
    expect(text()).toBe("@ Pick the lock\n=> The tumblers\n");
    // Autosave sees the note without the provisional output.
    expect(docWithoutLiveOutput(view.state)).toBe("@ Pick the lock");

    const range = live.commit(view, "=> The tumblers give.");
    expect(text()).toBe("@ Pick the lock\n=> The tumblers give.\n");
    expect(view.state.sliceDoc(range!.from, range!.to)).toBe("=> The tumblers give.");
    expect(docWithoutLiveOutput(view.state)).toBe(text());

    undo(view);
    expect(text()).toBe("@ Pick the lock");
  });

  it("keeps its place while the user types before it, and keeps their typing", () => {
    makeView("Intro\nEnd", 5);
    const live = LiveOutput.insert(view, "cursor", "=> A");
    type(0, "Note: ");
    live.write(view, "=> A door opens");
    expect(text()).toBe("Note: Intro\n=> A door opens\n\nEnd");
    expect(docWithoutLiveOutput(view.state)).toBe("Note: Intro\nEnd");

    live.commit(view, "=> A door opens.");
    expect(text()).toBe("Note: Intro\n=> A door opens.\n\nEnd");
    undo(view);
    expect(text()).toBe("Note: Intro\nEnd");
    undo(view);
    expect(text()).toBe("Intro\nEnd");
  });

  it("removes the streamed text on cancel, leaving no undo step", () => {
    makeView("@ Act");
    const live = LiveOutput.insert(view, "end-of-note", "=> Partial");
    live.cancel(view);
    expect(text()).toBe("@ Act");
    expect(view.state.field(liveSpanField)).toBeNull();
  });

  it("streams a regenerate over the old output and restores it on cancel", () => {
    makeView("@ Act\n=> Old result\n");
    const old = { from: 6, to: 19 };
    const live = LiveOutput.replace(view, old, "=> New");
    expect(text()).toBe("@ Act\n=> New\n");
    expect(docWithoutLiveOutput(view.state)).toBe("@ Act\n=> Old result\n");
    live.cancel(view);
    expect(text()).toBe("@ Act\n=> Old result\n");
  });

  it("commits a regenerate as one undoable replace", () => {
    makeView("@ Act\n=> Old result\n");
    const live = LiveOutput.replace(view, { from: 6, to: 19 }, "=> New");
    live.commit(view, "=> New result");
    expect(text()).toBe("@ Act\n=> New result\n");
    undo(view);
    expect(text()).toBe("@ Act\n=> Old result\n");
  });

  it("stops writing once the note is swapped out from under it", () => {
    makeView("Note A");
    const live = LiveOutput.insert(view, "end-of-note", "=> For A");
    view.setState(EditorState.create({ doc: "Note B", extensions: [history(), liveSpanField] }));
    expect(live.write(view, "=> For A, more")).toBe(false);
    expect(live.commit(view, "=> Final")).toBeNull();
    expect(text()).toBe("Note B");
  });

  it("reports content changes only for real edits, not streaming updates", () => {
    makeView("Log");
    const before = view.state;
    const live = LiveOutput.insert(view, "end-of-note", "=> A");
    expect(contentChanged(before, view.state)).toBe(false);
    const mid = view.state;
    type(0, "x");
    expect(contentChanged(mid, view.state)).toBe(true);
    const typed = view.state;
    live.commit(view, "=> A.");
    expect(contentChanged(typed, view.state)).toBe(true);
  });
});
