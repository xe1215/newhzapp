import type { TryOnTest } from "../../../shared/types/test.js";
import { ERROR_CODES } from "../../../shared/constants/index.js";

interface UploadSelfieEvent {
  action: "uploadSelfie";
  file: {
    name: string;
    contentType: string;
    buffer: string;
  };
  checks: {
    contentSafe: boolean;
    faceDetected: boolean;
    imageClear: boolean;
    lipsVisible: boolean;
  };
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
}

export interface TestFunctionContext {
  openid?: string;
  OPENID?: string;
  now?: string;
  storage: StorageClient;
  database: TestDatabase;
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

export async function main(
  event: UploadSelfieEvent,
  context: TestFunctionContext,
): Promise<UploadSelfieResponse> {
  const openid = context.openid ?? context.OPENID;

  if (!openid) {
    throw new Error(ERROR_CODES.authOpenidMissing);
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
