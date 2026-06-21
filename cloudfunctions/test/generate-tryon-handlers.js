const { buildProviderRunPayload, updateGenerationStatus } = require("./generation-flow");

async function handleGenerateTryOnPending(params) {
  const { runtime, data, config, generated, now, ok } = params;

  await updateGenerationStatus(runtime, {
    testId: data.testId,
    reportId: data.reportId,
    status: "generating",
    now,
    generationJob: generated.job,
  });

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    provider: config.provider,
    status: generated.progress.status,
    completedCount: generated.progress.completedCount,
    totalCount: generated.progress.totalCount,
  });
}

async function handleGenerateTryOnSuccess(params) {
  const {
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
  } = params;

  await updateGenerationStatus(runtime, {
    testId: data.testId,
    reportId: data.reportId,
    status: "success",
    now,
    generationJob: null,
    previewImages: generated.generated.previewImages,
    paidImages: generated.generated.paidImages,
  });

  await recordProviderRun(
    runtime,
    buildProviderRunPayload({
      testId: data.testId,
      reportId: data.reportId,
      openid,
      provider: generated.generated.provider,
      model: generated.generated.model,
      promptVersion: generated.generated.promptVersion,
      status: "success",
      durationMs,
      retryIndex,
      timeoutMs: config.timeoutMs,
      prompts: generated.generated.prompts,
      imageFileIds: generated.generated.imageFileIds,
      createdAt: now,
    })
  );

  await recordGenerationEvent(runtime, {
    type: "generation_success",
    openid,
    testId: data.testId,
    reportId: data.reportId,
    provider: generated.generated.provider,
    imageFileIds: generated.generated.imageFileIds,
    createdAt: now,
  });

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    provider: generated.generated.provider,
    status: "success",
    previewImages: generated.generated.previewImages,
    paidImages: generated.generated.paidImages,
  });
}

async function handleGenerateTryOnFailure(params) {
  const {
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
  } = params;
  const errorCode = error.code || "IMAGE_PROVIDER_FAILED";
  const errorMessage = error.message || "Image provider failed";
  const retryable = error.retryable !== false;

  await updateGenerationStatus(runtime, {
    testId: data.testId,
    reportId: data.reportId,
    status: "failed",
    now,
    errorCode,
    errorMessage,
    generationJob: reportRecord.generationJob || null,
  });

  await recordProviderRun(
    runtime,
    buildProviderRunPayload({
      testId: data.testId,
      reportId: data.reportId,
      openid,
      provider: config.provider,
      model: config.model,
      promptVersion: config.promptVersion,
      status: "failed",
      durationMs,
      retryIndex,
      timeoutMs: config.timeoutMs,
      errorCode,
      errorMessage,
      errorDetails: error.details || null,
      createdAt: now,
    })
  );

  await recordGenerationEvent(runtime, {
    type: "generation_fail",
    openid,
    testId: data.testId,
    reportId: data.reportId,
    provider: config.provider,
    errorCode,
    errorMessage,
    retryable,
    createdAt: now,
  });

  return fail(errorCode, errorMessage, {
    retryable,
    retryIndex,
  });
}

module.exports = {
  handleGenerateTryOnPending,
  handleGenerateTryOnSuccess,
  handleGenerateTryOnFailure,
};
