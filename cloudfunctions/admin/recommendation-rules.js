const { fail, ok } = require("./response");
const { requireSession } = require("./session");
const { getRuntime, getEventData, withCollectionBootstrap } = require("./runtime");
const { appendAdminAction } = require("./audit");

const FIELDS = [
  "skinTone",
  "faceShape",
  "budget",
  "lipstickIds",
  "whySuitable",
  "applicationAdvice",
  "makeupColorAdvice",
];

function text(value) {
  return String(value || "").trim();
}

function documentData(record) {
  const { _id, ...data } = record;
  return data;
}

function mapRule(record) {
  const rawId = record._id || record.id || "";
  return {
    _id: rawId && typeof rawId === "object" ? text(rawId.$oid || rawId.toString()) : text(rawId),
    skinTone: text(record.skinTone),
    faceShape: text(record.faceShape),
    budget: text(record.budget),
    lipstickIds: Array.isArray(record.lipstickIds) ? record.lipstickIds.map((id) => text(id)).filter(Boolean) : [],
    whySuitable: text(record.whySuitable),
    applicationAdvice: text(record.applicationAdvice),
    makeupColorAdvice: text(record.makeupColorAdvice),
  };
}

function validateRule(input) {
  const rule = input || {};
  const missing = ["skinTone", "faceShape", "budget", "whySuitable", "applicationAdvice", "makeupColorAdvice"].filter((field) => !text(rule[field]));
  const lipstickIds = Array.isArray(rule.lipstickIds) ? rule.lipstickIds.map((id) => text(id)).filter(Boolean) : [];
  if (rule.lipstickIds !== undefined && (lipstickIds.length !== 3 || new Set(lipstickIds).size !== 3)) {
    return "请选择三支不同的口红";
  }
  return missing.length ? `请填写：${missing.join("、")}` : "";
}

async function requireDeveloper(event, deps) {
  const runtime = getRuntime(deps);
  const session = await requireSession(runtime, getEventData(event).token);
  return session.code ? { runtime, error: session } : { runtime, session };
}

async function listRecommendationRules(event, deps) {
  const access = await requireDeveloper(event, deps);
  if (access.error) return access.error;

  const result = await withCollectionBootstrap(access.runtime, "recommendation_rules", async () =>
    access.runtime.db.collection("recommendation_rules").get()
  );

  return ok({ records: (result.data || []).map(mapRule) });
}

async function saveRecommendationRule(event, deps) {
  const access = await requireDeveloper(event, deps);
  if (access.error) return access.error;

  const data = getEventData(event);
  const input = data.rule || {};
  const validationError = validateRule(input);
  if (validationError) return fail("INVALID_RULE", validationError);

  const runtime = access.runtime;
  const rule = mapRule(input);
  const now = runtime.now().toISOString();
  const existing = rule._id
    ? (await runtime.db.collection("recommendation_rules").doc(rule._id).get()).data || null
    : null;
  const record = { ...rule, createdAt: existing && existing.createdAt ? existing.createdAt : now, updatedAt: now };

  if (rule._id) {
    await withCollectionBootstrap(runtime, "recommendation_rules", async () =>
      runtime.db.collection("recommendation_rules").doc(rule._id).set({ data: documentData(record) })
    );
  } else {
    record._id = runtime.id();
    await withCollectionBootstrap(runtime, "recommendation_rules", async () =>
      runtime.db.collection("recommendation_rules").doc(record._id).set({ data: documentData(record) })
    );
  }

  await appendAdminAction(runtime, existing ? "recommendation_rule_update" : "recommendation_rule_create", "recommendation_rule", record._id, existing, record);
  return ok({ record: mapRule(record) });
}

module.exports = {
  listRecommendationRules,
  saveRecommendationRule,
  mapRule,
};
