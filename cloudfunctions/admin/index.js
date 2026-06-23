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
