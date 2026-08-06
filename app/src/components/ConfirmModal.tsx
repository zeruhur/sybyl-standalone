interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="confirm-danger-button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
