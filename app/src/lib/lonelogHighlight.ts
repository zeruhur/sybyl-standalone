import { Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate } from "@codemirror/view";

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

export function lonelogHighlight() {
  return [buildPlugin(sceneMatcher), buildPlugin(tagMatcher), buildPlugin(beatMatcher)];
}
