export type ProviderID = "gemini" | "openai" | "anthropic" | "ollama";
export type OracleMode = "yes-no" | "fate" | "custom";
export type SessionType = "campaign" | "one_shot";

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
  vaultPath?: string;
}

export interface SourceRef {
  label: string;
  mime_type: string;
  vault_path: string;
}

export interface NoteFrontMatter {
  // Lonelog standard fields
  ruleset?: string;
  genre?: string;
  pcs?: string;
  tone?: string;
  // Sybyl-specific fields
  system_prompt_override?: string;
  provider?: ProviderID;
  model?: string;
  temperature?: number;
  sources?: SourceRef[];
  game_context?: string;
  scene_context?: string;
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
  inputTokens?: number;
  outputTokens?: number;
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
