import { VaultFile } from "../lib/types";

interface SidebarProps {
  files: VaultFile[];
  activePath: string | null;
  onSelect: (file: VaultFile) => void;
  onChangeVault: () => void;
  onNewNote: () => void;
  vaultPath: string | null;
  version: string;
}

function FileRow({ file, active, onSelect }: { file: VaultFile; active: boolean; onSelect: () => void }) {
  const excerpt = (file.fm.game_context ?? "").trim().slice(0, 80);
  return (
    <button className={`file-row${active ? " active" : ""}`} onClick={onSelect}>
      <div className="file-row-title">{file.fm.pc_name || file.name.replace(/\.md$/i, "")}</div>
      {excerpt && <div className="file-row-excerpt">{excerpt}{excerpt.length === 80 ? "…" : ""}</div>}
    </button>
  );
}

export default function Sidebar({ files, activePath, onSelect, onChangeVault, onNewNote, vaultPath, version }: SidebarProps) {
  const campaigns = files.filter((f) => f.fm.session_type !== "one_shot");
  const oneShots = files.filter((f) => f.fm.session_type === "one_shot");

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="vault-path" title={vaultPath ?? ""}>{vaultPath ? vaultPath.split(/[\\/]/).pop() : "No vault"}</span>
        <button className="link-button" onClick={onChangeVault}>Change vault</button>
      </div>
      <button className="new-note-button" disabled={!vaultPath} onClick={onNewNote}>+ New Note</button>

      <div className="sidebar-section">
        <h3>Campagne in corso</h3>
        {campaigns.length === 0 && <p className="empty-note">No campaigns yet.</p>}
        {campaigns.map((f) => (
          <FileRow key={f.path} file={f} active={f.path === activePath} onSelect={() => onSelect(f)} />
        ))}
      </div>

      <div className="sidebar-section">
        <h3>One-shot</h3>
        {oneShots.length === 0 && <p className="empty-note">No one-shots yet.</p>}
        {oneShots.map((f) => (
          <FileRow key={f.path} file={f} active={f.path === activePath} onSelect={() => onSelect(f)} />
        ))}
      </div>

      <div className="sidebar-footer">Sybyl{version ? ` v${version}` : ""}</div>
    </aside>
  );
}
