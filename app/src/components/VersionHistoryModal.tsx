import { Snapshot } from "../lib/history";

interface VersionHistoryModalProps {
  noteName: string;
  snapshots: Snapshot[];
  onRestore: (snapshot: Snapshot) => void;
  onClose: () => void;
}

export default function VersionHistoryModal({ noteName, snapshots, onRestore, onClose }: VersionHistoryModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel history-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Version History — {noteName}</h2>
        {snapshots.length === 0 ? (
          <p className="empty-note">
            No snapshots yet. Sybyl takes one automatically when you open this note (at most every
            10 minutes), or you can save one on demand with "Save Snapshot".
          </p>
        ) : (
          <ul className="palette-list">
            {snapshots.map((snap) => (
              <li key={snap.path} className="source-row">
                <span>{snap.date.toLocaleString()}</span>
                <button type="button" onClick={() => onRestore(snap)}>Restore</button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
