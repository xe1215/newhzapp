const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { getShell } = require("../cloudfunctions/admin/shell");
const admin = require("../cloudfunctions/admin");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function deps() {
  return {
    env: { ADMIN_AUTH_DISABLED: "true" },
    now: () => new Date("2026-09-27T00:00:00.000Z"),
    db: { collection() { throw new Error("shell must not query records"); } },
  };
}

test("admin shell exposes new operational views without reports or recommendation rules", async () => {
  const result = await getShell({ data: { token: "developer" } }, deps());
  assert.equal(result.code, 0);

  const keys = result.data.modules.map((module) => module.key);
  assert.deepEqual(keys, ["overview", "lipsticks", "tags", "recommendationSets", "singleTryOns", "credits", "orders", "logs"]);
  assert.ok(!keys.includes("reports"));
  assert.ok(!keys.includes("recommendationRules"));

  const appSource = fs.readFileSync(path.join(root, "admin", "src", "App.jsx"), "utf8");
  assert.doesNotMatch(appSource, /ReportsPage/);
  assert.doesNotMatch(appSource, /RecommendationRulesPanel/);
});

test("single try-on views show status and error without exposing the original selfie", async () => {
  const job = {
    _id: "job-1", openid: "user-private-1234", testId: "test-1", productId: "lip-1",
    status: "failed", errorCode: "PROVIDER_TIMEOUT", errorMessage: "Timed out",
    selfieFileId: "cloud://private-selfie", beforeImage: "cloud://private-selfie",
    createdAt: "2026-09-27T00:00:00.000Z",
  };
  const runtime = {
    ...deps(),
    db: { collection(name) {
      assert.equal(name, "single_tryon_jobs");
      return {
        get: async () => ({ data: [job] }),
        doc: () => ({ get: async () => ({ data: job }) }),
      };
    } },
  };
  const listed = await admin.main({ action: "listSingleTryOns", data: { token: "developer" } }, {}, runtime);
  const detail = await admin.main({ action: "getSingleTryOnDetail", data: { token: "developer", jobId: "job-1" } }, {}, runtime);
  assert.equal(listed.code, 0);
  assert.equal(detail.code, 0);
  assert.equal(detail.data.status, "failed");
  assert.equal(detail.data.errorCode, "PROVIDER_TIMEOUT");
  assert.equal(detail.data.errorMessage, "Timed out");
  assert.ok(!JSON.stringify({ listed: listed.data, detail: detail.data }).includes("cloud://private-selfie"));
});

test("credit orders filter and paginate across CloudBase result batches", async () => {
  const orders = Array.from({ length: 35 }, (_, index) => ({
    _id: `order-${String(index + 1).padStart(2, "0")}`,
    openid: "buyer-1", status: index < 25 ? "paid" : "pending",
    credits: 20, remainingCredits: 19,
    createdAt: new Date(Date.UTC(2026, 8, 27, 0, index)).toISOString(),
  }));
  const runtime = {
    ...deps(),
    db: { collection(name) {
      assert.equal(name, "credit_orders");
      return {
        skip(offset) { return { limit(size) { return { get: async () => ({ data: orders.slice(offset, offset + size) }) }; } }; },
        limit(size) { return { get: async () => ({ data: orders.slice(0, size) }) }; },
        get: async () => ({ data: orders.slice(0, 20) }),
      };
    } },
  };
  const result = await admin.main({ action: "listCreditOrders", data: {
    token: "developer", filters: { status: "paid", openid: "buyer-1" }, page: 2, pageSize: 10,
  } }, {}, runtime);
  assert.equal(result.code, 0);
  assert.equal(result.data.pagination.total, 25);
  assert.deepEqual(result.data.items.map((item) => item.orderId),
    ["order-15", "order-14", "order-13", "order-12", "order-11", "order-10", "order-09", "order-08", "order-07", "order-06"]);
});

test("retired recommendation-rule actions cannot modify data", async () => {
  const result = await admin.main({ action: "saveRecommendationRule", data: { token: "developer", rule: {} } }, {}, deps());
  assert.equal(result.code, "INVALID_ACTION");
});

test("audit records remain readable only to a developer session", async () => {
  const action = { _id: "audit-1", operation: "lipstick_update", targetType: "lipstick", targetId: "lip-1", createdAt: "2026-09-27T00:00:00.000Z" };
  const database = { collection(name) {
    assert.equal(name, "admin_actions");
    return { get: async () => ({ data: [action] }), doc: () => ({ get: async () => ({ data: action }) }) };
  } };
  const authorized = await admin.main({ action: "listAdminActions", data: { token: "developer" } }, {}, { ...deps(), db: database });
  assert.equal(authorized.code, 0);
  assert.equal(authorized.data.items[0].operation, "lipstick_update");
  const denied = await admin.main({ action: "listAdminActions", data: {} }, {}, { ...deps(), db: database, env: {} });
  assert.equal(denied.code, "UNAUTHORIZED");
});

test("every new operational list and detail requires developer login", async () => {
  const actions = [
    ["listRecommendationSets", {}], ["getRecommendationSetDetail", { setId: "set-1" }],
    ["listSingleTryOns", {}], ["getSingleTryOnDetail", { jobId: "job-1" }],
    ["listCreditAccounts", {}], ["getCreditAccountDetail", { accountId: "user-1" }],
    ["listCreditLedger", {}], ["getCreditLedgerDetail", { ledgerId: "entry-1" }],
    ["listCreditOrders", {}], ["getCreditOrderDetail", { orderId: "order-1" }],
    ["listAdminActions", {}], ["getAdminActionDetail", { actionId: "audit-1" }],
  ];
  for (const [action, data] of actions) {
    const result = await admin.main({ action, data }, {}, { ...deps(), env: {} });
    assert.equal(result.code, "UNAUTHORIZED", action);
  }
});

test("dashboard summary counts the new business without querying legacy reports or orders", async () => {
  const data = {
    recommendation_sets: [{ _id: "set-1", createdAt: "2026-09-26T00:00:00.000Z" }],
    single_tryon_jobs: [
      { _id: "job-1", status: "succeeded", createdAt: "2026-09-26T00:00:00.000Z" },
      { _id: "job-2", status: "failed", errorCode: "TIMEOUT", createdAt: "2026-09-27T00:00:00.000Z" },
    ],
    credit_orders: [{ _id: "order-1", status: "paid", amountCents: 1600, credits: 20, createdAt: "2026-09-26T00:00:00.000Z" }],
  };
  const runtime = { ...deps(), db: { collection(name) {
    assert.ok(Object.hasOwn(data, name), `unexpected collection ${name}`);
    return { get: async () => ({ data: data[name] }) };
  } } };
  const result = await admin.main({ action: "getOperationsSummary", data: { token: "developer", rangeKey: "last7Days" } }, {}, runtime);
  assert.equal(result.code, 0);
  assert.equal(result.data.metrics.recommendationSets, 1);
  assert.equal(result.data.metrics.singleTryOns, 2);
  assert.equal(result.data.metrics.tryOnFailures, 1);
  assert.equal(result.data.metrics.paidCreditOrders, 1);
  assert.equal(result.data.metrics.creditRevenueCents, 1600);
});

test("an uncreated recommendation-set collection appears as an empty view", async () => {
  const runtime = { ...deps(), db: { collection(name) {
    return { get: async () => {
      if (name === "recommendation_sets") throw new Error("database collection not exists");
      return { data: [] };
    } };
  } } };
  const result = await admin.main({ action: "getOperationsSummary", data: { token: "developer" } }, {}, runtime);
  assert.equal(result.code, 0);
  assert.equal(result.data.metrics.recommendationSets, 0);
});

test("account balance and ledger are independently filterable read-only views", async () => {
  const stores = {
    credit_accounts: [
      { _id: "buyer-1", openid: "buyer-1", balance: 19, activeCount: 0 },
      { _id: "buyer-2", openid: "buyer-2", balance: 3, activeCount: 1 },
    ],
    credit_ledger: [
      { _id: "entry-1", openid: "buyer-1", type: "credit_purchase", amount: 20, orderId: "order-1" },
      { _id: "entry-2", openid: "buyer-1", type: "single_tryon_debit", amount: -1, jobId: "job-1" },
    ],
  };
  const runtime = { ...deps(), db: { collection(name) {
    assert.ok(Object.hasOwn(stores, name));
    return { get: async () => ({ data: stores[name] }), doc: (id) => ({ get: async () => ({ data: stores[name].find((item) => item._id === id) || null }) }) };
  } } };
  const accounts = await admin.main({ action: "listCreditAccounts", data: { token: "developer", filters: { openid: "buyer-1" } } }, {}, runtime);
  const ledger = await admin.main({ action: "listCreditLedger", data: { token: "developer", filters: { type: "single_tryon_debit" } } }, {}, runtime);
  assert.deepEqual(accounts.data.items.map((item) => item.balance), [19]);
  assert.deepEqual(ledger.data.items.map((item) => item.amount), [-1]);
  assert.equal(ledger.data.items[0].jobId, "job-1");
});
