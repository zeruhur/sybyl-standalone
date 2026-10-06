import { GenerationRequest, GenerationResponse, UploadedFileInfo } from "../types";
import { TextProgress } from "./stream";

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  /** Streams the response, reporting the text so far through `onText` as it arrives, and resolves
   * with the complete response once the stream ends. */
  generate(request: GenerationRequest, signal?: AbortSignal, onText?: TextProgress): Promise<GenerationResponse>;
  uploadSource(fileContent: ArrayBuffer, mimeType: string, displayName: string): Promise<UploadedFileInfo>;
  listSources(): Promise<UploadedFileInfo[]>;
  deleteSource(ref: UploadedFileInfo): Promise<void>;
  validate(): Promise<boolean>;
  listModels(): Promise<string[]>;
}

export function truncateSourceText(text: string, maxChars = 4000): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}
