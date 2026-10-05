import {
  AnthropicProviderConfig,
  GenerationRequest,
  GenerationResponse,
  UploadedFileInfo
} from "../types";
import { AIProvider } from "./base";

// Prompt caching (5-minute TTL; every hit refreshes it, which suits the gaps between plays). Two
// breakpoints at the stability boundaries: the system prompt (rules, Lonelog addendum, digested
// game_context; stable per note) and the last attached source (rulebooks resent unchanged on every
// Ask the Rules / Generate Character). The per-request user message comes after both, uncached.
// Prefixes below the model's minimum (512-4096 tokens) silently don't cache, at no extra cost.
const CACHE_BREAKPOINT = { type: "ephemeral" } as const;

/** Whether a model takes a `temperature`. Opus 4.7+, Sonnet 5+ and Fable reject sampling parameters
 * with a 400, so this is an allowlist of the older families that still accept them (3.x, and the
 * 4.x line up to 4.6, incl. Haiku 4.5). A model not listed gets no temperature at all, which every
 * model accepts, so a newly released model can't break the same way. */
export function acceptsTemperature(model: string): boolean {
  return /^claude-(?:3|(?:opus|sonnet|haiku)-4(?:-[0-6])?(?:-\d{8})?$)/.test(model);
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  constructor(private readonly config: AnthropicProviderConfig) {}

  async generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResponse> {
    this.ensureConfigured();
    const model = request.model || this.config.defaultModel;
    const content: Array<Record<string, unknown>> = [];

    for (const source of request.resolvedSources ?? []) {
      if (source.base64Data && source.ref.mime_type === "application/pdf") {
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: source.ref.mime_type,
            data: source.base64Data
          }
        });
      } else if (source.textContent) {
        content.push({
          type: "text",
          text: `[SOURCE: ${source.ref.label}]\n${source.textContent}\n[END SOURCE]`
        });
      }
    }

    if (content.length > 0) {
      content[content.length - 1].cache_control = CACHE_BREAKPOINT;
    }
    content.push({ type: "text", text: request.userMessage });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxOutputTokens,
        temperature: acceptsTemperature(model) ? request.temperature : undefined,
        // An empty text block is a 400, so an empty system prompt is omitted instead.
        system: request.systemPrompt
          ? [{ type: "text", text: request.systemPrompt, cache_control: CACHE_BREAKPOINT }]
          : undefined,
        messages: [{ role: "user", content }]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.extractError(response));
    }

    const data = await response.json();
    const text = (data.content ?? [])
      .map((item: { text?: string }) => item.text ?? "")
      .join("")
      .trim();
    if (!text) {
      // Newer models think before answering, and thinking counts against max_tokens, so a small
      // budget can run out before any visible text.
      if (data.stop_reason === "max_tokens") {
        throw new Error("Anthropic ran out of output tokens before answering. Raise the max output tokens in Settings.");
      }
      if (data.stop_reason === "refusal") {
        throw new Error("Anthropic declined this request.");
      }
      throw new Error("Provider returned an empty response.");
    }

    return {
      text,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      cacheReadTokens: data.usage?.cache_read_input_tokens,
      cacheWriteTokens: data.usage?.cache_creation_input_tokens
    };
  }

  async uploadSource(): Promise<UploadedFileInfo> {
    throw new Error("Anthropic does not support persistent file upload. Use vault_path instead.");
  }

  async listSources(): Promise<UploadedFileInfo[]> {
    return [];
  }

  async deleteSource(): Promise<void> {}

  async listModels(): Promise<string[]> {
    if (!this.config.apiKey.trim()) return [];
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data ?? [])
        .map((m: { id?: string }) => m.id ?? "")
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async validate(): Promise<boolean> {
    if (!this.config.apiKey.trim()) {
      return false;
    }
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          max_tokens: 1,
          messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }]
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private ensureConfigured(): void {
    if (!this.config.apiKey.trim()) {
      throw new Error("No Anthropic API key set. Check settings.");
    }
  }

  private async extractError(response: Response): Promise<string> {
    if (response.status === 401 || response.status === 403) {
      return "Anthropic API key rejected. Check settings.";
    }
    try {
      const data = await response.json();
      const msg = data?.error?.message ?? `Anthropic request failed (${response.status}).`;
      return response.status === 429 ? `Anthropic quota/rate error: ${msg}` : msg;
    } catch {
      return `Anthropic request failed (${response.status}).`;
    }
  }
}
