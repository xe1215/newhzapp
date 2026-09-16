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

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
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

function createAdminOverviewDb(calls, overrides) {
  const state = {
    admin_sessions: {},
    events: {
      "event-visit-today": {
        _id: "event-visit-today",
        eventName: "preview_view",
        createdAt: "2026-06-24T02:00:00.000Z",
      },
      "event-generation-success": {
        _id: "event-generation-success",
        type: "generation_success",
        createdAt: "2026-06-24T03:00:00.000Z",
      },
      "event-generation-fail": {
        _id: "event-generation-fail",
        type: "generation_fail",
        createdAt: "2026-06-24T04:00:00.000Z",
      },
      "event-payment-success": {
        _id: "event-payment-success",
        type: "payment_success",
        createdAt: "2026-06-24T05:00:00.000Z",
      },
      "event-report-view": {
        _id: "event-report-view",
        eventName: "report_view",
        createdAt: "2026-06-24T06:00:00.000Z",
      },
      "event-share-visit": {
        _id: "event-share-visit",
        eventName: "share_visit",
        createdAt: "2026-06-24T07:00:00.000Z",
      },
      "event-old": {
        _id: "event-old",
        eventName: "preview_view",
        createdAt: "2026-05-20T07:00:00.000Z",
      },
    },
    orders: {
      "order-paid-1": {
        _id: "order-paid-1",
        status: "paid",
        refundStatus: "none",
        amountCents: 599,
        currency: "CNY",
        canViewReport: true,
        createdAt: "2026-06-24T05:30:00.000Z",
        updatedAt: "2026-06-24T05:30:00.000Z",
      },
      "order-exception-1": {
        _id: "order-exception-1",
        status: "paid",
        refundStatus: "pending",
        amountCents: 599,
        currency: "CNY",
        canViewReport: false,
        refundReason: "REPORT_NOT_VIEWABLE",
        createdAt: "2026-06-24T08:00:00.000Z",
        updatedAt: "2026-06-24T08:05:00.000Z",
      },
      "order-old": {
        _id: "order-old",
        status: "paid",
        refundStatus: "pending",
        amountCents: 599,
        currency: "CNY",
        canViewReport: false,
        refundReason: "REPORT_NOT_VIEWABLE",
        createdAt: "2026-05-20T08:00:00.000Z",
        updatedAt: "2026-05-20T08:05:00.000Z",
      },
    },
    try_on_tests: {
      "test-1": {
        _id: "test-1",
        status: "selfie_uploaded",
        createdAt: "2026-06-24T01:00:00.000Z",
      },
      "test-2": {
        _id: "test-2",
        status: "preferences_submitted",
        createdAt: "2026-06-24T02:30:00.000Z",
      },
      "test-old": {
        _id: "test-old",
        status: "selfie_uploaded",
        createdAt: "2026-05-10T02:30:00.000Z",
      },
    },
    reports: {
      "report-1": {
        _id: "report-1",
        status: "active",
        unlockedAt: "2026-06-24T05:31:00.000Z",
        createdAt: "2026-06-24T04:30:00.000Z",
      },
      "report-2": {
        _id: "report-2",
        status: "deleted",
        unlockedAt: "",
        createdAt: "2026-06-24T04:45:00.000Z",
      },
      "report-old": {
        _id: "report-old",
        status: "active",
        unlockedAt: "2026-05-10T04:31:00.000Z",
        createdAt: "2026-05-10T04:30:00.000Z",
      },
    },
    provider_runs: {
      "run-ok": {
        _id: "run-ok",
        status: "success",
        provider: "mock",
        durationMs: 1400,
        createdAt: "2026-06-24T03:15:00.000Z",
      },
      "run-fail-1": {
        _id: "run-fail-1",
        status: "failed",
        provider: "mock",
        errorCode: "IMAGE_PROVIDER_FAILED",
        errorMessage: "Mock provider failed",
        createdAt: "2026-06-24T08:10:00.000Z",
      },
      "run-fail-2": {
        _id: "run-fail-2",
        status: "failed",
        provider: "jimeng",
        errorCode: "TIMEOUT",
        errorMessage: "Provider timed out",
        createdAt: "2026-06-24T08:20:00.000Z",
      },
      "run-old": {
        _id: "run-old",
        status: "failed",
        provider: "mock",
        errorCode: "OLD",
        errorMessage: "Old failure",
        createdAt: "2026-05-10T08:20:00.000Z",
      },
    },
    ...(overrides || {}),
  };

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
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

        if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
          return expected.$in.includes(item[key]);
        }

        return true;
      }

      return item[key] === expected;
    });
  }

  function listCollection(name, query, orderField, orderDirection, limit) {
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

    return clone(values);
  }

  return {
    state,
    collection(name) {
      calls.push(["collection", name]);

      function createChain(query, orderField, orderDirection, limit) {
        return {
          where(nextQuery) {
            calls.push(["where", name, nextQuery]);
            return createChain(nextQuery, orderField, orderDirection, limit);
          },
          orderBy(field, direction) {
            calls.push(["orderBy", name, field, direction]);
            return createChain(query, field, direction, limit);
          },
          limit(nextLimit) {
            calls.push(["limit", name, nextLimit]);
            return createChain(query, orderField, orderDirection, nextLimit);
          },
          doc(id) {
            calls.push(["doc", name, id]);
            return {
              async get() {
                calls.push(["doc.get", name, id]);
                return { data: clone((state[name] || {})[id] || null) };
              },
              async set(payload) {
                calls.push(["doc.set", name, id, payload]);
                if (!state[name]) {
                  state[name] = {};
                }
                state[name][id] = { _id: id, ...clone(payload.data) };
                return { stats: { created: 1 } };
              },
              async update(payload) {
                calls.push(["doc.update", name, id, payload]);
                state[name][id] = {
                  ...(state[name][id] || { _id: id }),
                  ...clone(payload.data),
                };
                return { stats: { updated: 1 } };
              },
            };
          },
          async get() {
            calls.push(["get", name, query, orderField, orderDirection, limit]);
            return {
              data: listCollection(name, query, orderField, orderDirection, limit),
            };
          },
        };
      }

      return createChain({}, "", "", null);
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
      randomBytes: () => Buffer.from("1234567890abcdef1234567890abcdef"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.ok(calls.some((call) => call[0] === "doc.set" && call[1] === "admin_sessions"));
  return result.data.token;
}

test("admin getOverview requires developer login and aggregates overview metrics inside the requested date range", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminOverviewDb(calls);

  const unauthorized = await adminFunction.main(
    {
      action: "getOverview",
      data: {
        token: "",
        rangeKey: "today",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
      },
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    }
  );

  assert.strictEqual(unauthorized.code, "UNAUTHORIZED");

  const token = await loginAsDeveloper(adminFunction, db, calls);

  const result = await adminFunction.main(
    {
      action: "getOverview",
      data: {
        token,
        rangeKey: "today",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
      },
      now: () => new Date("2026-06-24T09:00:00.000Z"),
      randomBytes: () => Buffer.from("1234567890abcdef1234567890abcdef"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.range.key, "today");
  assert.strictEqual(result.data.metrics.visits, 6);
  assert.strictEqual(result.data.metrics.testsCreated, 2);
  assert.strictEqual(result.data.metrics.generationSuccessCount, 1);
  assert.strictEqual(result.data.metrics.generationFailureCount, 1);
  assert.strictEqual(result.data.metrics.paidOrderCount, 2);
  assert.strictEqual(result.data.metrics.revenueCents, 1198);
  assert.strictEqual(result.data.metrics.reportViewCount, 1);
  assert.strictEqual(result.data.metrics.shareVisitCount, 1);
  assert.strictEqual(result.data.recentGenerationFailures.length, 2);
  assert.strictEqual(result.data.recentGenerationFailures[0].runId, "run-fail-2");
  assert.strictEqual(result.data.recentExceptionOrders.length, 1);
  assert.strictEqual(result.data.recentExceptionOrders[0].orderId, "order-exception-1");
  assert.strictEqual(result.data.empty, false);

  const rangedWhereCalls = calls.filter(
    (call) =>
      call[0] === "where" &&
      ["events", "orders", "try_on_tests", "reports", "provider_runs"].includes(call[1])
  );
  assert.strictEqual(rangedWhereCalls.length >= 5, true);
  rangedWhereCalls.forEach((call) => {
    assert.ok(call[2].createdAt, `${call[1]} query should include createdAt range`);
    assert.ok(call[2].createdAt.$gte, `${call[1]} query should include range start`);
    assert.ok(call[2].createdAt.$lt, `${call[1]} query should include range end`);
  });
});

test("admin getOverview returns a clear empty state when the chosen range has no activity", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminOverviewDb(calls);
  const token = await loginAsDeveloper(adminFunction, db, calls);

  const result = await adminFunction.main(
    {
      action: "getOverview",
      data: {
        token,
        rangeKey: "yesterday",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
      },
      now: () => new Date("2026-06-24T09:00:00.000Z"),
      randomBytes: () => Buffer.from("1234567890abcdef1234567890abcdef"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.range.key, "yesterday");
  assert.strictEqual(result.data.metrics.visits, 0);
  assert.strictEqual(result.data.metrics.testsCreated, 0);
  assert.strictEqual(result.data.metrics.revenueCents, 0);
  assert.deepStrictEqual(result.data.recentGenerationFailures, []);
  assert.deepStrictEqual(result.data.recentExceptionOrders, []);
  assert.strictEqual(result.data.empty, true);
  assert.match(result.data.emptyMessage, /No overview data/i);
});

test("developer console overview page exposes four date ranges, calls getOverview, and renders empty-state and operational sections", () => {
  const appSource = readText("admin/src/App.jsx");
  const apiSource = readText("admin/src/lib/admin-api.js");

  assert.match(appSource, /today/i);
  assert.match(appSource, /yesterday/i);
  assert.match(appSource, /last 7 days/i);
  assert.match(appSource, /last 30 days/i);
  assert.match(appSource, /getOverview/);
  assert.match(appSource, /No overview data for this range/i);
  assert.match(appSource, /Recent generation failures/i);
  assert.match(appSource, /Recent exception orders/i);
  assert.match(appSource, /Visits/i);
  assert.match(appSource, /Tests created/i);
  assert.match(appSource, /Revenue/i);
  assert.match(apiSource, /invokeAdmin\("getOverview"/);
});

test("overview index guidance is tracked in repository for createdAt and operational filter fields", () => {
  assert.ok(exists("docs/admin-overview-indexes.json"));

  const indexConfig = readJson("docs/admin-overview-indexes.json");

  assert.ok(Array.isArray(indexConfig.collections));
  assert.ok(
    indexConfig.collections.some(
      (entry) =>
        entry.name === "events" &&
        entry.indexes.some((index) => index.fields.includes("createdAt"))
    )
  );
  assert.ok(
    indexConfig.collections.some(
      (entry) =>
        entry.name === "orders" &&
        entry.indexes.some(
          (index) =>
            index.fields.includes("createdAt") && index.fields.includes("status")
        )
    )
  );
  assert.ok(
    indexConfig.collections.some(
      (entry) =>
        entry.name === "provider_runs" &&
        entry.indexes.some(
          (index) =>
            index.fields.includes("createdAt") && index.fields.includes("status")
        )
    )
  );
});
