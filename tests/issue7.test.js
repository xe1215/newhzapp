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

function createPaymentDb(calls, overrides) {
  const state = {
    test: {
      _id: "test-abc",
      openid: "openid-123",
      activeReportId: "report-active",
      sourceShareId: "",
      updatedAt: "2026-06-20T10:00:00.000Z",
      ...(overrides && overrides.test),
    },
    reports: {
      "report-active": {
        _id: "report-active",
        openid: "openid-123",
        testId: "test-abc",
        version: 2,
        status: "active",
        previewImages: [
          "cloud://preview/report-active/1-watermark.jpg",
          "cloud://preview/report-active/2-watermark.jpg",
          "cloud://preview/report-active/3-watermark.jpg",
        ],
        paidImages: [
          "cloud://paid/report-active/1-clean.jpg",
          "cloud://paid/report-active/2-clean.jpg",
          "cloud://paid/report-active/3-clean.jpg",
        ],
        snapshot: {
          recommendations: [
            {
              rank: 1,
              role: "best_match",
              brand: "Brand A",
              shadeName: "Rose Tea",
              shadeCode: "A01",
              colorHex: "#b84b65",
              recommendationReason: "Matches neutral undertones.",
              cautionNote: "Can feel bold in very bright daylight.",
              substitute: "Brand B B02",
              searchKeywords: ["rose tea lipstick", "A01 lipstick"],
            },
          ],
        },
        unlockedAt: "",
        createdAt: "2026-06-20T09:00:00.000Z",
        updatedAt: "2026-06-20T10:00:00.000Z",
      },
      "report-replaced": {
        _id: "report-replaced",
        openid: "openid-123",
        testId: "test-abc",
        version: 1,
        status: "replaced",
        previewImages: ["cloud://preview/report-replaced/1-watermark.jpg"],
        paidImages: ["cloud://paid/report-replaced/1-clean.jpg"],
        snapshot: {
          recommendations: [
            {
              rank: 1,
              brand: "Old Brand",
              shadeName: "Old Shade",
              shadeCode: "OLD01",
              colorHex: "#999999",
              recommendationReason: "Older recommendation.",
              cautionNote: "",
              substitute: "",
              searchKeywords: [],
            },
          ],
        },
        unlockedAt: "",
        replacedByReportId: "report-active",
        createdAt: "2026-06-19T09:00:00.000Z",
        updatedAt: "2026-06-20T08:00:00.000Z",
      },
      ...(overrides && overrides.reports),
    },
    orders: {
      ...(overrides && overrides.orders),
    },
  };

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
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
              if (name === "try_on_tests") {
                return { data: clone(state.test) };
              }
              if (name === "reports") {
                return { data: clone(state.reports[id] || null) };
              }
              if (name === "orders") {
                return { data: clone(state.orders[id] || null) };
              }
              return { data: null };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              if (name === "try_on_tests") {
                state.test = { ...state.test, ...clone(payload.data) };
              }
              if (name === "reports" && state.reports[id]) {
                state.reports[id] = { ...state.reports[id], ...clone(payload.data) };
              }
              if (name === "orders" && state.orders[id]) {
                state.orders[id] = { ...state.orders[id], ...clone(payload.data) };
              }
              return { stats: { updated: 1 } };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          const id =
            payload && payload.data && payload.data._id
              ? payload.data._id
              : `${name}-${Object.keys(state[name] || {}).length + 1}`;

          if (name === "orders") {
            state.orders[id] = { _id: id, ...clone(payload.data) };
          }

          return { _id: id };
        },
        where(query) {
          calls.push(["where", name, query]);
          return {
            async get() {
              calls.push(["where.get", name, query]);
              if (name === "orders") {
                const data = Object.values(state.orders).filter((order) =>
                  Object.keys(query || {}).every((key) => order[key] === query[key])
                );
                return { data: clone(data) };
              }
              if (name === "reports") {
                const data = Object.values(state.reports).filter((report) =>
                  Object.keys(query || {}).every((key) => report[key] === query[key])
                );
                return { data: clone(data) };
              }
              return { data: [] };
            },
          };
        },
      };
    },
  };
}

test("createReportOrder binds the current active report and stores merchant-facing order fields", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const calls = [];
  const db = createPaymentDb(calls);

  const result = await paymentFunction.main(
    {
      action: "createReportOrder",
      data: {
        testId: "test-abc",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-21T01:00:00.000Z"),
      id: () => "order-001",
      env: {
        WECHAT_PAY_APP_ID: "wx-demo-appid",
        WECHAT_PAY_MCH_ID: "mch-demo-001",
        WECHAT_PAY_NOTIFY_URL: "https://example.com/pay/callback",
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.orderId, "order-001");
  assert.strictEqual(result.data.reportId, "report-active");
  assert.strictEqual(result.data.amount, 599);
  assert.strictEqual(result.data.currency, "CNY");
  assert.strictEqual(result.data.paymentStatus, "pending");
  assert.strictEqual(result.data.canPreviewReport, false);

  const orderAdd = calls.find((call) => call[0] === "add" && call[1] === "orders");
  assert.ok(orderAdd, "order should be persisted");
  assert.strictEqual(orderAdd[2].data.testId, "test-abc");
  assert.strictEqual(orderAdd[2].data.reportId, "report-active");
  assert.strictEqual(orderAdd[2].data.amountCents, 599);
  assert.strictEqual(orderAdd[2].data.currency, "CNY");
  assert.strictEqual(orderAdd[2].data.status, "pending");
  assert.strictEqual(orderAdd[2].data.wechatPayment.appId, "wx-demo-appid");
  assert.strictEqual(orderAdd[2].data.wechatPayment.mchId, "mch-demo-001");
  assert.strictEqual(orderAdd[2].data.wechatPayment.notifyUrl, "https://example.com/pay/callback");
  assert.ok(orderAdd[2].data.wechatPayment.outTradeNo.includes("order-001"));
});

test("confirmPayment is idempotent and only unlocks the order-bound report", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];
  const db = createPaymentDb(calls, {
    orders: {
      "order-001": {
        _id: "order-001",
        openid: "openid-123",
        testId: "test-abc",
        reportId: "report-active",
        amountCents: 599,
        currency: "CNY",
        status: "pending",
        refundStatus: "none",
        wechatPayment: {
          outTradeNo: "hz-order-001",
          transactionId: "",
          appId: "wx-demo-appid",
          mchId: "mch-demo-001",
          notifyUrl: "https://example.com/pay/callback",
          prepayId: "prepay-001",
        },
        paidAt: "",
        createdAt: "2026-06-21T01:00:00.000Z",
        updatedAt: "2026-06-21T01:00:00.000Z",
      },
    },
  });

  const first = await paymentFunction.main(
    {
      action: "confirmPayment",
      data: {
        orderId: "order-001",
        transactionId: "4200000000001",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-21T01:05:00.000Z"),
    }
  );

  const second = await paymentFunction.main(
    {
      action: "confirmPayment",
      data: {
        orderId: "order-001",
        transactionId: "4200000000001",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-21T01:06:00.000Z"),
    }
  );

  assert.strictEqual(first.code, 0);
  assert.strictEqual(first.data.paymentStatus, "paid");
  assert.strictEqual(first.data.reportId, "report-active");
  assert.strictEqual(second.code, 0);
  assert.strictEqual(second.data.paymentStatus, "paid");
  assert.strictEqual(second.data.idempotent, true);

  const reportUpdateCalls = calls.filter(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[2] === "report-active" &&
      call[3].data.unlockedAt
  );
  assert.strictEqual(reportUpdateCalls.length, 1, "active report should unlock once");
  assert.strictEqual(db.state.reports["report-active"].unlockedAt, "2026-06-21T01:05:00.000Z");
  assert.strictEqual(db.state.reports["report-replaced"].unlockedAt, "");
  assert.strictEqual(db.state.orders["order-001"].status, "paid");
  assert.strictEqual(db.state.orders["order-001"].wechatPayment.transactionId, "4200000000001");

  const successEvents = calls.filter(
    (call) =>
      call[0] === "add" &&
      call[1] === "events" &&
      call[2].data.type === "payment_success"
  );
  assert.strictEqual(successEvents.length, 1, "payment success event should be recorded once");

  const reportResult = await reportFunction.main(
    {
      action: "getReport",
      data: {
        testId: "test-abc",
        reportId: "report-active",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
    }
  );

  assert.strictEqual(reportResult.code, 0);
  assert.strictEqual(reportResult.data.reportId, "report-active");
  assert.deepStrictEqual(reportResult.data.paidImages, [
    "cloud://paid/report-active/1-clean.jpg",
    "cloud://paid/report-active/2-clean.jpg",
    "cloud://paid/report-active/3-clean.jpg",
  ]);
  assert.strictEqual(reportResult.data.snapshot.recommendations[0].shadeName, "Rose Tea");
  assert.strictEqual(reportResult.data.locked, false);
});

test("confirmPayment marks orders refundable when the report cannot be opened after payment", async () => {
  const paymentFunction = require("../cloudfunctions/payment");
  const calls = [];
  const db = createPaymentDb(calls, {
    orders: {
      "order-bad": {
        _id: "order-bad",
        openid: "openid-123",
        testId: "test-abc",
        reportId: "report-missing",
        amountCents: 599,
        currency: "CNY",
        status: "pending",
        refundStatus: "none",
        wechatPayment: {
          outTradeNo: "hz-order-bad",
          transactionId: "",
          prepayId: "prepay-bad",
        },
        paidAt: "",
        createdAt: "2026-06-21T01:00:00.000Z",
        updatedAt: "2026-06-21T01:00:00.000Z",
      },
    },
  });

  const result = await paymentFunction.main(
    {
      action: "confirmPayment",
      data: {
        orderId: "order-bad",
        transactionId: "4200000000002",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-21T01:05:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.paymentStatus, "paid");
  assert.strictEqual(result.data.refundStatus, "pending");
  assert.strictEqual(result.data.canViewReport, false);
  assert.strictEqual(db.state.orders["order-bad"].refundStatus, "pending");
});

test("report page and payment pages use business services instead of hard-coded unlock jumps", () => {
  const previewPage = readText("miniprogram/pages/preview/index.js");
  const paymentResultPage = readText("miniprogram/pages/payment-result/index.js");
  const reportPage = readText("miniprogram/pages/report/index.js");
  const reportTemplate = readText("miniprogram/pages/report/index.wxml");
  const paymentService = readText("miniprogram/services/payment.js");
  const reportService = readText("miniprogram/services/report.js");

  assert.match(previewPage, /require\("\.\.\/\.\.\/services\/payment"\)/);
  assert.match(previewPage, /createReportOrder\s*\(/);
  assert.match(previewPage, /payment-result\/index\?orderId=/);
  assert.match(paymentResultPage, /onLoad\s*\(/);
  assert.match(paymentResultPage, /reportId/);
  assert.match(paymentResultPage, /viewReport\s*\(/);
  assert.match(paymentResultPage, /\/pages\/report\/index\?testId=/);
  assert.match(reportPage, /require\("\.\.\/\.\.\/services\/report"\)/);
  assert.match(reportPage, /getReport\s*\(/);
  assert.match(reportTemplate, /wx:for="\{\{paidImages\}\}"/);
  assert.match(reportTemplate, /shadeName/);
  assert.match(reportTemplate, /recommendationReason/);
  assert.match(paymentService, /callBusinessFunction\("payment", "createReportOrder"/);
  assert.match(paymentService, /callBusinessFunction\("payment", "confirmPayment"/);
  assert.match(reportService, /function getReport/);
  assert.match(reportService, /callBusinessFunction\("report", "getReport"/);
});
