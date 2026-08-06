import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { ProviderID, ResolvedSource, SourceRef } from "./types";

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "yaml", "yml", "csv"]);

function extensionOf(path: string): string {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function inferMimeType(fileName: string): string {
  return fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
}

export async function readSourceText(path: string): Promise<string> {
  if (!TEXT_EXTENSIONS.has(extensionOf(path))) {
    throw new Error(`Text extraction is only supported for text files. '${path}' is not a recognized text format.`);
  }
  return readTextFile(path);
}

export function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function resolveSourcesForRequest(
  sources: SourceRef[],
  providerId: ProviderID
): Promise<ResolvedSource[]> {
  const resolved: ResolvedSource[] = [];
  for (const ref of sources) {
    if (providerId === "anthropic" || (providerId === "gemini" && ref.mime_type === "application/pdf")) {
      const bytes = await readFile(ref.vault_path);
      resolved.push({ ref, base64Data: arrayBufferToBase64(bytes) });
      continue;
    }
    const text = await readSourceText(ref.vault_path);
    resolved.push({ ref, textContent: text });
  }
  return resolved;
}

export function truncateSourceText(text: string, maxChars = 4000): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}
