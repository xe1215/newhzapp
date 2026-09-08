const { fail, ok } = require("./response");
const { getRuntime, getEventData } = require("./runtime");
const { requireSession } = require("./session");
const { appendAdminAction } = require("./audit");
const {
  buildAdminRecordQuery,
  clone,
  maskOpenId,
  normalizeStatus,
  normalizeText,
  numberField,
  stringField,
  toCsvValue,
} = require("./utils");

function mapTestRecordListItem(record) {
  return {
    testId: record._id,
    openidMasked: maskOpenId(record.openid),
    status: stringField(record.status, "unknown"),
    generationStatus: stringField(record.generationStatus, ""),
    safetyStatus: stringField(record.safetyStatus, ""),
    qualityStatus: stringField(record.qualityStatus, ""),
    currentReportId: stringField(record.currentReportId, ""),
    previewRegenerateCount: numberField(record.previewRegenerateCount, 0),
    maxPreviewRegenerateCount: numberField(record.maxPreviewRegenerateCount, 0),
    createdAt: stringField(record.createdAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapTestRecordDetail(record) {
  return {
    testId: record._id,
    openid: stringField(record.openid, ""),
    status: stringField(record.status, "unknown"),
    currentReportId: stringField(record.currentReportId, ""),
    selfieFileId: stringField(record.selfieFileId, ""),
    preferences: clone(record.preferenceSummary || {}),
    statuses: {
      safetyStatus: stringField(record.safetyStatus, ""),
      qualityStatus: stringField(record.qualityStatus, ""),
      generationStatus: stringField(record.generationStatus, ""),
    },
    lifecycle: {
      createdAt: stringField(record.createdAt, ""),
      updatedAt: stringField(record.updatedAt, ""),
      preferenceSubmittedAt: stringField(record.preferenceSubmittedAt, ""),
      generationStartedAt: stringField(record.generationStartedAt, ""),
      generationCompletedAt: stringField(record.generationCompletedAt, ""),
      reportReadyAt: stringField(record.reportReadyAt, ""),
    },
    previewRegenerateCount: numberField(record.previewRegenerateCount, 0),
    maxPreviewRegenerateCount: numberField(record.maxPreviewRegenerateCount, 0),
  };
}

function mapReportRecordListItem(record) {
  return {
    reportId: record._id,
    testId: stringField(record.testId, ""),
    openidMasked: maskOpenId(record.openid),
    status: stringField(record.status, "unknown"),
    locked: !record.unlockedAt,
    unlockedAt: stringField(record.unlockedAt, ""),
    hiddenAt: stringField(record.hiddenAt, ""),
    flaggedAt: stringField(record.flaggedAt, ""),
    createdAt: stringField(record.createdAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapReportRecordDetail(record) {
  return {
    reportId: record._id,
    testId: stringField(record.testId, ""),
    openid: stringField(record.openid, ""),
    status: stringField(record.status, "unknown"),
    unlock: {
      unlocked: Boolean(record.unlockedAt),
      unlockedAt: stringField(record.unlockedAt, ""),
    },
    assets: {
      previewImages: Array.isArray(record.previewImages) ? clone(record.previewImages) : [],
      paidImages: Array.isArray(record.paidImages) ? clone(record.paidImages) : [],
      shareCardImages: Array.isArray(record.shareCardImages) ? clone(record.shareCardImages) : [],
    },
    snapshot: clone(record.snapshot || {}),
    audit: {
      hiddenAt: stringField(record.hiddenAt, ""),
      hiddenReason: stringField(record.hiddenReason, ""),
      flaggedAt: stringField(record.flaggedAt, ""),
      flaggedReason: stringField(record.flaggedReason, ""),
      deletedAt: stringField(record.deletedAt, ""),
    },
    createdAt: stringField(record.createdAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapOrderRecordListItem(record) {
  return {
    orderId: record._id,
    openidMasked: maskOpenId(record.openid),
    status: stringField(record.status, "unknown"),
    refundStatus: stringField(record.refundStatus, "none"),
    reportId: stringField(record.reportId, ""),
    outTradeNo: stringField(record.outTradeNo, ""),
    amountCents: numberField(record.amountCents, 0),
    currency: stringField(record.currency, "CNY"),
    createdAt: stringField(record.createdAt, ""),
    paidAt: stringField(record.paidAt, ""),
    unlockedAt: stringField(record.unlockedAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapOrderRecordDetail(record) {
  return {
    orderId: record._id,
    openid: stringField(record.openid, ""),
    status: stringField(record.status, "unknown"),
    refundStatus: stringField(record.refundStatus, "none"),
    refundReason: stringField(record.refundReason, ""),
    adminNote: stringField(record.adminNote, ""),
    amountCents: numberField(record.amountCents, 0),
    currency: stringField(record.currency, "CNY"),
    transactionId: stringField(record.transactionId, ""),
    outTradeNo: stringField(record.outTradeNo, ""),
    prepayId: stringField(record.prepayId, ""),
    paidAt: stringField(record.paidAt, ""),
    unlockedAt: stringField(record.unlockedAt, ""),
    testId: stringField(record.testId, ""),
    reportId: stringField(record.reportId, ""),
    createdAt: stringField(record.createdAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapProviderRunListItem(record) {
  return {
    runId: record._id,
    provider: stringField(record.provider, ""),
    status: stringField(record.status, "unknown"),
    errorCode: stringField(record.errorCode, ""),
    retryIndex: numberField(record.retryIndex, 0),
    testId: stringField(record.testId, ""),
    reportId: stringField(record.reportId, ""),
    openidMasked: maskOpenId(record.openid),
    durationMs: numberField(record.durationMs, 0),
    createdAt: stringField(record.createdAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapProviderRunDetail(record) {
  return {
    runId: record._id,
    provider: stringField(record.provider, ""),
    status: stringField(record.status, "unknown"),
    errorCode: stringField(record.errorCode, ""),
    errorMessage: stringField(record.errorMessage, ""),
    retryIndex: numberField(record.retryIndex, 0),
    durationMs: numberField(record.durationMs, 0),
    originalImageFileId: stringField(record.originalImageFileId, ""),
    watermarkedImageFileId: stringField(record.watermarkedImageFileId, ""),
    testId: stringField(record.testId, ""),
    reportId: stringField(record.reportId, ""),
    openid: stringField(record.openid, ""),
    createdAt: stringField(record.createdAt, ""),
    updatedAt: stringField(record.updatedAt, ""),
  };
}

function mapEventListItem(record) {
  return {
    eventId: record._id,
    eventName: stringField(record.eventName || record.type, ""),
    openidMasked: maskOpenId(record.openid),
    testId: stringField(record.testId, ""),
    reportId: stringField(record.reportId, ""),
    orderId: stringField(record.orderId, ""),
    shareId: stringField(record.shareId, ""),
    createdAt: stringField(record.createdAt, ""),
  };
}

function mapEventDetail(record) {
  return {
    eventId: record._id,
    eventName: stringField(record.eventName || record.type, ""),
    openid: stringField(record.openid, ""),
    testId: stringField(record.testId, ""),
    reportId: stringField(record.reportId, ""),
    orderId: stringField(record.orderId, ""),
    shareId: stringField(record.shareId, ""),
    metadata: clone(record.metadata || {}),
    createdAt: stringField(record.createdAt, ""),
  };
}

async function requireDeveloper(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  return {
    runtime,
    data,
    session,
  };
}

async function listTests(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const query = buildAdminRecordQuery(data.filters, ["openid", "status"]);
  const result = await runtime.db
    .collection("try_on_tests")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return ok({
    items: (result.data || []).map(mapTestRecordListItem),
  });
}

async function getTestDetail(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const testId = normalizeText(data.testId);
  if (!testId) {
    return fail("INVALID_PAYLOAD", "testId is required");
  }

  const result = await runtime.db.collection("try_on_tests").doc(testId).get();
  const record = result.data || null;

  if (!record || !record._id) {
    return fail("RESOURCE_NOT_FOUND", "Test record was not found");
  }

  return ok(mapTestRecordDetail(record));
}

async function listReports(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const query = buildAdminRecordQuery(data.filters, ["openid", "status", "testId"]);
  const result = await runtime.db
    .collection("reports")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return ok({
    items: (result.data || []).map(mapReportRecordListItem),
  });
}

async function getReportDetail(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const reportId = normalizeText(data.reportId);
  if (!reportId) {
    return fail("INVALID_PAYLOAD", "reportId is required");
  }

  const result = await runtime.db.collection("reports").doc(reportId).get();
  const record = result.data || null;

  if (!record || !record._id) {
    return fail("RESOURCE_NOT_FOUND", "Report record was not found");
  }

  return ok(mapReportRecordDetail(record));
}

async function listOrders(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const query = buildAdminRecordQuery(data.filters, [
    "openid",
    "status",
    "refundStatus",
    "reportId",
    "outTradeNo",
  ]);
  const result = await runtime.db
    .collection("orders")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return ok({
    items: (result.data || []).map(mapOrderRecordListItem),
  });
}

async function getOrderDetail(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const orderId = normalizeText(data.orderId);
  if (!orderId) {
    return fail("INVALID_PAYLOAD", "orderId is required");
  }

  const result = await runtime.db.collection("orders").doc(orderId).get();
  const record = result.data || null;

  if (!record || !record._id) {
    return fail("RESOURCE_NOT_FOUND", "Order record was not found");
  }

  return ok(mapOrderRecordDetail(record));
}

async function listProviderRuns(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const query = buildAdminRecordQuery(data.filters, [
    "provider",
    "status",
    "errorCode",
    "retryIndex",
    "testId",
    "reportId",
    "openid",
  ]);
  const result = await runtime.db
    .collection("provider_runs")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return ok({
    items: (result.data || []).map(mapProviderRunListItem),
  });
}

async function getProviderRunDetail(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const runId = normalizeText(data.runId);
  if (!runId) {
    return fail("INVALID_PAYLOAD", "runId is required");
  }

  const result = await runtime.db.collection("provider_runs").doc(runId).get();
  const record = result.data || null;

  if (!record || !record._id) {
    return fail("RESOURCE_NOT_FOUND", "Provider run record was not found");
  }

  return ok(mapProviderRunDetail(record));
}

async function listEvents(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const query = buildAdminRecordQuery(data.filters, [
    "eventName",
    "openid",
    "testId",
    "reportId",
    "orderId",
    "shareId",
  ]);
  const result = await runtime.db
    .collection("events")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return ok({
    items: (result.data || []).map(mapEventListItem),
  });
}

async function getEventDetail(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const eventId = normalizeText(data.eventId);
  if (!eventId) {
    return fail("INVALID_PAYLOAD", "eventId is required");
  }

  const result = await runtime.db.collection("events").doc(eventId).get();
  const record = result.data || null;

  if (!record || !record._id) {
    return fail("RESOURCE_NOT_FOUND", "Event record was not found");
  }

  return ok(mapEventDetail(record));
}

async function exportEventsCsv(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const query = buildAdminRecordQuery(data.filters, [
    "eventName",
    "openid",
    "testId",
    "reportId",
    "orderId",
    "shareId",
  ]);
  const result = await runtime.db
    .collection("events")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(1000)
    .get();
  const events = result.data || [];
  const header = ["eventId", "eventName", "openid", "testId", "reportId", "orderId", "shareId", "metadata", "createdAt"];
  const rows = events.map((item) =>
    [
      item._id,
      item.eventName || item.type || "",
      item.openid || "",
      item.testId || "",
      item.reportId || "",
      item.orderId || "",
      item.shareId || "",
      JSON.stringify(item.metadata || {}),
      item.createdAt || "",
    ]
      .map(toCsvValue)
      .join(",")
  );

  return ok({
    fileName: `events-${runtime.now().toISOString().slice(0, 10)}.csv`,
    csvText: [header.join(","), ...rows].join("\n"),
  });
}

async function updateOrderRefundHandling(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const orderId = normalizeText(data.orderId);
  const refundStatus = normalizeStatus(data.refundStatus);
  const refundReason = normalizeText(data.refundReason);
  const adminNote = normalizeText(data.adminNote);

  if (!orderId) {
    return fail("INVALID_PAYLOAD", "orderId is required");
  }

  if (!["pending", "refunded", "rejected"].includes(refundStatus)) {
    return fail("INVALID_REFUND_STATUS", "refundStatus must be pending, refunded, or rejected");
  }

  const previous = (await runtime.db.collection("orders").doc(orderId).get()).data || null;
  if (!previous || !previous._id) {
    return fail("RESOURCE_NOT_FOUND", "Order record was not found");
  }

  const nextRecord = {
    ...previous,
    refundStatus,
    refundReason,
    adminNote,
    updatedAt: runtime.now().toISOString(),
  };

  await runtime.db.collection("orders").doc(orderId).set({
    data: nextRecord,
  });

  await appendAdminAction(
    runtime,
    "order_refund_handling_update",
    "order",
    orderId,
    previous,
    nextRecord
  );

  return ok({
    orderId,
    refundStatus: nextRecord.refundStatus,
    refundReason: nextRecord.refundReason,
    adminNote: nextRecord.adminNote,
    updatedAt: nextRecord.updatedAt,
  });
}

async function flagReport(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);

  if (session.code) {
    return session;
  }

  const reportId = normalizeText(data.reportId);
  const operation = normalizeStatus(data.operation);
  const reason = normalizeText(data.reason);

  if (!reportId || !operation) {
    return fail("INVALID_PAYLOAD", "reportId and operation are required");
  }

  const previous = (await runtime.db.collection("reports").doc(reportId).get()).data || null;
  if (!previous || !previous._id) {
    return fail("RESOURCE_NOT_FOUND", "Report record was not found");
  }

  const nextRecord = {
    ...previous,
    updatedAt: runtime.now().toISOString(),
  };

  let actionName = "";

  if (operation === "hide") {
    nextRecord.status = "hidden";
    nextRecord.hiddenAt = nextRecord.updatedAt;
    nextRecord.hiddenReason = reason;
    actionName = "hide_report";
  } else if (operation === "flag") {
    nextRecord.status = "flagged";
    nextRecord.flaggedAt = nextRecord.updatedAt;
    nextRecord.flaggedReason = reason;
    actionName = "flag_report";
  } else {
    return fail("INVALID_ACTION", `Unsupported report operation: ${data.operation}`);
  }

  await runtime.db.collection("reports").doc(reportId).set({
    data: nextRecord,
  });

  await appendAdminAction(runtime, actionName, "report", reportId, previous, nextRecord);

  return ok({
    reportId,
    status: nextRecord.status,
    updatedAt: nextRecord.updatedAt,
  });
}

module.exports = {
  listTests,
  getTestDetail,
  listReports,
  getReportDetail,
  listOrders,
  getOrderDetail,
  listProviderRuns,
  getProviderRunDetail,
  listEvents,
  getEventDetail,
  exportEventsCsv,
  flagReport,
};
