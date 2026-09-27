import { useState } from "react";
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
  onSaveSnapshot: () => void;
  onVersionHistory: () => void;
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

function AccordionSection({
  title,
  count,
  emptyMessage,
  children
}: {
  title: string;
  count: number;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-toggle" onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        <span className="sidebar-section-count">{count}</span>
      </button>
      {open && (count === 0 ? <p className="empty-note">{emptyMessage}</p> : children)}
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
  onSaveSnapshot,
  onVersionHistory,
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
      <div className="sidebar-note-actions">
        <button disabled={!activePath} onClick={onSaveSnapshot} title="Save a snapshot of this note's current state">Snapshot</button>
        <button disabled={!activePath} onClick={onVersionHistory} title="View and restore previous snapshots of this note">History</button>
      </div>

      <AccordionSection title="Campaigns" count={campaigns.length} emptyMessage="No campaigns yet.">
        {campaigns.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            active={f.path === activePath}
            onSelect={() => onSelect(f)}
            onDelete={() => onDeleteNote(f)}
          />
        ))}
      </AccordionSection>

      <AccordionSection title="One-shot" count={oneShots.length} emptyMessage="No one-shots yet.">
        {oneShots.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            active={f.path === activePath}
            onSelect={() => onSelect(f)}
            onDelete={() => onDeleteNote(f)}
          />
        ))}
      </AccordionSection>

      <div className="sidebar-footer">Sybyl{version ? ` v${version}` : ""}</div>
      </aside>
    </>
  );
}
