const {
  cloud,
  getRuntime,
  ok,
  fail,
  unsupported,
  getEventData,
  requireOpenId,
} = require("./report-core");
const {
  getOwnedReport: loadOwnedReport,
  listUnlockedReports: loadUnlockedReports,
  recordReportView: addReportViewEvent,
  hideOwnedReport: markReportHidden,
} = require("./report-records");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

async function hydrateProductSnapshots(runtime, snapshot) {
  const recommendations = Array.isArray(snapshot.recommendations)
    ? snapshot.recommendations
    : [];
  const missingIds = recommendations
    .filter((item) => item && !item.productImage && item.lipstickId)
    .map((item) => item.lipstickId);

  if (!missingIds.length) {
    return snapshot;
  }

  const records = await Promise.all(missingIds.map((id) =>
    runtime.db.collection("lipsticks").doc(id).get().then((result) => result.data || {}).catch(() => ({}))
  ));
  const byId = new Map(records.map((item) => [String(item._id), item]));

  return Object.assign({}, snapshot, {
    recommendations: recommendations.map((item) => {
      const product = byId.get(String(item.lipstickId));
      if (!product || item.productImage) {
        return item;
      }
      return Object.assign({}, item, {
        productName: item.productName || product.productName || product.shadeName || "",
        productImage: product.productImage || "",
      });
    }),
  });
}

async function getPreview(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const ownedReportResult = await loadOwnedReport({
    data,
    runtime,
    requireOpenId,
    fail,
    ok,
  });

  if (ownedReportResult.code !== 0) {
    return ownedReportResult;
  }

  const report = ownedReportResult.data.report;

  const previewImages = Array.isArray(report.previewImages) ? report.previewImages : [];
  const testResult = await runtime.db.collection("try_on_tests").doc(data.testId).get();
  const testRecord = testResult.data || {};
  const previewRegenerateCount = Number(testRecord.previewRegenerateCount || 0);
  const maxPreviewRegenerateCount = Number(testRecord.maxPreviewRegenerateCount || 3);

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    status: report.status || "active",
    generationStatus: report.generationStatus || "",
    locked: !report.unlockedAt,
    previewImages,
    previewRegenerateCount,
    maxPreviewRegenerateCount,
    remainingRegenerateCount: Math.max(
      0,
      maxPreviewRegenerateCount - previewRegenerateCount
    ),
  });
}

async function getReport(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const ownedReportResult = await loadOwnedReport({
    data,
    runtime,
    requireOpenId,
    fail,
    ok,
  });

  if (ownedReportResult.code !== 0) {
    return ownedReportResult;
  }

  const openid = ownedReportResult.data.openid;
  const report = ownedReportResult.data.report;

  const paidImages = Array.isArray(report.paidImages) ? report.paidImages : [];
  const testResult = await runtime.db.collection("try_on_tests").doc(data.testId).get();
  const testRecord = testResult.data || {};
  const locked = !report.unlockedAt;

  if (locked) {
    return fail("REPORT_LOCKED", "Report is still locked", {
      testId: data.testId,
      reportId: data.reportId,
      locked: true,
    });
  }

  await addReportViewEvent(runtime, {
    openid,
    testId: data.testId,
    reportId: data.reportId,
    createdAt: runtime.now().toISOString(),
  });

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    status: report.status || "active",
    locked: false,
    paidImages,
    selfieFileId: testRecord.openid === openid ? testRecord.selfieFileId || "" : "",
    originalDeletedAt: report.originalDeletedAt || "",
    snapshot: await hydrateProductSnapshots(runtime, report.snapshot || {}),
    unlockedAt: report.unlockedAt,
  });
}

async function listMyReports(event, deps) {
  const runtime = getRuntime(deps);
  const openid = requireOpenId(runtime);

  if (typeof openid !== "string") {
    return openid;
  }

  const reports = await loadUnlockedReports(runtime, openid);

  return ok({
    reports,
  });
}

async function hideReport(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const openid = requireOpenId(runtime);

  if (typeof openid !== "string") {
    return openid;
  }

  if (!data.reportId) {
    return fail("INVALID_PAYLOAD", "reportId is required");
  }

  const reportResult = await runtime.db.collection("reports").doc(data.reportId).get();
  const report = reportResult.data || {};

  if (!report._id || report.openid !== openid || report.deletedAt) {
    return fail("RESOURCE_NOT_FOUND", "Report does not belong to current user");
  }

  if (!report.unlockedAt) {
    return fail("REPORT_LOCKED", "Only unlocked reports can be hidden");
  }

  const now = runtime.now().toISOString();

  await markReportHidden(runtime, data.reportId, now);

  return ok({
    reportId: data.reportId,
    hidden: true,
    deletedAt: now,
  });
}

async function main(event, context, deps) {
  const action = event && event.action;

  if (action === "getPreview") {
    return await getPreview(event, deps);
  }

  if (action === "getReport") {
    return await getReport(event, deps);
  }

  if (action === "listMyReports") {
    return await listMyReports(event, deps);
  }

  if (action === "hideReport") {
    return await hideReport(event, deps);
  }

  return unsupported(action);
}

exports.main = main;
exports.getPreview = getPreview;
exports.getReport = getReport;
exports.listMyReports = listMyReports;
exports.hideReport = hideReport;
