import { useEffect, useRef } from "react";
import { EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { lonelogHighlight } from "../lib/lonelogHighlight";
import { setHeadingLevel, wrapSelection } from "../lib/editorUtils";
import { contentChanged, docWithoutLiveOutput, liveSpanField } from "../lib/liveOutput";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: "dark" | "light";
  editorRef?: React.MutableRefObject<EditorView | null>;
  /** Called when the selection, focus, content or scroll position changes (drives the selection
   * formatting bubble). */
  onSelectionChange?: () => void;
}

// oneDark bundles both chrome colors and a dark-appropriate syntax HighlightStyle, already
// proven out visually — kept as-is for dark mode. Light mode needs its own chrome to match the
// warm-parchment palette (App.css's `:root[data-theme="light"]`); basicSetup's own
// defaultHighlightStyle (designed for light backgrounds) already handles syntax token colors,
// so this only needs to cover editor/gutter/selection/cursor chrome.
const lightEditorTheme = EditorView.theme({
  "&": { backgroundColor: "#f6f3ee", color: "#221f1a" },
  ".cm-content": { caretColor: "#221f1a" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#221f1a" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#d9cfa8"
  },
  ".cm-gutters": { backgroundColor: "#ece7de", color: "#6e6558", border: "none" },
  ".cm-activeLine": { backgroundColor: "#ece7de" },
  ".cm-activeLineGutter": { backgroundColor: "#ece7de" }
});

export default function Editor({ value, onChange, theme, editorRef, onSelectionChange }: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Fully remounts the EditorView when the theme flips, rather than hot-swapping a CM6
  // Compartment. A Compartment must stay bound to a single EditorView's lifecycle; sharing one
  // across remounts (e.g. React StrictMode's double-invoked effects in dev) left the dark theme
  // partially applied. A clean remount trades preserving scroll/cursor position across a theme
  // toggle — a rare, deliberate action — for guaranteed-correct styling every time.
  const extensionsRef = useRef<Extension[]>([]);

  useEffect(() => {
    if (!hostRef.current) return;
    const extensions: Extension[] = [
      // Prec.high: basicSetup's own defaultKeymap binds Mod-i to selectParentSyntax and would
      // otherwise win (earlier extensions take precedence), silently swallowing Ctrl+I.
      Prec.high(
        keymap.of([
          { key: "Mod-b", run: (v) => { wrapSelection(v, "**", "**"); return true; } },
          { key: "Mod-i", run: (v) => { wrapSelection(v, "*", "*"); return true; } },
          { key: "Mod-e", run: (v) => { wrapSelection(v, "`", "`"); return true; } },
          // Ctrl+1-6 set (or toggle off) that heading level, Ctrl+0 returns the line to plain text.
          ...[0, 1, 2, 3, 4, 5, 6].map((level) => ({
            key: `Mod-${level}`,
            run: (v: EditorView) => { setHeadingLevel(v, level); return true; }
          }))
        ])
      ),
      basicSetup,
      markdown({ extensions: GFM }),
      lonelogHighlight(),
      theme === "dark" ? oneDark : lightEditorTheme,
      EditorView.lineWrapping,
      liveSpanField,
      EditorView.updateListener.of((update) => {
        // Streamed generation output is provisional (see lib/liveOutput.ts), so it's left out of
        // what the app sees as the note's content until it's committed.
        if (update.docChanged && contentChanged(update.startState, update.state)) {
          onChangeRef.current(docWithoutLiveOutput(update.state));
        }
        if (update.docChanged || update.selectionSet || update.focusChanged || update.geometryChanged) {
          onSelectionChangeRef.current?.();
        }
      }),
      EditorView.domEventHandlers({
        scroll: () => {
          onSelectionChangeRef.current?.();
        }
      })
    ];
    extensionsRef.current = extensions;
    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    if (editorRef) editorRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorRef) editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Compared without any streaming output, which `value` never includes: otherwise typing during
    // a stream would look like an external change and reset the editor, dropping the stream.
    const current = docWithoutLiveOutput(view.state);
    if (current !== value) {
      // An external value change (switching notes, restoring a snapshot) swaps in a fresh state
      // rather than dispatching a replace: a dispatched replace would land in the undo history
      // (Ctrl+Z would then pull the *previous* note's text into this one, and autosave would
      // persist it) and would also fire onChange, spuriously re-saving a note just by opening it.
      view.setState(EditorState.create({ doc: value, extensions: extensionsRef.current }));
    }
  }, [value]);

  return <div className="editor-host" ref={hostRef} />;
}
