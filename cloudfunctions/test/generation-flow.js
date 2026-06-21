function buildProviderRunPayload(params) {
  return {
    testId: params.testId,
    reportId: params.reportId,
    openid: params.openid,
    provider: params.provider,
    model: params.model,
    promptVersion: params.promptVersion,
    status: params.status,
    durationMs: params.durationMs,
    retryIndex: params.retryIndex,
    timeoutMs: params.timeoutMs,
    errorCode: params.errorCode || "",
    errorMessage: params.errorMessage || "",
    errorDetails: params.errorDetails || null,
    prompts: params.prompts || [],
    imageFileIds: params.imageFileIds || [],
    createdAt: params.createdAt,
  };
}

async function updateGenerationStatus(runtime, params) {
  const {
    testId,
    reportId,
    status,
    now,
    errorCode,
    errorMessage,
    generationJob,
    previewImages,
    paidImages,
    reportStatus,
  } = params;

  const reportData = {
    generationStatus: status,
    generationErrorCode: errorCode || "",
    generationErrorMessage: errorMessage || "",
    updatedAt: now,
  };

  if (generationJob !== undefined) {
    reportData.generationJob = generationJob;
  }

  if (previewImages !== undefined) {
    reportData.previewImages = previewImages;
  }

  if (paidImages !== undefined) {
    reportData.paidImages = paidImages;
  }

  if (reportStatus) {
    reportData.status = reportStatus;
  }

  await runtime.db.collection("reports").doc(reportId).update({
    data: reportData,
  });

  await runtime.db.collection("try_on_tests").doc(testId).update({
    data: {
      generationStatus: status,
      generationErrorCode: errorCode || "",
      updatedAt: now,
    },
  });
}

async function finishRegeneratedPreview(runtime, params) {
  const {
    activeReportId,
    generated,
    maxRegenerateCount,
    newReportId,
    now,
    oldReportId,
    openid,
    regenerateCount,
    testId,
    recordGenerationEvent,
    ok,
  } = params;
  const nextRegenerateCount = regenerateCount + 1;

  await runtime.db.collection("reports").doc(newReportId).update({
    data: {
      status: "active",
      generationStatus: "success",
      generationErrorCode: "",
      generationErrorMessage: "",
      generationJob: null,
      previewImages: generated.generated.previewImages,
      paidImages: generated.generated.paidImages,
      updatedAt: now,
    },
  });

  await runtime.db.collection("reports").doc(oldReportId).update({
    data: {
      status: "replaced",
      replacedByReportId: activeReportId,
      updatedAt: now,
    },
  });

  await runtime.db.collection("try_on_tests").doc(testId).update({
    data: {
      activeReportId,
      pendingRegenerateReportId: "",
      previewRegenerateCount: nextRegenerateCount,
      generationStatus: "success",
      updatedAt: now,
    },
  });

  await recordGenerationEvent(runtime, {
    type: "preview_regenerate_success",
    openid,
    testId,
    reportId: activeReportId,
    previousReportId: oldReportId,
    previewRegenerateCount: nextRegenerateCount,
    createdAt: now,
  });

  return ok({
    testId,
    reportId: activeReportId,
    previousReportId: oldReportId,
    previewRegenerateCount: nextRegenerateCount,
    maxPreviewRegenerateCount: maxRegenerateCount,
    remainingRegenerateCount: Math.max(0, maxRegenerateCount - nextRegenerateCount),
    previewImages: generated.generated.previewImages,
    paidImages: generated.generated.paidImages,
  });
}

module.exports = {
  buildProviderRunPayload,
  updateGenerationStatus,
  finishRegeneratedPreview,
};
