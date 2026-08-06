import { SourceRef } from "../lib/types";

interface SourceManagerModalProps {
  sources: SourceRef[];
  onRemove: (ref: SourceRef) => void;
  onClose: () => void;
}

export default function SourceManagerModal({ sources, onRemove, onClose }: SourceManagerModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Manage Sources</h2>
        {sources.length === 0 && <p className="empty-note">No sources are attached to this note.</p>}
        {sources.map((source) => (
          <div className="source-row" key={source.vault_path}>
            <div>
              <div className="file-row-title">{source.label}</div>
              <div className="file-row-excerpt">{source.mime_type}</div>
            </div>
            <button onClick={() => onRemove(source)}>Remove</button>
          </div>
        ))}
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
