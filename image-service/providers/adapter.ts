import type { GenerateTryOnInput, ImageGenerationResult, TryOnImageService } from "../generateTryOn.js";

export interface ProviderRuntimeConfig {
  provider: string;
  model: string;
  apiKey: string;
  promptVersion: string;
  prompt: string;
  negativePrompt: string;
  timeoutMs: number;
}

export interface ProviderAdapterConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  promptVersion?: string;
  prompt?: string;
  negativePrompt?: string;
  timeoutMs?: number;
  request(input: GenerateTryOnInput, config: ProviderRuntimeConfig): Promise<{
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
        const runtimeConfig = toRuntimeConfig(config);
        const result = await config.request(input, runtimeConfig);
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

export function createProviderConfigFromEnv(env: Record<string, string | undefined>): Omit<ProviderAdapterConfig, "request" | "nowMs"> {
  return {
    provider: requiredEnv(env, "IMAGE_PROVIDER"),
    model: requiredEnv(env, "IMAGE_PROVIDER_MODEL"),
    apiKey: requiredEnv(env, "IMAGE_PROVIDER_API_KEY"),
    promptVersion: env.TRYON_PROMPT_VERSION ?? "v1",
    prompt: requiredEnv(env, "TRYON_PROMPT"),
    negativePrompt: env.TRYON_NEGATIVE_PROMPT ?? "",
    timeoutMs: parseTimeoutMs(env.IMAGE_PROVIDER_TIMEOUT_MS),
  };
}

function toRuntimeConfig(config: ProviderAdapterConfig): ProviderRuntimeConfig {
  return {
    provider: config.provider,
    model: config.model ?? "",
    apiKey: config.apiKey ?? "",
    promptVersion: config.promptVersion ?? "v1",
    prompt: config.prompt ?? "",
    negativePrompt: config.negativePrompt ?? "",
    timeoutMs: config.timeoutMs ?? 60_000,
  };
}

function requiredEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name}_MISSING`);
  }

  return value;
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) {
    return 60_000;
  }

  const timeoutMs = Number(value);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("IMAGE_PROVIDER_TIMEOUT_MS_INVALID");
  }

  return timeoutMs;
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
