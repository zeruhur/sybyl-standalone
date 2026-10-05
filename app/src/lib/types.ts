export type ProviderID = "gemini" | "openai" | "anthropic" | "ollama";
export type OracleMode = "yes-no" | "fate" | "custom";
export type SessionType = "campaign" | "one_shot";
export type Theme = "dark" | "light";

export interface GeminiProviderConfig {
  apiKey: string;
  defaultModel: string;
}

export interface OpenAIProviderConfig {
  apiKey: string;
  defaultModel: string;
  baseUrl: string;
}

export interface AnthropicProviderConfig {
  apiKey: string;
  defaultModel: string;
}

export interface OllamaProviderConfig {
  baseUrl: string;
  defaultModel: string;
}

export interface SybylSettings {
  activeProvider: ProviderID;
  providers: {
    gemini: GeminiProviderConfig;
    openai: OpenAIProviderConfig;
    anthropic: AnthropicProviderConfig;
    ollama: OllamaProviderConfig;
  };
  defaultTemperature: number;
  defaultMaxOutputTokens: number;
  lonelogContextDepth: number;
  lonelogWrapCodeBlock: boolean;
  lonelogAutoIncScene: boolean;
  theme: Theme;
  /** Whether the full formatting toolbar sits above the editor. Off by default: a selection bubble
   * covers the common inline formats, and the Aa button in the note header toggles this. */
  showFormatToolbar: boolean;
  vaultPath?: string;
}

export interface SourceRef {
  label: string;
  mime_type: string;
  vault_path: string;
}

export interface NoteFrontMatter {
  // Lonelog standard fields (lonelog.md §5.1 Campaign Header)
  title?: string;
  ruleset?: string;
  genre?: string;
  player?: string;
  pcs?: string;
  start_date?: string;
  last_update?: string;
  tools?: string;
  themes?: string;
  tone?: string;
  notes?: string;
  // Sybyl-specific fields
  system_prompt_override?: string;
  provider?: ProviderID;
  model?: string;
  temperature?: number;
  sources?: SourceRef[];
  game_context?: string;
  oracle_mode?: OracleMode;
  language?: string;
  scene_counter?: number;
  session_number?: number;
  // Standalone-app fields (spec section 3)
  pc_name?: string;
  session_type?: SessionType;
}

export interface ResolvedSource {
  ref: SourceRef;
  textContent?: string;
  base64Data?: string;
}

export interface GenerationRequest {
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxOutputTokens: number;
  model?: string;
  resolvedSources: ResolvedSource[];
}

export interface GenerationResponse {
  text: string;
  /** Input tokens billed at full price. With prompt caching (Anthropic) this excludes the cached
   * tokens below, so the prompt's total size is the sum of all three. */
  inputTokens?: number;
  outputTokens?: number;
  /** Prompt tokens served from the provider's cache (Anthropic only). */
  cacheReadTokens?: number;
  /** Prompt tokens written to the provider's cache this request (Anthropic only). */
  cacheWriteTokens?: number;
}

export interface UploadedFileInfo {
  provider: ProviderID;
  label: string;
  file_uri?: string;
  file_id?: string;
  mime_type: string;
  expiresAt?: string;
}

export interface VaultFile {
  path: string;
  name: string;
  fm: NoteFrontMatter;
  body: string;
}
