import { Ref, useCallback, useRef, useState } from "react";
import {
  Bold, Code, Ellipsis, Superscript, Image, Italic, Link, List, ListChecks, ListOrdered, Minus, Quote,
  SquareCode, Strikethrough, Table
} from "lucide-react";
import { useDismiss } from "./useDismiss";
import HeadingPicker, { HeadingPickerHandle } from "./HeadingPicker";

interface FormatToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onStrikethrough: () => void;
  onCode: () => void;
  onCodeBlock: () => void;
  onHeading: (level: number) => void;
  getHeadingLevel: () => number;
  headingPickerRef?: Ref<HeadingPickerHandle>;
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
  getHeadingLevel,
  headingPickerRef,
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

  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismiss(menuRef, moreOpen, closeMore);

  function runAndClose(action: () => void) {
    action();
    setMoreOpen(false);
  }

  return (
    <div className="format-toolbar">
      <button className="format-button" onClick={onBold} title="Bold (Ctrl+B)"><Bold size={15} /></button>
      <button className="format-button" onClick={onItalic} title="Italic (Ctrl+I)"><Italic size={15} /></button>
      <button className="format-button" onClick={onCode} title="Code (Ctrl+E)"><Code size={15} /></button>
      <HeadingPicker ref={headingPickerRef} getLevel={getHeadingLevel} onSetLevel={onHeading} />
      <button className="format-button" onClick={onLink} title="Link"><Link size={15} /></button>
      <span className="format-divider" />
      <div className="format-more" ref={menuRef}>
        <button className="format-button" onClick={() => setMoreOpen((v) => !v)} title="More formatting">
          <Ellipsis size={15} /> More
        </button>
        {moreOpen && (
          <div className="popover-menu">
            <button onClick={() => runAndClose(onStrikethrough)}><Strikethrough size={14} /> Strikethrough</button>
            <button onClick={() => runAndClose(onCodeBlock)}><SquareCode size={14} /> Code block</button>
            <button onClick={() => runAndClose(onBlockquote)}><Quote size={14} /> Blockquote</button>
            <button onClick={() => runAndClose(onBulletList)}><List size={14} /> Bullet list</button>
            <button onClick={() => runAndClose(onNumberedList)}><ListOrdered size={14} /> Numbered list</button>
            <button onClick={() => runAndClose(onTaskList)}><ListChecks size={14} /> Task list</button>
            <button onClick={() => runAndClose(onImage)}><Image size={14} /> Image</button>
            <button onClick={() => runAndClose(onTable)}><Table size={14} /> Table</button>
            <button onClick={() => runAndClose(onHorizontalRule)}><Minus size={14} /> Horizontal rule</button>
            <button onClick={() => runAndClose(onFootnote)}><Superscript size={14} /> Footnote</button>
          </div>
        )}
      </div>
    </div>
  );
}
