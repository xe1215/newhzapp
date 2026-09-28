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

function createIssue20Db(calls) {
  const state = {
    admin_sessions: {},
    provider_runs: {
      "run-1": {
        _id: "run-1",
        provider: "jimeng",
        status: "failed",
        errorCode: "TIMEOUT",
        errorMessage: "Provider timed out while rendering",
        retryIndex: 1,
        durationMs: 3500,
        originalImageFileId: "cloud://provider/run-1/original.png",
        watermarkedImageFileId: "cloud://provider/run-1/watermarked.png",
        testId: "test-1",
        reportId: "report-1",
        openid: "openid-alpha-123456",
        createdAt: "2026-06-25T02:10:00.000Z",
        updatedAt: "2026-06-25T02:11:00.000Z",
      },
      "run-2": {
        _id: "run-2",
        provider: "mock",
        status: "success",
        errorCode: "",
        errorMessage: "",
        retryIndex: 0,
        durationMs: 1600,
        originalImageFileId: "cloud://provider/run-2/original.png",
        watermarkedImageFileId: "cloud://provider/run-2/watermarked.png",
        testId: "test-2",
        reportId: "report-2",
        openid: "openid-beta-987654",
        createdAt: "2026-06-25T05:20:00.000Z",
        updatedAt: "2026-06-25T05:21:00.000Z",
      },
    },
    events: {
      "event-1": {
        _id: "event-1",
        eventName: "generation_fail",
        openid: "openid-alpha-123456",
        testId: "test-1",
        reportId: "report-1",
        orderId: "order-1",
        shareId: "share-1",
        metadata: {
          provider: "jimeng",
          retryIndex: 1,
        },
        createdAt: "2026-06-25T02:11:00.000Z",
      },
      "event-2": {
        _id: "event-2",
        eventName: "share_visit",
        openid: "openid-beta-987654",
        testId: "test-2",
        reportId: "report-2",
        orderId: "",
        shareId: "share-2",
        metadata: {
          source: "timeline",
        },
        createdAt: "2026-06-25T06:00:00.000Z",
      },
    },
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
      now: () => new Date("2026-06-25T09:00:00.000Z"),
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.ok(calls.some((call) => call[0] === "doc.set" && call[1] === "admin_sessions"));
  return result.data.token;
}

test("admin generation logs require login and support filtered readonly list plus detail", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue20Db(calls);

  const unauthorized = await adminFunction.main(
    {
      action: "listProviderRuns",
      data: {
        token: "",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-25T09:00:00.000Z"),
    }
  );

  assert.strictEqual(unauthorized.code, "UNAUTHORIZED");

  const token = await loginAsDeveloper(adminFunction, db, calls);
  const listResult = await adminFunction.main(
    {
      action: "listProviderRuns",
      data: {
        token,
        filters: {
          provider: "jimeng",
          status: "failed",
          errorCode: "TIMEOUT",
          retryIndex: 1,
          testId: "test-1",
          reportId: "report-1",
          openid: "openid-alpha-123456",
          startDate: "2026-06-25T00:00:00.000Z",
          endDate: "2026-06-26T00:00:00.000Z",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-25T09:00:00.000Z"),
    }
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.items.length, 1);
  assert.strictEqual(listResult.data.items[0].runId, "run-1");
  assert.strictEqual(listResult.data.items[0].openidMasked, "openid-al...3456");
  assert.strictEqual(listResult.data.items[0].openid, undefined);
  assert.strictEqual(listResult.data.items[0].retryIndex, 1);
  assert.strictEqual(listResult.data.items[0].durationMs, 3500);

  const detailResult = await adminFunction.main(
    {
      action: "getProviderRunDetail",
      data: {
        token,
        runId: "run-1",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-25T09:00:00.000Z"),
    }
  );

  assert.strictEqual(detailResult.code, 0);
  assert.strictEqual(detailResult.data.runId, "run-1");
  assert.strictEqual(detailResult.data.openid, "openid-alpha-123456");
  assert.strictEqual(detailResult.data.originalImageFileId, "cloud://provider/run-1/original.png");
  assert.strictEqual(detailResult.data.watermarkedImageFileId, "cloud://provider/run-1/watermarked.png");
  assert.strictEqual(detailResult.data.errorCode, "TIMEOUT");
  assert.strictEqual(detailResult.data.errorMessage, "Provider timed out while rendering");

  const rangedQuery = calls.find(
    (call) => call[0] === "where" && call[1] === "provider_runs" && call[2].createdAt
  );
  assert.ok(rangedQuery, "provider run listing should query provider_runs by createdAt range");
});

test("admin event logs support filtered readonly list, readonly detail, and csv export with full openid", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue20Db(calls);
  const token = await loginAsDeveloper(adminFunction, db, calls);

  const listResult = await adminFunction.main(
    {
      action: "listEvents",
      data: {
        token,
        filters: {
          eventName: "generation_fail",
          openid: "openid-alpha-123456",
          testId: "test-1",
          reportId: "report-1",
          orderId: "order-1",
          shareId: "share-1",
          startDate: "2026-06-25T00:00:00.000Z",
          endDate: "2026-06-26T00:00:00.000Z",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-25T09:00:00.000Z"),
    }
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.items.length, 1);
  assert.strictEqual(listResult.data.items[0].eventId, "event-1");
  assert.strictEqual(listResult.data.items[0].openidMasked, "openid-al...3456");
  assert.strictEqual(listResult.data.items[0].openid, undefined);
  assert.strictEqual(listResult.data.items[0].eventName, "generation_fail");

  const detailResult = await adminFunction.main(
    {
      action: "getEventDetail",
      data: {
        token,
        eventId: "event-1",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-25T09:00:00.000Z"),
    }
  );

  assert.strictEqual(detailResult.code, 0);
  assert.strictEqual(detailResult.data.eventId, "event-1");
  assert.strictEqual(detailResult.data.openid, "openid-alpha-123456");
  assert.strictEqual(detailResult.data.metadata.provider, "jimeng");
  assert.strictEqual(detailResult.data.metadata.retryIndex, 1);

  const exportResult = await adminFunction.main(
    {
      action: "exportEventsCsv",
      data: {
        token,
        filters: {
          startDate: "2026-06-25T00:00:00.000Z",
          endDate: "2026-06-26T00:00:00.000Z",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-25T09:00:00.000Z"),
    }
  );

  assert.strictEqual(exportResult.code, 0);
  assert.match(exportResult.data.fileName, /^events-/);
  assert.match(exportResult.data.csvText, /eventId,eventName,openid,testId,reportId,orderId,shareId,metadata,createdAt/);
  assert.match(exportResult.data.csvText, /openid-alpha-123456/);
  assert.match(exportResult.data.csvText, /generation_fail/);
  assert.match(exportResult.data.csvText, /jimeng/);
});

test("developer console exposes generation logs and event logs as readonly tooling through protected admin APIs", () => {
  const appSource = readText("admin/src/App.jsx");
  const apiSource = readText("admin/src/lib/admin-api.js");

  assert.match(appSource, /Generation and Event Logs/);
  assert.match(appSource, /listProviderRuns/);
  assert.match(appSource, /getProviderRunDetail/);
  assert.match(appSource, /listEvents/);
  assert.match(appSource, /getEventDetail/);
  assert.match(appSource, /exportEventsCsv/);
  assert.match(appSource, /Copy openid/i);
  assert.match(appSource, /Export events CSV/i);
  assert.doesNotMatch(appSource, /saveProviderRun|updateEvent|edit event/i);

  assert.match(apiSource, /invokeAdmin\("listProviderRuns"/);
  assert.match(apiSource, /invokeAdmin\("getProviderRunDetail"/);
  assert.match(apiSource, /invokeAdmin\("listEvents"/);
  assert.match(apiSource, /invokeAdmin\("getEventDetail"/);
  assert.match(apiSource, /invokeAdmin\("exportEventsCsv"/);
});
