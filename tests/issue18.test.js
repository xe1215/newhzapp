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

function createIssue18Db(calls) {
  const state = {
    admin_sessions: {},
    try_on_tests: {
      "test-1": {
        _id: "test-1",
        openid: "openid-alpha-123456",
        status: "preview_ready",
        currentReportId: "report-1",
        selfieFileId: "cloud://selfies/openid-alpha/test-1/original.jpg",
        preferenceSummary: {
          skinTone: "neutral",
          budget: "mid",
          scene: "daily",
          style: "natural",
        },
        safetyStatus: "passed",
        qualityStatus: "passed",
        generationStatus: "success",
        previewRegenerateCount: 1,
        maxPreviewRegenerateCount: 3,
        createdAt: "2026-06-24T01:00:00.000Z",
        updatedAt: "2026-06-24T03:30:00.000Z",
        preferenceSubmittedAt: "2026-06-24T01:10:00.000Z",
        generationStartedAt: "2026-06-24T01:12:00.000Z",
        generationCompletedAt: "2026-06-24T01:18:00.000Z",
        reportReadyAt: "2026-06-24T01:20:00.000Z",
      },
      "test-2": {
        _id: "test-2",
        openid: "openid-beta-987654",
        status: "generation_failed",
        currentReportId: "report-2",
        preferenceSummary: {
          skinTone: "warm",
          budget: "high",
          scene: "date",
          style: "bold",
        },
        safetyStatus: "passed",
        qualityStatus: "passed",
        generationStatus: "failed",
        previewRegenerateCount: 2,
        maxPreviewRegenerateCount: 3,
        createdAt: "2026-06-24T04:00:00.000Z",
        updatedAt: "2026-06-24T04:20:00.000Z",
        preferenceSubmittedAt: "2026-06-24T04:05:00.000Z",
        generationStartedAt: "2026-06-24T04:07:00.000Z",
        generationCompletedAt: "",
        reportReadyAt: "",
      },
    },
    reports: {
      "report-1": {
        _id: "report-1",
        openid: "openid-alpha-123456",
        testId: "test-1",
        status: "active",
        createdAt: "2026-06-24T01:20:00.000Z",
        updatedAt: "2026-06-24T05:00:00.000Z",
        unlockedAt: "2026-06-24T02:10:00.000Z",
        snapshot: {
          recommendations: [
            {
              lipstickId: "lip-1",
              brand: "Brand A",
              shadeName: "Rose Milk",
              shadeCode: "A12",
              colorHex: "#b14c6c",
              recommendationReason: "Soft and reliable",
            },
          ],
        },
        previewImages: [
          "cloud://reports/report-1/preview-1.jpg",
          "cloud://reports/report-1/preview-2.jpg",
        ],
        paidImages: [
          "cloud://reports/report-1/paid-1.jpg",
          "cloud://reports/report-1/paid-2.jpg",
        ],
        shareCardImages: ["cloud://reports/report-1/share-card-1.jpg"],
        hiddenAt: "",
        flaggedAt: "",
        flaggedReason: "",
        deletedAt: "",
      },
      "report-2": {
        _id: "report-2",
        openid: "openid-beta-987654",
        testId: "test-2",
        status: "pending",
        createdAt: "2026-06-24T04:10:00.000Z",
        updatedAt: "2026-06-24T04:15:00.000Z",
        unlockedAt: "",
        snapshot: {
          recommendations: [],
        },
        previewImages: [],
        paidImages: [],
        shareCardImages: [],
        hiddenAt: "",
        flaggedAt: "",
        flaggedReason: "",
        deletedAt: "",
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

        if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
          return expected.$in.includes(item[key]);
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
          async update(payload) {
            calls.push(["doc.update", name, id, payload]);
            if (!state[name]) {
              state[name] = {};
            }
            state[name][id] = {
              ...(state[name][id] || { _id: id }),
              ...clone(payload.data),
            };
            return { stats: { updated: 1 } };
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

test("admin tests explorer requires login and supports filtered list plus full detail payload", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue18Db(calls);

  const unauthorized = await adminFunction.main(
    {
      action: "listTests",
      data: {
        token: "",
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
  const listResult = await adminFunction.main(
    {
      action: "listTests",
      data: {
        token,
        filters: {
          openid: "openid-alpha-123456",
          status: "preview_ready",
          startDate: "2026-06-24T00:00:00.000Z",
          endDate: "2026-06-25T00:00:00.000Z",
        },
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
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.items.length, 1);
  assert.strictEqual(listResult.data.items[0].testId, "test-1");
  assert.strictEqual(listResult.data.items[0].openidMasked, "openid-al...3456");
  assert.strictEqual(listResult.data.items[0].openid, undefined);
  assert.strictEqual(listResult.data.items[0].currentReportId, "report-1");
  assert.strictEqual(listResult.data.items[0].generationStatus, "success");
  assert.strictEqual(listResult.data.items[0].previewRegenerateCount, 1);

  const detailResult = await adminFunction.main(
    {
      action: "getTestDetail",
      data: {
        token,
        testId: "test-1",
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
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(detailResult.code, 0);
  assert.strictEqual(detailResult.data.testId, "test-1");
  assert.strictEqual(detailResult.data.openid, "openid-alpha-123456");
  assert.strictEqual(detailResult.data.lifecycle.createdAt, "2026-06-24T01:00:00.000Z");
  assert.strictEqual(detailResult.data.lifecycle.reportReadyAt, "2026-06-24T01:20:00.000Z");
  assert.strictEqual(detailResult.data.preferences.skinTone, "neutral");
  assert.strictEqual(detailResult.data.statuses.safetyStatus, "passed");
  assert.strictEqual(detailResult.data.statuses.generationStatus, "success");
  assert.strictEqual(detailResult.data.currentReportId, "report-1");

  const rangedQuery = calls.find(
    (call) => call[0] === "where" && call[1] === "try_on_tests" && call[2].createdAt
  );
  assert.ok(rangedQuery, "test listing should query try_on_tests by createdAt range");
});

test("admin reports explorer returns sanitized list, detailed assets, and admin action audit records for mutations", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createIssue18Db(calls);
  const token = await loginAsDeveloper(adminFunction, db, calls);

  const listResult = await adminFunction.main(
    {
      action: "listReports",
      data: {
        token,
        filters: {
          openid: "openid-alpha-123456",
          status: "active",
          testId: "test-1",
          startDate: "2026-06-24T00:00:00.000Z",
          endDate: "2026-06-25T00:00:00.000Z",
        },
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
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.items.length, 1);
  assert.strictEqual(listResult.data.items[0].reportId, "report-1");
  assert.strictEqual(listResult.data.items[0].openidMasked, "openid-al...3456");
  assert.strictEqual(listResult.data.items[0].previewImages, undefined);
  assert.strictEqual(listResult.data.items[0].paidImages, undefined);
  assert.strictEqual(listResult.data.items[0].shareCardImages, undefined);
  assert.strictEqual(listResult.data.items[0].locked, false);

  const detailResult = await adminFunction.main(
    {
      action: "getReportDetail",
      data: {
        token,
        reportId: "report-1",
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
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(detailResult.code, 0);
  assert.strictEqual(detailResult.data.reportId, "report-1");
  assert.strictEqual(detailResult.data.openid, "openid-alpha-123456");
  assert.strictEqual(detailResult.data.assets.previewImages.length, 2);
  assert.strictEqual(detailResult.data.assets.paidImages.length, 2);
  assert.strictEqual(detailResult.data.assets.shareCardImages.length, 1);
  assert.strictEqual(detailResult.data.unlock.unlocked, true);
  assert.strictEqual(detailResult.data.snapshot.recommendations[0].shadeName, "Rose Milk");

  const hideResult = await adminFunction.main(
    {
      action: "flagReport",
      data: {
        token,
        reportId: "report-1",
        operation: "hide",
        reason: "duplicate",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
      },
      now: () => new Date("2026-06-24T09:30:00.000Z"),
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(hideResult.code, 0);
  assert.strictEqual(hideResult.data.reportId, "report-1");
  assert.strictEqual(hideResult.data.status, "hidden");
  assert.strictEqual(db.state.reports["report-1"].status, "hidden");
  assert.strictEqual(db.state.reports["report-1"].hiddenReason, "duplicate");

  const flagResult = await adminFunction.main(
    {
      action: "flagReport",
      data: {
        token,
        reportId: "report-2",
        operation: "flag",
        reason: "provider mismatch",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
      },
      now: () => new Date("2026-06-24T09:40:00.000Z"),
      randomBytes: () => Buffer.from("abcdef1234567890abcdef1234567890"),
    }
  );

  assert.strictEqual(flagResult.code, 0);
  assert.strictEqual(flagResult.data.status, "flagged");
  assert.strictEqual(db.state.reports["report-2"].flaggedReason, "provider mismatch");

  const adminActions = Object.values(db.state.admin_actions);
  assert.strictEqual(adminActions.length, 2);
  assert.strictEqual(adminActions[0].targetType, "report");
  assert.strictEqual(adminActions[0].operation, "hide_report");
  assert.strictEqual(adminActions[1].operation, "flag_report");
});

test("developer console exposes test and report investigation pages instead of placeholder modules", () => {
  assert.ok(exists("tests/issue18.test.js"));

  const appSource = readText("admin/src/App.jsx");
  const apiSource = readText("admin/src/lib/admin-api.js");

  assert.match(appSource, /listTests/);
  assert.match(appSource, /getTestDetail/);
  assert.match(appSource, /listReports/);
  assert.match(appSource, /getReportDetail/);
  assert.match(appSource, /flagReport/);
  assert.match(appSource, /openid/i);
  assert.match(appSource, /Current report/i);
  assert.match(appSource, /Hide report/i);
  assert.match(appSource, /Mark abnormal/i);
  assert.match(apiSource, /invokeAdmin\("listTests"/);
  assert.match(apiSource, /invokeAdmin\("getReportDetail"/);
  assert.match(apiSource, /invokeAdmin\("flagReport"/);
});
