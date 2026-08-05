import { useEffect, useState } from "react";

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
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, commands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = commands[selected];
        if (cmd) onRun(cmd);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commands, selected, onRun, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel palette-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Sybyl Commands</h2>
        <ul className="palette-list">
          {commands.map((cmd, i) => (
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
