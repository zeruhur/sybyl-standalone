import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { Bold, Code, Italic, Link, Strikethrough } from "lucide-react";

export interface SelectionBubbleHandle {
  /** Re-reads the editor selection and repositions (or hides) the bubble. */
  update: () => void;
}

interface SelectionBubbleProps {
  getView: () => EditorView | null;
  onBold: () => void;
  onItalic: () => void;
  onStrikethrough: () => void;
  onCode: () => void;
  onLink: () => void;
}

const BUBBLE_HEIGHT = 36;

/** Small formatting toolbar floating above a non-empty editor selection. It owns its position
 * state, so selection changes (every cursor move) re-render only this component, not App. Must be
 * rendered inside a `position: relative` container that also holds the editor. */
const SelectionBubble = forwardRef<SelectionBubbleHandle, SelectionBubbleProps>(function SelectionBubble(
  { getView, onBold, onItalic, onStrikethrough, onCode, onLink },
  ref
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    update() {
      const view = getView();
      const sel = view?.state.selection.main;
      const container = rootRef.current?.parentElement;
      if (!view || !sel || sel.empty || !view.hasFocus || !container) {
        setPos(null);
        return;
      }
      const start = view.coordsAtPos(sel.from);
      const end = view.coordsAtPos(sel.to);
      const box = container.getBoundingClientRect();
      const scroller = view.scrollDOM.getBoundingClientRect();
      if (!start || !end || start.top < scroller.top || start.top > scroller.bottom) {
        setPos(null);
        return;
      }
      // Above the selection's first line, or below its last line when there's no room above.
      const above = start.top - box.top - BUBBLE_HEIGHT - 6;
      const top = above >= scroller.top - box.top ? above : end.bottom - box.top + 6;
      const left = Math.max(8, Math.min(start.left - box.left, box.width - 220));
      setPos({ top, left });
    }
  }));

  // mousedown is cancelled so the editor keeps focus and its selection while a button is pressed.
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div ref={rootRef} className="selection-bubble" hidden={!pos} style={pos ?? undefined} role="toolbar" aria-label="Format selection">
      <button onMouseDown={keep} onClick={onBold} title="Bold (Ctrl+B)"><Bold size={15} /></button>
      <button onMouseDown={keep} onClick={onItalic} title="Italic (Ctrl+I)"><Italic size={15} /></button>
      <button onMouseDown={keep} onClick={onStrikethrough} title="Strikethrough"><Strikethrough size={15} /></button>
      <button onMouseDown={keep} onClick={onCode} title="Code (Ctrl+E)"><Code size={15} /></button>
      <button onMouseDown={keep} onClick={onLink} title="Link"><Link size={15} /></button>
    </div>
  );
});

export default SelectionBubble;
