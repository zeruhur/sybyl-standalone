interface ConflictModalProps {
  noteName: string;
  /** True when the note was deleted outside Sybyl rather than edited. */
  deleted: boolean;
  onKeepMine: () => void;
  onTakeDisk: () => void;
}

/** Asks which version wins when a note changed on disk outside Sybyl while it had unsaved edits.
 * There's no cancel: autosave for the note stays paused until the user picks one. */
export default function ConflictModal({ noteName, deleted, onKeepMine, onTakeDisk }: ConflictModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel" role="alertdialog" aria-labelledby="conflict-title">
        <h2 id="conflict-title">{deleted ? "Note deleted outside Sybyl" : "Note changed outside Sybyl"}</h2>
        <p className="confirm-message">
          {deleted
            ? `"${noteName}" was deleted or moved by another program while it was open here. Save it again, or close it? If you close it, your version is kept in its Version history folder.`
            : `"${noteName}" was edited by another program (another editor or a sync tool) since Sybyl opened it. Which version do you want to keep? The other one is saved to Version history either way.`}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onTakeDisk}>
            {deleted ? "Close it" : "Load the outside version"}
          </button>
          <button type="button" onClick={onKeepMine} autoFocus>
            {deleted ? "Save it again" : "Keep my version"}
          </button>
        </div>
      </div>
    </div>
  );
}
