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
  lonelogAutoIncScene: true,
  theme: "dark"
};

export function normalizeSettings(data: unknown): SybylSettings {
  const partial = (data ?? {}) as Partial<SybylSettings>;
  const saved: Partial<SybylSettings["providers"]> = partial.providers ?? {};
  // Merged per provider, not just per key: a stored provider config missing a field (e.g. one
  // saved before that field existed) would otherwise replace the whole default and drop it.
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    providers: {
      gemini: { ...DEFAULT_SETTINGS.providers.gemini, ...saved.gemini },
      openai: { ...DEFAULT_SETTINGS.providers.openai, ...saved.openai },
      anthropic: { ...DEFAULT_SETTINGS.providers.anthropic, ...saved.anthropic },
      ollama: { ...DEFAULT_SETTINGS.providers.ollama, ...saved.ollama }
    }
  };
}
