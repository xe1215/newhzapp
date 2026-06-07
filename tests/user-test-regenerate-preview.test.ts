import assert from "node:assert/strict";
import test from "node:test";
import { type EventRecord, type TestFunctionContext, main as testMain } from "../cloudfunctions/user/test/index.js";
import type { ImageGenerationResult } from "../image-service/generateTryOn.js";
import type { ProviderRun } from "../shared/types/provider-run.js";
import type { Report } from "../shared/types/report.js";
import type { Lipstick, Recommendation, TryOnTest } from "../shared/types/test.js";

test("regenerating preview creates a new active report, replaces the old report, increments quota, and records events", async () => {
  const addedReports: Report[] = [];
  const updatedReports: Array<{ reportId: string; patch: Partial<Report> }> = [];
  const updatedTests: Array<{ testId: string; patch: Partial<TryOnTest> }> = [];
  const providerRuns: ProviderRun[] = [];
  const events: EventRecord[] = [];
  const requestedTargets: string[] = [];
  const context = createRegenerateContext({
    ids: ["report-002", "provider-run-002", "event-001"],
    async generateTryOn(input) {
      requestedTargets.push(...input.targetLipsticks.map((item) => item.lipstickId));

      return {
        ok: true,
        provider: "mock-provider",
        durationMs: 789,
        cleanImages: ["clean-4.jpg", "clean-5.jpg", "clean-6.jpg"],
        watermarkedImages: ["watermarked-4.jpg", "watermarked-5.jpg", "watermarked-6.jpg"],
      };
    },
    onReport: (report) => addedReports.push(report),
    onReportPatch: (reportId, patch) => updatedReports.push({ reportId, patch }),
    onTestPatch: (testId, patch) => updatedTests.push({ testId, patch }),
    onProviderRun: (run) => providerRuns.push(run),
    onEvent: (event) => events.push(event),
  });

  const result = await testMain(
    {
      action: "regeneratePreview",
      testId: "test-001",
    },
    context,
  );

  assert.equal(result.ok, true);
  assert.equal(result.reportId, "report-002");
  assert.deepEqual(result.recommendations.map((item) => item.lipstickId), ["lip-4", "lip-5", "lip-6"]);
  assert.deepEqual(requestedTargets, ["lip-4", "lip-5", "lip-6"]);
  assert.deepEqual(result.cleanImages, ["clean-4.jpg", "clean-5.jpg", "clean-6.jpg"]);
  assert.deepEqual(result.watermarkedImages, ["watermarked-4.jpg", "watermarked-5.jpg", "watermarked-6.jpg"]);

  assert.equal(addedReports.length, 1);
  assert.equal(addedReports[0]._id, "report-002");
  assert.equal(addedReports[0].version, 2);
  assert.equal(addedReports[0].status, "active");
  assert.deepEqual(addedReports[0].previewImages, ["watermarked-4.jpg", "watermarked-5.jpg", "watermarked-6.jpg"]);
  assert.deepEqual(addedReports[0].paidImages, ["clean-4.jpg", "clean-5.jpg", "clean-6.jpg"]);

  assert.deepEqual(updatedReports, [
    {
      reportId: "report-001",
      patch: {
        status: "replaced",
        replacedByReportId: "report-002",
      },
    },
  ]);
  assert.deepEqual(updatedTests, [
    {
      testId: "test-001",
      patch: {
        activeReportId: "report-002",
        previewRegenerateCount: 1,
        updatedAt: "2026-06-07T10:00:00.000Z",
      },
    },
  ]);
  assert.equal(providerRuns.length, 1);
  assert.equal(providerRuns[0].reportId, "report-002");
  assert.equal(providerRuns[0].status, "success");
  assert.deepEqual(events, [
    {
      _id: "event-001",
      openid: "openid-001",
      eventName: "preview_regenerate_success",
      testId: "test-001",
      reportId: "report-002",
      properties: {
        previousReportId: "report-001",
        previewRegenerateCount: 1,
      },
      createdAt: "2026-06-07T10:00:00.000Z",
    },
  ]);
});

test("failed preview regeneration records failure without consuming quota or replacing the active report", async () => {
  const addedReports: Report[] = [];
  const updatedReports: Array<{ reportId: string; patch: Partial<Report> }> = [];
  const updatedTests: Array<{ testId: string; patch: Partial<TryOnTest> }> = [];
  const providerRuns: ProviderRun[] = [];
  const events: EventRecord[] = [];
  const context = createRegenerateContext({
    ids: ["report-002", "provider-run-002", "event-001"],
    async generateTryOn() {
      return {
        ok: false,
        provider: "mock-provider",
        durationMs: 456,
        errorCode: "LIP_REGION_NOT_FOUND",
        errorMessage: "lip region missing",
      };
    },
    onReport: (report) => addedReports.push(report),
    onReportPatch: (reportId, patch) => updatedReports.push({ reportId, patch }),
    onTestPatch: (testId, patch) => updatedTests.push({ testId, patch }),
    onProviderRun: (run) => providerRuns.push(run),
    onEvent: (event) => events.push(event),
  });

  const result = await testMain(
    {
      action: "regeneratePreview",
      testId: "test-001",
    },
    context,
  );

  assert.deepEqual(result, {
    ok: false,
    reportId: "report-001",
    errorCode: "LIP_REGION_NOT_FOUND",
    errorMessage: "lip region missing",
    remainingFreeRegenerations: 3,
  });
  assert.deepEqual(addedReports, []);
  assert.deepEqual(updatedReports, []);
  assert.deepEqual(updatedTests, []);
  assert.equal(providerRuns.length, 1);
  assert.equal(providerRuns[0].reportId, "report-002");
  assert.equal(providerRuns[0].status, "failed");
  assert.deepEqual(events, [
    {
      _id: "event-001",
      openid: "openid-001",
      eventName: "preview_regenerate_fail",
      testId: "test-001",
      reportId: "report-001",
      properties: {
        attemptedReportId: "report-002",
        errorCode: "LIP_REGION_NOT_FOUND",
        previewRegenerateCount: 0,
      },
      createdAt: "2026-06-07T10:00:00.000Z",
    },
  ]);
});

test("preview regeneration limit returns a preference-reset prompt and records a limit event", async () => {
  const events: EventRecord[] = [];
  let imageServiceCalled = false;
  const limitReachedTest: TryOnTest = {
    ...existingTest,
    previewRegenerateCount: 3,
  };
  const context = createRegenerateContext({
    ids: ["event-001"],
    testRecord: limitReachedTest,
    async generateTryOn() {
      imageServiceCalled = true;
      throw new Error("should not generate");
    },
    onReport: () => undefined,
    onReportPatch: () => undefined,
    onTestPatch: () => undefined,
    onProviderRun: () => undefined,
    onEvent: (event) => events.push(event),
  });

  const result = await testMain(
    {
      action: "regeneratePreview",
      testId: "test-001",
    },
    context,
  );

  assert.deepEqual(result, {
    ok: false,
    reportId: "report-001",
    errorCode: "PREVIEW_REGENERATE_LIMIT_REACHED",
    errorMessage: "本次免费换色机会已用完，你可以修改偏好重新测试",
    remainingFreeRegenerations: 0,
  });
  assert.equal(imageServiceCalled, false);
  assert.deepEqual(events, [
    {
      _id: "event-001",
      openid: "openid-001",
      eventName: "preview_regenerate_limit_reached",
      testId: "test-001",
      reportId: "report-001",
      properties: {
        previewRegenerateCount: 3,
        maxPreviewRegenerateCount: 3,
      },
      createdAt: "2026-06-07T10:00:00.000Z",
    },
  ]);
});

function createRegenerateContext(options: {
  ids: string[];
  testRecord?: TryOnTest;
  generateTryOn(input: Parameters<NonNullable<TestFunctionContext["imageService"]>["generateTryOn"]>[0]): Promise<ImageGenerationResult>;
  onReport: (report: Report) => void;
  onReportPatch: (reportId: string, patch: Partial<Report>) => void;
  onTestPatch: (testId: string, patch: Partial<TryOnTest>) => void;
  onProviderRun: (run: ProviderRun) => void;
  onEvent: (event: EventRecord) => void;
}): TestFunctionContext {
  const ids = [...options.ids];

  return {
    openid: "openid-001",
    now: "2026-06-07T10:00:00.000Z",
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

        return options.testRecord ?? existingTest;
      },
      async listReportsByTest(testId) {
        assert.equal(testId, "test-001");

        return [existingReport];
      },
      async getReport(reportId) {
        assert.equal(reportId, "report-001");

        return existingReport;
      },
      async listActiveLipsticks() {
        return lipstickCatalog;
      },
      async addReport(report) {
        options.onReport(report);

        return { id: report._id };
      },
      async updateReport(reportId, patch) {
        options.onReportPatch(reportId, patch);
      },
      async updateTryOnTest(testId, patch) {
        options.onTestPatch(testId, patch);
      },
      async addProviderRun(run) {
        options.onProviderRun(run);

        return { id: run._id };
      },
      async addEvent(event) {
        options.onEvent(event);

        return { id: String(event._id) };
      },
    },
    imageService: {
      generateTryOn: options.generateTryOn,
    },
    idGenerator: () => {
      const id = ids.shift();

      if (!id) {
        throw new Error("missing test id");
      }

      return id;
    },
  };
}

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
  createdAt: "2026-06-07T09:00:00.000Z",
  updatedAt: "2026-06-07T09:00:00.000Z",
  expiresAt: "2026-06-08T09:00:00.000Z",
};

const existingRecommendations = [recommendation("lip-1"), recommendation("lip-2"), recommendation("lip-3")];

const existingReport: Report = {
  _id: "report-001",
  openid: "openid-001",
  testId: "test-001",
  version: 1,
  status: "active",
  snapshot: {
    preferences: existingTest.preferences!,
    recommendations: existingRecommendations,
  },
  previewImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
  paidImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
  shareCardImages: [],
  replacedByReportId: null,
  unlockedAt: null,
  expiresAt: "2026-06-08T09:00:00.000Z",
  deletedAt: null,
  createdAt: "2026-06-07T09:10:00.000Z",
};

const lipstickCatalog: Lipstick[] = [
  lipstick("lip-1", 99),
  lipstick("lip-2", 98),
  lipstick("lip-3", 97),
  lipstick("lip-4", 96),
  lipstick("lip-5", 95),
  lipstick("lip-6", 94),
];

function recommendation(lipstickId: string): Recommendation {
  return {
    lipstickId,
    brand: `Brand ${lipstickId}`,
    shadeName: `Shade ${lipstickId}`,
    shadeCode: lipstickId.toUpperCase(),
    colorHex: "#cc3355",
    swatchImageFileId: `cloud://swatches/${lipstickId}.jpg`,
    texture: "cream",
    undertone: "neutral",
    budgetRange: "mid",
    recommendationReason: `${lipstickId} reason`,
    cautionNote: `${lipstickId} caution`,
    substitute: `${lipstickId} substitute`,
    searchKeywords: [`${lipstickId} keyword`],
    score: 100,
  };
}

function lipstick(_id: string, baseScore: number): Lipstick {
  return {
    _id,
    brand: `Brand ${_id}`,
    shadeName: `Shade ${_id}`,
    shadeCode: _id.toUpperCase(),
    colorHex: "#cc3355",
    swatchImageFileId: `cloud://swatches/${_id}.jpg`,
    texture: "cream",
    undertone: "neutral",
    skinToneTags: ["fair"],
    budgetRange: "mid",
    sceneTags: ["commute"],
    styleTags: ["brightening"],
    baseScore,
    manualBoost: 0,
    recommendationReason: `${_id} reason`,
    cautionNote: `${_id} caution`,
    substitute: `${_id} substitute`,
    searchKeywords: [`${_id} keyword`],
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}
