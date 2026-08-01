const { OVERVIEW_RANGES } = require("./constants");
const { ok } = require("./response");
const { getRuntime, getEventData } = require("./runtime");
const { requireSession } = require("./session");

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

function mapRecentOrder(order) {
  return {
    orderId: order._id,
    status: order.status || "",
    refundStatus: order.refundStatus || "",
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

function divideSafe(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

function buildConversion(metrics) {
  const generationAttempts = metrics.generationSuccessCount + metrics.generationFailureCount;

  return {
    testFromVisitRate: divideSafe(metrics.testsCreated, metrics.visits),
    paymentFromVisitRate: divideSafe(metrics.paidOrderCount, metrics.visits),
    paymentFromTestRate: divideSafe(metrics.paidOrderCount, metrics.testsCreated),
    reportViewRate: divideSafe(metrics.reportViewCount, metrics.testsCreated),
    shareVisitRate: divideSafe(metrics.shareVisitCount, metrics.reportViewCount),
    generationSuccessRate: divideSafe(metrics.generationSuccessCount, generationAttempts),
    averageOrderValueCents: metrics.paidOrderCount
      ? Math.round(metrics.revenueCents / metrics.paidOrderCount)
      : 0,
  };
}

function buildFunnel(metrics) {
  return [
    { label: "访问", value: metrics.visits },
    { label: "创建试色", value: metrics.testsCreated },
    { label: "生成成功", value: metrics.generationSuccessCount },
    { label: "支付订单", value: metrics.paidOrderCount },
    { label: "查看报告", value: metrics.reportViewCount },
    { label: "分享访问", value: metrics.shareVisitCount },
  ];
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

  const [eventsResult, ordersResult, testsResult, reportsResult, providerRunsResult] = await Promise.all([
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

  const recentOrders = orders
    .filter((order) => order.status === "paid")
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, 5)
    .map(mapRecentOrder);

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
  const conversion = buildConversion(metrics);
  const funnel = buildFunnel(metrics);

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
    conversion,
    funnel,
    recentOrders,
    recentGenerationFailures,
    recentExceptionOrders,
    empty,
    emptyMessage: empty ? "当前时间范围内暂无运营数据。" : "",
  });
}

module.exports = {
  getOverview,
};
