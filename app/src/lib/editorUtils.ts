import { EditorView } from "@codemirror/view";

export interface InsertedRange {
  from: number;
  to: number;
}

export function insertAtCursor(view: EditorView, text: string): InsertedRange {
  const pos = view.state.selection.main.head;
  const insert = `\n${text}\n`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length }
  });
  view.focus();
  return { from: pos + 1, to: pos + 1 + text.length };
}

export function appendToNote(view: EditorView, text: string): InsertedRange {
  const pos = view.state.doc.length;
  const insert = `\n${text}\n`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length }
  });
  view.focus();
  return { from: pos + 1, to: pos + 1 + text.length };
}

export function getSelection(view: EditorView): string {
  return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to).trim();
}

export function insertBelowSelection(view: EditorView, text: string): InsertedRange {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const insert = `\n${text}`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length }
  });
  view.focus();
  return { from: line.to + 1, to: line.to + 1 + text.length };
}

/** Wraps the current selection with `before`/`after` markers (bold, italic, code, links, ...).
 * With no selection, inserts an empty marker pair and places the cursor between them. */
export function wrapSelection(view: EditorView, before: string, after: string): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = `${before}${selected}${after}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? { anchor: from, head: from + insert.length }
      : { anchor: from + before.length }
  });
  view.focus();
}

/** Toggles a line prefix (e.g. "## ") at the start of the line containing the cursor. */
export function togglePrefixLine(view: EditorView, prefix: string): void {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const hasPrefix = line.text.startsWith(prefix);
  const changes = hasPrefix
    ? { from: line.from, to: line.from + prefix.length, insert: "" }
    : { from: line.from, insert: prefix };
  view.dispatch({ changes });
  view.focus();
}

/** Sets the line containing the cursor to the given GFM heading level (1-6). Replaces any
 * existing heading prefix of a different level; clicking the line's current level again removes
 * it entirely (toggle off), matching togglePrefixLine's behavior for the other prefix buttons. */
export function setHeadingLevel(view: EditorView, level: number): void {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const match = line.text.match(/^#{1,6}(?=\s|$)\s*/);
  const isSameLevel = match ? match[0].trimEnd().length === level : false;
  const insert = isSameLevel ? "" : `${"#".repeat(level)} `;
  const to = match ? line.from + match[0].length : line.from;
  view.dispatch({ changes: { from: line.from, to, insert } });
  view.focus();
}

/** Inserts an auto-numbered footnote reference at the cursor (`[^n]`) and appends a matching
 * definition stub (`[^n]: `) at the end of the document, with the cursor left there ready to
 * type the note. `n` is one past the highest existing `[^N]` reference in the document. */
export function insertFootnote(view: EditorView): void {
  const doc = view.state.doc.toString();
  const refs = [...doc.matchAll(/\[\^(\d+)\]/g)].map((m) => parseInt(m[1], 10));
  const n = refs.length > 0 ? Math.max(...refs) + 1 : 1;
  const marker = `[^${n}]`;
  const defText = `\n[^${n}]: `;
  const pos = view.state.selection.main.to;
  const docLength = doc.length;
  view.dispatch({
    changes: [
      { from: pos, insert: marker },
      { from: docLength, insert: defText }
    ],
    selection: { anchor: docLength + marker.length + defText.length }
  });
  view.focus();
}

export function isInsideCodeBlock(view: EditorView, pos?: number): boolean {
  const checkPos = pos ?? view.state.selection.main.head;
  const checkLine = view.state.doc.lineAt(checkPos).number;
  let inside = false;
  for (let i = 1; i < checkLine; i++) {
    if (/^```/.test(view.state.doc.line(i).text)) {
      inside = !inside;
    }
  }
  return inside;
}
