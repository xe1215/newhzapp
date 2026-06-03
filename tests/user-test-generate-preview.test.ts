import assert from "node:assert/strict";
import test from "node:test";
import { type TestFunctionContext, main as testMain } from "../cloudfunctions/user/test/index.js";
import type { ImageGenerationResult } from "../image-service/generateTryOn.js";
import type { ProviderRun } from "../shared/types/provider-run.js";
import type { Report } from "../shared/types/report.js";
import type { Recommendation, TryOnTest } from "../shared/types/test.js";

test("为当前报告生成首组 3 张水印和无水印试色图并记录 provider run", async () => {
  const updatedReports: Array<{ reportId: string; patch: Partial<Report> }> = [];
  const providerRuns: ProviderRun[] = [];
  const requestedTargets: string[] = [];

  const context = createGenerationContext({
    async generateTryOn(input) {
      requestedTargets.push(...input.targetLipsticks.map((item) => item.lipstickId));

      return {
        ok: true,
        provider: "mock-provider",
        durationMs: 1234,
        cleanImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
        watermarkedImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
      };
    },
    onReportPatch: (reportId, patch) => updatedReports.push({ reportId, patch }),
    onProviderRun: (run) => providerRuns.push(run),
  });

  const result = await testMain(
    {
      action: "generatePreview",
      testId: "test-001",
    },
    context,
  );

  assert.deepEqual(requestedTargets, ["lip-1", "lip-2", "lip-3"]);
  assert.deepEqual(result, {
    ok: true,
    reportId: "report-001",
    cleanImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
    watermarkedImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
  });
  assert.deepEqual(updatedReports, [
    {
      reportId: "report-001",
      patch: {
        previewImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
        paidImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
      },
    },
  ]);
  assert.equal(providerRuns.length, 1);
  assert.equal(providerRuns[0].provider, "mock-provider");
  assert.equal(providerRuns[0].status, "success");
  assert.equal(providerRuns[0].durationMs, 1234);
  assert.equal(providerRuns[0].retryIndex, 0);
  assert.equal(providerRuns[0].errorCode, null);
  assert.deepEqual(providerRuns[0].cleanImageFileIds, ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"]);
  assert.deepEqual(providerRuns[0].watermarkedImageFileIds, ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"]);
});

test("图像生成失败会记录错误码并返回可用于重试或退款判断的失败结果", async () => {
  const updatedReports: Array<{ reportId: string; patch: Partial<Report> }> = [];
  const providerRuns: ProviderRun[] = [];
  const context = createGenerationContext({
    async generateTryOn() {
      return {
        ok: false,
        provider: "mock-provider",
        durationMs: 456,
        errorCode: "LIP_REGION_NOT_FOUND",
        errorMessage: "没有识别到稳定嘴唇区域",
      };
    },
    onReportPatch: (reportId, patch) => updatedReports.push({ reportId, patch }),
    onProviderRun: (run) => providerRuns.push(run),
  });

  const result = await testMain(
    {
      action: "generatePreview",
      testId: "test-001",
    },
    context,
  );

  assert.deepEqual(result, {
    ok: false,
    reportId: "report-001",
    errorCode: "LIP_REGION_NOT_FOUND",
    errorMessage: "没有识别到稳定嘴唇区域",
  });
  assert.deepEqual(updatedReports, []);
  assert.equal(providerRuns.length, 1);
  assert.equal(providerRuns[0].status, "failed");
  assert.equal(providerRuns[0].provider, "mock-provider");
  assert.equal(providerRuns[0].durationMs, 456);
  assert.equal(providerRuns[0].errorCode, "LIP_REGION_NOT_FOUND");
  assert.equal(providerRuns[0].errorMessage, "没有识别到稳定嘴唇区域");
  assert.deepEqual(providerRuns[0].cleanImageFileIds, []);
  assert.deepEqual(providerRuns[0].watermarkedImageFileIds, []);
});

function createGenerationContext(options: {
  generateTryOn(input: Parameters<NonNullable<TestFunctionContext["imageService"]>["generateTryOn"]>[0]): Promise<ImageGenerationResult>;
  onReportPatch: (reportId: string, patch: Partial<Report>) => void;
  onProviderRun: (run: ProviderRun) => void;
}): TestFunctionContext {
  return {
    openid: "openid-001",
    now: "2026-06-03T10:00:00.000Z",
    storage: {
      async upload() {
        throw new Error("not used");
      },
    },
    database: {
      async addTryOnTest() {
        throw new Error("not used");
      },
      async getTryOnTest(testId) {
        assert.equal(testId, "test-001");

        return existingTest;
      },
      async getReport(reportId) {
        assert.equal(reportId, "report-001");

        return existingReport;
      },
      async updateReport(reportId, patch) {
        options.onReportPatch(reportId, patch);
      },
      async addProviderRun(run) {
        options.onProviderRun(run);

        return { id: run._id };
      },
    },
    imageService: {
      generateTryOn: options.generateTryOn,
    },
    idGenerator: () => "provider-run-001",
  };
}

const recommendations: Recommendation[] = [
  recommendation("lip-1"),
  recommendation("lip-2"),
  recommendation("lip-3"),
];

const existingTest: TryOnTest = {
  _id: "test-001",
  openid: "openid-001",
  status: "selfie_uploaded",
  selfieFileId: "cloud://selfies/openid-001/test-001/original.jpg",
  preferences: {
    skinTone: "fair",
    budgetRange: "mid",
    scenes: ["commute"],
    styles: ["brightening"],
  },
  safetyStatus: "passed",
  qualityStatus: "passed",
  generationStatus: "pending",
  generationRetryCount: 0,
  previewRegenerateCount: 0,
  maxPreviewRegenerateCount: 3,
  activeReportId: "report-001",
  sourceShareId: null,
  createdAt: "2026-06-03T09:00:00.000Z",
  updatedAt: "2026-06-03T09:00:00.000Z",
  expiresAt: "2026-06-04T09:00:00.000Z",
};

const existingReport: Report = {
  _id: "report-001",
  openid: "openid-001",
  testId: "test-001",
  version: 1,
  status: "active",
    snapshot: {
    preferences: {
      skinTone: "fair",
      budgetRange: "mid",
      scenes: ["commute"],
      styles: ["brightening"],
    },
    recommendations,
  },
  previewImages: [],
  paidImages: [],
  shareCardImages: [],
  replacedByReportId: null,
  unlockedAt: null,
  expiresAt: "2026-06-04T09:00:00.000Z",
  deletedAt: null,
  createdAt: "2026-06-03T10:00:00.000Z",
};

function recommendation(lipstickId: string): Recommendation {
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
