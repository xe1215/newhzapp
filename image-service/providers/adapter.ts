import type { GenerateTryOnInput, ImageGenerationResult, TryOnImageService } from "../generateTryOn.js";

export interface ProviderAdapterConfig {
  provider: string;
  request(input: GenerateTryOnInput): Promise<{
    cleanImages: string[];
    watermarkedImages: string[];
  }>;
  nowMs?: () => number;
}

export function createProviderAdapter(config: ProviderAdapterConfig): TryOnImageService {
  return {
    async generateTryOn(input) {
      const nowMs = config.nowMs ?? Date.now;
      const startMs = nowMs();

      try {
        const result = await config.request(input);
        const durationMs = nowMs() - startMs;

        if (result.cleanImages.length !== 3 || result.watermarkedImages.length !== 3) {
          return imageCountMismatch(config.provider, durationMs);
        }

        return {
          ok: true,
          provider: config.provider,
          durationMs,
          cleanImages: result.cleanImages,
          watermarkedImages: result.watermarkedImages,
        };
      } catch (error) {
        return providerRequestFailed(config.provider, nowMs() - startMs, error);
      }
    },
  };
}

function imageCountMismatch(provider: string, durationMs: number): ImageGenerationResult {
  return {
    ok: false,
    provider,
    durationMs,
    errorCode: "IMAGE_COUNT_MISMATCH",
    errorMessage: "图像供应商没有返回 3 张水印图和 3 张无水印图",
  };
}

function providerRequestFailed(provider: string, durationMs: number, error: unknown): ImageGenerationResult {
  return {
    ok: false,
    provider,
    durationMs,
    errorCode: "PROVIDER_REQUEST_FAILED",
    errorMessage: error instanceof Error ? error.message : "图像供应商调用失败",
  };
}
