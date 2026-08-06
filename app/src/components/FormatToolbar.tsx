interface FormatToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onStrikethrough: () => void;
  onCode: () => void;
  onCodeBlock: () => void;
  onHeading: () => void;
  onBlockquote: () => void;
  onBulletList: () => void;
  onNumberedList: () => void;
  onTaskList: () => void;
  onLink: () => void;
  onImage: () => void;
  onTable: () => void;
  onHorizontalRule: () => void;
  onFootnote: () => void;
}

export default function FormatToolbar({
  onBold,
  onItalic,
  onStrikethrough,
  onCode,
  onCodeBlock,
  onHeading,
  onBlockquote,
  onBulletList,
  onNumberedList,
  onTaskList,
  onLink,
  onImage,
  onTable,
  onHorizontalRule,
  onFootnote
}: FormatToolbarProps) {
  return (
    <div className="format-toolbar">
      <button className="format-button" onClick={onBold} title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button className="format-button" onClick={onItalic} title="Italic (Ctrl+I)"><em>I</em></button>
      <button className="format-button" onClick={onStrikethrough} title="Strikethrough"><s>S</s></button>
      <button className="format-button" onClick={onCode} title="Code (Ctrl+E)"><code>{"</>"}</code></button>
      <button className="format-button" onClick={onCodeBlock} title="Code block"><code>{"{ }"}</code></button>
      <span className="format-divider" />
      <button className="format-button" onClick={onHeading} title="Heading">H</button>
      <button className="format-button" onClick={onBlockquote} title="Blockquote">"</button>
      <span className="format-divider" />
      <button className="format-button" onClick={onBulletList} title="Bullet list">•</button>
      <button className="format-button" onClick={onNumberedList} title="Numbered list">1.</button>
      <button className="format-button" onClick={onTaskList} title="Task list">☑</button>
      <span className="format-divider" />
      <button className="format-button" onClick={onLink} title="Link">🔗</button>
      <button className="format-button" onClick={onImage} title="Image">🖼</button>
      <button className="format-button" onClick={onTable} title="Table">⊞</button>
      <button className="format-button" onClick={onHorizontalRule} title="Horizontal rule">―</button>
      <button className="format-button" onClick={onFootnote} title="Footnote">[^]</button>
    </div>
  );
}
