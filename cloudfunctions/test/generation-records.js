async function recordProviderRun(runtime, payload) {
  await runtime.db.collection("provider_runs").add({
    data: payload,
  });
}

async function recordGenerationEvent(runtime, payload) {
  await runtime.db.collection("events").add({
    data: payload,
  });
}

async function loadOwnedTestAndReport(params) {
  const { runtime, data, resourceMessage, requireOpenId, fail, ok } = params;
  const openid = requireOpenId(runtime);

  if (typeof openid !== "string") {
    return openid;
  }

  if (!data.testId || !data.reportId) {
    return fail("INVALID_PAYLOAD", "testId and reportId are required");
  }

  const testResult = await runtime.db.collection("try_on_tests").doc(data.testId).get();
  const reportResult = await runtime.db.collection("reports").doc(data.reportId).get();
  const testRecord = testResult.data || {};
  const reportRecord = reportResult.data || {};

  if (testRecord.openid !== openid || reportRecord.openid !== openid) {
    return fail(
      "RESOURCE_NOT_FOUND",
      resourceMessage || "Test or report does not belong to current user"
    );
  }

  return ok({
    openid,
    testRecord,
    reportRecord,
  });
}

function buildPendingReportPayload(params) {
  const {
    newReportId,
    openid,
    testId,
    previousReportId,
    version,
    preferences,
    recommendations,
    now,
    generationJob,
  } = params;

  return {
    _id: newReportId,
    openid,
    testId,
    previousReportId,
    version,
    status: "regenerating",
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
    generationStatus: "generating",
    generationJob,
  };
}

function buildCompletedReportPayload(params) {
  const {
    newReportId,
    openid,
    testId,
    version,
    preferences,
    recommendations,
    now,
    previewImages,
    paidImages,
  } = params;

  return {
    _id: newReportId,
    openid,
    testId,
    version,
    status: "active",
    snapshot: {
      preferences,
      recommendations,
      generatedAt: now,
    },
    shareCardImages: [],
    replacedByReportId: "",
    unlockedAt: "",
    expiresAt: "",
    deletedAt: "",
    createdAt: now,
    generationStatus: "success",
    generationErrorCode: "",
    generationErrorMessage: "",
    previewImages,
    paidImages,
  };
}

async function persistPendingRegenerateReport(runtime, params) {
  const pendingReportPayload = buildPendingReportPayload(params);

  await runtime.db.collection("reports").add({
    data: pendingReportPayload,
  });
  await runtime.db.collection("try_on_tests").doc(params.testId).update({
    data: {
      pendingRegenerateReportId: params.newReportId,
      generationStatus: "regenerating",
      updatedAt: params.now,
    },
  });
}

async function persistCompletedRegenerateReport(runtime, params) {
  const newReportPayload = buildCompletedReportPayload(params);
  const created = await runtime.db.collection("reports").add({
    data: newReportPayload,
  });

  return created._id || params.newReportId;
}

module.exports = {
  recordProviderRun,
  recordGenerationEvent,
  loadOwnedTestAndReport,
  buildPendingReportPayload,
  buildCompletedReportPayload,
  persistPendingRegenerateReport,
  persistCompletedRegenerateReport,
};
