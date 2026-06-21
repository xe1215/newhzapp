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

function createLipstick(id, brand, colorHex, scoreBoost) {
  return {
    _id: id,
    status: "active",
    brand,
    shadeName: `Shade ${id}`,
    shadeCode: id.toUpperCase(),
    colorHex,
    texture: "velvet",
    textureLabel: "丝绒",
    budgetRange: "mid",
    skinToneTags: ["neutral"],
    sceneTags: ["daily"],
    styleTags: ["natural"],
    manualBoost: scoreBoost,
  };
}

function createRegenerateDb(calls, overrides) {
  const state = {
    test: {
      _id: "test-abc",
      openid: "openid-123",
      selfieFileId: "cloud://selfies/openid-123/test-abc/original.jpg",
      activeReportId: "report-old",
      previewRegenerateCount: 1,
      maxPreviewRegenerateCount: 3,
      preferences: {
        skinTone: "neutral",
        budget: "mid",
        scene: "daily",
        style: "natural",
      },
      ...(overrides && overrides.test),
    },
    reports: {
      "report-old": {
        _id: "report-old",
        openid: "openid-123",
        testId: "test-abc",
        version: 1,
        status: "active",
        snapshot: {
          preferences: {
            skinTone: "neutral",
            budget: "mid",
            scene: "daily",
            style: "natural",
          },
          recommendations: [
            { lipstickId: "old-1", brand: "Old A", colorHex: "#111111" },
            { lipstickId: "old-2", brand: "Old B", colorHex: "#222222" },
            { lipstickId: "old-3", brand: "Old C", colorHex: "#333333" },
          ],
        },
        previewImages: ["cloud://old/watermark-1.jpg"],
        paidImages: ["cloud://old/clean-1.jpg"],
      },
      ...(overrides && overrides.reports),
    },
    lipsticks: [
      createLipstick("old-1", "Old A", "#111111", 1000),
      createLipstick("old-2", "Old B", "#222222", 900),
      createLipstick("old-3", "Old C", "#333333", 800),
      createLipstick("new-1", "New A", "#aa1111", 700),
      createLipstick("new-2", "New B", "#bb2222", 600),
      createLipstick("new-3", "New C", "#cc3333", 500),
      ...(overrides && overrides.lipsticks ? overrides.lipsticks : []),
    ],
  };

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
                return { data: state.test };
              }
              if (name === "reports") {
                return { data: state.reports[id] || null };
              }
              return { data: null };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              if (name === "try_on_tests") {
                state.test = { ...state.test, ...payload.data };
              }
              if (name === "reports" && state.reports[id]) {
                state.reports[id] = { ...state.reports[id], ...payload.data };
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
              if (name === "lipsticks") {
                return {
                  data: state.lipsticks.filter((item) => item.status === query.status),
                };
              }
              return { data: [] };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          const id =
            payload && payload.data && payload.data._id
              ? payload.data._id
              : `${name}-${calls.filter((call) => call[0] === "add" && call[1] === name).length}`;
          if (name === "reports") {
            state.reports[id] = { _id: id, ...payload.data };
          }
          return { _id: id };
        },
      };
    },
  };
}

test("regeneratePreview creates a new active report, replaces the old report, and consumes one successful free refresh", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const db = createRegenerateDb(calls);

  const result = await testFunction.main(
    {
      action: "regeneratePreview",
      data: {
        testId: "test-abc",
        reportId: "report-old",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "mock",
        IMAGE_PROVIDER_MODEL: "mock-tryon-v1",
        IMAGE_PROVIDER_TIMEOUT_MS: "30000",
      },
      durationMs: () => 4321,
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.testId, "test-abc");
  assert.notStrictEqual(result.data.reportId, "report-old");
  assert.strictEqual(result.data.previewRegenerateCount, 2);
  assert.strictEqual(result.data.remainingRegenerateCount, 1);
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);

  const oldReportUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[2] === "report-old" &&
      call[3].data.status === "replaced"
  );
  const testUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "try_on_tests" &&
      call[2] === "test-abc" &&
      call[3].data.activeReportId
  );
  const newReportAdd = calls.find((call) => call[0] === "add" && call[1] === "reports");
  const successEvent = calls.find(
    (call) => call[0] === "add" && call[1] === "events" && call[2].data.type === "preview_regenerate_success"
  );

  assert.ok(newReportAdd, "new report should be created");
  assert.strictEqual(newReportAdd[2].data.status, "active");
  assert.strictEqual(newReportAdd[2].data.version, 2);
  assert.strictEqual(newReportAdd[2].data.snapshot.recommendations.length, 3);
  assert.deepStrictEqual(
    newReportAdd[2].data.snapshot.recommendations.map((item) => item.lipstickId),
    ["new-1", "new-2", "new-3"]
  );
  assert.ok(oldReportUpdate, "old report should be replaced");
  assert.strictEqual(oldReportUpdate[3].data.status, "replaced");
  assert.strictEqual(oldReportUpdate[3].data.replacedByReportId, result.data.reportId);
  assert.ok(testUpdate, "test should point at the new active report");
  assert.strictEqual(testUpdate[3].data.activeReportId, result.data.reportId);
  assert.strictEqual(testUpdate[3].data.previewRegenerateCount, 2);
  assert.ok(successEvent, "success event should be recorded");
});

test("preview page calls regeneratePreview instead of only reloading the same report", () => {
  const page = readText("miniprogram/pages/preview/index.js");
  const template = readText("miniprogram/pages/preview/index.wxml");
  const service = readText("miniprogram/services/test.js");

  assert.match(page, /require\("\.\.\/\.\.\/services\/test"\)/);
  assert.match(page, /regeneratePreview\s*\(/);
  assert.match(page, /testService\s*\.\s*regeneratePreview\s*\(/);
  assert.match(page, /remainingRegenerateCount/);
  assert.match(page, /canRegeneratePreview/);
  assert.match(page, /free refreshes left/);
  assert.match(page, /status\s*===\s*"generating"/);
  assert.match(page, /Preview refresh is still generating/);
  assert.match(template, /remainingRegenerateCount/);
  assert.match(template, /disabled="\{\{!canRegeneratePreview\}\}"/);
  assert.match(service, /function regeneratePreview/);
  assert.match(service, /callBusinessFunction\("test", "regeneratePreview"/);
});

test("regeneratePreview stops at the free refresh limit without creating a new report", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const db = createRegenerateDb(calls, {
    test: {
      previewRegenerateCount: 3,
      maxPreviewRegenerateCount: 3,
    },
  });

  const result = await testFunction.main(
    {
      action: "regeneratePreview",
      data: {
        testId: "test-abc",
        reportId: "report-old",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "mock",
      },
    }
  );

  assert.strictEqual(result.code, "PREVIEW_REGENERATE_LIMIT_REACHED");
  assert.strictEqual(result.data.remainingRegenerateCount, 0);
  assert.strictEqual(calls.some((call) => call[0] === "add" && call[1] === "reports"), false);
  assert.strictEqual(
    calls.some((call) => call[0] === "doc.update" && call[1] === "try_on_tests"),
    false
  );
  assert.ok(
    calls.find(
      (call) =>
        call[0] === "add" &&
        call[1] === "events" &&
        call[2].data.type === "preview_regenerate_limit_reached"
    )
  );
});

test("regeneratePreview does not consume a refresh when replacement recommendations are insufficient", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const db = createRegenerateDb(calls, {
    lipsticks: [],
  });
  db.state.lipsticks = [
    createLipstick("old-1", "Old A", "#111111", 1000),
    createLipstick("old-2", "Old B", "#222222", 900),
    createLipstick("old-3", "Old C", "#333333", 800),
    createLipstick("new-1", "New A", "#aa1111", 700),
  ];

  const result = await testFunction.main(
    {
      action: "regeneratePreview",
      data: {
        testId: "test-abc",
        reportId: "report-old",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "mock",
      },
    }
  );

  assert.strictEqual(result.code, "RECOMMENDATION_NOT_ENOUGH");
  assert.strictEqual(result.data.previewRegenerateCount, 1);
  assert.strictEqual(calls.some((call) => call[0] === "add" && call[1] === "reports"), false);
  assert.strictEqual(
    calls.some((call) => call[0] === "doc.update" && call[1] === "try_on_tests"),
    false
  );
  assert.ok(
    calls.find(
      (call) =>
        call[0] === "add" &&
        call[1] === "events" &&
        call[2].data.type === "preview_regenerate_fail" &&
        call[2].data.errorCode === "RECOMMENDATION_NOT_ENOUGH"
    )
  );
});

test("regeneratePreview does not consume a refresh or create a report when image generation fails", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const db = createRegenerateDb(calls);

  const result = await testFunction.main(
    {
      action: "regeneratePreview",
      data: {
        testId: "test-abc",
        reportId: "report-old",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      id: () => "report-new",
      env: {
        IMAGE_PROVIDER: "mock-fail",
      },
      durationMs: () => 321,
    }
  );

  assert.strictEqual(result.code, "IMAGE_PROVIDER_FAILED");
  assert.strictEqual(calls.some((call) => call[0] === "add" && call[1] === "reports"), false);
  assert.strictEqual(
    calls.some((call) => call[0] === "doc.update" && call[1] === "try_on_tests"),
    false
  );
  assert.strictEqual(
    calls.some(
      (call) =>
        call[0] === "doc.update" &&
        call[1] === "reports" &&
        call[2] === "report-old" &&
        call[3].data.status === "replaced"
    ),
    false
  );
  assert.ok(
    calls.find(
      (call) =>
        call[0] === "add" &&
        call[1] === "events" &&
        call[2].data.type === "preview_regenerate_fail" &&
        call[2].data.errorCode === "IMAGE_PROVIDER_FAILED"
    )
  );
});

test("regeneratePreview keeps an async provider refresh pending without consuming the free count", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const db = createRegenerateDb(calls);
  let submitCalls = 0;

  const result = await testFunction.main(
    {
      action: "regeneratePreview",
      data: {
        testId: "test-abc",
        reportId: "report-old",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      id: () => "report-pending",
      env: {
        IMAGE_PROVIDER: "jimeng",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        IMAGE_PROVIDER_TIMEOUT_MS: "30000",
      },
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      httpRequest: async () => {
        submitCalls += 1;
        return {
          statusCode: 200,
          headers: {},
          json: {
            Result: {
              code: 10000,
              data: {
                task_id: `task-${submitCalls}`,
              },
            },
          },
        };
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.status, "generating");
  assert.strictEqual(result.data.reportId, "report-old");
  assert.strictEqual(result.data.pendingReportId, "report-pending");
  assert.strictEqual(result.data.previewRegenerateCount, 1);
  assert.strictEqual(result.data.remainingRegenerateCount, 2);

  const pendingReportAdd = calls.find((call) => call[0] === "add" && call[1] === "reports");
  const testUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "try_on_tests" &&
      call[2] === "test-abc" &&
      call[3].data.pendingRegenerateReportId === "report-pending"
  );

  assert.ok(pendingReportAdd, "pending report should be created for async continuation");
  assert.strictEqual(pendingReportAdd[2].data.status, "regenerating");
  assert.strictEqual(pendingReportAdd[2].data.previousReportId, "report-old");
  assert.strictEqual(pendingReportAdd[2].data.generationStatus, "generating");
  assert.ok(testUpdate, "test should remember pending regenerate report");
  assert.strictEqual(
    calls.some(
      (call) =>
        call[0] === "doc.update" &&
        call[1] === "reports" &&
        call[2] === "report-old" &&
        call[3].data.status === "replaced"
    ),
    false
  );
});

test("regeneratePreview continues a pending async refresh and activates it only after all images are ready", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const db = createRegenerateDb(calls, {
    test: {
      pendingRegenerateReportId: "report-pending",
    },
    reports: {
      "report-pending": {
        _id: "report-pending",
        openid: "openid-123",
        testId: "test-abc",
        previousReportId: "report-old",
        version: 2,
        status: "regenerating",
        snapshot: {
          preferences: {
            skinTone: "neutral",
            budget: "mid",
            scene: "daily",
            style: "natural",
          },
          recommendations: [
            createLipstick("new-1", "New A", "#aa1111", 700),
            createLipstick("new-2", "New B", "#bb2222", 600),
            createLipstick("new-3", "New C", "#cc3333", 500),
          ].map((item, index) => ({
            lipstickId: item._id,
            rank: index + 1,
            brand: item.brand,
            shadeName: item.shadeName,
            shadeCode: item.shadeCode,
            colorHex: item.colorHex,
            texture: item.texture,
            textureLabel: item.textureLabel,
          })),
        },
        generationStatus: "generating",
        generationJob: {
          provider: "jimeng",
          promptVersion: "jimeng-test",
          startedAt: "2026-06-13T07:59:00.000Z",
          updatedAt: "2026-06-13T07:59:30.000Z",
          prompts: [],
          completedImages: [
            {
              index: 0,
              fileId: "cloud://generated/tryon-results/report-pending/1-new-1-clean.jpg",
              recommendation: {
                lipstickId: "new-1",
                rank: 1,
                brand: "New A",
                shadeName: "Shade new-1",
                shadeCode: "NEW-1",
                colorHex: "#aa1111",
                textureLabel: "丝绒",
              },
            },
            {
              index: 1,
              fileId: "cloud://generated/tryon-results/report-pending/2-new-2-clean.jpg",
              recommendation: {
                lipstickId: "new-2",
                rank: 2,
                brand: "New B",
                shadeName: "Shade new-2",
                shadeCode: "NEW-2",
                colorHex: "#bb2222",
                textureLabel: "丝绒",
              },
            },
          ],
          currentIndex: 2,
          currentTask: {
            index: 2,
            kind: "clean",
            taskId: "task-final",
            submittedAt: "2026-06-13T07:59:30.000Z",
            recommendation: {
              lipstickId: "new-3",
              rank: 3,
              brand: "New C",
              shadeName: "Shade new-3",
              shadeCode: "NEW-3",
              colorHex: "#cc3333",
              textureLabel: "丝绒",
            },
          },
        },
        previewImages: [],
        paidImages: [],
      },
    },
  });

  const result = await testFunction.main(
    {
      action: "regeneratePreview",
      data: {
        testId: "test-abc",
        reportId: "report-old",
      },
    },
    {},
    {
      db,
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
      },
      durationMs: () => 2468,
      httpRequest: async () => ({
        statusCode: 200,
        headers: {},
        json: {
          Result: {
            code: 10000,
            data: {
              status: "done",
              image_urls: ["https://result.example/final.jpg"],
            },
          },
        },
      }),
      uploadFileFromUrl: async ({ cloudPath }) => `cloud://generated/${cloudPath}`,
      createWatermarkedFile: async ({ cloudPath }) => `cloud://generated/${cloudPath}`,
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.reportId, "report-pending");
  assert.strictEqual(result.data.previousReportId, "report-old");
  assert.strictEqual(result.data.previewRegenerateCount, 2);
  assert.strictEqual(result.data.remainingRegenerateCount, 1);
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);

  const pendingUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[2] === "report-pending" &&
      call[3].data.status === "active"
  );
  const oldReportUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[2] === "report-old" &&
      call[3].data.status === "replaced"
  );
  const testUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "try_on_tests" &&
      call[2] === "test-abc" &&
      call[3].data.activeReportId === "report-pending"
  );
  const successEvent = calls.find(
    (call) => call[0] === "add" && call[1] === "events" && call[2].data.type === "preview_regenerate_success"
  );

  assert.ok(pendingUpdate, "pending report should become active");
  assert.deepStrictEqual(pendingUpdate[3].data.previewImages, result.data.previewImages);
  assert.deepStrictEqual(pendingUpdate[3].data.paidImages, result.data.paidImages);
  assert.ok(oldReportUpdate, "old active report should be replaced only after pending generation succeeds");
  assert.ok(testUpdate, "test should switch to pending report after success");
  assert.strictEqual(testUpdate[3].data.pendingRegenerateReportId, "");
  assert.strictEqual(testUpdate[3].data.previewRegenerateCount, 2);
  assert.ok(successEvent, "success event should be recorded after activation");
});
