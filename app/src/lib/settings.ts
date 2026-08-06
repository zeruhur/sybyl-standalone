import { SybylSettings } from "./types";

export const DEFAULT_SETTINGS: SybylSettings = {
  activeProvider: "anthropic",
  providers: {
    gemini: { apiKey: "", defaultModel: "gemini-2.5-flash" },
    openai: { apiKey: "", defaultModel: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
    anthropic: { apiKey: "", defaultModel: "claude-sonnet-4-5-20250929" },
    ollama: { baseUrl: "http://localhost:11434", defaultModel: "llama3" }
  },
  defaultTemperature: 0.9,
  defaultMaxOutputTokens: 512,
  lonelogContextDepth: 60,
  lonelogWrapCodeBlock: true,
  lonelogAutoIncScene: true
};

export function normalizeSettings(data: unknown): SybylSettings {
  const partial = (data ?? {}) as Partial<SybylSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    providers: {
      ...DEFAULT_SETTINGS.providers,
      ...(partial.providers ?? {})
    }
  };
}
