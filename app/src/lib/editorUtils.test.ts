// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { insertFootnote, setHeadingLevel } from "./editorUtils";

let view: EditorView | undefined;

function makeView(doc: string, cursor = doc.length): EditorView {
  view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor } }), parent: document.body });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("insertFootnote", () => {
  it("starts at 1 and appends a definition stub, leaving the cursor on it", () => {
    const v = makeView("A claim.", 7);
    insertFootnote(v);
    expect(v.state.doc.toString()).toBe("A claim[^1].\n[^1]: ");
    expect(v.state.selection.main.head).toBe(v.state.doc.length);
  });

  it("numbers after the highest existing footnote", () => {
    const v = makeView("One[^2] two[^5].\n\n[^2]: a\n[^5]: b", 0);
    insertFootnote(v);
    expect(v.state.doc.toString()).toBe("[^6]One[^2] two[^5].\n\n[^2]: a\n[^5]: b\n[^6]: ");
  });
});

describe("setHeadingLevel", () => {
  it("sets, replaces, and toggles off a heading", () => {
    const v = makeView("Title", 0);
    setHeadingLevel(v, 2);
    expect(v.state.doc.toString()).toBe("## Title");
    setHeadingLevel(v, 3);
    expect(v.state.doc.toString()).toBe("### Title");
    setHeadingLevel(v, 3);
    expect(v.state.doc.toString()).toBe("Title");
  });
});
