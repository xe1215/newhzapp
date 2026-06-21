const { rankLipsticksExcluding, collectUsedLipstickIds } = require("./recommendation");

function validateActivePreviewState(params) {
  const { data, openid, testRecord, oldReport, fail } = params;

  if (
    testRecord.openid !== openid ||
    oldReport.openid !== openid ||
    oldReport.testId !== data.testId ||
    testRecord.activeReportId !== data.reportId ||
    oldReport.status !== "active"
  ) {
    return fail("RESOURCE_NOT_FOUND", "Active preview does not belong to current user");
  }

  return null;
}

async function loadPendingRegenerateReport(params) {
  const { runtime, pendingReportId, openid, data, fail } = params;
  const pendingReportResult = await runtime.db
    .collection("reports")
    .doc(pendingReportId)
    .get();
  const pendingReport = pendingReportResult.data || {};

  if (
    pendingReport.openid !== openid ||
    pendingReport.testId !== data.testId ||
    pendingReport.previousReportId !== data.reportId ||
    pendingReport.status !== "regenerating"
  ) {
    return fail("RESOURCE_NOT_FOUND", "Pending preview regenerate report is invalid");
  }

  return pendingReport;
}

function getPendingRecommendations(pendingReport) {
  return pendingReport.snapshot && Array.isArray(pendingReport.snapshot.recommendations)
    ? pendingReport.snapshot.recommendations
    : [];
}

function resolvePreviewPreferences(oldReport, testRecord) {
  return (oldReport.snapshot && oldReport.snapshot.preferences) || testRecord.preferences || null;
}

async function loadReplacementRecommendations(params) {
  const { runtime, oldReport, preferences, recommendationLimit } = params;
  const lipsticksResult = await runtime.db
    .collection("lipsticks")
    .where({ status: "active" })
    .get();
  const usedLipstickIds = collectUsedLipstickIds(oldReport);

  return rankLipsticksExcluding(
    lipsticksResult.data || [],
    preferences,
    usedLipstickIds,
    recommendationLimit
  );
}

function buildProviderGenerateInput(params) {
  const {
    data,
    reportId,
    selfieFileId,
    recommendations,
    config,
    existingJob,
  } = params;

  return {
    testId: data.testId,
    reportId,
    selfieFileId,
    recommendations,
    prompt: config.prompt,
    negativePrompt: config.negativePrompt,
    timeoutMs: config.timeoutMs,
    existingJob: existingJob || null,
  };
}

module.exports = {
  validateActivePreviewState,
  loadPendingRegenerateReport,
  getPendingRecommendations,
  resolvePreviewPreferences,
  loadReplacementRecommendations,
  buildProviderGenerateInput,
};
