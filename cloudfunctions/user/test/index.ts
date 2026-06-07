import type { Lipstick, Preferences, Recommendation, TryOnTest } from "../../../shared/types/test.js";
import type { Report } from "../../../shared/types/report.js";
import type { ProviderRun } from "../../../shared/types/provider-run.js";
import type { TryOnImageService } from "../../../image-service/generateTryOn.js";
import { ERROR_CODES } from "../../../shared/constants/index.js";

export interface UploadSelfieEvent {
  action: "uploadSelfie";
  file: {
    name: string;
    contentType: string;
    buffer: string;
  };
  requestedAccess?: string;
  checks: {
    contentSafe: boolean;
    faceDetected: boolean;
    imageClear: boolean;
    lipsVisible: boolean;
  };
}

export interface SubmitPreferencesEvent {
  action: "submitPreferences";
  testId: string;
  preferences: Preferences;
}

export interface GeneratePreviewEvent {
  action: "generatePreview";
  testId: string;
}

export interface RegeneratePreviewEvent {
  action: "regeneratePreview";
  testId: string;
}

export interface EventRecord {
  _id: string;
  openid: string;
  eventName: "preview_regenerate_success" | "preview_regenerate_fail" | "preview_regenerate_limit_reached";
  testId: string;
  reportId: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface StorageClient {
  upload(options: {
    cloudPath: string;
    contentType: string;
    buffer: string;
    access: "private";
  }): Promise<{ fileId: string }>;
}

export interface TestDatabase {
  addTryOnTest(record: TryOnTest): Promise<{ id: string }>;
  getTryOnTest?(testId: string): Promise<TryOnTest | null>;
  listActiveLipsticks?(): Promise<Lipstick[]>;
  listReportsByTest?(testId: string): Promise<Report[]>;
  updateTryOnTest?(testId: string, patch: Partial<TryOnTest>): Promise<void>;
  addReport?(report: Report): Promise<{ id: string }>;
  getReport?(reportId: string): Promise<Report | null>;
  updateReport?(reportId: string, patch: Partial<Report>): Promise<void>;
  addProviderRun?(run: ProviderRun): Promise<{ id: string }>;
  addEvent?(event: EventRecord): Promise<{ id: string }>;
}

export interface TestFunctionContext {
  openid?: string;
  OPENID?: string;
  now?: string;
  storage: StorageClient;
  database: TestDatabase;
  imageService?: TryOnImageService;
  idGenerator?: () => string;
}

export interface UploadSelfieResult {
  ok: true;
  testId: string;
  selfieFileId: string;
}

export interface UploadSelfieRejectedResult {
  ok: false;
  reason: string;
}

type UploadSelfieResponse = UploadSelfieResult | UploadSelfieRejectedResult;

export interface SubmitPreferencesResult {
  ok: true;
  reportId: string;
  recommendations: Recommendation[];
}

export interface GeneratePreviewResult {
  ok: true;
  reportId: string;
  cleanImages: string[];
  watermarkedImages: string[];
}

export interface GeneratePreviewFailedResult {
  ok: false;
  reportId: string;
  errorCode: string;
  errorMessage: string;
}

export interface RegeneratePreviewResult {
  ok: true;
  reportId: string;
  recommendations: Recommendation[];
  cleanImages: string[];
  watermarkedImages: string[];
  remainingFreeRegenerations: number;
}

export interface RegeneratePreviewFailedResult {
  ok: false;
  reportId: string;
  errorCode: string;
  errorMessage: string;
  remainingFreeRegenerations: number;
}

type TestFunctionEvent = UploadSelfieEvent | SubmitPreferencesEvent | GeneratePreviewEvent | RegeneratePreviewEvent;
type GeneratePreviewResponse = GeneratePreviewResult | GeneratePreviewFailedResult;
type RegeneratePreviewResponse = RegeneratePreviewResult | RegeneratePreviewFailedResult;
type TestFunctionResponse = UploadSelfieResponse | SubmitPreferencesResult | GeneratePreviewResponse | RegeneratePreviewResponse;

export function main(event: UploadSelfieEvent, context: TestFunctionContext): Promise<UploadSelfieResponse>;
export function main(event: SubmitPreferencesEvent, context: TestFunctionContext): Promise<SubmitPreferencesResult>;
export function main(event: GeneratePreviewEvent, context: TestFunctionContext): Promise<GeneratePreviewResponse>;
export function main(event: RegeneratePreviewEvent, context: TestFunctionContext): Promise<RegeneratePreviewResponse>;
export async function main(
  event: TestFunctionEvent,
  context: TestFunctionContext,
): Promise<TestFunctionResponse> {
  const openid = context.openid ?? context.OPENID;

  if (!openid) {
    throw new Error(ERROR_CODES.authOpenidMissing);
  }

  if (event.action === "submitPreferences") {
    return submitPreferences(event, context, openid);
  }

  if (event.action === "generatePreview") {
    return generatePreview(event, context, openid);
  }

  if (event.action === "regeneratePreview") {
    return regeneratePreview(event, context, openid);
  }

  const rejectionReason = getSelfieRejectionReason(event.checks);

  if (rejectionReason) {
    return {
      ok: false,
      reason: rejectionReason,
    };
  }

  const testId = context.idGenerator?.() ?? crypto.randomUUID();
  const now = context.now ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();
  const cloudPath = `selfies/${openid}/${testId}/original.jpg`;
  const uploadResult = await context.storage.upload({
    cloudPath,
    contentType: event.file.contentType,
    buffer: event.file.buffer,
    access: "private",
  });

  await context.database.addTryOnTest({
    _id: testId,
    openid,
    status: "selfie_uploaded",
    selfieFileId: uploadResult.fileId,
    preferences: null,
    safetyStatus: "passed",
    qualityStatus: "passed",
    generationStatus: "pending",
    generationRetryCount: 0,
    previewRegenerateCount: 0,
    maxPreviewRegenerateCount: 3,
    activeReportId: null,
    sourceShareId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  });

  return {
    ok: true,
    testId,
    selfieFileId: uploadResult.fileId,
  };
}

async function regeneratePreview(
  event: RegeneratePreviewEvent,
  context: TestFunctionContext,
  openid: string,
): Promise<RegeneratePreviewResponse> {
  if (
    !context.database.getTryOnTest ||
    !context.database.getReport ||
    !context.database.listReportsByTest ||
    !context.database.listActiveLipsticks ||
    !context.database.addReport ||
    !context.database.updateReport ||
    !context.database.updateTryOnTest ||
    !context.database.addProviderRun ||
    !context.database.addEvent ||
    !context.imageService
  ) {
    throw new Error("PREVIEW_REGENERATE_DEPENDENCY_MISSING");
  }

  const existingTest = await context.database.getTryOnTest(event.testId);

  if (!existingTest || existingTest.openid !== openid || !existingTest.activeReportId || !existingTest.preferences) {
    throw new Error("TRY_ON_TEST_NOT_FOUND");
  }

  const previousReport = await context.database.getReport(existingTest.activeReportId);

  if (!previousReport || previousReport.openid !== openid || previousReport.testId !== event.testId || previousReport.status !== "active") {
    throw new Error("ACTIVE_REPORT_NOT_FOUND");
  }

  const now = context.now ?? new Date().toISOString();

  if (existingTest.previewRegenerateCount >= existingTest.maxPreviewRegenerateCount) {
    await context.database.addEvent({
      _id: context.idGenerator?.() ?? crypto.randomUUID(),
      openid,
      eventName: "preview_regenerate_limit_reached",
      testId: event.testId,
      reportId: previousReport._id,
      properties: {
        previewRegenerateCount: existingTest.previewRegenerateCount,
        maxPreviewRegenerateCount: existingTest.maxPreviewRegenerateCount,
      },
      createdAt: now,
    });

    return {
      ok: false,
      reportId: previousReport._id,
      errorCode: "PREVIEW_REGENERATE_LIMIT_REACHED",
      errorMessage: "本次免费换色机会已用完，你可以修改偏好重新测试",
      remainingFreeRegenerations: 0,
    };
  }

  const existingReports = await context.database.listReportsByTest(event.testId);
  const seenLipstickIds = new Set(
    existingReports.flatMap((report) => report.snapshot.recommendations.map((recommendation) => recommendation.lipstickId)),
  );
  const recommendations = recommendTop3(await context.database.listActiveLipsticks(), existingTest.preferences, seenLipstickIds);
  const reportId = context.idGenerator?.() ?? crypto.randomUUID();

  const generation = await context.imageService.generateTryOn({
    selfieFileId: existingTest.selfieFileId,
    targetLipsticks: recommendations,
    testId: event.testId,
    reportId,
  });

  if (!generation.ok) {
    await context.database.addProviderRun({
      _id: context.idGenerator?.() ?? crypto.randomUUID(),
      testId: event.testId,
      reportId,
      openid,
      provider: generation.provider,
      status: "failed",
      durationMs: generation.durationMs,
      retryIndex: 0,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
      cleanImageFileIds: [],
      watermarkedImageFileIds: [],
      createdAt: now,
    });
    await context.database.addEvent({
      _id: context.idGenerator?.() ?? crypto.randomUUID(),
      openid,
      eventName: "preview_regenerate_fail",
      testId: event.testId,
      reportId: previousReport._id,
      properties: {
        attemptedReportId: reportId,
        errorCode: generation.errorCode,
        previewRegenerateCount: existingTest.previewRegenerateCount,
      },
      createdAt: now,
    });

    return {
      ok: false,
      reportId: previousReport._id,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
      remainingFreeRegenerations: existingTest.maxPreviewRegenerateCount - existingTest.previewRegenerateCount,
    };
  }

  const providerRun: ProviderRun = {
    _id: context.idGenerator?.() ?? crypto.randomUUID(),
    testId: event.testId,
    reportId,
    openid,
    provider: generation.provider,
    status: "success",
    durationMs: generation.durationMs,
    retryIndex: 0,
    errorCode: null,
    errorMessage: null,
    cleanImageFileIds: generation.cleanImages,
    watermarkedImageFileIds: generation.watermarkedImages,
    createdAt: now,
  };
  const nextCount = existingTest.previewRegenerateCount + 1;
  const report: Report = {
    _id: reportId,
    openid,
    testId: event.testId,
    version: Math.max(previousReport.version, ...existingReports.map((item) => item.version)) + 1,
    status: "active",
    snapshot: {
      preferences: existingTest.preferences,
      recommendations,
    },
    previewImages: generation.watermarkedImages,
    paidImages: generation.cleanImages,
    shareCardImages: [],
    replacedByReportId: null,
    unlockedAt: null,
    expiresAt: existingTest.expiresAt,
    deletedAt: null,
    createdAt: now,
  };

  await context.database.addProviderRun(providerRun);
  await context.database.addReport(report);
  await context.database.updateReport(previousReport._id, {
    status: "replaced",
    replacedByReportId: reportId,
  });
  await context.database.updateTryOnTest(event.testId, {
    activeReportId: reportId,
    previewRegenerateCount: nextCount,
    updatedAt: now,
  });
  await context.database.addEvent({
    _id: context.idGenerator?.() ?? crypto.randomUUID(),
    openid,
    eventName: "preview_regenerate_success",
    testId: event.testId,
    reportId,
    properties: {
      previousReportId: previousReport._id,
      previewRegenerateCount: nextCount,
    },
    createdAt: now,
  });

  return {
    ok: true,
    reportId,
    recommendations,
    cleanImages: generation.cleanImages,
    watermarkedImages: generation.watermarkedImages,
    remainingFreeRegenerations: existingTest.maxPreviewRegenerateCount - nextCount,
  };
}

async function generatePreview(
  event: GeneratePreviewEvent,
  context: TestFunctionContext,
  openid: string,
): Promise<GeneratePreviewResponse> {
  if (!context.database.getTryOnTest || !context.database.getReport || !context.database.updateReport || !context.database.addProviderRun || !context.imageService) {
    throw new Error("IMAGE_GENERATION_DEPENDENCY_MISSING");
  }

  const existingTest = await context.database.getTryOnTest(event.testId);

  if (!existingTest || existingTest.openid !== openid || !existingTest.activeReportId) {
    throw new Error("TRY_ON_TEST_NOT_FOUND");
  }

  const report = await context.database.getReport(existingTest.activeReportId);

  if (!report || report.openid !== openid || report.testId !== event.testId) {
    throw new Error("REPORT_NOT_FOUND");
  }

  const generation = await context.imageService.generateTryOn({
    selfieFileId: existingTest.selfieFileId,
    targetLipsticks: report.snapshot.recommendations,
    testId: event.testId,
    reportId: report._id,
  });

  if (!generation.ok) {
    await context.database.addProviderRun({
      _id: context.idGenerator?.() ?? crypto.randomUUID(),
      testId: event.testId,
      reportId: report._id,
      openid,
      provider: generation.provider,
      status: "failed",
      durationMs: generation.durationMs,
      retryIndex: 0,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
      cleanImageFileIds: [],
      watermarkedImageFileIds: [],
      createdAt: context.now ?? new Date().toISOString(),
    });

    return {
      ok: false,
      reportId: report._id,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
    };
  }

  const providerRun: ProviderRun = {
    _id: context.idGenerator?.() ?? crypto.randomUUID(),
    testId: event.testId,
    reportId: report._id,
    openid,
    provider: generation.provider,
    status: "success",
    durationMs: generation.durationMs,
    retryIndex: 0,
    errorCode: null,
    errorMessage: null,
    cleanImageFileIds: generation.cleanImages,
    watermarkedImageFileIds: generation.watermarkedImages,
    createdAt: context.now ?? new Date().toISOString(),
  };

  await context.database.addProviderRun(providerRun);
  await context.database.updateReport(report._id, {
    previewImages: generation.watermarkedImages,
    paidImages: generation.cleanImages,
  });

  return {
    ok: true,
    reportId: report._id,
    cleanImages: generation.cleanImages,
    watermarkedImages: generation.watermarkedImages,
  };
}

async function submitPreferences(
  event: SubmitPreferencesEvent,
  context: TestFunctionContext,
  openid: string,
): Promise<SubmitPreferencesResult> {
  if (!context.database.getTryOnTest || !context.database.listActiveLipsticks || !context.database.updateTryOnTest || !context.database.addReport) {
    throw new Error("TEST_DATABASE_METHOD_MISSING");
  }

  const existingTest = await context.database.getTryOnTest(event.testId);

  if (!existingTest || existingTest.openid !== openid) {
    throw new Error("TRY_ON_TEST_NOT_FOUND");
  }

  const now = context.now ?? new Date().toISOString();
  const reportId = context.idGenerator?.() ?? crypto.randomUUID();
  const recommendations = recommendTop3(await context.database.listActiveLipsticks(), event.preferences);
  const report: Report = {
    _id: reportId,
    openid,
    testId: event.testId,
    version: 1,
    status: "active",
    snapshot: {
      preferences: event.preferences,
      recommendations,
    },
    previewImages: [],
    paidImages: [],
    shareCardImages: [],
    replacedByReportId: null,
    unlockedAt: null,
    expiresAt: existingTest.expiresAt,
    deletedAt: null,
    createdAt: now,
  };

  await context.database.addReport(report);
  await context.database.updateTryOnTest(event.testId, {
    preferences: event.preferences,
    activeReportId: reportId,
    updatedAt: now,
  });

  return {
    ok: true,
    reportId,
    recommendations,
  };
}

function recommendTop3(catalog: Lipstick[], preferences: Preferences, excludedLipstickIds = new Set<string>()): Recommendation[] {
  return catalog
    .filter((lipstick) => lipstick.status === "active")
    .filter((lipstick) => !excludedLipstickIds.has(lipstick._id))
    .filter((lipstick) => lipstick.budgetRange === preferences.budgetRange)
    .map((lipstick) => ({
      lipstick,
      score: scoreLipstick(lipstick, preferences),
    }))
    .filter((item) => item.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => right.score - left.score || left.lipstick._id.localeCompare(right.lipstick._id))
    .slice(0, 3)
    .map(({ lipstick, score }) => ({
      lipstickId: lipstick._id,
      brand: lipstick.brand,
      shadeName: lipstick.shadeName,
      shadeCode: lipstick.shadeCode,
      colorHex: lipstick.colorHex,
      swatchImageFileId: lipstick.swatchImageFileId,
      texture: lipstick.texture,
      undertone: lipstick.undertone,
      budgetRange: lipstick.budgetRange,
      recommendationReason: lipstick.recommendationReason,
      cautionNote: lipstick.cautionNote,
      substitute: lipstick.substitute,
      searchKeywords: [...lipstick.searchKeywords],
      score,
    }));
}

function scoreLipstick(lipstick: Lipstick, preferences: Preferences): number {
  if (!lipstick.skinToneTags.includes(preferences.skinTone)) {
    return Number.NEGATIVE_INFINITY;
  }

  const sceneScore = preferences.scenes.filter((scene) => lipstick.sceneTags.includes(scene)).length * 10;
  const styleScore = preferences.styles.filter((style) => lipstick.styleTags.includes(style)).length * 10;

  return lipstick.baseScore + sceneScore + styleScore + lipstick.manualBoost;
}

function getSelfieRejectionReason(checks: UploadSelfieEvent["checks"]): string | null {
  if (!checks.contentSafe) {
    return "图片内容不符合要求，请更换自拍后重试";
  }

  if (!checks.faceDetected) {
    return "没有识别到清晰正脸，请重新拍摄";
  }

  if (!checks.imageClear) {
    return "图片不够清晰，请使用自然光下的清晰自拍";
  }

  if (!checks.lipsVisible) {
    return "没有识别到无遮挡嘴唇，请重新拍摄";
  }

  return null;
}
