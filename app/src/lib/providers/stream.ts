// Readers for streamed provider responses. Anthropic, OpenAI and Gemini stream server-sent events;
// Ollama streams newline-delimited JSON. Both are read straight off the fetch body, so cancelling
// the request's AbortSignal rejects the pending read and ends the stream.

/** Called with the full text generated so far, each time more arrives. */
export type TextProgress = (textSoFar: string) => void;

/** Whether a response came back as one JSON document instead of a stream: some OpenAI-compatible
 * servers ignore `stream: true`. */
export function isJsonResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("application/json") ?? false;
}

/** Splits a streamed body into the pieces between separators, holding back an incomplete piece
 * until the rest of it arrives (a chunk boundary can fall anywhere, even inside a UTF-8 character). */
async function* readPieces(response: Response, separator: RegExp): AsyncGenerator<string> {
  if (!response.body) throw new Error("The provider sent no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = separator.exec(buffer))) {
        yield buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

/** Yields the `data` payload of each server-sent event; comments and other fields are skipped. */
export async function* readSseData(response: Response): AsyncGenerator<string> {
  for await (const event of readPieces(response, /\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) yield data;
  }
}

/** Yields each line of a newline-delimited JSON stream, parsed. */
export async function* readJsonLines(response: Response): AsyncGenerator<unknown> {
  for await (const line of readPieces(response, /\r?\n/)) {
    if (line.trim()) yield JSON.parse(line);
  }
}
