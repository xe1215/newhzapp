const assert = require("assert");
const { listLipsticks, saveLipstick, exportLipsticksCsv, importLipsticksCsv } = require("../cloudfunctions/admin/lipsticks");
const { loadSharedContent } = require("../cloudfunctions/test/recommendation-rules");

function createRuntime(state) {
  return {
    now: () => new Date("2026-08-29T00:00:00.000Z"),
    id: () => "generated-id",
    db: {
      collection(name) {
        const records = state[name] || {};
        return {
          where() {
            const query = { get: async () => ({ data: Object.values(records) }) };
            query.limit = () => query;
            return query;
          },
          get: async () => ({ data: Object.values(records) }),
          add: async ({ data }) => {
            const id = data._id || `generated-${Object.keys(records).length}`;
            records[id] = { ...data, _id: id };
            return { _id: id };
          },
          doc(id) {
            return {
              get: async () => ({ data: records[id] || null }),
              set: async ({ data }) => { records[id] = data; },
            };
          },
        };
      },
    },
  };
}

function deps(state) {
  const runtime = createRuntime(state);
  return {
    db: runtime.db,
    now: runtime.now,
    id: runtime.id,
    env: { ADMIN_AUTH_DISABLED: "true" },
  };
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

run("lipstick writes omit skin tone tags and do not persist productLink", async () => {
  const state = { lipsticks: {} };
  const result = await saveLipstick(
    { data: { token: "valid", lipstick: {
      brand: "品牌", productName: "产品名", shadeName: "色号名", shadeCode: "01", colorHex: "#123456",
      budget: "100-300", status: "active",
    } } },
    deps(state)
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.record.colorHex, "#123456");
  assert.strictEqual(state.lipsticks["generated-id"].colorHex, "#123456");
  assert.ok(!Object.prototype.hasOwnProperty.call(state.lipsticks["generated-id"], "_id"));
  assert.ok(!Object.prototype.hasOwnProperty.call(state.lipsticks["generated-id"], "skinToneTags"));
  assert.ok(!Object.prototype.hasOwnProperty.call(result.data.record, "productLink"));
});

run("order refund handling is no longer an available admin action", async () => {
  const { main } = require("../cloudfunctions/admin");
  const result = await main({ action: "updateOrderRefundHandling", data: { token: "valid" } }, deps({}));
  assert.strictEqual(result.code, "INVALID_ACTION");
});

run("lipstick CSV export excludes skin tone tags and productLink", async () => {
  const result = await exportLipsticksCsv(
    { data: { token: "valid" } },
    deps({ lipsticks: { "lip-1": { _id: "lip-1", brand: "品牌", shadeName: "色号名", shadeCode: "01" } } })
  );

  assert.strictEqual(result.code, 0);
  assert.match(result.data.csvText, /productImage,colorHex,budget/);
  assert.ok(!result.data.csvText.includes("skinToneTags"));
  assert.ok(!result.data.csvText.includes("productLink"));
});

run("lipstick list keeps a stable document id for editing legacy records", async () => {
  const result = await listLipsticks(
    { data: { token: "valid" } },
    deps({ lipsticks: { legacy: { id: "legacy", brand: "品牌", shadeName: "色号名" } } })
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.records[0]._id, "legacy");
});

run("lipstick list normalizes CloudBase object ids for editing", async () => {
  const result = await listLipsticks(
    { data: { token: "valid" } },
    deps({ lipsticks: { legacy: { _id: { $oid: "object-id" }, brand: "品牌", shadeName: "色号名" } } })
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.records[0]._id, "object-id");
});

run("lipstick CSV import accepts a complete row without a header", async () => {
  const state = { lipsticks: {} };
  const result = await importLipsticksCsv(
    { data: { token: "valid", csvText: "品牌,产品名,色号,哑光,,#A94544,冷白皮,100以内,active" } },
    deps(state)
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.importedCount, 1);
});

run("lipstick CSV import accepts BOM headers and quoted commas", async () => {
  const state = { lipsticks: {} };
  const result = await importLipsticksCsv(
    {
      data: {
        token: "valid",
        csvText: [
          "\uFEFFbrand,productName,shadeCode,texture,productImage,colorHex,budget,status",
          '品牌,"日常,显气色",01,哑光,,#A94544,100以内,active',
        ].join("\n"),
      },
    },
    deps(state)
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.importedCount, 1);
  assert.strictEqual(Object.values(state.lipsticks)[0].productName, "日常,显气色");
});

run("recommendation rules provide one shared report content object", async () => {
  const runtime = createRuntime({
    recommendation_rules: {
      rule: {
        _id: "rule",
        skinTone: "neutral",
        faceShape: "oval",
        budget: "mid",
        whySuitable: "适合中性肤色",
        applicationAdvice: "薄涂更自然",
        makeupColorAdvice: "搭配清透底妆",
      },
    },
  });
  const content = await loadSharedContent(runtime, { skinTone: "neutral", faceShape: "oval", budget: "mid" });
  assert.deepStrictEqual(content, {
    whySuitable: "适合中性肤色",
    applicationAdvice: "薄涂更自然",
    makeupColorAdvice: "搭配清透底妆",
  });
});
