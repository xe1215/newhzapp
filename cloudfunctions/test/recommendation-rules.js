function normalize(value) {
  return String(value || "").trim();
}

async function loadSharedContent(runtime, preferences) {
  const rule = await loadRecommendationRule(runtime, preferences);
  return rule
    ? {
        whySuitable: normalize(rule.whySuitable),
        applicationAdvice: normalize(rule.applicationAdvice),
        makeupColorAdvice: normalize(rule.makeupColorAdvice),
      }
    : { whySuitable: "", applicationAdvice: "", makeupColorAdvice: "" };
}

async function loadRecommendationRule(runtime, preferences) {
  try {
    const result = await runtime.db.collection("recommendation_rules")
      .where({
        skinTone: preferences.skinTone,
        faceShape: preferences.faceShape || preferences.faceType || "",
        budget: preferences.budget,
      })
      .limit(1)
      .get();
    const rule = result.data && result.data[0];
    if (rule) {
      return rule;
    }
  } catch (error) {
    // The optional collection may not exist in an older environment.
  }
  return null;
}

module.exports = { loadSharedContent, loadRecommendationRule };
