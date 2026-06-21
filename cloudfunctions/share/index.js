const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

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

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    wxContext: deps && deps.wxContext ? deps.wxContext : cloud.getWXContext(),
    now: deps && deps.now ? deps.now : () => new Date(),
  };
}

async function createShareEntry(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.reportId && data.reportId !== "") {
    return fail("INVALID_PAYLOAD", "reportId is required");
  }

  const recommendationIndex = Number(data.recommendationIndex || 0);
  const reportResult = await runtime.db.collection("reports").doc(data.reportId).get();
  const report = reportResult.data || {};

  if (!report._id || report.openid !== openid || report.deletedAt) {
    return fail("RESOURCE_NOT_FOUND", "Report does not belong to current user");
  }

  if (!report.unlockedAt) {
    return fail("REPORT_LOCKED", "Only unlocked reports can be shared");
  }

  const now = runtime.now().toISOString();
  const sharePath = "/pages/share/index";
  const shareEntry = {
    sharerOpenid: openid,
    reportId: data.reportId,
    recommendationIndex,
    cardPreviewFileId:
      Array.isArray(report.shareCardImages) && report.shareCardImages[recommendationIndex]
        ? report.shareCardImages[recommendationIndex]
        : "",
    sharePath,
    visitCount: 0,
    uniqueVisitorCount: 0,
    newTestCount: 0,
    paidOrderCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const created = await runtime.db.collection("share_entries").add({
    data: shareEntry,
  });
  const shareId = created._id;
  const fullSharePath = `${sharePath}?shareId=${shareId}`;

  await runtime.db.collection("share_entries").doc(shareId).update({
    data: {
      sharePath: fullSharePath,
      updatedAt: now,
    },
  });

  return ok({
    shareId,
    sharePath: fullSharePath,
    recommendationIndex,
  });
}

async function trackShareVisit(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const visitorOpenid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!data.shareId) {
    return fail("INVALID_PAYLOAD", "shareId is required");
  }

  const shareResult = await runtime.db.collection("share_entries").doc(data.shareId).get();
  const shareEntry = shareResult.data || {};

  if (!shareEntry._id) {
    return fail("RESOURCE_NOT_FOUND", "Share entry does not exist");
  }

  const now = runtime.now().toISOString();
  const nextVisitCount = Number(shareEntry.visitCount || 0) + 1;
  const nextUniqueVisitorCount = Number(shareEntry.uniqueVisitorCount || 0) + 1;

  await runtime.db.collection("share_entries").doc(data.shareId).update({
    data: {
      visitCount: nextVisitCount,
      uniqueVisitorCount: nextUniqueVisitorCount,
      updatedAt: now,
    },
  });

  await runtime.db.collection("events").add({
    data: {
      eventName: "share_visit",
      openid: visitorOpenid || "",
      shareId: data.shareId,
      reportId: shareEntry.reportId || "",
      properties: {
        recommendationIndex: Number(shareEntry.recommendationIndex || 0),
      },
      createdAt: now,
    },
  });

  return ok({
    tracked: true,
    shareId: data.shareId,
    visitCount: nextVisitCount,
    uniqueVisitorCount: nextUniqueVisitorCount,
  });
}

async function main(event, context, deps) {
  const action = event && event.action;

  if (action === "createShareEntry") {
    return await createShareEntry(event, deps);
  }

  if (action === "trackShareVisit") {
    return await trackShareVisit(event, deps);
  }

  return unsupported(action);
}

exports.main = main;
exports.createShareEntry = createShareEntry;
exports.trackShareVisit = trackShareVisit;
