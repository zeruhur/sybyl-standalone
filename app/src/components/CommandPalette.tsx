import { useEffect, useMemo, useState } from "react";

export interface CommandItem {
  id: string;
  label: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: CommandItem[];
  onRun: (command: CommandItem) => void;
  onClose: () => void;
}

export default function CommandPalette({ commands, onRun, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((cmd) => cmd.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) onRun(cmd);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selected, onRun, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel palette-panel" onMouseDown={(e) => e.stopPropagation()}>
        {/* Autofocused so keystrokes land here — without a focused field, typing (and Enter/arrow
            keys) fell through to the editor underneath and edited the note. */}
        <input
          autoFocus
          className="switcher-input"
          placeholder="Type to filter commands..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <ul className="palette-list">
          {filtered.length === 0 && <li className="empty-note">No matching commands.</li>}
          {filtered.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                className={`palette-item${i === selected ? " selected" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => onRun(cmd)}
              >
                {cmd.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
