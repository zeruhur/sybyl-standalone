interface FormatToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onCode: () => void;
  onHeading: () => void;
  onLink: () => void;
}

export default function FormatToolbar({ onBold, onItalic, onCode, onHeading, onLink }: FormatToolbarProps) {
  return (
    <div className="format-toolbar">
      <button className="format-button" onClick={onBold} title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button className="format-button" onClick={onItalic} title="Italic (Ctrl+I)"><em>I</em></button>
      <button className="format-button" onClick={onCode} title="Code (Ctrl+E)"><code>{"</>"}</code></button>
      <button className="format-button" onClick={onHeading} title="Heading">H</button>
      <button className="format-button" onClick={onLink} title="Link">🔗</button>
    </div>
  );
}
