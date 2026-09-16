const assert = require("assert");

function createRuntime(state) {
  const existingCollections = new Set(Object.keys(state));
  return {
    now: () => new Date("2026-08-29T00:00:00.000Z"),
    id: () => "rule-generated",
    db: {
      collection(name) {
        if (!existingCollections.has(name)) {
          throw new Error(`database collection not exists: ${name}`);
        }
        const records = state[name] || {};
        return {
          where() {
            const query = { get: async () => ({ data: Object.values(records) }) };
            query.limit = () => query;
            return query;
          },
          get: async () => ({ data: Object.values(records) }),
          add: async ({ data }) => {
            const id = data._id || `rule-${Object.keys(records).length}`;
            records[id] = { ...data, _id: id };
            return { _id: id };
          },
          doc(id) {
            return {
              get: async () => ({ data: records[id] || null }),
              set: async ({ data }) => {
                records[id] = data;
              },
              update: async ({ data }) => {
                records[id] = { ...(records[id] || {}), ...data };
              },
            };
          },
        };
      },
      createCollection: async (name) => {
        existingCollections.add(name);
        state[name] = state[name] || {};
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

run("admin can list recommendation rules without exposing unrelated fields", async () => {
  const { listRecommendationRules } = require("../cloudfunctions/admin/recommendation-rules");
  const result = await listRecommendationRules(
    { data: { token: "valid" } },
    deps({
      recommendation_rules: {
        rule: {
          _id: "rule",
          skinTone: "neutral",
          faceShape: "oval",
          budget: "mid",
          whySuitable: "适合中性肤色",
          applicationAdvice: "薄涂更自然",
          makeupColorAdvice: "搭配清透底妆",
          internalNote: "不应输出",
        },
      },
    })
  );

  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(result.data.records, [
    {
      _id: "rule",
      skinTone: "neutral",
      faceShape: "oval",
      budget: "mid",
      whySuitable: "适合中性肤色",
      applicationAdvice: "薄涂更自然",
      makeupColorAdvice: "搭配清透底妆",
      lipstickIds: [],
    },
  ]);
});

run("paid report presentation maps shared content to the new labels", async () => {
  const { mapReportPresentation } = require("../miniprogram/utils/presentation");
  const result = mapReportPresentation({
    _id: "report",
    snapshot: {
      recommendations: [],
      sharedContent: {
        whySuitable: "选择偏暖的色号",
        applicationAdvice: "先薄涂唇中",
        makeupColorAdvice: "哑光搭配轻薄底妆",
      },
    },
  });

  assert.deepStrictEqual(result.sharedContent, {
    shadeSelection: "选择偏暖的色号",
    lipMakeupMethod: "先薄涂唇中",
    textureMatching: "哑光搭配轻薄底妆",
  });
});

run("admin can save a shared recommendation rule and audit the change", async () => {
  const { saveRecommendationRule } = require("../cloudfunctions/admin/recommendation-rules");
  const state = { recommendation_rules: {}, admin_actions: {} };
  const result = await saveRecommendationRule(
    {
      data: {
        token: "valid",
        rule: {
          skinTone: "neutral",
          faceShape: "oval",
          budget: "mid",
          whySuitable: "适合中性肤色",
          applicationAdvice: "薄涂更自然",
          makeupColorAdvice: "搭配清透底妆",
          colorHex: "#123456",
        },
      },
    },
    deps(state)
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.record._id, "rule-generated");
  assert.ok(!Object.prototype.hasOwnProperty.call(result.data.record, "colorHex"));
  assert.strictEqual(Object.keys(state.recommendation_rules).length, 1);
  assert.strictEqual(Object.keys(state.admin_actions).length, 1);
});

run("admin creates the recommendation collection before saving its first rule", async () => {
  const { saveRecommendationRule } = require("../cloudfunctions/admin/recommendation-rules");
  const state = { admin_actions: {} };
  const result = await saveRecommendationRule(
    {
      data: {
        token: "valid",
        rule: {
          skinTone: "冷白皮",
          faceShape: "鹅蛋脸",
          budget: "100以内",
          lipstickIds: ["lip-1", "lip-2", "lip-3"],
          whySuitable: "适合",
          applicationAdvice: "薄涂",
          makeupColorAdvice: "清透妆容",
        },
      },
    },
    deps(state)
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(Object.keys(state.recommendation_rules).length, 1);
});

run("admin action router exposes recommendation rule management", async () => {
  const { main } = require("../cloudfunctions/admin");
  const result = await main(
    { action: "listRecommendationRules", data: { token: "valid" } },
    {},
    deps({ recommendation_rules: {} })
  );
  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(result.data.records, []);
});

run("admin rejects duplicate products in a recommendation rule", async () => {
  const { saveRecommendationRule } = require("../cloudfunctions/admin/recommendation-rules");
  const result = await saveRecommendationRule(
    {
      data: {
        token: "valid",
        rule: {
          skinTone: "冷白皮",
          faceShape: "鹅蛋脸",
          budget: "100以内",
          lipstickIds: ["lip-1", "lip-1", "lip-2"],
          whySuitable: "适合",
          applicationAdvice: "薄涂",
          makeupColorAdvice: "清透妆容",
        },
      },
    },
    deps({ recommendation_rules: {} })
  );

  assert.strictEqual(result.code, "INVALID_RULE");
});
