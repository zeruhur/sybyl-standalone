import { describe, expect, it, vi } from "vitest";
import { readJsonLines, readSseData } from "./stream";
import { OpenAIProvider } from "./openai";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { sseResponse, streamedResponse } from "../../test/stream";
import { GenerationRequest } from "../types";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("stream readers", () => {
  it.each([1, 3, 7, 64])("reassembles SSE events split every %i bytes, multi-byte characters included", async (chunkSize) => {
    const payloads = [{ text: "Già, l'oracolo dice sì — 🎲" }, "[DONE]"];
    const data = await collect(readSseData(sseResponse(payloads, chunkSize)));
    expect(data).toEqual([JSON.stringify(payloads[0]), "[DONE]"]);
  });

  it("skips SSE comments and event names, and handles CRLF", async () => {
    const raw = ": keep-alive\r\n\r\nevent: delta\r\ndata: one\r\n\r\ndata: two\r\n\r\n";
    expect(await collect(readSseData(streamedResponse(raw, "text/event-stream", 5)))).toEqual(["one", "two"]);
  });

  it("parses newline-delimited JSON, including a last line without a newline", async () => {
    const raw = '{"a":1}\n\n{"a":2}\n{"a":3}';
    expect(await collect(readJsonLines(streamedResponse(raw, "application/x-ndjson", 4)))).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });
});

const request: GenerationRequest = {
  systemPrompt: "System.",
  userMessage: "? Is it locked?",
  temperature: 0.9,
  maxOutputTokens: 512,
  resolvedSources: []
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function run(provider: { generate: OpenAIProvider["generate"] }) {
  const seen: string[] = [];
  const response = await provider.generate(request, undefined, (text) => seen.push(text));
  return { seen, response };
}

describe("OpenAI streaming", () => {
  const openai = new OpenAIProvider({ apiKey: "k", defaultModel: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" });

  it("accumulates deltas and reads usage from the final chunk", async () => {
    const fetchMock = stubFetch(
      sseResponse([
        { choices: [{ delta: { role: "assistant" } }] },
        { choices: [{ delta: { content: "=> Yes" } }] },
        { choices: [{ delta: { content: ", but" } }] },
        { choices: [], usage: { prompt_tokens: 20, completion_tokens: 4 } },
        "[DONE]"
      ])
    );
    const { seen, response } = await run(openai);
    expect(seen).toEqual(["=> Yes", "=> Yes, but"]);
    expect(response).toEqual({ text: "=> Yes, but", inputTokens: 20, outputTokens: 4 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it("does not send stream_options to a third-party endpoint", async () => {
    const local = new OpenAIProvider({ apiKey: "k", defaultModel: "local", baseUrl: "http://localhost:1234/v1" });
    const fetchMock = stubFetch(sseResponse([{ choices: [{ delta: { content: "Hi" } }] }, "[DONE]"]));
    await run(local);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty("stream_options");
  });

  it("falls back when a compatible server ignores stream and answers with JSON", async () => {
    const json = JSON.stringify({ choices: [{ message: { content: " => No. " } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
    stubFetch(streamedResponse(json, "application/json"));
    const { seen, response } = await run(openai);
    expect(seen).toEqual([" => No. "]);
    expect(response).toEqual({ text: "=> No.", inputTokens: 3, outputTokens: 2 });
  });
});

describe("Gemini streaming", () => {
  it("uses the SSE endpoint and joins the pieces", async () => {
    const fetchMock = stubFetch(
      sseResponse([
        { candidates: [{ content: { parts: [{ text: "=> The " }] } }] },
        { candidates: [{ content: { parts: [{ text: "door holds." }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } }
      ])
    );
    const { seen, response } = await run(new GeminiProvider({ apiKey: "k", defaultModel: "gemini-2.5-flash" }));
    expect(fetchMock.mock.calls[0][0]).toContain(":streamGenerateContent?alt=sse&");
    expect(seen).toEqual(["=> The ", "=> The door holds."]);
    expect(response).toEqual({ text: "=> The door holds.", inputTokens: 9, outputTokens: 4 });
  });
});

describe("Ollama streaming", () => {
  const ollama = new OllamaProvider({ baseUrl: "http://localhost:11434", defaultModel: "llama3" });

  it("reads NDJSON chunks and the final counts", async () => {
    const lines = [
      { message: { content: "=> The " }, done: false },
      { message: { content: "door holds." }, done: false },
      { message: { content: "" }, done: true, prompt_eval_count: 30, eval_count: 6 }
    ];
    stubFetch(streamedResponse(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "application/x-ndjson", 5));
    const { seen, response } = await run(ollama);
    expect(seen).toEqual(["=> The ", "=> The door holds."]);
    expect(response).toEqual({ text: "=> The door holds.", inputTokens: 30, outputTokens: 6 });
  });

  it("surfaces an error line", async () => {
    stubFetch(streamedResponse('{"error":"model ran out of memory"}\n', "application/x-ndjson"));
    await expect(ollama.generate(request)).rejects.toThrow("Ollama: model ran out of memory");
  });
});

describe("usage normalization", () => {
  it("splits OpenAI's automatically cached prompt tokens out of the prompt count", async () => {
    stubFetch(
      sseResponse([
        { choices: [{ delta: { content: "Hi" } }] },
        { choices: [], usage: { prompt_tokens: 5000, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 4096 } } },
        "[DONE]"
      ])
    );
    const openai = new OpenAIProvider({ apiKey: "k", defaultModel: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" });
    expect(await openai.generate(request)).toMatchObject({ inputTokens: 904, cacheReadTokens: 4096, outputTokens: 40 });
  });

  it("splits out Gemini's cached tokens and counts its thinking as output", async () => {
    stubFetch(
      sseResponse([
        {
          candidates: [{ content: { parts: [{ text: "Hi" }] } }],
          usageMetadata: { promptTokenCount: 3000, cachedContentTokenCount: 2048, candidatesTokenCount: 20, thoughtsTokenCount: 300 }
        }
      ])
    );
    const gemini = new GeminiProvider({ apiKey: "k", defaultModel: "gemini-2.5-pro" });
    expect(await gemini.generate(request)).toMatchObject({ inputTokens: 952, cacheReadTokens: 2048, outputTokens: 320 });
  });
});
