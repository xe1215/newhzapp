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

function createIssue9Db(calls, overrides) {
  const state = {
    try_on_tests: {
      "test-delete": {
        _id: "test-delete",
        openid: "openid-123",
        status: "preview_ready",
        selfieFileId: "cloud://selfies/openid-123/test-delete/original.jpg",
        activeReportId: "report-keep",
        createdAt: "2026-06-21T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
        expiresAt: "2026-06-22T08:00:00.000Z",
      },
      "test-expired-selfie": {
        _id: "test-expired-selfie",
        openid: "openid-123",
        status: "selfie_uploaded",
        selfieFileId: "cloud://selfies/openid-123/test-expired-selfie/original.jpg",
        activeReportId: "",
        createdAt: "2026-06-20T08:00:00.000Z",
        updatedAt: "2026-06-20T08:00:00.000Z",
        expiresAt: "2026-06-21T08:00:00.000Z",
      },
      "test-expired-report": {
        _id: "test-expired-report",
        openid: "openid-123",
        status: "preview_ready",
        selfieFileId: "cloud://selfies/openid-123/test-expired-report/original.jpg",
        activeReportId: "report-expired-unpaid",
        createdAt: "2026-06-20T08:00:00.000Z",
        updatedAt: "2026-06-20T08:00:00.000Z",
        expiresAt: "2026-06-21T08:00:00.000Z",
      },
      "test-refund": {
        _id: "test-refund",
        openid: "openid-123",
        status: "preview_ready",
        selfieFileId: "",
        activeReportId: "report-refund-unavailable",
        createdAt: "2026-06-20T08:00:00.000Z",
        updatedAt: "2026-06-20T08:00:00.000Z",
        expiresAt: "2026-06-21T08:00:00.000Z",
      },
      ...(overrides && overrides.try_on_tests),
    },
    reports: {
      "report-keep": {
        _id: "report-keep",
        openid: "openid-123",
        testId: "test-delete",
        status: "active",
        previewImages: ["cloud://preview/report-keep/1.jpg"],
        paidImages: ["cloud://paid/report-keep/1.jpg"],
        unlockedAt: "2026-06-21T09:00:00.000Z",
        deletedAt: "",
        createdAt: "2026-06-21T08:30:00.000Z",
        updatedAt: "2026-06-21T09:00:00.000Z",
      },
      "report-expired-unpaid": {
        _id: "report-expired-unpaid",
        openid: "openid-123",
        testId: "test-expired-report",
        status: "active",
        previewImages: [
          "cloud://preview/report-expired-unpaid/1.jpg",
          "cloud://preview/report-expired-unpaid/2.jpg",
        ],
        paidImages: ["cloud://paid/report-expired-unpaid/1.jpg"],
        unlockedAt: "",
        deletedAt: "",
        createdAt: "2026-06-20T08:10:00.000Z",
        updatedAt: "2026-06-20T08:10:00.000Z",
      },
      "report-refund-unavailable": {
        _id: "report-refund-unavailable",
        openid: "openid-123",
        testId: "test-refund",
        status: "active",
        previewImages: ["cloud://preview/report-refund-unavailable/1.jpg"],
        paidImages: [],
        unlockedAt: "",
        deletedAt: "",
        createdAt: "2026-06-20T08:10:00.000Z",
        updatedAt: "2026-06-20T08:10:00.000Z",
      },
      "report-paid-keep": {
        _id: "report-paid-keep",
        openid: "openid-123",
        testId: "test-paid-keep",
        status: "active",
        previewImages: ["cloud://preview/report-paid-keep/1.jpg"],
        paidImages: ["cloud://paid/report-paid-keep/1.jpg"],
        unlockedAt: "2026-06-20T09:00:00.000Z",
        deletedAt: "",
        createdAt: "2026-06-20T08:10:00.000Z",
        updatedAt: "2026-06-20T09:00:00.000Z",
      },
      ...(overrides && overrides.reports),
    },
    orders: {
      "order-refund": {
        _id: "order-refund",
        openid: "openid-123",
        testId: "test-refund",
        reportId: "report-refund-unavailable",
        status: "paid",
        refundStatus: "pending",
        refundReason: "REPORT_NOT_VIEWABLE",
        refundRequestedAt: "",
        canViewReport: false,
        amountCents: 599,
        currency: "CNY",
        paidAt: "2026-06-20T08:20:00.000Z",
        refundEligibleAt: "2026-06-20T08:20:00.000Z",
        updatedAt: "2026-06-20T08:20:00.000Z",
      },
      "order-viewed": {
        _id: "order-viewed",
        openid: "openid-123",
        testId: "test-paid-keep",
        reportId: "report-paid-keep",
        status: "paid",
        refundStatus: "none",
        refundReason: "",
        refundRequestedAt: "",
        canViewReport: true,
        amountCents: 599,
        currency: "CNY",
        paidAt: "2026-06-20T08:20:00.000Z",
        refundEligibleAt: "",
        updatedAt: "2026-06-20T08:20:00.000Z",
      },
      ...(overrides && overrides.orders),
    },
    events: {
      ...(overrides && overrides.events),
    },
  };

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }

  function listCollection(name) {
    return Object.values(state[name] || {});
  }

  return {
    state,
    collection(name) {
      calls.push(["collection", name]);
      return {
        doc(id) {
          calls.push(["doc", name, id]);
          return {
            async get() {
              calls.push(["doc.get", name, id]);
              return { data: clone((state[name] || {})[id] || null) };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              if ((state[name] || {})[id]) {
                state[name][id] = { ...state[name][id], ...clone(payload.data) };
              }
              return { stats: { updated: 1 } };
            },
          };
        },
        where(query) {
          calls.push(["where", name, query]);
          return {
            async get() {
              calls.push(["where.get", name, query]);
              const data = listCollection(name).filter((item) =>
                Object.keys(query || {}).every((key) => item[key] === query[key])
              );
              return { data: clone(data) };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          const nextId = `${name}-${Object.keys(state[name] || {}).length + 1}`;
          if (!state[name]) {
            state[name] = {};
          }
          state[name][nextId] = { _id: nextId, ...clone(payload.data) };
          return { _id: nextId };
        },
      };
    },
  };
}

test("deleteSelfie removes only the original selfie and keeps generated reports intact", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const deletedFiles = [];
  const db = createIssue9Db(calls);

  const result = await testFunction.main(
    {
      action: "deleteSelfie",
      data: {
        testId: "test-delete",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T08:30:00.000Z"),
      deleteFile: async (fileID) => {
        deletedFiles.push(fileID);
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.selfieDeleted, true);
  assert.strictEqual(db.state.try_on_tests["test-delete"].selfieFileId, "");
  assert.strictEqual(db.state.reports["report-keep"].status, "active");
  assert.strictEqual(
    db.state.reports["report-keep"].originalDeletedAt,
    "2026-06-22T08:30:00.000Z"
  );
  assert.deepStrictEqual(deletedFiles, ["cloud://selfies/openid-123/test-delete/original.jpg"]);

  const eventCall = calls.find(
    (call) =>
      call[0] === "add" &&
      call[1] === "events" &&
      call[2].data.type === "delete_selfie"
  );
  assert.ok(eventCall, "delete selfie event should be recorded");
});

test("cleanupExpiredData retains paid originals and fully removes expired unpaid preview assets", async () => {
  const cleanupFunction = require("../cloudfunctions/cleanupExpiredData");
  const calls = [];
  const deletedFiles = [];
  const db = createIssue9Db(calls);

  const result = await cleanupFunction.main(
    {},
    {},
    {
      db,
      now: () => new Date("2026-06-22T09:00:00.000Z"),
      deleteFile: async (fileID) => {
        deletedFiles.push(fileID);
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.cleanedSelfies, 2);
  assert.strictEqual(result.data.expiredReports, 1);
  assert.strictEqual(
    db.state.try_on_tests["test-delete"].selfieFileId,
    "cloud://selfies/openid-123/test-delete/original.jpg"
  );
  assert.strictEqual(db.state.try_on_tests["test-expired-selfie"].selfieFileId, "");
  assert.strictEqual(db.state.try_on_tests["test-expired-report"].selfieFileId, "");
  assert.strictEqual(db.state.try_on_tests["test-expired-report"].activeReportId, "");
  assert.strictEqual(db.state.reports["report-expired-unpaid"].status, "expired");
  assert.strictEqual(db.state.reports["report-expired-unpaid"].deletedAt, "2026-06-22T09:00:00.000Z");
  assert.deepStrictEqual(db.state.reports["report-expired-unpaid"].previewImages, []);
  assert.deepStrictEqual(db.state.reports["report-expired-unpaid"].paidImages, []);
  assert.strictEqual(db.state.reports["report-refund-unavailable"].status, "active");
  assert.strictEqual(db.state.reports["report-paid-keep"].status, "active");
  assert.deepStrictEqual(deletedFiles, [
    "cloud://selfies/openid-123/test-expired-selfie/original.jpg",
    "cloud://selfies/openid-123/test-expired-report/original.jpg",
    "cloud://preview/report-expired-unpaid/1.jpg",
    "cloud://preview/report-expired-unpaid/2.jpg",
    "cloud://paid/report-expired-unpaid/1.jpg",
  ]);
});

test("requestRefund records refund reason and emits a refund_request event only for eligible orders", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const calls = [];
  const db = createIssue9Db(calls);

  const result = await paymentFunction.main(
    {
      action: "requestRefund",
      data: {
        orderId: "order-refund",
        refundReason: "PAID_BUT_REPORT_UNAVAILABLE",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T10:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.refundStatus, "requested");
  assert.strictEqual(db.state.orders["order-refund"].refundStatus, "requested");
  assert.strictEqual(
    db.state.orders["order-refund"].refundReason,
    "PAID_BUT_REPORT_UNAVAILABLE"
  );

  const eventCall = calls.find(
    (call) =>
      call[0] === "add" &&
      call[1] === "events" &&
      call[2].data.type === "refund_request"
  );
  assert.ok(eventCall, "refund request event should be recorded");
  assert.strictEqual(eventCall[2].data.orderId, "order-refund");
});

test("confirmPayment retains the original selfie for an unlocked paid report", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const calls = [];
  const db = createIssue9Db(calls, {
    try_on_tests: {
      "test-paid-retain": {
        _id: "test-paid-retain",
        openid: "openid-123",
        status: "preview_ready",
        selfieFileId: "cloud://selfies/openid-123/test-paid-retain/original.jpg",
        activeReportId: "report-paid-retain",
        expiresAt: "2026-06-21T08:00:00.000Z",
      },
    },
    reports: {
      "report-paid-retain": {
        _id: "report-paid-retain",
        openid: "openid-123",
        testId: "test-paid-retain",
        status: "active",
        previewImages: ["cloud://preview/report-paid-retain/1.jpg"],
        paidImages: ["cloud://paid/report-paid-retain/1.jpg"],
        unlockedAt: "",
        deletedAt: "",
      },
    },
    orders: {
      "order-paid-retain": {
        _id: "order-paid-retain",
        openid: "openid-123",
        testId: "test-paid-retain",
        reportId: "report-paid-retain",
        status: "pending",
        refundStatus: "none",
        wechatPayment: {},
      },
    },
  });

  const result = await paymentFunction.main(
    {
      action: "confirmPayment",
      data: { orderId: "order-paid-retain", transactionId: "txn-retain", retainSelfie: true },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T10:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.canViewReport, true);
  assert.strictEqual(db.state.reports["report-paid-retain"].unlockedAt, "2026-06-22T10:00:00.000Z");
  assert.strictEqual(db.state.try_on_tests["test-paid-retain"].selfieRetention, "paid_report");
  assert.strictEqual(db.state.try_on_tests["test-paid-retain"].expiresAt, "");
  assert.strictEqual(db.state.orders["order-paid-retain"].selfieRetentionConsent, true);
});

test("createReportOrder rejects an expired preview report", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const calls = [];
  const db = createIssue9Db(calls, {
    try_on_tests: {
      "test-expired-order": {
        _id: "test-expired-order",
        openid: "openid-123",
        activeReportId: "report-expired-order",
      },
    },
    reports: {
      "report-expired-order": {
        _id: "report-expired-order",
        openid: "openid-123",
        testId: "test-expired-order",
        status: "expired",
        deletedAt: "2026-06-22T09:00:00.000Z",
      },
    },
  });

  const result = await paymentFunction.main(
    { action: "createReportOrder", data: { testId: "test-expired-order" } },
    {},
    { db, wxContext: { OPENID: "openid-123" } }
  );

  assert.strictEqual(result.code, "RESOURCE_NOT_FOUND");
});

test("requestRefund rejects orders that have already been successfully viewed", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const calls = [];
  const db = createIssue9Db(calls);

  const result = await paymentFunction.main(
    {
      action: "requestRefund",
      data: {
        orderId: "order-viewed",
        refundReason: "NOT_SATISFIED",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T10:05:00.000Z"),
    }
  );

  assert.strictEqual(result.code, "REFUND_NOT_ALLOWED");
  assert.strictEqual(db.state.orders["order-viewed"].refundStatus, "none");
  assert.ok(
    !calls.some(
      (call) =>
        call[0] === "add" &&
        call[1] === "events" &&
        call[2].data.type === "refund_request"
    )
  );
});

test("refund and selfie management use business-service boundaries in the mini program", () => {
  const testService = readText("miniprogram/services/test.js");
  const paymentService = readText("miniprogram/services/payment.js");
  const previewPage = readText("miniprogram/pages/preview/index.js");
  const paymentResultPage = readText("miniprogram/pages/payment-result/index.js");
  const refundHelpPage = readText("miniprogram/pages/refund-help/index.js");
  const refundHelpTemplate = readText("miniprogram/pages/refund-help/index.wxml");
  const reportPage = readText("miniprogram/pages/report/index.js");
  const reportTemplate = readText("miniprogram/pages/report/index.wxml");

  assert.match(testService, /deleteSelfie/);
  assert.match(paymentService, /requestRefund/);
  assert.match(previewPage, /deleteSelfie/);
  assert.match(paymentResultPage, /requestRefund|refund-help\/index/);
  assert.match(paymentResultPage, /retainOriginalConsent/);
  assert.match(refundHelpPage, /requestRefund/);
  assert.match(refundHelpTemplate, /refund/i);
  assert.match(reportPage, /deleteOriginalSelfie/);
  assert.match(reportTemplate, /deleteOriginalSelfie/);
});

test("cleanupExpiredData declares an hourly timer trigger in repository config", () => {
  const triggerConfig = JSON.parse(
    readText("cloudfunctions/cleanupExpiredData/trigger.config.json")
  );

  assert.ok(Array.isArray(triggerConfig.triggers));
  assert.deepStrictEqual(triggerConfig.triggers[0], {
    name: "cleanupExpiredDataHourly",
    type: "timer",
    config: "0 0 * * * * *",
    description: "Run cleanup every hour to enforce 24-hour selfie and unpaid report retention.",
  });
});
