import { useEffect, useMemo, useState } from "react";
import { VaultFile } from "../lib/types";

interface FileSwitcherProps {
  files: VaultFile[];
  onPick: (file: VaultFile) => void;
  onClose: () => void;
}

interface SearchResult {
  file: VaultFile;
  snippet: string | null;
}

/** Returns ~80 chars of context around the first match of `query` in `text`, or null if there's
 * no match. Used to show *why* a note matched a full-text search, not just that it did. */
function findSnippet(text: string, query: string, contextChars = 40): string | null {
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return null;
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + query.length + contextChars);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

/** Splits a snippet into plain/matched segments so the matched substring can be highlighted. */
function highlightSnippet(snippet: string, query: string): { text: string; match: boolean }[] {
  const idx = snippet.toLowerCase().indexOf(query);
  if (idx === -1) return [{ text: snippet, match: false }];
  return [
    { text: snippet.slice(0, idx), match: false },
    { text: snippet.slice(idx, idx + query.length), match: true },
    { text: snippet.slice(idx + query.length), match: false }
  ].filter((part) => part.text);
}

/** Searches filename/PC name first (exact-feel filename switching stays instant), then falls
 * back to the note body, then the digested game_context — a name/PC match never shows a body
 * snippet, since there's nothing surprising to explain there. */
function search(files: VaultFile[], rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return files.map((file) => ({ file, snippet: null }));

  const results: SearchResult[] = [];
  for (const file of files) {
    const titleHaystack = `${file.name} ${file.fm.pc_name ?? ""}`.toLowerCase();
    if (titleHaystack.includes(query)) {
      results.push({ file, snippet: null });
      continue;
    }
    const bodySnippet = findSnippet(file.body, query);
    if (bodySnippet) {
      results.push({ file, snippet: bodySnippet });
      continue;
    }
    const contextSnippet = findSnippet(file.fm.game_context ?? "", query);
    if (contextSnippet) {
      results.push({ file, snippet: contextSnippet });
    }
  }
  return results;
}

export default function FileSwitcher({ files, onPick, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => search(files, query), [files, query]);
  const trimmedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = results[selected];
        if (result) onPick(result.file);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [results, selected, onPick, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel palette-panel" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="switcher-input"
          placeholder="Search notes by name or content..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <ul className="palette-list">
          {results.length === 0 && <li className="empty-note">No matches.</li>}
          {results.map(({ file, snippet }, i) => {
            const preview = snippet ?? file.fm.game_context?.slice(0, 80);
            return (
              <li key={file.path}>
                <button
                  className={`palette-item${i === selected ? " selected" : ""}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => onPick(file)}
                >
                  <div className="file-row-title">{file.fm.pc_name || file.name.replace(/\.md$/i, "")}</div>
                  {preview && (
                    <div className="file-row-excerpt">
                      {snippet && trimmedQuery
                        ? highlightSnippet(preview, trimmedQuery).map((part, j) =>
                            part.match ? <mark key={j}>{part.text}</mark> : <span key={j}>{part.text}</span>
                          )
                        : preview}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
