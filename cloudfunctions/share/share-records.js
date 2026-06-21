async function getShareEntryRecord(shareId, runtime) {
  const shareResult = await runtime.db.collection("share_entries").doc(shareId).get();
  const shareEntry = shareResult.data || {};

  if (!shareEntry._id) {
    return null;
  }

  return shareEntry;
}

function getRecommendationAtIndex(report, recommendationIndex) {
  const recommendations =
    report.snapshot && Array.isArray(report.snapshot.recommendations)
      ? report.snapshot.recommendations
      : [];

  return recommendations[recommendationIndex] || null;
}

async function getShareRecommendationPayload(shareEntry, runtime, fail, ok) {
  const reportResult = await runtime.db.collection("reports").doc(shareEntry.reportId).get();
  const report = reportResult.data || {};

  if (!report._id || report.deletedAt) {
    return fail("RESOURCE_NOT_FOUND", "Shared report is unavailable");
  }

  const recommendationIndex = Number(shareEntry.recommendationIndex || 0);
  const recommendation = getRecommendationAtIndex(report, recommendationIndex);

  if (!recommendation) {
    return fail("RESOURCE_NOT_FOUND", "Shared recommendation is unavailable");
  }

  return ok({
    shareId: shareEntry._id,
    reportId: shareEntry.reportId,
    recommendationIndex,
    recommendation,
    shareCardImage: shareEntry.cardPreviewFileId || "",
    shareStats: {
      visitCount: Number(shareEntry.visitCount || 0),
      uniqueVisitorCount: Number(shareEntry.uniqueVisitorCount || 0),
      newTestCount: Number(shareEntry.newTestCount || 0),
      paidOrderCount: Number(shareEntry.paidOrderCount || 0),
    },
    restartPath: "/pages/home/index",
  });
}

async function recordShareVisit(shareEntry, visitorOpenid, runtime) {
  const now = runtime.now().toISOString();
  const nextVisitCount = Number(shareEntry.visitCount || 0) + 1;
  const nextUniqueVisitorCount = Number(shareEntry.uniqueVisitorCount || 0) + 1;

  await runtime.db.collection("share_entries").doc(shareEntry._id).update({
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
      shareId: shareEntry._id,
      reportId: shareEntry.reportId || "",
      properties: {
        recommendationIndex: Number(shareEntry.recommendationIndex || 0),
      },
      createdAt: now,
    },
  });

  return {
    visitCount: nextVisitCount,
    uniqueVisitorCount: nextUniqueVisitorCount,
  };
}

function buildShareEntry(params) {
  const { openid, reportId, recommendationIndex, report, now, sharePath } = params;

  return {
    sharerOpenid: openid,
    reportId,
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
}

async function createShareEntryRecord(runtime, params) {
  const created = await runtime.db.collection("share_entries").add({
    data: buildShareEntry(params),
  });
  const shareId = created._id;
  const fullSharePath = `${params.sharePath}?shareId=${shareId}`;

  await runtime.db.collection("share_entries").doc(shareId).update({
    data: {
      sharePath: fullSharePath,
      updatedAt: params.now,
    },
  });

  return {
    shareId,
    sharePath: fullSharePath,
  };
}

module.exports = {
  getShareEntryRecord,
  getShareRecommendationPayload,
  recordShareVisit,
  buildShareEntry,
  createShareEntryRecord,
};
