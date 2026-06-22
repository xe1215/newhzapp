const {
  cloud,
  ok,
  fail,
  unsupported,
  getEventData,
  requireOpenId,
  buildRuntime,
} = require("./test-core");
const {
  rankLipsticks,
  validatePreferences,
} = require("./recommendation");
const {
  finishRegeneratedPreview,
} = require("./generation-flow");
const {
  recordProviderRun,
  recordGenerationEvent,
  loadOwnedTestAndReport,
  persistPendingRegenerateReport,
  persistCompletedRegenerateReport,
} = require("./generation-records");
const {
  handleGenerateTryOnPending,
  handleGenerateTryOnSuccess,
  handleGenerateTryOnFailure,
  handlePreviewLimitReached,
  handlePreviewRecommendationShortage,
  handlePreviewContinuationPending,
  handlePreviewNewPending,
  handlePreviewProviderFailure,
  handlePreviewProviderSuccess,
} = require("./generation-handlers");
const {
  validateActivePreviewState,
  loadPendingRegenerateReport,
  getPendingRecommendations,
  resolvePreviewPreferences,
  loadReplacementRecommendations,
  buildProviderGenerateInput,
} = require("./preview-regeneration");
const { createJimengHelpers } = require("./jimeng-helpers");
const { createJimengProvider } = require("./jimeng-provider");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RECOMMENDATION_LIMIT = 3;
const IMAGE_COUNT = 3;
const ROLE_LABELS = {
  best_match: "最适合你",
  daily_safe: "日常不出错",
  style_boost: "风格加分款",
};
const TEXTURE_PROMPTS = {
  matte:
    "哑光质地，显色均匀，反光弱，唇纹仍然可见。不要磨平唇纹，不要产生粉墙感或厚重遮盖感。",
  glossy:
    "水光质地，颜色半透明，唇面有湿润光泽，但高光必须贴合原本唇部结构和光照方向。可以轻微增强原有反射，但不要新增夸张白色亮斑。",
  velvet:
    "丝绒质地，中等显色，光泽柔和扩散，保留唇纹和唇部体积。效果应柔和高级，不要过度磨皮或模糊。",
  stain:
    "染色质地，颜色像渗入唇部表层，边缘自然柔和，无明显油亮高光。保留原唇纹、原明暗和自然渐变。",
};
const TRYON_NEGATIVE_PROMPT =
  "不要缩放，不要裁剪，不要旋转，不要平移，不要重新构图，不要改变人脸大小，不要改变人物位置，不要改变拍摄角度，不要镜头校正，不要美颜，不要磨皮，不要换脸，不要改变脸型，不要改变肤色，不要改变光照，不要改变阴影，不要改变曝光，不要改变白平衡，不要改变背景，不要改变衣服，不要改变头发，不要改变眼睛，不要改变眉毛，不要改变鼻子，不要改变牙齿，不要改变舌头，不要改变表情，不要改变唇形，不要改变唇线，不要改变嘴角，不要改变唇峰，不要改变唇厚，不要让口红溢出唇部，不要污染牙齿，不要污染舌头，不要污染皮肤，不要污染鼻子，不要污染下巴，不要平涂，不要油漆感，不要塑料膜感，不要模糊唇纹，不要重建嘴唇纹理，不要生成随机AI模特，不要添加文字，不要添加水印，不要添加边框，不要添加贴纸，不要添加伪影。";
const DEFAULT_REFERENCE_STRENGTH = 85;
const JIMENG_DEFAULT_HOST = "visual.volcengineapi.com";
const JIMENG_DEFAULT_REGION = "cn-north-1";
const JIMENG_DEFAULT_SERVICE = "cv";
const JIMENG_DEFAULT_VERSION = "2022-08-31";
const JIMENG_DEFAULT_SUBMIT_ACTION = "CVSync2AsyncSubmitTask";
const JIMENG_DEFAULT_GET_RESULT_ACTION = "CVSync2AsyncGetResult";
const JIMENG_DEFAULT_MODEL = "jimeng_seedream46_cvtob";
const JIMENG_DEFAULT_MAX_POLLS = 30;
const JIMENG_DEFAULT_POLL_INTERVAL_MS = 2000;
const JIMENG_DEFAULT_HTTP_MAX_RETRIES = 3;
const JIMENG_DEFAULT_HTTP_RETRY_DELAY_MS = 3000;
const JIMENG_DEFAULT_TASK_STALE_MS = 20 * 60 * 1000;
const WATERMARK_INSTRUCTION =
  "水印版本要求：生成正常试色图本体时不要在画面内生成文字或装饰。水印由程序后处理添加，不要让模型生成水印。";
const CLEAN_IMAGE_INSTRUCTION =
  "无水印版本要求：图像中不得出现任何文字、水印、logo、边框、贴纸或说明。";
const JIMENG_PROMPT_LIMIT = 800;
const PREVIEW_WATERMARK_TEXT = "PREVIEW";
const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;

function getRuntime(deps) {
  return buildRuntime(deps, {
    httpRequest,
    downloadUrl,
    applyVisibleWatermark,
    previewWatermarkText: PREVIEW_WATERMARK_TEXT,
  });
}

const jimengHelpers = createJimengHelpers({
  roleLabels: ROLE_LABELS,
  texturePrompts: TEXTURE_PROMPTS,
  tryonNegativePrompt: TRYON_NEGATIVE_PROMPT,
  defaultReferenceStrength: DEFAULT_REFERENCE_STRENGTH,
  jimengPromptLimit: JIMENG_PROMPT_LIMIT,
  previewWatermarkText: PREVIEW_WATERMARK_TEXT,
  watermarkInstruction: WATERMARK_INSTRUCTION,
  cleanImageInstruction: CLEAN_IMAGE_INSTRUCTION,
  createProviderError,
  ensureJimengCredentials,
});

const {
  buildTryOnPrompts,
  safeJsonParse,
  httpRequest,
  downloadUrl,
  applyVisibleWatermark,
  callJimengApi,
  resolveTaskId,
  resolveImageUrls,
  resolveTaskStatus,
  createJimengResponseDiagnostic,
  createJimengTaskCheckSummary,
  createJimengHttpDiagnostic,
  assertJimengTaskFresh,
} = jimengHelpers;

function getProviderConfig(env) {
  const source = env || {};
  const parsedTimeoutMs = Number(source.IMAGE_PROVIDER_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : DEFAULT_PROVIDER_TIMEOUT_MS;

  return {
    provider: source.IMAGE_PROVIDER || "mock",
    model: source.IMAGE_PROVIDER_MODEL || "mock-tryon-v1",
    apiKey: source.IMAGE_PROVIDER_API_KEY || "",
    jimeng: {
      accessKeyId: source.JIMENG_ACCESS_KEY_ID || source.VOLC_ACCESS_KEY_ID || "",
      secretAccessKey:
        source.JIMENG_SECRET_ACCESS_KEY || source.VOLC_SECRET_ACCESS_KEY || "",
      sessionToken: source.JIMENG_SESSION_TOKEN || source.VOLC_SESSION_TOKEN || "",
      host: source.JIMENG_API_HOST || JIMENG_DEFAULT_HOST,
      region: source.JIMENG_REGION || JIMENG_DEFAULT_REGION,
      service: source.JIMENG_SERVICE || JIMENG_DEFAULT_SERVICE,
      version: source.JIMENG_VERSION || JIMENG_DEFAULT_VERSION,
      submitAction: source.JIMENG_SUBMIT_ACTION || JIMENG_DEFAULT_SUBMIT_ACTION,
      getResultAction:
        source.JIMENG_GET_RESULT_ACTION || JIMENG_DEFAULT_GET_RESULT_ACTION,
      reqKey: source.JIMENG_REQ_KEY || source.IMAGE_PROVIDER_MODEL || JIMENG_DEFAULT_MODEL,
      maxPolls: Number(source.JIMENG_MAX_POLLS || JIMENG_DEFAULT_MAX_POLLS),
      pollIntervalMs: Number(
        source.JIMENG_POLL_INTERVAL_MS || JIMENG_DEFAULT_POLL_INTERVAL_MS
      ),
      httpMaxRetries: Number(
        source.JIMENG_HTTP_MAX_RETRIES || JIMENG_DEFAULT_HTTP_MAX_RETRIES
      ),
      httpRetryDelayMs: Number(
        source.JIMENG_HTTP_RETRY_DELAY_MS || JIMENG_DEFAULT_HTTP_RETRY_DELAY_MS
      ),
      taskStaleMs: Number(source.JIMENG_TASK_STALE_MS || JIMENG_DEFAULT_TASK_STALE_MS),
      outputPrefix: source.JIMENG_OUTPUT_PREFIX || "tryon-results",
    },
    promptVersion: source.TRYON_PROMPT_VERSION || "local-v1",
    prompt:
      source.TRYON_PROMPT ||
      "以上传的参考图片为唯一且绝对的基准，进行 1:1 像素级精确复刻，仅修改嘴唇颜色和质地。",
    negativePrompt:
      source.TRYON_NEGATIVE_PROMPT ||
      TRYON_NEGATIVE_PROMPT,
    timeoutMs,
    referenceStrength: Number(
      source.IMAGE_PROVIDER_REFERENCE_STRENGTH || DEFAULT_REFERENCE_STRENGTH
    ),
  };
}

function normalizeProvider(provider) {
  return String(provider || "").toLowerCase();
}

function createProviderError(code, message, retryable, details) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable !== false;
  if (details) {
    error.details = details;
  }
  return error;
}

function createImageFileId(reportId, recommendation, kind) {
  return `cloud://tryon/${reportId}/${recommendation.rank}-${recommendation.lipstickId}-${kind}.jpg`;
}

function createMockProvider(config) {
  return {
    async generate(input) {
      if (config.provider === "mock-fail") {
        const error = new Error("Mock provider failed");
        error.code = "IMAGE_PROVIDER_FAILED";
        error.retryable = true;
        throw error;
      }

      if (config.provider !== "mock") {
        const error = new Error(
          `Provider ${config.provider} is not implemented in code yet`
        );
        error.code = "IMAGE_PROVIDER_NOT_CONFIGURED";
        error.retryable = false;
        throw error;
      }

      const previewImages = input.recommendations.map((recommendation) =>
        createImageFileId(input.reportId, recommendation, "watermark")
      );
      const paidImages = input.recommendations.map((recommendation) =>
        createImageFileId(input.reportId, recommendation, "clean")
      );
      const prompts = buildTryOnPrompts(input.recommendations, config);

      return {
        done: true,
        job: null,
        generated: {
          provider: config.provider,
          model: config.model,
          promptVersion: config.promptVersion,
          prompts,
          previewImages,
          paidImages,
          imageFileIds: [...previewImages, ...paidImages],
        },
      };
    },
  };
}

function ensureJimengCredentials(config) {
  if (!config.jimeng.accessKeyId || !config.jimeng.secretAccessKey) {
    throw createProviderError(
      "JIMENG_CREDENTIALS_REQUIRED",
      "JIMENG_ACCESS_KEY_ID and JIMENG_SECRET_ACCESS_KEY are required",
      false
    );
  }
}

function createImageProvider(config, runtime) {
  if (normalizeProvider(config.provider) === "jimeng") {
    return createJimengProvider({
      runtime,
      config,
      buildTryOnPrompts,
      ensureJimengCredentials,
      callJimengApi,
      resolveTaskId,
      resolveImageUrls,
      resolveTaskStatus,
      createJimengResponseDiagnostic,
      createJimengTaskCheckSummary,
      createProviderError,
      assertJimengTaskFresh,
      previewWatermarkText: PREVIEW_WATERMARK_TEXT,
    });
  }

  return createMockProvider(config);
}

function inspectSelfie(checks) {
  const normalized = checks || {};
  const reasons = [];

  if (normalized.contentSafe === false) {
    reasons.push("content_unsafe");
  }

  if (normalized.faceDetected === false) {
    reasons.push("face_missing");
  }

  if (normalized.lipsVisible === false) {
    reasons.push("lips_not_visible");
  }

  if (Number(normalized.blurScore || 0) > 0.7) {
    reasons.push("image_blurry");
  }

  if (Number(normalized.occlusionScore || 0) > 0.6) {
    reasons.push("face_occluded");
  }

  return {
    passed: reasons.length === 0,
    reasons,
    safetyStatus: reasons.includes("content_unsafe") ? "rejected" : "passed",
    qualityStatus: reasons.length > (reasons.includes("content_unsafe") ? 1 : 0) ? "rejected" : "passed",
  };
}

async function uploadSelfie(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.tempFileID) {
    return fail("INVALID_PAYLOAD", "tempFileID is required");
  }

  const inspection = inspectSelfie(data.checks);

  if (!inspection.passed) {
    await runtime.deleteFile(data.tempFileID).catch(() => null);
    return fail("SELFIE_REJECTED", "Selfie did not pass safety or quality checks", {
      reasons: inspection.reasons,
      safetyStatus: inspection.safetyStatus,
      qualityStatus: inspection.qualityStatus,
    });
  }

  const nowDate = runtime.now();
  const now = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + ONE_DAY_MS).toISOString();
  const testId = data.testId || runtime.id();
  const privatePath = `selfies/${openid}/${testId}/original.jpg`;
  const moved = await runtime.moveFile({
    from: data.tempFileID,
    to: privatePath,
  });
  const selfieFileId = moved.fileID;

  const testRecord = {
    _id: testId,
    openid,
    status: "selfie_uploaded",
    selfieFileId,
    safetyStatus: inspection.safetyStatus,
    qualityStatus: inspection.qualityStatus,
    generationStatus: "pending",
    previewRegenerateCount: 0,
    maxPreviewRegenerateCount: 3,
    activeReportId: "",
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  await runtime.db.collection("try_on_tests").add({
    data: testRecord,
  });

  await runtime.db.collection("events").add({
    data: {
      type: "upload_selfie_success",
      openid,
      testId,
      selfieFileId,
      createdAt: now,
    },
  });

  return ok({
    testId,
    selfieFileId,
    safetyStatus: inspection.safetyStatus,
    qualityStatus: inspection.qualityStatus,
    expiresAt,
  });
}

async function submitPreferences(event, deps) {
  const data = (event && event.data) || {};
  const preferences = validatePreferences(data);
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!preferences) {
    return fail("INVALID_PAYLOAD", "testId and complete preferences are required");
  }

  const now = runtime.now().toISOString();
  const lipsticksResult = await runtime.db
    .collection("lipsticks")
    .where({ status: "active" })
    .get();
  const recommendations = rankLipsticks(
    lipsticksResult.data || [],
    preferences,
    RECOMMENDATION_LIMIT
  );

  if (recommendations.length < RECOMMENDATION_LIMIT) {
    return fail("RECOMMENDATION_NOT_ENOUGH", "Not enough active lipsticks matched preferences", {
      recommendations,
    });
  }

  const reportPayload = {
    openid,
    testId: data.testId,
    version: 1,
    status: "active",
    snapshot: {
      preferences,
      recommendations,
      generatedAt: now,
    },
    previewImages: [],
    paidImages: [],
    shareCardImages: [],
    replacedByReportId: "",
    unlockedAt: "",
    expiresAt: "",
    deletedAt: "",
    createdAt: now,
  };
  const report = await runtime.db.collection("reports").add({
    data: reportPayload,
  });
  const reportId = report._id;

  await runtime.db.collection("try_on_tests").doc(data.testId).update({
    data: {
      preferences,
      status: "preferences_submitted",
      generationStatus: "recommendation_ready",
      activeReportId: reportId,
      updatedAt: now,
    },
  });

  await runtime.db.collection("events").add({
    data: {
      type: "preference_submit",
      openid,
      testId: data.testId,
      reportId,
      preferences,
      createdAt: now,
    },
  });

  return ok({
    testId: data.testId,
    reportId,
    recommendations,
  });
}

async function deleteSelfie(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.testId) {
    return fail("INVALID_PAYLOAD", "testId is required");
  }

  const testResult = await runtime.db.collection("try_on_tests").doc(data.testId).get();
  const testRecord = testResult.data || {};

  if (!testRecord._id || testRecord.openid !== openid) {
    return fail("RESOURCE_NOT_FOUND", "Test does not belong to current user");
  }

  const now = runtime.now().toISOString();
  if (testRecord.selfieFileId) {
    await runtime.deleteFile(testRecord.selfieFileId).catch(() => null);
  }

  await runtime.db.collection("try_on_tests").doc(data.testId).update({
    data: {
      selfieFileId: "",
      updatedAt: now,
    },
  });

  await runtime.db.collection("events").add({
    data: {
      type: "delete_selfie",
      openid,
      testId: data.testId,
      createdAt: now,
    },
  });

  return ok({
    testId: data.testId,
    selfieDeleted: true,
  });
}

async function generateTryOnImages(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const ownedResult = await loadOwnedTestAndReport({
    runtime,
    data,
    resourceMessage: "Test or report does not belong to current user",
    requireOpenId,
    fail,
    ok,
  });

  if (ownedResult.code !== 0) {
    return ownedResult;
  }

  const config = getProviderConfig(runtime.env);
  const retryIndex = Number(data.retryIndex || 0);
  const startedAt = Date.now();
  const now = runtime.now().toISOString();
  const openid = ownedResult.data.openid;
  const testRecord = ownedResult.data.testRecord;
  const reportRecord = ownedResult.data.reportRecord;

  const recommendations =
    (reportRecord.snapshot && reportRecord.snapshot.recommendations) || [];

  if (recommendations.length !== IMAGE_COUNT) {
    return fail("INVALID_REPORT_SNAPSHOT", "Report snapshot must contain three recommendations");
  }

  const provider = createImageProvider(config, runtime);

  try {
    const generated = await provider.generate({
      testId: data.testId,
      reportId: data.reportId,
      selfieFileId: testRecord.selfieFileId,
      recommendations,
      prompt: config.prompt,
      negativePrompt: config.negativePrompt,
      timeoutMs: config.timeoutMs,
      existingJob: reportRecord.generationJob || null,
    });
    const durationMs = runtime.durationMs(startedAt);

    if (!generated.done) {
      return handleGenerateTryOnPending({
        runtime,
        data,
        config,
        generated,
        now,
        ok,
      });
    }

    return handleGenerateTryOnSuccess({
      runtime,
      data,
      config,
      generated,
      now,
      openid,
      retryIndex,
      durationMs,
      recordProviderRun,
      recordGenerationEvent,
      ok,
    });
  } catch (error) {
    const durationMs = runtime.durationMs(startedAt);
    return handleGenerateTryOnFailure({
      runtime,
      data,
      config,
      reportRecord,
      now,
      openid,
      retryIndex,
      durationMs,
      error,
      recordProviderRun,
      recordGenerationEvent,
      fail,
    });
  }
}

async function regeneratePreview(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const ownedResult = await loadOwnedTestAndReport({
    runtime,
    data,
    resourceMessage: "Active preview does not belong to current user",
    requireOpenId,
    fail,
    ok,
  });

  if (ownedResult.code !== 0) {
    return ownedResult;
  }

  const now = runtime.now().toISOString();
  const openid = ownedResult.data.openid;
  const testRecord = ownedResult.data.testRecord;
  const oldReport = ownedResult.data.reportRecord;
  const pendingReportId =
    data.pendingReportId || testRecord.pendingRegenerateReportId || "";

  const invalidActivePreview = validateActivePreviewState({
    data,
    openid,
    testRecord,
    oldReport,
    fail,
  });
  if (invalidActivePreview) {
    return invalidActivePreview;
  }

  const regenerateCount = Number(testRecord.previewRegenerateCount || 0);
  const maxRegenerateCount = Number(testRecord.maxPreviewRegenerateCount || 3);
  const config = getProviderConfig(runtime.env);

  if (regenerateCount >= maxRegenerateCount) {
    return handlePreviewLimitReached({
      runtime,
      data,
      now,
      openid,
      regenerateCount,
      maxRegenerateCount,
      recordGenerationEvent,
      fail,
    });
  }

  if (pendingReportId) {
    const pendingReport = await loadPendingRegenerateReport({
      runtime,
      pendingReportId,
      openid,
      data,
      fail,
    });
    if (pendingReport && pendingReport.code) {
      return pendingReport;
    }

    const generated = await createImageProvider(config, runtime).generate(
      buildProviderGenerateInput({
        data,
        reportId: pendingReportId,
        selfieFileId: testRecord.selfieFileId,
        recommendations: getPendingRecommendations(pendingReport),
        config,
        existingJob: pendingReport.generationJob,
      })
    );

    if (!generated.done) {
      return handlePreviewContinuationPending({
        runtime,
        data,
        pendingReportId,
        generated,
        now,
        regenerateCount,
        maxRegenerateCount,
        ok,
      });
    }

    return await finishRegeneratedPreview(runtime, {
      activeReportId: pendingReportId,
      generated,
      maxRegenerateCount,
      newReportId: pendingReportId,
      now,
      oldReportId: data.reportId,
      openid,
      regenerateCount,
      testId: data.testId,
      recordGenerationEvent,
      ok,
    });
  }

  const preferences = resolvePreviewPreferences(oldReport, testRecord);

  if (!preferences) {
    return fail("INVALID_REPORT_SNAPSHOT", "Report snapshot preferences are required");
  }

  const recommendations = await loadReplacementRecommendations({
    runtime,
    oldReport,
    preferences,
    recommendationLimit: RECOMMENDATION_LIMIT,
  });

  if (recommendations.length < RECOMMENDATION_LIMIT) {
    return handlePreviewRecommendationShortage({
      runtime,
      data,
      now,
      openid,
      recommendations,
      regenerateCount,
      maxRegenerateCount,
      recordGenerationEvent,
      fail,
    });
  }

  const nextVersion = Number(oldReport.version || 1) + 1;
  const newReportId = runtime.id();
  const provider = createImageProvider(config, runtime);
  const startedAt = Date.now();
  let generated;

  try {
    generated = await provider.generate(
      buildProviderGenerateInput({
        data,
        reportId: newReportId,
        selfieFileId: testRecord.selfieFileId,
        recommendations,
        config,
        existingJob: null,
      })
    );
  } catch (error) {
    const durationMs = runtime.durationMs(startedAt);
    return handlePreviewProviderFailure({
      runtime,
      data,
      config,
      newReportId,
      now,
      openid,
      regenerateCount,
      maxRegenerateCount,
      durationMs,
      error,
      recordProviderRun,
      recordGenerationEvent,
      fail,
    });
  }

  if (!generated.done) {
    await persistPendingRegenerateReport(runtime, {
      newReportId,
      openid,
      testId: data.testId,
      previousReportId: data.reportId,
      version: nextVersion,
      preferences,
      recommendations,
      now,
      generationJob: generated.job,
    });

    return handlePreviewNewPending({
      data,
      newReportId,
      generated,
      regenerateCount,
      maxRegenerateCount,
      ok,
    });
  }

  const durationMs = runtime.durationMs(startedAt);
  return handlePreviewProviderSuccess({
    runtime,
    data,
    config,
    generated,
    newReportId,
    now,
    openid,
    regenerateCount,
    durationMs,
    persistCompletedRegenerateReport,
    finishRegeneratedPreview,
    recordProviderRun,
    recordGenerationEvent,
    ok,
    maxRegenerateCount,
    preferences,
    recommendations,
    oldReport,
  });
}

async function main(event, context, deps) {
  const action = event && event.action;

  if (action === "createTest") {
    return ok({ status: "draft" });
  }

  if (action === "uploadSelfie") {
    return await uploadSelfie(event, deps);
  }

  if (action === "submitPreferences") {
    return await submitPreferences(event, deps);
  }

  if (action === "regeneratePreview") {
    return await regeneratePreview(event, deps);
  }

  if (action === "generateTryOnImages") {
    return await generateTryOnImages(event, deps);
  }

  if (action === "deleteSelfie") {
    return await deleteSelfie(event, deps);
  }

  return unsupported(action);
}

exports.main = main;
exports.uploadSelfie = uploadSelfie;
exports.submitPreferences = submitPreferences;
exports.regeneratePreview = regeneratePreview;
exports.generateTryOnImages = generateTryOnImages;
exports.deleteSelfie = deleteSelfie;
exports.inspectSelfie = inspectSelfie;
exports.rankLipsticks = rankLipsticks;
exports.getProviderConfig = getProviderConfig;
exports.buildTryOnPrompts = buildTryOnPrompts;
