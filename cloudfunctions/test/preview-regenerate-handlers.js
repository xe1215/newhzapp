async function handlePreviewLimitReached(params) {
  const {
    runtime,
    data,
    now,
    openid,
    regenerateCount,
    maxRegenerateCount,
    recordGenerationEvent,
    fail,
  } = params;

  await recordGenerationEvent(runtime, {
    type: "preview_regenerate_limit_reached",
    openid,
    testId: data.testId,
    reportId: data.reportId,
    createdAt: now,
  });

  return fail("PREVIEW_REGENERATE_LIMIT_REACHED", "Preview regenerate limit reached", {
    previewRegenerateCount: regenerateCount,
    maxPreviewRegenerateCount: maxRegenerateCount,
    remainingRegenerateCount: 0,
  });
}

async function handlePreviewRecommendationShortage(params) {
  const {
    runtime,
    data,
    now,
    openid,
    recommendations,
    regenerateCount,
    maxRegenerateCount,
    recordGenerationEvent,
    fail,
  } = params;

  await recordGenerationEvent(runtime, {
    type: "preview_regenerate_fail",
    openid,
    testId: data.testId,
    reportId: data.reportId,
    errorCode: "RECOMMENDATION_NOT_ENOUGH",
    createdAt: now,
  });

  return fail("RECOMMENDATION_NOT_ENOUGH", "Not enough active lipsticks matched preferences", {
    recommendations,
    previewRegenerateCount: regenerateCount,
    maxPreviewRegenerateCount: maxRegenerateCount,
  });
}

async function handlePreviewContinuationPending(params) {
  const {
    runtime,
    data,
    pendingReportId,
    generated,
    now,
    regenerateCount,
    maxRegenerateCount,
    ok,
  } = params;

  await runtime.db.collection("reports").doc(pendingReportId).update({
    data: {
      generationStatus: "generating",
      generationJob: generated.job,
      updatedAt: now,
    },
  });
  await runtime.db.collection("try_on_tests").doc(data.testId).update({
    data: {
      pendingRegenerateReportId: pendingReportId,
      generationStatus: "regenerating",
      updatedAt: now,
    },
  });

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    pendingReportId,
    status: "generating",
    completedCount: generated.progress.completedCount,
    totalCount: generated.progress.totalCount,
    previewRegenerateCount: regenerateCount,
    maxPreviewRegenerateCount: maxRegenerateCount,
    remainingRegenerateCount: Math.max(0, maxRegenerateCount - regenerateCount),
  });
}

async function handlePreviewNewPending(params) {
  const {
    data,
    newReportId,
    generated,
    regenerateCount,
    maxRegenerateCount,
    ok,
  } = params;

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    pendingReportId: newReportId,
    status: "generating",
    completedCount: generated.progress.completedCount,
    totalCount: generated.progress.totalCount,
    previewRegenerateCount: regenerateCount,
    maxPreviewRegenerateCount: maxRegenerateCount,
    remainingRegenerateCount: Math.max(0, maxRegenerateCount - regenerateCount),
  });
}

async function handlePreviewProviderFailure(params) {
  const {
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
  } = params;
  const errorCode = error.code || "IMAGE_PROVIDER_FAILED";
  const errorMessage = error.message || "Image provider failed";

  await recordProviderRun(runtime, {
    testId: data.testId,
    reportId: newReportId,
    openid,
    provider: config.provider,
    model: config.model,
    promptVersion: config.promptVersion,
    status: "failed",
    durationMs,
    retryIndex: regenerateCount + 1,
    timeoutMs: config.timeoutMs,
    errorCode,
    errorMessage,
    errorDetails: error.details || null,
    prompts: [],
    imageFileIds: [],
    createdAt: now,
  });

  await recordGenerationEvent(runtime, {
    type: "preview_regenerate_fail",
    openid,
    testId: data.testId,
    reportId: data.reportId,
    attemptedReportId: newReportId,
    errorCode,
    errorMessage,
    createdAt: now,
  });

  return fail(errorCode, errorMessage, {
    retryable: error.retryable !== false,
    previewRegenerateCount: regenerateCount,
    maxPreviewRegenerateCount: maxRegenerateCount,
  });
}

async function handlePreviewProviderSuccess(params) {
  const {
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
  } = params;

  await recordProviderRun(runtime, {
    testId: data.testId,
    reportId: newReportId,
    openid,
    provider: generated.generated.provider,
    model: generated.generated.model,
    promptVersion: generated.generated.promptVersion,
    status: "success",
    durationMs,
    retryIndex: regenerateCount + 1,
    timeoutMs: config.timeoutMs,
    errorCode: "",
    errorMessage: "",
    prompts: generated.generated.prompts,
    imageFileIds: generated.generated.imageFileIds,
    createdAt: now,
  });

  const activeReportId = await persistCompletedRegenerateReport(runtime, {
    newReportId,
    openid,
    testId: data.testId,
    version: Number(oldReport.version || 1) + 1,
    preferences,
    recommendations,
    now,
    previewImages: generated.generated.previewImages,
    paidImages: generated.generated.paidImages,
  });

  return finishRegeneratedPreview(runtime, {
    activeReportId,
    generated,
    maxRegenerateCount,
    newReportId: activeReportId,
    now,
    oldReportId: data.reportId,
    openid,
    regenerateCount,
    testId: data.testId,
    recordGenerationEvent,
    ok,
  });
}

module.exports = {
  handlePreviewLimitReached,
  handlePreviewRecommendationShortage,
  handlePreviewContinuationPending,
  handlePreviewNewPending,
  handlePreviewProviderFailure,
  handlePreviewProviderSuccess,
};
