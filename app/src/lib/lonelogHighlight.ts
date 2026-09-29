import { Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { DICE_TOKEN_REGEX } from "./lonelog/diceNotation";
import { CARD_TOKEN_REGEX } from "./lonelog/cardNotation";

const sceneMatcher = new MatchDecorator({
  regexp: /^#{0,6}\s*(?:T\d+-)?S\d+[\w.]*\s*\*[^*]*\*/gm,
  decoration: () => Decoration.mark({ class: "cm-lonelog-scene" })
});

const tagMatcher = new MatchDecorator({
  regexp: /\[(N|L|PC|Thread|Clock|Track):[^\]]*\]/g,
  decoration: (match) => Decoration.mark({ class: `cm-lonelog-tag cm-lonelog-tag-${match[1].toLowerCase()}` })
});

const beatMatcher = new MatchDecorator({
  regexp: /^(@|\?|->|=>|d:)/gm,
  decoration: (match) => Decoration.mark({ class: `cm-lonelog-beat cm-lonelog-beat-${beatClass(match[1])}` })
});

function beatClass(symbol: string): string {
  switch (symbol) {
    case "@": return "action";
    case "?": return "question";
    case "->": return "result";
    case "=>": return "consequence";
    case "d:": return "roll";
    default: return "other";
  }
}

function buildPlugin(matcher: MatchDecorator) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );
}

// Whole-line classes, on top of the token marks above, so each kind of beat reads at a glance in
// a long log: scene headers get a heading treatment, beat lines a colored left rule. The patterns
// mirror sceneMatcher/beatMatcher without the global flag, since each is tested against one line.
const SCENE_LINE = /^#{0,6}\s*(?:T\d+-)?S\d+[\w.]*\s*\*[^*]*\*/;
const BEAT_LINE = /^(@|\?|->|=>|d:)/;

function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const beat = BEAT_LINE.exec(line.text);
      const className = SCENE_LINE.test(line.text)
        ? "cm-lonelog-line-scene"
        : beat
        ? `cm-lonelog-line cm-lonelog-line-${beatClass(beat[1])}`
        : null;
      if (className) builder.add(line.from, line.from, Decoration.line({ class: className }));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const lineClassPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
);

const DICE_LINE_PREFIX = /^\s*d:/;

function buildDiceCardDecorations(view: EditorView): DecorationSet {
  const matches: { from: number; to: number; className: string }[] = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (DICE_LINE_PREFIX.test(line.text)) {
        for (const [regex, className] of [
          [DICE_TOKEN_REGEX, "cm-lonelog-dice"],
          [CARD_TOKEN_REGEX, "cm-lonelog-card"]
        ] as const) {
          regex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(line.text))) {
            matches.push({ from: line.from + match.index, to: line.from + match.index + match[0].length, className });
          }
        }
      }
      pos = line.to + 1;
    }
  }
  matches.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of matches) {
    builder.add(m.from, m.to, Decoration.mark({ class: m.className }));
  }
  return builder.finish();
}

const diceCardPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDiceCardDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDiceCardDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
);

export function lonelogHighlight() {
  return [buildPlugin(sceneMatcher), buildPlugin(tagMatcher), buildPlugin(beatMatcher), diceCardPlugin, lineClassPlugin];
}
