export interface LonelogFormatOptions {
  wrapInCodeBlock: boolean;
  sceneId?: string;
}

function fence(content: string): string {
  return `\`\`\`\n${content}\n\`\`\``;
}

function cleanAiText(text: string): string {
  return text.replace(/^>\s*/gm, "").trim();
}

export function formatStartScene(
  aiText: string,
  sceneId: string,
  sceneDesc: string,
  _opts: LonelogFormatOptions
): string {
  // The trailing *...* is required by the scene parser/highlighter's regex even when there's no
  // description to show — dropping it entirely would make the header unrecognizable as a scene.
  const header = `### ${sceneId} *${sceneDesc.trim()}*`;
  const body = cleanAiText(aiText);
  return `${header}\n\n${body}`;
}

export function formatDeclareAction(
  action: string,
  roll: string,
  aiConsequence: string,
  opts: LonelogFormatOptions
): string {
  const consequence = cleanAiText(aiConsequence)
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.startsWith("=>") ? line : `=> ${line}`))
    .join("\n");
  const rollLine = roll.trim() ? `\nd: ${roll}` : "";
  const notation = `@ ${action}${rollLine}\n${consequence}`;
  return opts.wrapInCodeBlock ? fence(notation) : notation;
}

export function formatAskOracle(
  question: string,
  oracleResult: string,
  aiInterpretation: string,
  opts: LonelogFormatOptions
): string {
  const interpretation = cleanAiText(aiInterpretation)
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.startsWith("=>") ? line : `=> ${line}`))
    .join("\n");
  const notation = `? ${question}\n-> ${oracleResult}\n${interpretation}`;
  return opts.wrapInCodeBlock ? fence(notation) : notation;
}

export function formatInterpretOracle(
  aiInterpretation: string,
  opts: LonelogFormatOptions
): string {
  const interpretation = cleanAiText(aiInterpretation)
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.startsWith("=>") ? line : `=> ${line}`))
    .join("\n");
  return opts.wrapInCodeBlock ? fence(interpretation) : interpretation;
}

export function formatSuggestConsequence(aiOptions: string, opts: LonelogFormatOptions): string {
  const options = cleanAiText(aiOptions)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => (line.startsWith("=>") ? line : `=> ${line}`))
    .join("\n");
  return opts.wrapInCodeBlock ? fence(options) : options;
}

export function formatExpandScene(aiProse: string, _opts: LonelogFormatOptions): string {
  return `\\---\n${cleanAiText(aiProse)}\n---\\`;
}

export function formatAdventureSeed(aiText: string, opts: LonelogFormatOptions): string {
  const axes = cleanAiText(aiText)
    .split("\n")
    .filter(Boolean)
    .map((line) => "  " + line.replace(/^[-*]\s*/, ""))
    .join("\n");
  const notation = `gen: Adventure Seed\n${axes}`;
  return opts.wrapInCodeBlock ? fence(notation) : notation;
}

export function formatCharacter(aiText: string, _opts: LonelogFormatOptions): string {
  return cleanAiText(aiText);
}
