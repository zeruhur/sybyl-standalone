import { useEffect, useMemo, useState } from "react";
import { VaultFile } from "../lib/types";

interface FileSwitcherProps {
  files: VaultFile[];
  onPick: (file: VaultFile) => void;
  onClose: () => void;
}

function matches(file: VaultFile, query: string): boolean {
  const haystack = `${file.name} ${file.fm.pc_name ?? ""} ${file.fm.game_context ?? ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function FileSwitcher({ files, onPick, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    return files.filter((f) => matches(f, query.trim()));
  }, [files, query]);

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
        const file = filtered[selected];
        if (file) onPick(file);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selected, onPick, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel palette-panel" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="switcher-input"
          placeholder="Switch to file..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <ul className="palette-list">
          {filtered.length === 0 && <li className="empty-note">No matches.</li>}
          {filtered.map((file, i) => (
            <li key={file.path}>
              <button
                className={`palette-item${i === selected ? " selected" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => onPick(file)}
              >
                <div className="file-row-title">{file.fm.pc_name || file.name.replace(/\.md$/i, "")}</div>
                {file.fm.game_context && <div className="file-row-excerpt">{file.fm.game_context.slice(0, 80)}</div>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
