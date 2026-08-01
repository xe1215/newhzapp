const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
      init() {},
      database() {
        throw new Error("Test must inject a fake database");
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

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

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createFilteredCollection(records) {
  const chain = {
    where(query) {
      const createdAt = query && query.createdAt ? query.createdAt : {};
      const filtered = records.filter((item) => {
        const value = String(item.createdAt || "");
        if (createdAt.$gte && value < createdAt.$gte) {
          return false;
        }
        if (createdAt.$lt && value >= createdAt.$lt) {
          return false;
        }
        return true;
      });

      return createFilteredCollection(filtered);
    },
    orderBy(field, direction) {
      const sorted = [...records].sort((left, right) => {
        const leftValue = String(left[field] || "");
        const rightValue = String(right[field] || "");
        return direction === "desc" ? rightValue.localeCompare(leftValue) : leftValue.localeCompare(rightValue);
      });

      return createFilteredCollection(sorted);
    },
    limit(size) {
      return createFilteredCollection(records.slice(0, size));
    },
    async get() {
      return { data: clone(records) };
    },
  };

  return chain;
}

function createDb(seed) {
  return {
    collection(name) {
      return createFilteredCollection(seed[name] || []);
    },
  };
}

test("overview aggregates real operations dashboard data from events, tests, reports, orders, and provider runs", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const db = createDb({
    events: [
      { _id: "evt-1", eventName: "page_view", createdAt: "2026-07-01T01:00:00.000Z" },
      { _id: "evt-2", eventName: "page_view", createdAt: "2026-07-01T02:00:00.000Z" },
      { _id: "evt-3", eventName: "generation_success", createdAt: "2026-07-01T03:00:00.000Z" },
      { _id: "evt-4", eventName: "generation_fail", createdAt: "2026-07-01T04:00:00.000Z" },
      { _id: "evt-5", eventName: "report_view", createdAt: "2026-07-01T05:00:00.000Z" },
      { _id: "evt-6", eventName: "share_visit", createdAt: "2026-07-01T06:00:00.000Z" },
    ],
    try_on_tests: [
      { _id: "test-1", createdAt: "2026-07-01T01:30:00.000Z" },
      { _id: "test-2", createdAt: "2026-07-01T02:30:00.000Z" },
    ],
    reports: [{ _id: "report-1", createdAt: "2026-07-01T03:30:00.000Z" }],
    orders: [
      {
        _id: "order-1",
        status: "paid",
        refundStatus: "none",
        amountCents: 599,
        currency: "CNY",
        createdAt: "2026-07-01T04:30:00.000Z",
        updatedAt: "2026-07-01T04:35:00.000Z",
      },
      {
        _id: "order-2",
        status: "paid",
        refundStatus: "pending",
        refundReason: "用户申请退款",
        amountCents: 899,
        currency: "CNY",
        createdAt: "2026-07-01T05:30:00.000Z",
        updatedAt: "2026-07-01T05:35:00.000Z",
      },
    ],
    provider_runs: [
      {
        _id: "run-1",
        provider: "aliyun",
        status: "failed",
        errorCode: "MODEL_BUSY",
        errorMessage: "模型繁忙",
        createdAt: "2026-07-01T06:30:00.000Z",
      },
    ],
  });

  const result = await adminFunction.main(
    {
      action: "getOverview",
      data: {
        token: "auth-disabled",
        rangeKey: "today",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_AUTH_DISABLED: "true",
      },
      now: () => new Date("2026-07-01T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.metrics.visits, 6);
  assert.strictEqual(result.data.metrics.testsCreated, 2);
  assert.strictEqual(result.data.metrics.reportsCreated, 1);
  assert.strictEqual(result.data.metrics.paidOrderCount, 2);
  assert.strictEqual(result.data.metrics.revenueCents, 1498);
  assert.strictEqual(result.data.metrics.generationFailureCount, 1);
  assert.strictEqual(result.data.conversion.paymentFromVisitRate, 2 / 6);
  assert.strictEqual(result.data.conversion.paymentFromTestRate, 1);
  assert.strictEqual(result.data.funnel.length, 6);
  assert.strictEqual(result.data.funnel[0].label, "访问");
  assert.strictEqual(result.data.funnel[3].label, "支付订单");
  assert.strictEqual(result.data.recentGenerationFailures.length, 1);
  assert.strictEqual(result.data.recentExceptionOrders.length, 1);
  assert.strictEqual(result.data.recentExceptionOrders[0].orderId, "order-2");
  assert.strictEqual(result.data.empty, false);
  assert.strictEqual(result.data.emptyMessage, "");
});

test("order list preserves timestamps needed by overview fallback recent orders", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const db = createDb({
    orders: [
      {
        _id: "order-fallback-1",
        openid: "openid-1",
        status: "paid",
        refundStatus: "none",
        amountCents: 599,
        currency: "CNY",
        createdAt: "2026-07-01T04:30:00.000Z",
        paidAt: "2026-07-01T04:31:00.000Z",
        updatedAt: "2026-07-01T04:35:00.000Z",
      },
    ],
  });

  const result = await adminFunction.main(
    {
      action: "listOrders",
      data: {
        token: "auth-disabled",
        filters: {
          status: "paid",
        },
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_AUTH_DISABLED: "true",
      },
      now: () => new Date("2026-07-01T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.items.length, 1);
  assert.strictEqual(result.data.items[0].createdAt, "2026-07-01T04:30:00.000Z");
  assert.strictEqual(result.data.items[0].paidAt, "2026-07-01T04:31:00.000Z");
  assert.strictEqual(result.data.items[0].updatedAt, "2026-07-01T04:35:00.000Z");
});
