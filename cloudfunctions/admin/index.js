const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const MODULES = [
  { key: "overview", label: "Operations Overview", path: "/overview" },
  { key: "lipsticks", label: "Lipstick Library", path: "/lipsticks" },
  { key: "tests", label: "Test Records", path: "/tests" },
  { key: "reports", label: "Report Records", path: "/reports" },
  { key: "orders", label: "Orders and Refund Handling", path: "/orders" },
  { key: "logs", label: "Generation and Event Logs", path: "/logs" },
];

const OVERVIEW_RANGES = {
  today: {
    key: "today",
    label: "Today",
    getBounds(now) {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
  yesterday: {
    key: "yesterday",
    label: "Yesterday",
    getBounds(now) {
      const end = new Date(now);
      end.setUTCHours(0, 0, 0, 0);
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
  last7Days: {
    key: "last7Days",
    label: "Last 7 days",
    getBounds(now) {
      const end = new Date(now);
      end.setUTCHours(24, 0, 0, 0);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
  last30Days: {
    key: "last30Days",
    label: "Last 30 days",
    getBounds(now) {
      const end = new Date(now);
      end.setUTCHours(24, 0, 0, 0);
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
};

function toIsoString(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getDateRangeFilters(filters) {
  const startDate = toIsoString(filters && filters.startDate);
  const endDate = toIsoString(filters && filters.endDate);

  if (!startDate && !endDate) {
    return null;
  }

  const createdAt = {};

  if (startDate) {
    createdAt.$gte = startDate;
  }

  if (endDate) {
    createdAt.$lt = endDate;
  }

  return Object.keys(createdAt).length ? createdAt : null;
}

function maskOpenId(openid) {
  const value = String(openid || "");

  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 9)}...${value.slice(-4)}`;
}

function stringField(value, fallback) {
  return typeof value === "string" && value ? value : fallback || "";
}

function numberField(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
}

function buildListQuery(filters, fieldMap) {
  const query = {};
  const safeFilters = filters || {};

  Object.keys(fieldMap).forEach((key) => {
    if (safeFilters[key]) {
      query[fieldMap[key]] = safeFilters[key];
    }
  });

  const createdAt = getDateRangeFilters(safeFilters);
  if (createdAt) {
    query.createdAt = createdAt;
  }

  return query;
}

function mapAdminTestListItem(record) {
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

function mapAdminTestDetail(record) {
  return {
    testId: record._id,
    openid: stringField(record.openid, ""),
    status: stringField(record.status, "unknown"),
    currentReportId: stringField(record.currentReportId, ""),
    selfieFileId: stringField(record.selfieFileId, ""),
    preferences: record.preferenceSummary || {},
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

function mapAdminReportListItem(record) {
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

function mapAdminReportDetail(record) {
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
      previewImages: Array.isArray(record.previewImages) ? record.previewImages : [],
      paidImages: Array.isArray(record.paidImages) ? record.paidImages : [],
      shareCardImages: Array.isArray(record.shareCardImages) ? record.shareCardImages : [],
    },
    snapshot: record.snapshot || {},
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

async function addAdminAction(runtime, payload) {
  await runtime.db.collection("admin_actions").add({
    data: {
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      reason: payload.reason || "",
      createdAt: payload.createdAt,
      actorRole: "developer",
    },
  });
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

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    env: deps && deps.env ? deps.env : process.env,
    now: deps && deps.now ? deps.now : () => new Date(),
    id:
      deps && deps.id
        ? deps.id
        : () => crypto.randomBytes(12).toString("hex"),
    randomBytes:
      deps && deps.randomBytes
        ? deps.randomBytes
        : (size) => crypto.randomBytes(size),
  };
}

function getEventData(event) {
  return (event && event.data) || {};
}

function getSessionTtlSeconds(env) {
  return Number(env.ADMIN_SESSION_TTL_SECONDS || 7200);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function createToken(runtime) {
  return runtime.randomBytes(24).toString("hex");
}

function countMatchingEvents(events, names) {
  return events.filter((event) => {
    const value = event.eventName || event.type || "";
    return names.includes(value);
  }).length;
}

function mapGenerationFailure(run) {
  return {
    runId: run._id,
    provider: run.provider || "",
    status: run.status || "",
    errorCode: run.errorCode || "",
    errorMessage: run.errorMessage || "",
    createdAt: run.createdAt || "",
  };
}

function mapExceptionOrder(order) {
  return {
    orderId: order._id,
    status: order.status || "",
    refundStatus: order.refundStatus || "",
    refundReason: order.refundReason || "",
    amountCents: Number(order.amountCents || 0),
    currency: order.currency || "CNY",
    createdAt: order.createdAt || "",
    updatedAt: order.updatedAt || "",
  };
}

function getRangeConfig(rangeKey) {
  return OVERVIEW_RANGES[rangeKey] || OVERVIEW_RANGES.today;
}

function buildCreatedAtRange(now, rangeKey) {
  const range = getRangeConfig(rangeKey);
  const bounds = range.getBounds(now);

  return {
    range,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeColorHex(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  return normalizeText(value)
    .split("|")
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeBudget(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function listCollectionRecords(runtime, name) {
  const result = await runtime.db.collection(name).get();
  return result.data || [];
}

function validateLipstickInput(input, existingRecords, currentId) {
  const lipstick = {
    brand: normalizeText(input.brand),
    shadeName: normalizeText(input.shadeName),
    shadeCode: normalizeText(input.shadeCode),
    colorHex: normalizeColorHex(input.colorHex),
    skinToneTags: normalizeTags(input.skinToneTags),
    budgetMin: normalizeBudget(input.budgetMin),
    budgetMax: normalizeBudget(input.budgetMax),
    status: normalizeStatus(input.status),
  };
  const errors = [];

  if (!lipstick.brand) {
    errors.push("brand is required");
  }
  if (!lipstick.shadeName) {
    errors.push("shadeName is required");
  }
  if (!lipstick.shadeCode) {
    errors.push("shadeCode is required");
  }
  if (!/^#[0-9A-F]{6}$/.test(lipstick.colorHex)) {
    errors.push("colorHex must be a #RRGGBB value");
  }
  if (!lipstick.skinToneTags.length) {
    errors.push("skinToneTags must contain at least one tag");
  }
  if (!Number.isFinite(lipstick.budgetMin) || lipstick.budgetMin < 0) {
    errors.push("budgetMin must be a valid non-negative number");
  }
  if (!Number.isFinite(lipstick.budgetMax) || lipstick.budgetMax < 0) {
    errors.push("budgetMax must be a valid non-negative number");
  }
  if (
    Number.isFinite(lipstick.budgetMin) &&
    Number.isFinite(lipstick.budgetMax) &&
    lipstick.budgetMin > lipstick.budgetMax
  ) {
    errors.push("budgetMin cannot be greater than budgetMax");
  }
  if (!["active", "inactive"].includes(lipstick.status)) {
    errors.push("status must be active or inactive");
  }

  const duplicate = (existingRecords || []).find((item) => {
    if (item._id === currentId) {
      return false;
    }

    return (
      normalizeText(item.brand) === lipstick.brand &&
      normalizeText(item.shadeName) === lipstick.shadeName &&
      normalizeText(item.shadeCode) === lipstick.shadeCode
    );
  });

  if (duplicate) {
    errors.push("duplicate brand/shadeName/shadeCode combination");
  }

  return {
    lipstick,
    errors,
  };
}

function filterLipsticks(records, filters) {
  const normalizedFilters = filters || {};

  return (records || []).filter((item) => {
    if (
      normalizedFilters.brand &&
      normalizeText(item.brand).toLowerCase() !== normalizeText(normalizedFilters.brand).toLowerCase()
    ) {
      return false;
    }

    if (
      normalizedFilters.status &&
      normalizeStatus(item.status) !== normalizeStatus(normalizedFilters.status)
    ) {
      return false;
    }

    if (normalizedFilters.skinToneTag) {
      const tags = normalizeTags(item.skinToneTags).map((tag) => tag.toLowerCase());
      if (!tags.includes(normalizeText(normalizedFilters.skinToneTag).toLowerCase())) {
        return false;
      }
    }

    if (
      Number.isFinite(Number(normalizedFilters.budgetMin)) &&
      Number(item.budgetMin || 0) < Number(normalizedFilters.budgetMin)
    ) {
      return false;
    }

    if (
      Number.isFinite(Number(normalizedFilters.budgetMax)) &&
      Number(item.budgetMax || 0) > Number(normalizedFilters.budgetMax)
    ) {
      return false;
    }

    return true;
  });
}

function buildLipstickFilters(records) {
  const brands = [...new Set((records || []).map((item) => normalizeText(item.brand)).filter(Boolean))].sort();
  const skinToneTags = [
    ...new Set(
      (records || [])
        .flatMap((item) => normalizeTags(item.skinToneTags))
        .filter(Boolean)
    ),
  ].sort();

  return {
    brands,
    skinToneTags,
    statuses: ["active", "inactive"],
  };
}

function buildRecordDateQuery(filters) {
  const startDate = toIsoString(filters && filters.startDate);
  const endDate = toIsoString(filters && filters.endDate);

  if (!startDate && !endDate) {
    return null;
  }

  const query = {};

  if (startDate) {
    query.$gte = startDate;
  }

  if (endDate) {
    query.$lt = endDate;
  }

  return Object.keys(query).length ? query : null;
}

function buildAdminRecordQuery(filters, fields) {
  const safeFilters = filters || {};
  const query = {};

  fields.forEach((field) => {
    if (safeFilters[field]) {
      query[field] = safeFilters[field];
    }
  });

  const createdAt = buildRecordDateQuery(safeFilters);
  if (createdAt) {
    query.createdAt = createdAt;
  }

  return query;
}

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

async function appendAdminAction(runtime, operation, targetType, targetId, before, after) {
  const actionId = runtime.id();
  await runtime.db.collection("admin_actions").add({
    data: {
      _id: actionId,
      operation,
      targetType,
      targetId,
      before: before === undefined ? null : clone(before),
      after: after === undefined ? null : clone(after),
      createdAt: runtime.now().toISOString(),
    },
  });
}

function parseCsvLine(line) {
  return String(line || "")
    .split(",")
    .map((item) => item.trim());
}

function toCsvValue(value) {
  const text = String(value === undefined || value === null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function readSession(runtime, token) {
  if (!token) {
    return null;
  }

  const result = await runtime.db.collection("admin_sessions").doc(token).get();
  const session = result.data || null;

  if (!session || session.revokedAt) {
    return null;
  }

  const nowMs = runtime.now().getTime();
  const expiresAtMs = Date.parse(session.expiresAt || "");

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return null;
  }

  return session;
}

async function requireSession(runtime, token) {
  const session = await readSession(runtime, token);

  if (!session) {
    return fail("UNAUTHORIZED", "Developer login is required");
  }

  return session;
}

async function login(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const env = runtime.env || {};
  const expectedHash = String(env.ADMIN_PASSWORD_HASH || "");
  const sessionSecret = String(env.ADMIN_SESSION_SECRET || "");

  if (!expectedHash || !sessionSecret) {
    return fail("ADMIN_CONFIG_MISSING", "Admin secrets are not configured");
  }

  const password = String(data.password || "");

  if (!password) {
    return fail("INVALID_CREDENTIALS", "Developer password is required");
  }

  const actualHash = `sha256$${hashPassword(password)}`;

  if (actualHash !== expectedHash) {
    return fail("INVALID_CREDENTIALS", "Developer password is incorrect");
  }

  const ttlSeconds = getSessionTtlSeconds(env);
  const issuedAt = runtime.now();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
  const token = createToken(runtime);

  await runtime.db.collection("admin_sessions").doc(token).set({
    data: {
      token,
      role: "developer",
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: "",
      sessionDigest: crypto
        .createHash("sha256")
        .update(`${token}:${sessionSecret}`)
        .digest("hex"),
    },
  });

  return ok({
    token,
    expiresIn: ttlSeconds,
    role: "developer",
  });
}

async function logout(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  await runtime.db.collection("admin_sessions").doc(session.token).update({
    data: {
      revokedAt: runtime.now().toISOString(),
    },
  });

  return ok({
    loggedOut: true,
  });
}

async function getShell(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  return ok({
    viewer: {
      role: "developer",
      sessionExpiresAt: session.expiresAt,
    },
    modules: MODULES,
    defaultModuleKey: "overview",
  });
}

async function getOverview(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const { range, start, end } = buildCreatedAtRange(runtime.now(), data.rangeKey);
  const createdAt = {
    $gte: start,
    $lt: end,
  };

  const [eventsResult, ordersResult, testsResult, reportsResult, providerRunsResult] =
    await Promise.all([
      runtime.db.collection("events").where({ createdAt }).get(),
      runtime.db.collection("orders").where({ createdAt }).get(),
      runtime.db.collection("try_on_tests").where({ createdAt }).get(),
      runtime.db.collection("reports").where({ createdAt }).get(),
      runtime.db.collection("provider_runs").where({ createdAt }).get(),
    ]);

  const events = eventsResult.data || [];
  const orders = ordersResult.data || [];
  const tests = testsResult.data || [];
  const reports = reportsResult.data || [];
  const providerRuns = providerRunsResult.data || [];

  const recentGenerationFailures = providerRuns
    .filter((run) => run.status === "failed")
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, 5)
    .map(mapGenerationFailure);

  const recentExceptionOrders = orders
    .filter((order) => order.status === "paid")
    .filter((order) => order.refundStatus && order.refundStatus !== "none")
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 5)
    .map(mapExceptionOrder);

  const metrics = {
    visits: events.length,
    testsCreated: tests.length,
    reportsCreated: reports.length,
    generationSuccessCount: countMatchingEvents(events, ["generation_success"]),
    generationFailureCount: countMatchingEvents(events, ["generation_fail"]),
    paidOrderCount: orders.filter((order) => order.status === "paid").length,
    revenueCents: orders
      .filter((order) => order.status === "paid")
      .reduce((sum, order) => sum + Number(order.amountCents || 0), 0),
    reportViewCount: countMatchingEvents(events, ["report_view"]),
    shareVisitCount: countMatchingEvents(events, ["share_visit"]),
  };

  const empty =
    metrics.visits === 0 &&
    metrics.testsCreated === 0 &&
    metrics.paidOrderCount === 0 &&
    recentGenerationFailures.length === 0 &&
    recentExceptionOrders.length === 0;

  return ok({
    range: {
      key: range.key,
      label: range.label,
      start,
      end,
      options: Object.values(OVERVIEW_RANGES).map((entry) => ({
        key: entry.key,
        label: entry.label,
      })),
    },
    metrics,
    recentGenerationFailures,
    recentExceptionOrders,
    empty,
    emptyMessage: empty ? "No overview data for this range yet." : "",
  });
}

async function listLipsticks(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const records = await listCollectionRecords(runtime, "lipsticks");
  const filtered = filterLipsticks(records, data.filters);

  return ok({
    records: filtered.sort((left, right) =>
      `${left.brand || ""}${left.shadeCode || ""}`.localeCompare(`${right.brand || ""}${right.shadeCode || ""}`)
    ),
    availableFilters: buildLipstickFilters(records),
  });
}

async function saveLipstick(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const input = data.lipstick || {};
  const lipstickId = normalizeText(input._id);
  const records = await listCollectionRecords(runtime, "lipsticks");
  const previous = lipstickId ? (await runtime.db.collection("lipsticks").doc(lipstickId).get()).data || null : null;
  const { lipstick, errors } = validateLipstickInput(input, records, lipstickId || "");

  if (errors.length) {
    return fail("INVALID_LIPSTICK", "Lipstick validation failed", { errors });
  }

  const now = runtime.now().toISOString();
  const nextId = lipstickId || runtime.id();
  const nextRecord = {
    _id: nextId,
    ...lipstick,
    createdAt: previous && previous.createdAt ? previous.createdAt : now,
    updatedAt: now,
  };

  await runtime.db.collection("lipsticks").doc(nextId).set({
    data: nextRecord,
  });

  await appendAdminAction(
    runtime,
    previous ? "lipstick_update" : "lipstick_create",
    "lipstick",
    nextId,
    previous || null,
    nextRecord
  );

  return ok({
    record: nextRecord,
  });
}

async function setLipstickStatus(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const lipstickId = normalizeText(data.lipstickId);
  const status = normalizeStatus(data.status);
  const previous = lipstickId ? (await runtime.db.collection("lipsticks").doc(lipstickId).get()).data || null : null;

  if (!previous) {
    return fail("RESOURCE_NOT_FOUND", "Lipstick record was not found");
  }

  if (!["active", "inactive"].includes(status)) {
    return fail("INVALID_LIPSTICK", "status must be active or inactive", {
      errors: ["status must be active or inactive"],
    });
  }

  const nextRecord = {
    ...previous,
    status,
    updatedAt: runtime.now().toISOString(),
  };

  await runtime.db.collection("lipsticks").doc(lipstickId).set({
    data: nextRecord,
  });

  await appendAdminAction(
    runtime,
    "lipstick_status_change",
    "lipstick",
    lipstickId,
    previous,
    nextRecord
  );

  return ok({
    record: nextRecord,
  });
}

async function importLipsticksCsv(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const csvText = String(data.csvText || "");
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return fail("INVALID_CSV_IMPORT", "CSV must contain a header and at least one row", {
      errors: [{ rowNumber: 1, reason: "No data rows found" }],
    });
  }

  const headers = parseCsvLine(lines[0]);
  const requiredHeaders = [
    "brand",
    "shadeName",
    "shadeCode",
    "colorHex",
    "skinToneTags",
    "budgetMin",
    "budgetMax",
    "status",
  ];

  if (headers.join(",") !== requiredHeaders.join(",")) {
    return fail("INVALID_CSV_IMPORT", "CSV header does not match the expected template", {
      errors: [{ rowNumber: 1, reason: "Unexpected header columns" }],
    });
  }

  const existingRecords = await listCollectionRecords(runtime, "lipsticks");
  const stagedRecords = [];
  const seenKeys = new Set(
    existingRecords.map((item) =>
      [normalizeText(item.brand), normalizeText(item.shadeName), normalizeText(item.shadeCode)].join("::")
    )
  );
  const errors = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] || ""]));
    const rowNumber = index + 1;
    const key = [
      normalizeText(record.brand),
      normalizeText(record.shadeName),
      normalizeText(record.shadeCode),
    ].join("::");
    const validation = validateLipstickInput(record, [], "");

    if (seenKeys.has(key)) {
      validation.errors.push("duplicate brand/shadeName/shadeCode combination");
    }

    if (validation.errors.length) {
      errors.push({
        rowNumber,
        reason: validation.errors.join("; "),
      });
      continue;
    }

    seenKeys.add(key);
    stagedRecords.push(validation.lipstick);
  }

  if (errors.length) {
    return fail("INVALID_CSV_IMPORT", "CSV import validation failed", {
      errors,
    });
  }

  const importedRecords = [];
  const now = runtime.now().toISOString();
  for (const lipstick of stagedRecords) {
    const lipstickId = runtime.id();
    const nextRecord = {
      _id: lipstickId,
      ...lipstick,
      createdAt: now,
      updatedAt: now,
    };
    await runtime.db.collection("lipsticks").doc(lipstickId).set({
      data: nextRecord,
    });
    importedRecords.push(nextRecord);
  }

  await appendAdminAction(
    runtime,
    "lipstick_import_csv",
    "lipstick",
    "batch",
    null,
    {
      importedCount: importedRecords.length,
      records: importedRecords,
    }
  );

  return ok({
    importedCount: importedRecords.length,
  });
}

async function exportLipsticksCsv(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const records = await listCollectionRecords(runtime, "lipsticks");
  const header = [
    "brand",
    "shadeName",
    "shadeCode",
    "colorHex",
    "skinToneTags",
    "budgetMin",
    "budgetMax",
    "status",
  ];
  const rows = records
    .sort((left, right) =>
      `${left.brand || ""}${left.shadeCode || ""}`.localeCompare(`${right.brand || ""}${right.shadeCode || ""}`)
    )
    .map((item) =>
      [
        item.brand,
        item.shadeName,
        item.shadeCode,
        item.colorHex,
        normalizeTags(item.skinToneTags).join("|"),
        item.budgetMin,
        item.budgetMax,
        item.status,
      ]
        .map(toCsvValue)
        .join(",")
    );

  return ok({
    fileName: `lipsticks-${runtime.now().toISOString().slice(0, 10)}.csv`,
    csvText: [header.join(","), ...rows].join("\n"),
  });
}

async function listTests(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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

async function updateOrderRefundHandling(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

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

async function main(event, context, deps) {
  const action = event && event.action;

  try {
    if (action === "login") {
      return await login(event, deps);
    }

    if (action === "logout") {
      return await logout(event, deps);
    }

    if (action === "getShell") {
      return await getShell(event, deps);
    }

    if (action === "getOverview") {
      return await getOverview(event, deps);
    }

    if (action === "listLipsticks") {
      return await listLipsticks(event, deps);
    }

    if (action === "saveLipstick") {
      return await saveLipstick(event, deps);
    }

    if (action === "setLipstickStatus") {
      return await setLipstickStatus(event, deps);
    }

    if (action === "importLipsticksCsv") {
      return await importLipsticksCsv(event, deps);
    }

    if (action === "exportLipsticksCsv") {
      return await exportLipsticksCsv(event, deps);
    }

    if (action === "listTests") {
      return await listTests(event, deps);
    }

    if (action === "getTestDetail") {
      return await getTestDetail(event, deps);
    }

    if (action === "listReports") {
      return await listReports(event, deps);
    }

    if (action === "getReportDetail") {
      return await getReportDetail(event, deps);
    }

    if (action === "listOrders") {
      return await listOrders(event, deps);
    }

    if (action === "getOrderDetail") {
      return await getOrderDetail(event, deps);
    }

    if (action === "updateOrderRefundHandling") {
      return await updateOrderRefundHandling(event, deps);
    }

    if (action === "flagReport") {
      return await flagReport(event, deps);
    }

    return unsupported(action);
  } catch (error) {
    return fail("ADMIN_FUNCTION_ERROR", error.message);
  }
}

exports.main = main;
exports.login = login;
exports.logout = logout;
exports.getShell = getShell;
exports.getOverview = getOverview;
exports.listLipsticks = listLipsticks;
exports.saveLipstick = saveLipstick;
exports.setLipstickStatus = setLipstickStatus;
exports.importLipsticksCsv = importLipsticksCsv;
exports.exportLipsticksCsv = exportLipsticksCsv;
exports.listTests = listTests;
exports.getTestDetail = getTestDetail;
exports.listReports = listReports;
exports.getReportDetail = getReportDetail;
exports.listOrders = listOrders;
exports.getOrderDetail = getOrderDetail;
exports.updateOrderRefundHandling = updateOrderRefundHandling;
exports.flagReport = flagReport;
