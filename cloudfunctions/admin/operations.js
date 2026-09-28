const { ok, fail } = require("./response");
const { getRuntime, getEventData } = require("./runtime");
const { requireSession } = require("./session");
const { OVERVIEW_RANGES } = require("./constants");
const { buildAdminRecordQuery, clone, maskOpenId, normalizeText, numberField, stringField } = require("./utils");

const COLLECTIONS = {
  recommendationSets: "recommendation_sets",
  singleTryOns: "single_tryon_jobs",
  creditAccounts: "credit_accounts",
  creditLedger: "credit_ledger",
  orders: "credit_orders",
  adminActions: "admin_actions",
};

async function readCollection(runtime, collection, filters, fields) {
  const records = [];
  const batchSize = 100;
  const source = runtime.db.collection(collection);
  for (let offset = 0; ; offset += batchSize) {
    const query = offset && typeof source.skip === "function" ? source.skip(offset) : source;
    let result;
    try {
      result = await (typeof query.limit === "function" ? query.limit(batchSize) : query).get();
    } catch (error) {
      const message = String(error && error.message || "");
      if (message.includes("database collection not exists") || message.includes("Db or Table not exist")) break;
      throw error;
    }
    const batch = Array.isArray(result.data) ? result.data : [];
    records.push(...batch);
    if (batch.length < batchSize || typeof source.skip !== "function") break;
  }
  const query = buildAdminRecordQuery(filters, fields || []);
  return records.filter((record) => Object.entries(query).every(([key, value]) => {
    if (key === "createdAt" && value && typeof value === "object") {
      return (!value.$gte || String(record.createdAt || "") >= value.$gte) && (!value.$lt || String(record.createdAt || "") < value.$lt);
    }
    return String(record[key] || "") === String(value);
  })).sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")));
}

function paginate(records, data) {
  const pageSize = Math.min(Math.max(Math.floor(Number(data.pageSize) || 20), 1), 100);
  const page = Math.max(Math.floor(Number(data.page) || 1), 1);
  const total = records.length;
  return { items: records.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) } };
}

function mapSingle(record) {
  return { jobId: record._id, openidMasked: maskOpenId(record.openid), testId: stringField(record.testId, ""), productId: stringField(record.productId, ""), status: stringField(record.status, "unknown"), errorCode: stringField(record.errorCode, ""), errorMessage: stringField(record.errorMessage, ""), resultImage: stringField(record.resultImage || record.afterImage, ""), createdAt: stringField(record.createdAt, ""), updatedAt: stringField(record.updatedAt, "") };
}
function mapSet(record) {
  return { setId: record._id, name: stringField(record.name || record.title, ""), status: stringField(record.status, "active"), productIds: Array.isArray(record.productIds) ? clone(record.productIds) : [], recommendations: Array.isArray(record.recommendations) ? clone(record.recommendations) : [], createdAt: stringField(record.createdAt, ""), updatedAt: stringField(record.updatedAt, "") };
}
function mapAccount(record) { return { accountId: record._id, openidMasked: maskOpenId(record.openid || record._id), balance: numberField(record.balance, 0), activeCount: numberField(record.activeCount, 0), updatedAt: stringField(record.updatedAt, "") }; }
function mapLedger(record) { return { ledgerId: record._id, openidMasked: maskOpenId(record.openid), amount: numberField(record.amount, 0), type: stringField(record.type, ""), orderId: stringField(record.orderId, ""), jobId: stringField(record.jobId, ""), createdAt: stringField(record.createdAt, "") }; }
function mapOrder(record) { return { orderId: record._id, openidMasked: maskOpenId(record.openid), productId: stringField(record.productId, ""), status: stringField(record.status || record.paymentStatus, "unknown"), credits: numberField(record.credits, 0), remainingCredits: numberField(record.remainingCredits, 0), amountCents: numberField(record.amountCents, 0), currency: stringField(record.currency, "CNY"), outTradeNo: stringField(record.outTradeNo, ""), createdAt: stringField(record.createdAt, ""), paidAt: stringField(record.paidAt, "") }; }
function mapAdminAction(record) { return { actionId: record._id, operation: stringField(record.operation, ""), targetType: stringField(record.targetType, ""), targetId: stringField(record.targetId, ""), createdAt: stringField(record.createdAt, "") }; }

async function requireDeveloper(event, deps) { const runtime = getRuntime(deps); const data = getEventData(event); const session = await requireSession(runtime, data.token); return { runtime, data, session }; }
async function listResource(event, deps, kind, fields, mapper) {
  const { runtime, data, session } = await requireDeveloper(event, deps); if (session.code) return session;
  const records = await readCollection(runtime, COLLECTIONS[kind], data.filters, fields); return ok({ ...paginate(records.map(mapper), data) });
}
async function detailResource(event, deps, kind, idField, mapper) {
  const { runtime, data, session } = await requireDeveloper(event, deps); if (session.code) return session;
  const id = normalizeText(data[idField]); if (!id) return fail("INVALID_PAYLOAD", `${idField} is required`);
  const record = (await runtime.db.collection(COLLECTIONS[kind]).doc(id).get()).data || null; if (!record || !record._id) return fail("RESOURCE_NOT_FOUND", "Record was not found"); return ok(mapper(record));
}

const listRecommendationSets = (e, d) => listResource(e, d, "recommendationSets", ["status"], mapSet);
const getRecommendationSetDetail = (e, d) => detailResource(e, d, "recommendationSets", "setId", mapSet);
const listSingleTryOns = (e, d) => listResource(e, d, "singleTryOns", ["openid", "status", "testId", "productId", "errorCode"], mapSingle);
const getSingleTryOnDetail = (e, d) => detailResource(e, d, "singleTryOns", "jobId", mapSingle);
const listCreditAccounts = (e, d) => listResource(e, d, "creditAccounts", ["openid"], mapAccount);
const getCreditAccountDetail = (e, d) => detailResource(e, d, "creditAccounts", "accountId", mapAccount);
const listCreditLedger = (e, d) => listResource(e, d, "creditLedger", ["openid", "type", "orderId", "jobId"], mapLedger);
const getCreditLedgerDetail = (e, d) => detailResource(e, d, "creditLedger", "ledgerId", mapLedger);
const listCreditOrders = (e, d) => listResource(e, d, "orders", ["openid", "status", "productId", "outTradeNo"], mapOrder);
const getCreditOrderDetail = (e, d) => detailResource(e, d, "orders", "orderId", mapOrder);
const listAdminActions = (e, d) => listResource(e, d, "adminActions", ["operation", "targetType", "targetId"], mapAdminAction);
const getAdminActionDetail = (e, d) => detailResource(e, d, "adminActions", "actionId", mapAdminAction);

async function getOperationsSummary(event, deps) {
  const { runtime, data, session } = await requireDeveloper(event, deps);
  if (session.code) return session;
  const range = OVERVIEW_RANGES[data.rangeKey] || OVERVIEW_RANGES.today;
  const bounds = range.getBounds(runtime.now());
  const filters = { startDate: bounds.start.toISOString(), endDate: bounds.end.toISOString() };
  const [sets, jobs, orders] = await Promise.all([
    readCollection(runtime, COLLECTIONS.recommendationSets, filters),
    readCollection(runtime, COLLECTIONS.singleTryOns, filters),
    readCollection(runtime, COLLECTIONS.orders, filters),
  ]);
  const paidOrders = orders.filter((item) => item.status === "paid");
  const failedJobs = jobs.filter((item) => ["failed", "timeout"].includes(item.status));
  const days = [];
  for (let cursor = new Date(bounds.start); cursor < bounds.end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const onDate = (item) => String(item.createdAt || "").slice(0, 10) === date;
    days.push({ date, recommendationSets: sets.filter(onDate).length, singleTryOns: jobs.filter(onDate).length,
      tryOnSuccess: jobs.filter((item) => item.status === "succeeded" && onDate(item)).length,
      paidCreditOrders: paidOrders.filter(onDate).length });
  }
  return ok({
    range: { key: range.key, label: range.label, start: filters.startDate, end: filters.endDate },
    metrics: {
      recommendationSets: sets.length,
      singleTryOns: jobs.length,
      tryOnSuccess: jobs.filter((item) => item.status === "succeeded").length,
      tryOnFailures: failedJobs.length,
      paidCreditOrders: paidOrders.length,
      creditRevenueCents: paidOrders.reduce((sum, item) => sum + Number(item.amountCents || 0), 0),
    },
    trend: days,
    recentCreditOrders: paidOrders.slice(0, 5).map(mapOrder),
    recentTryOnFailures: failedJobs.slice(0, 5).map(mapSingle),
  });
}

module.exports = { listRecommendationSets, getRecommendationSetDetail, listSingleTryOns, getSingleTryOnDetail, listCreditAccounts, getCreditAccountDetail, listCreditLedger, getCreditLedgerDetail, listCreditOrders, getCreditOrderDetail, listAdminActions, getAdminActionDetail, getOperationsSummary };
