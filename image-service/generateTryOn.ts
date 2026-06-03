import type { Recommendation } from "../shared/types/test.js";

export interface GenerateTryOnInput {
  selfieFileId: string;
  targetLipsticks: Recommendation[];
  testId: string;
  reportId: string;
}

export interface ImageGenerationSuccess {
  ok: true;
  provider: string;
  durationMs: number;
  cleanImages: string[];
  watermarkedImages: string[];
}

export interface ImageGenerationFailure {
  ok: false;
  provider: string;
  durationMs: number;
  errorCode: string;
  errorMessage: string;
}

export type ImageGenerationResult = ImageGenerationSuccess | ImageGenerationFailure;

export interface TryOnImageService {
  generateTryOn(input: GenerateTryOnInput): Promise<ImageGenerationResult>;
}
