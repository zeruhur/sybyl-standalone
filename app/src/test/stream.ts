/** A streamed fetch Response whose body arrives in `chunkSize`-byte pieces, so chunk boundaries
 * fall mid-event and even mid-character, as they can over a real network. */
export function streamedResponse(text: string, contentType: string, chunkSize = 7): Response {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    }
  });
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

/** Server-sent events, one `data:` line per payload (objects are JSON-encoded). */
export function sseResponse(payloads: Array<object | string>, chunkSize?: number): Response {
  const text = payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");
  return streamedResponse(text, "text/event-stream", chunkSize);
}

/** Anthropic's event sequence for a streamed message whose text arrives in `pieces`. */
export function anthropicEvents(pieces: string[], usage: Record<string, number> = {}, stopReason = "end_turn"): object[] {
  return [
    { type: "message_start", message: { usage: { input_tokens: usage.input_tokens ?? 10, ...usage } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...pieces.map((text) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: usage.output_tokens ?? 5 } },
    { type: "message_stop" }
  ];
}
