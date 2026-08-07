import { isAndroid } from "../lib/vault";
import { VaultFile } from "../lib/types";

interface SidebarProps {
  files: VaultFile[];
  activePath: string | null;
  onSelect: (file: VaultFile) => void;
  onChangeVault: () => void;
  onNewNote: () => void;
  onImportNote: () => void;
  onExportNote: () => void;
  onDeleteNote: (file: VaultFile) => void;
  vaultPath: string | null;
  version: string;
  open: boolean;
  onClose: () => void;
}

function FileRow({
  file,
  active,
  onSelect,
  onDelete
}: {
  file: VaultFile;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const excerpt = (file.fm.game_context ?? "").trim().slice(0, 80);
  return (
    <div className={`file-row${active ? " active" : ""}`}>
      <button className="file-row-main" onClick={onSelect}>
        <div className="file-row-title">{file.fm.pc_name || file.name.replace(/\.md$/i, "")}</div>
        {excerpt && <div className="file-row-excerpt">{excerpt}{excerpt.length === 80 ? "…" : ""}</div>}
      </button>
      <button
        className="file-row-delete"
        title="Delete note"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function Sidebar({
  files,
  activePath,
  onSelect,
  onChangeVault,
  onNewNote,
  onImportNote,
  onExportNote,
  onDeleteNote,
  vaultPath,
  version,
  open,
  onClose
}: SidebarProps) {
  const campaigns = files.filter((f) => f.fm.session_type !== "one_shot");
  const oneShots = files.filter((f) => f.fm.session_type === "one_shot");

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <span className="vault-path" title={vaultPath ?? ""}>{vaultPath ? vaultPath.split(/[\\/]/).pop() : "No vault"}</span>
          {!isAndroid() && <button className="link-button" onClick={onChangeVault}>Change vault</button>}
          <button className="sidebar-close" onClick={onClose} title="Close sidebar">×</button>
        </div>
      <div className="sidebar-note-actions">
        <button className="new-note-button" disabled={!vaultPath} onClick={onNewNote}>+ New Note</button>
        <button className="import-note-button" disabled={!vaultPath} onClick={onImportNote} title="Import Note">Import</button>
        <button className="export-note-button" disabled={!activePath} onClick={onExportNote} title="Export Note">Export</button>
      </div>

      <div className="sidebar-section">
        <h3>Campagne in corso</h3>
        {campaigns.length === 0 && <p className="empty-note">No campaigns yet.</p>}
        {campaigns.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            active={f.path === activePath}
            onSelect={() => onSelect(f)}
            onDelete={() => onDeleteNote(f)}
          />
        ))}
      </div>

      <div className="sidebar-section">
        <h3>One-shot</h3>
        {oneShots.length === 0 && <p className="empty-note">No one-shots yet.</p>}
        {oneShots.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            active={f.path === activePath}
            onSelect={() => onSelect(f)}
            onDelete={() => onDeleteNote(f)}
          />
        ))}
      </div>

      <div className="sidebar-footer">Sybyl{version ? ` v${version}` : ""}</div>
      </aside>
    </>
  );
}
