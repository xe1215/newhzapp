import assert from "node:assert/strict";
import test from "node:test";
import { type ReportFunctionContext, main as reportMain } from "../cloudfunctions/user/report/index.js";
import type { Report } from "../shared/types/report.js";
import type { TryOnTest } from "../shared/types/test.js";

test("free preview returns active report watermarked images, locked placeholders, quota, payment entry, and records preview_view", async () => {
  const events: Array<{
    openid: string;
    eventName: string;
    testId: string;
    reportId: string;
    createdAt: string;
  }> = [];
  const context: ReportFunctionContext = {
    openid: "openid-001",
    now: "2026-06-07T10:00:00.000Z",
    database: {
      async getTryOnTest(testId) {
        assert.equal(testId, "test-001");

        return existingTest;
      },
      async getReport(reportId) {
        assert.equal(reportId, "report-001");

        return existingReport;
      },
      async addEvent(event) {
        events.push(event);

        return { id: "event-001" };
      },
    },
  };

  const result = await reportMain(
    {
      action: "getFreePreview",
      testId: "test-001",
    },
    context,
  );

  assert.deepEqual(result, {
    ok: true,
    testId: "test-001",
    reportId: "report-001",
    previewImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
    remainingFreeRegenerations: 2,
    paymentEntry: {
      enabled: true,
      amount: 599,
      currency: "CNY",
      reportId: "report-001",
    },
    lockedReport: {
      state: "locked",
      sections: [
        { key: "bestMatch", title: "最适合你", placeholder: "支付后查看完整口红推荐" },
        { key: "dailySafe", title: "日常不出错", placeholder: "支付后查看完整口红推荐" },
        { key: "styleBoost", title: "风格加分款", placeholder: "支付后查看完整口红推荐" },
      ],
    },
  });
  assert.deepEqual(events, [
    {
      openid: "openid-001",
      eventName: "preview_view",
      testId: "test-001",
      reportId: "report-001",
      createdAt: "2026-06-07T10:00:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(result).includes("Brand A"), false);
  assert.equal(JSON.stringify(result).includes("Shade A"), false);
  assert.equal(JSON.stringify(result).includes("599-799"), false);
  assert.equal(JSON.stringify(result).includes("recommended because"), false);
  assert.equal(JSON.stringify(result).includes("avoid this"), false);
  assert.equal(JSON.stringify(result).includes("dupe"), false);
  assert.equal(JSON.stringify(result).includes("search keyword"), false);
});

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
  previewRegenerateCount: 1,
  maxPreviewRegenerateCount: 3,
  activeReportId: "report-001",
  sourceShareId: null,
  createdAt: "2026-06-07T09:00:00.000Z",
  updatedAt: "2026-06-07T09:00:00.000Z",
  expiresAt: "2026-06-08T09:00:00.000Z",
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
    recommendations: [
      {
        lipstickId: "lip-1",
        brand: "Brand A",
        shadeName: "Shade A",
        shadeCode: "A01",
        colorHex: "#cc3355",
        swatchImageFileId: "cloud://swatches/lip-1.jpg",
        texture: "cream",
        undertone: "neutral",
        budgetRange: "599-799",
        recommendationReason: "recommended because it matches",
        cautionNote: "avoid this when lips are dry",
        substitute: "dupe option",
        searchKeywords: ["search keyword"],
        score: 100,
      },
    ],
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
