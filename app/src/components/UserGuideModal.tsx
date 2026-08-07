import { useMemo } from "react";
import { marked, Renderer } from "marked";
import userGuideRaw from "../lib/userGuide";

interface UserGuideModalProps {
  onClose: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

// Gives every heading a GitHub-style slug id so the guide's own "## Contents" links can jump to
// a section — plain marked doesn't add heading ids by default.
const guideRenderer = new Renderer();
guideRenderer.heading = function heading(token) {
  const html = this.parser.parseInline(token.tokens);
  const plainText = this.parser.parseInline(token.tokens, this.parser.textRenderer);
  return `<h${token.depth} id="${slugify(plainText)}">${html}</h${token.depth}>\n`;
};

export default function UserGuideModal({ onClose }: UserGuideModalProps) {
  // The guide is bundled at build time (see lib/userGuide.ts), not user input, so rendering its
  // parsed HTML directly is safe — nothing here comes from an untrusted source.
  const html = useMemo(() => marked.parse(userGuideRaw, { renderer: guideRenderer }) as string, []);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel user-guide-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="user-guide-header">
          <h2>User Guide</h2>
          <button type="button" onClick={onClose} title="Close">×</button>
        </div>
        <div className="user-guide-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
