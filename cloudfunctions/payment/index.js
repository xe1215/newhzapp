const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const ORDER_AMOUNT_CENTS = 599;
const ORDER_CURRENCY = "CNY";

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
    env: deps && deps.env ? deps.env : process.env,
    id:
      deps && deps.id
        ? deps.id
        : () => `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

function buildOutTradeNo(orderId) {
  return `hz-${String(orderId)}`;
}

async function createReportOrder(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.testId) {
    return fail("INVALID_PAYLOAD", "testId is required");
  }

  const testResult = await runtime.db.collection("try_on_tests").doc(data.testId).get();
  const testRecord = testResult.data || {};

  if (!testRecord._id || testRecord.openid !== openid || !testRecord.activeReportId) {
    return fail("RESOURCE_NOT_FOUND", "Current active report is not available");
  }

  const reportId = testRecord.activeReportId;
  const reportResult = await runtime.db.collection("reports").doc(reportId).get();
  const reportRecord = reportResult.data || {};

  if (!reportRecord._id || reportRecord.openid !== openid || reportRecord.testId !== data.testId) {
    return fail("RESOURCE_NOT_FOUND", "Active report does not belong to current user");
  }

  const now = runtime.now().toISOString();
  const orderId = runtime.id();
  const outTradeNo = buildOutTradeNo(orderId);
  const env = runtime.env || {};

  const order = {
    _id: orderId,
    openid,
    testId: data.testId,
    reportId,
    amountCents: ORDER_AMOUNT_CENTS,
    currency: ORDER_CURRENCY,
    status: "pending",
    refundStatus: "none",
    createdAt: now,
    updatedAt: now,
    paidAt: "",
    refundEligibleAt: "",
    refundReason: "",
    wechatPayment: {
      appId: env.WECHAT_PAY_APP_ID || "",
      mchId: env.WECHAT_PAY_MCH_ID || "",
      notifyUrl: env.WECHAT_PAY_NOTIFY_URL || "",
      outTradeNo,
      prepayId: `mock-prepay-${orderId}`,
      transactionId: "",
    },
  };

  await runtime.db.collection("orders").add({
    data: order,
  });

  return ok({
    orderId,
    testId: data.testId,
    reportId,
    amount: ORDER_AMOUNT_CENTS,
    currency: ORDER_CURRENCY,
    paymentStatus: "pending",
    canPreviewReport: false,
    wechatPayment: {
      outTradeNo,
      prepayId: order.wechatPayment.prepayId,
    },
  });
}

async function confirmPayment(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);

  if (!data.orderId) {
    return fail("INVALID_PAYLOAD", "orderId is required");
  }

  const now = runtime.now().toISOString();
  const orderResult = await runtime.db.collection("orders").doc(data.orderId).get();
  const order = orderResult.data || {};

  if (!order._id) {
    return fail("RESOURCE_NOT_FOUND", "Order does not exist");
  }

  if (order.status === "paid") {
    return ok({
      orderId: order._id,
      reportId: order.reportId,
      paymentStatus: "paid",
      refundStatus: order.refundStatus || "none",
      canViewReport: Boolean(order.canViewReport),
      idempotent: true,
    });
  }

  const reportResult = await runtime.db.collection("reports").doc(order.reportId).get();
  const report = reportResult.data || {};
  const reportCanView =
    Boolean(report._id) &&
    report.openid === order.openid &&
    report.testId === order.testId &&
    Array.isArray(report.paidImages) &&
    report.paidImages.length > 0;

  const refundStatus = reportCanView ? "none" : "pending";
  const orderUpdate = {
    status: "paid",
    paidAt: now,
    updatedAt: now,
    refundStatus,
    refundEligibleAt: refundStatus === "pending" ? now : "",
    refundReason: refundStatus === "pending" ? "REPORT_NOT_VIEWABLE" : "",
    canViewReport: reportCanView,
    wechatPayment: {
      ...(order.wechatPayment || {}),
      transactionId: data.transactionId || "",
    },
  };

  await runtime.db.collection("orders").doc(order._id).update({
    data: orderUpdate,
  });

  if (reportCanView) {
    await runtime.db.collection("reports").doc(order.reportId).update({
      data: {
        unlockedAt: now,
        updatedAt: now,
      },
    });
  }

  await runtime.db.collection("events").add({
    data: {
      type: "payment_success",
      openid: order.openid,
      testId: order.testId,
      orderId: order._id,
      reportId: order.reportId,
      amountCents: order.amountCents,
      currency: order.currency,
      transactionId: data.transactionId || "",
      refundStatus,
      createdAt: now,
    },
  });

  return ok({
    orderId: order._id,
    reportId: order.reportId,
    paymentStatus: "paid",
    refundStatus,
    canViewReport: reportCanView,
    idempotent: false,
  });
}

async function main(event, context, deps) {
  const action = event && event.action;

  if (action === "createReportOrder") {
    return await createReportOrder(event, deps);
  }

  if (action === "confirmPayment") {
    return await confirmPayment(event, deps);
  }

  return unsupported(action);
}

exports.main = main;
exports.createReportOrder = createReportOrder;
exports.confirmPayment = confirmPayment;
