const { cloud, createRuntime, ok, fail, unsupported } = require("./business-runtime");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function getRuntime(deps) {
  return createRuntime(deps, {
    env: deps && deps.env ? deps.env : process.env,
  });
}

const PACKAGE_PRICES = Object.freeze({ 1: 100, 20: 1600, 40: 2800, 60: 3600 });

function validMockProduct(product) {
  return product && product.status === "active" && product.mode === "mock" &&
    product.currency === "CNY" && Number.isSafeInteger(product.credits) &&
    product.amountCents === PACKAGE_PRICES[product.credits] && product.bonusCredits === 0;
}

async function listCreditProducts(event, deps) {
  const mode = String((deps && deps.env ? deps.env : process.env).CREDIT_PURCHASE_MODE || "disabled");
  if (mode !== "mock") return ok({ status: "coming_soon", items: [] });
  const runtime = getRuntime(deps);
  const result = await runtime.db.collection("credit_products").where({ status: "active", mode: "mock" }).get();
  const items = (result.data || []).filter(validMockProduct).map(product => ({
    productId: product._id,
    amountCents: product.amountCents,
    currency: product.currency,
    credits: product.credits,
    bonusCredits: product.bonusCredits,
  }));
  return ok({ status: "mock", items });
}

function creditOrderId(openid, idempotencyKey) {
  return `credit-${crypto.createHash("sha256").update(`${openid}:${idempotencyKey}`).digest("hex")}`;
}

function publicCreditOrder(order, idempotent) {
  return {
    orderId: order._id,
    productId: order.productId,
    amountCents: order.amountCents,
    currency: order.currency,
    credits: order.credits + order.bonusCredits,
    paymentStatus: order.status === "paid" ? "paid" : "pending",
    outTradeNo: order.outTradeNo,
    idempotent,
  };
}

async function createCreditOrder(event, deps) {
  const runtime = getRuntime(deps);
  if (String((runtime.env || {}).CREDIT_PURCHASE_MODE || "disabled") !== "mock") {
    return fail("CREDIT_PRODUCTS_UNCONFIRMED", "Credit packages are not available yet");
  }
  const openid = runtime.wxContext && runtime.wxContext.OPENID;
  if (!openid) return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  const data = (event && event.data) || {};
  if (!data.productId || !data.idempotencyKey) {
    return fail("INVALID_PAYLOAD", "productId and idempotencyKey are required");
  }
  if (!runtime.db || typeof runtime.db.runTransaction !== "function") {
    return fail("CREDIT_TRANSACTION_UNAVAILABLE", "Credit order transaction is unavailable");
  }
  const orderId = creditOrderId(openid, String(data.idempotencyKey));
  try {
    const result = await runtime.db.runTransaction(async transaction => {
      const previous = (await transaction.collection("credit_orders").doc(orderId).get()).data || {};
      if (previous._id) {
        if (previous.openid !== openid || previous.productId !== data.productId) {
          return { code: "IDEMPOTENCY_KEY_CONFLICT" };
        }
        return { order: previous, idempotent: true };
      }
      const product = (await transaction.collection("credit_products").doc(data.productId).get()).data || {};
      if (!validMockProduct(product)) return { code: "CREDIT_PRODUCT_UNAVAILABLE" };
      const now = runtime.now().toISOString();
      const order = {
        _id: orderId, openid, productId: product._id,
        amountCents: product.amountCents, currency: product.currency,
        credits: product.credits, bonusCredits: product.bonusCredits,
        unitPriceCents: product.amountCents / product.credits,
        remainingCredits: 0, expiresAt: null,
        status: "pending", mode: "mock", idempotencyKey: String(data.idempotencyKey),
        outTradeNo: `hz${crypto.createHash("sha256").update(orderId).digest("hex").slice(0, 30)}`,
        paymentTransactionId: "", createdAt: now, updatedAt: now, paidAt: "",
      };
      const fields = { ...order };
      delete fields._id;
      await transaction.collection("credit_orders").doc(orderId).set({ data: fields });
      return { order, idempotent: false };
    });
    if (result.code) return fail(result.code, result.code);
    return ok(publicCreditOrder(result.order, result.idempotent));
  } catch (error) {
    return fail("CREDIT_TRANSACTION_FAILED", "Could not create credit order");
  }
}

async function getCreditOrder(event, deps) {
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;
  if (!openid) return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  const orderId = event && event.data && event.data.orderId;
  if (!orderId) return fail("INVALID_PAYLOAD", "orderId is required");
  const result = await runtime.db.collection("credit_orders").doc(orderId).get();
  const order = result.data || {};
  if (!order._id || order.openid !== openid) {
    return fail("RESOURCE_NOT_FOUND", "Credit order does not belong to current user");
  }
  return ok(publicCreditOrder(order, true));
}

async function getCreditBalance(event, deps) {
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;
  if (!openid) return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  const result = await runtime.db.collection("credit_accounts").doc(openid).get();
  const account = result.data || {};
  const balance = Number(account.balance || 0);
  if (!Number.isSafeInteger(balance) || balance < 0) return fail("CREDIT_ACCOUNT_INVALID", "Credit account balance is invalid");
  return ok({ balance });
}

async function getCreditRefundQuote(event, deps) {
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;
  if (!openid) return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  const orderId = event && event.data && event.data.orderId;
  if (!orderId) return fail("INVALID_PAYLOAD", "orderId is required");
  const result = await runtime.db.collection("credit_orders").doc(orderId).get();
  const order = result.data || {};
  if (!order._id || order.openid !== openid) {
    return fail("RESOURCE_NOT_FOUND", "Credit order does not belong to current user");
  }
  if (order.status !== "paid" || order.mode !== "mock" ||
      !Number.isSafeInteger(order.remainingCredits) || order.remainingCredits < 0 ||
      !Number.isSafeInteger(order.unitPriceCents) || order.unitPriceCents < 1 ||
      !Number.isSafeInteger(order.remainingCredits * order.unitPriceCents) ||
      order.remainingCredits * order.unitPriceCents > order.amountCents) {
    return fail("CREDIT_ORDER_NOT_REFUNDABLE", "No verified refundable purchase balance is available");
  }
  return ok({ orderId, refundableCredits: order.remainingCredits,
    unitPriceCents: order.unitPriceCents,
    refundAmountCents: order.remainingCredits * order.unitPriceCents,
    currency: order.currency, status: "quote_only" });
}

async function settleVerifiedCreditOrder(notice, deps) {
  if (!deps || deps.verifiedCallback !== true) {
    return fail("PAYMENT_CALLBACK_UNVERIFIED", "Payment callback has not been verified");
  }
  const runtime = getRuntime(deps);
  if (String((runtime.env || {}).CREDIT_PURCHASE_MODE || "disabled") !== "mock") {
    return fail("CREDIT_PAYMENT_NOT_READY", "Real credit payment is not enabled");
  }
  if (!notice || typeof notice.outTradeNo !== "string" || !notice.outTradeNo || notice.outTradeNo.length > 32 ||
      typeof notice.transactionId !== "string" || !notice.transactionId || notice.transactionId.length > 64 ||
      !Number.isSafeInteger(notice.amountCents) || notice.amountCents < 1 ||
      notice.currency !== "CNY" || typeof notice.payerOpenid !== "string" || !notice.payerOpenid ||
      notice.tradeState !== "SUCCESS") {
    return fail("PAYMENT_NOTICE_INVALID", "Successful verified payment details are required");
  }
  const found = await runtime.db.collection("credit_orders").where({ outTradeNo: notice.outTradeNo }).get();
  if (!found.data || found.data.length !== 1) {
    return fail("CREDIT_ORDER_NOT_FOUND", "Matching credit order was not found");
  }
  const orderId = found.data[0]._id;
  if (!runtime.db || typeof runtime.db.runTransaction !== "function") {
    return fail("CREDIT_TRANSACTION_UNAVAILABLE", "Credit payment transaction is unavailable");
  }
  try {
    const result = await runtime.db.runTransaction(async transaction => {
      const order = (await transaction.collection("credit_orders").doc(orderId).get()).data || {};
      if (!order._id || order.outTradeNo !== notice.outTradeNo || order.mode !== "mock") {
        return { code: "CREDIT_ORDER_INVALID" };
      }
      if (order.amountCents !== notice.amountCents || order.currency !== notice.currency ||
          order.openid !== notice.payerOpenid) {
        return { code: "PAYMENT_NOTICE_MISMATCH" };
      }
      if (order.status === "paid") {
        return order.paymentTransactionId === notice.transactionId
          ? { order, idempotent: true }
          : { code: "PAYMENT_TRANSACTION_CONFLICT" };
      }
      if (order.status !== "pending") return { code: "CREDIT_ORDER_INVALID" };
      if (order.bonusCredits !== 0 || order.amountCents !== PACKAGE_PRICES[order.credits] ||
          order.unitPriceCents !== order.amountCents / order.credits || order.expiresAt !== null) {
        return { code: "CREDIT_ORDER_INVALID" };
      }
      const ledgerId = `purchase-${crypto.createHash("sha256").update(notice.transactionId).digest("hex")}`;
      const previous = (await transaction.collection("credit_ledger").doc(ledgerId).get()).data || {};
      if (previous._id) return { code: "PAYMENT_TRANSACTION_CONFLICT" };
      const account = (await transaction.collection("credit_accounts").doc(order.openid).get()).data || {};
      const balance = Number(account.balance || 0);
      const purchaseSequence = Number(account.purchaseSequence || 0) + 1;
      const granted = order.credits + order.bonusCredits;
      if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(granted) || granted < 1 ||
          !Number.isSafeInteger(balance + granted) || !Number.isSafeInteger(purchaseSequence)) {
        return { code: "CREDIT_ACCOUNT_INVALID" };
      }
      const now = runtime.now().toISOString();
      const accountFields = { ...account };
      delete accountFields._id;
      await transaction.collection("credit_accounts").doc(order.openid).set({ data: {
        ...accountFields, openid: order.openid, balance: balance + granted,
        hasPurchaseLots: true, purchaseSequence, updatedAt: now,
      } });
      await transaction.collection("credit_ledger").doc(ledgerId).set({ data: {
        openid: order.openid, orderId: order._id, type: "credit_purchase", amount: granted,
        transactionId: notice.transactionId, createdAt: now,
      } });
      const paid = { ...order, status: "paid", remainingCredits: granted, purchaseSequence,
        paymentTransactionId: notice.transactionId, paidAt: now, updatedAt: now };
      await transaction.collection("credit_orders").doc(orderId).update({ data: {
        status: "paid", remainingCredits: granted, purchaseSequence,
        paymentTransactionId: notice.transactionId, paidAt: now, updatedAt: now,
      } });
      return { order: paid, idempotent: false };
    });
    if (result.code) return fail(result.code, result.code);
    return ok(publicCreditOrder(result.order, result.idempotent));
  } catch (error) {
    return fail("CREDIT_TRANSACTION_FAILED", "Could not settle credit order");
  }
}

async function main(event, context, deps) {
  const action = event && event.action;

  if (action === "listCreditProducts") {
    return await listCreditProducts(event, deps);
  }

  if (action === "createCreditOrder") {
    return await createCreditOrder(event, deps);
  }

  if (action === "getCreditOrder") {
    return await getCreditOrder(event, deps);
  }

  if (action === "getCreditBalance") {
    return await getCreditBalance(event, deps);
  }

  if (action === "getCreditRefundQuote") {
    return await getCreditRefundQuote(event, deps);
  }

  if (action === "confirmCreditOrder") {
    return fail("PAYMENT_CONFIRMATION_UNTRUSTED", "Payment must be confirmed by a verified server callback");
  }

  return unsupported(action);
}

exports.main = main;
exports.settleVerifiedCreditOrder = settleVerifiedCreditOrder;
