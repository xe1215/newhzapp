const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID || "";
const region = import.meta.env.VITE_CLOUDBASE_REGION || "ap-shanghai";
const accessKey = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || "";
const previewEnabled = String(import.meta.env.VITE_ADMIN_ENABLE_PREVIEW || "").toLowerCase() === "true";
const PREVIEW_TOKEN = "__admin_preview__";

let sdkRuntime = null;
let sdkRuntimeReady = null;
let cloudbaseModulePromise = null;
let previewLipsticks = [];

const runtimeDebugState = {
  envId,
  region,
  accessKeyConfigured: Boolean(accessKey),
  previewEnabled,
  isPreviewMode: false,
  runtimeSource: "unavailable",
  lastAuthAttempt: "idle",
  lastAuthResult: "idle",
  lastAction: "",
  lastError: "",
};

function normalizePreviewText(value) {
  return String(value || "").trim();
}

function normalizePreviewTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePreviewText(item)).filter(Boolean);
  }

  return normalizePreviewText(value)
    .split("|")
    .map((item) => normalizePreviewText(item))
    .filter(Boolean);
}

function buildPreviewLipstickFilters(records) {
  return {
    brands: [...new Set(records.map((item) => normalizePreviewText(item.brand)).filter(Boolean))].sort(),
    skinToneTags: [
      ...new Set(records.flatMap((item) => normalizePreviewTags(item.skinToneTags)).filter(Boolean)),
    ].sort(),
    statuses: ["active", "inactive"],
  };
}

function filterPreviewLipsticks(records, filters) {
  const safeFilters = filters || {};

  return records.filter((item) => {
    if (safeFilters.brand && item.brand !== safeFilters.brand) {
      return false;
    }

    if (safeFilters.status && item.status !== safeFilters.status) {
      return false;
    }

    if (safeFilters.skinToneTag) {
      const tags = normalizePreviewTags(item.skinToneTags);
      if (!tags.includes(safeFilters.skinToneTag)) {
        return false;
      }
    }

    if (safeFilters.budgetMin && Number(item.budgetMin || 0) < Number(safeFilters.budgetMin)) {
      return false;
    }

    if (safeFilters.budgetMax && Number(item.budgetMax || 0) > Number(safeFilters.budgetMax)) {
      return false;
    }

    return true;
  });
}

function upsertPreviewLipstick(lipstick) {
  const now = new Date().toISOString();
  const input = lipstick || {};
  const id = input._id || `preview-lipstick-${Date.now()}`;
  const previous = previewLipsticks.find((item) => item._id === id);
  const record = {
    _id: id,
    brand: normalizePreviewText(input.brand),
    shadeName: normalizePreviewText(input.shadeName),
    shadeCode: normalizePreviewText(input.shadeCode),
    colorHex: normalizePreviewText(input.colorHex).toUpperCase(),
    skinToneTags: normalizePreviewTags(input.skinToneTags),
    budgetMin: Number(input.budgetMin || 0),
    budgetMax: Number(input.budgetMax || 0),
    status: normalizePreviewText(input.status) || "active",
    createdAt: previous && previous.createdAt ? previous.createdAt : now,
    updatedAt: now,
  };

  previewLipsticks = previous
    ? previewLipsticks.map((item) => (item._id === id ? record : item))
    : [...previewLipsticks, record];

  return record;
}

function isLocalPreviewMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    previewEnabled &&
    import.meta.env.DEV &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
  );
}

function updateRuntimeDebug(patch) {
  Object.assign(runtimeDebugState, patch);
  runtimeDebugState.isPreviewMode = isLocalPreviewMode();
}

function isPreviewToken(token) {
  return token === PREVIEW_TOKEN;
}

async function loadCloudbaseSdk() {
  if (!cloudbaseModulePromise) {
    cloudbaseModulePromise = import("@cloudbase/js-sdk").then((module) => module.default || module);
  }

  return cloudbaseModulePromise;
}

function buildPreviewShell() {
  return {
    viewer: {
      role: "preview",
    },
    modules: [
      { key: "overview", label: "运营仪表盘", path: "/overview" },
      { key: "lipsticks", label: "口红库维护", path: "/lipsticks" },
      { key: "tests", label: "测试记录", path: "/tests" },
      { key: "reports", label: "报告记录", path: "/reports" },
      { key: "orders", label: "订单与退款", path: "/orders" },
      { key: "logs", label: "生成与事件日志", path: "/logs" },
    ],
  };
}

function buildPreviewOverview(rangeKey) {
  const metrics = {
    visits: 1286,
    testsCreated: 412,
    reportsCreated: 356,
    generationSuccessCount: 329,
    generationFailureCount: 27,
    paidOrderCount: 96,
    revenueCents: 57504,
    reportViewCount: 284,
    shareVisitCount: 173,
  };
  const generationAttempts = metrics.generationSuccessCount + metrics.generationFailureCount;
  const conversion = {
    testFromVisitRate: metrics.visits ? metrics.testsCreated / metrics.visits : 0,
    paymentFromVisitRate: metrics.visits ? metrics.paidOrderCount / metrics.visits : 0,
    paymentFromTestRate: metrics.testsCreated ? metrics.paidOrderCount / metrics.testsCreated : 0,
    reportViewRate: metrics.testsCreated ? metrics.reportViewCount / metrics.testsCreated : 0,
    shareVisitRate: metrics.reportViewCount ? metrics.shareVisitCount / metrics.reportViewCount : 0,
    generationSuccessRate: generationAttempts ? metrics.generationSuccessCount / generationAttempts : 0,
    averageOrderValueCents: metrics.paidOrderCount ? Math.round(metrics.revenueCents / metrics.paidOrderCount) : 0,
  };

  return {
    rangeKey: rangeKey || "today",
    empty: false,
    emptyMessage: "",
    sampleHint: "当前为本地预览样例数据，接入 CloudBase 后会替换成真实运营数据。",
    metrics,
    conversion,
    funnel: [
      { label: "访问", value: metrics.visits },
      { label: "创建试色", value: metrics.testsCreated },
      { label: "生成成功", value: metrics.generationSuccessCount },
      { label: "支付订单", value: metrics.paidOrderCount },
      { label: "查看报告", value: metrics.reportViewCount },
      { label: "分享访问", value: metrics.shareVisitCount },
    ],
    recentOrders: [
      {
        orderId: "preview-order-316",
        status: "paid",
        refundStatus: "none",
        amountCents: 899,
        currency: "CNY",
        createdAt: "2026-07-01T10:18:00.000Z",
        updatedAt: "2026-07-01T10:18:00.000Z",
      },
      {
        orderId: "preview-order-311",
        status: "paid",
        refundStatus: "pending_review",
        amountCents: 599,
        currency: "CNY",
        createdAt: "2026-07-01T09:26:00.000Z",
        updatedAt: "2026-07-01T09:33:00.000Z",
      },
      {
        orderId: "preview-order-305",
        status: "paid",
        refundStatus: "none",
        amountCents: 599,
        currency: "CNY",
        createdAt: "2026-07-01T08:41:00.000Z",
        updatedAt: "2026-07-01T08:41:00.000Z",
      },
    ],
    recentGenerationFailures: [
      {
        runId: "preview-run-1024",
        provider: "aliyun",
        status: "failed",
        errorCode: "WATERMARK_TIMEOUT",
        errorMessage: "水印图合成超时，已建议重试。",
        createdAt: "2026-07-01T09:12:00.000Z",
      },
      {
        runId: "preview-run-1021",
        provider: "aliyun",
        status: "failed",
        errorCode: "SOURCE_IMAGE_MISSING",
        errorMessage: "原始自拍文件不存在，未进入正式生成。",
        createdAt: "2026-07-01T08:47:00.000Z",
      },
      {
        runId: "preview-run-1018",
        provider: "tencent",
        status: "failed",
        errorCode: "MODEL_BUSY",
        errorMessage: "模型队列繁忙，排队超过阈值后失败。",
        createdAt: "2026-07-01T08:21:00.000Z",
      },
    ],
    recentExceptionOrders: [
      {
        orderId: "preview-order-302",
        status: "paid",
        refundStatus: "pending_review",
        refundReason: "用户反馈报告未解锁，待核对支付回调。",
        amountCents: 599,
        currency: "CNY",
        createdAt: "2026-07-01T07:58:00.000Z",
        updatedAt: "2026-07-01T08:10:00.000Z",
      },
      {
        orderId: "preview-order-298",
        status: "paid",
        refundStatus: "manual_refunded",
        refundReason: "生成异常后人工退款，待补充处理备注。",
        amountCents: 599,
        currency: "CNY",
        createdAt: "2026-07-01T06:43:00.000Z",
        updatedAt: "2026-07-01T07:20:00.000Z",
      },
    ],
  };
}

function buildPreviewListResponse(extra) {
  return {
    items: [],
    records: [],
    availableFilters: {
      brands: [],
      skinToneTags: [],
      statuses: ["active", "inactive"],
    },
    ...(extra || {}),
  };
}

function createPreviewListResponse(extra) {
  return buildPreviewListResponse(extra);
}

function createPreviewRecordDetail(defaultId, idValue, extra) {
  return {
    ...extra,
    ...defaultId,
    ...idValue,
  };
}

function getBrowserAuth(app) {
  if (!app || typeof app.auth !== "function") {
    return null;
  }

  return app.auth();
}

async function getBrowserSession(auth) {
  if (!auth || typeof auth.getSession !== "function") {
    return null;
  }

  try {
    const sessionState = await auth.getSession();
    return sessionState && sessionState.data ? sessionState.data.session || null : null;
  } catch (error) {
    return null;
  }
}

function isAnonymousSession(session) {
  return Boolean(session && session.user && session.user.is_anonymous);
}

async function ensureBrowserPasswordSession(app, username, password) {
  const auth = getBrowserAuth(app);

  if (!auth || typeof auth.signInWithPassword !== "function") {
    updateRuntimeDebug({
      lastAuthResult: "password-auth-unavailable",
    });
    throw new Error("CloudBase username/password auth is unavailable for the developer console.");
  }

  const existingSession = await getBrowserSession(auth);
  if (existingSession && !isAnonymousSession(existingSession)) {
    updateRuntimeDebug({
      lastAuthResult: "session-already-available",
    });
    return existingSession;
  }

  if (existingSession && isAnonymousSession(existingSession) && typeof auth.signOut === "function") {
    await auth.signOut();
  }

  updateRuntimeDebug({
    lastAuthAttempt: "sign-in-with-password",
    lastAuthResult: "signing-in",
  });

  const result = await auth.signInWithPassword({
    username,
    password,
  });

  if (result && result.error) {
    updateRuntimeDebug({
      lastAuthResult: "password-sign-in-failed",
      lastError: String(result.error.message || "CloudBase username/password sign-in failed."),
    });
    throw new Error(result.error.message || "CloudBase username/password sign-in failed.");
  }

  const signedInSession = result && result.data ? result.data.session || null : null;
  if (!signedInSession || isAnonymousSession(signedInSession)) {
    updateRuntimeDebug({
      lastAuthResult: "password-sign-in-missing-session",
    });
    throw new Error("CloudBase username/password sign-in did not produce a usable session.");
  }

  updateRuntimeDebug({
    lastAuthResult: "password-session-ready",
  });

  return signedInSession;
}

async function createBrowserCloudRuntime() {
  if (!envId) {
    updateRuntimeDebug({
      runtimeSource: "missing-env",
      lastError: "Cloud runtime is unavailable because VITE_CLOUDBASE_ENV_ID is missing.",
    });
    return null;
  }

  if (!accessKey) {
    updateRuntimeDebug({
      runtimeSource: "missing-access-key",
      lastAuthResult: "access-key-required",
      lastError: "CloudBase Web access key is required for the developer console.",
    });
    return null;
  }

  const cloudbase = await loadCloudbaseSdk();
  const app = cloudbase.init({
    env: envId,
    region,
    accessKey,
    auth: {
      detectSessionInUrl: true,
    },
  });

  return {
    app,
    async ensureReady() {
      if (!sdkRuntimeReady) {
        sdkRuntimeReady = Promise.resolve()
          .then(async () => {
            updateRuntimeDebug({
              runtimeSource: "cloudbase-js-sdk",
              lastAuthAttempt: "using-access-key-runtime",
              lastError: "",
            });

            if (!app.auth || typeof app.auth !== "function") {
              updateRuntimeDebug({
                lastAuthResult: "auth-module-missing",
              });
              return;
            }

            const auth = getBrowserAuth(app);

            if (await getBrowserSession(auth)) {
              updateRuntimeDebug({
                lastAuthResult: "session-already-available",
              });
              return;
            }

            updateRuntimeDebug({
              lastAuthResult: "access-key-ready",
            });
          })
          .catch((error) => {
            updateRuntimeDebug({
              lastAuthResult: "auth-failed",
              lastError: String((error && error.message) || error || "CloudBase auth bootstrap failed."),
            });
            sdkRuntimeReady = null;
            throw error;
          });
      }

      return sdkRuntimeReady;
    },
    async ensureDeveloperIdentity(username, password) {
      await this.ensureReady();
      return ensureBrowserPasswordSession(app, username, password);
    },
    async callFunction(payload) {
      await this.ensureReady();
      return app.callFunction(payload);
    },
  };
}

async function getCloudRuntime() {
  if (
    window.__ADMIN_CLOUD__ &&
    typeof window.__ADMIN_CLOUD__.callFunction === "function" &&
    window.wx &&
    window.wx.cloud &&
    typeof window.wx.cloud.callFunction === "function"
  ) {
    updateRuntimeDebug({
      runtimeSource: "wx-cloud-bridge",
      lastError: "",
    });
    return window.__ADMIN_CLOUD__;
  }

  if (!sdkRuntime) {
    sdkRuntime = await createBrowserCloudRuntime();
  }

  if (sdkRuntime && typeof sdkRuntime.callFunction === "function") {
    updateRuntimeDebug({
      runtimeSource: "cloudbase-js-sdk",
    });
    return sdkRuntime;
  }

  updateRuntimeDebug({
    runtimeSource: "unavailable",
    lastError:
      "Cloud runtime is unavailable. Set VITE_CLOUDBASE_ENV_ID and VITE_CLOUDBASE_ACCESS_KEY for browser access.",
  });
  throw new Error(
    "Cloud runtime is unavailable. Set VITE_CLOUDBASE_ENV_ID and VITE_CLOUDBASE_ACCESS_KEY for browser access."
  );
}

async function invokeAdmin(action, data) {
  let response;

  updateRuntimeDebug({
    lastAction: action,
    lastError: "",
  });

  try {
    const runtime = await getCloudRuntime();
    response = await runtime.callFunction({
      name: "admin",
      data: {
        action,
        data: data || {},
      },
    });
  } catch (error) {
    const message = String((error && error.message) || "");

    if (
      message.includes("access key") ||
      message.includes("accessKey") ||
      message.includes("credentials not found") ||
      message.includes("without credentials")
    ) {
      updateRuntimeDebug({
        lastError: `Auth stage failed during "${action}": ${message}`,
      });
      throw new Error("CloudBase browser auth failed. Please configure a valid Web access key.");
    }

    updateRuntimeDebug({
      lastError: `Function call failed during "${action}": ${message || "Unknown callFunction error."}`,
    });
    throw error;
  }

  const result = response && response.result ? response.result : {};

  if (result.code !== 0) {
    updateRuntimeDebug({
      lastError: `Admin action "${action}" failed: ${result.message || result.code || "Unknown admin error."}`,
    });
    throw new Error(result.message || "Admin request failed.");
  }

  return result.data || {};
}

function invokeWithPreview(token, action, data, previewFactory) {
  if (isPreviewToken(token)) {
    return Promise.resolve(typeof previewFactory === "function" ? previewFactory() : previewFactory);
  }

  return invokeAdmin(action, data);
}

export function login(username, password) {
  if (isLocalPreviewMode()) {
    return Promise.resolve({
      token: PREVIEW_TOKEN,
      preview: true,
      username: username || "preview",
      password: password ? "accepted" : "accepted",
    });
  }

  return getCloudRuntime().then((runtime) => {
    if (runtime && typeof runtime.ensureDeveloperIdentity === "function") {
      return runtime
        .ensureDeveloperIdentity(username, password)
        .then(() => invokeAdmin("login", { username, password }));
    }

    return invokeAdmin("login", { username, password });
  });
}

export function logout(token) {
  return invokeWithPreview(token, "logout", { token }, { ok: true });
}

export function getShell(token) {
  return invokeWithPreview(token, "getShell", { token }, () => buildPreviewShell());
}

export function getOverview(token, rangeKey) {
  return invokeWithPreview(token, "getOverview", { token, rangeKey }, () => buildPreviewOverview(rangeKey));
}

export function listLipsticks(token, filters) {
  return invokeWithPreview(token, "listLipsticks", { token, filters: filters || {} }, () => {
    const records = filterPreviewLipsticks(previewLipsticks, filters);
    return createPreviewListResponse({
      records,
      availableFilters: buildPreviewLipstickFilters(previewLipsticks),
    });
  });
}

export function saveLipstick(token, lipstick) {
  return invokeWithPreview(token, "saveLipstick", { token, lipstick }, () => ({
    record: upsertPreviewLipstick(lipstick),
  }));
}

export function setLipstickStatus(token, lipstickId, status) {
  return invokeWithPreview(token, "setLipstickStatus", { token, lipstickId, status }, () => {
    const previous = previewLipsticks.find((item) => item._id === lipstickId) || {
      _id: lipstickId || `preview-lipstick-${Date.now()}`,
    };
    return { record: upsertPreviewLipstick({ ...previous, status }) };
  });
}

export function importLipsticksCsv(token, csvText) {
  return invokeWithPreview(token, "importLipsticksCsv", { token, csvText }, () => {
    const lines = String(csvText || "")
      .split(/\r?\n/)
      .filter(Boolean);
    const headers = (lines[0] || "").split(",").map((item) => item.trim());
    lines.slice(1).forEach((line) => {
      const values = line.split(",").map((item) => item.trim());
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      upsertPreviewLipstick(record);
    });

    return {
      importedCount: Math.max(lines.length - 1, 0),
    };
  });
}

export function exportLipsticksCsv(token) {
  return invokeWithPreview(token, "exportLipsticksCsv", { token }, () => {
    const header = "brand,shadeName,shadeCode,colorHex,skinToneTags,budgetMin,budgetMax,status";
    const rows = previewLipsticks.map((item) =>
      [
        item.brand,
        item.shadeName,
        item.shadeCode,
        item.colorHex,
        normalizePreviewTags(item.skinToneTags).join("|"),
        item.budgetMin,
        item.budgetMax,
        item.status,
      ].join(",")
    );

    return {
      fileName: "lipsticks-preview.csv",
      csvText: [header, ...rows].join("\n"),
    };
  });
}

export function listTests(token, filters) {
  return invokeWithPreview(token, "listTests", { token, filters: filters || {} }, () => createPreviewListResponse());
}

export function getTestDetail(token, testId) {
  return invokeWithPreview(token, "getTestDetail", { token, testId }, () =>
    createPreviewRecordDetail(
      {},
      { testId: testId || "preview-test" },
      {
        openid: "preview-openid",
        status: "preview",
        currentReportId: "",
        selfieFileId: "",
        preferences: {},
        statuses: {
          safetyStatus: "",
          qualityStatus: "",
          generationStatus: "",
        },
        lifecycle: {},
        previewRegenerateCount: 0,
        maxPreviewRegenerateCount: 0,
      }
    )
  );
}

export function listReports(token, filters) {
  return invokeWithPreview(token, "listReports", { token, filters: filters || {} }, () => createPreviewListResponse());
}

export function getReportDetail(token, reportId) {
  return invokeWithPreview(token, "getReportDetail", { token, reportId }, () =>
    createPreviewRecordDetail(
      {},
      { reportId: reportId || "preview-report" },
      {
        testId: "",
        openid: "preview-openid",
        status: "preview",
        unlock: { unlocked: false, unlockedAt: "" },
        assets: { previewImages: [], paidImages: [], shareCardImages: [] },
        snapshot: {},
        audit: {},
        createdAt: "",
        updatedAt: "",
      }
    )
  );
}

export function listOrders(token, filters) {
  return invokeWithPreview(token, "listOrders", { token, filters: filters || {} }, () => createPreviewListResponse());
}

export function getOrderDetail(token, orderId) {
  return invokeWithPreview(token, "getOrderDetail", { token, orderId }, () =>
    createPreviewRecordDetail(
      {},
      { orderId: orderId || "preview-order" },
      {
        openid: "preview-openid",
        status: "preview",
        refundStatus: "pending",
        refundReason: "",
        adminNote: "",
        amountCents: 0,
        currency: "CNY",
      }
    )
  );
}

export function listProviderRuns(token, filters) {
  return invokeWithPreview(
    token,
    "listProviderRuns",
    { token, filters: filters || {} },
    () => createPreviewListResponse()
  );
}

export function getProviderRunDetail(token, runId) {
  return invokeWithPreview(token, "getProviderRunDetail", { token, runId }, () =>
    createPreviewRecordDetail(
      {},
      { runId: runId || "preview-run" },
      {
        openid: "preview-openid",
        durationMs: 0,
        originalImageFileId: "",
        watermarkedImageFileId: "",
        errorCode: "",
        errorMessage: "",
      }
    )
  );
}

export function listEvents(token, filters) {
  return invokeWithPreview(token, "listEvents", { token, filters: filters || {} }, () => createPreviewListResponse());
}

export function getEventDetail(token, eventId) {
  return invokeWithPreview(token, "getEventDetail", { token, eventId }, () =>
    createPreviewRecordDetail(
      {},
      { eventId: eventId || "preview-event" },
      {
        openid: "preview-openid",
        eventName: "preview_event",
        metadata: {},
      }
    )
  );
}

export function exportEventsCsv(token, filters) {
  return invokeWithPreview(token, "exportEventsCsv", { token, filters: filters || {} }, () => ({
    fileName: "events-preview.csv",
    csvText: "eventId,eventName,openid,testId,reportId,orderId,shareId,metadata,createdAt",
  }));
}

export function updateOrderRefundHandling(token, orderId, payload) {
  return invokeWithPreview(
    token,
    "updateOrderRefundHandling",
    {
      token,
      orderId,
      refundStatus: payload.refundStatus,
      refundReason: payload.refundReason,
      adminNote: payload.adminNote,
    },
    () => ({
      orderId: orderId || "preview-order",
      refundStatus: payload.refundStatus,
      refundReason: payload.refundReason,
      adminNote: payload.adminNote,
      updatedAt: new Date().toISOString(),
    })
  );
}

export function flagReport(token, reportId, operation, reason) {
  return invokeWithPreview(
    token,
    "flagReport",
    {
      token,
      reportId,
      operation,
      reason,
    },
    () => ({
      reportId: reportId || "preview-report",
      status: operation || "preview",
      reason: reason || "",
      updatedAt: new Date().toISOString(),
    })
  );
}

export function getAdminRuntimeDebug() {
  updateRuntimeDebug({
    hasWindowCloud:
      typeof window !== "undefined" &&
      Boolean(window.__ADMIN_CLOUD__) &&
      typeof window.__ADMIN_CLOUD__.callFunction === "function",
    hasWxCloud:
      typeof window !== "undefined" &&
      Boolean(window.wx) &&
      Boolean(window.wx && window.wx.cloud) &&
      typeof window.wx.cloud.callFunction === "function",
  });

  return { ...runtimeDebugState };
}

export function getPreviewToken() {
  return PREVIEW_TOKEN;
}
