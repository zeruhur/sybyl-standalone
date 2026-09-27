import { useEffect, useState } from "react";

export interface ListPickerItem {
  id: string;
  label: string;
  description?: string;
}

interface ListPickerModalProps {
  title: string;
  items: ListPickerItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}

export default function ListPickerModal({ title, items, onPick, onClose }: ListPickerModalProps) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[selected];
        if (item) onPick(item.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, selected, onPick, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel palette-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <ul className="palette-list">
          {items.length === 0 && <li className="empty-note">Nothing to pick from.</li>}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                // Takes focus on open so Enter/arrow keys don't also reach the editor underneath.
                autoFocus={i === 0}
                className={`palette-item${i === selected ? " selected" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => onPick(item.id)}
              >
                <div className="file-row-title">{item.label}</div>
                {item.description && <div className="file-row-excerpt">{item.description}</div>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
