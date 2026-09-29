import { useCallback, useRef, useState } from "react";
import { Camera, ChevronDown, FileDown, History, Pencil, Trash2 } from "lucide-react";
import { useDismiss } from "./useDismiss";

interface NoteMenuProps {
  title: string;
  onEditInfo: () => void;
  onSaveSnapshot: () => void;
  onVersionHistory: () => void;
  onExport: () => void;
  onDelete: () => void;
}

/** The active note's title in the header, doubling as the menu for everything that acts on the
 * note as a whole (rather than inserting text into it). */
export default function NoteMenu({ title, onEditInfo, onSaveSnapshot, onVersionHistory, onExport, onDelete }: NoteMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="note-menu" ref={ref}>
      <button className="note-menu-toggle" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <span className="note-menu-title">{title}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="popover-menu" role="menu">
          <button role="menuitem" onClick={() => run(onEditInfo)}><Pencil size={14} /> Edit campaign info</button>
          <button role="menuitem" onClick={() => run(onSaveSnapshot)}><Camera size={14} /> Save snapshot</button>
          <button role="menuitem" onClick={() => run(onVersionHistory)}><History size={14} /> Version history</button>
          <button role="menuitem" onClick={() => run(onExport)}><FileDown size={14} /> Export…</button>
          <div className="popover-divider" />
          <button role="menuitem" className="popover-danger" onClick={() => run(onDelete)}><Trash2 size={14} /> Delete note…</button>
        </div>
      )}
    </div>
  );
}
