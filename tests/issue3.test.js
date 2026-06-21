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

function loadPreferencesPage() {
  const pagePath = path.join(root, "miniprogram/pages/preferences/index.js");
  const originalPage = global.Page;
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const cached = require.cache[pagePath];
  let pageDefinition;

  global.Page = function registerPage(definition) {
    pageDefinition = definition;
  };
  global.wx = {};
  global.getApp = () => ({ globalData: {} });

  delete require.cache[pagePath];
  require(pagePath);

  global.Page = originalPage;
  global.wx = originalWx;
  global.getApp = originalGetApp;

  if (cached) {
    require.cache[pagePath] = cached;
  } else {
    delete require.cache[pagePath];
  }

  return pageDefinition;
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

const lipsticks = [
  {
    _id: "inactive",
    status: "inactive",
    brand: "Hidden",
    shadeName: "Dormant",
    shadeCode: "H00",
    colorHex: "#111111",
    priceRange: "mid",
    skinToneTags: ["neutral"],
    budgetRange: "mid",
    sceneTags: ["daily"],
    styleTags: ["natural"],
    manualBoost: 99,
  },
  {
    _id: "best",
    status: "active",
    brand: "Brand A",
    shadeName: "Rose Tea",
    shadeCode: "A01",
    colorHex: "#b84b65",
    priceRange: "mid",
    skinToneTags: ["neutral", "warm"],
    budgetRange: "mid",
    sceneTags: ["daily", "date"],
    styleTags: ["natural"],
    manualBoost: 8,
    recommendationReason: "Brightens neutral skin without overpowering daily makeup.",
    cautionNote: "May look muted under cool office light.",
    substitute: "Brand B Soft Rose",
    searchKeywords: ["rose tea lipstick", "daily rose"],
  },
  {
    _id: "second",
    status: "active",
    brand: "Brand C",
    shadeName: "Cocoa Pink",
    shadeCode: "C12",
    colorHex: "#9f5060",
    priceRange: "mid",
    skinToneTags: ["neutral"],
    budgetRange: "mid",
    sceneTags: ["daily"],
    styleTags: ["commute", "natural"],
    manualBoost: 3,
    recommendationReason: "Soft color for commuting and bare-face days.",
    cautionNote: "Layer lightly on dry lips.",
    substitute: "",
    searchKeywords: ["cocoa pink lipstick"],
  },
  {
    _id: "duplicate-brand",
    status: "active",
    brand: "Brand A",
    shadeName: "Cocoa Pink Intense",
    shadeCode: "C99",
    colorHex: "#8f4054",
    priceRange: "mid",
    skinToneTags: ["neutral"],
    budgetRange: "mid",
    sceneTags: ["daily"],
    styleTags: ["natural"],
    manualBoost: 6,
  },
  {
    _id: "duplicate-color",
    status: "active",
    brand: "Brand Z",
    shadeName: "Rose Tea Twin",
    shadeCode: "Z01",
    colorHex: "#b84b65",
    priceRange: "mid",
    skinToneTags: ["neutral"],
    budgetRange: "mid",
    sceneTags: ["daily"],
    styleTags: ["natural"],
    manualBoost: 5,
  },
  {
    _id: "third",
    status: "active",
    brand: "Brand D",
    shadeName: "Clear Berry",
    shadeCode: "D08",
    colorHex: "#b33258",
    priceRange: "mid",
    skinToneTags: ["neutral"],
    budgetRange: "mid",
    sceneTags: ["date"],
    styleTags: ["natural"],
    manualBoost: 2,
    recommendationReason: "Adds a polished berry tone for date scenes.",
    cautionNote: "",
    substitute: "Brand E Berry",
    searchKeywords: ["clear berry lipstick"],
  },
  {
    _id: "wrong-budget",
    status: "active",
    brand: "Brand F",
    shadeName: "Luxury Red",
    shadeCode: "F99",
    colorHex: "#cc0033",
    priceRange: "high",
    skinToneTags: ["neutral"],
    budgetRange: "high",
    sceneTags: ["daily", "date"],
    styleTags: ["natural"],
    manualBoost: 100,
  },
];

function createFakeDb(calls) {
  return {
    collection(name) {
      calls.push(["collection", name]);
      return {
        where(query) {
          calls.push(["where", name, query]);
          return {
            async get() {
              calls.push(["get", name]);
              if (name === "lipsticks") {
                assert.deepStrictEqual(query, { status: "active" });
                return { data: lipsticks.filter((item) => item.status === "active") };
              }

              return { data: [] };
            },
          };
        },
        doc(id) {
          calls.push(["doc", name, id]);
          return {
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              return { stats: { updated: 1 } };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          return { _id: name === "reports" ? "report-1" : `${name}-1` };
        },
      };
    },
  };
}

test("preference submission updates test, records event, ranks active lipsticks, and snapshots report", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const preferences = {
    skinTone: "neutral",
    budget: "mid",
    scene: "daily",
    style: "natural",
  };

  const result = await testFunction.main(
    {
      action: "submitPreferences",
      data: {
        testId: "test-abc",
        preferences,
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      id: () => "report-abc",
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.testId, "test-abc");
  assert.strictEqual(result.data.reportId, "report-1");
  assert.deepStrictEqual(
    result.data.recommendations.map((item) => item.lipstickId),
    ["best", "second", "third"]
  );
  assert.ok(result.data.recommendations.every((item) => item.brand && item.shadeCode));
  assert.strictEqual(
    new Set(result.data.recommendations.map((item) => item.brand)).size,
    3
  );
  assert.strictEqual(
    new Set(result.data.recommendations.map((item) => item.colorHex.toLowerCase())).size,
    3
  );
  assert.ok(result.data.recommendations.every((item) => item.recommendationReason !== undefined));

  const testUpdate = calls.find((call) => call[0] === "doc.update" && call[1] === "try_on_tests");
  const reportAdd = calls.find((call) => call[0] === "add" && call[1] === "reports");
  const eventAdd = calls.find((call) => call[0] === "add" && call[1] === "events");

  assert.ok(testUpdate, "try_on_tests should be updated");
  assert.deepStrictEqual(testUpdate[3].data.preferences, preferences);
  assert.strictEqual(testUpdate[3].data.activeReportId, "report-1");
  assert.ok(reportAdd, "report snapshot should be created");
  assert.deepStrictEqual(reportAdd[2].data.snapshot.preferences, preferences);
  assert.strictEqual(reportAdd[2].data.snapshot.recommendations[0].lipstickId, "best");
  assert.ok(eventAdd, "preference submit event should be recorded");
  assert.strictEqual(eventAdd[2].data.type, "preference_submit");
});

test("preferences page submits user choices through the test service", () => {
  const page = readText("miniprogram/pages/preferences/index.js");
  const service = readText("miniprogram/services/test.js");

  assert.match(page, /submitPreferences\s*\(/);
  assert.match(page, /testId/);
  assert.doesNotMatch(page, /wx\.cloud\.database\s*\(/);
  assert.match(service, /function submitPreferences/);
  assert.match(service, /callBusinessFunction\("test", "submitPreferences"/);
});

test("preference submission fails cleanly when three unique lipstick recommendations cannot be formed", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const duplicateOnlyLipsticks = [
    {
      _id: "best",
      status: "active",
      brand: "Brand A",
      shadeName: "Rose Tea",
      shadeCode: "A01",
      colorHex: "#b84b65",
      budgetRange: "mid",
      skinToneTags: ["neutral"],
      sceneTags: ["daily"],
      styleTags: ["natural"],
      manualBoost: 8,
    },
    {
      _id: "duplicate-brand",
      status: "active",
      brand: "Brand A",
      shadeName: "Rose Tea Extra",
      shadeCode: "A02",
      colorHex: "#d15a76",
      budgetRange: "mid",
      skinToneTags: ["neutral"],
      sceneTags: ["daily"],
      styleTags: ["natural"],
      manualBoost: 7,
    },
    {
      _id: "duplicate-color",
      status: "active",
      brand: "Brand B",
      shadeName: "Rose Tea Twin",
      shadeCode: "B01",
      colorHex: "#b84b65",
      budgetRange: "mid",
      skinToneTags: ["neutral"],
      sceneTags: ["daily"],
      styleTags: ["natural"],
      manualBoost: 6,
    },
  ];

  function createDuplicateOnlyDb(localCalls) {
    return {
      collection(name) {
        localCalls.push(["collection", name]);
        return {
          where(query) {
            localCalls.push(["where", name, query]);
            return {
              async get() {
                localCalls.push(["get", name]);
                if (name === "lipsticks") {
                  return { data: duplicateOnlyLipsticks };
                }

                return { data: [] };
              },
            };
          },
          doc(id) {
            localCalls.push(["doc", name, id]);
            return {
              async update(payload) {
                localCalls.push(["doc.update", name, id, payload]);
                return { stats: { updated: 1 } };
              },
            };
          },
          async add(payload) {
            localCalls.push(["add", name, payload]);
            return { _id: `${name}-1` };
          },
        };
      },
    };
  }

  const result = await testFunction.main(
    {
      action: "submitPreferences",
      data: {
        testId: "test-abc",
        preferences: {
          skinTone: "neutral",
          budget: "mid",
          scene: "daily",
          style: "natural",
        },
      },
    },
    {},
    {
      db: createDuplicateOnlyDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      id: () => "report-abc",
    }
  );

  assert.strictEqual(result.code, "RECOMMENDATION_NOT_ENOUGH");
  assert.strictEqual(result.data.recommendations.length, 1);
  assert.strictEqual(
    calls.some((call) => call[0] === "add" && call[1] === "reports"),
    false
  );
  assert.strictEqual(
    calls.some((call) => call[0] === "doc.update" && call[1] === "try_on_tests"),
    false
  );
  assert.strictEqual(
    calls.some((call) => call[0] === "add" && call[1] === "events"),
    false
  );
});

test("preferences page ignores invalid option values instead of mutating recommendation inputs", () => {
  const page = loadPreferencesPage();
  const state = {
    data: {
      skinTone: "neutral",
      budget: "mid",
      scene: "daily",
      style: "natural",
      feedback: "existing message",
      options: {
        skinTone: [
          { value: "cool", label: "Cool" },
          { value: "neutral", label: "Neutral" },
          { value: "warm", label: "Warm" },
        ],
        budget: [
          { value: "low", label: "Low" },
          { value: "mid", label: "Mid" },
          { value: "high", label: "High" },
        ],
        scene: [
          { value: "daily", label: "Daily" },
          { value: "date", label: "Date" },
          { value: "commute", label: "Commute" },
        ],
        style: [
          { value: "natural", label: "Natural" },
          { value: "bold", label: "Bold" },
          { value: "commute", label: "Commute" },
        ],
      },
    },
    setData(update) {
      this.data = Object.assign({}, this.data, update);
    },
  };

  page.selectOption.call(state, {
    currentTarget: {
      dataset: {
        field: "skinTone",
        value: "impossible-tone",
      },
    },
  });

  assert.strictEqual(state.data.skinTone, "neutral");
  assert.strictEqual(state.data.feedback, "existing message");
});
