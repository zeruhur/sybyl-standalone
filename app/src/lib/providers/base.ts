import { GenerationRequest, GenerationResponse, UploadedFileInfo } from "../types";

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResponse>;
  uploadSource(fileContent: ArrayBuffer, mimeType: string, displayName: string): Promise<UploadedFileInfo>;
  listSources(): Promise<UploadedFileInfo[]>;
  deleteSource(ref: UploadedFileInfo): Promise<void>;
  validate(): Promise<boolean>;
  listModels(): Promise<string[]>;
}

export function truncateSourceText(text: string, maxChars = 4000): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}
