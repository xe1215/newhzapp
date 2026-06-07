import type { Report } from "../../../shared/types/report.js";
import type { TryOnTest } from "../../../shared/types/test.js";
import { ERROR_CODES } from "../../../shared/constants/index.js";

export interface GetFreePreviewEvent {
  action: "getFreePreview";
  testId: string;
}

export interface PreviewViewEvent {
  openid: string;
  eventName: "preview_view";
  testId: string;
  reportId: string;
  createdAt: string;
}

export interface ReportDatabase {
  getTryOnTest(testId: string): Promise<TryOnTest | null>;
  getReport(reportId: string): Promise<Report | null>;
  addEvent(event: PreviewViewEvent): Promise<{ id: string }>;
}

export interface ReportFunctionContext {
  openid?: string;
  OPENID?: string;
  now?: string;
  database: ReportDatabase;
}

export interface FreePreviewResult {
  ok: true;
  testId: string;
  reportId: string;
  previewImages: string[];
  remainingFreeRegenerations: number;
  paymentEntry: {
    enabled: true;
    amount: 599;
    currency: "CNY";
    reportId: string;
  };
  lockedReport: {
    state: "locked";
    sections: Array<{
      key: "bestMatch" | "dailySafe" | "styleBoost";
      title: string;
      placeholder: string;
    }>;
  };
}

export async function main(
  event: GetFreePreviewEvent,
  context: ReportFunctionContext,
): Promise<FreePreviewResult> {
  const openid = context.openid ?? context.OPENID;

  if (!openid) {
    throw new Error(ERROR_CODES.authOpenidMissing);
  }

  if (event.action !== "getFreePreview") {
    throw new Error("REPORT_ACTION_NOT_SUPPORTED");
  }

  const test = await context.database.getTryOnTest(event.testId);

  if (!test || test.openid !== openid || !test.activeReportId) {
    throw new Error("TRY_ON_TEST_NOT_FOUND");
  }

  const report = await context.database.getReport(test.activeReportId);

  if (!report || report.openid !== openid || report.testId !== event.testId || report.status !== "active") {
    throw new Error("ACTIVE_REPORT_NOT_FOUND");
  }

  await context.database.addEvent({
    openid,
    eventName: "preview_view",
    testId: test._id,
    reportId: report._id,
    createdAt: context.now ?? new Date().toISOString(),
  });

  return {
    ok: true,
    testId: test._id,
    reportId: report._id,
    previewImages: [...report.previewImages],
    remainingFreeRegenerations: Math.max(0, test.maxPreviewRegenerateCount - test.previewRegenerateCount),
    paymentEntry: {
      enabled: true,
      amount: 599,
      currency: "CNY",
      reportId: report._id,
    },
    lockedReport: {
      state: "locked",
      sections: [
        { key: "bestMatch", title: "最适合你", placeholder: "支付后查看完整口红推荐" },
        { key: "dailySafe", title: "日常不出错", placeholder: "支付后查看完整口红推荐" },
        { key: "styleBoost", title: "风格加分款", placeholder: "支付后查看完整口红推荐" },
      ],
    },
  };
}
