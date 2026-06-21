function getSnapshotRecommendations(report) {
  return report.snapshot && Array.isArray(report.snapshot.recommendations)
    ? report.snapshot.recommendations
    : [];
}

function getFirstPaidImage(report) {
  return Array.isArray(report.paidImages) && report.paidImages.length ? report.paidImages[0] : "";
}

function getStringField(value, fallback) {
  return typeof value === "string" && value ? value : fallback;
}

async function getOwnedReport(params) {
  const { data, runtime, requireOpenId, fail, ok } = params;
  const openid = requireOpenId(runtime);

  if (typeof openid !== "string") {
    return openid;
  }

  if (!data.testId || !data.reportId) {
    return fail("INVALID_PAYLOAD", "testId and reportId are required");
  }

  const reportResult = await runtime.db.collection("reports").doc(data.reportId).get();
  const report = reportResult.data || {};

  if (!report._id || report.openid !== openid || report.testId !== data.testId || report.deletedAt) {
    return fail("RESOURCE_NOT_FOUND", "Report does not belong to current user");
  }

  return ok({
    openid,
    report,
  });
}

function getLeadRecommendation(report) {
  return getSnapshotRecommendations(report)[0] || {};
}

function mapReportListItem(report) {
  const lead = getLeadRecommendation(report);

  return {
    reportId: report._id,
    testId: getStringField(report.testId, ""),
    version: Number(report.version || 1),
    status: getStringField(report.status, "active"),
    locked: !report.unlockedAt,
    unlockedAt: getStringField(report.unlockedAt, ""),
    coverImage: getFirstPaidImage(report),
    shadeName: getStringField(lead.shadeName, ""),
    shadeCode: getStringField(lead.shadeCode, ""),
    brand: getStringField(lead.brand, ""),
  };
}

async function listUnlockedReports(runtime, openid) {
  const result = await runtime.db
    .collection("reports")
    .where({
      openid,
    })
    .orderBy("createdAt", "desc")
    .get();

  return (result.data || [])
    .filter((report) => !report.deletedAt)
    .filter((report) => Boolean(report.unlockedAt))
    .map(mapReportListItem);
}

async function recordReportView(runtime, payload) {
  await runtime.db.collection("events").add({
    data: {
      eventName: "report_view",
      openid: payload.openid,
      testId: payload.testId,
      reportId: payload.reportId,
      createdAt: payload.createdAt,
    },
  });
}

async function hideOwnedReport(runtime, reportId, now) {
  await runtime.db.collection("reports").doc(reportId).update({
    data: {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    },
  });
}

module.exports = {
  getOwnedReport,
  getLeadRecommendation,
  mapReportListItem,
  listUnlockedReports,
  recordReportView,
  hideOwnedReport,
};
