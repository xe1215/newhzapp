import assert from "node:assert/strict";
import test from "node:test";
import { createProviderAdapter } from "../image-service/providers/adapter.js";
import type { GenerateTryOnInput } from "../image-service/generateTryOn.js";

test("provider adapter 使用统一输入输出契约调用外部图像供应商", async () => {
  const provider = createProviderAdapter({
    provider: "mock-provider",
    async request(input) {
      assert.equal(input.selfieFileId, "cloud://selfie.jpg");
      assert.deepEqual(
        input.targetLipsticks.map((item) => item.lipstickId),
        ["lip-1", "lip-2", "lip-3"],
      );

      return {
        cleanImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
        watermarkedImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
      };
    },
    nowMs: (() => {
      const ticks = [1000, 1456];

      return () => ticks.shift() ?? 1456;
    })(),
  });

  const result = await provider.generateTryOn(input);

  assert.deepEqual(result, {
    ok: true,
    provider: "mock-provider",
    durationMs: 456,
    cleanImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
    watermarkedImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
  });
});

test("provider adapter 会把图片数量异常转成明确错误码", async () => {
  const provider = createProviderAdapter({
    provider: "mock-provider",
    async request() {
      return {
        cleanImages: ["clean-1.jpg"],
        watermarkedImages: ["watermarked-1.jpg"],
      };
    },
    nowMs: () => 1000,
  });

  const result = await provider.generateTryOn(input);

  assert.deepEqual(result, {
    ok: false,
    provider: "mock-provider",
    durationMs: 0,
    errorCode: "IMAGE_COUNT_MISMATCH",
    errorMessage: "图像供应商没有返回 3 张水印图和 3 张无水印图",
  });
});

const input: GenerateTryOnInput = {
  selfieFileId: "cloud://selfie.jpg",
  testId: "test-001",
  reportId: "report-001",
  targetLipsticks: [
    recommendation("lip-1"),
    recommendation("lip-2"),
    recommendation("lip-3"),
  ],
};

function recommendation(lipstickId: string): GenerateTryOnInput["targetLipsticks"][number] {
  return {
    lipstickId,
    brand: `品牌 ${lipstickId}`,
    shadeName: `色号 ${lipstickId}`,
    shadeCode: lipstickId.toUpperCase(),
    colorHex: "#cc3355",
    swatchImageFileId: `cloud://swatches/${lipstickId}.jpg`,
    texture: "cream",
    undertone: "neutral",
    budgetRange: "mid",
    recommendationReason: `${lipstickId} 推荐理由`,
    cautionNote: `${lipstickId} 避雷点`,
    substitute: `${lipstickId} 平替`,
    searchKeywords: [`${lipstickId} 搜索词`],
    score: 100,
  };
}
