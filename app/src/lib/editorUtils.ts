import { EditorView } from "@codemirror/view";

export function insertAtCursor(view: EditorView, text: string): void {
  const pos = view.state.selection.main.head;
  const insert = `\n${text}\n`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length }
  });
  view.focus();
}

export function appendToNote(view: EditorView, text: string): void {
  const pos = view.state.doc.length;
  const insert = `\n${text}\n`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length }
  });
  view.focus();
}

export function getSelection(view: EditorView): string {
  return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to).trim();
}

export function insertBelowSelection(view: EditorView, text: string): void {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const insert = `\n${text}`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length }
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
