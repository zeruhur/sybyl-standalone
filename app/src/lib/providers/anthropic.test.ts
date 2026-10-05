import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic";
import { GenerationRequest, ResolvedSource } from "../types";

const provider = new AnthropicProvider({ apiKey: "test-key", defaultModel: "claude-sonnet-4-5-20250929" });

/** Stubs fetch with a canned Messages API response and returns the parsed request body. */
function mockMessages(usage: Record<string, number> = { input_tokens: 10, output_tokens: 5 }) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
    ok: true,
    json: async () => ({ content: [{ type: "text", text: "=> The door holds." }], usage })
  }));
  vi.stubGlobal("fetch", fetchMock);
  return () => JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    systemPrompt: "You are a tool for solo role-playing.",
    userMessage: "? Is the door locked?",
    temperature: 0.9,
    maxOutputTokens: 512,
    resolvedSources: [],
    ...overrides
  };
}

const textSource = (label: string): ResolvedSource => ({
  ref: { label, mime_type: "text/plain", vault_path: `/vault/sources/${label}` } as ResolvedSource["ref"],
  textContent: `Rules from ${label}`
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnthropicProvider prompt caching", () => {
  it("marks the system prompt as a cache breakpoint", async () => {
    const body = mockMessages();
    await provider.generate(request());
    expect(body().system).toEqual([
      { type: "text", text: "You are a tool for solo role-playing.", cache_control: { type: "ephemeral" } }
    ]);
  });

  it("leaves the question uncached when there are no sources", async () => {
    const body = mockMessages();
    await provider.generate(request());
    expect(body().messages[0].content).toEqual([{ type: "text", text: "? Is the door locked?" }]);
  });

  it("puts the second breakpoint on the last source, before the varying question", async () => {
    const body = mockMessages();
    await provider.generate(request({ resolvedSources: [textSource("core.md"), textSource("magic.md")] }));
    const content = body().messages[0].content;
    expect(content.map((block: { cache_control?: unknown }) => block.cache_control)).toEqual([
      undefined,
      { type: "ephemeral" },
      undefined
    ]);
    expect(content[2].text).toBe("? Is the door locked?");
  });

  it("omits an empty system prompt instead of sending an empty block", async () => {
    const body = mockMessages();
    await provider.generate(request({ systemPrompt: "" }));
    expect(body()).not.toHaveProperty("system");
  });

  it("reports cache reads and writes", async () => {
    mockMessages({ input_tokens: 12, output_tokens: 30, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 });
    const response = await provider.generate(request());
    expect(response).toMatchObject({ inputTokens: 12, outputTokens: 30, cacheReadTokens: 4000, cacheWriteTokens: 0 });
  });
});
