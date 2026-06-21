const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    wxContext: deps && deps.wxContext ? deps.wxContext : cloud.getWXContext(),
  };
}

function ok(data) {
  return {
    code: 0,
    message: "ok",
    data: data || null,
  };
}

function fail(code, message, data) {
  return {
    code: code || -1,
    message: message || "error",
    data: data || null,
  };
}

function unsupported(action) {
  return fail("INVALID_ACTION", `Unsupported action: ${action || "unknown"}`);
}

async function getPreview(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.testId || !data.reportId) {
    return fail("INVALID_PAYLOAD", "testId and reportId are required");
  }

  const result = await runtime.db.collection("reports").doc(data.reportId).get();
  const report = result.data || {};

  if (
    !report._id ||
    report.openid !== openid ||
    report.testId !== data.testId ||
    report.deletedAt
  ) {
    return fail("RESOURCE_NOT_FOUND", "Report does not belong to current user");
  }

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
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.testId || !data.reportId) {
    return fail("INVALID_PAYLOAD", "testId and reportId are required");
  }

  const reportResult = await runtime.db.collection("reports").doc(data.reportId).get();
  const report = reportResult.data || {};

  if (
    !report._id ||
    report.openid !== openid ||
    report.testId !== data.testId ||
    report.deletedAt
  ) {
    return fail("RESOURCE_NOT_FOUND", "Report does not belong to current user");
  }

  const paidImages = Array.isArray(report.paidImages) ? report.paidImages : [];
  const locked = !report.unlockedAt;

  if (locked) {
    return fail("REPORT_LOCKED", "Report is still locked", {
      testId: data.testId,
      reportId: data.reportId,
      locked: true,
    });
  }

  return ok({
    testId: data.testId,
    reportId: data.reportId,
    status: report.status || "active",
    locked: false,
    paidImages,
    snapshot: report.snapshot || {},
    unlockedAt: report.unlockedAt,
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
    return ok({ reports: [] });
  }

  return unsupported(action);
}

exports.main = main;
exports.getPreview = getPreview;
exports.getReport = getReport;
