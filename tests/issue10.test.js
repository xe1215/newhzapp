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

function createIssue10Db(calls, overrides) {
  const state = {
    reports: {
      "report-paid": {
        _id: "report-paid",
        openid: "openid-123",
        testId: "test-paid",
        status: "active",
        unlockedAt: "2026-06-22T08:00:00.000Z",
        deletedAt: "",
        paidImages: [
          "cloud://paid/report-paid/1-clean.jpg",
          "cloud://paid/report-paid/2-clean.jpg",
        ],
        shareCardImages: [],
        snapshot: {
          recommendations: [
            {
              rank: 1,
              role: "best_match",
              brand: "Brand A",
              shadeName: "Rose Tea",
              shadeCode: "A01",
              colorHex: "#b84b65",
              recommendationReason: "Matches your neutral undertone and daily style.",
              cautionNote: "Looks stronger under cool daylight.",
              substitute: "Brand B B02",
              searchKeywords: ["rose tea lipstick", "A01 lipstick"],
            },
            {
              rank: 2,
              role: "daily_safe",
              brand: "Brand C",
              shadeName: "Peach Melt",
              shadeCode: "C02",
              colorHex: "#d9746b",
              recommendationReason: "Soft daily tone with easy wear.",
              cautionNote: "",
              substitute: "",
              searchKeywords: ["peach melt lipstick"],
            },
          ],
        },
        createdAt: "2026-06-22T07:00:00.000Z",
        updatedAt: "2026-06-22T08:00:00.000Z",
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
        async add(payload) {
          calls.push(["add", name, payload]);
          const id = `${name}-${calls.filter((call) => call[0] === "add" && call[1] === name).length}`;
          if (!state[name]) {
            state[name] = {};
          }
          state[name][id] = { _id: id, ...clone(payload.data) };
          return { _id: id };
        },
        where(query) {
          calls.push(["where", name, query]);
          return {
            async get() {
              calls.push(["where.get", name, query]);
              const data = Object.values(state[name] || {}).filter((item) =>
                Object.keys(query || {}).every((key) => item[key] === query[key])
              );
              return { data: clone(data) };
            },
          };
        },
      };
    },
  };
}

test("share createShareEntry uploads a single share card file and stores a constrained share entry", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const uploadCalls = [];
  const db = createIssue10Db(calls);

  const result = await shareFunction.main(
    {
      action: "createShareEntry",
      data: {
        reportId: "report-paid",
        recommendationIndex: 1,
        shareCardTempFilePath: "/tmp/share-card.jpg",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-22T10:00:00.000Z"),
      uploadFile: async (payload) => {
        uploadCalls.push(payload);
        return {
          fileID: "cloud://share_cards/openid-123/report-paid/1.jpg",
        };
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.match(result.data.shareId, /^share_entries-/);
  assert.strictEqual(result.data.recommendationIndex, 1);
  assert.strictEqual(uploadCalls.length, 1);
  assert.strictEqual(uploadCalls[0].cloudPath, "share_cards/openid-123/report-paid/1.jpg");
  assert.strictEqual(uploadCalls[0].filePath, "/tmp/share-card.jpg");

  const entryAdd = calls.find((call) => call[0] === "add" && call[1] === "share_entries");
  assert.ok(entryAdd, "share entry should be created");
  assert.strictEqual(entryAdd[2].data.cardPreviewFileId, "cloud://share_cards/openid-123/report-paid/1.jpg");
  assert.strictEqual(entryAdd[2].data.reportId, "report-paid");
  assert.strictEqual(entryAdd[2].data.recommendationIndex, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(entryAdd[2].data, "snapshot"));
  assert.ok(!Object.prototype.hasOwnProperty.call(entryAdd[2].data, "paidImages"));
});

test("share loadShareLanding returns only single-card content and stats without full report assets", async () => {
  const shareFunction = require("../cloudfunctions/share");
  const calls = [];
  const db = createIssue10Db(calls, {
    share_entries: {
      "share-card": {
        _id: "share-card",
        sharerOpenid: "openid-123",
        reportId: "report-paid",
        recommendationIndex: 1,
        cardPreviewFileId: "cloud://share_cards/openid-123/report-paid/1.jpg",
        sharePath: "/pages/share/index?shareId=share-card",
        visitCount: 2,
        uniqueVisitorCount: 1,
        newTestCount: 1,
        paidOrderCount: 1,
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:00:00.000Z",
      },
    },
  });

  const result = await shareFunction.main(
    {
      action: "loadShareLanding",
      data: {
        shareId: "share-card",
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
  assert.strictEqual(result.data.shareId, "share-card");
  assert.strictEqual(result.data.recommendation.shadeName, "Peach Melt");
  assert.strictEqual(result.data.shareCardImage, "cloud://share_cards/openid-123/report-paid/1.jpg");
  assert.strictEqual(result.data.shareStats.visitCount, 3);
  assert.strictEqual(result.data.shareStats.uniqueVisitorCount, 2);
  assert.ok(!Object.prototype.hasOwnProperty.call(result.data, "snapshot"));
  assert.ok(!Object.prototype.hasOwnProperty.call(result.data, "paidImages"));
});

test("report and share pages wire single-card generation, album save, and share landing through services", () => {
  const reportPage = readText("miniprogram/pages/report/index.js");
  const reportTemplate = readText("miniprogram/pages/report/index.wxml");
  const sharePage = readText("miniprogram/pages/share/index.js");
  const shareTemplate = readText("miniprogram/pages/share/index.wxml");
  const shareService = readText("miniprogram/services/share.js");

  assert.match(reportPage, /saveCardToAlbum/);
  assert.match(reportPage, /createShareCard/);
  assert.match(reportPage, /canvasToTempFilePath|canvas/);
  assert.match(reportPage, /shareService\s*\.\s*createShareEntry\s*\(/);
  assert.match(reportTemplate, /Save card/i);
  assert.match(reportTemplate, /Share one card/i);
  assert.match(sharePage, /shareCardImage/);
  assert.match(shareTemplate, /shareCardImage/);
  assert.match(shareTemplate, /restart/i);
  assert.match(shareService, /function createShareEntry/);
  assert.match(shareService, /function loadShareLanding/);
});
