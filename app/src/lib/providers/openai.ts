import {
  GenerationRequest,
  GenerationResponse,
  OpenAIProviderConfig,
  UploadedFileInfo
} from "../types";
import { AIProvider, truncateSourceText } from "./base";

const OPENAI_SOURCE_CHAR_LIMIT = 200_000;

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly name = "OpenAI";

  constructor(private readonly config: OpenAIProviderConfig) {}

  async generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResponse> {
    this.ensureConfigured();
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const model = request.model || this.config.defaultModel;
    // OpenAI-hosted models have large context windows, so sources get a far bigger budget than
    // Ollama's (whose default context is only a few thousand tokens) — at the old shared 4000-char
    // cap, Digest Source only ever saw the first page or two of a rulebook.
    const sourceBlocks = (request.resolvedSources ?? [])
      .filter((source) => source.textContent)
      .map((source) => `[SOURCE: ${source.ref.label}]\n${truncateSourceText(source.textContent ?? "", OPENAI_SOURCE_CHAR_LIMIT)}\n[END SOURCE]`);

    // Reasoning models (gpt-5*, o1/o3/o4*) reject `max_tokens` and any non-default temperature;
    // they take `max_completion_tokens` instead. Other models (and most OpenAI-compatible
    // third-party endpoints behind a custom baseUrl) still expect `max_tokens`.
    const isReasoningModel = /^(gpt-5|o\d)/.test(model);
    const body: Record<string, unknown> = {
      model,
      [isReasoningModel ? "max_completion_tokens" : "max_tokens"]: request.maxOutputTokens,
      messages: [
        { role: "system", content: request.systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: sourceBlocks.length
                ? `${sourceBlocks.join("\n\n")}\n\n${request.userMessage}`
                : request.userMessage
            }
          ]
        }
      ]
    };

    if (!isReasoningModel) {
      body.temperature = request.temperature;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.extractError(response));
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim?.() ?? "";
    if (!text) {
      throw new Error("Provider returned an empty response.");
    }

    return {
      text,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens
    };
  }

  async uploadSource(): Promise<UploadedFileInfo> {
    throw new Error("This provider does not support file upload. Use vault_path instead.");
  }

  async listSources(): Promise<UploadedFileInfo[]> {
    return [];
  }

  async deleteSource(): Promise<void> {}

  async listModels(): Promise<string[]> {
    if (!this.config.apiKey.trim()) return [];
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` }
      });
      if (!response.ok) return [];
      const data = await response.json();
      const EXCLUDE = ["embedding", "whisper", "tts", "dall-e", "moderation", "text-search", "text-similarity"];
      return (data.data ?? [])
        .map((m: { id?: string }) => m.id ?? "")
        .filter((id: string) => id && !EXCLUDE.some((ex) => id.includes(ex)))
        .sort();
    } catch {
      return [];
    }
  }

  async validate(): Promise<boolean> {
    if (!this.config.apiKey.trim()) {
      return false;
    }
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private ensureConfigured(): void {
    if (!this.config.apiKey.trim()) {
      throw new Error("No OpenAI API key set. Check settings.");
    }
  }

  private async extractError(response: Response): Promise<string> {
    if (response.status === 401 || response.status === 403) {
      return "OpenAI API key rejected. Check settings.";
    }
    try {
      const data = await response.json();
      const msg = data?.error?.message ?? `OpenAI request failed (${response.status}).`;
      return response.status === 429 ? `OpenAI quota/rate error: ${msg}` : msg;
    } catch {
      return `OpenAI request failed (${response.status}).`;
    }
  }
}
