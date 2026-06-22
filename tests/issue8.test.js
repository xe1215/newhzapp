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

function createIssue8Db(calls, overrides) {
  const state = {
    reports: {
      "report-paid": {
        _id: "report-paid",
        openid: "openid-123",
        testId: "test-paid",
        version: 1,
        status: "active",
        previewImages: ["cloud://preview/report-paid/1-watermark.jpg"],
        paidImages: [
          "cloud://paid/report-paid/1-clean.jpg",
          "cloud://paid/report-paid/2-clean.jpg",
          "cloud://paid/report-paid/3-clean.jpg",
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
              priceRange: "mid",
              recommendationReason: "Matches your neutral undertone and daily style.",
              cautionNote: "Looks stronger under cool daylight.",
              substitute: "Brand B B02",
              searchKeywords: ["rose tea lipstick", "A01 lipstick"],
            },
          ],
        },
        unlockedAt: "2026-06-21T01:05:00.000Z",
        deletedAt: "",
        createdAt: "2026-06-21T01:00:00.000Z",
        updatedAt: "2026-06-21T01:05:00.000Z",
      },
      "report-hidden": {
        _id: "report-hidden",
        openid: "openid-123",
        testId: "test-hidden",
        version: 2,
        status: "deleted",
        previewImages: ["cloud://preview/report-hidden/1-watermark.jpg"],
        paidImages: ["cloud://paid/report-hidden/1-clean.jpg"],
        snapshot: {
          recommendations: [
            {
              rank: 1,
              brand: "Hidden Brand",
              shadeName: "Hidden Shade",
              shadeCode: "H01",
              colorHex: "#888888",
              priceRange: "high",
              recommendationReason: "Hidden",
              cautionNote: "",
              substitute: "",
              searchKeywords: [],
            },
          ],
        },
        unlockedAt: "2026-06-20T08:00:00.000Z",
        deletedAt: "2026-06-21T08:00:00.000Z",
        createdAt: "2026-06-20T07:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
      "report-locked": {
        _id: "report-locked",
        openid: "openid-123",
        testId: "test-locked",
        version: 1,
        status: "active",
        previewImages: ["cloud://preview/report-locked/1-watermark.jpg"],
        paidImages: ["cloud://paid/report-locked/1-clean.jpg"],
        snapshot: {
          recommendations: [
            {
              rank: 1,
              brand: "Locked Brand",
              shadeName: "Locked Shade",
              shadeCode: "L01",
              colorHex: "#111111",
              recommendationReason: "Locked",
              cautionNote: "",
              substitute: "",
              searchKeywords: [],
            },
          ],
        },
        unlockedAt: "",
        deletedAt: "",
        createdAt: "2026-06-22T07:00:00.000Z",
        updatedAt: "2026-06-22T07:00:00.000Z",
      },
      ...(overrides && overrides.reports),
    },
    share_entries: {
      ...(overrides && overrides.share_entries),
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
              if (name === "reports") {
                return { data: clone(state.reports[id] || null) };
              }
              if (name === "share_entries") {
                return { data: clone(state.share_entries[id] || null) };
              }
              return { data: null };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              if (name === "reports" && state.reports[id]) {
                state.reports[id] = { ...state.reports[id], ...clone(payload.data) };
              }
              if (name === "share_entries" && state.share_entries[id]) {
                state.share_entries[id] = {
                  ...state.share_entries[id],
                  ...clone(payload.data),
                };
              }
              return { stats: { updated: 1 } };
            },
          };
        },
        where(query) {
          calls.push(["where", name, query]);
          return {
            orderBy(field, direction) {
              calls.push(["orderBy", name, field, direction]);
              return {
                async get() {
                  calls.push(["where.get", name, query, field, direction]);
                  if (name === "reports") {
                    const data = Object.values(state.reports)
                      .filter((report) =>
                        Object.keys(query || {}).every((key) => report[key] === query[key])
                      )
                      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
                    return { data: clone(data) };
                  }
                  return { data: [] };
                },
              };
            },
            async get() {
              calls.push(["where.get", name, query]);
              if (name === "reports") {
                const data = Object.values(state.reports).filter((report) =>
                  Object.keys(query || {}).every((key) => report[key] === query[key])
                );
                return { data: clone(data) };
              }
              if (name === "share_entries") {
                const data = Object.values(state.share_entries).filter((entry) =>
                  Object.keys(query || {}).every((key) => entry[key] === query[key])
                );
                return { data: clone(data) };
              }
              return { data: [] };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          const id = `${name}-${calls.filter((call) => call[0] === "add" && call[1] === name).length}`;
          if (name === "share_entries") {
            state.share_entries[id] = { _id: id, ...clone(payload.data) };
          }
          return { _id: id };
        },
      };
    },
  };
}

test("report listMyReports returns only unlocked non-hidden reports for the current user", async () => {
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];
  const db = createIssue8Db(calls);

  const result = await reportFunction.main(
    {
      action: "listMyReports",
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.reports.length, 1);
  assert.strictEqual(result.data.reports[0].reportId, "report-paid");
  assert.strictEqual(result.data.reports[0].testId, "test-paid");
  assert.strictEqual(result.data.reports[0].locked, false);
  assert.ok(!JSON.stringify(result.data.reports).includes("report-hidden"));
  assert.ok(!JSON.stringify(result.data.reports).includes("report-locked"));
});

test("report listMyReports keeps stable fallback fields when report snapshot data is incomplete", async () => {
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];
  const db = createIssue8Db(calls, {
    reports: {
      "report-minimal": {
        _id: "report-minimal",
        openid: "openid-123",
        testId: "test-minimal",
        version: "",
        status: "",
        paidImages: [],
        snapshot: {},
        unlockedAt: "2026-06-23T01:00:00.000Z",
        deletedAt: "",
        createdAt: "2026-06-23T01:00:00.000Z",
        updatedAt: "2026-06-23T01:00:00.000Z",
      },
    },
  });

  const result = await reportFunction.main(
    {
      action: "listMyReports",
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.reports[0].reportId, "report-minimal");
  assert.strictEqual(result.data.reports[0].version, 1);
  assert.strictEqual(result.data.reports[0].status, "active");
  assert.strictEqual(result.data.reports[0].coverImage, "");
  assert.strictEqual(result.data.reports[0].shadeName, "");
  assert.strictEqual(result.data.reports[0].shadeCode, "");
  assert.strictEqual(result.data.reports[0].brand, "");
});

test("report getReport records a report_view event and returns only paid assets for unlocked owner reports", async () => {
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];
  const db = createIssue8Db(calls);

  const result = await reportFunction.main(
    {
      action: "getReport",
      data: {
        testId: "test-paid",
        reportId: "report-paid",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.reportId, "report-paid");
  assert.deepStrictEqual(result.data.paidImages, [
    "cloud://paid/report-paid/1-clean.jpg",
    "cloud://paid/report-paid/2-clean.jpg",
    "cloud://paid/report-paid/3-clean.jpg",
  ]);
  assert.strictEqual(result.data.snapshot.recommendations[0].shadeName, "Rose Tea");
  assert.ok(!Object.prototype.hasOwnProperty.call(result.data, "previewImages"));

  const viewEvent = calls.find(
    (call) =>
      call[0] === "add" &&
      call[1] === "events" &&
      call[2].data.eventName === "report_view"
  );
  assert.ok(viewEvent, "report_view event should be recorded");
  assert.strictEqual(viewEvent[2].data.reportId, "report-paid");
  assert.strictEqual(viewEvent[2].data.testId, "test-paid");
});

test("report hideReport hides an unlocked report without deleting its order history source data", async () => {
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];
  const db = createIssue8Db(calls);

  const result = await reportFunction.main(
    {
      action: "hideReport",
      data: {
        reportId: "report-paid",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T09:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(db.state.reports["report-paid"].status, "deleted");
  assert.strictEqual(db.state.reports["report-paid"].deletedAt, "2026-06-22T09:00:00.000Z");

  const listResult = await reportFunction.main(
    {
      action: "listMyReports",
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
    }
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.reports.length, 0);
});

test("my reports and share pages use report/share services instead of static placeholders", () => {
  const reportService = readText("miniprogram/services/report.js");
  const shareService = readText("miniprogram/services/share.js");
  const myReportsPage = readText("miniprogram/pages/my-reports/index.js");
  const myReportsTemplate = readText("miniprogram/pages/my-reports/index.wxml");
  const sharePage = readText("miniprogram/pages/share/index.js");
  const shareTemplate = readText("miniprogram/pages/share/index.wxml");

  assert.match(reportService, /function listMyReports/);
  assert.match(reportService, /callBusinessFunction\("report", "listMyReports"/);
  assert.match(reportService, /callBusinessFunction\("report", "hideReport"/);
  assert.match(shareService, /function createShareEntry/);
  assert.match(shareService, /function trackShareVisit/);
  assert.match(shareService, /function loadShareLanding/);
  assert.match(myReportsPage, /reportService\s*\.\s*listMyReports\s*\(/);
  assert.match(myReportsPage, /hideReport\s*\(/);
  assert.match(myReportsTemplate, /wx:for="\{\{reports\}\}"/);
  assert.match(myReportsTemplate, /Share one card/);
  assert.match(sharePage, /shareService\s*\.\s*loadShareLanding\s*\(/);
  assert.match(shareTemplate, /restart/i);
});

test("share createShareEntry stores one-card share metadata for an unlocked report", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const db = createIssue8Db(calls);

  const result = await shareFunction.main(
    {
      action: "createShareEntry",
      data: {
        reportId: "report-paid",
        recommendationIndex: 0,
        shareCardTempFilePath: "/tmp/share-card.jpg",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T10:00:00.000Z"),
      uploadFile: async ({ cloudPath }) => ({
        fileID: `cloud://${cloudPath}`,
      }),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.match(result.data.shareId, /^share_entries-/);
  assert.match(result.data.sharePath, /\/pages\/share\/index\?shareId=/);

  const entryAdd = calls.find((call) => call[0] === "add" && call[1] === "share_entries");
  assert.ok(entryAdd, "share entry should be created");
  assert.strictEqual(entryAdd[2].data.reportId, "report-paid");
  assert.strictEqual(entryAdd[2].data.recommendationIndex, 0);
  assert.strictEqual(entryAdd[2].data.sharerOpenid, "openid-123");
  assert.strictEqual(
    entryAdd[2].data.cardPreviewFileId,
    "cloud://share_cards/openid-123/report-paid/0.jpg"
  );
  assert.strictEqual(entryAdd[2].data.visitCount, 0);
  assert.strictEqual(entryAdd[2].data.uniqueVisitorCount, 0);
  assert.strictEqual(entryAdd[2].data.paidOrderCount, 0);
});

test("share trackShareVisit increments visit counters and records a share_visit event", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const db = createIssue8Db(calls, {
    share_entries: {
      "share-1": {
        _id: "share-1",
        sharerOpenid: "openid-123",
        reportId: "report-paid",
        recommendationIndex: 0,
        cardPreviewFileId: "cloud://share/card-1.jpg",
        sharePath: "/pages/share/index?shareId=share-1",
        visitCount: 0,
        uniqueVisitorCount: 0,
        newTestCount: 0,
        paidOrderCount: 0,
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:00:00.000Z",
      },
    },
  });

  const result = await shareFunction.main(
    {
      action: "trackShareVisit",
      data: {
        shareId: "share-1",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "visitor-openid-001" },
      now: () => new Date("2026-06-22T10:05:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(db.state.share_entries["share-1"].visitCount, 1);
  assert.strictEqual(db.state.share_entries["share-1"].uniqueVisitorCount, 1);

  const visitEvent = calls.find(
    (call) =>
      call[0] === "add" &&
      call[1] === "events" &&
      call[2].data.eventName === "share_visit"
  );
  assert.ok(visitEvent, "share_visit event should be recorded");
  assert.strictEqual(visitEvent[2].data.shareId, "share-1");
  assert.strictEqual(visitEvent[2].data.reportId, "report-paid");
});

test("share getShareEntry returns one recommendation card for the public landing page", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const db = createIssue8Db(calls, {
    share_entries: {
      "share-landing": {
        _id: "share-landing",
        sharerOpenid: "openid-123",
        reportId: "report-paid",
        recommendationIndex: 0,
        cardPreviewFileId: "cloud://share/card-report-paid-0.jpg",
        sharePath: "/pages/share/index?shareId=share-landing",
        visitCount: 3,
        uniqueVisitorCount: 2,
        newTestCount: 1,
        paidOrderCount: 1,
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:05:00.000Z",
      },
    },
  });

  const result = await shareFunction.main(
    {
      action: "getShareEntry",
      data: {
        shareId: "share-landing",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "visitor-openid-002" },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.shareId, "share-landing");
  assert.strictEqual(result.data.reportId, "report-paid");
  assert.strictEqual(result.data.recommendation.rank, 1);
  assert.strictEqual(result.data.recommendation.shadeName, "Rose Tea");
  assert.strictEqual(result.data.recommendation.brand, "Brand A");
  assert.strictEqual(result.data.shareStats.visitCount, 3);
  assert.strictEqual(result.data.restartPath, "/pages/home/index");
});

test("share getShareEntry keeps stable fallback stats and card fields when optional values are missing", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const db = createIssue8Db(calls, {
    share_entries: {
      "share-minimal": {
        _id: "share-minimal",
        sharerOpenid: "openid-123",
        reportId: "report-paid",
        recommendationIndex: "",
        cardPreviewFileId: "",
        sharePath: "",
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:00:00.000Z",
      },
    },
  });

  const result = await shareFunction.main(
    {
      action: "getShareEntry",
      data: {
        shareId: "share-minimal",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "visitor-openid-004" },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.shareId, "share-minimal");
  assert.strictEqual(result.data.recommendationIndex, 0);
  assert.strictEqual(result.data.shareCardImage, "");
  assert.strictEqual(result.data.shareStats.visitCount, 0);
  assert.strictEqual(result.data.shareStats.uniqueVisitorCount, 0);
  assert.strictEqual(result.data.shareStats.newTestCount, 0);
  assert.strictEqual(result.data.shareStats.paidOrderCount, 0);
  assert.strictEqual(result.data.restartPath, "/pages/home/index");
});

test("share loadShareLanding returns public content and records a visit in one call", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const db = createIssue8Db(calls, {
    share_entries: {
      "share-landing-2": {
        _id: "share-landing-2",
        sharerOpenid: "openid-123",
        reportId: "report-paid",
        recommendationIndex: 0,
        cardPreviewFileId: "cloud://share/card-report-paid-0.jpg",
        sharePath: "/pages/share/index?shareId=share-landing-2",
        visitCount: 5,
        uniqueVisitorCount: 4,
        newTestCount: 1,
        paidOrderCount: 2,
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:05:00.000Z",
      },
    },
  });

  const result = await shareFunction.main(
    {
      action: "loadShareLanding",
      data: {
        shareId: "share-landing-2",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "visitor-openid-003" },
      now: () => new Date("2026-06-22T10:06:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.shareId, "share-landing-2");
  assert.strictEqual(result.data.recommendation.shadeName, "Rose Tea");
  assert.strictEqual(result.data.shareStats.visitCount, 6);
  assert.strictEqual(result.data.shareStats.uniqueVisitorCount, 5);
  assert.strictEqual(db.state.share_entries["share-landing-2"].visitCount, 6);
  assert.strictEqual(db.state.share_entries["share-landing-2"].uniqueVisitorCount, 5);

  const visitEvent = calls.find(
    (call) =>
      call[0] === "add" &&
      call[1] === "events" &&
      call[2].data.eventName === "share_visit" &&
      call[2].data.shareId === "share-landing-2"
  );
  assert.ok(visitEvent, "share landing should record one visit event");
});

test("share page loads public share entry content instead of showing only a placeholder", () => {
  const shareService = readText("miniprogram/services/share.js");
  const sharePage = readText("miniprogram/pages/share/index.js");
  const shareTemplate = readText("miniprogram/pages/share/index.wxml");

  assert.match(shareService, /function getShareEntry/);
  assert.match(shareService, /function loadShareLanding/);
  assert.match(shareService, /callBusinessFunction\("share", "getShareEntry"/);
  assert.match(shareService, /callBusinessFunction\("share", "loadShareLanding"/);
  assert.match(sharePage, /shareService\s*\.\s*loadShareLanding\s*\(/);
  assert.match(shareTemplate, /recommendation\.shadeName/);
  assert.match(shareTemplate, /recommendation\.recommendationReason/);
  assert.match(shareTemplate, /restart/i);
});

test("unwrapCloudCall hides raw cloud stack traces behind the provided fallback message", () => {
  const { unwrapCloudCall } = require("../miniprogram/utils/business");

  assert.throws(
    () =>
      unwrapCloudCall(
        {
          result: {
            code: -1,
            message:
              "cloud.callFunction:fail Error: errCode: -504002 functions execute fail | errMsg: Error: collection.add:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: orders.",
          },
        },
        "Unable to create payment order."
      ),
    /Unable to create payment order\./
  );
});

test("unwrapCloudCall keeps short user-friendly backend messages", () => {
  const { unwrapCloudCall } = require("../miniprogram/utils/business");

  assert.throws(
    () =>
      unwrapCloudCall({
        result: {
          code: -1,
          message: "Please complete your profile first.",
        },
      }),
    /Please complete your profile first\./
  );
});
