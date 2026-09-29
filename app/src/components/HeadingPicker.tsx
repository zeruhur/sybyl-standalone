import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown, Heading, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, LucideIcon, Pilcrow } from "lucide-react";
import { useDismiss } from "./useDismiss";

const LEVEL_ICONS: LucideIcon[] = [Pilcrow, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];

export interface HeadingPickerHandle {
  /** Re-reads the cursor line's heading level so the button reflects it. */
  sync: () => void;
}

interface HeadingPickerProps {
  getLevel: () => number;
  /** 1-6 sets that level (or removes it, if the line is already that level); 0 clears it. */
  onSetLevel: (level: number) => void;
}

/** Toolbar heading button: shows the cursor line's current level and opens a single row of
 * level chips (¶, H1-H6). Owns its level state behind `sync()` so cursor moves re-render only
 * this button, not the whole app. */
const HeadingPicker = forwardRef<HeadingPickerHandle, HeadingPickerProps>(function HeadingPicker({ getLevel, onSetLevel }, ref) {
  const [level, setLevel] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  useImperativeHandle(ref, () => ({ sync: () => setLevel(getLevel()) }));

  function pick(next: number) {
    setOpen(false);
    onSetLevel(next);
  }

  const CurrentIcon = level > 0 ? LEVEL_ICONS[level] : Heading;

  return (
    <div className="format-more" ref={rootRef}>
      <button
        className={`format-button${level > 0 ? " active" : ""}`}
        onClick={() => {
          setLevel(getLevel());
          setOpen((v) => !v);
        }}
        title={level > 0 ? `Heading ${level} (Ctrl+0-6)` : "Heading (Ctrl+1-6)"}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon size={15} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="popover-menu popover-row" role="menu">
          {LEVEL_ICONS.map((Icon, n) => (
            <button
              key={n}
              role="menuitemradio"
              aria-checked={level === n}
              className={level === n ? "active" : undefined}
              onClick={() => pick(n)}
              title={n === 0 ? "Plain text (Ctrl+0)" : `Heading ${n} (Ctrl+${n})`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default HeadingPicker;
