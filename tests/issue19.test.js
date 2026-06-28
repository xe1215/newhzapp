const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
      init() {},
      database() {
        throw new Error("Test must inject a fake database");
      },
      getWXContext() {
        throw new Error("Test must inject a fake WeChat context");
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

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

function createIssue19Db(calls) {
  const state = {
    admin_sessions: {},
    orders: {
      "order-1": {
        _id: "order-1",
        openid: "openid-alpha-123456",
        status: "paid",
        refundStatus: "pending",
        refundReason: "Image delivery issue",
        adminNote: "Waiting for merchant confirmation",
        amountCents: 599,
        currency: "CNY",
        transactionId: "wx-transaction-1",
        outTradeNo: "mch-order-1001",
        prepayId: "wx-prepay-1",
        paidAt: "2026-06-24T02:15:00.000Z",
        unlockedAt: "2026-06-24T02:16:00.000Z",
        testId: "test-1",
        reportId: "report-1",
        createdAt: "2026-06-24T02:10:00.000Z",
        updatedAt: "2026-06-24T02:20:00.000Z",
      },
      "order-2": {
        _id: "order-2",
        openid: "openid-beta-987654",
        status: "paid",
        refundStatus: "none",
        refundReason: "",
        adminNote: "",
        amountCents: 799,
        currency: "CNY",
        transactionId: "wx-transaction-2",
        outTradeNo: "mch-order-1002",
        prepayId: "wx-prepay-2",
        paidAt: "2026-06-24T05:10:00.000Z",
        unlockedAt: "",
        testId: "test-2",
        reportId: "report-2",
        createdAt: "2026-06-24T05:00:00.000Z",
        updatedAt: "2026-06-24T05:10:00.000Z",
      },
    },
    admin_actions: {},
  };

  function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function matchesQuery(item, query) {
    return Object.keys(query || {}).every((key) => {
      const expected = query[key];

      if (expected && typeof expected === "object" && !Array.isArray(expected)) {
        if (Object.prototype.hasOwnProperty.call(expected, "$gte") && !(item[key] >= expected.$gte)) {
          return false;
        }

        if (Object.prototype.hasOwnProperty.call(expected, "$lt") && !(item[key] < expected.$lt)) {
          return false;
        }

        return true;
      }

      return item[key] === expected;
    });
  }

  function createChain(name, query, orderField, orderDirection, limit) {
    return {
      where(nextQuery) {
        calls.push(["where", name, nextQuery]);
        return createChain(name, nextQuery, orderField, orderDirection, limit);
      },
      orderBy(field, direction) {
        calls.push(["orderBy", name, field, direction]);
        return createChain(name, query, field, direction, limit);
      },
      limit(nextLimit) {
        calls.push(["limit", name, nextLimit]);
        return createChain(name, query, orderField, orderDirection, nextLimit);
      },
      async get() {
        calls.push(["get", name, query, orderField, orderDirection, limit]);
        let values = Object.values(state[name] || {}).filter((item) => matchesQuery(item, query));

        if (orderField) {
          values = values.sort((left, right) => {
            const leftValue = String(left[orderField] || "");
            const rightValue = String(right[orderField] || "");
            const compare = leftValue.localeCompare(rightValue);
            return orderDirection === "desc" ? -compare : compare;
          });
        }

        if (typeof limit === "number") {
          values = values.slice(0, limit);
        }

        return {
          data: clone(values),
        };
      },
      doc(id) {
        calls.push(["doc", name, id]);
        return {
          async get() {
            calls.push(["doc.get", name, id]);
            return {
              data: clone((state[name] || {})[id] || null),
            };
          },
          async set(payload) {
            calls.push(["doc.set", name, id, payload]);
            if (!state[name]) {
              state[name] = {};
            }
            state[name][id] = { _id: id, ...clone(payload.data) };
            return { stats: { created: 1 } };
          },
        };
      },
      async add(payload) {
        calls.push(["add", name, payload]);
        if (!state[name]) {
          state[name] = {};
        }
        const nextId = `${name}-${Object.keys(state[name]).length + 1}`;
        state[name][nextId] = { _id: nextId, ...clone(payload.data) };
        return { _id: nextId };
      },
    };
  }

  return {
    state,
    collection(name) {
      calls.push(["collection", name]);
      return createChain(name, {}, "", "", null);
    },
  };
}

async function loginAsDeveloper(adminFunction, db, calls) {
  const result = await adminFunction.main(
    {
      action: "login",
      data: {
        password: "s3cr3t",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
        ADMIN_SESSION_TTL_SECONDS: "7200",
      },
      now: () => new Date("2026-06-24T09:00:00.000Z"),
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.ok(calls.some((call) => call[0] === "doc.set" && call[1] === "admin_sessions"));
  return result.data.token;
}

test("admin orders explorer requires login and returns masked list items with filter support", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue19Db(calls);

  const unauthorized = await adminFunction.main(
    {
      action: "listOrders",
      data: {
        token: "",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    }
  );

  assert.strictEqual(unauthorized.code, "UNAUTHORIZED");

  const token = await loginAsDeveloper(adminFunction, db, calls);
  const listResult = await adminFunction.main(
    {
      action: "listOrders",
      data: {
        token,
        filters: {
          openid: "openid-alpha-123456",
          status: "paid",
          refundStatus: "pending",
          reportId: "report-1",
          outTradeNo: "mch-order-1001",
          startDate: "2026-06-24T00:00:00.000Z",
          endDate: "2026-06-25T00:00:00.000Z",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    }
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.items.length, 1);
  assert.strictEqual(listResult.data.items[0].orderId, "order-1");
  assert.strictEqual(listResult.data.items[0].openidMasked, "openid-al...3456");
  assert.strictEqual(listResult.data.items[0].openid, undefined);
  assert.strictEqual(listResult.data.items[0].refundStatus, "pending");
  assert.strictEqual(listResult.data.items[0].outTradeNo, "mch-order-1001");

  const rangedQuery = calls.find(
    (call) => call[0] === "where" && call[1] === "orders" && call[2].createdAt
  );
  assert.ok(rangedQuery, "order listing should query orders by createdAt range");
});

test("admin order detail returns full payment fields and refund handling updates append audit snapshots without calling payment refunds", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue19Db(calls);
  const token = await loginAsDeveloper(adminFunction, db, calls);

  const detailResult = await adminFunction.main(
    {
      action: "getOrderDetail",
      data: {
        token,
        orderId: "order-1",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    }
  );

  assert.strictEqual(detailResult.code, 0);
  assert.strictEqual(detailResult.data.orderId, "order-1");
  assert.strictEqual(detailResult.data.openid, "openid-alpha-123456");
  assert.strictEqual(detailResult.data.amountCents, 599);
  assert.strictEqual(detailResult.data.currency, "CNY");
  assert.strictEqual(detailResult.data.transactionId, "wx-transaction-1");
  assert.strictEqual(detailResult.data.outTradeNo, "mch-order-1001");
  assert.strictEqual(detailResult.data.prepayId, "wx-prepay-1");
  assert.strictEqual(detailResult.data.paidAt, "2026-06-24T02:15:00.000Z");
  assert.strictEqual(detailResult.data.unlockedAt, "2026-06-24T02:16:00.000Z");
  assert.strictEqual(detailResult.data.reportId, "report-1");
  assert.strictEqual(detailResult.data.testId, "test-1");

  const updateResult = await adminFunction.main(
    {
      action: "updateOrderRefundHandling",
      data: {
        token,
        orderId: "order-1",
        refundStatus: "refunded",
        refundReason: "Manual refund completed in merchant portal",
        adminNote: "Handled by ops on duty",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-24T09:30:00.000Z"),
    }
  );

  assert.strictEqual(updateResult.code, 0);
  assert.strictEqual(updateResult.data.orderId, "order-1");
  assert.strictEqual(updateResult.data.refundStatus, "refunded");
  assert.strictEqual(db.state.orders["order-1"].refundStatus, "refunded");
  assert.strictEqual(db.state.orders["order-1"].refundReason, "Manual refund completed in merchant portal");
  assert.strictEqual(db.state.orders["order-1"].adminNote, "Handled by ops on duty");

  const adminAction = Object.values(db.state.admin_actions).find(
    (item) => item.operation === "order_refund_handling_update"
  );
  assert.ok(adminAction);
  assert.strictEqual(adminAction.targetType, "order");
  assert.strictEqual(adminAction.before.refundStatus, "pending");
  assert.strictEqual(adminAction.after.refundStatus, "refunded");
  assert.ok(!calls.some((call) => String(call[1] || "").toLowerCase().includes("refunds")));
});

test("admin refund handling rejects unsupported refund statuses", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue19Db(calls);
  const token = await loginAsDeveloper(adminFunction, db, calls);

  const result = await adminFunction.main(
    {
      action: "updateOrderRefundHandling",
      data: {
        token,
        orderId: "order-1",
        refundStatus: "processing-in-bank",
        refundReason: "Invalid",
        adminNote: "",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-24T09:30:00.000Z"),
    }
  );

  assert.strictEqual(result.code, "INVALID_REFUND_STATUS");
});

test("developer console exposes order search, detail, and refund handling records through protected admin APIs", () => {
  const appSource = readText("admin/src/App.jsx");
  const apiSource = readText("admin/src/lib/admin-api.js");

  assert.match(appSource, /Orders and Refund Handling/);
  assert.match(appSource, /listOrders/);
  assert.match(appSource, /getOrderDetail/);
  assert.match(appSource, /updateOrderRefundHandling/);
  assert.match(appSource, /Merchant order/i);
  assert.match(appSource, /Refund status/i);
  assert.match(appSource, /Developer note/i);
  assert.match(appSource, /Copy openid/i);
  assert.doesNotMatch(appSource, /refundToBalance|requestRefund|wx\.requestPayment/i);

  assert.match(apiSource, /invokeAdmin\("listOrders"/);
  assert.match(apiSource, /invokeAdmin\("getOrderDetail"/);
  assert.match(apiSource, /invokeAdmin\("updateOrderRefundHandling"/);
});
