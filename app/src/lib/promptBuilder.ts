import { parseLonelogContext, serializeContext } from "./lonelog/parser";
import { GenerationRequest, NoteFrontMatter, SybylSettings } from "./types";

const LONELOG_SYSTEM_ADDENDUM = `
LONELOG NOTATION MODE IS ACTIVE.

When generating consequences, oracle interpretations, or scene text:
- Consequences must start with "=>" (one per line for multiple consequences)
- Oracle answers must start with "->"
- Do not use blockquote markers (">")
- Do not add narrative headers or labels like "[Result]" or "[Scene]"
- For scene descriptions: plain prose only, 2-3 lines, no symbol prefix
- Do not invent or suggest Lonelog tags ([N:], [L:], etc.) - the player manages those

Generate only the symbol-prefixed content lines. The formatter handles wrapping.
`.trim();

/** PC names for the system prompt, without their current state. `pcs` is re-derived from the
 * latest `[PC:Name|state]` tags on every save, so its state part changes whenever HP or stress does,
 * and any change to the system prompt invalidates the Anthropic prompt cache for everything after
 * it (game_context included). The current state still reaches the model through the per-request
 * Lonelog context in the user message. */
function pcNames(fm: NoteFrontMatter): string | undefined {
  if (!fm.pcs) return fm.pc_name;
  return fm.pcs.replace(/\s*\[PC:[^\]]*\]/g, "").trim() || fm.pc_name;
}

function buildBasePrompt(fm: NoteFrontMatter): string {
  const ruleset = fm.ruleset ?? "the game";
  const pcLabel = pcNames(fm);
  const pcs = pcLabel ? `Player character: ${pcLabel}` : "";
  const genre = fm.genre ? `Genre: ${fm.genre}` : "";
  const tone = fm.tone ? `Tone: ${fm.tone}` : "";
  const language = fm.language
    ? `Respond in ${fm.language}.`
    : "Respond in the same language as the user's input.";

  return `You are a tool for solo role-playing of ${ruleset}. You are NOT a game master.

Your role:
- Set the scene and offer alternatives (2-3 options maximum)
- When the user declares an action and their dice roll result, describe only consequences and world reactions
- When the user asks oracle questions, interpret them neutrally in context

STRICT PROHIBITIONS - never violate these:
- Never use second person ("you", "you stand", "you see")
- Never describe the PC's actions, thoughts, or internal states
- Never use dramatic or narrative tone
- Never invent lore, rules, or facts not present in the provided sources or scene context
- Never ask "What do you do?" or similar prompts
- Never use bold text for dramatic effect

RESPONSE FORMAT:
- Neutral, third-person, factual tone
- Past tense for scene descriptions, present tense for world state
- No rhetorical questions
- Be concise. Omit preamble, commentary, and closing remarks. Follow the length instruction in each request.

${pcs}
${genre}
${tone}
${language}`.trim();
}

export function buildSystemPrompt(fm: NoteFrontMatter): string {
  const base = fm.system_prompt_override?.trim() || buildBasePrompt(fm);
  let prompt = `${base}\n\n${LONELOG_SYSTEM_ADDENDUM}`;
  if (fm.game_context?.trim()) {
    prompt = `${prompt}\n\nGAME CONTEXT:\n${fm.game_context.trim()}`;
  }
  return prompt;
}

export function buildRequest(
  fm: NoteFrontMatter,
  userMessage: string,
  settings: SybylSettings,
  maxOutputTokens = 512,
  noteBody?: string
): GenerationRequest {
  let contextBlock = "";
  if (noteBody) {
    const ctx = parseLonelogContext(noteBody, settings.lonelogContextDepth);
    contextBlock = serializeContext(ctx);
  }

  const contextMessage = contextBlock ? `${contextBlock}\n\n${userMessage}` : userMessage;

  return {
    systemPrompt: buildSystemPrompt(fm),
    userMessage: contextMessage,
    temperature: fm.temperature ?? settings.defaultTemperature,
    maxOutputTokens,
    resolvedSources: []
  };
}
