import {
  GeminiProviderConfig,
  GenerationRequest,
  GenerationResponse,
  UploadedFileInfo
} from "../types";
import { AIProvider } from "./base";
import { readSseData, TextProgress } from "./stream";

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Gemini";

  constructor(private readonly config: GeminiProviderConfig) {}

  async generate(request: GenerationRequest, signal?: AbortSignal, onText?: TextProgress): Promise<GenerationResponse> {
    this.ensureConfigured();
    const model = request.model || this.config.defaultModel;
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.config.apiKey)}`;

    const parts: Array<Record<string, unknown>> = [];
    for (const source of request.resolvedSources ?? []) {
      if (source.base64Data) {
        parts.push({
          inlineData: {
            mimeType: source.ref.mime_type,
            data: source.base64Data
          }
        });
      } else if (source.textContent) {
        parts.push({ text: `[SOURCE: ${source.ref.label}]\n${source.textContent}\n[END SOURCE]` });
      }
    }
    parts.push({ text: request.userMessage });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          // Thinking tokens count against maxOutputTokens, so it's switched off where the model
          // allows it. Only 2.5 Flash/Flash-Lite accept a zero budget — 2.5 Pro and newer
          // models reject the request outright ("only works in thinking mode").
          ...(/2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
        }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.extractError(response, "Gemini"));
    }

    // Each event carries the next piece of the answer; usageMetadata is cumulative, so the last wins.
    let rawText = "";
    let usage:
      | { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }
      | undefined;
    for await (const data of readSseData(response)) {
      const chunk = JSON.parse(data);
      if (chunk.error) throw new Error(chunk.error.message ?? "Gemini stream failed.");
      const piece = (chunk.candidates?.[0]?.content?.parts ?? [])
        .map((part: { text?: string; thought?: boolean }) => (part.thought ? "" : part.text ?? ""))
        .join("");
      if (piece) {
        rawText += piece;
        onText?.(rawText);
      }
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }

    const text = rawText.trim();
    if (!text) {
      throw new Error("Provider returned an empty response.");
    }

    // Match GenerationResponse: the implicitly cached part of the prompt (counted inside
    // promptTokenCount) is split out, and thinking tokens, billed as output but reported apart
    // from the answer, are added to the output.
    const cached = usage?.cachedContentTokenCount;
    const output =
      usage?.candidatesTokenCount !== undefined || usage?.thoughtsTokenCount !== undefined
        ? (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
        : undefined;
    return {
      text,
      inputTokens: usage?.promptTokenCount !== undefined ? usage.promptTokenCount - (cached ?? 0) : undefined,
      outputTokens: output,
      cacheReadTokens: cached
    };
  }

  async uploadSource(): Promise<UploadedFileInfo> {
    throw new Error("Use 'Add Source' from the note to attach a vault file inline.");
  }

  async listSources(): Promise<UploadedFileInfo[]> {
    return [];
  }

  async deleteSource(): Promise<void> {}

  async listModels(): Promise<string[]> {
    if (!this.config.apiKey.trim()) return [];
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.config.apiKey)}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: { name?: string }) => (m.name ?? "").replace(/^models\//, ""))
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
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.config.apiKey)}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private ensureConfigured(): void {
    if (!this.config.apiKey.trim()) {
      throw new Error("No Gemini API key set. Check settings.");
    }
  }

  private async extractError(response: Response, providerName: string): Promise<string> {
    if (response.status === 401 || response.status === 403) {
      return `${providerName} API key rejected. Check settings.`;
    }
    try {
      const data = await response.json();
      const msg = data?.error?.message ?? `${providerName} request failed (${response.status}).`;
      return response.status === 429 ? `${providerName} quota/rate error: ${msg}` : msg;
    } catch {
      return `${providerName} request failed (${response.status}).`;
    }
  }
}
