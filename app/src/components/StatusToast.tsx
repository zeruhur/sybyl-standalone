import { RotateCcw, X } from "lucide-react";

interface StatusToastProps {
  message: string;
  loading: boolean;
  canRegenerate: boolean;
  onCancel: () => void;
  onRegenerate: () => void;
  onDismiss: () => void;
}

/** Floating status message over the top-right of the editor. Unlike the old status strip it
 * doesn't take layout space, so the log no longer jumps when a message appears or clears. */
export default function StatusToast({ message, loading, canRegenerate, onCancel, onRegenerate, onDismiss }: StatusToastProps) {
  if (!message) return null;
  const isError = /\berror\b/i.test(message);
  return (
    <div className={`status-toast${isError ? " status-toast-error" : ""}`} role="status" aria-live="polite">
      {loading && <span className="status-spinner" aria-hidden="true" />}
      <span className="status-toast-message">{message}</span>
      {loading && (
        <button className="cancel-button" onClick={onCancel}>Cancel</button>
      )}
      {!loading && canRegenerate && (
        <button className="regenerate-button" onClick={onRegenerate} title="Re-run the last generation and replace its output">
          <RotateCcw size={12} /> Regenerate
        </button>
      )}
      {!loading && (
        <button className="status-toast-close" onClick={onDismiss} title="Dismiss"><X size={14} /></button>
      )}
    </div>
  );
}
