import {
  GenerationRequest,
  GenerationResponse,
  OllamaProviderConfig,
  UploadedFileInfo
} from "../types";
import { AIProvider, truncateSourceText } from "./base";
import { readJsonLines, TextProgress } from "./stream";

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

export class OllamaProvider implements AIProvider {
  readonly id = "ollama";
  readonly name = "Ollama";

  constructor(private readonly config: OllamaProviderConfig) {}

  async generate(request: GenerationRequest, signal?: AbortSignal, onText?: TextProgress): Promise<GenerationResponse> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const model = request.model || this.config.defaultModel;
    const sourceBlocks = (request.resolvedSources ?? [])
      .filter((source) => source.textContent)
      .map((source) => `[SOURCE: ${source.ref.label}]\n${truncateSourceText(source.textContent ?? "")}\n[END SOURCE]`);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          options: {
            temperature: request.temperature,
            num_predict: request.maxOutputTokens
          },
          messages: [
            { role: "system", content: request.systemPrompt },
            {
              role: "user",
              content: sourceBlocks.length
                ? `${sourceBlocks.join("\n\n")}\n\n${request.userMessage}`
                : request.userMessage
            }
          ]
        }),
        signal
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new Error(`Ollama not reachable at ${baseUrl}. Is it running?`);
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Model '${model}' not found in Ollama. Check available models in settings.`);
      }
      throw new Error(`Ollama not reachable at ${baseUrl}. Is it running?`);
    }

    // One JSON object per line; the last (`done: true`) carries the token counts.
    let rawText = "";
    let counts: { prompt_eval_count?: number; eval_count?: number } = {};
    for await (const line of readJsonLines(response)) {
      const chunk = line as { error?: string; done?: boolean; message?: { content?: string } } & typeof counts;
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
      const piece = chunk.message?.content ?? "";
      if (piece) {
        rawText += piece;
        onText?.(rawText);
      }
      if (chunk.done) counts = chunk;
    }

    const text = rawText.trim();
    if (!text) {
      throw new Error("Provider returned an empty response.");
    }

    return {
      text,
      inputTokens: counts.prompt_eval_count,
      outputTokens: counts.eval_count
    };
  }

  async uploadSource(): Promise<UploadedFileInfo> {
    throw new Error("Ollama does not support file upload. Add a vault_path source instead.");
  }

  async listSources(): Promise<UploadedFileInfo[]> {
    return [];
  }

  async deleteSource(): Promise<void> {}

  async validate(): Promise<boolean> {
    try {
      const tags = await this.fetchTags();
      return Boolean(tags.models?.length);
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const tags = await this.fetchTags();
    return (tags.models ?? []).map((model) => model.name ?? "").filter(Boolean);
  }

  private async fetchTags(): Promise<OllamaTagsResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/tags`);
    } catch {
      throw new Error(`Ollama not reachable at ${this.config.baseUrl}. Is it running?`);
    }
    if (!response.ok) {
      throw new Error(`Ollama not reachable at ${this.config.baseUrl}. Is it running?`);
    }
    return response.json() as Promise<OllamaTagsResponse>;
  }
}
