import { useEffect, useRef, useState } from "react";

interface FormatToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onStrikethrough: () => void;
  onCode: () => void;
  onCodeBlock: () => void;
  onHeading: (level: number) => void;
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
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  function runAndClose(action: () => void) {
    action();
    setMoreOpen(false);
  }

  return (
    <div className="format-toolbar">
      <button className="format-button" onClick={onBold} title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button className="format-button" onClick={onItalic} title="Italic (Ctrl+I)"><em>I</em></button>
      <button className="format-button" onClick={onCode} title="Code (Ctrl+E)"><code>{"</>"}</code></button>
      <select
        className="format-heading-select"
        value=""
        onChange={(e) => {
          const level = Number(e.currentTarget.value);
          if (level) onHeading(level);
          e.currentTarget.value = "";
        }}
        title="Heading level"
      >
        <option value="" disabled>H</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="5">Heading 5</option>
        <option value="6">Heading 6</option>
      </select>
      <button className="format-button" onClick={onLink} title="Link">🔗</button>
      <span className="format-divider" />
      <div className="format-more" ref={menuRef}>
        <button className="format-button" onClick={() => setMoreOpen((v) => !v)} title="More formatting">
          More ⋯
        </button>
        {moreOpen && (
          <div className="format-more-menu">
            <button onClick={() => runAndClose(onStrikethrough)}><s>S</s> Strikethrough</button>
            <button onClick={() => runAndClose(onCodeBlock)}><code>{"{ }"}</code> Code block</button>
            <button onClick={() => runAndClose(onBlockquote)}>" Blockquote</button>
            <button onClick={() => runAndClose(onBulletList)}>• Bullet list</button>
            <button onClick={() => runAndClose(onNumberedList)}>1. Numbered list</button>
            <button onClick={() => runAndClose(onTaskList)}>☑ Task list</button>
            <button onClick={() => runAndClose(onImage)}>🖼 Image</button>
            <button onClick={() => runAndClose(onTable)}>⊞ Table</button>
            <button onClick={() => runAndClose(onHorizontalRule)}>― Horizontal rule</button>
            <button onClick={() => runAndClose(onFootnote)}>[^] Footnote</button>
          </div>
        )}
      </div>
    </div>
  );
}
