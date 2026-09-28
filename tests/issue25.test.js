const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
      init() {},
      database() {
        throw new Error("Test must inject a fake database");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function createDb() {
  const state = {
    lipsticks: {},
    admin_sessions: { token: { token: "token", role: "developer", expiresAt: "2099-01-01T00:00:00.000Z" } },
    admin_actions: {},
  };
  let id = 0;
  function collection(name) {
    return {
      get: async () => ({ data: Object.entries(state[name] || {}).map(([key, value]) => ({ _id: key, ...value })) }),
      add: async ({ data }) => {
        state[name] = state[name] || {};
        const key = `generated-${Object.keys(state[name]).length + 1}`;
        state[name][key] = { ...data };
        return { _id: key };
      },
      doc(key) {
        return {
          get: async () => ({ data: state[name] && state[name][key] ? { _id: key, ...state[name][key] } : null }),
          set: async ({ data }) => { state[name] = state[name] || {}; state[name][key] = { ...data }; },
          update: async ({ data }) => { state[name][key] = { ...(state[name][key] || {}), ...data }; },
        };
      },
    };
  }
  return { state, db: { collection }, nextId: () => `id-${++id}` };
}

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`)).catch((error) => {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  });
}

const validTags = {
  colorFamily: ["豆沙"],
  undertone: ["偏暖"],
  brightness: ["中"],
  saturation: ["低"],
  finish: ["柔雾"],
  scenes: ["日常", "通勤"],
  styles: ["温柔", "自然"],
};

function product(overrides) {
  return {
    brand: "示例品牌",
    productName: "示例口红",
    shadeCode: "A01",
    texture: "柔雾",
    colorHex: "#B84B65",
    budget: "100以内",
    status: "active",
    tags: validTags,
    ...(overrides || {}),
  };
}

test("saveLipstick accepts the seven controlled product tag groups and returns them", async () => {
  const admin = require("../cloudfunctions/admin");
  const fake = createDb();
  const result = await admin.main({ action: "saveLipstick", data: { token: "token", lipstick: product() } }, {}, {
    db: fake.db,
    env: { ADMIN_AUTH_DISABLED: "true" },
    id: fake.nextId,
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  if (result.code === "ADMIN_FUNCTION_ERROR") console.error("debug", result.message);
  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(result.data.record.tags, validTags);
  assert.strictEqual(Object.keys(fake.state.lipsticks).length, 1);
});

test("saveLipstick rejects unknown or incomplete product tags without writing", async () => {
  const admin = require("../cloudfunctions/admin");
  const fake = createDb();
  const result = await admin.main({ action: "saveLipstick", data: { token: "token", lipstick: product({ tags: { ...validTags, finish: ["液体黄金"] } }) } }, {}, {
    db: fake.db,
    env: { ADMIN_AUTH_DISABLED: "true" },
    id: fake.nextId,
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  if (result.code === "ADMIN_FUNCTION_ERROR") console.error("debug", result.message);
  assert.strictEqual(result.code, "INVALID_LIPSTICK");
  assert.match(JSON.stringify(result.data), /finish|液体黄金|tag/i);
  assert.strictEqual(Object.keys(fake.state.lipsticks).length, 0);
});

test("CSV import validates all seven tag groups before writing any row", async () => {
  const admin = require("../cloudfunctions/admin");
  const fake = createDb();
  const csv = [
    "brand,productName,shadeCode,texture,productImage,colorHex,budget,status,colorFamily,undertone,brightness,saturation,finish,scenes,styles",
    "示例,豆沙,A01,柔雾,,#B84B65,100以内,active,豆沙,偏暖,中,低,柔雾,日常|通勤,温柔|自然",
    "示例,错误,A02,柔雾,,#B84B65,100以内,active,不存在,偏暖,中,低,柔雾,日常,温柔",
  ].join("\n");
  const result = await admin.main({ action: "importLipsticksCsv", data: { token: "token", csvText: csv } }, {}, {
    db: fake.db,
    env: { ADMIN_AUTH_DISABLED: "true" },
    id: fake.nextId,
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  assert.strictEqual(result.code, "INVALID_CSV_IMPORT");
  assert.match(JSON.stringify(result.data), /colorFamily|不存在/);
  assert.strictEqual(Object.keys(fake.state.lipsticks).length, 0);
});

test("CSV export includes the tagged product template and persisted values", async () => {
  const admin = require("../cloudfunctions/admin");
  const fake = createDb();
  const saveResult = await admin.main({ action: "saveLipstick", data: { token: "token", lipstick: product() } }, {}, {
    db: fake.db, env: { ADMIN_AUTH_DISABLED: "true" }, id: fake.nextId,
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  assert.strictEqual(saveResult.code, 0);
  const result = await admin.main({ action: "exportLipsticksCsv", data: { token: "token" } }, {}, {
    db: fake.db, env: { ADMIN_AUTH_DISABLED: "true" }, id: fake.nextId,
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.data.csvText, /colorFamily,undertone,brightness,saturation,finish,scenes,styles/);
  assert.match(result.data.csvText, /豆沙,偏暖,中,低,柔雾,日常\|通勤,温柔\|自然/);
});

test("listLipsticks filters by a controlled tag without changing legacy fields", async () => {
  const admin = require("../cloudfunctions/admin");
  const fake = createDb();
  fake.state.lipsticks.a = product({ productName: "暖色", tags: validTags });
  fake.state.lipsticks.b = product({ productName: "冷色", shadeCode: "A02", tags: { ...validTags, undertone: ["偏冷"] } });
  const result = await admin.main({ action: "listLipsticks", data: { token: "token", filters: { tagGroup: "undertone", tagValue: "偏暖" } } }, {}, {
    db: fake.db, env: { ADMIN_AUTH_DISABLED: "true" }, id: fake.nextId,
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(result.data.records.map((item) => item.productName), ["暖色"]);
});

test("admin lipstick editor exposes all seven controlled tag groups", () => {
  const fs = require("fs");
  const path = require("path");
  const page = fs.readFileSync(path.join(__dirname, "../admin/src/pages/LipstickLibraryPage.jsx"), "utf8");
  const constants = fs.readFileSync(path.join(__dirname, "../admin/src/constants/admin-shell.js"), "utf8");
  ["colorFamily", "undertone", "brightness", "saturation", "finish", "scenes", "styles"].forEach((field) => {
    assert.match(constants, new RegExp(field));
  });
  assert.match(page, /商品标签/);
  assert.match(page, /toggleTag/);
});
