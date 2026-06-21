const {
  cloud,
  getRuntime,
  ok,
  fail,
  unsupported,
  getEventData,
  getOpenId,
  requireOpenId,
} = require("./share-core");
const {
  getShareEntryRecord,
  getShareRecommendationPayload,
  recordShareVisit,
  createShareEntryRecord,
} = require("./share-records");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function getShareNotFoundError() {
  return fail("RESOURCE_NOT_FOUND", "Share entry does not exist");
}

async function createShareEntry(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const openid = requireOpenId(runtime);

  if (typeof openid !== "string") {
    return openid;
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
  const created = await createShareEntryRecord(runtime, {
    openid,
    reportId: data.reportId,
    recommendationIndex,
    report,
    now,
    sharePath,
  });

  return ok({
    shareId: created.shareId,
    sharePath: created.sharePath,
    recommendationIndex,
  });
}

async function trackShareVisit(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const visitorOpenid = getOpenId(runtime);

  if (!data.shareId) {
    return fail("INVALID_PAYLOAD", "shareId is required");
  }

  const shareEntry = await getShareEntryRecord(data.shareId, runtime);

  if (!shareEntry) {
    return getShareNotFoundError();
  }

  const stats = await recordShareVisit(shareEntry, visitorOpenid, runtime);

  return ok({
    tracked: true,
    shareId: data.shareId,
    visitCount: stats.visitCount,
    uniqueVisitorCount: stats.uniqueVisitorCount,
  });
}

async function getShareEntry(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);

  if (!data.shareId) {
    return fail("INVALID_PAYLOAD", "shareId is required");
  }

  const shareEntry = await getShareEntryRecord(data.shareId, runtime);

  if (!shareEntry) {
    return getShareNotFoundError();
  }

  return getShareRecommendationPayload(shareEntry, runtime, fail, ok);
}

async function loadShareLanding(event, deps) {
  const data = getEventData(event);
  const runtime = getRuntime(deps);
  const visitorOpenid = getOpenId(runtime);

  if (!data.shareId) {
    return fail("INVALID_PAYLOAD", "shareId is required");
  }

  const shareEntry = await getShareEntryRecord(data.shareId, runtime);

  if (!shareEntry) {
    return getShareNotFoundError();
  }

  const payload = await getShareRecommendationPayload(shareEntry, runtime, fail, ok);

  if (payload.code !== 0) {
    return payload;
  }

  const stats = await recordShareVisit(shareEntry, visitorOpenid, runtime);

  return ok({
    ...payload.data,
    shareStats: {
      ...payload.data.shareStats,
      visitCount: stats.visitCount,
      uniqueVisitorCount: stats.uniqueVisitorCount,
    },
    tracked: true,
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

  if (action === "getShareEntry") {
    return await getShareEntry(event, deps);
  }

  if (action === "loadShareLanding") {
    return await loadShareLanding(event, deps);
  }

  return unsupported(action);
}

exports.main = main;
exports.createShareEntry = createShareEntry;
exports.getShareEntry = getShareEntry;
exports.loadShareLanding = loadShareLanding;
exports.trackShareVisit = trackShareVisit;
